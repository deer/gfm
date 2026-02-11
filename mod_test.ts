import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { Paragraph, Root as MdastRoot } from "mdast";
import type { Element, Root as HastRoot } from "hast";

import {
  clearCache,
  extractToc,
  parseFrontmatter,
  render,
  renderWithMeta,
  warmup,
} from "./mod.ts";

describe("render", () => {
  it("renders basic markdown", async () => {
    const html = await render("# Hello **world**");
    assertStringIncludes(html, "<h1");
    assertStringIncludes(html, "<strong>world</strong>");
  });

  it("renders GFM tables", async () => {
    const html = await render("| A | B |\n|---|---|\n| 1 | 2 |");
    assertStringIncludes(html, "<table>");
    assertStringIncludes(html, "<th>A</th>");
  });

  it("renders GFM strikethrough", async () => {
    const html = await render("~~deleted~~");
    assertStringIncludes(html, "<del>deleted</del>");
  });

  it("renders GFM autolinks", async () => {
    const html = await render("Visit https://example.com");
    assertStringIncludes(html, 'href="https://example.com"');
  });

  it("renders GFM task lists", async () => {
    const html = await render("- [x] Done\n- [ ] Todo");
    assertStringIncludes(html, 'type="checkbox"');
    assertStringIncludes(html, "checked");
  });

  it("adds heading IDs and anchor links", async () => {
    const html = await render("# Introduction");
    assertStringIncludes(html, 'id="');
    assertStringIncludes(html, 'href="#introduction"');
    assertStringIncludes(html, "octicon-link");
  });

  it("renders code with starry-night by default", async () => {
    const html = await render("```js\nconst x = 1;\n```");
    assertStringIncludes(html, "<pre>");
    assertStringIncludes(html, "<code");
  });

  it("renders code with lowlight", async () => {
    const html = await render("```js\nconst x = 1;\n```", {
      highlighter: "lowlight",
    });
    assertStringIncludes(html, "<pre>");
    assertStringIncludes(html, "<code");
  });

  it("renders code with no highlighting", async () => {
    const html = await render("```js\nconst x = 1;\n```", {
      highlighter: "none",
    });
    assertStringIncludes(html, "<pre>");
    assertStringIncludes(html, "const x = 1;");
  });

  it("sanitizes HTML by default", async () => {
    const html = await render('<script>alert("xss")</script>');
    assertEquals(html.includes("<script>"), false);
  });

  it("renders math when enabled", async () => {
    const html = await render("$x^2$", { allowMath: true });
    assertStringIncludes(html, "<math");
  });
});

describe("renderWithMeta", () => {
  it("extracts TOC", async () => {
    const { toc } = await renderWithMeta("# Intro\n## Details");
    assertEquals(toc.length, 2);
    assertEquals(toc[0].text, "Intro");
    assertEquals(toc[0].depth, 1);
    assertEquals(toc[1].text, "Details");
    assertEquals(toc[1].depth, 2);
  });

  it("extracts frontmatter", async () => {
    const { frontmatter } = await renderWithMeta(
      "---\ntitle: Test\n---\n# Content",
    );
    assertEquals(frontmatter?.title, "Test");
  });

  it("returns null frontmatter when none exists", async () => {
    const { frontmatter } = await renderWithMeta("# Just content");
    assertEquals(frontmatter, null);
  });
});

describe("extractToc", () => {
  it("extracts table of contents", () => {
    const toc = extractToc("# First\n## Second\n# Third");
    assertEquals(toc.length, 3);
    assertEquals(toc[0], { text: "First", depth: 1, slug: "first" });
    assertEquals(toc[1], { text: "Second", depth: 2, slug: "second" });
  });

  it("handles duplicate headings", () => {
    const toc = extractToc("# Test\n# Test\n# Test");
    assertEquals(toc[0].slug, "test");
    assertEquals(toc[1].slug, "test-1");
    assertEquals(toc[2].slug, "test-2");
  });
});

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter", () => {
    const fm = parseFrontmatter("---\ntitle: Test\ncount: 42\n---\n# Content");
    assertEquals(fm?.title, "Test");
    assertEquals(fm?.count, 42);
  });

  it("returns null for no frontmatter", () => {
    assertEquals(parseFrontmatter("# Just content"), null);
  });

  it("returns null for invalid YAML", () => {
    assertEquals(parseFrontmatter("---\ninvalid: yaml: [\n---"), null);
  });
});

