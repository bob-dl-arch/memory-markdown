/**
 * Frontmatter parsing and serialization using gray-matter
 *
 * 使用 gray-matter 进行 frontmatter 的解析和序列化
 */

import matter from "gray-matter";
import type {
  MemoryFrontmatter,
  MemoryLink,
  MemoryType,
  ImportanceLevel,
} from "./types.js";

export interface ParseResult {
  frontmatter: MemoryFrontmatter;
  content: string;
}

/**
 * Parse a markdown file content and extract frontmatter and body content.
 * Validates required fields (id must exist).
 *
 * 解析 markdown 文件内容，提取 frontmatter 和正文内容。
 * 验证必填字段（id 必须存在）。
 */
export function parseFrontmatter(rawContent: string): ParseResult {
  const parsed = matter(rawContent);
  const data = parsed.data as Record<string, unknown>;

  if (!data.id || typeof data.id !== "string") {
    throw new Error("Frontmatter must have an 'id' field of type string");
  }

  const frontmatter: MemoryFrontmatter = {
    id: data.id as string,
    created: (data.created as string) || new Date().toISOString().split("T")[0],
    modified: (data.modified as string) || new Date().toISOString().split("T")[0],
    type: (data.type as MemoryType) || "memory",
    tags: (data.tags as string[]) || [],
    importance: (data.importance as ImportanceLevel) || "medium",
    importanceReason: (data.importanceReason as string) || "",
    links: parseLinks(data.links),
    summary: (data.summary as string) || "",
    status: (data.status as "active" | "archived" | "superseded") || "active",
    owner: data.owner !== undefined ? (data.owner as string | null) : null,
  };

  return {
    frontmatter,
    content: parsed.content,
  };
}

/**
 * Parse links field which can be either:
 * - Array of strings: ["path1.md", "path2.md"]
 * - Array of objects: [{ path: "path1.md", reason: "related" }, ...]
 *
 * 解析 links 字段，支持两种格式：
 * - 字符串数组：["path1.md", "path2.md"]
 * - 对象数组：[{ path: "path1.md", reason: "related" }, ...]
 */
function parseLinks(links: unknown): MemoryLink[] {
  if (!Array.isArray(links)) {
    return [];
  }

  return links
    .map((link) => {
      if (typeof link === "string") {
        return { path: link, reason: "" };
      }
      if (typeof link === "object" && link !== null) {
        const linkObj = link as Record<string, unknown>;
        return {
          path: (linkObj.path as string) || "",
          reason: (linkObj.reason as string) || "",
        };
      }
      return { path: "", reason: "" };
    })
    .filter((link) => link.path !== "");
}

/**
 * Serialize frontmatter to YAML string.
 *
 * 将 frontmatter 序列化为 YAML 字符串。
 */
export function serializeFrontmatter(fm: MemoryFrontmatter): string {
  return matter.stringify("", fm);
}

/**
 * Create a new MemoryFrontmatter with sensible defaults.
 *
 * 创建带有合理默认值的 MemoryFrontmatter。
 */
export function createNewFrontmatter(params: {
  id: string;
  type?: MemoryType;
  tags?: string[];
  importance?: ImportanceLevel;
  importanceReason?: string;
  summary?: string;
  owner?: string | null;
}): MemoryFrontmatter {
  const now = new Date().toISOString().split("T")[0];
  return {
    id: params.id,
    created: now,
    modified: now,
    type: params.type || "memory",
    tags: params.tags || [],
    importance: params.importance || "medium",
    importanceReason: params.importanceReason || "",
    links: [],
    summary: params.summary || "",
    status: "active",
    owner: params.owner !== undefined ? params.owner : null,
  };
}
