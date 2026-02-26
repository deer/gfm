/**
 * @module
 * Lightweight markdown parsing utilities — no rendering or syntax highlighting.
 *
 * Use this entry point when you only need to extract metadata (TOC, frontmatter)
 * from markdown without pulling in the full rendering pipeline and its heavy
 * dependencies (starry-night, highlight.js, katex).
 *
 * @example
 * ```ts
 * import { extractToc, parseFrontmatter } from "@deer/gfm/parse";
 *
 * const toc = extractToc("# Hello\n## World");
 * const fm = parseFrontmatter("---\ntitle: Hi\n---\n# Content");
 * ```
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import { parse as parseYaml } from "@std/yaml";
import GitHubSlugger from "github-slugger";

import type { Heading, Root as MdastRoot } from "mdast";

/** Table of contents entry */
export interface TocEntry {
  /** Heading text */
  text: string;
  /** Heading level (1-6) */
  depth: number;
  /** Slug/ID for linking */
  slug: string;
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
