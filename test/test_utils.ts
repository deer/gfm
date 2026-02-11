import { launch, type Page } from "@astral/astral";
import { render, type RenderOptions } from "../mod.ts";
import { COMBINED_CSS } from "../style.ts";

type TestCase = {
  markdown: string;
  renderOptions?: RenderOptions;
  /** Extra CSS appended after the base styles. */
  extraCss?: string;
};

export type TestCases =
  | "tables"
  | "code"
  | "gfm"
  | "math"
  | "theme"
  | "codeblocks"
  | "alerts";

/** Custom theme overrides for the theme demo page — intentionally loud. */
const THEME_OVERRIDES = `
:root,
[data-color-mode="dark"][data-dark-theme="dark"] {
  --gfm-accent-color: #f97316;
  --gfm-accent-hover: #fb923c;
  --gfm-fg-heading: #f97316;
  --gfm-fg-default: #fef3c7;
  --gfm-fg-muted: #fbbf24;
  --gfm-border-color: #92400e;
  --gfm-bg-subtle: #451a03;
  --gfm-bg-surface: #78350f;
  --gfm-inline-code-bg: #92400e66;
}`;

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
  theme: {
    markdown: Deno.readTextFileSync("./test/fixtures/theme.md"),
    extraCss: THEME_OVERRIDES,
  },
  codeblocks: {
    markdown: Deno.readTextFileSync("./test/fixtures/codeblocks.md"),
  },
  alerts: {
    markdown: Deno.readTextFileSync("./test/fixtures/alerts.md"),
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
    let extraCss: string | undefined;
    if (isTestCase(route)) {
      const testCase = testCases[route];
      body = await render(testCase.markdown, testCase.renderOptions);
      extraCss = testCase.extraCss;
    } else if (route === "" || route === "/") {
      body = await render(generateIndexMarkdown());
    } else if (route === "favicon.ico") {
      return new Response(null, { status: 204 });
    } else {
      return new Response("Not found", { status: 404 });
    }

    const htmlContent = wrapBody(body, extraCss);
    return new Response(htmlContent, {
      headers: { "Content-Type": "text/html" },
    });
  });

  const { port: actualPort } = server.addr as Deno.NetAddr;
  const address = `http://localhost:${actualPort}`;
  return { server, address };
}

function wrapBody(bodyContent: string, extraCss?: string) {
  return `<!DOCTYPE html>
<html lang="en" data-color-mode="dark" data-dark-theme="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>deer-gfm test</title>
    <style>${COMBINED_CSS}</style>${
    extraCss ? `\n    <style>${extraCss}</style>` : ""
  }
    <style>
      body {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        background: #0d1117;
        color: #f0f6fc;
      }
    </style>
  </head>
  <body>
    <article class="markdown-body">
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
