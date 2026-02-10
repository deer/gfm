import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import {
  extractCssClasses,
  extractCssVariableDefinitions,
  extractCssVariableRefs,
  rewriteKatexFontUrls,
} from "./build.ts";

import { COMBINED_CSS, CSS, HIGHLIGHT_CSS, KATEX_CSS } from "../style.ts";

// =============================================================================
// Unit tests for build utility functions
// =============================================================================

describe("extractCssVariableRefs", () => {
  it("extracts CSS custom property references", () => {
    const css =
      `.test { color: var(--color-fg-default); background: var(--color-canvas-subtle); }`;
    const refs = extractCssVariableRefs(css);
    assertEquals(refs.has("--color-fg-default"), true);
    assertEquals(refs.has("--color-canvas-subtle"), true);
    assertEquals(refs.size, 2);
  });

  it("extracts from fallback patterns", () => {
    const css = `color: var(--fgColor-default, var(--color-fg-default));`;
    const refs = extractCssVariableRefs(css);
    assertEquals(refs.has("--fgColor-default"), true);
    assertEquals(refs.has("--color-fg-default"), true);
  });

  it("returns empty set for no variables", () => {
    const refs = extractCssVariableRefs(`.test { color: red; }`);
    assertEquals(refs.size, 0);
  });

  it("handles multiple occurrences of same variable", () => {
    const css = `.a { color: var(--x); } .b { color: var(--x); }`;
    const refs = extractCssVariableRefs(css);
    assertEquals(refs.size, 1);
    assertEquals(refs.has("--x"), true);
  });
});

describe("extractCssVariableDefinitions", () => {
  it("extracts variable definitions", () => {
    const css = `:root { --color-fg: #1f2328; --color-bg: #fff; }`;
    const defs = extractCssVariableDefinitions(css);
    assertEquals(defs.get("--color-fg"), "#1f2328");
    assertEquals(defs.get("--color-bg"), "#fff");
    assertEquals(defs.size, 2);
  });

  it("handles complex values", () => {
    const css = `:root { --shadow: 0 1px 2px rgba(0,0,0,.1); }`;
    const defs = extractCssVariableDefinitions(css);
    assertEquals(defs.get("--shadow"), "0 1px 2px rgba(0,0,0,.1)");
  });

  it("returns empty map for no definitions", () => {
    const defs = extractCssVariableDefinitions(`.test { color: red; }`);
    assertEquals(defs.size, 0);
  });
});

describe("rewriteKatexFontUrls", () => {
  it("rewrites relative font paths to CDN URLs", () => {
    const css = `url(fonts/KaTeX_Main-Regular.woff2)`;
    const result = rewriteKatexFontUrls(css, "https://cdn.example.com/dist");
    assertStringIncludes(
      result,
      "https://cdn.example.com/dist/fonts/KaTeX_Main-Regular.woff2",
    );
  });

  it("rewrites all occurrences", () => {
    const css = `url(fonts/A.woff2) url(fonts/B.woff)`;
    const result = rewriteKatexFontUrls(css, "https://cdn.example.com");
    // No bare relative "fonts/" paths remain (all prefixed with CDN URL)
    assertEquals(result.includes("url(fonts/"), false);
    assertStringIncludes(result, "https://cdn.example.com/fonts/A.woff2");
    assertStringIncludes(result, "https://cdn.example.com/fonts/B.woff");
  });
});

describe("extractCssClasses", () => {
  it("extracts class names from CSS selectors", () => {
    const css = `.katex { font: normal; } .katex-display { display: block; }`;
    const classes = extractCssClasses(css);
    assertEquals(classes.includes("katex"), true);
    assertEquals(classes.includes("katex-display"), true);
  });

  it("deduplicates class names", () => {
    const css = `.foo { color: red; } .bar .foo { display: block; }`;
    const classes = extractCssClasses(css);
    const fooCount = classes.filter((c) => c === "foo").length;
    assertEquals(fooCount, 1);
  });

  it("returns empty for CSS with no classes", () => {
    const css = `div { color: red; }`;
    const classes = extractCssClasses(css);
    assertEquals(classes.length, 0);
  });
});

// =============================================================================
// Generated style.ts validation tests
// =============================================================================

