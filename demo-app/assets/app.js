// TaskFlow — the app under test.
//
// This is a fixture: a small task manager standing in for something an agent
// generated from a one-paragraph prompt. Three versions are served, each with
// genuinely different runtime behaviour, so VibeTrace has something real to
// drive, fail on, and diff. Nothing here is instrumented for the evaluator —
// no test hooks, no injected verdicts, just ordinary (and sometimes broken)
// application code.
//
//   v1  completing a task never reaches the database; /metrics returns 500
//   v2  both fixed, but a refactor left Delete throwing a TypeError
//   v3  Delete fixed, but the session no longer survives a reload and a
//       synchronous warm-up loop blocks first paint
//
// Server-side faults for each version live in server/demoApp.ts.

const VERSION = (location.pathname.match(/\/demo-app\/(v\d+)/) || [])[1] || "v1";
const API = `/api/demo-app/${VERSION}`;

const CLIENT_FAULTS = {
  v1: { blockingBootMs: 0, deleteBroken: false, sessionInMemoryOnly: false },
  v2: { blockingBootMs: 0, deleteBroken: true, sessionInMemoryOnly: false },
  v3: { blockingBootMs: 2200, deleteBroken: false, sessionInMemoryOnly: true },
};

const faults = CLIENT_FAULTS[VERSION] || CLIENT_FAULTS.v1;

const SESSION_KEY = `taskflow.session.${VERSION}`;
let inMemorySession = null;

