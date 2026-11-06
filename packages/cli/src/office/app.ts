/** The full-screen office app that `blkc dev` serves. Project text goes in through textContent only. */

export const OFFICE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pixel Office</title>
<style>
  :root { --bg:#14142b; --panel:#1c1c38; --card:#26264a; --line:#38386a; --text:#f1f1f8; --muted:#b6b6d2; --on:#00ff88; --on-text:#0b1a12; --bad:#ff6b81 }
  * { box-sizing: border-box }
  html, body { height: 100%; margin: 0 }
  body { background: var(--bg); color: var(--text); font: 14px/1.4 ui-monospace, Menlo, Consolas, monospace; display: grid; grid-template-columns: minmax(0, 1fr) 390px; overflow: hidden }
  #stage { display: flex; align-items: center; justify-content: center; padding: 16px; min-width: 0; min-height: 0; position: relative }
  canvas { display: block; image-rendering: pixelated; border-radius: 10px; box-shadow: 0 10px 40px #0008; touch-action: manipulation; width: 100%; max-height: 100%; }
  #hint { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); background: #000c; padding: 8px 14px; border-radius: 8px; max-width: 80%; text-align: center }
  aside { background: var(--panel); border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0 }
  header { padding: 12px 14px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 8px }
  header strong { margin-right: auto; overflow-wrap: anywhere }
  nav { display: flex; border-bottom: 1px solid var(--line) }
  nav button { flex: 1; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); padding: 10px 4px; font: inherit; cursor: pointer }
  nav button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--on) }
  main { flex: 1; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px }
  main > * { flex-shrink: 0 }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px }
  .card[aria-current="true"] { border-color: var(--on) }
  .row { display: flex; align-items: center; gap: 6px }
  .row > .grow, input.grow { flex: 1; min-width: 0 }
  .name { font-weight: 700; cursor: pointer; background: none; border: 0; color: inherit; font: inherit; padding: 0; text-align: left; overflow-wrap: anywhere }
  .muted { color: var(--muted); font-size: 12px }
  input, select, button.btn { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; min-width: 0 }
  button.btn { cursor: pointer }
  button.primary { background: var(--on); color: var(--on-text); border-color: var(--on); font-weight: 700 }
  button.x { background: none; border: 0; color: var(--muted); cursor: pointer; font: inherit; padding: 2px 6px }
  button.x:hover { color: var(--bad) }
  :focus-visible { outline: 2px solid var(--on); outline-offset: 1px }
  form { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px dashed var(--line); border-radius: 8px }
  h3 { margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted) }
  .column { display: flex; flex-direction: column; gap: 6px; min-height: 44px; padding: 6px; border-radius: 8px; border: 1px dashed transparent }
  .column.over { border-color: var(--on); background: #00ff8810 }
  .quest { cursor: grab }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  code { display: block; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font-size: 12px; overflow-wrap: anywhere }
  #error { color: var(--bad); padding: 0 14px 8px; font-size: 12px }
  @media (max-width: 860px) { body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); overflow: auto } #stage { padding: 8px } aside { border-left: 0; border-top: 1px solid var(--line) } }
</style>
</head>
<body>
<div id="stage"><canvas id="office" role="img" aria-label="The office. The same agents and quests are listed in the panel."></canvas><div id="hint" hidden></div></div>
<aside aria-label="Manage the office">
  <header><strong id="title">Pixel Office</strong><select id="kit" hidden aria-label="Kit"></select><a class="muted" href="/" title="Preview every Block, Kit and Circuit">Preview</a></header>
  <nav role="tablist">
    <button role="tab" data-tab="team">Agents</button>
    <button role="tab" data-tab="quests">Quests</button>
    <button role="tab" data-tab="connect">Connect</button>
  </nav>
  <main id="panel"></main>
  <div id="error" role="alert"></div>
</aside>
<script src="/canvas.js"></script>
<script src="/office.js"></script>
</body>
</html>
`;

export const OFFICE_JS = `"use strict";
const STATES = { working: "Working", thinking: "Thinking", blocked: "Blocked", reviewing: "Reviewing", idle: "On a break", done: "Finished", away: "Away" };
const COLOURS = { working: "#10b981", thinking: "#0ea5e9", blocked: "#ef4444", reviewing: "#8b5cf6", idle: "#f59e0b", done: "#facc15", away: "#a1a1aa" };
const COLUMNS = [["todo", "To do"], ["doing", "Doing"], ["done", "Done"]];
const $ = (id) => document.getElementById(id);
const make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const params = new URLSearchParams(location.search);
let item = params.get("item") || "";
let tab = "team";
let office;
let data = { agents: [], tasks: [] };
let selected;

