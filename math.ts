/**
 * @module
 * KaTeX math rendering plugin for `@deer/gfm`.
 *
 * Import this module and pass the exported `math` object to enable
 * LaTeX math rendering (`$inline$` and `$$display$$` syntax).
 *
 * @example
 * ```ts
 * import { render } from "@deer/gfm/lowlight";
 * import { math } from "@deer/gfm/math";
 *
 * const html = await render("$E = mc^2$", { math });
 * ```
 */

import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { MathPlugins } from "./mod.ts";

/** KaTeX math plugins and sanitization rules for use with the `math` render option. */
export const math: MathPlugins = {
  remarkPlugin: remarkMath,
  rehypePlugin: rehypeKatex,
  spanClassPrefixes: [
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
  ],
  spanAttributes: ["style", "ariaHidden"],
  tagNames: [
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
  ],
  tagAttributes: {
    math: ["xmlns", "display"],
    annotation: ["encoding"],
  },
};
