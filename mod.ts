/**
 * @module
 * GitHub Flavored Markdown rendering for Deno.
 *
 * Import from a highlighter-specific entry point for syntax highlighting:
 * - `@deer/gfm/lowlight` — highlight.js-based (lighter, faster)
 * - `@deer/gfm/starry-night` — GitHub's actual highlighter (accurate, heavier)
 *
 * Or import from `@deer/gfm` directly for rendering without syntax highlighting.
 *
 * @example
 * ```ts
 * import { render } from "@deer/gfm/lowlight";
 *
 * const html = await render("# Hello **world**");
 * ```
 */

import { unified } from "unified";

/**
 * Unified processors change type as plugins are added, making strict typing
 * impractical for dynamic pipelines. We use a simplified callable type that
 * captures the essential interface: chainable .use() and async .process().
 */
interface Pipeline {
  use(plugin: unknown, ...settings: unknown[]): Pipeline;
  process(
    file: string,
  ): Promise<{ toString(): string; data: Record<string, unknown> }>;
  run(tree: unknown): Promise<unknown>;
}
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { gemoji } from "gemoji";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import rehypeRaw from "rehype-raw";
import { rehypeGithubAlerts } from "rehype-github-alerts";
import { toString as hastToString } from "hast-util-to-string";
import { headingRank } from "hast-util-heading-rank";
import { SKIP, visit } from "unist-util-visit";
import { parse as parseYaml } from "@std/yaml";

import type { TocEntry } from "./parse.ts";
import type { Root as MdastRoot } from "mdast";
import type { Element, Root as HastRoot } from "hast";
import type { Pluggable, Plugin } from "unified";

/** A unified plugin with optional settings */
export type PluginSpec = Pluggable | [Plugin, ...unknown[]];

/** Math plugin configuration with sanitization rules */
export interface MathPlugins {
  /** Remark plugin for parsing math syntax (e.g. `remark-math`) */
  remarkPlugin: PluginSpec;
  /** Rehype plugin for rendering math to HTML (e.g. `rehype-katex`) */
  rehypePlugin: PluginSpec;
  /** Class prefixes to allow on `<span>` elements (e.g. `"katex"`, `"mord"`) */
  spanClassPrefixes?: string[];
  /** Additional attributes to allow on `<span>` (e.g. `"style"`, `"ariaHidden"`) */
  spanAttributes?: string[];
  /** Additional HTML/MathML tag names to allow */
  tagNames?: string[];
  /** Per-tag attributes to allow (e.g. `{ math: ["xmlns", "display"] }`) */
  tagAttributes?: Record<string, string[]>;
}

/** Options for rendering markdown */
export interface RenderOptions {
  /** Base URL for resolving relative links and images (e.g., "https://example.com/docs/") */
  baseUrl?: string;
  /** Rehype plugin for syntax highlighting. Use `@deer/gfm/lowlight` or `@deer/gfm/starry-night` entry points instead of setting this directly. */
  highlighter?: PluginSpec;
  /** Math rendering plugins (use `@deer/gfm/math` for KaTeX support) */
  math?: MathPlugins;
  /** Enable iframes in output */
  allowIframes?: boolean;
  /** Disable HTML sanitization (dangerous!) */
  disableHtmlSanitization?: boolean;
  /** Enable emoji shortcodes (e.g., :wave: → 👋). Default: true */
  allowEmoji?: boolean;
  /** Enable line numbers on code blocks. Default: false */
  lineNumbers?: boolean;
  /**
   * Custom remark plugins to run after built-in plugins (before remark-rehype).
   * @example
   * ```ts
   * import remarkToc from "remark-toc";
   * await render(md, { remarkPlugins: [remarkToc] });
   * ```
   */
  remarkPlugins?: PluginSpec[];
  /**
   * Custom rehype plugins to run after syntax highlighting (before sanitization).
   * @example
   * ```ts
   * import rehypeExternalLinks from "rehype-external-links";
   * await render(md, { rehypePlugins: [[rehypeExternalLinks, { target: "_blank" }]] });
   * ```
   */
  rehypePlugins?: PluginSpec[];
  /** Render inline markdown without block-level `<p>` wrapping. Useful for single-line snippets in UI labels or table cells. */
  inline?: boolean;
}

