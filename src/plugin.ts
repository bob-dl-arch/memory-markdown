/**
 * OpenClaw plugin entry point for memory-markdown
 *
 * Wraps the memory-markdown library as an OpenClaw memory plugin.
 *
 * memory-markdown 的 OpenClaw 插件入口点
 *
 * 将 memory-markdown 库包装为 OpenClaw 记忆插件。
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";
import os from "node:os";
import path from "node:path";
import { MemoryStorage, MemoryIndexManager } from "./index.js";
import type { CreateMemoryParams } from "./storage/types.js";

// Async memory capture queue - processed by background service
// 异步记忆捕获队列 - 由后台服务处理
const pendingCaptures: Array<{ messages: unknown[]; timestamp: number }> = [];

interface PluginConfig {
  basePath?: string;
  autoIndex?: boolean;
  autoCapture?: boolean;  // Auto-capture memories on agent_end / Agent 结束时自动捕获记忆
  autoRecall?: boolean;   // Auto-inject relevant memories on before_agent_start / Agent 启动前自动注入相关记忆
}

/**
 * Create plugin config schema with safeParse and jsonSchema
 *
 * 创建带 safeParse 和 jsonSchema 的插件配置模式
 */
function createMemoryPluginConfigSchema() {
  return {
    safeParse(value: unknown) {
      // Validate config structure / 验证配置结构
      if (value === undefined) {
        return { success: true as const, data: undefined };
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { success: false as const, error: { issues: [{ path: [], message: "expected config object" }] } };
      }
      const obj = value as Record<string, unknown>;
      // Validate optional fields / 验证可选字段
      if (obj.basePath !== undefined && typeof obj.basePath !== "string") {
        return { success: false as const, error: { issues: [{ path: ["basePath"], message: "must be string" }] } };
      }
      if (obj.autoIndex !== undefined && typeof obj.autoIndex !== "boolean") {
        return { success: false as const, error: { issues: [{ path: ["autoIndex"], message: "must be boolean" }] } };
      }
      if (obj.autoCapture !== undefined && typeof obj.autoCapture !== "boolean") {
        return { success: false as const, error: { issues: [{ path: ["autoCapture"], message: "must be boolean" }] } };
      }
      if (obj.autoRecall !== undefined && typeof obj.autoRecall !== "boolean") {
        return { success: false as const, error: { issues: [{ path: ["autoRecall"], message: "must be boolean" }] } };
      }
      return { success: true as const, data: obj };
    },
    jsonSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        basePath: { type: "string" },
        autoIndex: { type: "boolean", default: true },
        autoCapture: { type: "boolean", default: true },
        autoRecall: { type: "boolean", default: true },
      },
    },
  };
}

