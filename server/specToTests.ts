import { createHash } from "node:crypto";
import type { AcceptanceTest, FailureCategory } from "../shared/types.js";

// Converts a natural-language product spec into user-level acceptance tests.
//
// This is a deterministic, heuristic converter: it scans the spec for common
// product capabilities and emits matching acceptance tests. It is intentionally
// pluggable — swapping in an LLM here (spec -> tests) requires no changes to the
// evaluator or storage layers, since both operate on the AcceptanceTest shape.

interface Rule {
  keywords: RegExp;
  category: FailureCategory;
  template: (subject: string) => string;
}

const RULES: Rule[] = [
  {
    keywords: /\b(sign\s?up|register|create an account|account|login|log in|sign in|auth)\b/i,
    category: "Authentication",
    template: () => "User can create an account and log in successfully",
  },
  {
    keywords: /\b(log ?out|sign ?out)\b/i,
    category: "Authentication",
    template: () => "User can log out and the session is cleared",
  },
  {
    keywords: /\b(create|add|new)\b.*\b(task|item|note|post|todo|project|record|entry)\b/i,
    category: "UI Interaction",
    template: (s) => `User can create a new ${s}`,
  },
  {
    keywords: /\b(delete|remove)\b.*\b(task|item|note|post|todo|project|record|entry)\b/i,
    category: "UI Interaction",
    template: (s) => `User can delete an existing ${s}`,
  },
  {
    keywords: /\b(complete|mark|toggle|check off|status)\b/i,
    category: "Data Persistence",
    template: () => "Completed items remain completed after a page refresh",
  },
  {
    keywords: /\b(save|persist|store|database|remain|refresh)\b/i,
    category: "Data Persistence",
    template: () => "Created data persists across page reloads",
  },
  {
    keywords: /\b(search|filter|sort)\b/i,
    category: "UI Interaction",
    template: () => "User can search or filter the list of items",
  },
  {
    keywords: /\b(dashboard|chart|metric|graph|report|analytics)\b/i,
    category: "Navigation",
    template: () => "Dashboard renders its primary metrics without errors",
  },
  {
    keywords: /\b(api|endpoint|fetch|request|integration)\b/i,
    category: "API Failure",
    template: () => "Core API requests return successful responses",
  },
  {
    keywords: /\b(navigate|page|route|link|menu|tab)\b/i,
    category: "Navigation",
    template: () => "Primary navigation between pages works correctly",
  },
];

function detectSubject(spec: string): string {
  const m = spec.match(
    /\b(task|item|note|post|todo|project|record|entry|product|message)\b/i,
  );
  return m ? m[1].toLowerCase() : "item";
}

export function specToTests(spec: string): AcceptanceTest[] {
  const subject = detectSubject(spec);
  const seen = new Set<string>();
  const tests: AcceptanceTest[] = [];

  for (const rule of RULES) {
    if (rule.keywords.test(spec)) {
      const description = rule.template(subject);
      if (seen.has(description)) continue;
      seen.add(description);
      tests.push({
        id: shortId(description),
        description,
        category: rule.category,
      });
    }
  }

  // Always guarantee baseline coverage even for terse specs.
  const baseline: AcceptanceTest[] = [
    {
      id: shortId("app loads"),
      description: "Application loads without a fatal error",
      category: "Navigation",
    },
    {
      id: shortId("core action"),
      description: "The primary user workflow completes end-to-end",
      category: "UI Interaction",
    },
  ];
  for (const b of baseline) {
    if (!seen.has(b.description)) {
      seen.add(b.description);
      tests.push(b);
    }
  }

  // Keep MVP focused: 3-8 acceptance tests.
  return tests.slice(0, 8);
}

function shortId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}