/** Result of rendering with metadata */
export interface RenderResult {
  /** Rendered HTML */
  html: string;
  /** Extracted table of contents */
  toc: TocEntry[];
  /** Parsed frontmatter (if any) */
  frontmatter: Record<string, unknown> | null;
}

// Build sanitization schema
function buildSchema(opts: RenderOptions) {
  const schema = structuredClone(defaultSchema);
  schema.attributes ??= {};

  // Disable ID clobbering — remark-gfm already prefixes footnote IDs with
  // "user-content-", and the default clobberPrefix ("user-content-") would
  // double-prefix them, breaking footnote ref/backref links. Removing the
  // prefix also fixes heading autolinks (rehype-autolink-headings generates
  // hrefs before sanitization, so they must match the final IDs).
  schema.clobberPrefix = "";

  // Allow heading IDs and sr-only class (used by footnote section heading)
  for (const h of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    schema.attributes[h] = [...(schema.attributes[h] ?? []), "id", [
      "className",
      "sr-only",
    ]];
  }

  // Allow anchor links (footnote attributes already in defaultSchema)
  schema.attributes["a"] = [
    ...(schema.attributes["a"] ?? []),
    "id",
    "ariaHidden",
    "tabIndex",
  ];

  // Allow code highlighting classes
  schema.attributes["code"] = [...(schema.attributes["code"] ?? []), [
    "className",
    /^language-./,
  ]];

  // Build span className pattern - syntax highlighting + optional math classes
  const spanClassPatterns = ["pl-", "hljs-", "code-lang", "line"];
  if (opts.math?.spanClassPrefixes) {
    spanClassPatterns.push(...opts.math.spanClassPrefixes);
  }
  const spanClassRegex = new RegExp(`^(${spanClassPatterns.join("|")})`);
  schema.attributes["span"] = [...(schema.attributes["span"] ?? []), [
    "className",
    spanClassRegex,
  ]];

  // Math plugins may need extra span attributes (e.g. style, ariaHidden)
  if (opts.math?.spanAttributes) {
    schema.attributes["span"].push(...opts.math.spanAttributes);
  }

  schema.attributes["pre"] = [
    ...(schema.attributes["pre"] ?? []),
    "className",
    "dataLineNumbers",
  ];
  schema.attributes["div"] = [...(schema.attributes["div"] ?? []), [
    "className",
    /^(highlight|code-header|markdown-)/,
  ]];

  // Allow alert title class on <p> tags
  schema.attributes["p"] = [
    ...(schema.attributes["p"] ?? []),
    ["className", /^markdown-alert-title$/],
  ];

  // SVG for heading links
  schema.tagNames = [...(schema.tagNames ?? []), "svg", "path"];
  schema.attributes["svg"] = [
    "viewBox",
    "width",
    "height",
    "ariaHidden",
    "fill",
    "className",
  ];
  schema.attributes["path"] = ["fillRule", "d"];

  // Task list checkboxes
  if (!schema.tagNames?.includes("input")) {
    schema.tagNames.push("input");
  }
  schema.attributes["input"] = ["type", "checked", "disabled"];

  // iframes
  if (opts.allowIframes) {
    schema.tagNames?.push("iframe");
    schema.attributes["iframe"] = ["src", "width", "height", "frameBorder"];
  }

  // Math tag names and attributes (provided by math plugin config)
  if (opts.math?.tagNames) {
    schema.tagNames = [...(schema.tagNames ?? []), ...opts.math.tagNames];
  }
  if (opts.math?.tagAttributes) {
    for (const [tag, attrs] of Object.entries(opts.math.tagAttributes)) {
      schema.attributes[tag] = [...(schema.attributes[tag] ?? []), ...attrs];
    }
  }

  return schema;
}