export default definePluginEntry({
  id: "memory-markdown",
  name: "Memory Markdown",
  description: "Filesystem-based memory storage with Markdown and frontmatter",
  configSchema: createMemoryPluginConfigSchema(),
  register(api) {
    const config = (api.pluginConfig ?? {}) as PluginConfig;

    // Get OpenClaw workspace directory
    let workspaceDir: string | null = null;
    try {
      workspaceDir =
        (api.runtime as any)?.agent?.resolveAgentWorkspaceDir?.() ||
        process.env.OPENCLAW_WORKSPACE;
    } catch (_e) {
      // ignore
    }
    if (!workspaceDir) {
      workspaceDir = path.join(os.homedir(), ".openclaw", "workspace");
    }

    // Resolve basePath (supports relative and absolute paths)
    let basePath: string;
    if (config.basePath) {
      basePath = path.isAbsolute(config.basePath)
        ? config.basePath
        : path.resolve(workspaceDir, config.basePath);
    } else {
      // Default: workspace/memories
      basePath = path.join(workspaceDir, "memories");
    }
    const autoIndex = config.autoIndex ?? true;

    const storage = new MemoryStorage(basePath);
    const index = new MemoryIndexManager(basePath);

    // Initialize index
    // 初始化索引
    if (autoIndex) {
      initializeIndex(storage, index).catch((err) => {
        api.logger.warn(`Failed to initialize memory index: ${err}`);
      });
    }

    // ========================================================================
    // Tools / 工具
    // ========================================================================

    // Register memory search tool
    // 注册记忆搜索工具
    api.registerTool({
      name: "md_memory_search",
      label: "Markdown Memory Search",
      description: "Search markdown memories by tags, importance, or full-text scan",
      parameters: Type.Object({
        query: Type.Optional(Type.String()),
        tags: Type.Optional(Type.Array(Type.String())),
        importance: Type.Optional(Type.String()),
        owner: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number()),
      }),
      async execute(_id, params) {
        await index.load();
        let results;

        if (params.query) {
          results = await index.quickScan(params.query);
        } else {
          results = await index.search({
            tags: params.tags,
            importance: params.importance as any,
            owner: params.owner,
          });
        }

        const limited = params.limit ? results.slice(0, params.limit) : results;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(limited, null, 2),
            },
          ],
          details: limited,
        };
      },
    });

    // Register memory create tool
    // 注册记忆创建工具
    api.registerTool({
      name: "md_memory_create",
      label: "Markdown Memory Create",
      description: "Create a new markdown memory",
      parameters: Type.Object({
        topic: Type.String(),
        content: Type.String(),
        type: Type.Optional(Type.String({ default: "memory" })),
        tags: Type.Optional(Type.Array(Type.String())),
        importance: Type.Optional(Type.String({ default: "medium" })),
        summary: Type.Optional(Type.String()),
        owner: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        const createParams: CreateMemoryParams = {
          topic: params.topic,
          content: params.content,
          type: params.type as any,
          tags: params.tags,
          importance: params.importance as any,
          summary: params.summary,
          owner: params.owner ?? null,
        };

        const memory = await storage.createMemory(createParams);
        await index.update(memory);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: memory.frontmatter.id,
                  path: memory.path,
                  topic: params.topic,
                },
                null,
                2,
              ),
            },
          ],
          details: { id: memory.frontmatter.id, path: memory.path, topic: params.topic },
        };
      },
    });

    // Register memory get tool
    // 注册记忆获取工具
    api.registerTool({
      name: "md_memory_get",
      label: "Markdown Memory Get",
      description: "Get a specific markdown memory by ID or path",
      parameters: Type.Object({
        id: Type.Optional(Type.String()),
        path: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        if (!params.id && !params.path) {
          throw new Error("Either id or path must be provided");
        }

        await index.load();

        if (params.id) {
          const entries = index.getIndex().shared;
          const entry = entries.find((e) => e.path.includes(params.id!));
          if (!entry) {
            return { content: [{ type: "text" as const, text: "Memory not found" }], details: null };
          }
          const memory = await storage.read(entry.path);
          return {
            content: [{ type: "text" as const, text: memory.raw }],
            details: { id: params.id, path: memory.path },
          };
        }

        if (params.path) {
          const memory = await storage.read(params.path);
          return {
            content: [{ type: "text" as const, text: memory.raw }],
            details: { path: params.path },
          };
        }

        return { content: [{ type: "text" as const, text: "Invalid request" }], details: null };
      },
    });

    // Register backlinks query tool
    // 注册反向链接查询工具
    api.registerTool({
      name: "md_memory_backlinks",
      label: "Markdown Memory Backlinks",
      description: "Get all markdown memories that reference a given memory",
      parameters: Type.Object({
        memoryId: Type.String(),
      }),
      async execute(_id, params) {
        await index.load();
        const backlinks = index.getBacklinks(params.memoryId);
        const dangling = index.getDanglingLinks();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ backlinks, danglingLinks: dangling }, null, 2),
            },
          ],
          details: { backlinks, danglingLinks: dangling },
        };
      },
    });

    // Register list tool
    // 注册列表工具
    api.registerTool({
      name: "md_memory_list",
      label: "Markdown Memory List",
      description: "List all markdown memories for an owner (use 'shared' for shared memories)",
      parameters: Type.Object({
        owner: Type.Optional(Type.String({ default: "shared" })),
      }),
      async execute(_id, params) {
        const memories = await storage.list(params.owner ?? "shared");
        const entries = memories.map((m) => ({
          id: m.frontmatter.id,
          path: m.path,
          topic: m.frontmatter.summary || extractTitle(m.content),
          type: m.frontmatter.type,
          tags: m.frontmatter.tags,
          importance: m.frontmatter.importance,
        }));

        return {
          content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }],
          details: entries,
        };
      },
    });

    // Register memory organize tool - LLM-driven KG auto-organization
    // 注册记忆整理工具 - LLM 驱动的知识图谱自动组织
    api.registerTool({
      name: "md_memory_organize",
      label: "Markdown Memory Organize",
      description: "Organize conversation into markdown memories with automatic KG linking. Takes raw text, finds related memories, and suggests wikilinks. LLM calls this after conversations to auto-maintain the knowledge graph.",
      parameters: Type.Object({
        text: Type.String({
          description: "Raw conversation or text to organize into memory",
        }),
        topic: Type.Optional(Type.String({ description: "Override topic for the memory" })),
        type: Type.Optional(Type.String({ description: "Memory type: memory, decision, reference, note" })),
        importance: Type.Optional(Type.String({ description: "Importance: high, medium, low" })),
        owner: Type.Optional(Type.String({ description: "Owner ID or null for shared" })),
      }),
      async execute(_id, params) {
        await index.load();

        // Step 1: Extract potential keywords from text for searching
        // 步骤 1：从文本中提取潜在关键词用于搜索
        const keywords = extractKeywords(params.text);

        // Step 2: Search for related memories
        // 步骤 2：搜索相关记忆
        const relatedMemories: Array<{
          id: string;
          title: string;
          path: string;
          relevanceScore: number;
          links: string[];
        }> = [];

        for (const keyword of keywords.slice(0, 5)) {
          const searchResults = await index.quickScan(keyword);
          for (const result of searchResults) {
            const existing = relatedMemories.find((m) => m.path === result.path);
            if (!existing) {
              try {
                const memory = await storage.read(result.path);
                relatedMemories.push({
                  id: memory.frontmatter.id,
                  title: result.title,
                  path: result.path,
                  relevanceScore: 1,
                  links: memory.frontmatter.links.map((l) => l.path),
                });
              } catch {
                // Skip if can't read
              }
            } else {
              existing.relevanceScore++;
            }
          }
        }

        // Sort by relevance
        relatedMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);
        const topRelated = relatedMemories.slice(0, 5);

        // Step 3: Suggest wikilinks based on related memories
        const suggestedLinks: string[] = [];
        for (const related of topRelated) {
          suggestedLinks.push(`[[${related.id}|${related.title}]]`);
        }

        // Step 4: Build the memory content with wikilinks
        const topic = params.topic || extractTopic(params.text);
        const content = buildOrganizedContent(params.text, suggestedLinks);

        // Step 5: Extract tags from keywords
        const tags = keywords.slice(0, 3);

        // Step 6: Create the memory
        const createParams: CreateMemoryParams = {
          topic,
          content,
          type: (params.type as any) || "memory",
          tags,
          importance: (params.importance as any) || "medium",
          summary: extractSummary(params.text),
          owner: params.owner ?? null,
        };

        const memory = await storage.createMemory(createParams);
        await index.update(memory);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  id: memory.frontmatter.id,
                  path: memory.path,
                  topic,
                  tags,
                  relatedMemories: topRelated.map((m) => ({
                    id: m.id,
                    title: m.title,
                    path: m.path,
                  })),
                  suggestedWikilinks: suggestedLinks,
                  contentPreview: content.slice(0, 200) + (content.length > 200 ? "..." : ""),
                },
                null,
                2,
              ),
            },
          ],
          details: { id: memory.frontmatter.id, path: memory.path, topic, tags, relatedMemories: topRelated, suggestedWikilinks: suggestedLinks },
        };
      },
    });

    // Register memory dream sync tool - for automated KG maintenance in dream mode
    api.registerTool({
      name: "md_memory_dream_sync",
      label: "Markdown Memory Dream Sync",
      description: "Dream mode markdown KG automation. Call periodically in dream/background mode to scan recent conversations, find unlinked concepts, auto-create memories and establish wikilinks. Repairs dangling links and consolidates fragmented knowledge.",
      parameters: Type.Object({
        recentText: Type.Optional(Type.String({ description: "Recent conversation text to process" })),
        owner: Type.Optional(Type.String({ description: "Owner ID or null for shared" })),
        maxNewMemories: Type.Optional(Type.Number({ description: "Max memories to create per sync", default: 3 })),
      }),
      async execute(_id, params) {
        await index.load();
        const results: Array<{
          action: string;
          id?: string;
          path?: string;
          topic?: string;
          details?: string;
        }> = [];

        // Step 1: Process recent text if provided
        if (params.recentText && params.recentText.length > 0) {
          const keywords = extractKeywords(params.recentText);
          const relatedMemories: Array<{
            id: string;
            title: string;
            path: string;
            relevanceScore: number;
          }> = [];

          for (const keyword of keywords.slice(0, 5)) {
            const searchResults = await index.quickScan(keyword);
            for (const result of searchResults) {
              const existing = relatedMemories.find((m) => m.path === result.path);
              if (!existing) {
                relatedMemories.push({
                  id: result.path,
                  title: result.title,
                  path: result.path,
                  relevanceScore: 1,
                });
              } else {
                existing.relevanceScore++;
              }
            }
          }

          relatedMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);
          const topRelated = relatedMemories.slice(0, 3);

          // Build wikilinks
          const wikilinks: string[] = [];
          for (const related of topRelated) {
            wikilinks.push(`[[${related.id}|${related.title}]]`);
          }

          // Create memory for recent conversation
          const topic = extractTopic(params.recentText);
          const content = buildOrganizedContent(params.recentText, wikilinks);
          const tags = keywords.slice(0, 3);

          const createParams: CreateMemoryParams = {
            topic,
            content,
            type: "memory",
            tags,
            importance: "medium",
            summary: extractSummary(params.recentText),
            owner: params.owner ?? null,
          };

          const memory = await storage.createMemory(createParams);
          await index.update(memory);

          results.push({
            action: "created",
            id: memory.frontmatter.id,
            path: memory.path,
            topic,
            details: `Linked to ${topRelated.length} related memories`,
          });
        }

        // Step 2: Repair dangling links
        const dangling = index.getDanglingLinks();
        if (dangling.length > 0) {
          for (const link of dangling.slice(0, 5)) {
            const resolved = index.resolveTitleLink(link.targetTitle);
            if (resolved) {
              results.push({
                action: "dangling_link_resolved",
                details: `Target "${link.targetTitle}" resolved to ${resolved}`,
              });
            } else {
              results.push({
                action: "dangling_link_unresolved",
                details: `Target "${link.targetTitle}" in ${link.sourceId} could not be resolved`,
              });
            }
          }
        }

        // Step 3: Find orphaned memories (memories with no incoming links)
        await index.load();
        const allEntries = [...index.getIndex().shared];
        const orphaned: Array<{ id: string; title: string }> = [];

        for (const entry of allEntries) {
          const backlinks = index.getBacklinks(entry.path.includes("/") ? entry.path.split("/").pop()! : entry.path);
          if (backlinks.length === 0) {
            orphaned.push({ id: entry.path, title: entry.title });
          }
        }

        if (orphaned.length > 0) {
          results.push({
            action: "orphaned_memories_found",
            details: `${orphaned.length} memories have no incoming links`,
          });
        }

        // Step 4: Suggest connections between related orphaned memories
        const maxNew = params.maxNewMemories ?? 3;
        let newLinkCount = 0;

        for (let i = 0; i < Math.min(orphaned.length, maxNew); i++) {
          for (let j = i + 1; j < Math.min(orphaned.length, maxNew); j++) {
            newLinkCount++;
          }
        }

        if (newLinkCount > 0) {
          results.push({
            action: "connections_suggested",
            details: `Suggested ${newLinkCount} potential links between orphaned memories`,
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  syncResults: results,
                  danglingLinksCount: dangling.length,
                  orphanedMemoriesCount: orphaned.length,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
          details: { syncResults: results, danglingLinksCount: dangling.length, orphanedMemoriesCount: orphaned.length },
        };
      },
    });

    // ========================================================================
    // Lifecycle Hooks / 生命周期钩子
    // ========================================================================

    // Hook: after agent ends - queue capture for async processing
    api.on("agent_end", async (event) => {
      if (!event.messages || event.messages.length === 0) {
        return;
      }

      const pluginConfig = (api.pluginConfig ?? {}) as PluginConfig;
      if (pluginConfig.autoCapture === false) {
        return;
      }

      // Lightweight: just queue, don't block
      pendingCaptures.push({
        messages: event.messages,
        timestamp: Date.now(),
      });
    });

    // Hook: before_prompt_build - inject relevant memories before agent starts
    api.on("before_prompt_build", async (event) => {
      if (!event.messages || event.messages.length === 0) {
        return;
      }

      try {
        const pluginConfig = (api.pluginConfig ?? {}) as PluginConfig;
        if (pluginConfig.autoRecall === false) {
          return;
        }

        await index.load();

        // Extract text from messages for searching
        const messageText = event.messages
          .map(m => typeof m === 'string' ? m : (m && typeof m === 'object' && 'content' in m ? String((m as any).content) : JSON.stringify(m)))
          .join(" ");

        if (messageText.length < 10) return;

        // Search for relevant memories based on message content
        const results = await index.quickScan(messageText);

        if (results.length === 0) {
          return;
        }

        // Format memories for injection
        const memoryContext = results.slice(0, 3).map((m) => {
          return `[${m.importance || 'medium'}] ${m.title}\n${m.summary || ''}`;
        }).join("\n\n");

        return {
          prependContext: `<relevant-memories>\n${memoryContext}\n</relevant-memories>`,
        };
      } catch (err) {
        api.logger.warn(`[memory-markdown] Auto-recall failed: ${err}`);
      }
    });

    // ========================================================================
    // Background memory capture processor / 后台记忆捕获处理器
    // ========================================================================

    function startCaptureProcessor() {
      const PROCESS_INTERVAL = 5000; // 5 seconds / 5 秒

      setInterval(() => {
        if (pendingCaptures.length === 0) return;

        const capture = pendingCaptures.shift();
        if (!capture) return;

        processCapture(capture).catch((err) => {
          console.warn(`[memory-markdown] Capture processing failed: ${err}`);
        });
      }, PROCESS_INTERVAL);
    }

    async function processCapture(capture: { messages: unknown[]; timestamp: number }): Promise<void> {
      // Extract meaningful user messages
      const userMessages: string[] = [];
      for (const msg of capture.messages) {
        if (!msg || typeof msg !== "object") continue;
        const msgObj = msg as Record<string, unknown>;
        if (msgObj.role !== "user") continue;

        const content = msgObj.content;
        if (typeof content === "string" && content.length > 10) {
          userMessages.push(content);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (
              block &&
              typeof block === "object" &&
              "type" in block &&
              (block as Record<string, unknown>).type === "text" &&
              "text" in block
            ) {
              const text = (block as Record<string, unknown>).text as string;
              if (text && text.length > 10) {
                userMessages.push(text);
              }
            }
          }
        }
      }

      // Filter for meaningful content
      const meaningfulMessages = userMessages.filter(
        (text) =>
          text.length > 20 &&
          !text.startsWith("<") &&
          !text.includes("system prompt") &&
          !text.includes("instructions"),
      );

      if (meaningfulMessages.length === 0) return;

      const combinedText = meaningfulMessages.join("\n\n");

      // Auto-organize: find related memories and create linked memory
      await index.load();
      const keywords = extractKeywords(combinedText);
      const relatedMemories: Array<{
        id: string;
        title: string;
        path: string;
      }> = [];

      for (const keyword of keywords.slice(0, 5)) {
        const results = await index.quickScan(keyword);
        for (const result of results.slice(0, 3)) {
          if (!relatedMemories.find((m) => m.path === result.path)) {
            try {
              const memory = await storage.read(result.path);
              relatedMemories.push({
                id: memory.frontmatter.id,
                title: result.title,
                path: result.path,
              });
            } catch {
              // Skip if can't read
            }
          }
        }
      }

      // Build wikilinks
      const wikilinks = relatedMemories.slice(0, 5).map(
        (m) => `[[${m.id}|${m.title}]]`,
      );

      // Create memory
      const topic = extractTopic(combinedText);
      const content = buildOrganizedContent(combinedText, wikilinks);
      const tags = keywords.slice(0, 3);

      await storage.createMemory({
        topic,
        content,
        type: "memory",
        tags,
        importance: "medium",
        summary: extractSummary(combinedText),
        owner: null,
      });

      console.info(`[memory-markdown] Auto-captured memory: "${topic}" with ${wikilinks.length} links`);
    }

    // ========================================================================
    // Service / 服务
    // ========================================================================

    api.registerService({
      id: "memory-markdown",
      start() {
        api.logger.info("[memory-markdown] Service started");
        startCaptureProcessor();
      },
      stop() {
        api.logger.info("[memory-markdown] Service stopped");
      },
    });
  },
});