function getSession() {
  if (faults.sessionInMemoryOnly) return inMemorySession;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(session) {
  if (faults.sessionInMemoryOnly) {
    inMemorySession = session;
    return;
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable */
  }
}

function clearSession() {
  inMemorySession = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}

const state = {
  route: location.hash.replace("#", "") || "/tasks",
  tasks: [],
  loading: false,
  metrics: null,
  metricsError: null,
  authError: null,
};

async function apiCall(path, options = {}) {
  const session = getSession();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "X-Session": session.token } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`${options.method || "GET"} ${path} → ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
};

function render() {
  const root = document.getElementById("app");
  root.textContent = "";
  if (!getSession()) {
    root.appendChild(renderLogin());
    return;
  }
  root.appendChild(renderTopbar());
  root.appendChild(
    state.route === "/dashboard" ? renderDashboard() : renderTasks(),
  );
}

function renderLogin() {
  const email = el("input", {
    type: "email",
    id: "email",
    placeholder: "you@example.com",
    autocomplete: "username",
  });
  const password = el("input", {
    type: "password",
    id: "password",
    placeholder: "••••••••",
    autocomplete: "current-password",
  });

  const form = el("form", {
    class: "card",
    onsubmit: async (e) => {
      e.preventDefault();
      state.authError = null;
      try {
        const out = await apiCall("/login", {
          method: "POST",
          body: JSON.stringify({
            email: email.value,
            password: password.value,
          }),
        });
        setSession({ token: out.token, email: out.email });
        state.route = "/tasks";
        render();
        loadTasks();
      } catch (err) {
        state.authError = "Could not sign you in. Check your email and password.";
        render();
      }
    },
  });

  form.appendChild(el("h1", { text: "Sign in to TaskFlow" }));
  form.appendChild(
    el("p", {
      class: "sub",
      text: "New here? Entering an email and password creates your account.",
    }),
  );
  if (state.authError) {
    form.appendChild(el("div", { class: "error", text: state.authError }));
  }
  const f1 = el("div", { class: "field" });
  f1.appendChild(el("label", { for: "email", text: "Email" }));
  f1.appendChild(email);
  const f2 = el("div", { class: "field" });
  f2.appendChild(el("label", { for: "password", text: "Password" }));
  f2.appendChild(password);
  form.appendChild(f1);
  form.appendChild(f2);
  form.appendChild(el("button", { type: "submit", text: "Log in" }));

  const wrap = el("main");
  wrap.appendChild(form);
  return wrap;
}

function renderTopbar() {
  const bar = el("header", { class: "topbar" });
  const logo = el("div", { class: "logo", text: "TaskFlow" });
  logo.appendChild(el("span", { class: "ver", text: VERSION }));
  bar.appendChild(logo);

  const nav = el("nav");
  for (const [href, label] of [
    ["#/tasks", "Tasks"],
    ["#/dashboard", "Dashboard"],
  ]) {
    nav.appendChild(
      el("a", {
        href,
        text: label,
        class: state.route === href.slice(1) ? "active" : "",
      }),
    );
  }
  bar.appendChild(nav);

  const right = el("div", { class: "right" });
  const session = getSession();
  if (session?.email) right.appendChild(el("span", { class: "who", text: session.email }));
  right.appendChild(
    el("button", {
      class: "ghost",
      text: "Log out",
      onclick: () => {
        clearSession();
        state.tasks = [];
        render();
      },
    }),
  );
  bar.appendChild(right);
  return bar;
}

function renderTasks() {
  const main = el("main");
  main.appendChild(el("h1", { text: "Your tasks" }));
  main.appendChild(
    el("p", { class: "sub", text: "Everything you are working on, in one list." }),
  );

  const input = el("input", {
    type: "text",
    placeholder: "Add a task",
    "aria-label": "Add a task",
  });
  const composer = el("form", {
    class: "composer",
    onsubmit: async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      input.value = "";
      const task = await apiCall("/tasks", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      state.tasks.push(task);
      render();
    },
  });
  composer.appendChild(input);
  composer.appendChild(el("button", { type: "submit", text: "Add" }));
  main.appendChild(composer);

  const card = el("div", { class: "card" });
  if (state.loading) {
    card.appendChild(el("div", { class: "empty", text: "Loading tasks…" }));
  } else if (state.tasks.length === 0) {
    card.appendChild(
      el("div", { class: "empty", text: "No tasks yet. Add your first one above." }),
    );
  } else {
    const list = el("ul", { class: "tasks" });
    for (const task of state.tasks) list.appendChild(renderTask(task));
    card.appendChild(list);
  }
  main.appendChild(card);
  return main;
}

function renderTask(task) {
  const row = el("li", { class: task.done ? "done" : "" });

  const box = el("input", {
    type: "checkbox",
    "aria-label": `Mark "${task.title}" complete`,
  });
  box.checked = !!task.done;
  box.addEventListener("change", () => {
    // Optimistic: the row updates immediately and the write is fire-and-forget.
    // On v1 the server silently discards it, so the UI and the database only
    // disagree once the page is reloaded.
    task.done = box.checked;
    row.className = task.done ? "done" : "";
    apiCall(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ done: task.done }),
    }).catch((err) => console.error("Failed to save task state", err));
  });

  row.appendChild(box);
  row.appendChild(el("span", { class: "task-title", text: task.title }));
  row.appendChild(
    el("button", {
      text: "Delete",
      "aria-label": `Delete "${task.title}"`,
      onclick: () => deleteTask(task),
    }),
  );
  return row;
}

function deleteTask(task) {
  if (faults.deleteBroken) {
    // Left behind by the v2 refactor: `rowIndex` was removed from state but the
    // delete handler still reaches into it.
    state.rowIndex[task.id].remove();
    return;
  }
  apiCall(`/tasks/${task.id}`, { method: "DELETE" }).then(() => {
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    render();
  });
}

function renderDashboard() {
  const main = el("main");
  main.appendChild(el("h1", { text: "Dashboard" }));
  main.appendChild(el("p", { class: "sub", text: "How your week is going." }));

  if (state.metricsError) {
    main.appendChild(
      el("div", {
        class: "error",
        text: "Couldn't load metrics right now. Please try again later.",
      }),
    );
    return main;
  }
  if (!state.metrics) {
    main.appendChild(el("div", { class: "empty", text: "Loading metrics…" }));
    return main;
  }

  const grid = el("div", { class: "metrics" });
  for (const [k, v] of [
    ["Total tasks", state.metrics.total],
    ["Completed", state.metrics.completed],
    ["Completion rate", `${state.metrics.completionRate}%`],
  ]) {
    const m = el("div", { class: "metric" });
    m.appendChild(el("div", { class: "k", text: k }));
    m.appendChild(el("div", { class: "v", text: String(v) }));
    grid.appendChild(m);
  }
  main.appendChild(grid);
  return main;
}

async function loadTasks() {
  if (!getSession()) return;
  state.loading = true;
  render();
  try {
    state.tasks = await apiCall("/tasks");
  } catch (err) {
    console.error("Failed to load tasks", err);
    state.tasks = [];
  }
  state.loading = false;
  render();
}

async function loadMetrics() {
  if (!getSession()) return;
  state.metrics = null;
  state.metricsError = null;
  render();
  try {
    state.metrics = await apiCall("/metrics");
  } catch (err) {
    console.error("Failed to load dashboard metrics", err);
    state.metricsError = err;
  }
  render();
}

window.addEventListener("hashchange", () => {
  state.route = location.hash.replace("#", "") || "/tasks";
  render();
  if (state.route === "/dashboard") loadMetrics();
});

function boot() {
  if (faults.blockingBootMs > 0) {
    // "Warm-up" added in v3 to precompute layout constants. It is synchronous,
    // so it holds the main thread before anything is painted.
    const until = Date.now() + faults.blockingBootMs;
    let spins = 0;
    while (Date.now() < until) spins++;
    window.__taskflowWarmupSpins = spins;
  }
  render();
  if (getSession()) {
    if (state.route === "/dashboard") loadMetrics();
    else loadTasks();
  }
}

boot();
