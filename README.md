# @deer/gfm

GitHub Flavored Markdown rendering for Deno, built on the
[unified](https://unifiedjs.com/) ecosystem.

## Features

- **GitHub Flavored Markdown** — Tables, strikethrough, autolinks, task lists
- **Syntax highlighting** — Choose between:
  - `starry-night` — GitHub's actual highlighter (accurate, heavier)
  - `lowlight` — highlight.js-based (faster, lighter)
- **Table of contents** — Auto-extracted with slugified IDs
- **YAML frontmatter** — Parsed and returned separately
- **Math rendering** — KaTeX support for `$inline$` and `$$display$$` math
- **Anchor links** — GitHub-style heading links with SVG icons
- **HTML sanitization** — Safe by default, blocks XSS vectors
- **Processor caching** — Reuses compiled pipelines for performance

## Installation

```ts
import { render } from "jsr:@deer/gfm";
```

Or add to your `deno.json`:

```json
{
  "imports": {
    "@deer/gfm": "jsr:@deer/gfm@^0.1"
  }
}
```

## Quick Start

```ts
import { render } from "@deer/gfm";

const html = await render("# Hello **world**");
// <h1 id="hello-world"><a href="#hello-world" ...>...</a>Hello <strong>world</strong></h1>
```

## API Reference

### `render(markdown, options?)`

Render GitHub Flavored Markdown to HTML.

```ts
const html = await render(markdown: string, options?: RenderOptions): Promise<string>
```

**Example:**

```ts
// Basic rendering
const html = await render("# Hello **world**");

// With lowlight (faster)
const html = await render(code, { highlighter: "lowlight" });

// With math support
const html = await render("$E = mc^2$", { allowMath: true });
```

### `renderWithMeta(markdown, options?)`

Render markdown and extract metadata (table of contents, frontmatter).

```ts
const result = await renderWithMeta(markdown: string, options?: RenderOptions): Promise<RenderResult>
```

**Returns:**

```ts
interface RenderResult {
  html: string; // Rendered HTML
  toc: TocEntry[]; // Table of contents
  frontmatter: Record<string, unknown> | null; // Parsed YAML frontmatter
}

interface TocEntry {
  text: string; // Heading text
  depth: number; // Heading level (1-6)
  slug: string; // ID for linking
}
```

**Example:**

```ts
const { html, toc, frontmatter } = await renderWithMeta(`---
title: My Document
author: Jane Doe
---

# Introduction

Some content here.

## Getting Started

More content.
`);

console.log(frontmatter);
// { title: "My Document", author: "Jane Doe" }

console.log(toc);
// [
//   { text: "Introduction", depth: 1, slug: "introduction" },
//   { text: "Getting Started", depth: 2, slug: "getting-started" }
// ]
```

### `extractToc(markdown)`

Extract table of contents without full rendering (lightweight).

```ts
const toc = extractToc(markdown: string): TocEntry[]
```

**Example:**

```ts
const toc = extractToc("# First\n## Second\n# Third");
// [
//   { text: "First", depth: 1, slug: "first" },
//   { text: "Second", depth: 2, slug: "second" },
//   { text: "Third", depth: 1, slug: "third" }
// ]
```

Handles duplicate headings with GitHub-style numbering:

```ts
const toc = extractToc("# Test\n# Test\n# Test");
// slugs: "test", "test-1", "test-2"
```

### `parseFrontmatter(markdown)`

Parse YAML frontmatter only.

```ts
const frontmatter = parseFrontmatter(markdown: string): Record<string, unknown> | null
```

**Example:**

```ts
const fm = parseFrontmatter(`---
title: Hello
tags: [a, b, c]
---
# Content`);
// { title: "Hello", tags: ["a", "b", "c"] }
```

## Options

### `RenderOptions`

| Option                    | Type                                         | Default          | Description                             |
| ------------------------- | -------------------------------------------- | ---------------- | --------------------------------------- |
| `highlighter`             | `"starry-night"` \| `"lowlight"` \| `"none"` | `"starry-night"` | Syntax highlighter                      |
| `allowMath`               | `boolean`                                    | `false`          | Enable KaTeX math rendering             |
| `allowEmoji`              | `boolean`                                    | `true`           | Enable emoji shortcodes (`:wave:` → 👋) |
| `allowIframes`            | `boolean`                                    | `false`          | Allow iframes in output                 |
| `baseUrl`                 | `string`                                     | —                | Base URL for relative links             |
| `remarkPlugins`           | `PluginSpec[]`                               | —                | Custom remark plugins                   |
| `rehypePlugins`           | `PluginSpec[]`                               | —                | Custom rehype plugins                   |
| `disableHtmlSanitization` | `boolean`                                    | `false`          | Disable sanitization (dangerous!)       |

### Highlighter Comparison

| Highlighter    | Accuracy            | Bundle Size | Speed   |
| -------------- | ------------------- | ----------- | ------- |
| `starry-night` | Exact GitHub match  | ~2MB        | Slower  |
| `lowlight`     | Good (highlight.js) | ~200KB      | Faster  |
| `none`         | N/A                 | 0           | Fastest |

**Recommendation:** Use `lowlight` for most cases. Use `starry-night` only when
exact GitHub rendering is required.

## Custom Plugins

Extend the rendering pipeline with your own remark and rehype plugins:

### Remark Plugins (Markdown → MDAST)

Run after built-in remark plugins, before conversion to HTML:

```ts
import remarkToc from "remark-toc";
import remarkGemoji from "remark-gemoji";

const html = await render(markdown, {
  remarkPlugins: [
    remarkToc,
    [remarkGemoji, {/* options */}],
  ],
});
```

### Rehype Plugins (HAST → HTML)

Run after syntax highlighting, before sanitization:

```ts
import rehypeExternalLinks from "rehype-external-links";
import rehypeMinify from "rehype-preset-minify";

const html = await render(markdown, {
  rehypePlugins: [
    [rehypeExternalLinks, { target: "_blank", rel: ["noopener"] }],
    rehypeMinify,
  ],
});
```

### Plugin Pipeline Order

1. `remark-parse` (markdown → mdast)
2. `remark-gfm` (tables, strikethrough, etc.)
3. `remark-frontmatter` (YAML frontmatter)
4. `remark-emoji` (if enabled)
5. `remark-math` (if enabled)
6. **Your `remarkPlugins`** ← custom
7. `remark-rehype` (mdast → hast)
8. `rehype-slug` (heading IDs)
9. `rehype-autolink-headings` (anchor links)
10. URL resolution (if `baseUrl` set)
11. Syntax highlighting
12. `rehype-katex` (if enabled)
13. **Your `rehypePlugins`** ← custom
14. `rehype-sanitize` (if enabled)
15. `rehype-stringify` (hast → html)

### Note on Caching

Processors are cached for performance. When you provide custom plugins, caching
is disabled to ensure plugin state is fresh.

## GFM Features

### Tables

```markdown
| Feature | Supported |
| ------- | --------- |
| Tables  | ✅        |
| Align   | ✅        |
```

### Task Lists

```markdown
- [x] Completed task
- [ ] Incomplete task
```

### Strikethrough

```markdown
~~deleted text~~
```

### Autolinks

```markdown
Visit https://example.com or contact user@example.com
```

### Fenced Code Blocks

````markdown
```typescript
const greeting: string = "Hello, world!";
console.log(greeting);
```
````

## Math Rendering

Enable with `allowMath: true`:

```ts
const html = await render(
  `
Inline math: $E = mc^2$

Display math:
$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$
`,
  { allowMath: true },
);
```

## Security

HTML is sanitized by default. The sanitizer:

- Blocks `<script>`, `<style>`, event handlers
- Allows safe formatting tags
- Allows heading IDs and anchor links
- Allows syntax highlighting classes (`pl-*`, `hljs-*`)
- Allows SVG for heading icons (restricted attributes)

**Never use `disableHtmlSanitization: true` with untrusted input!**

## Performance Tips

1. **Reuse the same options** — Processors are cached by option signature
2. **Use `lowlight`** — 2-5x faster than `starry-night`
3. **Use `extractToc()`** — Much faster than `renderWithMeta()` if you only need
   TOC
4. **Use `parseFrontmatter()`** — Much faster if you only need metadata

## TypeScript

Full type definitions included:

```ts
import type {
  Highlighter,
  RenderOptions,
  RenderResult,
  TocEntry,
} from "@deer/gfm";
```

## License

MIT
