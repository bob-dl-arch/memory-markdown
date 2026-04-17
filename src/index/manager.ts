/**
 * Memory index manager - builds and maintains a JSON index of all memories
 *
 * 记忆索引管理器 - 构建和维护所有记忆的 JSON 索引
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { MemoryFile } from "../storage/types.js";
import type { IndexEntry, MemoryIndex, AgentIndex, SearchQuery, BacklinkEntry, DanglingLink } from "./types.js";
import { buildBacklinksIndex } from "../kg/backlinks-index.js";

const INDEX_FILENAME = "memory-index.json";
const CURRENT_VERSION = 1;

export class MemoryIndexManager {
  private index: MemoryIndex;

  constructor(private basePath: string) {
    this.index = this.createEmptyIndex();
  }

  /**
   * Create an empty index with default values
   *
   * 创建带有默认值的空索引
   */
  private createEmptyIndex(): MemoryIndex {
    return {
      version: CURRENT_VERSION,
      lastUpdated: new Date().toISOString(),
      shared: [],
      agents: {},
      backlinks: {},
      danglingLinks: [],
    };
  }

  /**
   * Load index from disk
   *
   * 从磁盘加载索引
   */
  async load(): Promise<void> {
    const filePath = path.join(this.basePath, INDEX_FILENAME);

    if (!existsSync(filePath)) {
      this.index = this.createEmptyIndex();
      return;
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as MemoryIndex;
      this.index = parsed;
    } catch {
      this.index = this.createEmptyIndex();
    }
  }

  /**
   * Save index to disk
   *
   * 保存索引到磁盘
   */
  async save(): Promise<void> {
    const dirPath = this.basePath;

    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    const filePath = path.join(dirPath, INDEX_FILENAME);
    this.index.lastUpdated = new Date().toISOString();

    const content = JSON.stringify(this.index, null, 2);
    await writeFile(filePath, content, "utf-8");
  }

  /**
   * Extract title from markdown content (first # heading)
   *
   * 从 markdown 内容中提取标题（第一个 # 标题）
   */
  private extractTitle(content: string): string {
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^#\s+(.+)$/);
      if (match) {
        return match[1].trim();
      }
    }
    return "";
  }

  /**
   * Convert MemoryFile to IndexEntry
   *
   * 将 MemoryFile 转换为 IndexEntry
   */
  private memoryFileToEntry(memory: MemoryFile): IndexEntry {
    const title =
      this.extractTitle(memory.content) ||
      memory.frontmatter.summary.slice(0, 50);

    return {
      path: memory.path,
      title,
      summary: memory.frontmatter.summary,
      tags: memory.frontmatter.tags,
      importance: memory.frontmatter.importance,
      modified: memory.frontmatter.modified,
    };
  }

  /**
   * Build index from a list of memories (typically called on startup)
   *
   * 从记忆列表构建索引（通常在启动时调用）
   */
  async build(memories: MemoryFile[]): Promise<void> {
    this.index = this.createEmptyIndex();

    const sharedMemories: IndexEntry[] = [];
    const agentMemories: Record<string, IndexEntry[]> = {};

    for (const memory of memories) {
      const entry = this.memoryFileToEntry(memory);
      const owner = memory.frontmatter.owner;

      if (owner === null) {
        sharedMemories.push(entry);
      } else {
        if (!agentMemories[owner]) {
          agentMemories[owner] = [];
        }
        agentMemories[owner].push(entry);
      }
    }

    this.index.shared = sharedMemories;

    this.index.agents = {};
    for (const [owner, entries] of Object.entries(agentMemories)) {
      const highImportanceCount = entries.filter(
        (e) => e.importance === "high"
      ).length;

      this.index.agents[owner] = {
        lastConsolidation: new Date().toISOString(),
        stats: {
          total: entries.length,
          highImportance: highImportanceCount,
        },
        entries,
      };
    }

    // Build backlinks
    // 构建反向链接
    const { backlinks, danglingLinks } = buildBacklinksIndex(memories);
    this.index.backlinks = backlinks;
    this.index.danglingLinks = danglingLinks;

    await this.save();
  }

  /**
   * Update index with a single memory (add or replace)
   *
   * 用单个记忆更新索引（添加或替换）
   */
  async update(memory: MemoryFile): Promise<void> {
    const entry = this.memoryFileToEntry(memory);
    const owner = memory.frontmatter.owner;

    if (owner === null) {
      const existingIndex = this.index.shared.findIndex(
        (e) => e.path === memory.path
      );
      if (existingIndex >= 0) {
        this.index.shared[existingIndex] = entry;
      } else {
        this.index.shared.push(entry);
      }
    } else {
      if (!this.index.agents[owner]) {
        this.index.agents[owner] = {
          lastConsolidation: new Date().toISOString(),
          stats: { total: 0, highImportance: 0 },
          entries: [],
        };
      }

      const existingIndex = this.index.agents[owner].entries.findIndex(
        (e) => e.path === memory.path
      );
      if (existingIndex >= 0) {
        this.index.agents[owner].entries[existingIndex] = entry;
      } else {
        this.index.agents[owner].entries.push(entry);
      }

      this.index.agents[owner].stats.total =
        this.index.agents[owner].entries.length;
      this.index.agents[owner].stats.highImportance =
        this.index.agents[owner].entries.filter(
          (e) => e.importance === "high"
        ).length;
      this.index.agents[owner].lastConsolidation =
        new Date().toISOString();
    }

    await this.save();
  }

  /**
   * Search memories by owner, importance, and/or tags
   *
   * 按所有者、重要性和/或标签搜索记忆
   */
  async search(query: SearchQuery): Promise<IndexEntry[]> {
    let results = [...this.index.shared];

    if (query.owner !== undefined) {
      const agentIndex = this.index.agents[query.owner];
      if (agentIndex) {
        results = [...agentIndex.entries];
      } else {
        results = [];
      }
    }

    if (query.importance !== undefined) {
      results = results.filter(
        (entry) => entry.importance === query.importance
      );
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter((entry) =>
        query.tags!.some((tag) => entry.tags.includes(tag))
      );
    }

    return results;
  }

  /**
   * Quick scan across all entries for title/summary/tag matches
   *
   * 在所有条目中快速扫描标题/摘要/标签匹配
   */
  async quickScan(searchTerm: string): Promise<IndexEntry[]> {
    const lowerSearchTerm = searchTerm.toLowerCase();
    const allEntries = [...this.index.shared];

    const matches = allEntries.filter((entry) => {
      const titleMatch = entry.title.toLowerCase().includes(lowerSearchTerm);
      const summaryMatch = entry.summary
        .toLowerCase()
        .includes(lowerSearchTerm);
      const tagMatch = entry.tags.some((tag) =>
        tag.toLowerCase().includes(lowerSearchTerm)
      );

      return titleMatch || summaryMatch || tagMatch;
    });

    return matches.slice(0, 10);
  }

  /**
   * Get a deep copy of the current index
   *
   * 获取当前索引的深拷贝
   */
  getIndex(): MemoryIndex {
    return JSON.parse(JSON.stringify(this.index)) as MemoryIndex;
  }

  /**
   * Get all memories that link to the specified memory.
   *
   * 获取所有链接到指定记忆的记忆。
   */
  getBacklinks(memoryId: string): BacklinkEntry[] {
    return this.index.backlinks[memoryId] || [];
  }

  /**
   * Get all unresolved (dangling) links.
   *
   * 获取所有未解析（悬空）的链接。
   */
  getDanglingLinks(): DanglingLink[] {
    return this.index.danglingLinks || [];
  }

  /**
   * Resolve a title/link target to a memory ID.
   * Returns null if no match found.
   *
   * 将标题/链接目标解析为记忆 ID。
   * 如果未找到匹配则返回 null。
   */
  resolveTitleLink(title: string): string | null {
    const lowerTitle = title.toLowerCase();

    // Search in shared
    // 在共享记忆中搜索
    for (const entry of this.index.shared) {
      if (entry.title.toLowerCase().startsWith(lowerTitle)) {
        return entry.path;
      }
    }

    // Search in agents
    // 在代理记忆中搜索
    for (const agentIndex of Object.values(this.index.agents)) {
      for (const entry of agentIndex.entries) {
        if (entry.title.toLowerCase().startsWith(lowerTitle)) {
          return entry.path;
        }
      }
    }

    return null;
  }

  /**
   * Rebuild entire backlinks index.
   *
   * 重建整个反向链接索引。
   */
  async rebuildBacklinks(memories: MemoryFile[]): Promise<void> {
    const { backlinks, danglingLinks } = buildBacklinksIndex(memories);
    this.index.backlinks = backlinks;
    this.index.danglingLinks = danglingLinks;
    await this.save();
  }
}