/**
 * Initialize index from storage
 *
 * 从存储初始化索引
 */
async function initializeIndex(
  storage: MemoryStorage,
  index: MemoryIndexManager,
): Promise<void> {
  try {
    const sharedMemories = await storage.list("shared");
    const allMemories = [...sharedMemories];

    // Also load private memories if needed
    const indexData = index.getIndex();
    for (const owner of Object.keys(indexData.agents)) {
      const privateMemories = await storage.list(owner);
      allMemories.push(...privateMemories);
    }

    if (allMemories.length > 0) {
      await index.build(allMemories);
    }
  } catch (err) {
    console.warn("[memory-markdown] Index initialization skipped:", err);
  }
}

/**
 * Extract title from markdown content
 *
 * 从 markdown 内容中提取标题
 */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : "";
}

/**
 * Extract keywords from text for searching related memories
 *
 * 从文本中提取关键词以搜索相关记忆
 */
function extractKeywords(text: string): string[] {
  // Simple keyword extraction: remove common words, take nouns/entities
  const stopWords = new Set([
    "的", "是", "在", "了", "和", "与", "或", "以及", "也", "都", "而", "等",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "this", "that", "these", "those",
    "i", "you", "he", "she", "it", "we", "they", "what", "which", "who",
  ]);

  // Split by whitespace and punctuation, filter
  const words = text
    .split(/[\s\n\r\t.,;:!?，。；：！？、]+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()));

  // Count frequency
  const freq: Record<string, number> = {};
  for (const word of words) {
    const lower = word.toLowerCase();
    freq[lower] = (freq[lower] || 0) + 1;
  }

  // Sort by frequency, take top keywords
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

