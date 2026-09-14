import { countRuns, insertRun } from "./db.js";
import { DEMO_VERSIONS, TASKFLOW_SPEC } from "./demoApp.js";
import { runEvaluation } from "./service.js";

// Populates history by evaluating the three bundled TaskFlow versions, so the
// dashboard, history and compare views are already telling a true story the
// first time the app is opened — and so a live demo has a fallback if the
// network, the browser, or the room decides to misbehave.
//
//   VIBETRACE_SEED=real       evaluate the bundled app for real (default)
//   VIBETRACE_SEED=synthetic  skip the browser, use the deterministic engine
//   VIBETRACE_SEED=off        start with an empty history

let warming: Promise<void> | null = null;

export async function seedIfEmpty(baseUrl: string): Promise<void> {
  const mode = (process.env.VIBETRACE_SEED ?? "real").toLowerCase();
  if (mode === "off") return;
  if (countRuns() > 0) return;
  await warmDemoRuns(baseUrl, { forceSynthetic: mode === "synthetic" });
}

export function warmDemoRuns(
  baseUrl: string,
  opts: { forceSynthetic?: boolean } = {},
): Promise<void> {
  if (warming) return warming;
  warming = (async () => {
    console.log(
      `[vibetrace] evaluating the bundled TaskFlow versions (${DEMO_VERSIONS.join(", ")})…`,
    );
    for (const version of DEMO_VERSIONS) {
      const targetUrl = `${baseUrl}/demo-app/${version}`;
      try {
        const run = await runEvaluation(targetUrl, TASKFLOW_SPEC, {
          seed: `taskflow-${version}`,
          forceSynthetic: opts.forceSynthetic,
        });
        const id = insertRun(run);
        const passed = run.tests.filter((t) => t.status === "pass").length;
        console.log(
          `[vibetrace]   ${version} → run #${id} · ${run.mode} · reliability ${run.scores.reliability} · ${passed}/${run.tests.length} behaviours passed`,
        );
      } catch (err) {
        console.error(`[vibetrace]   ${version} failed to evaluate:`, err);
      }
    }
    console.log("[vibetrace] demo history ready");
  })().finally(() => {
    warming = null;
  });
  return warming;
}
