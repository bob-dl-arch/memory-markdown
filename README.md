# memory-markdown

Filesystem-based memory storage with Markdown and frontmatter. A lightweight, human-readable memory system for AI agents.

基于文件系统的记忆存储，采用 Markdown 和 frontmatter 格式。专为 AI 代理设计的轻量级、人类可读的记忆系统。

## Features / 功能特性

- **Human-readable storage**: Each memory is a `.md` file with YAML frontmatter
- **人类可读存储**：每条记忆都是带有 YAML frontmatter 的 `.md` 文件

- **Shared & Private memories**: Organize by owner (null = shared)
- **共享与私有记忆**：按所有者组织（null = 共享）

- **Tagging & Importance**: Filter memories by tags and importance levels
- **标签与重要性**：按标签和重要级别筛选记忆

- **Type classification**: Memory, Decision, Reference, or Note
- **类型分类**：记忆、决策、参考或笔记

- **JSON Index**: Fast search with `MemoryIndexManager`
- **JSON 索引**：使用 `MemoryIndexManager` 实现快速搜索

- **Wikilinks**: `[[wikilinks]]` syntax for referencing other memories (like Obsidian)
- **Wikilinks**：`[[wikilinks]]` 语法用于引用其他记忆（如 Obsidian）

- **Backlinks**: Automatic reverse-link tracking - find all memories that reference a given memory
- **反向链接**：自动反向链接追踪——查找所有引用某条记忆的记忆

- **Dangling links**: Tracks unresolved links for later repair
- **悬空链接**：追踪未解决的链接以便后续修复

## Installation / 安装

```bash
npm install memory-markdown
```

## Usage / 使用方法

### Basic Example / 基本示例

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
  owner: null, // shared memory / 共享记忆
});

// Create a private memory
// 创建私有记忆
const privateMemory = await storage.createMemory({
  topic: "Personal Notes",
  content: "# Personal Notes\n\nRemember to...",
  tags: ["personal"],
  importance: "medium",
  owner: "agent-123",
});

// Build index from all memories
// 从所有记忆构建索引
const allMemories = await storage.list("shared");
const privateMemories = await storage.list("agent-123");
await index.build([...allMemories, ...privateMemories]);

// Search by tags
// 按标签搜索
const results = await index.search({ tags: ["architecture"] });

// Quick scan across titles and summaries
// 快速扫描标题和摘要
const matches = await index.quickScan("architecture");

// Query backlinks - find all memories that reference "project-architecture"
// 查询反向链接 - 查找所有引用 "project-architecture" 的记忆
const backlinks = index.getBacklinks("project-architecture-id");
// [{ sourceId: "mem-xxx", context: "Related to [[project-architecture]]." }]

// Check for dangling links (targets that don't exist)
// 检查悬空链接（目标不存在的链接）
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

### API / 应用程序接口

#### Storage Layer / 存储层 (`memory-markdown/storage`)

- `MemoryStorage` - File CRUD operations / 文件增删改查操作
  - `read(relativePath)` - Read a memory file / 读取记忆文件
  - `write(relativePath, file)` - Write a memory file / 写入记忆文件
  - `delete(relativePath)` - Delete a memory file / 删除记忆文件
  - `list(agentId)` - List all active memories for an agent ("shared" for shared) / 列出指定用户的所有活跃记忆（"shared" 表示共享记忆）
  - `createMemory(params)` - Create a new memory with auto-generated id/path / 创建新记忆，自动生成 id 和路径

- `parseFrontmatter(raw)` - Parse frontmatter from markdown string / 从 markdown 字符串解析 frontmatter
- `serializeFrontmatter(fm)` - Convert frontmatter to YAML string / 将 frontmatter 转换为 YAML 字符串
- `createNewFrontmatter(params)` - Create frontmatter with defaults / 创建带默认值的 frontmatter

#### KG Layer / 知识图谱层 (`memory-markdown/kg`)

- `parseWikilinks(content)` - Parse `[[wikilinks]]` from markdown content / 从 markdown 内容解析 `[[wikilinks]]`
- `buildBacklinksIndex(memories)` - Build backlinks index from memories / 从记忆列表构建反向链接索引

#### Index Layer / 索引层 (`memory-markdown/index`)

- `MemoryIndexManager` - JSON index management / JSON 索引管理
  - `load()` - Load index from disk / 从磁盘加载索引
  - `save()` - Save index to disk / 保存索引到磁盘
  - `build(memories)` - Build index from list of memories (includes backlinks) / 从记忆列表构建索引（包含反向链接）
  - `update(memory)` - Add/update single memory in index / 在索引中添加/更新单条记忆
  - `rebuildBacklinks(memories)` - Rebuild just the backlinks index / 仅重建反向链接索引
  - `search(query)` - Search by owner, importance, tags / 按所有者、重要性和标签搜索
  - `quickScan(term)` - Full-text search in titles/summaries/tags / 在标题/摘要/标签中全文搜索
  - `getBacklinks(memoryId)` - Get all memories that reference this memory / 获取所有引用此记忆的记忆
  - `getDanglingLinks()` - Get all unresolved links / 获取所有未解析的链接
  - `resolveTitleLink(title)` - Resolve a title to memory path / 将标题解析为记忆路径
  - `getIndex()` - Get deep copy of current index / 获取当前索引的深拷贝

### Path Structure / 路径结构

```
memories/
├── memory-index.json
├── SHARED/                    # Shared memories (owner: null) / 共享记忆（所有者：null）
│   └── architecture/
│       └── 2026-03-27-project-architecture.md
└── agent-123/                 # Private memories (owner: agent-123) / 私有记忆（所有者：agent-123）
    └── memory/
        └── 2026-03-27-personal-notes.md
```

## License / 许可证

MIT
