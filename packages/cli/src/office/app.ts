/** The full-screen office app that `blkc dev` serves. Project text goes in through textContent only. */

export const OFFICE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pixel Office</title>
<style>
  :root { --bg:#14142b; --panel:#1c1c38; --card:#26264a; --line:#38386a; --text:#f1f1f8; --muted:#b6b6d2; --on:#00ff88; --on-text:#0b1a12; --bad:#ff6b81; --warn:#fbbf24 }
  * { box-sizing: border-box }
  html, body { height: 100%; margin: 0 }
  body { background: var(--bg); color: var(--text); font: 14px/1.4 ui-monospace, Menlo, Consolas, monospace; display: grid; grid-template-columns: minmax(0, 1fr) 400px; overflow: hidden }
  #stage { display: flex; align-items: center; justify-content: center; padding: 16px; min-width: 0; min-height: 0; position: relative }
  canvas { display: block; image-rendering: pixelated; border-radius: 10px; box-shadow: 0 10px 40px #0008; touch-action: none; width: 100%; max-height: 100% }
  #hint { position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); background: #000c; padding: 8px 14px; border-radius: 8px; max-width: 80%; text-align: center }
  #hud { position: absolute; top: 24px; right: 28px; display: flex; gap: 6px; align-items: center }
  #hud .pill { background: #000c; padding: 4px 10px; border-radius: 999px; font-size: 12px }
  #toasts { position: absolute; left: 28px; bottom: 28px; display: flex; flex-direction: column; gap: 6px; max-width: 60%; pointer-events: none }
  .toast { background: #000d; border-left: 3px solid var(--on); padding: 6px 12px; border-radius: 6px; font-size: 12px }
  .toast.alert { border-left-color: var(--bad) }
  aside { background: var(--panel); border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0 }
  header { padding: 10px 14px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 8px }
  header strong { margin-right: auto; overflow-wrap: anywhere }
  nav { display: flex; border-bottom: 1px solid var(--line) }
  nav button { flex: 1; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); padding: 10px 2px; font: inherit; font-size: 13px; cursor: pointer }
  nav button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--on) }
  .badge { background: var(--bad); color: #fff; border-radius: 999px; font-size: 10px; padding: 0 5px; margin-left: 4px }
  main { flex: 1; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px }
  main > * { flex-shrink: 0 }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px }
  .card[aria-current="true"] { border-color: var(--on) }
  .card.alert { border-color: var(--bad) }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap }
  .row > .grow, input.grow, select.grow { flex: 1; min-width: 0 }
  .name { font-weight: 700; cursor: pointer; background: none; border: 0; color: inherit; font: inherit; padding: 0; text-align: left; overflow-wrap: anywhere }
  .muted { color: var(--muted); font-size: 12px }
  input, select, textarea, button.btn { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; min-width: 0 }
  textarea { width: 100%; resize: vertical; min-height: 54px; font-size: 12px }
  button.btn { cursor: pointer }
  button.btn[aria-pressed="true"] { background: var(--on); color: var(--on-text); border-color: var(--on) }
  button.btn:disabled { opacity: .45; cursor: not-allowed }
  button.primary { background: var(--on); color: var(--on-text); border-color: var(--on); font-weight: 700 }
  button.x { background: none; border: 0; color: var(--muted); cursor: pointer; font: inherit; padding: 2px 6px }
  button.x:hover { color: var(--bad) }
  :focus-visible { outline: 2px solid var(--on); outline-offset: 1px }
  form { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px dashed var(--line); border-radius: 8px }
  h3 { margin: 6px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted) }
  .column { display: flex; flex-direction: column; gap: 6px; min-height: 44px; padding: 6px; border-radius: 8px; border: 1px dashed transparent }
  .column.over { border-color: var(--on); background: #00ff8810 }
  .quest { cursor: grab }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none }
  .palette { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px }
  .palette button { font-size: 12px; padding: 5px 4px }
  code { display: block; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font-size: 12px; overflow-wrap: anywhere }
  .warn { color: var(--warn); font-size: 12px }
  #error { color: var(--bad); padding: 0 14px 8px; font-size: 12px }
  @media (max-width: 900px) { body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); overflow: auto } #stage { padding: 8px } aside { border-left: 0; border-top: 1px solid var(--line) } }
</style>
</head>
<body>
<div id="stage">
  <canvas id="office" role="img" aria-label="The office. The same agents and quests are listed in the panel."></canvas>
  <div id="hud"><span class="pill" id="level"></span><button class="btn" id="paths" hidden aria-pressed="true" title="Colours each road by its folder, and labels roads and buildings with their real paths."></button><button class="btn" id="links" hidden aria-pressed="true" title="Lines show which parts of your code depend on which, along the route between their rooms. They move towards what is depended on."></button><button class="btn" id="zoom-in" aria-label="Zoom in">+</button><button class="btn" id="zoom-out" aria-label="Zoom out">-</button><button class="btn" id="zoom-fit" aria-label="Fit the whole map">Fit</button></div>
  <div id="toasts" aria-live="polite"></div>
  <div id="hint" hidden></div>
</div>
<aside aria-label="Manage the office">
  <header><strong id="title">Pixel Office</strong><select id="kit" hidden aria-label="Kit"></select><button class="btn" id="sound" aria-pressed="true" title="Sound for alerts">Sound</button><a class="muted" href="/" title="Preview every Block, Kit and Circuit">Preview</a></header>
  <nav role="tablist">
    <button role="tab" data-tab="team">Agents</button>
    <button role="tab" data-tab="quests">Quests</button>
    <button role="tab" data-tab="alerts">Alerts</button>
    <button role="tab" data-tab="build">Build</button>
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

export { OFFICE_JS } from "./app-script.js";
