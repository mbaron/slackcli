# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun install          # Install dependencies
bun run dev -- <cmd> # Run CLI in development (e.g., bun run dev -- auth list)
bun run build        # Build binary for current platform
bun run build:all    # Build for all platforms (linux, macos, windows)
bun test             # Run all tests
bun test src/lib/curl-parser.test.ts  # Run single test file
bun run type-check   # TypeScript type checking
```

## Architecture

**CLI Framework**: Uses Commander.js. Entry point at `src/index.ts` creates the program and registers subcommands.

**Command Pattern**: Each command group (auth, conversations, messages, update) is defined in `src/commands/` and exports a `createXxxCommand()` function that returns a Commander `Command` instance.

**Dual Authentication**: The codebase supports two auth mechanisms:
- Standard tokens (xoxb-*/xoxp-*) - uses `@slack/web-api` WebClient
- Browser tokens (xoxd/xoxc) - custom fetch-based implementation in `SlackClient.browserRequest()`

**SlackClient** (`src/lib/slack-client.ts`): Unified client that abstracts both auth types. The `request()` method dispatches to either `standardRequest()` or `browserRequest()` based on `config.auth_type`.

**Workspace Storage**: Config stored in `~/.config/slackcli/workspaces.json`. Managed by `src/lib/workspaces.ts` which handles loading, saving, and workspace selection (by ID or name).

**Types**: All TypeScript interfaces in `src/types/index.ts`. Key types are `WorkspaceConfig` (union of `StandardAuthConfig | BrowserAuthConfig`) and Slack API response types.