// =============================================================================
// Edge Case Tests
// =============================================================================

describe("edge cases: empty input", () => {
  it("handles empty string", async () => {
    const html = await render("");
    assertEquals(html, "");
  });

  it("handles whitespace-only input", async () => {
    const html = await render("   \n\t\n   ");
    assertEquals(html.trim(), "");
  });

  it("handles empty frontmatter", async () => {
    const { html, frontmatter } = await renderWithMeta("---\n---\n# Title");
    assertStringIncludes(html, "<h1");
    assertEquals(frontmatter, null);
  });

  it("extractToc returns empty array for empty input", () => {
    assertEquals(extractToc(""), []);
    assertEquals(extractToc("   \n\t\n   "), []);
  });

  it("parseFrontmatter returns null for empty input", () => {
    assertEquals(parseFrontmatter(""), null);
    assertEquals(parseFrontmatter("   \n\t\n   "), null);
  });
});

describe("edge cases: deeply nested structures", () => {
  it("handles deeply nested blockquotes", async () => {
    const nested = "> ".repeat(20) + "deep content";
    const html = await render(nested);
    assertStringIncludes(html, "<blockquote>");
    assertStringIncludes(html, "deep content");
  });

  it("handles deeply nested lists", async () => {
    let nested = "";
    for (let i = 0; i < 15; i++) {
      nested += "  ".repeat(i) + "- level " + i + "\n";
    }
    const html = await render(nested);
    assertStringIncludes(html, "<ul>");
    assertStringIncludes(html, "level 14");
  });

  it("handles nested mixed lists", async () => {
    const md = `
- item 1
  1. nested numbered
     - deeply nested bullet
       1. even deeper numbered
          - maximum depth
    `.trim();
    const html = await render(md);
    assertStringIncludes(html, "<ul>");
    assertStringIncludes(html, "<ol>");
  });

  it("handles deeply nested headings in TOC", () => {
    const md = `
# Level 1
## Level 2
### Level 3
#### Level 4
##### Level 5
###### Level 6
    `.trim();
    const toc = extractToc(md);
    assertEquals(toc.length, 6);
    assertEquals(toc[5].depth, 6);
  });

  it("handles complex nested table structure", async () => {
    const md = `
| A | B |
|---|---|
| **bold _nested italic_** | \`code\` |
| [link](url) | ~~strike~~ |
| a | b |
    `.trim();
    const html = await render(md);
    assertStringIncludes(html, "<table>");
    assertStringIncludes(html, "<strong>");
    assertStringIncludes(html, "<em>");
  });
});

describe("edge cases: very large documents", () => {
  it("handles large document with many headings", async () => {
    const sections = Array.from(
      { length: 100 },
      (_, i) => `# Heading ${i}\n\nParagraph ${i}.`,
    );
    const md = sections.join("\n\n");
    const { html, toc } = await renderWithMeta(md);
    assertEquals(toc.length, 100);
    assertStringIncludes(html, "Heading 99");
  });

  it("handles very long lines", async () => {
    const longLine = "word ".repeat(10000);
    const html = await render(longLine);
    assertStringIncludes(html, "<p>");
    assertEquals(html.includes("word"), true);
  });

  it("handles many paragraphs", async () => {
    const paragraphs = Array.from({ length: 500 }, (_, i) => `Paragraph ${i}.`);
    const md = paragraphs.join("\n\n");
    const html = await render(md);
    assertStringIncludes(html, "Paragraph 499");
  });

  it("handles large code block", async () => {
    const codeLines = Array.from(
      { length: 1000 },
      (_, i) => `const line${i} = ${i};`,
    );
    const md = "```js\n" + codeLines.join("\n") + "\n```";
    const html = await render(md, { highlighter: "lowlight" });
    assertStringIncludes(html, "<pre>");
    assertStringIncludes(html, "line999");
  });

  it("handles large table", async () => {
    const header = "| " +
      Array.from({ length: 10 }, (_, i) => `Col${i}`).join(" | ") +
      " |";
    const divider = "| " + Array.from({ length: 10 }, () => "---").join(" | ") +
      " |";
    const rows = Array.from(
      { length: 100 },
      (_, row) =>
        "| " + Array.from({ length: 10 }, (_, col) =>
          `R${row}C${col}`).join(" | ") +
        " |",
    );
    const md = [header, divider, ...rows].join("\n");
    const html = await render(md);
    assertStringIncludes(html, "R99C9");
  });
});

