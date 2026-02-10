#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env
/**
 * Style generation script for @deer/gfm.
 *
 * Generates style.ts from:
 * - @primer/css (GitHub's design system) — compiled markdown body styles
 * - @primer/primitives — CSS custom property definitions (light/dark themes)
 * - KaTeX CSS from CDN — math rendering styles with rewritten font URLs
 * - Highlight.js GitHub theme — lowlight syntax highlighting
 * - Starry-night token styles — GitHub syntax highlighting
 *
 * Usage: deno task gen:style
 */

const SCRIPT_DIR = import.meta.dirname!;
const ROOT_DIR = `${SCRIPT_DIR}/..`;
const NODE_MODULES = `${SCRIPT_DIR}/node_modules`;

const KATEX_VERSION = "0.16.11";
const KATEX_BASE_URL =
  `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;

// ---------------------------------------------------------------------------
// Utility functions (exported for testing)
// ---------------------------------------------------------------------------

/** Extract CSS custom property references (var(--xxx)) from CSS text. */
export function extractCssVariableRefs(css: string): Set<string> {
  const refs = new Set<string>();
  const regex = /var\((--[\w-]+)/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    refs.add(match[1]);
  }
  return refs;
}

/** Extract CSS custom property definitions (--xxx: value;) from CSS text. */
export function extractCssVariableDefinitions(
  css: string,
): Map<string, string> {
  const defs = new Map<string, string>();
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    defs.set(match[1], match[2].trim());
  }
  return defs;
}

/** Rewrite KaTeX font URLs from relative to CDN absolute. */
export function rewriteKatexFontUrls(css: string, baseUrl: string): string {
  return css.replaceAll("fonts/", `${baseUrl}/fonts/`);
}

/** Extract unique CSS class names from CSS selectors. */
export function extractCssClasses(css: string): string[] {
  const classes = new Set<string>();
  // Only match class selectors, not inside property values
  // Split on { to isolate selectors from declarations
  const blocks = css.split("{");
  for (const block of blocks) {
    const selectorPart = block.split("}").pop() ?? "";
    const regex = /\.([\w-]+)/g;
    let match;
    while ((match = regex.exec(selectorPart)) !== null) {
      classes.add(match[1]);
    }
  }
  return [...classes];
}

/** Filter variable definitions to only include those referenced. */
function filterVariables(
  defs: Map<string, string>,
  refs: Set<string>,
): Map<string, string> {
  const filtered = new Map<string, string>();
  for (const [name, value] of defs) {
    if (refs.has(name)) {
      filtered.set(name, value);
    }
  }
  return filtered;
}

/** Format variable definitions as minified CSS declarations. */
function formatVarDeclarations(vars: Map<string, string>): string {
  return [...vars.entries()]
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
}

// ---------------------------------------------------------------------------
// Static CSS templates
// ---------------------------------------------------------------------------

// Starry-night syntax highlighting token styles (pl-* classes).
// Maps GitHub "prettylights" token classes to CSS custom properties.
const STARRY_NIGHT_CSS =
  `.pl-c{color:var(--color-prettylights-syntax-comment)}` +
  `.pl-c1,.pl-s .pl-v{color:var(--color-prettylights-syntax-constant)}` +
  `.pl-e,.pl-en{color:var(--color-prettylights-syntax-entity)}` +
  `.pl-smi,.pl-s .pl-s1{color:var(--color-prettylights-syntax-storage-modifier-import)}` +
  `.pl-ent{color:var(--color-prettylights-syntax-entity-tag)}` +
  `.pl-k{color:var(--color-prettylights-syntax-keyword)}` +
  `.pl-s,.pl-pds,.pl-s .pl-pse .pl-s1,.pl-sr,.pl-sr .pl-cce,.pl-sr .pl-sre,.pl-sr .pl-sra{color:var(--color-prettylights-syntax-string)}` +
  `.pl-v,.pl-smw{color:var(--color-prettylights-syntax-variable)}` +
  `.pl-bu{color:var(--fgColor-danger)}` +
  `.pl-ii{color:var(--color-prettylights-syntax-markup-deleted-text);background-color:var(--color-prettylights-syntax-markup-deleted-bg)}` +
  `.pl-c2{color:var(--color-prettylights-syntax-markup-deleted-text);background-color:var(--color-prettylights-syntax-markup-deleted-bg)}` +
  `.pl-sr .pl-cce{font-weight:700;color:var(--color-prettylights-syntax-string-regexp)}` +
  `.pl-ml{color:var(--color-prettylights-syntax-markup-heading)}` +
  `.pl-mh,.pl-mh .pl-en,.pl-ms{font-weight:700;color:var(--color-prettylights-syntax-markup-heading)}` +
  `.pl-mi{font-style:italic;color:var(--fgColor-default)}` +
  `.pl-mb{font-weight:700;color:var(--fgColor-default)}` +
  `.pl-md{color:var(--color-prettylights-syntax-markup-deleted-text);background-color:var(--color-prettylights-syntax-markup-deleted-bg)}` +
  `.pl-mi1{color:var(--color-prettylights-syntax-markup-inserted-text);background-color:var(--color-prettylights-syntax-markup-inserted-bg)}` +
  `.pl-mc{color:var(--color-prettylights-syntax-markup-changed-text);background-color:var(--color-prettylights-syntax-markup-changed-bg)}` +
  `.pl-mdr{font-weight:700;color:var(--color-prettylights-syntax-entity)}` +
  `.pl-ba{color:var(--color-prettylights-syntax-comment)}` +
  `.pl-sg{color:var(--color-prettylights-syntax-comment)}` +
  `.pl-corl{text-decoration:underline;color:var(--color-prettylights-syntax-constant-other-reference-link)}`;

// Highlight.js / lowlight GitHub theme.
// Maps highlight.js token classes to the same Primer CSS variables.
const HIGHLIGHT_JS_CSS =
  `/* highlight.js / lowlight theme - GitHub style */\n` +
  `.hljs{color:var(--fgColor-default);background:var(--bgColor-muted)}` +
  `.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:var(--color-prettylights-syntax-keyword)}` +
  `.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:var(--color-prettylights-syntax-entity)}` +
  `.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:var(--color-prettylights-syntax-constant)}` +
  `.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:var(--color-prettylights-syntax-string)}` +
  `.hljs-built_in,.hljs-symbol{color:var(--color-prettylights-syntax-variable)}` +
  `.hljs-code,.hljs-comment,.hljs-formula{color:var(--color-prettylights-syntax-comment)}` +
  `.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:var(--color-prettylights-syntax-entity-tag)}` +
  `.hljs-subst{color:var(--fgColor-default)}` +
  `.hljs-section{color:var(--color-prettylights-syntax-entity);font-weight:700}` +
  `.hljs-bullet{color:var(--color-prettylights-syntax-variable)}` +
  `.hljs-emphasis{color:var(--fgColor-default);font-style:italic}` +
  `.hljs-strong{color:var(--fgColor-default);font-weight:700}` +
  `.hljs-addition{color:var(--color-prettylights-syntax-markup-inserted-text);background-color:var(--color-prettylights-syntax-markup-inserted-bg)}` +
  `.hljs-deletion{color:var(--color-prettylights-syntax-markup-deleted-text);background-color:var(--color-prettylights-syntax-markup-deleted-bg)}`;

// GFM theming layer: public --gfm-* custom properties
// Light-mode defaults (on :root)
const GFM_THEME_VARS_LIGHT = `--gfm-fg-default:#1f2328;` +
  `--gfm-fg-heading:#1f2328;` +
  `--gfm-fg-muted:#59636e;` +
  `--gfm-accent-color:#0969da;` +
  `--gfm-accent-hover:#0550ae;` +
  `--gfm-border-color:#d1d9e0;` +
  `--gfm-bg-subtle:#f6f8fa;` +
  `--gfm-bg-surface:#f6f8fa;` +
  `--gfm-inline-code-color:inherit;` +
  `--gfm-inline-code-bg:#818b981f;`;

