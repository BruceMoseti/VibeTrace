#!/usr/bin/env node
// One command to be demo-ready: install what is missing, build, and start.
// Everything it does is idempotent, so it is safe to run five minutes before
// the call and again thirty seconds before it.

import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChromium } from "./find-chromium.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT ?? "3000";

function step(label) {
  console.log(`\x1b[36m▸\x1b[0m ${label}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    console.error(`\n\x1b[31mFailed:\x1b[0m ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(resolve(root, "node_modules/express"))) {
  step("Installing dependencies");
  run("npm", ["install"]);
}

let { source, path: chromiumPath } = await resolveChromium();

if (source === "system") {
  // Hosts like Replit already ship a Chromium. Using it skips a 100MB download
  // on every fresh container.
  step(`Using the Chromium already on this machine (${chromiumPath})`);
} else if (source === "none") {
  step("Installing Chromium for Playwright (one time, ~100MB)");
  const install = spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: root,
    stdio: "inherit",
  });
  if (install.status !== 0) {
    console.warn(
      "\n\x1b[33mChromium could not be installed.\x1b[0m Evaluations will fall back to\n" +
        "the synthetic engine and be labelled as such. Everything else still works.\n",
    );
  }
}

// Only forward an explicit path; Playwright finds its own download by itself.
if (source === "playwright") chromiumPath = "";

step("Building the dashboard");
run("npm", ["run", "build"]);

console.log(`
\x1b[32m────────────────────────────────────────────────────────────\x1b[0m
 VibeTrace is starting.

   Dashboard    http://localhost:${PORT}
   Demo Lab     http://localhost:${PORT}/demo      \x1b[2m← start here\x1b[0m
   App under test
                http://localhost:${PORT}/demo-app/v1

 First boot evaluates all three TaskFlow builds in the
 background, so History and Compare are populated even if a
 live run misbehaves.
\x1b[32m────────────────────────────────────────────────────────────\x1b[0m
`);

const server = spawn("npm", ["start"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT,
    ...(chromiumPath ? { CHROMIUM_PATH: chromiumPath } : {}),
  },
});
server.on("exit", (code) => process.exit(code ?? 0));
