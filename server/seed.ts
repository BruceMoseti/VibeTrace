import { countRuns, insertRun } from "./db.js";
import { runEvaluation } from "./service.js";

// Seeds a coherent, realistic multi-version history for a demo "TaskFlow" app so
// the product looks complete on first open and the Compare/History views tell a
// real regression story. Uses fixed seeds so the numbers are stable and the
// version-over-version narrative is intentional (v3 fixes tasks but regresses auth).
const DEMO_URL = "https://taskflow-demo.example.app";
const DEMO_SPEC = `A task manager where users can create an account and log in.
Users can create a task, mark a task complete, and delete a task.
Completed tasks should remain completed after a page refresh.
There is a dashboard showing task metrics and users can navigate between pages.
The app talks to a backend API to persist data.`;

const DEMO_SEEDS = [
  "taskflow-v1-baseline",
  "taskflow-v2-perf-pass",
  "taskflow-v3-auth-regression",
];

export async function seedIfEmpty(): Promise<void> {
  if (countRuns() > 0) return;

  let created = new Date(Date.now() - DEMO_SEEDS.length * 86_400_000);
  for (const seed of DEMO_SEEDS) {
    const run = await runEvaluation(DEMO_URL, DEMO_SPEC, {
      seed,
      forceSynthetic: true,
    });
    // Space the demo runs a day apart for a believable timeline.
    created = new Date(created.getTime() + 86_400_000);
    insertRun({ ...run, createdAt: created.toISOString() });
  }
  console.log(`[vibetrace] seeded ${DEMO_SEEDS.length} demo evaluation runs`);
}
