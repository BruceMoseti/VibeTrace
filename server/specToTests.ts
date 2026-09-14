import { createHash } from "node:crypto";
import type { AcceptanceTest, FailureCategory } from "../shared/types.js";
import { FLOW_IDS, type FlowId } from "./flows.js";

// Turns a natural-language product spec into the user-level behaviours worth
// checking, and binds each one to the scripted browser journey that proves it.
//
// The mapping is a deterministic keyword pass rather than a model call. That is
// a deliberate MVP boundary, not a shortcut in disguise: everything downstream
// consumes AcceptanceTest, so swapping this file for an LLM that emits the same
// shape changes nothing in the evaluator, scoring, or storage.

interface Rule {
  keywords: RegExp;
  flowId: FlowId;
  category: FailureCategory;
  template: (subject: string) => string;
}

const RULES: Rule[] = [
  {
    keywords: /\b(sign\s?up|register|create an account|account|log ?in|sign ?in|auth|password|credentials)\b/i,
    flowId: "auth.login",
    category: "Authentication",
    template: () => "User can create an account and log in",
  },
  {
    keywords: /\b(sign\s?up|register|account|log ?in|sign ?in|auth|session|logged ?in)\b/i,
    flowId: "auth.session_persists",
    category: "Authentication",
    template: () => "A signed-in user stays signed in after a page refresh",
  },
  {
    keywords: /\b(create|add|new|write|post)\b/i,
    flowId: "item.create",
    category: "UI Interaction",
    template: (s) => `User can create a new ${s}`,
  },
  {
    keywords: /\b(complete|completed|mark|toggle|check off|done|status|persist|save|refresh|reload|remain)\b/i,
    flowId: "item.complete_persists",
    category: "Data Persistence",
    template: (s) => `A completed ${s} is still completed after a refresh`,
  },
  {
    keywords: /\b(delete|remove|archive|trash)\b/i,
    flowId: "item.delete",
    category: "UI Interaction",
    template: (s) => `User can delete a ${s}`,
  },
  {
    keywords: /\b(navigate|navigation|page|route|link|menu|tab|dashboard|view|screen)\b/i,
    flowId: "nav.primary",
    category: "Navigation",
    template: () => "User can navigate between the app's main pages",
  },
  {
    keywords: /\b(api|endpoint|backend|server|fetch|request|database|persist|store|integration)\b/i,
    flowId: "api.health",
    category: "API Failure",
    template: () => "Requests to the backend all succeed",
  },
];

// Every app is expected to load and to be usable at speed, whether or not the
// spec thought to say so.
const ALWAYS: { flowId: FlowId; category: FailureCategory; description: string }[] = [
  {
    flowId: "app.loads",
    category: "Navigation",
    description: "Application loads and renders without a fatal error",
  },
  {
    flowId: "perf.load",
    category: "Performance",
    description: "App becomes interactive within the latency budget",
  },
];

export function detectSubject(spec: string): string {
  const m = spec.match(
    /\b(task|item|note|post|todo|project|record|entry|product|message|event|contact)\b/i,
  );
  return m ? m[1].toLowerCase() : "item";
}

export function specToTests(spec: string): AcceptanceTest[] {
  const subject = detectSubject(spec);
  const byFlow = new Map<FlowId, AcceptanceTest>();

  const add = (flowId: FlowId, category: FailureCategory, description: string) => {
    if (byFlow.has(flowId)) return;
    byFlow.set(flowId, {
      id: shortId(`${flowId}:${description}`),
      description,
      category,
      flowId,
    });
  };

  for (const rule of RULES) {
    if (rule.keywords.test(spec)) {
      add(rule.flowId, rule.category, rule.template(subject));
    }
  }
  for (const base of ALWAYS) add(base.flowId, base.category, base.description);

  // A spec too terse to match anything still deserves a usable smoke suite.
  if (byFlow.size <= ALWAYS.length) {
    add("item.create", "UI Interaction", `User can create a new ${subject}`);
    add("nav.primary", "Navigation", "User can navigate between the app's main pages");
    add("api.health", "API Failure", "Requests to the backend all succeed");
  }

  return FLOW_IDS.map((id) => byFlow.get(id)).filter(
    (t): t is AcceptanceTest => Boolean(t),
  );
}

function shortId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 8);
}
