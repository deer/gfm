/**
 * Development server for testing deer-gfm output.
 *
 * Run: deno task serve
 * Open: http://localhost:8000
 */

import { startServer } from "./test_utils.ts";

const { address } = startServer(8000);
console.log(`🦌 deer-gfm test server running at ${address}`);
console.log("Press Ctrl+C to stop");
