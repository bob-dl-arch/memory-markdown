/**
 * memory-markdown - Filesystem-based memory storage with Markdown and frontmatter
 *
 * A lightweight, human-readable memory system that stores memories as markdown
 * files with YAML frontmatter. Supports shared and private memories, tagging,
 * importance levels, and more.
 *
 * 基于文件系统的记忆存储，采用 Markdown 和 frontmatter 格式
 *
 * 专为 AI 代理设计的轻量级、人类可读的记忆系统，支持共享和私有记忆、
 * 标签、重要级别等功能。
 */

// Storage layer exports
// 存储层导出
export { MemoryStorage } from "./storage/filesystem.js";

export type {
  MemoryFile,
  MemoryFrontmatter,
  CreateMemoryParams,
  MemoryType,
  ImportanceLevel,
  MemoryStatus,
  MemoryLink,
} from "./storage/types.js";

export {
  parseFrontmatter,
  serializeFrontmatter,
  createNewFrontmatter,
  type ParseResult,
} from "./storage/frontmatter.js";

// Index layer exports
// 索引层导出
export { MemoryIndexManager } from "./index/manager.js";

export type {
  SearchQuery,
  IndexEntry,
  AgentIndex,
  MemoryIndex,
} from "./index/types.js";