/**
 * Resolves a relative URL against a base URL.
 * Only resolves if the URL is relative (doesn't start with protocol, //, or #).
 */
function resolveUrl(url: string, baseUrl: string): string {
  // Skip absolute URLs, protocol-relative URLs, and fragment-only URLs
  if (
    !url || url.startsWith("http://") || url.startsWith("https://") ||
    url.startsWith("//") || url.startsWith("#") || url.startsWith("data:") ||
    url.startsWith("mailto:") || url.startsWith("tel:")
  ) {
    return url;
  }

  // Normalize base URL to end with /
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

  // Handle URLs starting with /
  if (url.startsWith("/")) {
    try {
      const baseUrlObj = new URL(base);
      return new URL(url, baseUrlObj.origin).href;
    } catch {
      return url;
    }
  }

  // Resolve relative URL
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/**
 * Rehype plugin to resolve relative URLs in links and images.
 */
function rehypeResolveUrls(opts: { baseUrl?: string }) {
  return (tree: HastRoot) => {
    if (!opts.baseUrl) return;

    visit(tree, "element", (node: Element) => {
      // Resolve href on links
      if (node.tagName === "a" && typeof node.properties?.href === "string") {
        node.properties.href = resolveUrl(node.properties.href, opts.baseUrl!);
      }
      // Resolve src on images
      if (node.tagName === "img" && typeof node.properties?.src === "string") {
        node.properties.src = resolveUrl(node.properties.src, opts.baseUrl!);
      }
      // Resolve src on video/audio
      if (
        (node.tagName === "video" || node.tagName === "audio") &&
        typeof node.properties?.src === "string"
      ) {
        node.properties.src = resolveUrl(node.properties.src, opts.baseUrl!);
      }
      // Resolve src on source elements
      if (
        node.tagName === "source" && typeof node.properties?.src === "string"
      ) {
        node.properties.src = resolveUrl(node.properties.src, opts.baseUrl!);
      }
    });
  };
}

// Heading link SVG icon
const anchorIcon = {
  type: "element" as const,
  tagName: "svg",
  properties: {
    className: ["octicon", "octicon-link"],
    viewBox: "0 0 16 16",
    width: 16,
    height: 16,
    ariaHidden: true,
  },
  children: [{
    type: "element" as const,
    tagName: "path",
    properties: {
      fillRule: "evenodd",
      d: "M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z",
    },
    children: [],
  }],
};

/**
 * Rehype plugin to wrap code blocks in a consistent structure.
 * Wraps `<pre><code>` in `<div class="highlight">`, and if the code has a
 * `language-*` class, inserts a `<div class="code-header"><span class="code-lang">{lang}</span></div>`.
 */
function rehypeCodeBlocks() {
  return (tree: HastRoot) => {
    visit(
      tree,
      "element",
      (node: Element, index: number | undefined, parent: unknown) => {
        if (node.tagName !== "pre" || index === undefined || !parent) return;

        const parentEl = parent as HastRoot | Element;

        // Find the <code> child
        const codeChild = node.children.find(
          (child): child is Element =>
            child.type === "element" && child.tagName === "code",
        );
        if (!codeChild) return;

        // Extract language from className
        const classNames = Array.isArray(codeChild.properties?.className)
          ? codeChild.properties.className
          : [];
        const langClass = classNames.find(
          (c: string | number) =>
            typeof c === "string" && c.startsWith("language-"),
        ) as string | undefined;
        const language = langClass?.slice("language-".length);

        // Build wrapper children
        const wrapperChildren: (Element | typeof node)[] = [];

        if (language) {
          wrapperChildren.push({
            type: "element",
            tagName: "div",
            properties: { className: ["code-header"] },
            children: [{
              type: "element",
              tagName: "span",
              properties: { className: ["code-lang"] },
              children: [{ type: "text", value: language }],
            }],
          });
        }

        wrapperChildren.push(node);

        // Replace <pre> with wrapper <div class="highlight">
        const wrapper: Element = {
          type: "element",
          tagName: "div",
          properties: { className: ["highlight"] },
          children: wrapperChildren,
        };

        parentEl.children[index] = wrapper;
        return SKIP;
      },
    );
  };
}

/**
 * Rehype plugin that wraps each line of code inside `<pre><code>` in a
 * `<span class="line">`, enabling CSS-based line numbers via counters.
 *
 * The algorithm walks the children of every `<code>` element inside a `<pre>`,
 * splitting text nodes on newline characters and grouping consecutive nodes
 * into per-line `<span class="line">` wrappers.
 */
function rehypeLineNumbers() {
  return (tree: HastRoot) => {
    visit(tree, "element", (pre: Element) => {
      if (pre.tagName !== "pre") return;

      const code = pre.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;

      // Flatten code children into lines by splitting on \n
      type HastChild = Element | { type: "text"; value: string };
      const lines: HastChild[][] = [[]];

      for (const child of code.children as HastChild[]) {
        if (child.type === "text") {
          const parts = child.value.split("\n");
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) lines.push([]);
            if (parts[i]) {
              lines[lines.length - 1].push({ type: "text", value: parts[i] });
            }
          }
        } else if (child.type === "element") {
          // Span may contain text with newlines — need to split those too
          const text = hastToString(child);
          if (text.includes("\n")) {
            // Split the element across lines. For simplicity, split into
            // text segments and re-wrap each in a clone of the element.
            const parts = text.split("\n");
            for (let i = 0; i < parts.length; i++) {
              if (i > 0) lines.push([]);
              if (parts[i]) {
                lines[lines.length - 1].push({
                  type: "element",
                  tagName: child.tagName,
                  properties: { ...child.properties },
                  children: [{ type: "text", value: parts[i] }],
                } as Element);
              }
            }
          } else {
            lines[lines.length - 1].push(child);
          }
        } else {
          // Other node types (comments, etc.) — keep on current line
          lines[lines.length - 1].push(child as HastChild);
        }
      }

      // Drop trailing empty line (code blocks typically end with \n)
      if (
        lines.length > 1 &&
        lines[lines.length - 1].length === 0
      ) {
        lines.pop();
      }

      // Wrap each line in <span class="line">
      code.children = lines.map((children) => ({
        type: "element" as const,
        tagName: "span",
        properties: { className: ["line"] },
        children: children.length > 0
          ? [...children, { type: "text" as const, value: "\n" }]
          : [{ type: "text" as const, value: "\n" }],
      }));

      // Add data attribute to pre for CSS targeting
      pre.properties = pre.properties || {};
      pre.properties["dataLineNumbers"] = "";

      return SKIP;
    });
  };
}

