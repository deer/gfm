import { launch, type Page } from "@astral/astral";
import { render, type RenderOptions } from "../mod.ts";

type TestCase = {
  markdown: string;
  renderOptions?: RenderOptions;
};

export type TestCases = "tables" | "code" | "gfm" | "math";

export const testCases: Record<TestCases, TestCase> = {
  tables: {
    markdown: Deno.readTextFileSync("./test/fixtures/tables.md"),
  },
  code: {
    markdown: Deno.readTextFileSync("./test/fixtures/code.md"),
  },
  gfm: {
    markdown: Deno.readTextFileSync("./test/fixtures/gfm.md"),
  },
  math: {
    markdown: Deno.readTextFileSync("./test/fixtures/math.md"),
    renderOptions: { allowMath: true },
  },
};

export async function browserTest(
  test: TestCases,
  fn: (page: Page) => Promise<void>,
) {
  const { server, address } = startServer();

  try {
    const browser = await launch({
      args: ["--no-sandbox"],
    });

    try {
      const page = await browser.newPage(`${address}/${test}`);
      await fn(page);
    } finally {
      await browser.close();
    }
  } finally {
    await server.shutdown();
  }
}

export function startServer(port = 0) {
  const server = Deno.serve({ port, onListen: () => {} }, async (req) => {
    const url = new URL(req.url);
    const route = url.pathname.slice(1);

    let body = "";
    if (isTestCase(route)) {
      const testCase = testCases[route];
      body = await render(testCase.markdown, testCase.renderOptions);
    } else if (route === "" || route === "/") {
      body = await render(generateIndexMarkdown());
    } else if (route === "favicon.ico") {
      return new Response(null, { status: 204 });
    } else {
      return new Response("Not found", { status: 404 });
    }

    const htmlContent = wrapBody(body);
    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
    });
  });

  const { port: actualPort } = server.addr as Deno.NetAddr;
  const address = `http://localhost:${actualPort}`;
  return { server, address };
}

function wrapBody(bodyContent: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>deer-gfm test</title>
    <!-- GitHub Markdown CSS -->
    <link rel="stylesheet" href="https://esm.sh/github-markdown-css@5/github-markdown.css">
    <!-- highlight.js for lowlight syntax highlighting -->
    <link rel="stylesheet" href="https://esm.sh/highlight.js@11/styles/github.min.css">
    <!-- KaTeX for math -->
    <link rel="stylesheet" href="https://esm.sh/katex@0.16/dist/katex.min.css">
    <style>
      body {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
      }
    </style>
  </head>
  <body>
    <article class="markdown-body" data-color-mode="light" data-light-theme="light">
      ${bodyContent}
    </article>
  </body>
</html>`;
}

function generateIndexMarkdown() {
  let markdown = "# deer-gfm Test Server\n\n";
  markdown += "Test pages:\n\n";
  markdown += Object.keys(testCases)
    .map((testCase) => `- [${testCase}](/${testCase})`)
    .join("\n");
  return markdown;
}

function isTestCase(route: string): route is TestCases {
  return route in testCases;
}
