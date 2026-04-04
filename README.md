# Minimal Agent

A minimal AI agent plugin for Obsidian with transparent, vault-based long-term memory.

All agent state — personality, configuration, memory — lives as human-readable and editable `.md` files directly in your vault. Nothing is hidden. No opaque databases, no embeddings, no black boxes.

## Features

- **Chat sidebar** — talk to the agent from a persistent panel in the right sidebar
- **Long-term memory** — the agent extracts and remembers relevant information across sessions
- **Full transparency** — every memory item, episode summary, and API trace is a readable file in `_agent/`
- **Human review** — memory candidates go to `_pending/` for your approval before being confirmed
- **Configurable context** — token budget, importance threshold, and episode history are all adjustable

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
  soul.md              # Agent personality and values (edit freely)
  user.md              # Your profile — work style, preferences
  taxonomy.md          # Authorized tag vocabulary
  memory/
    active.md          # Current working memory (updated each session)
    episodes/          # Session summaries — one .md file per day
    items/             # Confirmed memory items
      _pending/        # Candidates awaiting your review
_system/
  traces/              # Raw API call traces (auto-deleted per retention setting)
```

## Memory workflow

After you click **Finalize and memorize** (or the idle timer fires), the agent:

1. Writes a session summary to `_agent/memory/episodes/YYYY-MM-DD.md`
2. Extracts 0–5 memory candidates and writes them to `_agent/memory/items/_pending/`

To review candidates:
- **Move** a file from `_pending/` to `_agent/memory/items/` → confirmed, will be used in future sessions
- **Delete** a file → discarded, logged in `_system/traces/`

## Architecture

See `obsidian-agent-core-spec.md` for the full technical specification, including the context assembly algorithm, memory scoring formula, and extraction prompts.