const api = () => "/api/office?item=" + encodeURIComponent(item);

async function save() {
  $("error").textContent = "";
  const response = await fetch(api(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agents: data.agents, tasks: data.tasks }) });
  if (!response.ok) { $("error").textContent = "Could not save: " + (await response.text()); return; }
  data = { ...data, ...(await response.json()) };
  office.update(data);
  render(true);
}

function stateSelect(agent) {
  const select = make("select", { ariaLabel: "Status of " + agent.name });
  for (const [value, label] of Object.entries(STATES)) select.append(make("option", { value, textContent: label, selected: agent.state === value }));
  select.onchange = () => { agent.state = select.value; save(); };
  return select;
}

function renderTeam(box) {
  if (data.agents.length === 0) box.append(make("p", { className: "muted", textContent: "No agents yet. Add one below, or connect one from the Connect tab." }));
  for (const agent of data.agents) {
    const name = make("button", { className: "name grow", textContent: agent.name, onclick: () => office.select(agent.id) });
    const remove = make("button", { className: "x", textContent: "✕", ariaLabel: "Remove " + agent.name, onclick: () => { data.agents = data.agents.filter((a) => a !== agent); save(); } });
    const task = make("input", { value: agent.task || "", placeholder: "What are they doing?", ariaLabel: "Task for " + agent.name });
    task.onchange = () => { agent.task = task.value; save(); };
    const dot = make("span", { className: "dot" });
    dot.style.background = COLOURS[agent.state] || COLOURS.away;
    const card = make("div", { className: "card" },
      make("div", { className: "row" }, dot, name, remove),
      agent.role ? make("div", { className: "muted", textContent: agent.role }) : null,
      stateSelect(agent), task);
    if (agent.id === selected) card.setAttribute("aria-current", "true");
    box.append(card);
  }
  const nameInput = make("input", { placeholder: "Name", required: true, maxLength: 24, ariaLabel: "New agent's name" });
  const roleInput = make("input", { placeholder: "Role (optional)", maxLength: 40, ariaLabel: "New agent's role" });
  box.append(make("form", { onsubmit: (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const id = slug(name);
    if (!id) return;
    if (data.agents.some((a) => a.id === id)) { $("error").textContent = name + " is already here."; return; }
    data.agents.push({ id, name, role: roleInput.value.trim(), state: "idle" });
    save();
  } }, nameInput, roleInput, make("button", { className: "btn primary", type: "submit", textContent: "Add agent" })));
}

function moveQuest(quest, state) {
  quest.state = state;
  // The board drives the office: start a quest and its owner gets to work.
  const owner = data.agents.find((a) => a.id === quest.agent);
  if (owner && state === "doing") { owner.state = "working"; owner.task = quest.title; }
  if (owner && state === "done") { owner.state = "done"; owner.task = "Finished: " + quest.title; }
  save();
}

let dragged;
function renderQuests(box) {
  const done = data.tasks.filter((t) => t.state === "done").length;
  box.append(make("div", { className: "muted", textContent: done + " of " + data.tasks.length + " done" }));
  for (const [state, label] of COLUMNS) {
    box.append(make("h3", { textContent: label }));
    const column = make("div", { className: "column" });
    column.dataset.state = state;
    column.ondragover = (event) => { event.preventDefault(); column.classList.add("over"); };
    column.ondragleave = () => column.classList.remove("over");
    column.ondrop = (event) => { event.preventDefault(); column.classList.remove("over"); const quest = dragged; dragged = undefined; if (quest) moveQuest(quest, state); };
    for (const quest of data.tasks.filter((t) => t.state === state)) {
      const owner = make("select", { ariaLabel: "Owner of " + quest.title, className: "grow" }, make("option", { value: "", textContent: "Unassigned" }));
      for (const agent of data.agents) owner.append(make("option", { value: agent.id, textContent: agent.name, selected: quest.agent === agent.id }));
      owner.onchange = () => { quest.agent = owner.value; save(); };
      // A menu as well as dragging, for keyboards and touch screens.
      const move = make("select", { ariaLabel: "Move " + quest.title });
      for (const [value, text] of COLUMNS) move.append(make("option", { value, textContent: text, selected: value === state }));
      move.onchange = () => moveQuest(quest, move.value);
      const remove = make("button", { className: "x", textContent: "✕", ariaLabel: "Delete " + quest.title, onclick: () => { data.tasks = data.tasks.filter((t) => t !== quest); save(); } });
      const card = make("div", { className: "card quest", draggable: true },
        make("div", { className: "row" }, make("span", { className: "grow", textContent: quest.title }), remove),
        make("div", { className: "row" }, owner, move));
      card.ondragstart = (event) => { dragged = quest; event.dataTransfer.setData("text/plain", quest.title); event.dataTransfer.effectAllowed = "move"; };
      card.ondragend = () => { dragged = undefined; };
      column.append(card);
    }
    box.append(column);
  }
  const title = make("input", { placeholder: "New quest", required: true, maxLength: 80, className: "grow", ariaLabel: "New quest" });
  box.append(make("form", { onsubmit: (event) => {
    event.preventDefault();
    if (!title.value.trim()) return;
    data.tasks.push({ title: title.value.trim(), state: "todo" });
    save();
  } }, title, make("button", { className: "btn primary", type: "submit", textContent: "Add quest" })));
}

