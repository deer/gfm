/**
 * @module
 * GFM rendering with lowlight (highlight.js) syntax highlighting.
 *
 * This is the recommended entry point for most use cases — lighter and faster
 * than starry-night while covering all common languages.
 *
 * @example
 * ```ts
 * import { render } from "@deer/gfm/lowlight";
 *
 * const html = await render("```js\nconsole.log('hi');\n```");
 * ```
 */

import rehypeHighlight from "rehype-highlight";
import {
  render as coreRender,
  renderWithMeta as coreRenderWithMeta,
  warmup as coreWarmup,
} from "./mod.ts";
import type { RenderOptions, RenderResult } from "./mod.ts";

export type { RenderOptions, RenderResult } from "./mod.ts";
export type { TocEntry } from "./parse.ts";
export { clearCache, extractToc, parseFrontmatter } from "./mod.ts";

/** Default lowlight highlighter plugin */
const lowlightPlugin: [typeof rehypeHighlight, { detect: boolean }] = [
  rehypeHighlight,
  { detect: true },
];

/** Render GFM to HTML with lowlight syntax highlighting. */
export async function render(
  markdown: string,
  opts: Omit<RenderOptions, "highlighter"> = {},
): Promise<string> {
  return await coreRender(markdown, { ...opts, highlighter: lowlightPlugin });
}

/** Render GFM with metadata extraction and lowlight syntax highlighting. */
export async function renderWithMeta(
  markdown: string,
  opts: Omit<RenderOptions, "highlighter"> = {},
): Promise<RenderResult> {
  return await coreRenderWithMeta(markdown, {
    ...opts,
    highlighter: lowlightPlugin,
  });
}

/** Pre-warm the processor cache with lowlight configuration. */
export function warmup(
  opts: Omit<RenderOptions, "highlighter"> = {},
): void {
  coreWarmup({ ...opts, highlighter: lowlightPlugin });
}
