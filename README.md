<div align="center">

# dotpm cli

**Your Obsidian projects, from the terminal, from scripts, and from coding agents.**

[![npm](https://img.shields.io/npm/v/%40dotpm%2Fcli?color=cb3837&logo=npm)](https://www.npmjs.com/package/@dotpm/cli)
[![Tests](https://github.com/dotpm/cli/actions/workflows/test.yml/badge.svg)](https://github.com/dotpm/cli/actions/workflows/test.yml)
[![License](https://img.shields.io/github/license/dotpm/cli)](LICENSE)
[![Donate](https://img.shields.io/badge/Donate-Buy%20me%20a%20coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/kropachev)

[Install](#install) | [Quick start](#quick-start) | [Use cases](#use-cases) | [Reference](#reference) | [Plugin](https://github.com/dotpm/obsidian-pm) | [Website](https://dotpm.pm)

</div>

[dotpm](https://github.com/dotpm/obsidian-pm) keeps projects and tasks as plain Markdown notes in an Obsidian vault, with a table, a Gantt chart and a Kanban board over them. This is the same board without the window: one `dotpm` command that lists, searches, creates and edits those tasks from a shell, a cron job, a CI pipeline or an AI agent, while Obsidian keeps showing them.

- One code path. The command talks to the plugin's local API, and every write goes through the same validation and scheduling the views use. A task closed from the terminal is closed in the Gantt chart before you switch windows.
- Made for pipes. A terminal gets tables; a pipe gets JSON, the same resources the API returns. Errors are JSON on stderr with a distinct exit code per cause, so a script can tell "not found" from "Obsidian is closed" without parsing text.
- Made for agents. `dotpm mcp` serves the plugin's MCP tools over stdio, and a bundled skill teaches an agent how a project is structured, which ids it may use, and when to ask before deleting.
- Nothing to configure. Run it inside the vault folder and it finds the plugin's port and token on its own.
- A change feed. `dotpm changes --follow` streams every task and project change as it happens, so anything can react to the board.

## Install

```sh
npm install -g @dotpm/cli
```

Or run it without installing: `npx @dotpm/cli projects`.

Needs Node 22 or newer, Obsidian on the desktop with the [dotpm plugin](https://github.com/dotpm/obsidian-pm), and the plugin's local API turned on under **Settings > Local API**. The mobile app has no local API.

## Quick start

From anywhere inside the vault folder:

```sh
dotpm status                       # which server it found and whether it answers
dotpm projects                     # every project with its task counts
dotpm project 8f3k2a1x --tasks     # one project: team, custom fields, status and priority ids, tasks
dotpm create 8f3k2a1x --title "Write the release notes" --due 2026-09-20 --tag docs
dotpm update k2j9d0sa --status done
```

`--status` and `--priority` take the ids the project lists, not display labels. Read the project first; a write with an unknown id is refused and the reply names the allowed ones.

## Use cases

### Let a coding agent work the board

Give Claude Code, Cursor or any MCP client the vault and it can pick the next task, update its progress while it works, and close it when the pull request is merged. The plugin serves MCP over HTTP; the command bridges that to stdio for clients that only launch a process or cannot send an authorization header, and finds the token itself so no secret sits in the client's config:

```sh
claude mcp add dotpm -- npx -y @dotpm/cli mcp --vault /path/to/vault
```

```json
{
  "mcpServers": {
    "dotpm": {
      "command": "npx",
      "args": ["-y", "@dotpm/cli", "mcp", "--vault", "/path/to/vault"]
    }
  }
}
```

The same tools and resources are served either way. Pair it with [`skills/dotpm`](skills/dotpm/SKILL.md), a skill that tells the agent to read a project before writing to it, to use only the status ids the project defines, never to hand-edit task notes, and to archive instead of delete unless told otherwise. Copy the folder into the agent's skills directory (`~/.claude/skills/` for Claude Code) and the same rules apply whether the agent uses the MCP tools or the command.

### Script the routine

Anything that is a query in Obsidian is a one-liner here. Output is JSON when piped, so `jq` does the rest:

```sh
# what is overdue, across every project
dotpm search --limit 1000 | jq -r --arg today "$(date +%F)" '.[] | select(.due != "" and .due < $today) | "\(.due)  \(.title)"'

# everything Ann has in progress, as a Markdown list for a standup
dotpm search --assignee "[[Ann]]" --status in-progress | jq -r '.[] | "- \(.title)"'

# file a task for a failing CI job
dotpm create 8f3k2a1x --title "Fix flaky $JOB_NAME" --priority high --tag ci --description "$RUN_URL"
```

Fields that have no flag, such as recurrence or custom fields, go in `--data` as JSON, and `--data -` reads it from stdin so a task can be built by another program and handed over whole:

```sh
jq -n '{title: "Monthly report", recurrence: {interval: "monthly", every: 1}, customFields: {budget: 400}}' \
  | dotpm create 8f3k2a1x --data -
```

### Plan a project from a file

A plan drafted in a text editor becomes a task tree with dependencies in one loop. Each write returns the created task, so its id feeds the next one:

```sh
design=$(dotpm create 8f3k2a1x --title "Design the homepage" --due 2026-10-01 | jq -r .id)
build=$(dotpm create 8f3k2a1x --title "Build the homepage" --depends-on "$design" | jq -r .id)
dotpm create 8f3k2a1x --title "Hero section" --parent "$build"
dotpm create 8f3k2a1x --title "Footer" --parent "$build"
```

When the project auto-schedules, moving the design task's due date moves the build task with it, the same as dragging the bar in the Gantt chart. `dotpm move` re-parents a task, moves it to another project, or reorders it among its siblings.

### React to changes

`dotpm changes --follow` polls the change feed every two seconds and prints each change as one JSON line: what kind of thing changed, whether it was written or deleted, its id and its project. Read the stream and act on it:

```sh
dotpm changes --follow | while read -r change; do
  id=$(jq -r .id <<< "$change")
  status=$(dotpm task "$id" | jq -r .status)
  [ "$status" = done ] && notify-send "Done: $(dotpm task "$id" | jq -r .title)"
done
```

For a batch job that runs now and then, `dotpm changes --since <cursor>` returns everything after a saved cursor, so a sync to another system only has to look at what moved. A `reset` line means the cursor is older than what the server keeps; list what you need again and continue from the new cursor.

### Edit safely next to a running Obsidian

Someone may be dragging the same task on the board while a script updates it. `dotpm update --if-match <updatedAt>` refuses the write, with exit code 4, when the task changed since it was read. Read, decide, write with the stamp, and retry on conflict:

```sh
task=$(dotpm task k2j9d0sa)
dotpm update k2j9d0sa --status review --if-match "$(jq -r .updatedAt <<< "$task")"
```

## Connecting

Run inside the vault folder and the command reads the port and token the plugin saved there. From elsewhere, name the vault with `--vault` or `DOTPM_VAULT`. To reach a server directly, pass `--url` and `--token`, or set `DOTPM_URL` and `DOTPM_TOKEN`. `dotpm status` reports which server was found and how.

```sh
dotpm --vault ~/Notes projects
dotpm --url http://127.0.0.1:27140 --token <token> status
```

## Reference

`dotpm --help` lists the commands and `dotpm <command> --help` the flags of one. In short:

| Command | Does |
| --- | --- |
| `projects [--archived]` | List every project |
| `project <id> [--tasks] [--archived]` | One project: team, custom fields, allowed status and priority ids |
| `create-project --title <text>` | New project at the root or under `--parent` |
| `archive-project <id> [--restore]` | Archive a project and its sub-projects, or bring it back |
| `tasks <projectId> [--archived]` | A project's tasks in tree order |
| `task <id>` | One task with its description |
| `search [text] [--project] [--status] [--assignee] [--archived] [--limit]` | Tasks across every project |
| `create <projectId> --title <text> [--parent <id>]` | New task |
| `update <id> [--if-match <updatedAt>]` | Change the fields passed |
| `move <id> [--parent] [--top] [--project] [--before] [--after]` | Re-parent, move or reorder |
| `archive <id> [--restore]` | Archive a task and its subtasks, or bring them back |
| `delete <id> --yes` | Delete a task and its subtasks. Cannot be undone |
| `changes [--since <cursor>] [--follow] [--interval <seconds>]` | The change feed |
| `status` | Check the connection |
| `mcp` | MCP over stdio |

`create` and `update` take `--title`, `--description`, `--type` (`task`, `milestone`, `subtask`), `--status`, `--priority`, `--start`, `--due` (`YYYY-MM-DD`, or empty to clear), `--progress` (0 to 100), `--estimate` (hours), and the repeatable `--assignee`, `--tag` and `--depends-on`, each of which replaces the whole list. Everything else goes in `--data` using the field names from [the API](https://github.com/dotpm/obsidian-pm/blob/main/docs/api.md); flags override it.

<details>
<summary>Output and exit codes</summary>

When stdout is a terminal the command prints tables. When it is a pipe, or `--json` is passed, it prints the same JSON the API returns. Errors go to stderr, as `{ "error": { "code", "message" } }` in JSON mode.

| Exit code | Meaning |
| --- | --- |
| 0 | Done |
| 1 | An unexpected failure |
| 2 | A usage or connection problem, or a value the server refused |
| 3 | The project or task was not found |
| 4 | `--if-match` did not match: the task changed since it was read |
| 5 | The token was refused |
| 6 | The server could not be reached; Obsidian is not running or the local API is off |

</details>

## Contributing

Bug reports and feature requests go in [issues](https://github.com/dotpm/cli/issues). Pull requests are welcome; for anything larger than a fix, open an issue first.

The package builds with `pnpm build` into `build/`, and `pnpm check` and `pnpm test:coverage` are what CI runs on Linux and Windows. The API contract it talks to is [`@dotpm/api`](https://github.com/dotpm/obsidian-pm/tree/main/packages/api), released from the plugin repository.

## License

[MIT](LICENSE)