describe("edge cases: malformed/weird input", () => {
  it("handles unclosed formatting", async () => {
    const html = await render("**bold without close");
    assertStringIncludes(html, "bold without close");
  });

  it("handles mismatched formatting", async () => {
    const html = await render("**bold _italic** wrong_");
    // Should not throw, output may vary
    assertEquals(typeof html, "string");
  });

  it("handles unclosed code blocks", async () => {
    const html = await render("```js\nconst x = 1;");
    // Should render something reasonable (syntax highlighting wraps tokens in spans)
    assertStringIncludes(html, "<pre>");
    assertStringIncludes(html, "<code");
  });

  it("handles malformed tables", async () => {
    const html = await render("| A | B\n|---\n| 1 | 2 | 3 | 4 |");
    // Should not throw
    assertEquals(typeof html, "string");
  });

  it("handles orphan list markers", async () => {
    const html = await render("-\n-\n-\n");
    assertStringIncludes(html, "<ul>");
  });

  it("handles broken links", async () => {
    const html = await render("[link](");
    assertEquals(typeof html, "string");
  });

  it("handles broken images", async () => {
    const html = await render("![alt](");
    assertEquals(typeof html, "string");
  });

  it("handles excessive whitespace", async () => {
    const html = await render("# Title\n\n\n\n\n\n\n\n\n\nContent");
    assertStringIncludes(html, "<h1");
    assertStringIncludes(html, "Content");
  });

  it("handles tabs mixed with spaces", async () => {
    const html = await render(
      "- item\n\t- nested with tab\n    - nested with spaces",
    );
    assertStringIncludes(html, "<ul>");
  });

  it("handles frontmatter without closing", async () => {
    const { frontmatter } = await renderWithMeta(
      "---\ntitle: Test\n# Not closed",
    );
    // Should handle gracefully
    assertEquals(frontmatter, null);
  });

  it("handles null bytes", async () => {
    const html = await render("Hello\x00World");
    assertEquals(typeof html, "string");
  });

  it("handles only frontmatter markers", async () => {
    const { html, frontmatter } = await renderWithMeta("---\n---");
    assertEquals(frontmatter, null);
    assertEquals(html.trim(), "");
  });
});

describe("edge cases: unicode", () => {
  it("handles emoji in text", async () => {
    const html = await render("# Hello 👋 World 🌍");
    assertStringIncludes(html, "👋");
    assertStringIncludes(html, "🌍");
  });

  it("handles emoji in heading slugs", () => {
    const toc = extractToc("# Hello 👋 World");
    assertEquals(toc[0].slug, "hello--world");
  });

  it("handles CJK characters", async () => {
    const html = await render("# 你好世界\n\nこんにちは\n\n안녕하세요");
    assertStringIncludes(html, "你好世界");
    assertStringIncludes(html, "こんにちは");
    assertStringIncludes(html, "안녕하세요");
  });

  it("handles RTL text (Arabic/Hebrew)", async () => {
    const html = await render("# مرحبا بالعالم\n\nשלום עולם");
    assertStringIncludes(html, "مرحبا");
    assertStringIncludes(html, "שלום");
  });

  it("handles combining characters", async () => {
    const html = await render("café résumé naïve");
    assertStringIncludes(html, "café");
    assertStringIncludes(html, "résumé");
  });

  it("handles zero-width characters", async () => {
    const html = await render("Hello\u200BWorld\u200CTest\u200DEnd");
    // Should preserve or handle gracefully
    assertEquals(typeof html, "string");
  });

  it("handles mathematical symbols", async () => {
    const html = await render("∀x∈ℝ: x² ≥ 0, ∑∏∫∂√∞");
    assertStringIncludes(html, "∀");
    assertStringIncludes(html, "∞");
  });

  it("handles unicode in code blocks", async () => {
    const html = await render("```\nconst greeting = '你好';\n```", {
      highlighter: "lowlight",
    });
    assertStringIncludes(html, "你好");
  });

  it("handles unicode in frontmatter", () => {
    const fm = parseFrontmatter(
      "---\ntitle: 日本語タイトル\nauthor: 作者名\n---",
    );
    assertEquals(fm?.title, "日本語タイトル");
    assertEquals(fm?.author, "作者名");
  });

  it("handles mixed script headings in TOC", () => {
    const md = "# English\n## 中文\n### 日本語\n#### Émoji 🎉";
    const toc = extractToc(md);
    assertEquals(toc.length, 4);
    assertEquals(toc[1].text, "中文");
    assertEquals(toc[2].text, "日本語");
  });

  it("handles special unicode categories", async () => {
    // Currency, arrows, box drawing
    const html = await render("€ £ ¥ ₿ → ← ↑ ↓ ╔══╗");
    assertStringIncludes(html, "€");
    assertStringIncludes(html, "→");
    assertStringIncludes(html, "╔");
  });

  it("handles skin tone modifiers", async () => {
    const html = await render("👋🏻 👋🏽 👋🏿");
    assertStringIncludes(html, "👋🏻");
    assertStringIncludes(html, "👋🏿");
  });

  it("handles flag emoji", async () => {
    const html = await render("🇺🇸 🇯🇵 🇩🇪 🇫🇷");
    assertStringIncludes(html, "🇺🇸");
    assertStringIncludes(html, "🇯🇵");
  });
});