function renderConnect(box) {
  const kit = "--kit " + item;
  const block = (heading, text, command) => make("div", { className: "card" }, make("strong", { textContent: heading }), make("div", { className: "muted", textContent: text }), make("code", { textContent: command }));
  box.append(make("p", { className: "muted", textContent: "Any agent on this machine can join. Run these in your project, then restart the agent." }));
  box.append(block("Claude Code", "MCP, plus automatic updates through hooks.", "npx @blkc-code/cli@latest office connect claude " + kit));
  box.append(block("Cursor, VS Code, Gemini CLI", "MCP. Pick one: cursor, vscode or gemini.", "npx @blkc-code/cli@latest office connect cursor " + kit));
  box.append(block("Codex", "Prints the command to add the MCP server.", "npx @blkc-code/cli@latest office connect codex " + kit));
  box.append(block("Any other MCP agent", "Prints the settings to paste in.", "npx @blkc-code/cli@latest office connect other " + kit));
  box.append(block("Scripts and everything else", "Anything that can run a command.", 'npx @blkc-code/cli@latest office set "My Agent" working --task "Building" ' + kit));
  box.append(make("p", { className: "muted", textContent: "MCP agents report when they choose to, so ask yours to use the office tools. Only Claude Code's hooks report by themselves." }));
}

function render(force) {
  const active = document.activeElement;
  // Don't pull a form or a card out from under someone when an agent reports in.
  if (!force && (dragged || (active && active.tagName === "INPUT" && $("panel").contains(active) && active.value))) return;
  for (const button of document.querySelectorAll("[data-tab]")) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
  const box = $("panel");
  box.replaceChildren();
  if (tab === "team") renderTeam(box);
  else if (tab === "quests") renderQuests(box);
  else renderConnect(box);
  $("hint").hidden = data.agents.length > 0;
  $("hint").textContent = "The office is empty. Add an agent, or connect one from the Connect tab.";
}

async function start() {
  const kits = await (await fetch("/api/office/kits")).json();
  if (!kits.includes(item)) item = kits[0] || "";
  if (!item) {
    document.body.replaceChildren(make("p", { style: "padding:2rem", textContent: "There is no Kit with an office here. Create one: blkc new kit pixel-office" }));
    return;
  }
  const picker = $("kit");
  picker.hidden = kits.length < 2;
  picker.replaceChildren(...kits.map((k) => make("option", { value: k, textContent: k, selected: k === item })));
  picker.onchange = () => { location.search = "?item=" + encodeURIComponent(picker.value); };

  data = await (await fetch(api())).json();
  const canvas = $("office");
  for (const [name, value] of Object.entries(data.vars || {})) canvas.style.setProperty(name, value);
  const scene = data.scene || {};
  const cols = scene.cols || 26;
  const rows = scene.rows || 17;
  canvas.style.aspectRatio = cols + " / " + rows;
  const fit = () => {
    const box = $("stage").getBoundingClientRect();
    const width = Math.min(box.width - 32, ((box.height || innerHeight) - 32) * (cols / rows));
    canvas.style.width = Math.max(width, 240) + "px";
  };
  addEventListener("resize", fit);
  fit();
  $("title").textContent = data.name || "Pixel Office";
  document.title = data.name || "Pixel Office";
  office = BLKCCanvas.createOffice(canvas, { ...scene, agents: data.agents, tasks: data.tasks }, {
    onSelect(id) { selected = id; if (tab === "team") render(); },
  });
  for (const button of document.querySelectorAll("[data-tab]")) button.onclick = () => { tab = button.dataset.tab; render(); };
  render();

  const refresh = async () => {
    const next = await (await fetch(api())).json();
    data = next;
    office.update(data);
    render();
  };
  const events = new EventSource("/events");
  events.addEventListener("change", () => { refresh().catch(() => {}); });
  events.onerror = () => { $("error").textContent = "Disconnected. Is blkc dev still running?"; };
  events.onopen = () => { $("error").textContent = ""; };
}
start().catch((error) => { $("error").textContent = String(error); });
`;
