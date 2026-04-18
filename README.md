# Minimal Agent

A minimal AI agent plugin for Obsidian with transparent, vault-based long-term memory.

All agent state — personality, configuration, memory — lives as human-readable and editable `.md` files directly in your vault. Nothing is hidden. No opaque databases, no embeddings, no black boxes.

## Features

- **Chat sidebar** — talk to the agent from a persistent panel in the right sidebar
- **Multiple souls** — create distinct agent personalities via the Soul Generator; each soul can pin its own model
- **Long-term memory** — the agent extracts and remembers relevant information across sessions
- **Full transparency** — every memory item, episode summary, and API trace is a readable file in `_agent/`
- **Human review** — memory candidates are written with `state: pending` for your approval before being used in context
- **Configurable context** — token budget, importance threshold, and episode history are all adjustable
- **Multilingual** — response language is configurable per-installation

## Requirements

- An [OpenRouter](https://openrouter.ai) API key
- Obsidian 1.4.0 or later

## Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/obsidian-minimal-agent/`
2. Enable the plugin under **Settings → Community plugins**
3. Complete the setup wizard (runs automatically on first load)
4. Add your OpenRouter API key under **Settings → Minimal Agent**

## Vault structure

The plugin creates and manages two top-level folders:

```
_agent/
  souls/
    default.md           # Default soul (created by setup wizard)
    *.md                 # Additional souls created with Soul Generator
    _souls.base          # Obsidian Bases view for souls
  user.md                # Your profile — work style, preferences
  taxonomy.md            # Authorized tag vocabulary
  memory/
    active.md            # Current working memory (updated each session)
    episodes/            # Session summaries — one .md file per session
      _episodes.base     # Obsidian Bases view for episodes
    items/               # All memory items (pending + confirmed + archived)
      _memory-items.base # Obsidian Bases view for memory items
_system/
  traces/                # Raw API call traces (auto-deleted per retention setting)
    _traces.base         # Obsidian Bases view for traces
```

## Memory workflow

After you click **Finalize and memorize** (or the idle timer fires), the agent:

1. Writes a session summary to `_agent/memory/episodes/YYYY-MM-DD-HH-MM.md`
2. Sends the transcript to a second LLM call that extracts 0–5 memory candidates
3. Writes candidates to `_agent/memory/items/` with `state: pending`

To review candidates:
- **Edit** a file and change `state: pending` to `state: active` → confirmed, used in future sessions
- **Delete** a file → discarded, logged in `_system/traces/`

The vault hooks watch these actions in real time — no manual steps beyond editing or deleting the file.

## LLM services

All model calls go through **OpenRouter** using two service classes.

### OpenRouterClient

`src/llm/OpenRouterClient.ts` is the low-level transport. It handles one thing: turning a list of messages into a response, with retry logic for rate limits.

```
ChatView / SessionManager
        │
        │  messages[]
        ▼
┌─────────────────────────────────────────────────────┐
│               OpenRouterClient.chat()               │
│                                                     │
│  POST /chat/completions                             │
│  ├─ model: slug (from soul or global setting)       │
│  ├─ temperature: 0.7 (default)                      │
│  └─ Authorization: Bearer <apiKey>                  │
│                                                     │
│  On 429 → exponential backoff, up to 3 retries      │
│  On error → throws LLMError (caller shows Notice)   │
└─────────────────────────────────────────────────────┘
        │
        │  { content, usage: { promptTokens, completionTokens } }
        ▼
   caller receives LLMResponse
```

There is also a static helper `OpenRouterClient.fetchPricing(slug, apiKey)` that hits `/models` with a 5-second timeout and returns `{ promptPerToken, completionPerToken }` — used by the settings tab and wizard to display live price estimates.

### Context assembly → chat call flow

Before every user message, `ContextAssembler.assemble()` builds the system prompt in three layers within a fixed token budget (default: 8 000 tokens):

```
  Token budget: 8 000
  ┌───────────────────────────────────────────────────┐
  │  Layer 1 · Bootstrap   (~700 tok, always present) │
  │    souls/{id}.md · user.md · taxonomy.md · active.md │
  ├───────────────────────────────────────────────────┤
  │  Layer 2 · Episodic            (~400 tok budget)  │
  │    today's episode · yesterday's episode          │
  ├───────────────────────────────────────────────────┤
  │  Layer 3 · Semantic         (remaining budget)    │
  │    confirmed memory_item files, ranked by score   │
  │                                                   │
  │    score = importance_weight                      │
  │           + tier_bonus                            │
  │           - staleness_penalty                     │
  │                                                   │
  │    items are dropped (not truncated) once budget  │
  │    is exhausted                                   │
  └───────────────────────────────────────────────────┘
         │
         │  assembled system prompt
         ▼
  OpenRouterClient.chat([system, ...transcript, userMsg])
```

### Memory extraction call flow

After `finalizeSession()` is triggered, `MemoryExtractor.extract()` sends a **separate** LLM call with the session transcript and a structured extraction prompt. The model returns a JSON array of 0–5 candidates:

```
  transcript (ChatMessage[])
        │
        │  if > 6 000 tokens → compress to summary first
        ▼
  MemoryExtractor.extract()
        │
        │  POST /chat/completions
        │  system: extraction prompt + taxonomy
        │  user:   transcript text
        ▼
  JSON response → parse candidates[]
        │
        ├─► write each candidate to items/ as .md with state: pending
        ├─► write episode summary to episodes/
        └─► write raw trace to _system/traces/
```

The extraction call uses the same `modelSlug` as the chat session. Candidates are **never auto-confirmed** — they stay in `state: pending` until you act on them.

## Context scoring formula

Memory items stored in `_agent/memory/items/` are ranked each session. Items that don't fit within the remaining token budget are silently dropped (never truncated mid-content).

| Component          | Value                                     |
|--------------------|-------------------------------------------|
| `importance_weight`| critical=100, high=75, medium=40, low=10  |
| `tier_bonus`       | semantic=20, working=5                    |
| `staleness_penalty`| `min(30, days_since_update × 0.5)`        |

## Available models

The plugin ships with a curated list of models pre-configured with pricing and descriptions. The default is **Claude Sonnet 4.6**. Any OpenRouter model slug can be entered manually via the custom model option.

| Model              | Provider  | Tier      |
|--------------------|-----------|-----------|
| GPT-5.4 Nano       | OpenAI    | Cheap     |
| Qwen 3.5 27B       | Qwen      | Cheap     |
| Claude Sonnet 4.6  | Anthropic | Expensive |

## Architecture

See `obsidian-agent-core-spec.md` for the full technical specification, including the context assembly algorithm, memory scoring formula, and extraction prompts.