describe("edge cases: special markdown patterns", () => {
  it("handles backslash escapes", async () => {
    const html = await render("\\*not bold\\* \\[not link\\]");
    assertStringIncludes(html, "*not bold*");
    assertStringIncludes(html, "[not link]");
  });

  it("handles HTML entities", async () => {
    const html = await render("&amp; &lt; &gt; &quot;");
    // After rendering, entities should be preserved or decoded
    assertEquals(typeof html, "string");
  });

  it("handles inline code with backticks inside", async () => {
    const html = await render("`` `code` ``");
    assertStringIncludes(html, "`code`");
  });

  it("handles multiple horizontal rules", async () => {
    const html = await render("---\n***\n___");
    const count = (html.match(/<hr/g) || []).length;
    assertEquals(count, 3);
  });

  it("handles image with title", async () => {
    const html = await render('![alt text](image.png "title text")');
    assertStringIncludes(html, 'alt="alt text"');
    assertStringIncludes(html, 'title="title text"');
  });

  it("handles reference-style links", async () => {
    const html = await render("[example][1]\n\n[1]: https://example.com");
    assertStringIncludes(html, 'href="https://example.com"');
  });

  it("handles footnote-style text", async () => {
    // Standard GFM doesn't support footnotes, should pass through
    const html = await render("[^1]: footnote text");
    assertEquals(typeof html, "string");
  });

  it("handles setext headings", async () => {
    const html = await render("Heading 1\n=========\n\nHeading 2\n---------");
    const h1Count = (html.match(/<h1/g) || []).length;
    const h2Count = (html.match(/<h2/g) || []).length;
    assertEquals(h1Count, 1);
    assertEquals(h2Count, 1);
  });

  it("handles indented code blocks", async () => {
    const html = await render("    const x = 1;\n    const y = 2;");
    assertStringIncludes(html, "<pre>");
    assertStringIncludes(html, "const x = 1");
  });
});

