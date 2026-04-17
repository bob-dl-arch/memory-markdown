/**
 * Wikilink parser - extracts [[wikilinks]] from markdown content
 *
 * Wikilink 解析器 - 从 markdown 内容中提取 [[wikilinks]]
 */

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
// Wikilink 格式：[[target]] 或 [[target|alias]]

export interface ParsedWikilink {
  raw: string;      // Full match: "[[memory-id]]" or "[[id|alias]]" / 完整匹配
  target: string;   // Extracted target: "memory-id" / 提取的目标
  alias?: string;   // Display alias if provided / 显示别名（如果提供）
  context: string;  // Full line containing the link / 包含链接的完整行
}

/**
 * Parse all wikilinks from markdown content
 *
 * 从 markdown 内容中解析所有 wikilinks
 *
 * @param content - Markdown content to parse / 要解析的 markdown 内容
 * @returns Array of parsed wikilinks / 解析后的 wikilinks 数组
 */
export function parseWikilinks(content: string): ParsedWikilink[] {
  const results: ParsedWikilink[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    let match;
    // Reset regex state
    // 重置正则状态
    WIKILINK_REGEX.lastIndex = 0;

    while ((match = WIKILINK_REGEX.exec(line)) !== null) {
      results.push({
        raw: match[0],
        target: match[1].trim(),
        alias: match[2]?.trim(),
        context: line,
      });
    }
  }

  return results;
}
