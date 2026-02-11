/**
 * @module
 * GitHub Flavored Markdown rendering for Deno.
 *
 * Built on the unified ecosystem with two syntax highlighting options:
 * - `starry-night`: GitHub's actual highlighter (accurate, heavier)
 * - `lowlight`: highlight.js-based (lighter, faster)
 *
 * @example
 * ```ts
 * import { render } from "@deer/gfm";
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
  process(file: string): Promise<{ toString(): string }>;
  run(tree: unknown): Promise<unknown>;
}
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkEmoji from "remark-emoji";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import rehypeStarryNight from "rehype-starry-night";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { rehypeGithubAlerts } from "rehype-github-alerts";
import { toString as hastToString } from "hast-util-to-string";
import { headingRank } from "hast-util-heading-rank";
import { SKIP, visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import { parse as parseYaml } from "yaml";
import GitHubSlugger from "github-slugger";

import type { Heading, Root as MdastRoot } from "mdast";
import type { Element, Root as HastRoot } from "hast";
import type { Pluggable, Plugin } from "unified";

/** Syntax highlighting engine */
export type Highlighter = "starry-night" | "lowlight" | "none";

/** A unified plugin with optional settings */
export type PluginSpec = Pluggable | [Plugin, ...unknown[]];

/** Options for rendering markdown */
export interface RenderOptions {
  /** Base URL for resolving relative links and images (e.g., "https://example.com/docs/") */
  baseUrl?: string;
  /** Syntax highlighter: "starry-night" (default), "lowlight", or "none" */
  highlighter?: Highlighter;
  /** Enable KaTeX math rendering */
  allowMath?: boolean;
  /** Enable iframes in output */
  allowIframes?: boolean;
  /** Disable HTML sanitization (dangerous!) */
  disableHtmlSanitization?: boolean;
  /** Enable emoji shortcodes (e.g., :wave: → 👋). Default: true */
  allowEmoji?: boolean;
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
}

/** Table of contents entry */
export interface TocEntry {
  /** Heading text */
  text: string;
  /** Heading level (1-6) */
  depth: number;
  /** Slug/ID for linking */
  slug: string;
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

  // Allow heading IDs
  for (const h of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    schema.attributes[h] = [...(schema.attributes[h] ?? []), "id"];
  }

  // Allow anchor links
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

  // Build span className pattern - syntax highlighting + optionally KaTeX
  const spanClassPatterns = ["pl-", "hljs-", "code-lang"];
  if (opts.allowMath) {
    // KaTeX class prefixes
    spanClassPatterns.push(
      "katex",
      "mord",
      "mbin",
      "mrel",
      "mopen",
      "mclose",
      "mpunct",
      "minner",
      "mop",
      "mspace",
      "msupsub",
      "vlist",
      "strut",
      "pstrut",
      "frac-line",
      "sqrt",
      "base",
      "sizing",
      "reset-size",
      "size",
      "mtight",
      "mathnormal",
      "mathit",
      "mathbf",
      "nulldelimiter",
      "delimsizing",
      "delimcenter",
      "accent",
      "stretchy",
    );
  }
  const spanClassRegex = new RegExp(`^(${spanClassPatterns.join("|")})`);
  schema.attributes["span"] = [...(schema.attributes["span"] ?? []), [
    "className",
    spanClassRegex,
  ]];

  // KaTeX also needs style and aria-hidden on spans
  if (opts.allowMath) {
    schema.attributes["span"].push("style", "ariaHidden");
  }

  schema.attributes["pre"] = [...(schema.attributes["pre"] ?? []), "className"];
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

