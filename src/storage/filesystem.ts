/**
 * Filesystem-based memory storage
 *
 * 基于文件系统的记忆存储
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { MemoryFile, CreateMemoryParams, MemoryType, ImportanceLevel, ParsedWikilink, MemoryLink } from "./types.js";
import { parseWikilinks } from "../kg/wikilink-parser.js";
import {
  parseFrontmatter,
  serializeFrontmatter,
  createNewFrontmatter,
} from "./frontmatter.js";

/**
 * Generate a unique ID using timestamp and random suffix.
 *
 * 使用时间戳和随机后缀生成唯一 ID。
 */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

export class MemoryStorage {
  constructor(private basePath: string) {}

  /**
   * Ensure a directory exists, creating it if necessary.
   *
   * 确保目录存在，必要时创建。
   */
  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Read a markdown file, parse frontmatter, return MemoryFile.
   *
   * 读取 markdown 文件，解析 frontmatter，返回 MemoryFile。
   */
  async read(relativePath: string): Promise<MemoryFile> {
    const fullPath = path.resolve(this.basePath, relativePath);
    const raw = await fs.readFile(fullPath, "utf-8");
    const { frontmatter, content } = parseFrontmatter(raw);

    return {
      path: fullPath,
      frontmatter,
      content,
      raw,
    };
  }

  /**
   * Extract all [[wikilinks]] from markdown content.
   *
   * 从 markdown 内容中提取所有 [[wikilinks]]。
   */
  extractWikilinks(content: string): ParsedWikilink[] {
    return parseWikilinks(content);
  }

  /**
   * Ensure directory exists, serialize frontmatter + content, write to file.
   *
   * 确保目录存在，序列化 frontmatter + 内容，写入文件。
   */
  async write(relativePath: string, file: MemoryFile): Promise<void> {
    const fullPath = path.resolve(this.basePath, relativePath);
    const dirPath = path.dirname(fullPath);

    await this.ensureDir(dirPath);

    const frontmatterStr = serializeFrontmatter(file.frontmatter);
    const raw = frontmatterStr + "\n" + file.content;

    await fs.writeFile(fullPath, raw, "utf-8");
  }

  /**
   * Delete the file at the given relative path.
   *
   * 删除给定相对路径的文件。
   */
  async delete(relativePath: string): Promise<void> {
    const fullPath = path.resolve(this.basePath, relativePath);
    await fs.unlink(fullPath);
  }

  /**
   * Recursively list all .md files in agent's directory.
   * agentId="shared" maps to "SHARED".
   * Reads each file and filters by status="active".
   *
   * 递归列出代理目录中的所有 .md 文件。
   * agentId="shared" 映射到 "SHARED"。
   * 读取每个文件并按 status="active" 过滤。
   */
  async list(agentId: string): Promise<MemoryFile[]> {
    const dirName = agentId === "shared" ? "SHARED" : agentId;
    const dirPath = path.resolve(this.basePath, dirName);

    const memoryFiles: MemoryFile[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.listMarkdownFiles(entryPath);
          memoryFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          try {
            const raw = await fs.readFile(entryPath, "utf-8");
            const { frontmatter, content } = parseFrontmatter(raw);

            if (frontmatter.status === "active") {
              memoryFiles.push({
                path: entryPath,
                frontmatter,
                content,
                raw,
              });
            }
          } catch (err) {
            console.warn(
              `[memory-markdown] Skipping file that can't be parsed: ${entryPath}`,
              err
            );
          }
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    return memoryFiles;
  }

  /**
   * Recursively list all markdown files in a directory.
   *
   * 递归列出目录中的所有 markdown 文件。
   */
  private async listMarkdownFiles(dirPath: string): Promise<MemoryFile[]> {
    const memoryFiles: MemoryFile[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.listMarkdownFiles(entryPath);
          memoryFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          try {
            const raw = await fs.readFile(entryPath, "utf-8");
            const { frontmatter, content } = parseFrontmatter(raw);

            if (frontmatter.status === "active") {
              memoryFiles.push({
                path: entryPath,
                frontmatter,
                content,
                raw,
              });
            }
          } catch (err) {
            console.warn(
              `[memory-markdown] Skipping file that can't be parsed: ${entryPath}`,
              err
            );
          }
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }

    return memoryFiles;
  }

  /**
   * Create a new memory file with auto-generated id, slugified filename, proper path structure.
   * - Private memories: {owner}/memory/{date}-{slug}.md
   * - Shared memories: SHARED/{topic}/{date}-{slug}.md
   *
   * 创建新的记忆文件，自动生成 id 和 slugified 文件名，正确的路径结构。
   * - 私有记忆：{owner}/memory/{date}-{slug}.md
   * - 共享记忆：SHARED/{topic}/{date}-{slug}.md
   */
  async createMemory(params: CreateMemoryParams): Promise<MemoryFile> {
    const id = generateId();
    const date = new Date().toISOString().split("T")[0];
    const slug = this.slugify(params.topic);
    const filename = `${date}-${slug}.md`;

    const isShared = params.owner === null || params.owner === undefined || params.owner === "shared";

    let relativePath: string;
    let owner: string | null;

    if (isShared) {
      const topicSlug = this.slugify(params.topic);
      relativePath = path.join("SHARED", topicSlug, filename);
      owner = null;
    } else {
      relativePath = path.join(params.owner!, "memory", filename);
      owner = params.owner ?? null;
    }

    const frontmatter = createNewFrontmatter({
      id,
      type: params.type,
      tags: params.tags,
      importance: params.importance,
      importanceReason: params.importanceReason,
      summary: params.summary,
      owner,
    });

    // Extract wikilinks from content and add to frontmatter
    // 从内容中提取 wikilinks 并添加到 frontmatter
    const extractedLinks = this.extractWikilinks(params.content);
    const linkObjects: MemoryLink[] = extractedLinks.map(wl => ({
      path: wl.target,
      reason: wl.alias || "",
    }));
    frontmatter.links = linkObjects;

    const file: MemoryFile = {
      path: path.resolve(this.basePath, relativePath),
      frontmatter,
      content: params.content,
      raw: serializeFrontmatter(frontmatter) + "\n" + params.content,
    };

    await this.write(relativePath, file);

    return file;
  }

  /**
   * Convert topic to lowercase URL-safe slug.
   * Preserves Chinese characters and other non-ASCII characters.
   *
   * 将主题转换为小写、URL 安全的 slug。
   * 保留中文字符和其他非 ASCII 字符。
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
