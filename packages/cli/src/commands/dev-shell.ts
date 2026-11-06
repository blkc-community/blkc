/**
 * The page `blkc dev` serves around its previews. The CLI is one bundled file,
 * so this lives here as strings. Everything from the project goes in through
 * textContent, never as markup.
 */

export const SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BLKC dev</title>
<style>
  :root { color-scheme: light dark; --bg:#f4f4f5; --panel:#fff; --text:#18181b; --muted:#71717a; --line:#e4e4e7; --on:#18181b; --on-text:#fff; --err:#b91c1c; --warn:#a16207 }
  @media (prefers-color-scheme: dark) { :root { --bg:#09090b; --panel:#18181b; --text:#fafafa; --muted:#a1a1aa; --line:#27272a; --on:#fafafa; --on-text:#18181b; --err:#f87171; --warn:#facc15 } }
  * { box-sizing: border-box }
  html, body { height: 100% }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, sans-serif; display: grid; grid-template: "side main" 1fr / 240px 1fr }
  aside { grid-area: side; background: var(--panel); border-right: 1px solid var(--line); overflow: auto; padding: 16px 10px }
  aside h1 { font-size: 15px; margin: 0 6px 12px }
  aside h2 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 16px 6px 4px }
  aside button { display: block; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; border-radius: 6px; padding: 6px; cursor: pointer; overflow-wrap: anywhere }
  aside button:hover { background: var(--bg) }
  aside button[aria-current="true"] { background: var(--on); color: var(--on-text) }
  aside .bad::after { content: " ●"; color: var(--err) }
  main { grid-area: main; display: flex; flex-direction: column; min-width: 0; min-height: 0 }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 14px; background: var(--panel); border-bottom: 1px solid var(--line) }
  .bar strong { margin-right: auto; overflow-wrap: anywhere }
  .bar label { color: var(--muted) }
  select, .widths button { font: inherit; color: inherit; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; cursor: pointer }
  .widths { display: flex; gap: 4px }
  .widths button[aria-pressed="true"] { background: var(--on); color: var(--on-text); border-color: var(--on) }
  #frames { flex: 1; min-height: 0; display: flex; gap: 16px; padding: 16px; overflow: auto; justify-content: safe center }
  figure { margin: 0; display: flex; flex-direction: column; flex: none }
  figcaption { color: var(--muted); font-size: 12px; margin-bottom: 4px }
  iframe { flex: 1; border: 1px solid var(--line); border-radius: 8px; background: #fff }
  #issues { max-height: 40%; overflow: auto; background: var(--panel); border-top: 2px solid var(--err); padding: 10px 14px }
  #issues:empty { display: none }
  #issues h2 { margin: 0 0 8px; font-size: 13px; color: var(--err) }
  .issue { padding: 6px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere }
  .issue code { font-weight: 600; color: var(--err) }
  .issue small { display: block; color: var(--muted) }
  .warn { color: var(--warn); padding: 4px 0 }
  #empty { margin: auto; color: var(--muted); text-align: center }
  #status { font-size: 12px; color: var(--err) }
  @media (max-width: 720px) {
    body { grid-template: "side" auto "main" 1fr / 1fr }
    aside { max-height: 30vh; border-right: 0; border-bottom: 1px solid var(--line) }
  }
</style>
</head>
<body>
<aside aria-label="Your project"><h1>BLKC dev</h1><nav id="nav"></nav></aside>
<main>
  <div class="bar">
    <strong id="title"></strong>
    <span id="status" role="status"></span>
    <label id="page-wrap" hidden>Page <select id="page"></select></label>
    <div class="widths" role="group" aria-label="Preview width">
      <button data-width="desktop">Desktop</button>
      <button data-width="tablet">Tablet</button>
      <button data-width="phone">Phone</button>
      <button data-width="all">All</button>
    </div>
  </div>
  <div id="frames"></div>
  <section id="issues" aria-label="Errors"></section>
</main>
<script src="/shell.js"></script>
</body>
</html>
`;

export const SHELL_JS = `"use strict";
const WIDTHS = { phone: 390, tablet: 768, desktop: 1280 };
const GROUPS = [["kit", "Kits"], ["block", "Blocks"], ["circuit", "Circuits"]];
const $ = (id) => document.getElementById(id);
const make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

let state = { items: [], issues: [], warnings: [] };
let selected = decodeURIComponent(location.hash.slice(1));
let page = "";
let width = "desktop";
try { width = localStorage.getItem("blkc-dev-width") || width; } catch {}

function frameSrc(item) {
  const query = new URLSearchParams({ item: item.id, t: String(Date.now()) });
  if (page) query.set("page", page);
  return "/frame?" + query;
}

function renderFrames() {
  const box = $("frames");
  box.replaceChildren();
  const item = state.items.find((i) => i.id === selected);
  if (!item) {
    box.append(make("p", { id: "empty", textContent: "Nothing to preview. Create something with: blkc new kit my-kit" }));
    return;
  }
  const names = width === "all" ? Object.keys(WIDTHS) : [width];
  for (const name of names) {
    const frame = make("iframe", { title: item.name + " at " + name + " width", src: frameSrc(item) });
    // Scripts for the canvas runtime only (the page policy allows no other), and no same-origin,
    // so nothing in a frame can reach this page, its storage or the server.
    frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
    const figure = make("figure", {}, make("figcaption", { textContent: name + " · " + WIDTHS[name] + "px" }), frame);
    figure.style.width = WIDTHS[name] + "px";
    box.append(figure);
  }
}

function renderChrome() {
  const nav = $("nav");
  nav.replaceChildren();
  for (const [kind, label] of GROUPS) {
    const items = state.items.filter((i) => i.kind === kind);
    if (items.length === 0) continue;
    nav.append(make("h2", { textContent: label }));
    for (const item of items) {
      const button = make("button", { textContent: item.name, title: item.id, className: item.valid ? "" : "bad" });
      button.setAttribute("aria-current", String(item.id === selected));
      button.onclick = () => select(item.id);
      nav.append(button);
    }
  }

  const item = state.items.find((i) => i.id === selected);
  $("title").textContent = item ? item.id : "";
  const pages = item ? item.pages : [];
  $("page-wrap").hidden = pages.length < 2;
  if (!pages.some((p) => p.slug === page)) page = "";
  $("page").replaceChildren(...pages.map((p) => make("option", { value: p.slug, textContent: p.title, selected: p.slug === page })));

  for (const button of document.querySelectorAll("[data-width]")) {
    button.setAttribute("aria-pressed", String(button.dataset.width === width));
  }

  const box = $("issues");
  box.replaceChildren();
  if (state.issues.length > 0 || state.warnings.length > 0) {
    if (state.issues.length > 0) {
      box.append(make("h2", { textContent: state.issues.length + (state.issues.length === 1 ? " error" : " errors") }));
    }
    for (const issue of state.issues) {
      const where = issue.file + (issue.field ? ":" + issue.field : "");
      box.append(make("div", { className: "issue" },
        make("code", { textContent: issue.code }), " " + where + "  " + issue.message,
        make("small", { textContent: "Fix: " + issue.fix }),
        make("small", {}, make("a", { href: issue.docs, target: "_blank", rel: "noreferrer", textContent: issue.docs }))));
    }
    for (const warning of state.warnings) box.append(make("div", { className: "warn", textContent: "Warning: " + warning }));
  }
}

function select(id) {
  selected = id;
  page = "";
  history.replaceState(null, "", "#" + encodeURIComponent(id));
  renderChrome();
  renderFrames();
}

async function refresh() {
  const response = await fetch("/api/state", { cache: "no-store" });
  state = await response.json();
  if (!state.items.some((i) => i.id === selected)) {
    selected = state.items[0] ? state.items[0].id : "";
  }
  renderChrome();
  renderFrames();
}

$("page").onchange = (event) => { page = event.target.value; renderFrames(); };
for (const button of document.querySelectorAll("[data-width]")) {
  button.onclick = () => {
    width = button.dataset.width;
    try { localStorage.setItem("blkc-dev-width", width); } catch {}
    renderChrome();
    renderFrames();
  };
}

const events = new EventSource("/events");
events.addEventListener("change", () => { refresh().catch(() => {}); });
events.onerror = () => { $("status").textContent = "Disconnected. Is blkc dev still running?"; };
events.onopen = () => { $("status").textContent = ""; };
refresh().catch((error) => { $("status").textContent = String(error); });
`;
