import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { blkcThemeCss } from "@blkc-code/tailwind-preset";
import { manifestKind, kitPages } from "./preview.js";
import { renderManifestDocument, renderManifestToHTML } from "./server.js";

const kit = {
  id: "demo",
  name: "Demo",
  blocks: [{ blockId: "hero", version: "^0.2.0" }],
  theme: {
    version: 3,
    settings: {
      color: { palette: [{ slug: "background", name: "Background", color: "#101010" }] },
      typography: { fontFamilies: [{ slug: "pixel", name: "Pixel", fontFamily: "'Press Start 2P', monospace" }] },
    },
  },
  content: {
    pages: [
      { slug: "", title: "Home", blocks: [{ block: "hero", props: { heading: "Welcome home" } }] },
      { slug: "about", title: "About", blocks: [{ block: "text", props: { content: "<p>About us</p>" } }] },
      { slug: "empty", title: "Empty", blocks: [] },
      { slug: "custom", title: "Custom", blocks: [{ block: "not-real", props: {} }, { block: "hero", props: { heading: "Still here" } }] },
    ],
  },
};
const circuit = {
  id: "coach",
  name: "Coach",
  summary: "A coaching business",
  kits: [{ kitId: "demo", version: "^1.0.0" }],
  capabilities: [{ blockId: "mailer", version: "^1.0.0" }],
  boards: [{
    id: "clients",
    name: "Clients",
    columns: [{ id: "lead", name: "Lead", wipLimit: 3 }, { id: "active", name: "Active" }],
    transitions: [{ from: "lead", to: "active" }],
  }],
};

describe("manifestKind", () => {
  it("tells blocks, kits and circuits apart", () => {
    expect(manifestKind({ kind: "ui", attributes: {} })).toBe("block");
    expect(manifestKind({ entryPoint: "./x.ts" })).toBe("block");
    expect(manifestKind(kit)).toBe("kit");
    expect(manifestKind(circuit)).toBe("circuit");
    for (const other of [null, 1, "x", [], {}]) expect(manifestKind(other)).toBeNull();
  });
});

describe("kitPages", () => {
  it("lists pages, calling the empty slug home", () => {
    expect(kitPages(kit)[0]).toEqual({ slug: "home", title: "Home" });
    expect(kitPages({})).toEqual([]);
  });
});

