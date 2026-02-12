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
    "@deer/gfm": "jsr:@deer/gfm@^0.0.3"
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

// Allow iframes (e.g. embedded videos)
const html = await render(
  '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
  { allowIframes: true },
);

// Inline rendering (no <p> wrapping, for UI labels/table cells)
const label = await render("**Status:** Active", { inline: true });
// <strong>Status:</strong> Active
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

### `warmup(options?)`

Pre-initialize a processor so the first `render()` call is fast. Especially
useful for `starry-night`, which has a slow initial load.

```ts
await warmup(options?: RenderOptions): Promise<void>
```

**Example:**

```ts
// At server startup — pre-warm the default (starry-night) processor
await warmup();

// Or pre-warm a specific config
await warmup({ highlighter: "lowlight", allowMath: true });
```

### `clearCache()`

Evict all cached processors. Useful in long-running servers to free memory or
force re-creation after configuration changes.

```ts
clearCache(): void
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
| `inline`                  | `boolean`                                    | `false`          | Strip `<p>` wrapping for inline use     |
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
4. Frontmatter extraction (stores on `vfile.data` for `renderWithMeta`)
5. `gemoji` (if enabled)
6. `remark-math` (if enabled)
7. **Your `remarkPlugins`** ← custom
8. `remark-rehype` (mdast → hast)
9. `rehype-slug` (heading IDs)
10. TOC extraction (stores on `vfile.data` for `renderWithMeta`)
11. `rehype-autolink-headings` (anchor links)
12. URL resolution (if `baseUrl` set)
13. Syntax highlighting
14. `rehype-katex` (if enabled)
15. **Your `rehypePlugins`** ← custom
16. `rehype-sanitize` (if enabled)
17. `rehype-stringify` (hast → html)

### Note on Caching

Processors are cached for performance (LRU, up to 10 entries). When you provide
custom plugins, caching is disabled to ensure plugin state is fresh. Use
`clearCache()` to manually evict all entries, or `warmup()` to pre-populate the
cache at startup.

## Styling

### Basic Setup

Include the CSS export alongside your rendered HTML:

```ts
import { CSS } from "@deer/gfm/style";

const page = `
<html>
  <head><style>${CSS}</style></head>
  <body>
    <div class="markdown-body">${html}</div>
  </body>
</html>
`;
```

Additional CSS exports are available:

| Export          | Contents                                         |
| --------------- | ------------------------------------------------ |
| `CSS`           | Base markdown styles + starry-night highlighting |
| `HIGHLIGHT_CSS` | Lowlight/highlight.js highlighting               |
| `KATEX_CSS`     | KaTeX math styles (fonts from CDN)               |
| `COMBINED_CSS`  | All of the above combined                        |

### Theming with CSS Custom Properties

Override `--gfm-*` variables to theme rendered markdown. No need to touch Primer
internals — just set the variables you want to change:

```css
/* Custom brand theme */
:root {
  --gfm-accent-color: #6366f1;
  --gfm-accent-hover: #4f46e5;
}
```

All 10 variables with their light/dark defaults:

| Variable                  | Light Default | Dark Default | What it controls                      |
| ------------------------- | ------------- | ------------ | ------------------------------------- |
| `--gfm-fg-default`        | `#1f2328`     | `#f0f6fc`    | Body text                             |
| `--gfm-fg-heading`        | `#1f2328`     | `#f0f6fc`    | Heading text (h1-h6)                  |
| `--gfm-fg-muted`          | `#59636e`     | `#9198a1`    | Secondary text, code header labels    |
| `--gfm-accent-color`      | `#0969da`     | `#1f6feb`    | Links, accent borders                 |
| `--gfm-accent-hover`      | `#0550ae`     | `#58a6ff`    | Link hover state                      |
| `--gfm-border-color`      | `#d1d9e0`     | `#3d444d`    | Borders (tables, code blocks, alerts) |
| `--gfm-bg-subtle`         | `#f6f8fa`     | `#151b23`    | Code block backgrounds                |
| `--gfm-bg-surface`        | `#f6f8fa`     | `#151b23`    | Code headers, alert backgrounds       |
| `--gfm-inline-code-color` | `inherit`     | `inherit`    | Inline code text color                |
| `--gfm-inline-code-bg`    | `#818b981f`   | `#656c7633`  | Inline code background                |

### Dark Mode

Dark mode activates automatically via any of:

- `prefers-color-scheme: dark` media query
- `.dark` class on an ancestor element
- `data-color-mode="dark"` / `data-dark-theme="dark"` attributes

Override theme variables per mode:

```css
/* Light mode custom accent */
:root {
  --gfm-accent-color: #059669;
}

/* Dark mode custom accent */
.dark, [data-color-mode="dark"] {
  --gfm-accent-color: #34d399;
}
```

### GitHub Alerts

The renderer supports
[GitHub-style alerts](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts)
with colored borders and titles for 5 types: Note, Tip, Important, Warning, and
Caution. These are styled automatically by the included CSS.

```markdown
> [!NOTE]
> Useful information that users should know.

> [!WARNING]
> Critical content demanding immediate attention.
```

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

1. **Call `warmup()` at startup** — Pre-initializes the processor so the first
   render is fast (starry-night has a slow cold start)
2. **Reuse the same options** — Processors are cached by option signature (LRU,
   up to 10 entries)
3. **Use `lowlight`** — 2-5x faster than `starry-night`
4. **Use `renderWithMeta()`** — Same speed as `render()` but also returns TOC
   and frontmatter in a single pass
5. **Use `extractToc()`** — Much faster than a full render if you _only_ need
   TOC
6. **Use `parseFrontmatter()`** — Much faster if you only need metadata

## TypeScript

Full type definitions included:

```ts
import {
  clearCache,
  extractToc,
  parseFrontmatter,
  render,
  renderWithMeta,
  warmup,
} from "@deer/gfm";

import type {
  Highlighter,
  RenderOptions,
  RenderResult,
  TocEntry,
} from "@deer/gfm";
```

## License

MIT