describe("code block wrapper", () => {
  it("wraps fenced code with language in .highlight with header (starry-night)", async () => {
    const html = await render("```js\nconst x = 1;\n```");
    assertStringIncludes(html, '<div class="highlight">');
    assertStringIncludes(html, '<div class="code-header">');
    assertStringIncludes(html, '<span class="code-lang">js</span>');
    assertStringIncludes(html, "<pre>");
  });

  it("wraps fenced code with language in .highlight with header (lowlight)", async () => {
    const html = await render("```js\nconst x = 1;\n```", {
      highlighter: "lowlight",
    });
    assertStringIncludes(html, '<div class="highlight">');
    assertStringIncludes(html, '<div class="code-header">');
    assertStringIncludes(html, '<span class="code-lang">js</span>');
    assertStringIncludes(html, "<pre>");
  });

  it("wraps fenced code with language in .highlight with header (none)", async () => {
    const html = await render("```js\nconst x = 1;\n```", {
      highlighter: "none",
    });
    assertStringIncludes(html, '<div class="highlight">');
    assertStringIncludes(html, '<div class="code-header">');
    assertStringIncludes(html, '<span class="code-lang">js</span>');
    assertStringIncludes(html, "<pre>");
  });

  it("wraps fenced code without language in .highlight without header", async () => {
    const html = await render("```\nconst x = 1;\n```", {
      highlighter: "none",
    });
    assertStringIncludes(html, '<div class="highlight">');
    assertEquals(html.includes("code-header"), false);
    assertEquals(html.includes("code-lang"), false);
    assertStringIncludes(html, "<pre>");
  });

  it("wraps indented code blocks in .highlight without header", async () => {
    const html = await render("    const x = 1;\n    const y = 2;", {
      highlighter: "none",
    });
    assertStringIncludes(html, '<div class="highlight">');
    assertEquals(html.includes("code-header"), false);
    assertStringIncludes(html, "<pre>");
  });

  it("wrapper survives with sanitization enabled", async () => {
    const html = await render("```js\nconst x = 1;\n```", {
      highlighter: "none",
    });
    assertStringIncludes(html, '<div class="highlight">');
    assertStringIncludes(html, '<div class="code-header">');
    assertStringIncludes(html, '<span class="code-lang">js</span>');
  });

  it("wrapper survives with sanitization disabled", async () => {
    const html = await render("```js\nconst x = 1;\n```", {
      highlighter: "none",
      disableHtmlSanitization: true,
    });
    assertStringIncludes(html, '<div class="highlight">');
    assertStringIncludes(html, '<div class="code-header">');
    assertStringIncludes(html, '<span class="code-lang">js</span>');
  });
});

describe("GitHub alerts", () => {
  const alertTypes = [
    "NOTE",
    "TIP",
    "IMPORTANT",
    "WARNING",
    "CAUTION",
  ] as const;

  for (const type of alertTypes) {
    it(`renders ${type} alert`, async () => {
      const html = await render(
        `> [!${type}]\n> Some ${type.toLowerCase()} content`,
      );
      assertStringIncludes(html, "markdown-alert");
      assertStringIncludes(html, `markdown-alert-${type.toLowerCase()}`);
      assertStringIncludes(html, `${type.toLowerCase()} content`);
    });
  }

  it("alert title text is present", async () => {
    const html = await render("> [!NOTE]\n> info");
    assertStringIncludes(html, "markdown-alert-title");
    assertStringIncludes(html, "Note");
  });

  it("alert icons survive sanitization", async () => {
    const html = await render("> [!NOTE]\n> info");
    assertStringIncludes(html, "<svg");
    assertStringIncludes(html, "<path");
  });

  it("alerts survive sanitization", async () => {
    const html = await render("> [!WARNING]\n> be careful");
    assertStringIncludes(html, "markdown-alert");
    assertStringIncludes(html, "markdown-alert-title");
    assertStringIncludes(html, "be careful");
  });
});

describe("allowIframes", () => {
  it("strips iframes by default", async () => {
    const html = await render('<iframe src="https://example.com"></iframe>');
    assertEquals(html.includes("<iframe"), false);
  });

  it("allows iframes when enabled", async () => {
    const html = await render('<iframe src="https://example.com"></iframe>', {
      allowIframes: true,
    });
    assertStringIncludes(html, "<iframe");
    assertStringIncludes(html, 'src="https://example.com"');
  });

  it("only allows safe iframe attributes", async () => {
    const html = await render(
      '<iframe src="https://example.com" onload="alert(1)" width="100" height="50"></iframe>',
      { allowIframes: true },
    );
    assertStringIncludes(html, 'src="https://example.com"');
    assertStringIncludes(html, 'width="100"');
    assertStringIncludes(html, 'height="50"');
    assertEquals(html.includes("onload"), false);
  });
});

describe("video/audio URL resolution", () => {
  it("resolves relative video src", async () => {
    const html = await render('<video src="video.mp4"></video>', {
      baseUrl: "https://example.com/media/",
      disableHtmlSanitization: true,
    });
    assertStringIncludes(html, 'src="https://example.com/media/video.mp4"');
  });

  it("resolves relative audio src", async () => {
    const html = await render('<audio src="podcast.mp3"></audio>', {
      baseUrl: "https://example.com/media/",
      disableHtmlSanitization: true,
    });
    assertStringIncludes(html, 'src="https://example.com/media/podcast.mp3"');
  });

  it("resolves source element src inside video", async () => {
    const html = await render(
      '<video><source src="clip.mp4"></video>',
      {
        baseUrl: "https://example.com/media/",
        disableHtmlSanitization: true,
      },
    );
    assertStringIncludes(html, 'src="https://example.com/media/clip.mp4"');
  });

  it("preserves absolute video URLs", async () => {
    const html = await render(
      '<video src="https://cdn.example.com/video.mp4"></video>',
      {
        baseUrl: "https://example.com/media/",
        disableHtmlSanitization: true,
      },
    );
    assertStringIncludes(html, 'src="https://cdn.example.com/video.mp4"');
  });
});

