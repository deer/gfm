## Codebase Overview

@deer/gfm is a GitHub Flavored Markdown rendering library for Deno, built on the
unified/remark/rehype ecosystem. It provides markdown-to-HTML rendering with
syntax highlighting (starry-night or lowlight), KaTeX math, TOC extraction,
frontmatter parsing, and HTML sanitization.

**Stack**: Deno 2.x, TypeScript, unified ecosystem (remark/rehype), JSR
distribution **Structure**: Single-module library (`mod.ts` for rendering,
`style.ts` for CSS), tests in `test/`, benchmarks in `bench.ts`

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Key Commands

- `deno task test` — Run all tests (requires `-A` permissions)
- `deno task ok` — Run all safety checks
- `deno bench --allow-read --allow-env` — Run benchmarks
- `deno task serve` — Start dev server on port 8000
