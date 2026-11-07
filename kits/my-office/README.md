# Pixel Office

> Forked from https://github.com/blkc-community/kits/tree/main/pixel-office. Its licence still applies; see the `license` field and any NOTICE file here.

A free, MIT-licensed BLKC Kit. The goal is a pixel-art office for your project, with
your AI coding agents as animated characters.

## Status

This first release is a **theme and a landing page**. The office is not built yet: it
needs the `canvas` renderer target, which the BLKC format reserves but no renderer
implements.

## Run it

```bash
npx @blkc-code/cli@latest dev
```

This opens a preview in your browser and reloads when you save. Edit `kit.json`: the
colours and font are under `theme`, and the words and sections under `content.pages`.

To render it inside your own site instead:

```js
import { readFileSync } from "node:fs";
import { renderToHTML } from "@blkc-code/render-web/server";

const kit = JSON.parse(readFileSync("kits/pixel-office/kit.json", "utf8"));
const { html } = renderToHTML(kit, "home");
```

The markup uses Tailwind classes. If your site has no Tailwind, add
`@blkc-code/render-web/styles.css`.

## Credits

Inspired by [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) by Pablo De
Lucca, MIT licensed. See [NOTICE](./NOTICE). No Pixel Agents code or art is included yet.
