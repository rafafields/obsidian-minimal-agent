# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

An Obsidian community plugin implementing a minimal AI agent with long-term memory. The agent's entire state — personality, configuration, memory — lives as human-readable/editable `.md` files in the vault under `_agent/`. The core design principle is **total transparency**: no opaque internal state.

The full technical spec is in `obsidian-agent-core-spec.md`.

## Commands

```bash
npm install          # install dependencies
npm run dev          # compile with watch mode (esbuild)
npm run build        # typecheck + production build
npm run lint         # run eslint
```

To test: copy `main.js`, `manifest.json`, and `styles.css` to `<Vault>/.obsidian/plugins/obsidian-minimal-agent/`, then reload Obsidian and enable the plugin under **Settings → Community plugins**.

## Architecture

The plugin is built around three core subsystems defined in `obsidian-agent-core-spec.md`:

### ContextAssembler
Assembles the LLM context in three deterministic layers within a fixed token budget (default: 8000):
1. **Bootstrap** (~700 tokens, always): `soul.md`, `user.md`, `taxonomy.md`, `active.md`
2. **Episodic** (~400 tokens): today's and yesterday's episode files
3. **Semantic** (remaining budget): confirmed `memory_item` files, ranked by score

Scoring formula: `importance_weight + tier_bonus - staleness_penalty` (see spec §8.3).

### MemoryExtractor
Post-session: sends the transcript to a second LLM call using a structured extraction prompt (spec §7). Outputs 0–5 `memory_item` candidates as JSON, then writes them as `.md` files to `_agent/memory/items/_pending/`. Never auto-confirms — the user reviews and moves files manually.

### Vault Hooks
The plugin uses `vault.on('rename')`, `vault.on('delete')`, and `vault.on('modify')` to react to user actions in the vault (spec §10):
- File moved out of `_pending/` → confirm item, optionally add proposed tags to taxonomy
- File deleted from `_pending/` → record discard in trace
- Confirmed item modified → reindex score

### Vault structure managed by the plugin

```
_agent/
  soul.md           # agent personality/values (user-editable, never written by agent)
  user.md           # user model (agent can propose updates, never writes directly)
  taxonomy.md       # authorized tag vocabulary
  memory/
    active.md       # working memory, updated section-by-section each session
    episodes/       # YYYY-MM-DD.md session summaries
    items/
      _pending/     # unconfirmed candidates (state: draft)
      *.md          # confirmed items (state: active | stale | archived)
_system/
  traces/           # raw API call traces
```

### Plugin settings (not stored in vault)
Sensitive config is in Obsidian's plugin settings UI: `apiKey`, `modelSlug`, `contextTokenBudget`, `episodeDaysBack`, `minImportanceForContext`, `requireConfirmBeforeWrite`, `traceRetentionDays`, `autoArchiveExpiredItems`.

## Code conventions

- Keep `src/main.ts` minimal — only plugin lifecycle (`onload`, `onunload`, `addCommand`). All feature logic goes in separate modules under `src/`.
- Use `this.register*` helpers for all event listeners and intervals so they clean up on unload.
- TypeScript with `"strict": true`.
- The `memory_item` frontmatter schema is defined in spec §4.1 — all fields must conform exactly.
- Commands use stable IDs (never rename after release). Settings persisted via `this.loadData()` / `this.saveData()`.

## Releasing

```bash
npm version patch   # bumps manifest.json, package.json, versions.json
```

GitHub release tag must exactly match `manifest.json`'s `version` (no `v` prefix). Attach `manifest.json`, `main.js`, `styles.css` as release assets.

---

## Implementation Plan

Phases must be completed in order except phases 2 and 3, which can be developed in parallel.

```
0 → 1 → 2 ─┬─► 4 → 5 → 6 → 7
             └─► 3 ─┘
```

### Phase 0 — Skeleton
Replace all sample-plugin boilerplate. Update `manifest.json`. Create empty-but-compiling module stubs: `src/types.ts`, `src/vault/VaultManager.ts`, `src/vault/FrontmatterParser.ts`, `src/context/ContextAssembler.ts`, `src/memory/MemoryManager.ts`, `src/memory/MemoryExtractor.ts`, `src/llm/OpenRouterClient.ts`, `src/session/SessionManager.ts`, `src/ui/ChatView.ts`, `src/wizard/SetupWizard.ts`.
**Checkpoint:** `npm run build` passes with zero errors.

