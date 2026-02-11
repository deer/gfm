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

  it("applies custom theme via --gfm-* variables", async () => {
    await browserTest("theme", async (page) => {
      // Page uses our generated CSS with loud orange --gfm-* overrides:
      //   --gfm-accent-color: #f97316  (orange-500)
      //   --gfm-fg-heading: #f97316

      // Headings should use the custom heading color (#f97316 = rgb(249, 115, 22))
      const headingColor = await page.evaluate(() => {
        const h1 = document.querySelector(".markdown-body h1");
        return h1 ? getComputedStyle(h1).color : null;
      });
      assertEquals(headingColor, "rgb(249, 115, 22)");

      // Links should use the custom accent color
      const linkColor = await page.evaluate(() => {
        const a = document.querySelector(".markdown-body a[href]");
        return a ? getComputedStyle(a).color : null;
      });
      assertEquals(linkColor, "rgb(249, 115, 22)");

      // Inline code has a background from --gfm-inline-code-bg
      const codeHasBg = await page.evaluate(() => {
        const code = document.querySelector(".markdown-body p code");
        if (!code) return false;
        const bg = getComputedStyle(code).backgroundColor;
        return bg !== "" && bg !== "rgba(0, 0, 0, 0)";
      });
      assertEquals(codeHasBg, true);

      // Tables render with borders from --gfm-border-color
      const tables = await page.$$(".markdown-body table");
      assertEquals(tables.length, 1);
    });
  });

  it("renders GitHub alerts", async () => {
    await browserTest("alerts", async (page) => {
      const alerts = await page.$$(".markdown-alert");
      assertEquals(alerts.length, 5);

      const titles = await page.$$(".markdown-alert-title");
      assertEquals(titles.length, 5);

      // Alerts should have visible left border
      const hasBorderLeft = await page.evaluate(() => {
        const alert = document.querySelector(".markdown-alert");
        if (!alert) return false;
        const style = getComputedStyle(alert);
        return style.borderLeftStyle === "solid" &&
          style.borderLeftWidth !== "0px";
      });
      assertEquals(hasBorderLeft, true);

      // Alert icons should be inline SVGs
      const iconCount = await page.evaluate(() => {
        return document.querySelectorAll(".markdown-alert-title svg").length;
      });
      assertEquals(iconCount, 5);
    });
  });

  it("renders inline vs block with same markdown", async () => {
    // Same fixture rendered without inline (block) — should have <p> tags
    await browserTest("inline-block", async (page) => {
      const blockPs = await page.$$(".markdown-body p");
      assertEquals(blockPs.length > 0, true);

      const blockStrongs = await page.$$(".markdown-body strong");
      assertEquals(blockStrongs.length > 0, true);
    });

    // Same fixture rendered with inline: true — no <p> tags
    await browserTest("inline", async (page) => {
      const inlinePs = await page.$$(".markdown-body p");
      assertEquals(inlinePs.length, 0);

      // Inline formatting still present
      const inlineStrongs = await page.$$(".markdown-body strong");
      assertEquals(inlineStrongs.length > 0, true);

      const links = await page.$$(".markdown-body a[href]");
      assertEquals(links.length > 0, true);

      const codes = await page.$$(".markdown-body code");
      assertEquals(codes.length > 0, true);
    });
  });

  it("renders code blocks with headers and wrappers", async () => {
    await browserTest("codeblocks", async (page) => {
      // Page uses our generated CSS for code block styling

      // All pre>code blocks should be wrapped in .highlight
      const highlights = await page.$$(".markdown-body .highlight");
      assertEquals(highlights.length, 4); // 3 with lang + 1 without

      // Blocks with a language get a .code-header
      const codeHeaders = await page.$$(".markdown-body .code-header");
      assertEquals(codeHeaders.length, 3); // typescript, python, bash

      // Each header has a .code-lang span with the language name
      const langLabels = await page.evaluate(() => {
        const spans = document.querySelectorAll(
          ".markdown-body .code-header .code-lang",
        );
        return Array.from(spans).map((s) => s.textContent);
      });
      assertEquals(langLabels, ["typescript", "python", "bash"]);

      // Code header has styled properties (border, padding, flex layout)
      const headerStyles = await page.evaluate(() => {
        const header = document.querySelector(".markdown-body .code-header");
        if (!header) return null;
        const s = getComputedStyle(header);
        return {
          display: s.display,
          borderStyle: s.borderStyle,
        };
      });
      assertEquals(headerStyles?.display, "flex");
      assertEquals(headerStyles?.borderStyle, "solid");

      // pre after code-header has flattened top border-radius
      const preRadius = await page.evaluate(() => {
        const pre = document.querySelector(
          ".markdown-body .code-header + pre",
        );
        if (!pre) return null;
        const s = getComputedStyle(pre);
        return {
          topLeft: s.borderTopLeftRadius,
          topRight: s.borderTopRightRadius,
        };
      });
      assertEquals(preRadius?.topLeft, "0px");
      assertEquals(preRadius?.topRight, "0px");

      // The block without a language has no header
      const lastHighlight = await page.evaluate(() => {
        const all = document.querySelectorAll(".markdown-body .highlight");
        const last = all[all.length - 1];
        return last?.querySelector(".code-header") === null;
      });
      assertEquals(lastHighlight, true);
    });
  });
});
