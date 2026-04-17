import { parseWikilinks } from "../../src/kg/wikilink-parser.js";

describe("parseWikilinks", () => {
  it("parses simple wikilink", () => {
    const content = "See [[memory-id]] for details.";
    const result = parseWikilinks(content);
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe("memory-id");
    expect(result[0].raw).toBe("[[memory-id]]");
  });

  it("parses wikilink with alias", () => {
    const content = "See [[memory-id|that memory]] for details.";
    const result = parseWikilinks(content);
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe("memory-id");
    expect(result[0].alias).toBe("that memory");
  });

  it("parses multiple wikilinks on same line", () => {
    const content = "[[mem-a]] and [[mem-b]] are related.";
    const result = parseWikilinks(content);
    expect(result).toHaveLength(2);
  });

  it("returns empty for no wikilinks", () => {
    const content = "No links here.";
    const result = parseWikilinks(content);
    expect(result).toHaveLength(0);
  });

  it("handles Chinese characters in alias", () => {
    const content = "参见 [[mem-id|中文标题]]";
    const result = parseWikilinks(content);
    expect(result[0].alias).toBe("中文标题");
  });
});
