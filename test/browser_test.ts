import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { browserTest } from "./test_utils.ts";

describe("browser tests", () => {
  it("renders tables correctly", async () => {
    await browserTest("tables", async (page) => {
      const tables = await page.$$("table");
      assertEquals(tables.length, 2);

      const ths = await page.$$("th");
      assertEquals(ths.length, 6); // 3 + 3 headers
    });
  });

  it("renders code blocks with highlighting", async () => {
    await browserTest("code", async (page) => {
      const codeBlocks = await page.$$("pre code");
      assertEquals(codeBlocks.length, 3);

      // Check that syntax highlighting classes are applied
      const spans = await page.$$("pre code span");
      // Should have highlighting spans (pl-* for starry-night or hljs-* for lowlight)
      assertEquals(spans.length > 0, true);
    });
  });

  it("renders GFM features", async () => {
    await browserTest("gfm", async (page) => {
      // Task lists
      const checkboxes = await page.$$('input[type="checkbox"]');
      assertEquals(checkboxes.length, 3);

      // Strikethrough
      const dels = await page.$$("del");
      assertEquals(dels.length, 1);

      // Links (autolinks)
      const links = await page.$$("a");
      assertEquals(links.length > 0, true);
    });
  });

  it("renders math with KaTeX", async () => {
    await browserTest("math", async (page) => {
      // KaTeX renders .katex elements
      const katexElements = await page.$$(".katex");
      assertEquals(katexElements.length > 0, true);
    });
  });
});