/**
 * Rehype plugin to unwrap paragraph contents for inline rendering.
 * Replaces `<p>` elements with their children so inline content
 * is not wrapped in block-level tags.
 */
function rehypeUnwrapParagraphs() {
  return (tree: HastRoot) => {
    visit(
      tree,
      "element",
      (node: Element, index: number | undefined, parent: unknown) => {
        if (node.tagName !== "p" || index === undefined || !parent) return;
        const parentEl = parent as HastRoot | Element;
        parentEl.children.splice(index, 1, ...node.children);
        return index;
      },
    );
  };
}

/**
 * Remark plugin that extracts YAML frontmatter and stores it on vfile.data.
 */
function remarkExtractFrontmatter() {
  return (tree: MdastRoot, file: { data: Record<string, unknown> }) => {
    for (const node of tree.children) {
      if (node.type === "yaml") {
        try {
          file.data.frontmatter = parseYaml(
            node.value,
          ) as Record<string, unknown>;
        } catch {
          // Invalid YAML — leave as undefined
        }
        break;
      }
    }
  };
}

// Build name→emoji lookup from gemoji database
const emojiMap = new Map<string, string>();
for (const entry of gemoji) {
  for (const name of entry.names) {
    emojiMap.set(name, entry.emoji);
  }
}