describe("generated CSS export", () => {
  it("contains base size variables", () => {
    assertStringIncludes(CSS, "--base-size-16");
    assertStringIncludes(CSS, "--base-size-24");
    assertStringIncludes(CSS, "--base-text-weight-semibold");
  });

  it("contains light theme color variables", () => {
    assertStringIncludes(CSS, "--fgColor-default");
    assertStringIncludes(CSS, "--bgColor-default");
    assertStringIncludes(CSS, "--borderColor-default");
  });

  it("contains dark theme variables", () => {
    assertStringIncludes(CSS, ".dark{");
  });

  it("contains prefers-color-scheme media query", () => {
    assertStringIncludes(CSS, "prefers-color-scheme:dark");
  });

  it("contains prettylights syntax variables", () => {
    assertStringIncludes(CSS, "--color-prettylights-syntax-comment");
    assertStringIncludes(CSS, "--color-prettylights-syntax-keyword");
    assertStringIncludes(CSS, "--color-prettylights-syntax-string");
    assertStringIncludes(CSS, "--color-prettylights-syntax-entity");
  });

  it("contains markdown-body styles", () => {
    assertStringIncludes(CSS, ".markdown-body{");
    assertStringIncludes(CSS, "font-family:");
    assertStringIncludes(CSS, "word-wrap:break-word");
  });

  it("contains heading styles", () => {
    assertStringIncludes(CSS, ".markdown-body h1");
    assertStringIncludes(CSS, ".markdown-body h2");
    assertStringIncludes(CSS, "font-size:2em");
    assertStringIncludes(CSS, "font-size:1.5em");
  });

  it("contains code block styles", () => {
    assertStringIncludes(CSS, ".markdown-body pre");
    assertStringIncludes(CSS, ".markdown-body code");
    assertStringIncludes(CSS, ".highlight");
  });

  it("contains table styles", () => {
    assertStringIncludes(CSS, ".markdown-body table");
    assertStringIncludes(CSS, "tabular-nums");
  });

  it("contains starry-night token styles", () => {
    assertStringIncludes(CSS, ".pl-c{");
    assertStringIncludes(CSS, ".pl-k{");
    assertStringIncludes(CSS, ".pl-s,");
    assertStringIncludes(CSS, ".pl-en{");
  });

  it("contains footnote styles", () => {
    assertStringIncludes(CSS, ".footnotes");
    assertStringIncludes(CSS, "data-footnote-ref");
  });
});

describe("generated HIGHLIGHT_CSS export", () => {
  it("contains hljs base styles", () => {
    assertStringIncludes(HIGHLIGHT_CSS, ".hljs{");
  });

  it("contains hljs token classes", () => {
    assertStringIncludes(HIGHLIGHT_CSS, ".hljs-keyword");
    assertStringIncludes(HIGHLIGHT_CSS, ".hljs-string");
    assertStringIncludes(HIGHLIGHT_CSS, ".hljs-comment");
    assertStringIncludes(HIGHLIGHT_CSS, ".hljs-title");
  });

  it("uses prettylights CSS variables", () => {
    assertStringIncludes(
      HIGHLIGHT_CSS,
      "var(--color-prettylights-syntax-keyword)",
    );
    assertStringIncludes(
      HIGHLIGHT_CSS,
      "var(--color-prettylights-syntax-string)",
    );
  });
});

describe("generated KATEX_CSS export", () => {
  it("contains font-face declarations", () => {
    assertStringIncludes(KATEX_CSS, "@font-face");
    assertStringIncludes(KATEX_CSS, "KaTeX_Main");
  });

  it("has CDN font URLs (not relative)", () => {
    assertStringIncludes(KATEX_CSS, "cdn.jsdelivr.net");
    assertEquals(KATEX_CSS.includes("url(fonts/"), false);
  });

  it("contains katex display styles", () => {
    assertStringIncludes(KATEX_CSS, ".katex");
    assertStringIncludes(KATEX_CSS, ".katex-display");
  });
});

describe("generated COMBINED_CSS export", () => {
  it("includes all three CSS sections", () => {
    assertStringIncludes(COMBINED_CSS, ".markdown-body");
    assertStringIncludes(COMBINED_CSS, ".hljs");
    assertStringIncludes(COMBINED_CSS, "KaTeX");
  });

  it("is the concatenation of CSS + HIGHLIGHT_CSS + KATEX_CSS", () => {
    assertEquals(COMBINED_CSS, `${CSS}\n${HIGHLIGHT_CSS}\n${KATEX_CSS}`);
  });
});
