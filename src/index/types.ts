/**
 * Index layer types
 *
 * 索引层类型
 */

import type { ImportanceLevel, MemoryFile } from "../storage/types.js";

export interface IndexEntry {
  path: string;
  title: string;
  summary: string;
  tags: string[];
  importance: ImportanceLevel;
  modified: string;     // ISO date string / ISO 日期字符串
}

export interface AgentIndex {
  lastConsolidation: string;  // ISO datetime / ISO 日期时间
  stats: {
    total: number;           // Total number of memories / 记忆总数
    highImportance: number;   // Count of high importance / 高重要性记忆数量
  };
  entries: IndexEntry[];
}

export interface BacklinkEntry {
  sourceId: string;    // Memory ID that references the target / 引用目标记忆的 ID
  context: string;      // The line/text containing [[link]] / 包含 [[link]] 的行/文本
}

export interface DanglingLink {
  sourceId: string;     // Memory ID with unresolved link / 包含未解析链接的记忆 ID
  targetTitle: string;  // Title that couldn't be resolved / 无法解析的标题
  context: string;       // The line/text containing [[link]] / 包含 [[link]] 的行/文本
}

export interface MemoryIndex {
  version: number;
  lastUpdated: string;                 // ISO datetime / ISO 日期时间
  shared: IndexEntry[];                 // Shared memories / 共享记忆
  agents: Record<string, AgentIndex>;   // Per-owner indexes / 每个所有者的索引
  backlinks: Record<string, BacklinkEntry[]>;  // Reverse links / 反向链接
  danglingLinks: DanglingLink[];               // Unresolved links / 未解析的链接
}

export type SearchQuery = {
  tags?: string[];          // Filter by tags / 按标签筛选
  importance?: string;      // Filter by importance / 按重要性筛选
  owner?: string;           // Filter by owner / 按所有者筛选
};
