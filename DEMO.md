# Live demo runbook

Everything below runs on one machine with no network access, no API keys, and
no external URLs. If the wifi dies mid-call, the demo still works.

---

## 1. Ten minutes before the call

```bash
npm run demo:check     # tells you exactly what, if anything, is missing
npm run demo           # installs what's needed, builds, starts, prints the URLs
```

`demo:check` is the one that matters. It answers a single question: will the
evaluator drive a real browser, or quietly fall back to the synthetic engine?
If it prints a red `FAIL`, the fix is on the line underneath it.

First boot evaluates all three TaskFlow builds in the background and saves the
results. That takes about a minute and it is your safety net — History and
Compare are populated with **real** runs before you say a word, so a live run
that misbehaves costs you nothing.

Open these three tabs and leave them open:

| Tab | URL | Why |
| --- | --- | --- |
| 1 | `http://localhost:3000/demo` | Demo Lab — you will spend the whole demo here |
| 2 | `http://localhost:3000/demo-app/v1` | The app under test, so you can show it is a real app |
| 3 | `http://localhost:3000/history` | The fallback if a live run goes sideways |

Turn **Presenter notes off** before you share your screen. The toggle is in the
top right of the Demo Lab page.

---

## 2. The answer

When they ask *"Have you built anything with Replit?"* — say this, and then
stop:

> Yeah. I actually wanted to use Replit seriously before having this
> conversation, so I built a project called VibeTrace.
>
> The idea came from reading about how Replit evaluates Agent. The question I
> kept thinking about was: if an agent builds an entire application from a
> natural-language request, how do we measure whether the finished application
> actually does what the person intended?
>
> VibeTrace takes the original application spec and evaluates the finished app
> against user-level behaviours. I built it around things like functional
> failures, performance, and regressions between runs.
>
> The part I enjoyed most was approaching an AI-built app the same way I
> approach systems at NVIDIA. I wanted to know what failed, whether I could
> reproduce it, and what changed between versions.
>
> Building it made me much more interested in the evaluation side of agents.

**Then stop talking.** Let the silence sit. You want them to say "that's cool,
tell me more" — you want them pulling information out of you, not the other way
around.

When they do, the next line is short:

> I can show you, it takes about three minutes.

---

## 3. The demo, beat by beat

Roughly four minutes end to end. Each beat is one thing to do and one thing to
say. Do not narrate the UI; they can see it.

### Beat 0 — what they are looking at (20s)

**Do:** Start on the Demo Lab page. Point at the prompt card, then switch to tab
2 and click around TaskFlow for five seconds — add a task, tick it.

**Say:** "This is the prompt someone gave an agent, and this is the app it
produced. Three builds of it. The question is whether any of them actually do
what the prompt asked."

### Beat 1 — run v1 live (25s)

**Do:** Back to tab 1. Press **Evaluate** on the v1 card. Say nothing for the
first few seconds and let the console fill.

**Say:** "That's a real browser. It just created an account, added a task,
ticked it off, reloaded the page, and went looking for it again."

### Beat 2 — read the failures (30s)

**Do:** Let it finish, then press **Open full run**. Scroll to the failure
clusters.

**Say:** "Two of these are the same shape: the screen said it worked, the
database disagreed. You only catch that by reloading — which is exactly what a
user does."

If they want proof, scroll to *What the browser saw* — those are real frames
from the session, not mockups.

### Beat 3 — run v2 (20s)

**Do:** Back to Demo Lab. Press **Evaluate** on v2.

**Say:** "Same spec, next build. The agent got a bug report and fixed it."

### Beat 4 — compare v1 → v2 (30s)

**Do:** Press **Compare v1 → v2**.

**Say:** "Three behaviours fixed, one new regression. That's the number I care
about — not whether the app got better overall, but what it traded away."

### Beat 5 — run v3 (25s)

**Do:** Back to Demo Lab. Press **Evaluate** on v3.

**Say:** "This build was an optimisation pass. Watch what it costs."

### Beat 6 — compare v2 → v3 (30s)

**Do:** Press **Compare v2 → v3**.

**Say:** "It fixed delete, broke the session, and got a second and a half
slower. This is the diff I'd gate a deploy on."

**Then stop again.** Let them ask the next question.

---

## 4. If something goes wrong

| What happens | What you do | What you say |
| --- | --- | --- |
| A live run hangs or errors | Go to tab 3 (History) and open any run | "Here's one I ran earlier — same thing." |
| The banner says synthetic mode | Keep going, don't hide it | "No browser on this machine right now, so that run is simulated and labelled as such. The real runs in History were done with Chromium." |
| Port 3000 is taken | `PORT=3001 npm run demo` | — |
| History is cluttered from rehearsing | `npm run demo:reset`, restart | — |
| They ask you to point it at a random public site | Do it, from **New Evaluation** | "Fair warning — the flows are generic heuristics, so on an app it's never seen it'll find the login form or tell you it couldn't. Let's see." |

The last row is worth rehearsing once. Running it against something unfamiliar
and narrating what it gets wrong is a *better* answer than a demo that only
works on the happy path, as long as you sound like you expected it.

---

## 5. Questions they will probably ask

**"Is this real, or is it faking the results?"**
Real. Playwright drives Chromium, and every verdict comes from something the
browser observed — an element that did or didn't appear, a response code, a
measured load time. There is a synthetic fallback for when no browser is
available, and every run is stamped `real` or `synthetic` in the UI so the two
can never be confused.

**"How do you know the generated tests are the right tests?"**
Right now I don't, fully. Spec → behaviours is a deterministic keyword pass, not
a model call — I drew that boundary on purpose so the part I could actually
validate, the execution and the scoring, is the part I built. Everything
downstream consumes the same `AcceptanceTest` shape, so swapping in a model
there changes one file.

**"What happens on an app it has never seen?"**
It looks for affordances the way a person would — a password field, something
that looks like a composer, a control whose accessible name says delete. When it
can't find one it says which affordance was missing rather than inventing a
verdict. That's the honest limit of the current version.

**"What would you do next?"**
Three things. Use a model for spec → behaviours so it handles domain language
instead of keywords. Run each build several times to separate flakiness from a
real regression. And attribute regressions to a diff, so the output is "this
change broke the session" rather than "something broke the session."

**"What was the hard part?"**
Deciding what counts as evidence. It's easy to write something that counts
buttons and calls it a score. The version that's useful is the one that reloads
the page and checks whether the thing you just did survived — because that's the
class of bug an agent-built app actually ships.

---

## 6. Cheat sheet

```
npm run demo:check    preflight — run this first
npm run demo          install if needed, build, start
npm run demo:reset    wipe saved runs and start clean
npm run setup:browser install Chromium only
PORT=3001 npm run demo
```

```
/demo             Demo Lab          the whole demo lives here
/demo-app/v1      App under test    v1, v2, v3
/history          Run history       your fallback
/compare?a=1&b=2  Direct diff link
/new              Point it at any URL
```

Expected scores on a clean boot: **v1 → 80**, **v2 → 94**, **v3 → 85**. If you
see those three numbers, the demo is working.