describe("inline rendering", () => {
  it("strips <p> wrapping", async () => {
    const md = "Hello **world**";
    const block = await render(md);
    const inline = await render(md, { inline: true });

    assertStringIncludes(block, "<p>");
    assertEquals(inline.includes("<p>"), false);
    assertEquals(inline.includes("</p>"), false);

    // Both preserve formatting
    assertStringIncludes(block, "<strong>world</strong>");
    assertStringIncludes(inline, "<strong>world</strong>");
  });

  it("strips <p> from plain text", async () => {
    const md = "Just text";
    const block = await render(md);
    const inline = await render(md, { inline: true });

    assertStringIncludes(block, "<p>Just text</p>");
    assertEquals(inline.trim(), "Just text");
  });

  it("preserves inline formatting without wrapping", async () => {
    const md = "**bold** and _italic_ and `code`";
    const block = await render(md);
    const inline = await render(md, { inline: true });

    assertStringIncludes(block, "<p>");
    assertEquals(inline.includes("<p>"), false);

    // Both have the same inline elements
    for (const html of [block, inline]) {
      assertStringIncludes(html, "<strong>bold</strong>");
      assertStringIncludes(html, "<em>italic</em>");
      assertStringIncludes(html, "<code>code</code>");
    }
  });

  it("strips <p> from links", async () => {
    const md = "[link](https://example.com)";
    const block = await render(md);
    const inline = await render(md, { inline: true });

    assertStringIncludes(block, "<p>");
    assertEquals(inline.includes("<p>"), false);
    for (const html of [block, inline]) {
      assertStringIncludes(html, 'href="https://example.com"');
    }
  });

  it("strips <p> from multiple paragraphs", async () => {
    const md = "First paragraph\n\nSecond paragraph";
    const block = await render(md);
    const inline = await render(md, { inline: true });

    assertStringIncludes(block, "<p>First paragraph</p>");
    assertStringIncludes(block, "<p>Second paragraph</p>");
    assertEquals(inline.includes("<p>"), false);
    assertStringIncludes(inline, "First paragraph");
    assertStringIncludes(inline, "Second paragraph");
  });

  it("only strips <p>, not other block elements", async () => {
    const md = "# Heading\n\nParagraph";
    const block = await render(md);
    const inline = await render(md, { inline: true });

    // Both keep the heading
    assertStringIncludes(block, "<h1");
    assertStringIncludes(inline, "<h1");

    // Only block keeps the <p>
    assertStringIncludes(block, "<p>Paragraph</p>");
    assertEquals(inline.includes("<p>"), false);
    assertStringIncludes(inline, "Paragraph");
  });
});

describe("emoji shortcodes", () => {
  it("converts :wave: to emoji", async () => {
    const html = await render("Hello :wave:");
    assertStringIncludes(html, "👋");
  });

  it("converts multiple emojis", async () => {
    const html = await render(":heart: :smile: :+1:");
    assertStringIncludes(html, "❤️");
    assertStringIncludes(html, "😄");
    assertStringIncludes(html, "👍");
  });

  it("can disable emoji conversion", async () => {
    const html = await render("Hello :wave:", { allowEmoji: false });
    assertStringIncludes(html, ":wave:");
    assertEquals(html.includes("👋"), false);
  });
});