describe("renderManifestToHTML", () => {
  it("draws a registered Block from its example", () => {
    const html = renderManifestToHTML({ kind: "ui", id: "hero", name: "Hero", attributes: {}, example: { heading: "From example" } });
    expect(html).toContain("From example");
    expect(html).toContain("blkc-hero");
  });

  it("describes a Block that has no component, and escapes its content", () => {
    const html = renderManifestToHTML({
      kind: "ui",
      id: "custom",
      name: "<script>alert(1)</script>",
      attributes: { heading: { type: "string", required: true } },
      example: { heading: "<img src=x onerror=alert(1)>" },
    });
    expect(html).toContain("heading: string (required)");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("describes a capability Block", () => {
    const html = renderManifestToHTML({ kind: "capability", id: "mailer", name: "Mailer", entryPoint: "./x.ts", inputs: ["to", "subject"], outputs: ["id"] });
    expect(html).toContain("Capability Block");
    for (const name of ["to", "subject", "id"]) expect(html).toContain(`>${name}</li>`);
  });

  it("draws the chosen Kit page, with the Kit's theme", () => {
    expect(renderManifestToHTML(kit)).toContain("Welcome home");
    expect(renderManifestToHTML(kit)).toContain("--blkc-color-background:#101010");
    expect(renderManifestToHTML(kit, { page: "about" })).toContain("About us");
  });

  it("says so when a Kit has nothing to draw", () => {
    expect(renderManifestToHTML({ ...kit, content: { pages: [] } })).toContain("has no pages yet");
    expect(renderManifestToHTML(kit, { page: "empty" })).toContain("no Blocks yet");
    expect(renderManifestToHTML(kit, { page: "nope" })).toContain("no page called");
  });

  it("keeps drawing a page when one of its Blocks has no component", () => {
    const html = renderManifestToHTML(kit, { page: "custom" });
    expect(html).toContain("not-real");
    expect(html).toContain("Still here");
  });

  it("draws a Circuit's board, moves, Kits and capabilities", () => {
    const html = renderManifestToHTML(circuit);
    for (const expected of ["Clients", "Lead", "Limit: 3", "Lead → Active", "demo ^1.0.0", "mailer ^1.0.0"]) {
      expect(html).toContain(expected);
    }
    expect(renderManifestToHTML({ ...circuit, boards: [] })).toContain("no boards yet");
  });

  it("does not throw on something that is not a manifest", () => {
    expect(renderManifestToHTML({ nope: true })).toContain("not a Block, Kit or Circuit");
  });
});

describe("renderManifestDocument", () => {
  it("is a whole page with the caller's head, an escaped title, and the Kit's font", () => {
    const html = renderManifestDocument({ ...kit, name: "</title><script>x</script>" }, { head: "<style>.mine{}</style>" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>.mine{}</style>");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("https://fonts.googleapis.com/css2?family=Press%20Start%202P&amp;display=swap");
  });

  it("asks for no web font when the theme names none", () => {
    expect(renderManifestDocument(circuit)).not.toContain("fonts.googleapis.com");
  });
});

describe("the office Block", () => {
  const office = { block: "office", props: {
    heading: "Team",
    agents: [{ id: "ada", name: "Ada", state: "working", task: "Build </script><script>alert(1)</script>" }, { id: "bob", state: "dancing" }],
    tasks: [{ title: "One", state: "done" }, { title: "Two", state: "todo" }],
  } };
  const kitWithOffice = { ...kit, content: { pages: [{ slug: "", title: "Home", blocks: [office] }] } };

  it("gives the canvas its data, and can't be broken out of", () => {
    const html = renderManifestToHTML(kitWithOffice);
    expect(html).toContain('data-blkc-canvas="office"');
    const data = /<script type="application\/json"[^>]*>(.*?)<\/script>/s.exec(html)?.[1] ?? "";
    expect(data).not.toContain("<");
    expect(JSON.parse(data).agents[0].name).toBe("Ada");
    expect(html).not.toContain("<script>alert");
  });

  it("reads well with no JavaScript: names, status and quest progress are real text", () => {
    const html = renderManifestToHTML(kitWithOffice);
    for (const expected of ["Ada", "Working", "dancing", "Quests: 1 of 2 done", 'aria-valuenow="50"']) expect(html).toContain(expected);
  });

  it("copes with no agents and bad values", () => {
    for (const props of [{}, { agents: "no", tasks: 3 }, { agents: [{}], tasks: [{}] }]) {
      expect(renderManifestToHTML({ ...kit, content: { pages: [{ slug: "", title: "H", blocks: [{ block: "office", props }] }] } })).toContain("data-blkc-canvas");
    }
  });

  it("adds the script only to a page with a canvas, with the nonce and policy", () => {
    const withCanvas = renderManifestDocument(kitWithOffice, { canvasRuntime: "go();", nonce: "abc" });
    expect(withCanvas).toContain('<script nonce="abc">go();</script>');
    expect(withCanvas).toContain("script-src 'nonce-abc'");
    expect(renderManifestDocument(kit, { canvasRuntime: "go();", nonce: "abc" })).not.toContain("go();");
  });

  it("can't have its script tag closed early by the runtime", () => {
    const html = renderManifestDocument(kitWithOffice, { canvasRuntime: "x='</script>'" });
    expect(html).toContain("<\\/script>");
  });
});

describe("links in a framed preview", () => {
  const links = { ...kit, content: { pages: [{ slug: "", title: "H", blocks: [
    { block: "hero", props: { heading: "H", cta: { label: "Away", href: "https://github.com/x" }, secondaryCta: { label: "Stay", href: "#here" } } },
    { block: "button", props: { label: "Forced", href: "https://example.com/y", target: "_self" } },
    { block: "text", props: { content: "<p><a href=\"https://example.com/z\">in text</a></p>" } },
  ] }] } };
  const tag = (html: string, label: string) => {
    const at = html.indexOf(label);
    return html.slice(html.lastIndexOf("<a ", at), html.indexOf(">", html.lastIndexOf("<a ", at)) + 1);
  };

  it("sends every link to another page to a new tab, even one that asks for _self", () => {
    const html = renderManifestDocument(links, { inFrame: true });
    for (const label of ["Away", "Forced", "in text"]) {
      expect(tag(html, label)).toContain('target="_blank"');
      expect(tag(html, label)).toContain("noopener");
      expect(tag(html, label)).not.toContain("_self");
    }
  });

  it("keeps a link within the page in the frame", () => {
    expect(tag(renderManifestDocument(links, { inFrame: true }), "Stay")).toContain('target="_self"');
  });

  it("leaves links alone outside a frame, with no target forced on them", () => {
    const html = renderManifestDocument(links);
    expect(tag(html, "Away")).not.toContain("target=");
    expect(tag(html, "Forced")).toContain('target="_self"');
  });

  it("does not touch text that only looks like a link", () => {
    const html = renderManifestDocument({ ...kit, content: { pages: [{ slug: "", title: "H", blocks: [{ block: "hero", props: { heading: "<a href=x target=_self>" } }] }] } }, { inFrame: true });
    expect(html).not.toContain("<a href=x");
  });
});

describe("styles.css", () => {
  const css = "dist/styles.css";

  it("maps the same tokens as the Tailwind preset", () => {
    expect(readFileSync("src/theme.css", "utf8")).toContain(blkcThemeCss());
  });

  // Only meaningful after `npm run build`, which CI always runs before the tests.
  it.skipIf(!existsSync(css))("has a rule for every class the previews use", () => {
    const compiled = readFileSync(css, "utf8");
    const everySection = JSON.parse(readFileSync("fixtures/kit-basic.json", "utf8"));
    const office = { block: "office", props: { heading: "H", intro: "I", agents: [{ id: "a", state: "blocked", task: "T" }], tasks: [{ title: "T", state: "done" }] } };
    const html = [renderManifestToHTML({ ...kit, content: { pages: [{ slug: "", title: "H", blocks: [office, { block: "button", props: { label: "B", href: "#" } }, { block: "image", props: { src: "/x.png", alt: "x", caption: "c" } }, { block: "section", props: {} }] }] } }), renderManifestToHTML(kit), renderManifestToHTML(everySection), renderManifestToHTML(circuit), renderManifestToHTML({ kind: "ui", id: "custom", attributes: {}, example: { a: 1 } })].join("");
    const decoded = html.replace(/&amp;/g, "&").replace(/&gt;/g, ">");
    const classes = new Set([...decoded.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
    const missing = [...classes].filter((name) => !name.startsWith("blkc-") && !compiled.includes(`.${name.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)}`));
    expect(missing).toEqual([]);
  });
});
