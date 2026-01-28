# clawdbot-localmemory

Local long-term memory plugin for Clawdbot using **Ollama embeddings** and **LanceDB** vector store. No cloud API required!

## Features

- **Auto-recall**: Inject relevant memories before AI turns
- **Auto-capture**: Store conversation content after turns
- **User profile**: Persistent facts extracted from conversations
- **Tools**: `supermemory_store`, `supermemory_search`, `supermemory_forget`, `supermemory_profile`
- **Slash commands**: `/remember`, `/recall`
- **CLI**: `clawdbot localmemory search|profile|wipe`

## Requirements

1. **Ollama** running locally with an embedding model:
   ```bash
   # Install Ollama (macOS)
   brew install ollama
   
   # Pull an embedding model
   ollama pull nomic-embed-text
   # or
   ollama pull mxbai-embed-large
   ```

2. **Clawdbot** >= 2026.1.24

## Installation

```bash
cd /path/to/clawdbot-localmemory
bun install
```

Then add to your Clawdbot config:

```json
{
  "plugins": [
    {
      "path": "/path/to/clawdbot-localmemory",
      "config": {
        "ollamaModel": "nomic-embed-text"
      }
    }
  ]
}
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `ollamaHost` | `http://127.0.0.1:11434` | Ollama server URL |
| `ollamaModel` | `nomic-embed-text` | Embedding model to use |
| `dbPath` | `~/.clawdbot/memory/{hostname}/lancedb` | LanceDB database path |
| `profilePath` | `~/.clawdbot/memory/{hostname}/profile.json` | User profile storage |
| `autoRecall` | `true` | Inject memories before AI turns |
| `autoCapture` | `true` | Store conversations after turns |
| `maxRecallResults` | `10` | Max memories per recall |
| `profileFrequency` | `50` | Full profile injection every N turns |
| `captureMode` | `all` | `all` or `everything` |
| `debug` | `false` | Enable verbose logging |

## Usage

### Slash Commands

```
/remember My favorite color is blue
/recall favorite color
```

### CLI

```bash
clawdbot localmemory search "favorite color"
clawdbot localmemory profile
clawdbot localmemory wipe
```

### Tools (for AI)

The AI has access to these tools:
- `supermemory_store` - Save information to memory
- `supermemory_search` - Search through memories
- `supermemory_forget` - Delete a memory
- `supermemory_profile` - Get user profile summary

## Storage

- **Memories**: Stored as vectors in LanceDB at `~/.clawdbot/memory/{hostname}/lancedb/`
- **Profile**: JSON file at `~/.clawdbot/memory/{hostname}/profile.json`

## Architecture

```
User Message → Ollama Embed → LanceDB Search → Context Injection
                    ↓
AI Response → Ollama Embed → LanceDB Store
```

No cloud APIs. Everything runs locally.

## License

MIT
