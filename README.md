# memory-markdown

Filesystem-based memory storage with Markdown and frontmatter. A lightweight, human-readable memory system for AI agents.

基于文件系统的记忆存储，采用 Markdown 和 frontmatter 格式。专为 AI 代理设计。

## Features

- **Human-readable storage** — Each memory is a `.md` file with YAML frontmatter
- **Shared & Private memories** — Organize by owner (null = shared)
- **Tagging & Importance** — Filter memories by tags and importance levels
- **Type classification** — Memory, Decision, Reference, or Note
- **JSON Index** — Fast search with `MemoryIndexManager`
- **Wikilinks** — `[[wikilinks]]` syntax for referencing other memories (like Obsidian)
- **Backlinks** — Automatic reverse-link tracking
- **Dangling links** — Tracks unresolved links for later repair

功能特性：人类可读存储、共享/私有记忆、标签分类、JSON 索引、Wikilinks、反向链接、悬空链接追踪。

## Installation

```bash
npm install memory-markdown
```

## Usage

### Basic Example

```typescript
import { MemoryStorage, MemoryIndexManager } from "memory-markdown";

// Initialize storage at a base path
// 在指定路径初始化存储
const storage = new MemoryStorage("./memories");
const index = new MemoryIndexManager("./memories");

// Create a shared memory
// 创建共享记忆
const memory = await storage.createMemory({
  topic: "Project Architecture",
  content: "# Project Architecture\n\nThis project uses a layered architecture...",
  type: "reference",
  tags: ["architecture", "project"],
  importance: "high",
  summary: "Overview of project architecture decisions",
  owner: null, // shared memory
});

const privateMemory = await storage.createMemory({
  topic: "Personal Notes",
  content: "# Personal Notes\n\nRemember to...",
  tags: ["personal"],
  importance: "medium",
  owner: "agent-123",
});

const allMemories = await storage.list("shared");
const privateMemories = await storage.list("agent-123");
await index.build([...allMemories, ...privateMemories]);

const results = await index.search({ tags: ["architecture"] });
const matches = await index.quickScan("architecture");
const backlinks = index.getBacklinks("project-architecture-id");
const dangling = index.getDanglingLinks();
const dangling = index.getDanglingLinks();
```

### Memory File Format / 记忆文件格式

```markdown
---
id: abc123
created: "2026-03-27"
modified: "2026-03-27"
type: memory
tags:
  - architecture
  - project
importance: high
importanceReason: Core architectural decision
links:
  - path: other-memory.md
    reason: Related to API design
summary: Overview of project architecture decisions
status: active
owner: null
---

# Project Architecture

This project uses a layered architecture...
```

### Memory File Format

```markdown
---
id: abc123
created: "2026-03-27"
modified: "2026-03-27"
type: memory
tags:
  - architecture
  - project
importance: high
importanceReason: Core architectural decision
links:
  - path: other-memory.md
    reason: Related to API design
summary: Overview of project architecture decisions
status: active
owner: null
---

# Project Architecture

This project uses a layered architecture...
```

### API

#### Storage Layer (`memory-markdown/storage`)

- `MemoryStorage` — File CRUD operations
  - `read(relativePath)` — Read a memory file
  - `write(relativePath, file)` — Write a memory file
  - `delete(relativePath)` — Delete a memory file
  - `list(agentId)` — List all active memories for an owner ("shared" for shared)
  - `createMemory(params)` — Create a new memory with auto-generated id/path

- `parseFrontmatter(raw)` — Parse frontmatter from markdown string
- `serializeFrontmatter(fm)` — Convert frontmatter to YAML string
- `createNewFrontmatter(params)` — Create frontmatter with defaults

#### KG Layer (`memory-markdown/kg`)

- `parseWikilinks(content)` — Parse `[[wikilinks]]` from markdown content
- `buildBacklinksIndex(memories)` — Build backlinks index from memories

#### Index Layer (`memory-markdown/index`)

- `MemoryIndexManager` — JSON index management
  - `load()` / `save()` — Load/save index from disk
  - `build(memories)` / `update(memory)` — Build or update index
  - `search(query)` — Search by owner, importance, tags
  - `quickScan(term)` — Full-text search in titles/summaries/tags
  - `getBacklinks(memoryId)` — Get all memories referencing this memory
  - `getDanglingLinks()` — Get all unresolved links
  - `resolveTitleLink(title)` — Resolve a title to memory path

### Path Structure

```
memories/
├── memory-index.json
├── SHARED/                    # Shared memories (owner: null)
│   └── architecture/
│       └── 2026-03-27-project-architecture.md
└── agent-123/                # Private memories (owner: agent-123)
    └── memory/
        └── 2026-03-27-personal-notes.md
```

## License

MIT License — free to use, modify, and distribute, including commercial use.

See [LICENSE](LICENSE) for full details.

---

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.