/**
 * Extract a topic/title from text
 *
 * 从文本中提取主题/标题
 */
function extractTopic(text: string): string {
  // Try to find a title-like line
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length < 50) {
      return trimmed;
    }
  }
  // Fall back to first meaningful line truncated
  return text.slice(0, 30) + (text.length > 30 ? "..." : "");
}

/**
 * Extract a summary from text
 *
 * 从文本中提取摘要
 */
function extractSummary(text: string): string {
  // Take first sentence or first 100 chars
  const sentenceEnd = text.match(/[.。!！?？\n]/);
  if (sentenceEnd) {
    const summary = text.slice(0, sentenceEnd.index!);
    if (summary.length <= 100) return summary;
  }
  return text.slice(0, 100) + (text.length > 100 ? "..." : "");
}

/**
 * Build organized markdown content with wikilinks
 *
 * 使用 wikilinks 构建有组织的 markdown 内容
 */
function buildOrganizedContent(text: string, wikilinks: string[]): string {
  // Extract title if present
  const lines = text.split("\n");
  let title = "";
  let contentLines: string[] = [];

  for (const line of lines) {
    if (!title && line.trim() && line.trim().length < 60) {
      title = line.trim();
    } else {
      contentLines.push(line);
    }
  }

  const content = contentLines.join("\n").trim();
  const formattedTitle = title ? `# ${title}` : "# Memory";
  const linksSection = wikilinks.length > 0 ? `\n\n**关联**: ${wikilinks.join(" ")}` : "";

  return `${formattedTitle}\n\n${content}${linksSection}`;
}
