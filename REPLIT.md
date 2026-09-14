# Running VibeTrace on Replit

The repo is set up so that importing it and pressing **Run** is the whole
setup. This page covers getting it there, confirming it is in real mode before
a call, and what to do when it is not.

---

## 1. Get it into Replit

1. In Replit, choose **Create** → **Import code** → **GitHub**.
2. Paste the repository URL and import. If the repo is private, connect your
   GitHub account first so Replit can see it.
3. Do not pick a template. `.replit` already declares the Node 22 module, the
   run command, and the port mapping.

## 2. Press Run

Replit runs `npm run demo`, which:

1. installs dependencies if `node_modules` is missing,
2. finds a browser — it uses the Chromium that `replit.nix` puts on the
   machine, so there is no 100MB download on a fresh container,
3. builds the dashboard,
4. starts the server on port 3000, which `.replit` maps to port 80.

The first boot then evaluates all three TaskFlow builds with a real browser.
Watch the console for:

```
[vibetrace]   v1 → run #1 · real · reliability 80 · 6/9 behaviours passed
[vibetrace]   v2 → run #2 · real · reliability 94 · 8/9 behaviours passed
[vibetrace]   v3 → run #3 · real · reliability 85 · 7/9 behaviours passed
[vibetrace] demo history ready
```

That takes a minute or two on a small Repl. Those three numbers are your
signal that everything works — and they are your safety net, because History
and Compare are now populated with real runs before the call starts.

## 3. Confirm real mode before the call

In the **Shell** tab:

```bash
npm run demo:check
```

The line that matters is `Chromium`. Green means evaluations drive a real
browser. You can also open `/api/status` in the webview and look for
`"mode":"real"`.

If it says synthetic, the Demo Lab shows a banner saying so. Fix it from the
Shell with `npm run setup:browser`, then Stop and Run again.

## 4. Set up the screen share

The embedded webview is narrow and has Replit chrome around it. Click the
**Open in a new tab** arrow above the webview to get a clean full-width browser
window, then open three tabs from that URL:

| Tab | Path | Why |
| --- | --- | --- |
| 1 | `/demo` | Demo Lab — the whole demo happens here |
| 2 | `/demo-app/v1` | The app under test, so you can show it is a real app |
| 3 | `/history` | Your fallback if a live run misbehaves |

Turn **Presenter notes off** before sharing. The toggle is top right of the
Demo Lab page.

One thing worth knowing: the evaluator always drives the app at
`http://127.0.0.1:3000`, not the public Replit URL. The browser runs beside the
server, so going back out through Replit's proxy would add its latency to every
measurement and make the performance numbers meaningless. The run detail page
shows the local URL for that reason — it is not a mistake, and it is worth
saying out loud if anyone notices.

Then follow [DEMO.md](DEMO.md) for the beat-by-beat script.

## 5. Optional: deploy it so you can send a link

**Deploy** → **Autoscale**. `.replit` already has the build and run commands,
and `PLAYWRIGHT_BROWSERS_PATH=0` keeps any downloaded browser inside
`node_modules` so it survives the hop from the build step to the run step.

Two caveats before you rely on a deployment in a live call:

- A deployed container starts with an empty database and re-seeds on first
  boot, so the very first visitor waits a minute or two for history to appear.
- Autoscale containers sleep. If the call is in five minutes, open the link
  once first to wake it and let it seed.

For a screen share, running it from the Repl itself is simpler and faster than
deploying.

---

## When something goes wrong

| Symptom | What to do |
| --- | --- |
| Demo Lab shows a synthetic banner | Shell: `npm run setup:browser`, then Stop and Run |
| The Repl runs out of memory during boot | Stop, then Shell: `VIBETRACE_SEED=off npm start`. Evaluate one build at a time from the Demo Lab instead of seeding all three at boot |
| First boot feels stuck | It is running three real browser sessions. Wait for `demo history ready` |
| History is cluttered from rehearsing | Shell: `npm run demo:reset`, then Stop and Run |
| Port errors | Leave `PORT` at 3000. `.replit` maps it to 80; changing it breaks the webview |
| A live run fails mid-demo | Switch to the History tab and open a seeded run. Same data, already real |

---

## A note on how you describe it

"It runs on Replit" and "I built it in Replit" are different claims, and the
second one is easy to check — a Repl carries its own history. Say whichever is
actually true for you. The demo is strong on its own merits, and being precise
about where you wrote the code costs you nothing.

If you want the second claim to be true, the cheapest honest route is to keep
building it there. The most useful unfinished piece is the one the README is
already candid about: `server/specToTests.ts` turns the prompt into behaviours
with a keyword pass, not a model. Replacing it with a real model call is a
contained change — it consumes and emits the same `AcceptanceTest` shape, so
nothing downstream moves — and doing that work in the Repl gives you something
real to point at when they ask what you built on the platform.