### Phase 1 — Settings
Define `AgentSettings` with all fields from spec §11 plus `idleTimeoutMinutes: number` (default: 5). Implement `AgentSettingTab` with API key field masked (`inputEl.type = 'password'`).
**Checkpoint:** values persist across Obsidian restarts.

### Phase 2 — Vault Infrastructure *(can start after Phase 1)*
- `VaultManager`: `ensurePath`, `readFile`, `writeFile`, `appendToFile`, `fileExists`, `listFiles`.
- `FrontmatterParser`: `parse`, `serialize`, `updateSection` (replaces a named H2 section body without touching others).
- `SetupWizard`: 4-step modal (API config → soul.md → user.md → taxonomy seed). Creates full `_agent/` tree on completion. Called from `onload()` only when `_agent/soul.md` does not exist, after `app.workspace.onLayoutReady`.

**Checkpoint:** fresh vault triggers wizard, creates correct file tree; re-loading skips wizard.

### Phase 3 — LLM Client *(can start after Phase 1)*
- `OpenRouterClient.chat(messages)`: POST to OpenRouter, throws `LLMError` on non-2xx, caller shows `new Notice(error.message)`.
- `countTokens(text): number` → `Math.ceil(text.length / 4)` in `src/utils/tokens.ts`.
- Temporary "Test connection" button in settings tab (removed in Phase 7).

**Checkpoint:** real response from OpenRouter with valid key; invalid key shows a Notice.

### Phase 4 — Context Assembler
Implement `ContextAssembler.assemble()` with the three layers and token budget (spec §8). Implement scoring formula (spec §8.3). `autoMarkStale()` runs at startup to mark expired items.
**Checkpoint:** verifiable from the Obsidian dev console.

### Phase 5 — Chat UI
`ChatView extends ItemView` in the right sidebar:
- Scrollable message list with Markdown rendering via `MarkdownRenderer.render()`.
- Composer textarea + Send button + "Finalizar y memorizar" button + token count status line.
- `sendMessage()`: assembles context → calls OpenRouter → appends response → resets idle timer → updates `active.md` section-by-section.
- Idle timer: `window.setTimeout` reset on each message, fires `finalizeSession()` after `idleTimeoutMinutes`.
- Ribbon icon + command `'open-agent-chat'` to open the view.

**Checkpoint:** full end-to-end conversation; `active.md` updates after each turn.

### Phase 6 — Memory Pipeline
- `MemoryExtractor.extract(transcript, taxonomy)`: compresses transcript if >6k tokens (spec §7.3), calls OpenRouter with extraction prompt (spec §7.1–7.2), parses JSON array, returns candidates.
- `SessionManager.finalizeSession(transcript)`: writes episode file, writes candidates to `_pending/`, writes trace, updates `active.md` high-importance sections. Shows summary Notice.
- Vault hooks registered with `this.registerEvent` (spec §10): rename out of `_pending/` → confirm + update taxonomy; delete from `_pending/` → discard trace; modify confirmed item → reindex score.
- `TaxonomyManager.addToActive(tags)`: appends approved tags to `taxonomy.md` "Topics activos" section.
- Trace retention cleanup on load: delete traces older than `traceRetentionDays`.

**Checkpoint:** full session generates episode, pending items, and trace; moving an item out of `_pending/` updates taxonomy if it has `proposed_tags`.

### Phase 7 — Polish
- Remove "Test connection" button; replace with API key status indicator.
- CSS: use Obsidian CSS variables (`--background-primary`, `--text-normal`, etc.) throughout.
- Guard vault writes against missing bootstrap files; show actionable Notices.
- Token budget guard: warn if bootstrap layer alone exceeds `contextTokenBudget`.
- Escape user input before inserting into extraction prompts.
- Update `manifest.json` with final plugin `id`, name, description, `minAppVersion`.
- Update `README.md`.

### Cross-cutting rules
- `VaultManager` is a singleton instantiated on `MinimalAgentPlugin`, injected via constructor into all managers. No module calls `this.app.vault` directly.
- `FrontmatterParser` is pure (no I/O) — takes and returns strings only.
- `OpenRouterClient` is reconstructed whenever `apiKey` or `modelSlug` changes in settings.
- All event listeners use `this.registerEvent` — never bare `vault.on(...)`.
- Session state (`transcript`, `idleTimer`, `sessionId`) lives on the `ChatView` instance, not in a global.
