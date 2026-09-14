// Works out which browser an evaluation would actually use, in the same order
// the server does. Shared by the preflight check and the demo launcher so the
// two can never disagree about whether a run will be real.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const SYSTEM_BINARIES = [
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
];

export function findSystemChromium() {
  for (const name of SYSTEM_BINARIES) {
    const found = spawnSync("which", [name], { encoding: "utf8" });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return "";
}

/**
 * @returns {Promise<{source: "env"|"playwright"|"system"|"none", path: string}>}
 */
export async function resolveChromium() {
  const override = process.env.CHROMIUM_PATH;
  if (override && existsSync(override)) return { source: "env", path: override };

  try {
    const { chromium } = await import("playwright");
    const bundled = chromium.executablePath();
    if (existsSync(bundled)) return { source: "playwright", path: bundled };
  } catch {
    /* playwright itself is not installed */
  }

  const system = findSystemChromium();
  if (system) return { source: "system", path: system };
  return { source: "none", path: "" };
}