  // Math (KaTeX)
  if (opts.allowMath) {
    const mathTags = [
      "math",
      "semantics",
      "mrow",
      "mi",
      "mn",
      "mo",
      "msup",
      "msub",
      "mfrac",
      "msqrt",
      "mroot",
      "mtext",
      "mspace",
      "mtable",
      "mtr",
      "mtd",
      "annotation",
    ];
    schema.tagNames = [...(schema.tagNames ?? []), ...mathTags];
    schema.attributes["math"] = ["xmlns", "display"];
    schema.attributes["annotation"] = ["encoding"];
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

// Create the unified processor pipeline
async function createProcessor(opts: RenderOptions): Promise<Pipeline> {
  let processor: Pipeline = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ["yaml"]);

  // Emoji shortcodes (enabled by default)
  if (opts.allowEmoji !== false) {
    processor = processor.use(remarkEmoji, { accessible: true });
  }

  if (opts.allowMath) {
    processor = processor.use(remarkMath);
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
    .use(rehypeAutolinkHeadings, {
      behavior: "prepend",
      properties: { ariaHidden: true, tabIndex: -1, className: ["anchor"] },
      content: anchorIcon,
    })
    // Resolve relative URLs if baseUrl is provided
    .use(rehypeResolveUrls, { baseUrl: opts.baseUrl });

  // Add syntax highlighter
  const highlighter = opts.highlighter ?? "starry-night";
  if (highlighter === "starry-night") {
    const { createStarryNight, common } = await import("@wooorm/starry-night");
    const starryNight = await createStarryNight(common);
    processor = processor.use(rehypeStarryNight, { starryNight });
  } else if (highlighter === "lowlight") {
    processor = processor.use(rehypeHighlight, { detect: true });
  }

  // Math rendering
  if (opts.allowMath) {
    processor = processor.use(rehypeKatex);
  }

  // Wrap code blocks in .highlight with optional language header
  processor = processor.use(rehypeCodeBlocks);

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

  return processor.use(rehypeStringify);
}

// Processor cache (only used when no custom plugins are provided)
const processorCache = new Map<string, Promise<Pipeline>>();

function getCacheKey(opts: RenderOptions): string | null {
  // Don't cache when custom plugins are used (they may have state)
  if (opts.remarkPlugins?.length || opts.rehypePlugins?.length) {
    return null;
  }
  return JSON.stringify({
    highlighter: opts.highlighter ?? "starry-night",
    allowMath: opts.allowMath ?? false,
    allowIframes: opts.allowIframes ?? false,
    disableHtmlSanitization: opts.disableHtmlSanitization ?? false,
    allowEmoji: opts.allowEmoji ?? true,
    baseUrl: opts.baseUrl ?? null,
  });
}

function getProcessor(opts: RenderOptions): Promise<Pipeline> {
  const key = getCacheKey(opts);

  // No caching for custom plugins
  if (key === null) {
    return createProcessor(opts);
  }

  let cached = processorCache.get(key);
  if (!cached) {
    cached = createProcessor(opts);
    processorCache.set(key, cached);
  }
  return cached;
}

/**
 * Render GitHub Flavored Markdown to HTML.
 *
 * @example
 * ```ts
 * const html = await render("# Hello **world**");
 * ```
 *
 * @example With lowlight (faster, lighter)
 * ```ts
 * const html = await render(code, { highlighter: "lowlight" });
 * ```
 */
export async function render(
  markdown: string,
  opts: RenderOptions = {},
): Promise<string> {
  const processor = await getProcessor(opts);
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
  const processor = await getProcessor(opts);

  // Parse mdast for frontmatter
  const mdast = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown) as MdastRoot;

  // Extract frontmatter
  let frontmatter: Record<string, unknown> | null = null;
  for (const node of mdast.children) {
    if (node.type === "yaml") {
      try {
        frontmatter = parseYaml(node.value) as Record<string, unknown>;
      } catch {
        // Invalid YAML
      }
      break;
    }
  }

  // Process to hast for TOC
  let hastProcessor: Pipeline = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ["yaml"]) as Pipeline;
  if (opts.allowMath) {
    hastProcessor = hastProcessor.use(remarkMath) as Pipeline;
  }
  hastProcessor = hastProcessor.use(remarkRehype).use(
    rehypeSlug,
  ) as Pipeline;
  const hast = (await hastProcessor.run(mdast)) as HastRoot;

  // Extract TOC
  const toc: TocEntry[] = [];
  visit(hast, "element", (node: Element) => {
    const rank = headingRank(node);
    if (rank && typeof node.properties?.id === "string") {
      toc.push({
        text: hastToString(node),
        depth: rank,
        slug: node.properties.id,
      });
    }
  });

  // Render HTML
  const result = await processor.process(markdown);
  return { html: String(result), toc, frontmatter };
}

/**
 * Extract table of contents from markdown (lightweight, no full render).
 */
export function extractToc(markdown: string): TocEntry[] {
  const mdast = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown) as MdastRoot;

  const toc: TocEntry[] = [];
  const slugger = new GitHubSlugger();

  visit(mdast, "heading", (node: Heading) => {
    const text = mdastToString(node);
    toc.push({ text, depth: node.depth, slug: slugger.slug(text) });
  });

  return toc;
}

/**
 * Parse YAML frontmatter from markdown.
 */
export function parseFrontmatter(
  markdown: string,
): Record<string, unknown> | null {
  const mdast = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .parse(markdown) as MdastRoot;

  for (const node of mdast.children) {
    if (node.type === "yaml") {
      try {
        return parseYaml(node.value) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}