describe("baseUrl", () => {
  it("resolves relative link URLs", async () => {
    const html = await render("[Link](./page.md)", {
      baseUrl: "https://example.com/docs/",
    });
    assertStringIncludes(html, 'href="https://example.com/docs/page.md"');
  });

  it("resolves relative image URLs", async () => {
    const html = await render("![Image](./img/logo.png)", {
      baseUrl: "https://example.com/docs/",
    });
    assertStringIncludes(html, 'src="https://example.com/docs/img/logo.png"');
  });

  it("preserves absolute URLs", async () => {
    const html = await render("[Link](https://other.com/page)", {
      baseUrl: "https://example.com/docs/",
    });
    assertStringIncludes(html, 'href="https://other.com/page"');
  });

  it("preserves fragment URLs", async () => {
    const html = await render("[Link](#section)", {
      baseUrl: "https://example.com/docs/",
    });
    assertStringIncludes(html, 'href="#section"');
  });

  it("resolves root-relative URLs", async () => {
    const html = await render("[Link](/absolute/path)", {
      baseUrl: "https://example.com/docs/",
    });
    assertStringIncludes(html, 'href="https://example.com/absolute/path"');
  });

  it("handles baseUrl without trailing slash", async () => {
    const html = await render("[Link](./page.md)", {
      baseUrl: "https://example.com/docs",
    });
    assertStringIncludes(html, 'href="https://example.com/docs/page.md"');
  });
});

describe("custom plugins", () => {
  it("accepts custom remark plugins", async () => {
    // Simple remark plugin that adds a class to all paragraphs
    const remarkAddMeta = () => (tree: MdastRoot) => {
      for (const node of tree.children) {
        if (node.type === "paragraph") {
          const para = node as Paragraph & { data?: { hProperties?: unknown } };
          para.data = para.data || {};
          para.data.hProperties = { className: ["custom-para"] };
        }
      }
    };

    const html = await render("Hello world", {
      remarkPlugins: [remarkAddMeta],
      disableHtmlSanitization: true, // class won't survive sanitization
    });
    assertStringIncludes(html, 'class="custom-para"');
  });

  it("accepts custom rehype plugins", async () => {
    // Simple rehype plugin that adds data-processed attribute
    const rehypeAddAttr = () => (tree: HastRoot) => {
      const visit = (node: HastRoot | Element) => {
        if (node.type === "element" && node.tagName === "p") {
          node.properties = node.properties || {};
          node.properties.dataProcessed = "true";
        }
        if ("children" in node) {
          for (const child of node.children) {
            if (child.type === "element") visit(child);
          }
        }
      };
      visit(tree);
    };

    const html = await render("Hello world", {
      rehypePlugins: [rehypeAddAttr],
      disableHtmlSanitization: true,
    });
    assertStringIncludes(html, 'data-processed="true"');
  });

  it("accepts plugins with options as tuples", async () => {
    // Plugin that wraps content in a custom element
    const rehypeWrapper = (opts: { wrapper: string }) => (tree: HastRoot) => {
      const visit = (node: HastRoot | Element) => {
        if (node.type === "element" && node.tagName === "p") {
          node.properties = node.properties || {};
          node.properties.dataWrapper = opts.wrapper;
        }
        if ("children" in node) {
          for (const child of node.children) {
            if (child.type === "element") visit(child);
          }
        }
      };
      visit(tree);
    };

    const html = await render("Hello world", {
      rehypePlugins: [[rehypeWrapper, { wrapper: "custom-box" }]],
      disableHtmlSanitization: true,
    });
    assertStringIncludes(html, 'data-wrapper="custom-box"');
  });

  it("runs remark plugins before rehype plugins", async () => {
    const order: string[] = [];

    const remarkLogger = () => (_tree: MdastRoot) => {
      order.push("remark");
    };

    const rehypeLogger = () => (_tree: HastRoot) => {
      order.push("rehype");
    };

    await render("test", {
      remarkPlugins: [remarkLogger],
      rehypePlugins: [rehypeLogger],
    });

    assertEquals(order, ["remark", "rehype"]);
  });

  it("can combine multiple plugins", async () => {
    const addClassA = () => (tree: HastRoot) => {
      const visit = (node: HastRoot | Element) => {
        if (node.type === "element" && node.tagName === "p") {
          node.properties = node.properties || {};
          const classes = node.properties.className;
          node.properties.className = [
            ...(Array.isArray(classes) ? classes : []),
            "class-a",
          ];
        }
        if ("children" in node) {
          for (const child of node.children) {
            if (child.type === "element") visit(child);
          }
        }
      };
      visit(tree);
    };

    const addClassB = () => (tree: HastRoot) => {
      const visit = (node: HastRoot | Element) => {
        if (node.type === "element" && node.tagName === "p") {
          node.properties = node.properties || {};
          const classes = node.properties.className;
          node.properties.className = [
            ...(Array.isArray(classes) ? classes : []),
            "class-b",
          ];
        }
        if ("children" in node) {
          for (const child of node.children) {
            if (child.type === "element") visit(child);
          }
        }
      };
      visit(tree);
    };

    const html = await render("Hello", {
      rehypePlugins: [addClassA, addClassB],
      disableHtmlSanitization: true,
    });
    assertStringIncludes(html, "class-a");
    assertStringIncludes(html, "class-b");
  });
});

