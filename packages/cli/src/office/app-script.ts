/** The office app's script. Project text goes in through textContent only. */

export const OFFICE_JS = `"use strict";
const STATES = { working: "Working", thinking: "Thinking", blocked: "Blocked", reviewing: "Reviewing", idle: "On a break", done: "Finished", away: "Away" };
const COLOURS = { working: "#10b981", thinking: "#0ea5e9", blocked: "#ef4444", reviewing: "#8b5cf6", idle: "#f59e0b", done: "#facc15", away: "#a1a1aa" };
const COLUMNS = [["todo", "To do"], ["doing", "Doing"], ["done", "Done"]];
const FLOORS = ["wood", "carpet", "tile", "stone", "concrete", "grass"];
// Extra furniture you earn by finishing quests. Everything else is always there.
const UNLOCKS = { arcade: 2, beanbag: 2, vending: 3, tv: 4, trophy: 5 };
const TILE = 16;
const $ = (id) => document.getElementById(id);
const make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const label = (id) => id.replace(/^./, (c) => c.toUpperCase());

const params = new URLSearchParams(location.search);
let item = params.get("item") || "";
let tab = "team";
let office;
let data = { agents: [], tasks: [], stats: { questsDone: 0 } };
let layout = { rooms: [], doors: [], furniture: [] };
let selected;
let alerts = [];
let unread = 0;
let soundOn = true;
try { soundOn = localStorage.getItem("blkc-office-sound") !== "off"; } catch {}
const seenLog = new Set();

const api = (path = "/api/office") => path + "?item=" + encodeURIComponent(item);
const levelOf = () => 1 + Math.floor((data.stats?.questsDone || 0) / 3);

// --- Alerts -------------------------------------------------------------------------------------

let audio;
function beep(notes) {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    let at = audio.currentTime;
    for (const [freq, length] of notes) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + length);
      at += length;
    }
  } catch {}
}

function toast(text, isAlert) {
  const box = $("toasts");
  const node = make("div", { className: "toast" + (isAlert ? " alert" : ""), textContent: text });
  box.append(node);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => node.remove(), 6000);
}

function raise(agent, kind) {
  const text = kind === "blocked" ? agent.name + " needs you" : agent.name + " finished";
  alerts.unshift({ id: agent.id, kind, text, task: agent.task || "", at: new Date().toLocaleTimeString() });
  alerts = alerts.slice(0, 50);
  if (tab !== "alerts") unread += 1;
  toast(text + (agent.task ? ": " + agent.task : ""), kind === "blocked");
  beep(kind === "blocked" ? [[660, 0.12], [440, 0.2]] : [[523, 0.09], [659, 0.09], [784, 0.16]]);
  updateTitle();
}

function updateTitle() {
  const blocked = data.agents.filter((a) => a.state === "blocked").length;
  document.title = (blocked ? "(" + blocked + " stuck) " : "") + (data.name || "Pixel Office");
  for (const button of document.querySelectorAll("[data-tab=alerts]")) {
    button.replaceChildren("Alerts", ...(unread > 0 ? [make("span", { className: "badge", textContent: String(unread) })] : []));
  }
}

function compareForAlerts(before, after) {
  for (const agent of after.agents) {
    const was = before.agents.find((a) => a.id === agent.id);
    if (was?.state === agent.state) continue;
    if (agent.state === "blocked" || (was && agent.state === "done")) raise(agent, agent.state);
  }
}

// --- Saving -------------------------------------------------------------------------------------

async function save() {
  $("error").textContent = "";
  const response = await fetch(api(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agents: data.agents, tasks: data.tasks, stats: data.stats }) });
  if (!response.ok) { $("error").textContent = "Could not save: " + (await response.text()); return; }
  data = { ...data, ...(await response.json()) };
  office.update(data);
  updateHud();
  render(true);
}

async function saveLayout() {
  const response = await fetch(api("/api/office/layout"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout) });
  if (!response.ok) $("error").textContent = "Could not save the map: " + (await response.text());
}

function updateHud() {
  const done = data.stats?.questsDone || 0;
  $("level").textContent = "Office level " + levelOf() + " · " + done + " quest" + (done === 1 ? "" : "s") + " finished";
  $("hint").hidden = data.agents.length > 0 || tab === "build";
  $("hint").textContent = "The office is empty. Add an agent, or connect one from the Connect tab.";
  updateTitle();
}

// --- Agents -------------------------------------------------------------------------------------

function stateSelect(agent) {
  const select = make("select", { ariaLabel: "Status of " + agent.name });
  for (const [value, text] of Object.entries(STATES)) select.append(make("option", { value, textContent: text, selected: agent.state === value }));
  select.onchange = () => {
    const was = agent.state;
    agent.state = select.value;
    if (select.value !== was && (select.value === "blocked" || select.value === "done")) raise(agent, select.value);
    save();
  };
  return select;
}

const roomName = (id) => layout.rooms.find((room) => room.id === id)?.name;

function renderTeam(box) {
  if (data.agents.length === 0) box.append(make("p", { className: "muted", textContent: "No agents yet. Add one below, or connect one from the Connect tab." }));
  for (const agent of data.agents) {
    const name = make("button", { className: "name grow", textContent: agent.name, onclick: () => office.select(agent.id) });
    const remove = make("button", { className: "x", textContent: "✕", ariaLabel: "Remove " + agent.name, onclick: () => { data.agents = data.agents.filter((a) => a !== agent); save(); } });
    const task = make("input", { value: agent.task || "", placeholder: "What is it doing?", ariaLabel: "Task for " + agent.name });
    task.onchange = () => { agent.task = task.value; save(); };
    const dot = make("span", { className: "dot" });
    dot.style.background = COLOURS[agent.state] || COLOURS.away;
    const room = make("select", { ariaLabel: "Room for " + agent.name, className: "grow" }, make("option", { value: "", textContent: "Any room" }));
    for (const r of layout.rooms) room.append(make("option", { value: r.id, textContent: r.name || r.id, selected: agent.area === r.id }));
    room.onchange = () => { agent.area = room.value; save(); };
    const count = data.tasks.filter((t) => t.agent === agent.id && t.state === "done").length;
    const card = make("div", { className: "card" + (agent.state === "blocked" ? " alert" : "") },
      make("div", { className: "row" }, dot, name, remove),
      make("div", { className: "muted", textContent: [agent.role, roomName(agent.area) && "In " + roomName(agent.area), count ? count + " quest" + (count === 1 ? "" : "s") + " done" : ""].filter(Boolean).join(" · ") }),
      make("div", { className: "row" }, stateSelect(agent), room), task);
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

// --- Quests -------------------------------------------------------------------------------------

function moveQuest(quest, state) {
  quest.state = state;
  // The board drives the office: start a quest and its owner gets to work.
  const owner = data.agents.find((a) => a.id === quest.agent);
  if (owner && state === "doing") { owner.state = "working"; owner.task = quest.title; }
  if (owner && state === "done") { owner.state = "done"; owner.task = "Finished: " + quest.title; raise(owner, "done"); }
  save();
}

let dragged;
function renderQuests(box) {
  const done = data.tasks.filter((t) => t.state === "done").length;
  box.append(make("div", { className: "muted", textContent: done + " of " + data.tasks.length + " done. Assign a quest and the agent picks it up through its office tools." }));
  for (const [state, text] of COLUMNS) {
    box.append(make("h3", { textContent: text }));
    const column = make("div", { className: "column" });
    column.dataset.state = state;
    column.ondragover = (event) => { event.preventDefault(); column.classList.add("over"); };
    column.ondragleave = () => column.classList.remove("over");
    column.ondrop = (event) => { event.preventDefault(); column.classList.remove("over"); const quest = dragged; dragged = undefined; if (quest) moveQuest(quest, state); };
    for (const quest of data.tasks.filter((t) => t.state === state)) {
      const owner = make("select", { ariaLabel: "Owner of " + quest.title, className: "grow" }, make("option", { value: "", textContent: "Unassigned" }), make("option", { value: "claude", textContent: "Any Claude Code session", selected: quest.agent === "claude" }));
      for (const agent of data.agents) owner.append(make("option", { value: agent.id, textContent: agent.name, selected: quest.agent === agent.id }));
      owner.onchange = () => { quest.agent = owner.value; if (quest.by && quest.by !== "user" && owner.value) quest.by = "user"; save(); };
      // A menu as well as dragging, for keyboards and touch screens.
      const move = make("select", { ariaLabel: "Move " + quest.title });
      for (const [value, name] of COLUMNS) move.append(make("option", { value, textContent: name, selected: value === state }));
      move.onchange = () => moveQuest(quest, move.value);
      const remove = make("button", { className: "x", textContent: "✕", ariaLabel: "Delete " + quest.title, onclick: () => { data.tasks = data.tasks.filter((t) => t !== quest); save(); } });
      const detail = make("textarea", { value: quest.detail || "", placeholder: "Details for the agent", ariaLabel: "Details for " + quest.title });
      detail.onchange = () => { quest.detail = detail.value; save(); };
      const card = make("div", { className: "card quest", draggable: true },
        make("div", { className: "row" }, make("span", { className: "grow", textContent: quest.title }), remove),
        quest.by && quest.by !== "user" ? make("div", { className: "warn", textContent: "Added by " + quest.by + ". Assign it yourself to hand it out." }) : null,
        make("div", { className: "row" }, owner, move), detail);
      card.ondragstart = (event) => {
        dragged = quest;
        event.dataTransfer.setData("text/plain", quest.title);
        event.dataTransfer.effectAllowed = "move";
      };
      card.ondragend = () => { dragged = undefined; };
      column.append(card);
    }
    box.append(column);
  }
  const title = make("input", { placeholder: "New quest", required: true, maxLength: 80, className: "grow", ariaLabel: "New quest" });
  const detail = make("textarea", { placeholder: "Details for the agent (optional)", ariaLabel: "New quest details" });
  box.append(make("form", { onsubmit: (event) => {
    event.preventDefault();
    if (!title.value.trim()) return;
    data.tasks.push({ title: title.value.trim(), state: "todo", detail: detail.value.trim(), by: "user" });
    save();
  } }, title, detail, make("button", { className: "btn primary", type: "submit", textContent: "Add quest" })));
}

// --- Alerts tab ---------------------------------------------------------------------------------

function renderAlerts(box) {
  unread = 0;
  updateTitle();
  const stuck = data.agents.filter((a) => a.state === "blocked");
  if (stuck.length > 0) box.append(make("h3", { textContent: "Waiting for you now" }));
  for (const agent of stuck) {
    box.append(make("div", { className: "card alert" },
      make("button", { className: "name", textContent: agent.name, onclick: () => office.select(agent.id) }),
      make("div", { className: "muted", textContent: agent.task || "This agent is stuck." })));
  }
  box.append(make("h3", { textContent: "Recent" }));
  if (alerts.length === 0) box.append(make("p", { className: "muted", textContent: "Nothing yet. You'll hear a sound here, and get a desktop notification even with this page closed, when an agent is stuck or finishes. blkc dev needs to be running." }));
  for (const alert of alerts) {
    box.append(make("div", { className: "card" + (alert.kind === "blocked" ? " alert" : "") },
      make("div", { className: "row" }, make("strong", { className: "grow", textContent: alert.text }), make("span", { className: "muted", textContent: alert.at })),
      alert.task ? make("div", { className: "muted", textContent: alert.task }) : null));
  }
  const log = layout.log || [];
  if (log.length > 0) {
    box.append(make("h3", { textContent: "How the map has changed" }));
    for (const entry of log.slice().reverse().slice(0, 12)) box.append(make("div", { className: "muted", textContent: new Date(entry.at).toLocaleString() + ": " + entry.text }));
  }
}

// --- Build mode ---------------------------------------------------------------------------------

const build = { tool: "select", type: "desk", room: undefined, ghost: undefined, drag: undefined, moving: undefined, undo: [] };
const confirmReset = { armed: false };

const showLinkCount = () => {
  const count = (layout.links || []).length;
  $("links").hidden = count === 0;
  $("links").textContent = ($("links").getAttribute("aria-pressed") === "true" ? "Hide" : "Show") + " " + count + " code link" + (count === 1 ? "" : "s");
};
const catalog = () => BLKCCanvas.FURNITURE;
const inRoom = (room, x, y) => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;
const roomAt = (x, y) => layout.rooms.find((room) => inRoom(room, x, y));
const itemAt = (x, y) => layout.furniture.slice().reverse().find((it) => {
  const spec = catalog()[it.type];
  return spec && x >= it.x && y >= it.y && x < it.x + spec.w && y < it.y + spec.h;
});

function canPlace(type, x, y, ignoring) {
  const spec = catalog()[type];
  if (!spec) return false;
  if (spec.wall) {
    return layout.rooms.some((room) => y === room.y - 1 && x >= room.x && x < room.x + room.w) && !layout.doors.some((d) => d.x === x && d.y === y);
  }
  for (let dy = 0; dy < spec.h; dy++) {
    for (let dx = 0; dx < spec.w; dx++) {
      if (!roomAt(x + dx, y + dy)) return false;
      if (spec.solid === false) continue;
      const other = itemAt(x + dx, y + dy);
      if (other && other !== ignoring && catalog()[other.type].solid !== false) return false;
    }
  }
  return true;
}

/** Can everyone still get everywhere? Build mode warns, rather than stopping you mid-design. */
function cutOff() {
  const world = office.world;
  const open = (room) => {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (world.walkable[y * world.cols + x]) return { x, y };
    return undefined;
  };
  const start = layout.rooms[0] && open(layout.rooms[0]);
  if (!start) return [];
  return layout.rooms.filter((room) => {
    const tile = open(room);
    return !tile || !BLKCCanvas.findPath(world, start, tile);
  });
}

function commit() {
  office.setLayout(layout);
  saveLayout();
  render(true);
}
function remember() {
  build.undo.push(JSON.stringify(layout));
  if (build.undo.length > 40) build.undo.shift();
}
const lockAt = (x, y) => { const room = roomAt(x, y); if (room) room.locked = true; return room; };
const tileOf = (event) => {
  const t = office.tileAt(event);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
};

function buildDown(event) {
  const { x, y } = tileOf(event);
  if (build.tool === "room") {
    build.drag = { x, y, ex: x, ey: y };
    return;
  }
  if (build.tool === "select") {
    const found = itemAt(x, y);
    if (found) { build.moving = { item: found, dx: x - found.x, dy: y - found.y }; return; }
    build.room = roomAt(x, y)?.id;
    render(true);
  }
}
function buildMove(event) {
  const { x, y } = tileOf(event);
  build.ghost = { x, y };
  if (build.drag) { build.drag.ex = x; build.drag.ey = y; }
}
function buildUp(event) {
  const { x, y } = tileOf(event);
  if (build.tool === "room" && build.drag) {
    const box = { x: Math.min(build.drag.x, x), y: Math.min(build.drag.y, y), w: Math.abs(x - build.drag.x) + 1, h: Math.abs(y - build.drag.y) + 1 };
    build.drag = undefined;
    if (box.w < 3 || box.h < 3) { $("error").textContent = "Drag out a room at least 3 tiles wide and tall."; return; }
    const clash = layout.rooms.some((r) => box.x < r.x + r.w + 1 && r.x < box.x + box.w + 1 && box.y < r.y + r.h + 1 && r.y < box.y + box.h + 1);
    if (clash) { $("error").textContent = "Rooms need one tile of wall between them."; return; }
    remember();
    const id = "room-" + Date.now().toString(36);
    layout.rooms.push({ id, name: "New room", ...box, floor: "wood", paths: [], locked: true });
    build.room = id;
    build.tool = "door";
    $("error").textContent = "";
    toast("Now click a wall to add a door.", false);
    commit();
    return;
  }
  if (build.tool === "select" && build.moving) {
    const { item: moved, dx, dy } = build.moving;
    build.moving = undefined;
    const nx = x - dx;
    const ny = y - dy;
    if ((nx !== moved.x || ny !== moved.y) && canPlace(moved.type, nx, ny, moved)) {
      remember();
      lockAt(moved.x, moved.y);
      moved.x = nx;
      moved.y = ny;
      moved.room = lockAt(nx, ny)?.id;
      commit();
    }
    return;
  }
  if (build.tool === "place") {
    if ((UNLOCKS[build.type] || 0) > levelOf()) return;
    if (!canPlace(build.type, x, y)) { $("error").textContent = "That doesn't fit there."; return; }
    $("error").textContent = "";
    remember();
    const room = lockAt(x, y) || layout.rooms.find((r) => y === r.y - 1 && x >= r.x && x < r.x + r.w);
    if (room) room.locked = true;
    layout.furniture.push({ type: build.type, x, y, room: room?.id });
    commit();
    return;
  }
  if (build.tool === "erase") {
    const found = itemAt(x, y);
    const door = layout.doors.find((d) => d.x === x && d.y === y);
    if (!found && !door) return;
    remember();
    if (found) { lockAt(found.x, found.y); layout.furniture = layout.furniture.filter((it) => it !== found); }
    else layout.doors = layout.doors.filter((d) => d !== door);
    commit();
    return;
  }
  if (build.tool === "door") {
    if (roomAt(x, y)) return;
    const existing = layout.doors.find((d) => d.x === x && d.y === y);
    const sides = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => roomAt(a, b));
    if (!existing && sides.length < 2) { $("error").textContent = "A door goes in a wall between two rooms."; return; }
    $("error").textContent = "";
    remember();
    layout.doors = existing ? layout.doors.filter((d) => d !== existing) : [...layout.doors, { x, y }];
    for (const [a, b] of sides) lockAt(a, b);
    commit();
  }
}

function drawOverlay(c) {
  if (tab !== "build") return;
  c.save();
  c.lineWidth = 0.5;
  c.strokeStyle = "rgba(255,255,255,0.13)";
  const cols = office.world.cols;
  const rows = office.world.rows;
  for (let x = 0; x <= cols; x++) { c.beginPath(); c.moveTo(x * TILE, 0); c.lineTo(x * TILE, rows * TILE); c.stroke(); }
  for (let y = 0; y <= rows; y++) { c.beginPath(); c.moveTo(0, y * TILE); c.lineTo(cols * TILE, y * TILE); c.stroke(); }
  const room = layout.rooms.find((r) => r.id === build.room);
  if (room) {
    c.lineWidth = 1;
    c.strokeStyle = "#00ff88";
    c.strokeRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);
  }
  if (build.drag) {
    const { x, y, ex, ey } = build.drag;
    c.fillStyle = "rgba(0,255,136,0.25)";
    c.fillRect(Math.min(x, ex) * TILE, Math.min(y, ey) * TILE, (Math.abs(ex - x) + 1) * TILE, (Math.abs(ey - y) + 1) * TILE);
  }
  if (build.ghost) {
    const type = build.tool === "place" ? build.type : build.moving?.item.type;
    if (type) {
      const spec = catalog()[type];
      const gx = build.ghost.x - (build.moving?.dx || 0);
      const gy = build.ghost.y - (build.moving?.dy || 0);
      c.fillStyle = canPlace(type, gx, gy, build.moving?.item) ? "rgba(0,255,136,0.35)" : "rgba(255,80,100,0.4)";
      c.fillRect(gx * TILE, gy * TILE, spec.w * TILE, spec.h * TILE);
    } else if (build.tool !== "room") {
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(build.ghost.x * TILE, build.ghost.y * TILE, TILE, TILE);
    }
  }
  c.restore();
}

function renderBuild(box) {
  const tools = [["select", "Select / move"], ["place", "Furniture"], ["room", "Draw room"], ["door", "Door"], ["erase", "Erase"]];
  box.append(make("div", { className: "row" }, ...tools.map(([id, text]) => {
    const button = make("button", { className: "btn", textContent: text, onclick: () => { build.tool = id; render(true); } });
    button.dataset.tool = id;
    button.setAttribute("aria-pressed", String(build.tool === id));
    return button;
  })));
  box.append(make("div", { className: "row" }, make("button", { className: "btn", textContent: "Undo", disabled: build.undo.length === 0, onclick: () => {
    layout = JSON.parse(build.undo.pop());
    commit();
  } })));

  if (build.tool === "place") {
    box.append(make("h3", { textContent: "Furniture" }));
    const palette = make("div", { className: "palette" });
    const level = levelOf();
    for (const type of Object.keys(catalog())) {
      const need = UNLOCKS[type] || 0;
      const locked = need > level;
      const button = make("button", { className: "btn", disabled: locked, textContent: locked ? label(type) + " (Lv " + need + ")" : label(type), onclick: () => { build.type = type; render(true); } });
      button.dataset.type = type;
      button.setAttribute("aria-pressed", String(build.type === type));
      palette.append(button);
    }
    box.append(palette);
    box.append(make("p", { className: "muted", textContent: "Click the map to place it. Finish quests to level up and unlock more." }));
  }
  if (build.tool === "room") box.append(make("p", { className: "muted", textContent: "Drag on the map to draw a room, one tile of wall away from the others. Then add a door." }));
  if (build.tool === "door") box.append(make("p", { className: "muted", textContent: "Click a wall between two rooms to add or remove a door." }));
  if (build.tool === "erase") box.append(make("p", { className: "muted", textContent: "Click furniture or a door to remove it." }));

  const room = layout.rooms.find((r) => r.id === build.room);
  if (room && build.tool === "select") {
    const name = make("input", { value: room.name || "", maxLength: 24, ariaLabel: "Room name" });
    name.onchange = () => { remember(); room.name = name.value; room.locked = true; commit(); };
    const floor = make("select", { ariaLabel: "Floor" });
    for (const value of FLOORS) floor.append(make("option", { value, textContent: label(value), selected: room.floor === value }));
    floor.onchange = () => { remember(); room.floor = floor.value; room.locked = true; commit(); };
    const paths = make("input", { value: (room.paths || []).join(", "), placeholder: "src/api/, lib/api/", ariaLabel: "Project folders for this room" });
    paths.onchange = () => { remember(); room.paths = paths.value.split(",").map((p) => p.trim()).filter(Boolean).map((p) => p.endsWith("/") ? p : p + "/"); room.locked = true; commit(); };
    box.append(make("div", { className: "card" },
      make("strong", { textContent: "Room" }), name, floor,
      make("div", { className: "muted", textContent: "Folders that send agents here" }), paths,
      make("div", { className: "muted", textContent: room.locked ? "Edited by you, so the map won't change this room." : "Follows its folder until you edit it." }),
      room.role && room.role !== "vacant" ? null : make("button", { className: "btn", textContent: "Delete room", onclick: () => {
        remember();
        const touching = (d, r) => ((d.x === r.x - 1 || d.x === r.x + r.w) && d.y >= r.y && d.y < r.y + r.h) || ((d.y === r.y - 1 || d.y === r.y + r.h) && d.x >= r.x && d.x < r.x + r.w);
        layout.doors = layout.doors.filter((d) => !touching(d, room));
        layout.furniture = layout.furniture.filter((it) => !(inRoom(room, it.x, it.y) || it.room === room.id));
        layout.rooms = layout.rooms.filter((r) => r !== room);
        build.room = undefined;
        commit();
      } })));
  } else if (build.tool === "select") {
    box.append(make("p", { className: "muted", textContent: "Drag furniture to move it. Click a floor to rename a room, change its floor, or link it to project folders." }));
  }
  const lost = cutOff();
  if (lost.length > 0) box.append(make("p", { className: "warn", textContent: "Agents can't reach: " + lost.map((r) => r.name || r.id).join(", ") + ". Add a door." }));

  box.append(make("h3", { textContent: "Your project's map" }));
  box.append(make("p", { className: "muted", textContent: "Generated from your project's name and folders, so it's unique to this project. New folders add rooms, and bigger folders grow." }));
  const follow = make("input", { type: "checkbox", checked: layout.evolve !== false, id: "follow" });
  follow.onchange = () => { layout.evolve = follow.checked; saveLayout(); };
  box.append(make("label", { className: "row" }, follow, "Follow the project as it changes"));
  box.append(make("button", { className: "btn", textContent: "Generate again from scratch", onclick: async () => {
    if (!confirmReset.armed) {
      confirmReset.armed = true;
      toast("Click again to discard your edits and regenerate.", true);
      setTimeout(() => { confirmReset.armed = false; }, 4000);
      return;
    }
    confirmReset.armed = false;
    await fetch(api("/api/office/map") + "&reset=1", { method: "POST" });
  } }));
}

// --- Connect ------------------------------------------------------------------------------------

function renderConnect(box) {
  const kit = "--kit " + item;
  const block = (heading, text, command) => make("div", { className: "card" }, make("strong", { textContent: heading }), make("div", { className: "muted", textContent: text }), make("code", { textContent: command }));
  box.append(make("p", { className: "muted", textContent: "Any agent on this machine can join. Run these in your project, then restart the agent." }));
  box.append(block("Claude Code", "MCP, plus hooks: reports by itself and receives its quests. Add --auto-work to have it start the next quest on its own.", "npx @blkc-code/cli@latest office connect claude " + kit));
  box.append(block("Cursor, VS Code, Gemini CLI", "MCP. Pick one: cursor, vscode or gemini.", "npx @blkc-code/cli@latest office connect cursor " + kit));
  box.append(block("Codex", "Prints the command to add the MCP server.", "npx @blkc-code/cli@latest office connect codex " + kit));
  box.append(block("Any other MCP agent", "Prints the settings to paste in.", "npx @blkc-code/cli@latest office connect other " + kit));
  box.append(block("Scripts and everything else", "Anything that can run a command.", 'npx @blkc-code/cli@latest office set "My Agent" working --task "Building" --file src/app.ts ' + kit));
  box.append(make("p", { className: "muted", textContent: "MCP agents report and pick up quests when they choose to, so ask yours to use the office tools. Only Claude Code's hooks do it by themselves." }));
}

// --- Page ---------------------------------------------------------------------------------------

function render(force) {
  const active = document.activeElement;
  // Don't pull a form or a card out from under someone when an agent reports in.
  const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && $("panel").contains(active) && active.value;
  if (!force && (dragged || typing)) return;
  for (const button of document.querySelectorAll("[data-tab]")) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
  const box = $("panel");
  box.replaceChildren();
  if (tab === "team") renderTeam(box);
  else if (tab === "quests") renderQuests(box);
  else if (tab === "alerts") renderAlerts(box);
  else if (tab === "build") renderBuild(box);
  else renderConnect(box);
  updateHud();
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

  const first = await (await fetch(api())).json();
  data = first;
  layout = first.scene || {};
  for (const entry of layout.log || []) seenLog.add(entry.at + entry.text);
  const canvas = $("office");
  for (const [name, value] of Object.entries(first.vars || {})) canvas.style.setProperty(name, value);
  const fit = () => {
    const cols = office ? office.world.cols : layout.cols || 26;
    const rows = office ? office.world.rows : layout.rows || 17;
    canvas.style.aspectRatio = cols + " / " + rows;
    const box = $("stage").getBoundingClientRect();
    const width = Math.min(box.width - 32, ((box.height || innerHeight) - 32) * (cols / rows));
    canvas.style.width = Math.max(width, 240) + "px";
  };
  fit();
  addEventListener("resize", fit);
  $("title").textContent = first.name || "Pixel Office";
  office = BLKCCanvas.createOffice(canvas, { ...layout, agents: data.agents, tasks: data.tasks }, {
    camera: true,
    onSelect(id) { selected = id; if (tab === "team") render(); },
  });
  layout.rooms = layout.rooms || office.world.rooms.map((r) => ({ ...r }));
  layout.doors = layout.doors || office.world.doors.map((d) => ({ ...d }));
  layout.furniture = layout.furniture || office.world.furniture.map((f) => ({ ...f }));
  layout.cols = layout.cols || office.world.cols;
  layout.rows = layout.rows || office.world.rows;
  fit();
  office.setOverlay(drawOverlay);
  canvas.addEventListener("pointerdown", (event) => { if (tab === "build") buildDown(event); });
  canvas.addEventListener("pointermove", (event) => { if (tab === "build") buildMove(event); });
  canvas.addEventListener("pointerup", (event) => { if (tab === "build") buildUp(event); });
  canvas.addEventListener("pointerleave", () => { build.ghost = undefined; });

  for (const button of document.querySelectorAll("[data-tab]")) {
    button.onclick = () => {
      tab = button.dataset.tab;
      office.setInteractive(tab !== "build");
      render(true);
    };
  }
  $("links").onclick = () => {
    const on = $("links").getAttribute("aria-pressed") !== "true";
    $("links").setAttribute("aria-pressed", String(on));
    office.setLinksVisible(on);
    try { localStorage.setItem("blkc-links", on ? "on" : "off"); } catch { /* it just won't be remembered */ }
    showLinkCount();
  };
  try {
    if (localStorage.getItem("blkc-links") === "off") { $("links").setAttribute("aria-pressed", "false"); office.setLinksVisible(false); }
  } catch { /* on by default */ }
  showLinkCount();
  $("zoom-in").onclick = () => office.zoom(1.4);
  $("zoom-out").onclick = () => office.zoom(1 / 1.4);
  $("zoom-fit").onclick = () => office.zoom();
  const sound = $("sound");
  sound.setAttribute("aria-pressed", String(soundOn));
  sound.onclick = () => {
    soundOn = !soundOn;
    sound.setAttribute("aria-pressed", String(soundOn));
    try { localStorage.setItem("blkc-office-sound", soundOn ? "on" : "off"); } catch {}
    if (soundOn) beep([[660, 0.08]]);
  };
  render(true);

  const refresh = async () => {
    const next = await (await fetch(api())).json();
    compareForAlerts(data, next);
    data = next;
    office.update(data);
    if (next.scene && JSON.stringify(next.scene) !== JSON.stringify(layout)) {
      for (const entry of next.scene.log || []) {
        const key = entry.at + entry.text;
        if (!seenLog.has(key)) { seenLog.add(key); toast(entry.text, false); }
      }
      layout = next.scene;
      office.setLayout(layout);
      office.setLinksVisible($("links").getAttribute("aria-pressed") === "true");
      showLinkCount();
      fit();
    }
    render();
  };
  const events = new EventSource("/events");
  events.addEventListener("change", () => { refresh().catch(() => {}); });
  events.onerror = () => { $("error").textContent = "Disconnected. Is blkc dev still running?"; };
  events.onopen = () => { $("error").textContent = ""; };
}
start().catch((error) => { $("error").textContent = String(error); });
`;
