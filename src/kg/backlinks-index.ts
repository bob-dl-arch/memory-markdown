/**
 * Backlinks index - builds reverse-link index from memories
 *
 * 反向链接索引 - 从记忆构建反向链接索引
 */

import type { MemoryFile } from "../storage/types.js";

export interface BacklinkEntry {
  sourceId: string;   // Memory ID that references the target / 引用目标记忆的 ID
  context: string;     // The line/text containing [[link]] / 包含 [[link]] 的行/文本
}

export interface DanglingLink {
  sourceId: string;     // Memory ID with unresolved link / 包含未解析链接的记忆 ID
  targetTitle: string;   // Title that couldn't be resolved / 无法解析的标题
  context: string;       // The line/text containing [[link]] / 包含 [[link]] 的行/文本
}

export interface BacklinksIndex {
  backlinks: Record<string, BacklinkEntry[]>;
  danglingLinks: DanglingLink[];
}

/**
 * Build backlinks index from a list of memories.
 * For each memory, parse content for [[wikilinks]] to get context,
 * and build reverse index from target -> sources.
 *
 * 从记忆列表构建反向链接索引。
 * 对于每条记忆，解析内容中的 [[wikilinks]] 获取上下文，
 * 并构建从目标到源的反向索引。
 *
 * @param memories - Array of memory files to index / 要索引的记忆文件数组
 * @returns BacklinksIndex containing backlinks and dangling links / 包含反向链接和悬空链接的索引
 */
export function buildBacklinksIndex(memories: MemoryFile[]): BacklinksIndex {
  const backlinks: Record<string, BacklinkEntry[]> = {};
  const danglingLinks: DanglingLink[] = [];
  const memoryIds = new Set(memories.map(m => m.frontmatter.id));
  const memoryTitles = new Map<string, string>(); // title -> id

  // First pass: collect all memory ids and titles
  // 第一遍：收集所有记忆 ID 和标题
  for (const memory of memories) {
    const id = memory.frontmatter.id;
    // Extract title from first # heading
    // 从第一个 # 标题提取标题
    const titleMatch = memory.content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim().toLowerCase() : "";
    memoryTitles.set(title, id);
  }

  // Second pass: build backlinks
  // 第二遍：构建反向链接
  for (const memory of memories) {
    const sourceId = memory.frontmatter.id;
    const links = memory.frontmatter.links || [];

    for (const link of links) {
      const target = link.path;

      // Try exact ID match first
      // 首先尝试精确 ID 匹配
      let resolvedId: string | null = null;
      if (memoryIds.has(target)) {
        resolvedId = target;
      } else {
        // Try title match (case-insensitive prefix)
        // 尝试标题匹配（不区分大小写的前缀）
        const lowerTarget = target.toLowerCase();
        for (const [title, id] of memoryTitles) {
          if (title.startsWith(lowerTarget)) {
            resolvedId = id;
            break;
          }
        }
      }

      // Get context line from content
      // 从内容中获取上下文行
      const context = getLinkContext(memory.content, target);

      if (resolvedId) {
        if (!backlinks[resolvedId]) {
          backlinks[resolvedId] = [];
        }
        backlinks[resolvedId].push({
          sourceId,
          context,
        });
      } else {
        danglingLinks.push({
          sourceId,
          targetTitle: target,
          context,
        });
      }
    }
  }

  return { backlinks, danglingLinks };
}

/**
 * Get the line containing the specified wikilink target
 *
 * 获取包含指定 wikilink 目标的行
 */
function getLinkContext(content: string, target: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.includes(`[[${target}]]`)) {
      return line.trim();
    }
  }
  return "";
}