// Dark-mode overrides
const GFM_THEME_VARS_DARK = `--gfm-fg-default:#f0f6fc;` +
  `--gfm-fg-heading:#f0f6fc;` +
  `--gfm-fg-muted:#9198a1;` +
  `--gfm-accent-color:#1f6feb;` +
  `--gfm-accent-hover:#58a6ff;` +
  `--gfm-border-color:#3d444d;` +
  `--gfm-bg-subtle:#151b23;` +
  `--gfm-bg-surface:#151b23;` +
  `--gfm-inline-code-color:inherit;` +
  `--gfm-inline-code-bg:#656c7633;`;

// Remap Primer internal vars to --gfm-* on .markdown-body
const GFM_REMAP_CSS = `.markdown-body{` +
  `--fgColor-default:var(--gfm-fg-default);` +
  `--fgColor-muted:var(--gfm-fg-muted);` +
  `--borderColor-accent-emphasis:var(--gfm-accent-color);` +
  `--borderColor-default:var(--gfm-border-color);` +
  `--bgColor-muted:var(--gfm-bg-subtle);` +
  `--bgColor-neutral-muted:var(--gfm-inline-code-bg);` +
  `}`;

// Component-level overrides using --gfm-* variables
const GFM_COMPONENT_CSS =
  // Headings
  `.markdown-body h1,.markdown-body h2,.markdown-body h3,` +
  `.markdown-body h4,.markdown-body h5,.markdown-body h6` +
  `{color:var(--gfm-fg-heading)}` +
  // Links
  `.markdown-body a{color:var(--gfm-accent-color)}` +
  `.markdown-body a:hover{color:var(--gfm-accent-hover)}` +
  // Images
  `.markdown-body img{border-radius:6px}` +
  // Code header
  `.markdown-body .code-header{display:flex;align-items:center;` +
  `background:var(--gfm-bg-surface);border:1px solid var(--gfm-border-color);` +
  `border-radius:6px 6px 0 0;padding:4px 12px;font-size:0.85em;` +
  `color:var(--gfm-fg-muted)}` +
  `.markdown-body .code-header+pre{border-top-left-radius:0;border-top-right-radius:0;` +
  `margin-top:0;border-top:0}` +
  // GitHub alerts — base
  `.markdown-body .markdown-alert{padding:8px 16px;margin-bottom:16px;` +
  `border-left:4px solid var(--gfm-border-color);border-radius:0 6px 6px 0}` +
  `.markdown-body .markdown-alert .markdown-alert-title{display:flex;` +
  `align-items:center;gap:8px;font-weight:600;margin-bottom:4px}` +
  // Alert types — light
  `.markdown-body .markdown-alert-note{border-left-color:#0969da}` +
  `.markdown-body .markdown-alert-note .markdown-alert-title{color:#0969da}` +
  `.markdown-body .markdown-alert-tip{border-left-color:#1a7f37}` +
  `.markdown-body .markdown-alert-tip .markdown-alert-title{color:#1a7f37}` +
  `.markdown-body .markdown-alert-important{border-left-color:#8250df}` +
  `.markdown-body .markdown-alert-important .markdown-alert-title{color:#8250df}` +
  `.markdown-body .markdown-alert-warning{border-left-color:#9a6700}` +
  `.markdown-body .markdown-alert-warning .markdown-alert-title{color:#9a6700}` +
  `.markdown-body .markdown-alert-caution{border-left-color:#cf222e}` +
  `.markdown-body .markdown-alert-caution .markdown-alert-title{color:#cf222e}` +
  // Alert types — dark overrides
  `@media(prefers-color-scheme:dark){` +
  `.markdown-body .markdown-alert-note{border-left-color:#1f6feb}` +
  `.markdown-body .markdown-alert-note .markdown-alert-title{color:#1f6feb}` +
  `.markdown-body .markdown-alert-tip{border-left-color:#238636}` +
  `.markdown-body .markdown-alert-tip .markdown-alert-title{color:#238636}` +
  `.markdown-body .markdown-alert-important{border-left-color:#a371f7}` +
  `.markdown-body .markdown-alert-important .markdown-alert-title{color:#a371f7}` +
  `.markdown-body .markdown-alert-warning{border-left-color:#d29922}` +
  `.markdown-body .markdown-alert-warning .markdown-alert-title{color:#d29922}` +
  `.markdown-body .markdown-alert-caution{border-left-color:#f85149}` +
  `.markdown-body .markdown-alert-caution .markdown-alert-title{color:#f85149}` +
  `}` +
  `.dark .markdown-body .markdown-alert-note{border-left-color:#1f6feb}` +
  `.dark .markdown-body .markdown-alert-note .markdown-alert-title{color:#1f6feb}` +
  `.dark .markdown-body .markdown-alert-tip{border-left-color:#238636}` +
  `.dark .markdown-body .markdown-alert-tip .markdown-alert-title{color:#238636}` +
  `.dark .markdown-body .markdown-alert-important{border-left-color:#a371f7}` +
  `.dark .markdown-body .markdown-alert-important .markdown-alert-title{color:#a371f7}` +
  `.dark .markdown-body .markdown-alert-warning{border-left-color:#d29922}` +
  `.dark .markdown-body .markdown-alert-warning .markdown-alert-title{color:#d29922}` +
  `.dark .markdown-body .markdown-alert-caution{border-left-color:#f85149}` +
  `.dark .markdown-body .markdown-alert-caution .markdown-alert-title{color:#f85149}`;

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