describe("baseUrl validation", () => {
  it("rejects malformed baseUrl", async () => {
    await assertRejects(
      () => render("# Hello", { baseUrl: "not a url" }),
      Error,
      "Invalid baseUrl",
    );
  });

  it("rejects empty-string baseUrl", async () => {
    await assertRejects(
      () => render("# Hello", { baseUrl: "" }),
      Error,
      "Invalid baseUrl",
    );
  });

  it("accepts valid http baseUrl", async () => {
    const html = await render("[link](./page)", {
      baseUrl: "https://example.com/docs/",
    });
    assertStringIncludes(html, 'href="https://example.com/docs/page"');
  });

  it("includes the bad URL in the error message", async () => {
    await assertRejects(
      () => render("test", { baseUrl: "://broken" }),
      Error,
      "://broken",
    );
  });
});

// =============================================================================
// Cache Management Tests
// =============================================================================

describe("clearCache", () => {
  it("is callable without error", () => {
    clearCache();
  });

  it("renders still work after clearing", async () => {
    clearCache();
    const html = await render("# Hello");
    assertStringIncludes(html, "<h1");
    assertStringIncludes(html, "Hello");
  });

  it("can be called multiple times", () => {
    clearCache();
    clearCache();
    clearCache();
  });
});

describe("warmup", () => {
  it("pre-warms default (starry-night) processor", async () => {
    clearCache();
    await warmup();
    // Subsequent render should succeed
    const html = await render("```js\nconst x = 1;\n```");
    assertStringIncludes(html, "<pre>");
  });

  it("pre-warms specific highlighter config", async () => {
    clearCache();
    await warmup({ highlighter: "lowlight" });
    const html = await render("```js\nconst x = 1;\n```", {
      highlighter: "lowlight",
    });
    assertStringIncludes(html, "<pre>");
  });

  it("pre-warms with math enabled", async () => {
    clearCache();
    await warmup({ allowMath: true });
    const html = await render("$x^2$", { allowMath: true });
    assertStringIncludes(html, "<math");
  });
});

// =============================================================================
// renderWithMeta Regression Tests
// =============================================================================

describe("renderWithMeta regression", () => {
  const testDoc = `---
title: Test Document
author: Jane Doe
tags:
  - markdown
  - test
---

# Introduction

Welcome to the test document.

## Getting Started

Here is how you get started.

### Prerequisites

You need Deno installed.

## Conclusion

That's all folks.
`;

  it("HTML output matches render() for same input", async () => {
    const opts = { highlighter: "lowlight" as const };
    const renderHtml = await render(testDoc, opts);
    const { html: metaHtml } = await renderWithMeta(testDoc, opts);
    assertEquals(metaHtml, renderHtml);
  });

  it("TOC matches extractToc() results", async () => {
    const { toc: metaToc } = await renderWithMeta(testDoc, {
      highlighter: "lowlight",
    });
    const standaloneToc = extractToc(testDoc);

    assertEquals(metaToc.length, standaloneToc.length);
    for (let i = 0; i < metaToc.length; i++) {
      assertEquals(metaToc[i].text, standaloneToc[i].text);
      assertEquals(metaToc[i].depth, standaloneToc[i].depth);
      assertEquals(metaToc[i].slug, standaloneToc[i].slug);
    }
  });

  it("frontmatter matches parseFrontmatter() results", async () => {
    const { frontmatter: metaFm } = await renderWithMeta(testDoc, {
      highlighter: "lowlight",
    });
    const standaloneFm = parseFrontmatter(testDoc);

    assertEquals(metaFm, standaloneFm);
  });

  it("returns empty TOC for doc without headings", async () => {
    const { toc } = await renderWithMeta("Just a paragraph.", {
      highlighter: "lowlight",
    });
    assertEquals(toc, []);
  });

  it("returns null frontmatter when none exists", async () => {
    const { frontmatter } = await renderWithMeta("# No frontmatter", {
      highlighter: "lowlight",
    });
    assertEquals(frontmatter, null);
  });
});
