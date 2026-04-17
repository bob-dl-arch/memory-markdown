/**
 * Core types for memory-markdown storage layer
 *
 * memory-markdown 存储层的核心类型
 */

export type MemoryType = "memory" | "decision" | "reference" | "note";
// 记忆类型：memory(记忆)、decision(决策)、reference(参考)、note(笔记)

export interface ParsedWikilink {
  raw: string;        // Full match: "[[memory-id]]" or "[[id|alias]]" / 完整匹配
  target: string;     // Extracted target: "memory-id" / 提取的目标
  alias?: string;     // Display alias if provided / 显示别名
  context: string;    // Full line containing the link / 包含链接的完整行
}
export type ImportanceLevel = "high" | "medium" | "low";
// 重要性级别：高、中、低

export type MemoryStatus = "active" | "archived" | "superseded";
// 记忆状态：活跃、已归档、被取代

export interface MemoryLink {
  path: string;   // Link target path / 链接目标路径
  reason: string; // Reason for linking / 链接原因
}

export interface MemoryFrontmatter {
  id: string;
  created: string;          // ISO date string (YYYY-MM-DD) / ISO 日期字符串
  modified: string;          // ISO date string (YYYY-MM-DD) / ISO 日期字符串
  type: MemoryType;
  tags: string[];
  importance: ImportanceLevel;
  importanceReason: string;
  links: MemoryLink[];
  summary: string;
  status: MemoryStatus;
  owner: string | null;      // null for shared memories / null 表示共享记忆
}

export interface MemoryFile {
  path: string;              // Full file path / 完整文件路径
  frontmatter: MemoryFrontmatter;
  content: string;           // Raw markdown content (without frontmatter) / 原始 markdown 内容（不含 frontmatter）
  raw: string;                // Complete file content including frontmatter / 包含 frontmatter 的完整文件内容
}

export interface CreateMemoryParams {
  topic: string;             // Memory topic/title / 记忆主题/标题
  content: string;            // Markdown content / Markdown 内容
  type?: MemoryType;
  tags?: string[];
  importance?: ImportanceLevel;
  importanceReason?: string;
  summary?: string;
  owner?: string | null;     // null for shared, string for private / null 共享，字符串私有
}
