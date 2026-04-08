# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeployGate MCP (Model Context Protocol) plugin for Claude Code. Provides tools for uploading mobile apps (iOS IPA, Android APK/AAB), managing distribution pages, team members, and CI/CD setup via the DeployGate REST API.

The plugin runs as a stdio-based MCP server. It is bundled into a single file (`plugin/scripts/bundle.js`) via esbuild for zero-dependency distribution.

## Commands

```bash
npm run build        # TypeScript compile + esbuild bundle to plugin/scripts/bundle.js
npm test             # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run dev          # TypeScript watch mode (no esbuild)
npm start            # Run the MCP server directly
```

CI runs `npm run build && npm test` on every PR and push to main.

## Architecture

**Entry point:** `src/index.ts` — creates `McpServer` and `DeployGateClient`, registers all tool modules, connects via stdio transport.

**API client:** `src/client.ts` — `DeployGateClient` class wrapping the DeployGate REST API (`https://deploygate.com`). Handles Bearer token auth, JSON/form-data requests, file uploads, and structured error responses via `DeployGateApiError`.

**Tool modules** (`src/tools/*.ts`): Each file exports a `register*Tools(server, client)` function that registers MCP tools with Zod parameter schemas. Tools return `ContentBlock[]` (text content, optional `isError` flag).

- `auth.ts` — `set_api_token`, `get_user_info`
- `upload.ts` — `upload_app` (supports IPA/APK/AAB + optional iOS simulator zip)
- `distributions.ts` — CRUD for distribution pages
- `udids.ts` — iOS device UDID listing
- `notifications.ts` — notification settings URL generation (no client needed)
- `members.ts` — multi-step member management (workspace → project → team → app)
- `shared-teams.ts` — workspace-wide shared team management

**Plugin assets** (`plugin/`): Contains the Claude plugin manifest (`plugin/.claude-plugin/plugin.json`), MCP server config (`.mcp.json`), skills (slash commands in `plugin/skills/`), GitHub Actions templates (`plugin/templates/`), and the bundled server script. The `plugin/` subdirectory is the published plugin root.

**Marketplace config** (`.claude-plugin/marketplace.json`): Top-level pointer to the `plugin/` subdirectory for Claude plugin marketplace registration.

## Testing

Tests use Vitest with `globals: true`. Test files are co-located at `src/__tests__/*.test.ts`.

- `client.test.ts` — API client behavior (mocks `fetch` with `vi.fn()`)
- `tools.test.ts` — Tool registration and parameter validation
- `plugin.test.ts` — Plugin manifest integrity (version sync, file existence)
- `skills.test.ts` — Skill YAML frontmatter and content structure
- `templates.test.ts` — GitHub Actions template syntax validation

Tests validate structural invariants like version consistency between `package.json` and `plugin.json`, so keep versions in sync when bumping.

## Key Conventions

- ESM throughout (`"type": "module"` in package.json, `.js` extensions in imports)
- TypeScript strict mode, target ES2022, Node16 module resolution
- The build produces both `dist/` (tsc output) and `plugin/scripts/bundle.js` (esbuild single-file bundle); the bundle is what end users run
- Token can come from `DEPLOYGATE_API_TOKEN` env var or be set at runtime via the `set_api_token` tool
- The `members.ts` `add_member` tool orchestrates multiple API calls (workspace → project → team) in a single tool invocation, handling "already exists" gracefully