export async function build(): Promise<void> {
  console.log("Style generation for @deer/gfm");
  console.log("==============================\n");

  // --- 1. Read source files ---

  console.log("Reading @primer/css markdown styles...");
  const markdownCss = await Deno.readTextFile(
    `${NODE_MODULES}/@primer/css/dist/markdown.css`,
  );

  console.log("Reading @primer/primitives theme CSS...");
  const lightCss = await Deno.readTextFile(
    `${NODE_MODULES}/@primer/primitives/dist/css/functional/themes/light.css`,
  );
  const darkCss = await Deno.readTextFile(
    `${NODE_MODULES}/@primer/primitives/dist/css/functional/themes/dark.css`,
  );
  const sizeCss = await Deno.readTextFile(
    `${NODE_MODULES}/@primer/primitives/dist/css/base/size/size.css`,
  );
  const typoCss = await Deno.readTextFile(
    `${NODE_MODULES}/@primer/primitives/dist/css/base/typography/typography.css`,
  );

  // --- 2. Determine which CSS variables are needed ---

  // Collect all var() references from markdown CSS + syntax highlighting themes
  const referencedVars = new Set<string>();
  for (const src of [markdownCss, STARRY_NIGHT_CSS, HIGHLIGHT_JS_CSS]) {
    for (const v of extractCssVariableRefs(src)) {
      referencedVars.add(v);
    }
  }
  console.log(`Found ${referencedVars.size} referenced CSS variables`);

  // --- 3. Extract and filter variable definitions ---

  const lightDefs = extractCssVariableDefinitions(lightCss);
  const darkDefs = extractCssVariableDefinitions(darkCss);
  const baseDefs = new Map([
    ...extractCssVariableDefinitions(sizeCss),
    ...extractCssVariableDefinitions(typoCss),
  ]);

  // Filter to only variables referenced by our CSS
  const lightVars = filterVariables(lightDefs, referencedVars);
  const darkVars = filterVariables(darkDefs, referencedVars);
  const baseVars = filterVariables(baseDefs, referencedVars);

  console.log(`Light theme: ${lightVars.size} variables`);
  console.log(`Dark theme: ${darkVars.size} variables`);
  console.log(`Base: ${baseVars.size} variables`);

  // --- 4. Assemble the CSS ---

  const lightDecls = formatVarDeclarations(lightVars);
  const darkDecls = formatVarDeclarations(darkVars);
  const baseDecls = formatVarDeclarations(baseVars);

  // Base size/typography variables on :root
  // Light theme as default (:root) + data-attribute selectors
  // Dark theme on .dark class, data-attribute selectors, and prefers-color-scheme
  const variablesCss = `:root{${baseDecls}}` +
    `:root,[data-color-mode="light"][data-light-theme="light"],[data-color-mode="dark"][data-dark-theme="light"]{${lightDecls}}` +
    `[data-color-mode="light"][data-light-theme="dark"],[data-color-mode="dark"][data-dark-theme="dark"],.dark{${darkDecls}}` +
    `@media(prefers-color-scheme:dark){:root{${darkDecls}}}`;

  // GFM public theming layer (--gfm-* custom properties)
  const gfmThemeCss = `/* GFM theme variables */\n` +
    `:root,[data-color-mode="light"][data-light-theme="light"],[data-color-mode="dark"][data-dark-theme="light"]{${GFM_THEME_VARS_LIGHT}}` +
    `[data-color-mode="light"][data-light-theme="dark"],[data-color-mode="dark"][data-dark-theme="dark"],.dark{${GFM_THEME_VARS_DARK}}` +
    `@media(prefers-color-scheme:dark){:root{${GFM_THEME_VARS_DARK}}}`;

  // Remap Primer vars → --gfm-* on .markdown-body
  const gfmRemapCss = `/* GFM theme remapping */\n` + GFM_REMAP_CSS;

  // Clean the markdown CSS (remove sourceMappingURL comment)
  const cleanMarkdownCss = markdownCss
    .replace(/\/\*#\s*sourceMappingURL=.*?\*\//, "")
    .trim();

  // Component overrides (headings, links, alerts, etc.)
  const gfmComponentCss = `/* GFM component styles */\n` + GFM_COMPONENT_CSS;

  // Assembly order: variables → theme → remap → markdown → starry-night → components
  const fullCss = variablesCss + "\n" + gfmThemeCss + "\n" + gfmRemapCss +
    "\n" + cleanMarkdownCss + "\n" +
    `/* Starry-night syntax highlighting (pl- prefix) */\n` + STARRY_NIGHT_CSS +
    "\n" + gfmComponentCss;

  // --- 5. Fetch and process KaTeX CSS ---

  console.log(`\nFetching KaTeX CSS (v${KATEX_VERSION})...`);
  const katexResp = await fetch(`${KATEX_BASE_URL}/katex.min.css`);
  if (!katexResp.ok) {
    throw new Error(`Failed to fetch KaTeX CSS: ${katexResp.status}`);
  }
  let katexCss = await katexResp.text();
  katexCss = rewriteKatexFontUrls(katexCss, KATEX_BASE_URL);

  const katexClasses = extractCssClasses(katexCss);
  console.log(`Extracted ${katexClasses.length} KaTeX classes`);

  // --- 6. Read package versions for provenance ---

  const primerCssPkg = JSON.parse(
    await Deno.readTextFile(`${NODE_MODULES}/@primer/css/package.json`),
  );
  const primerPrimPkg = JSON.parse(
    await Deno.readTextFile(`${NODE_MODULES}/@primer/primitives/package.json`),
  );

  // --- 7. Write style.ts ---

  const now = new Date().toISOString();
  const output = `\
/**
 * @module
 * CSS exports for @deer/gfm.
 *
 * THIS FILE IS GENERATED — do not edit by hand.
 * Run \`deno task gen:style\` to regenerate.
 *
 * Sources:
 *   @primer/css v${primerCssPkg.version} (markdown body styles)
 *   @primer/primitives v${primerPrimPkg.version} (CSS custom properties)
 *   KaTeX v${KATEX_VERSION} (math rendering CSS, fonts from CDN)
 *   highlight.js GitHub theme (lowlight syntax highlighting)
 *   Starry-night token styles (GitHub syntax highlighting)
 *
 * Generated: ${now}
 */

/**
 * Base GitHub-flavored markdown styles plus starry-night syntax highlighting.
 * Supports light/dark themes via CSS variables and data attributes.
 */
export const CSS: string =
  ${JSON.stringify(fullCss)};

/**
 * Highlight.js / lowlight syntax highlighting styles.
 * Use when highlighter is set to "lowlight".
 */
export const HIGHLIGHT_CSS: string =
  ${JSON.stringify(HIGHLIGHT_JS_CSS)};

/**
 * KaTeX math rendering CSS (fonts loaded from CDN).
 */
export const KATEX_CSS: string =
  ${JSON.stringify(katexCss)};

/**
 * Combined CSS for all features.
 * Includes base markdown, starry-night, lowlight, and KaTeX styles.
 */
export const COMBINED_CSS: string = \`\${CSS}\\n\${HIGHLIGHT_CSS}\\n\${KATEX_CSS}\`;
`;

  const outPath = `${ROOT_DIR}/style.ts`;
  await Deno.writeTextFile(outPath, output);
  console.log(`\nWrote ${outPath}`);
  console.log("Done!");
}

if (import.meta.main) {
  await build();
}
