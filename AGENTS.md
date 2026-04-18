# Agent guidance — obsidian-minimal-agent

See `CLAUDE.md` for the full architecture, vault structure, and implementation plan.

## Project overview

Obsidian community plugin (TypeScript → bundled JS) implementing a minimal AI agent with transparent, vault-based long-term memory. Agent state (personality, memory, taxonomy) lives as human-readable `.md` files under `_agent/` in the user's vault.

- Entry: `src/main.ts` → bundled to `main.js` by esbuild
- Spec: `docs/spec.md`
- API client: OpenRouter (not Anthropic directly)

## Commands

```bash
npm install
npm run dev      # watch mode
npm run build    # typecheck + production bundle
npm run lint
npm test         # run Vitest
```

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|--------|-------------|
| `feat:` | New user-visible feature |
| `fix:` | Bug fix |
| `refactor:` | Code restructure with no behavior change |
| `docs:` | README, spec, comments only |
| `chore:` | Tooling, deps, config, CI |
| `test:` | Adding or fixing tests |

Rules:
- Subject line: imperative mood, ≤72 chars, no trailing period
- Be specific: `fix: guard updateSection when header not found` not `fix: update memory`
- Never use `--no-verify` to skip hooks
- Always bump version with `npm version patch|minor|major` — never edit `manifest.json` by hand

## What NOT to commit

- `data.json` (API key — already in `.gitignore`)
- `main.js`, `node_modules/` (build artifacts — already in `.gitignore`)
- Files in `_agent/` or `_system/` (vault content, not source)

## Cross-cutting rules

- `VaultManager` is a singleton on `MinimalAgentPlugin`; no module calls `this.app.vault` directly
- `FrontmatterParser` is pure (no I/O) — takes and returns strings only
- All event listeners use `this.registerEvent` — never bare `vault.on(...)`
- Session state lives on `ChatView` — not in a global or module-level variable