/**
 * Remark plugin that replaces :emoji: shortcodes with unicode emoji.
 */
function remarkEmojify() {
  return (tree: MdastRoot) => {
    visit(tree, "text", (node: { value: string }) => {
      node.value = node.value.replace(/:([+\w-]+):/g, (match, name) => {
        return emojiMap.get(name) ?? match;
      });
    });
  };
}

/**
 * Rehype plugin that extracts TOC entries and stores them on vfile.data.
 * Must run after rehypeSlug (so IDs exist) but before rehypeAutolinkHeadings
 * (so heading text is clean).
 */
function rehypeExtractToc() {
  return (tree: HastRoot, file: { data: Record<string, unknown> }) => {
    const toc: TocEntry[] = [];
    visit(tree, "element", (node: Element) => {
      const rank = headingRank(node);
      if (rank && typeof node.properties?.id === "string") {
        toc.push({
          text: hastToString(node),
          depth: rank,
          slug: node.properties.id,
        });
      }
    });
    file.data.toc = toc;
  };
}

/**
 * Helper to apply a plugin spec to a processor.
 * Uses Processor generic to maintain type safety while allowing plugin chaining.
 */
function applyPlugin(
  processor: Pipeline,
  plugin: PluginSpec,
): Pipeline {
  if (Array.isArray(plugin)) {
    const [plug, ...settings] = plugin;
    return processor.use(plug, ...settings) as Pipeline;
  }
  return processor.use(plugin) as Pipeline;
}

/** Validate that baseUrl is a well-formed URL, if provided. */
function validateBaseUrl(baseUrl: string | undefined): void {
  if (baseUrl === undefined) return;
  try {
    new URL(baseUrl);
  } catch {
    throw new Error(
      `Invalid baseUrl: "${baseUrl}". Provide a fully-qualified URL ` +
        '(e.g., "https://example.com/docs/").',
    );
  }
}

// Create the unified processor pipeline
function createProcessor(opts: RenderOptions): Pipeline {
  validateBaseUrl(opts.baseUrl);
  let processor: Pipeline = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkExtractFrontmatter);

  // Emoji shortcodes (enabled by default)
  if (opts.allowEmoji !== false) {
    processor = processor.use(remarkEmojify);
  }

  if (opts.math) {
    processor = applyPlugin(processor, opts.math.remarkPlugin);
  }

  // Custom remark plugins (before remark-rehype)
  if (opts.remarkPlugins) {
    for (const plugin of opts.remarkPlugins) {
      processor = applyPlugin(processor, plugin);
    }
  }

  processor = processor
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // GitHub-style alerts (> [!NOTE], > [!WARNING], etc.)
    .use(rehypeGithubAlerts)
    .use(rehypeSlug)
    .use(rehypeExtractToc)
    .use(rehypeAutolinkHeadings, {
      behavior: "prepend",
      properties: { ariaHidden: true, tabIndex: -1, className: ["anchor"] },
      content: anchorIcon,
    })
    // Resolve relative URLs if baseUrl is provided
    .use(rehypeResolveUrls, { baseUrl: opts.baseUrl });

  // Add syntax highlighter plugin (provided by entry points like @deer/gfm/lowlight)
  if (opts.highlighter) {
    processor = applyPlugin(processor, opts.highlighter);
  }

  // Math rendering
  if (opts.math) {
    processor = applyPlugin(processor, opts.math.rehypePlugin);
  }

  // Wrap code blocks in .highlight with optional language header
  processor = processor.use(rehypeCodeBlocks);

  // Line numbers (after code block wrapping + highlighting)
  if (opts.lineNumbers) {
    processor = processor.use(rehypeLineNumbers);
  }

  // Custom rehype plugins (after highlighting, before sanitization)
  if (opts.rehypePlugins) {
    for (const plugin of opts.rehypePlugins) {
      processor = applyPlugin(processor, plugin);
    }
  }

  // Sanitization
  if (!opts.disableHtmlSanitization) {
    processor = processor.use(rehypeSanitize, buildSchema(opts));
  }

  // Inline mode: strip <p> wrappers
  if (opts.inline) {
    processor = processor.use(rehypeUnwrapParagraphs);
  }

  return processor.use(rehypeStringify);
}

