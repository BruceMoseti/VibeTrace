#!/usr/bin/env node
// Wipes saved runs so the next boot re-evaluates the bundled builds from
// scratch. Useful between rehearsals when history has filled up with noise.

import { readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../data");

let files = [];
try {
  files = await readdir(dataDir);
} catch {
  console.log("No run database to reset — you are already starting clean.");
  process.exit(0);
}

const dbFiles = files.filter((f) => f.startsWith("vibetrace.db"));
for (const file of dbFiles) await rm(resolve(dataDir, file), { force: true });

console.log(
  dbFiles.length
    ? `Removed ${dbFiles.length} database file(s). The next start will re-evaluate v1, v2 and v3.`
    : "No run database to reset — you are already starting clean.",
);
