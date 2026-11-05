import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { renderToHTML } from "@blkc-code/render-web/server";

const require = createRequire(import.meta.url);
const kit = JSON.parse(readFileSync(require.resolve("@blkc-code/render-web/fixtures/kit-basic.json"), "utf8"));

const page = renderToHTML(kit, "home");
if (!page.success) throw new Error(page.error);

mkdirSync("dist", { recursive: true });
writeFileSync(
  "dist/index.html",
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${kit.name}</title></head>
<body>${page.html}</body>
</html>
`,
);
