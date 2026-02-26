/**
 * Benchmark: starry-night vs lowlight syntax highlighting performance
 *
 * Run with: deno bench --allow-read --allow-env
 */

import { render, warmup } from "./mod.ts";
import {
  render as renderLowlight,
  renderWithMeta as renderWithMetaLowlight,
  warmup as warmupLowlight,
} from "./lowlight.ts";
import {
  render as renderStarryNight,
  warmup as warmupStarryNight,
} from "./starry-night.ts";

// =============================================================================
// Test Documents
// =============================================================================

const smallDoc = `# Hello World

A simple paragraph with **bold** and *italic* text.

\`\`\`typescript
const greeting = "Hello!";
console.log(greeting);
\`\`\`
`;

function generateMediumDoc(): string {
  const sections: string[] = [];

  for (let i = 0; i < 10; i++) {
    sections.push(`
## Section ${i + 1}

This is paragraph content for section ${
      i + 1
    }. It contains **bold text**, *italic text*, and \`inline code\`.

| Column A | Column B | Column C |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |

\`\`\`typescript
function process${i}(input: string): string {
  const result = input.toUpperCase();
  return \`Processed: \${result}\`;
}

interface Config${i} {
  name: string;
  value: number;
}
\`\`\`

- Item one with [a link](https://example.com)
- [x] Completed task
- [ ] Pending task
`);
  }

  return `# Medium Test Document\n\n${sections.join("\n")}`;
}

function generateLargeDoc(): string {
  const sections: string[] = [];

  for (let i = 0; i < 50; i++) {
    sections.push(`
## Chapter ${i + 1}

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

\`\`\`typescript
class DataProcessor<T> {
  private buffer: T[] = [];
  
  async process(data: T): Promise<void> {
    this.buffer.push(data);
    if (this.buffer.length >= 1000) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    const batch = this.buffer.splice(0, 1000);
    console.log(\`Wrote \${batch.length} items\`);
  }
}
\`\`\`

\`\`\`python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
\`\`\`

| Setting | Type | Default |
|---------|------|---------|
| maxSize | number | 1000 |
| timeout | number | 5000 |
`);
  }

  return `# Large Document\n\n${sections.join("\n")}`;
}

function generateCodeHeavyDoc(): string {
  const languages = [
    {
      lang: "typescript",
      code:
        `const x: number = 42;\nfunction add(a: number, b: number): number { return a + b; }`,
    },
    {
      lang: "javascript",
      code: `const arr = [1, 2, 3];\nconst doubled = arr.map(x => x * 2);`,
    },
    { lang: "python", code: `def greet(name):\n    return f"Hello, {name}"` },
    { lang: "rust", code: `fn main() {\n    println!("Hello, world!");\n}` },
    { lang: "go", code: `func main() {\n\tfmt.Println("Hello")\n}` },
    { lang: "sql", code: `SELECT * FROM users WHERE active = true;` },
    { lang: "bash", code: `#!/bin/bash\necho "Hello"` },
    { lang: "css", code: `.container { display: flex; }` },
    { lang: "yaml", code: `name: test\nversion: 1.0` },
    { lang: "html", code: `<div class="container"><p>Hello</p></div>` },
  ];

  const blocks: string[] = [];
  for (let i = 0; i < 10; i++) {
    for (const { lang, code } of languages) {
      blocks.push(`\`\`\`${lang}\n${code}\n\`\`\``);
    }
  }

  return `# Code-Heavy Document\n\n${blocks.join("\n\n")}`;
}

// Pre-generate docs
const mediumDoc = generateMediumDoc();
const largeDoc = generateLargeDoc();
const codeHeavyDoc = generateCodeHeavyDoc();

// =============================================================================
// Warmup - pre-initialize processors
// =============================================================================

// Warm up all highlighters before benchmarks run
await warmupStarryNight();
warmupLowlight();
warmup();

// =============================================================================
// Small Document Benchmarks
// =============================================================================

Deno.bench({
  name: "starry-night",
  group: "small",
  fn: async () => {
    await renderStarryNight(smallDoc);
  },
});

Deno.bench({
  name: "lowlight",
  group: "small",
  baseline: true,
  fn: async () => {
    await renderLowlight(smallDoc);
  },
});

Deno.bench({
  name: "none",
  group: "small",
  fn: async () => {
    await render(smallDoc);
  },
});

// =============================================================================
// Medium Document Benchmarks
// =============================================================================

Deno.bench({
  name: "starry-night",
  group: "medium",
  fn: async () => {
    await renderStarryNight(mediumDoc);
  },
});

Deno.bench({
  name: "lowlight",
  group: "medium",
  baseline: true,
  fn: async () => {
    await renderLowlight(mediumDoc);
  },
});

Deno.bench({
  name: "none",
  group: "medium",
  fn: async () => {
    await render(mediumDoc);
  },
});

// =============================================================================
// Large Document Benchmarks
// =============================================================================

Deno.bench({
  name: "starry-night",
  group: "large",
  fn: async () => {
    await renderStarryNight(largeDoc);
  },
});

Deno.bench({
  name: "lowlight",
  group: "large",
  baseline: true,
  fn: async () => {
    await renderLowlight(largeDoc);
  },
});

Deno.bench({
  name: "none",
  group: "large",
  fn: async () => {
    await render(largeDoc);
  },
});

// =============================================================================
// Code-Heavy Document Benchmarks
// =============================================================================

Deno.bench({
  name: "starry-night",
  group: "code-heavy",
  fn: async () => {
    await renderStarryNight(codeHeavyDoc);
  },
});

Deno.bench({
  name: "lowlight",
  group: "code-heavy",
  baseline: true,
  fn: async () => {
    await renderLowlight(codeHeavyDoc);
  },
});

Deno.bench({
  name: "none",
  group: "code-heavy",
  fn: async () => {
    await render(codeHeavyDoc);
  },
});

// =============================================================================
// render() vs renderWithMeta() — single-pass parity check
// =============================================================================

const metaDoc = `---
title: Benchmark Doc
---

# Introduction

Some content here.

## Getting Started

More content with **bold** and *italic*.

### Code Example

\`\`\`typescript
const x: number = 42;
console.log(x);
\`\`\`

## Conclusion

Final thoughts.
`;

Deno.bench({
  name: "render",
  group: "render-vs-meta",
  baseline: true,
  fn: async () => {
    await renderLowlight(metaDoc);
  },
});

Deno.bench({
  name: "renderWithMeta",
  group: "render-vs-meta",
  fn: async () => {
    await renderWithMetaLowlight(metaDoc);
  },
});