// Processor cache (only used when no custom plugins are provided)
const MAX_CACHE_SIZE = 10;
const processorCache = new Map<string, Pipeline>();

function getHighlighterName(highlighter: RenderOptions["highlighter"]): string {
  if (!highlighter) return "none";
  const fn = Array.isArray(highlighter) ? highlighter[0] : highlighter;
  return (fn as { name?: string }).name ?? "unknown";
}

function getCacheKey(opts: RenderOptions): string | null {
  // Don't cache when custom plugins are used (they may have state)
  if (opts.remarkPlugins?.length || opts.rehypePlugins?.length) {
    return null;
  }
  return JSON.stringify({
    highlighter: getHighlighterName(opts.highlighter),
    math: opts.math ? true : false,
    allowIframes: opts.allowIframes ?? false,
    disableHtmlSanitization: opts.disableHtmlSanitization ?? false,
    allowEmoji: opts.allowEmoji ?? true,
    baseUrl: opts.baseUrl ?? null,
    inline: opts.inline ?? false,
    lineNumbers: opts.lineNumbers ?? false,
  });
}

function getProcessor(opts: RenderOptions): Pipeline {
  const key = getCacheKey(opts);

  // No caching for custom plugins
  if (key === null) {
    return createProcessor(opts);
  }

  const cached = processorCache.get(key);
  if (cached) {
    // Move to end (most recently used) via delete + re-insert
    processorCache.delete(key);
    processorCache.set(key, cached);
    return cached;
  }

  // Evict oldest entry if at capacity
  if (processorCache.size >= MAX_CACHE_SIZE) {
    const oldest = processorCache.keys().next().value!;
    processorCache.delete(oldest);
  }

  const created = createProcessor(opts);
  processorCache.set(key, created);
  return created;
}

/**
 * Clear all cached processors.
 * Useful in long-running servers to free memory or force re-creation.
 */
export function clearCache(): void {
  processorCache.clear();
}

/**
 * Pre-warm the processor cache for the given options.
 *
 * @example
 * ```ts
 * import { warmup } from "@deer/gfm/lowlight";
 * await warmup(); // pre-warm lowlight processor
 * ```
 */
export function warmup(opts: RenderOptions = {}): void {
  getProcessor(opts);
}

/**
 * Render GitHub Flavored Markdown to HTML.
 *
 * @example
 * ```ts
 * import { render } from "@deer/gfm/lowlight";
 * const html = await render("# Hello **world**");
 * ```
 */
export async function render(
  markdown: string,
  opts: RenderOptions = {},
): Promise<string> {
  const processor = getProcessor(opts);
  const result = await processor.process(markdown);
  return String(result);
}

/**
 * Render markdown and extract metadata (TOC, frontmatter).
 *
 * @example
 * ```ts
 * const { html, toc, frontmatter } = await renderWithMeta(`---
 * title: My Doc
 * ---
 * # Introduction
 * `);
 * ```
 */
export async function renderWithMeta(
  markdown: string,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const processor = getProcessor(opts);
  const result = await processor.process(markdown);
  return {
    html: String(result),
    toc: (result.data.toc as TocEntry[]) ?? [],
    frontmatter: (result.data.frontmatter as Record<string, unknown>) ?? null,
  };
}

// Re-export lightweight parsing functions and types from parse.ts for backwards
// compat. Prefer importing from "@deer/gfm/parse" directly to avoid pulling in
// the full rendering pipeline.
export { extractToc, parseFrontmatter } from "./parse.ts";
export type { TocEntry } from "./parse.ts";
