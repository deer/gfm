/**
 * @module
 * GFM rendering with starry-night (GitHub's actual syntax highlighter).
 *
 * Provides the most accurate GitHub-style highlighting but bundles ~10MB of
 * TextMate grammars. Use `@deer/gfm/lowlight` for a lighter alternative.
 *
 * @example
 * ```ts
 * import { render } from "@deer/gfm/starry-night";
 *
 * const html = await render("```ts\nconst x: number = 1;\n```");
 * ```
 */

import rehypeStarryNight from "rehype-starry-night";
import { common, createStarryNight } from "@wooorm/starry-night";
import {
  render as coreRender,
  renderWithMeta as coreRenderWithMeta,
  warmup as coreWarmup,
} from "./mod.ts";
import type { RenderOptions, RenderResult } from "./mod.ts";

export type { RenderOptions, RenderResult } from "./mod.ts";
export type { TocEntry } from "./parse.ts";
export { clearCache, extractToc, parseFrontmatter } from "./mod.ts";

/** Lazily initialized starry-night instance */
let starryNightInstance: Awaited<ReturnType<typeof createStarryNight>> | null =
  null;

async function getStarryNight() {
  if (!starryNightInstance) {
    starryNightInstance = await createStarryNight(common);
  }
  return starryNightInstance;
}

/** Render GFM to HTML with starry-night syntax highlighting. */
export async function render(
  markdown: string,
  opts: Omit<RenderOptions, "highlighter"> = {},
): Promise<string> {
  const starryNight = await getStarryNight();
  return coreRender(markdown, {
    ...opts,
    highlighter: [rehypeStarryNight, { starryNight }],
  });
}

/** Render GFM with metadata extraction and starry-night syntax highlighting. */
export async function renderWithMeta(
  markdown: string,
  opts: Omit<RenderOptions, "highlighter"> = {},
): Promise<RenderResult> {
  const starryNight = await getStarryNight();
  return coreRenderWithMeta(markdown, {
    ...opts,
    highlighter: [rehypeStarryNight, { starryNight }],
  });
}

/** Pre-warm the starry-night instance and processor cache. */
export async function warmup(
  opts: Omit<RenderOptions, "highlighter"> = {},
): Promise<void> {
  const starryNight = await getStarryNight();
  coreWarmup({ ...opts, highlighter: [rehypeStarryNight, { starryNight }] });
}
