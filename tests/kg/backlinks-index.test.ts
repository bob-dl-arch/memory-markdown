import { buildBacklinksIndex } from "../../src/kg/backlinks-index.js";
import type { MemoryFile } from "../../src/storage/types.js";

describe("buildBacklinksIndex", () => {
  it("builds backlinks map from memories", () => {
    const memories: MemoryFile[] = [
      {
        path: "/memories/mem-a.md",
        frontmatter: { id: "mem-a", links: [{ path: "mem-b", reason: "" }] } as any,
        content: "Links to [[mem-b]]",
        raw: "",
      },
      {
        path: "/memories/mem-b.md",
        frontmatter: { id: "mem-b", links: [] } as any,
        content: "No links",
        raw: "",
      },
    ];

    const { backlinks, danglingLinks } = buildBacklinksIndex(memories);

    expect(backlinks["mem-b"]).toHaveLength(1);
    expect(backlinks["mem-b"][0].sourceId).toBe("mem-a");
    expect(backlinks["mem-b"][0].context).toContain("[[mem-b]]");
    expect(danglingLinks).toHaveLength(0);
  });

  it("collects dangling links", () => {
    const memories: MemoryFile[] = [
      {
        path: "/memories/mem-a.md",
        frontmatter: { id: "mem-a", links: [{ path: "nonexistent", reason: "" }] } as any,
        content: "Links to [[nonexistent]]",
        raw: "",
      },
    ];

    const { backlinks, danglingLinks } = buildBacklinksIndex(memories);

    expect(danglingLinks).toHaveLength(1);
    expect(danglingLinks[0].targetTitle).toBe("nonexistent");
  });
});
