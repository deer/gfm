/**
 * Checks that mod.ts line coverage meets a minimum threshold.
 *
 * Usage: deno run -A scripts/check-coverage.ts [threshold]
 *   threshold defaults to 90 (percent)
 */

const threshold = Number(Deno.args[0] ?? 90);

const cmd = new Deno.Command("deno", {
  args: ["coverage", ".coverage"],
  stdout: "piped",
  stderr: "piped",
});

const { stdout, stderr } = await cmd.output();
const output = new TextDecoder().decode(stdout) +
  new TextDecoder().decode(stderr);

// Print the full coverage table
console.log(output);

// Parse mod.ts line coverage from the table:
//   | mod.ts | 89.0 | 95.2 |
// deno-lint-ignore no-control-regex
const stripped = output.replace(/\x1b\[[0-9;]*m/g, "");
const modLine = stripped.split("\n").find((l) => l.includes("mod.ts"));

if (!modLine) {
  console.error("Could not find mod.ts in coverage output");
  Deno.exit(1);
}

const cells = modLine.split("|").map((c) => c.trim()).filter(Boolean);
const linePct = parseFloat(cells[2]); // Branch% is [1], Line% is [2]

if (isNaN(linePct)) {
  console.error(`Could not parse line coverage from: ${modLine}`);
  Deno.exit(1);
}

console.log(`\nmod.ts line coverage: ${linePct}% (threshold: ${threshold}%)`);

if (linePct < threshold) {
  console.error(
    `FAIL: mod.ts line coverage ${linePct}% is below ${threshold}% threshold`,
  );
  Deno.exit(1);
}

console.log("PASS");
