# Orange-Themed Markdown

This page overrides **9 CSS variables** to create an all-orange theme. Compare
it against the other test pages to see the difference.

## Links and Accents

Visit the [Deno homepage](https://deno.land) or check out
[JSR packages](https://jsr.io). Links and headings are orange via
`--gfm-accent-color` and `--gfm-fg-heading`.

## Inline Code

Use `render()` to convert markdown and `CSS` for styling. Inline code gets a
warm tinted background from `--gfm-inline-code-bg`.

## Code Block

```typescript
const html = await render("# Hello", {
  highlighter: "starry-night",
});
```

## Blockquote

> The code block background comes from `--gfm-bg-subtle` and the header bar from
> `--gfm-bg-surface`. Both are dark amber tones.

## Table

| Variable             | Value     | Controls        |
| -------------------- | --------- | --------------- |
| `--gfm-accent-color` | `#f97316` | Links, headings |
| `--gfm-bg-subtle`    | `#451a03` | Code background |
| `--gfm-border-color` | `#92400e` | Table borders   |
