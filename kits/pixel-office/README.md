# Pixel Office

A free, MIT-licensed BLKC Kit. The goal is a pixel-art office for your project, with
your AI coding agents as animated characters.

## Status

This first release is a **theme and a landing page**. The office is not built yet: it
needs the `canvas` renderer target, which the BLKC format reserves but no renderer
implements.

## Use it

```bash
npx @blkc-code/cli check kits/pixel-office
```

```js
import { readFileSync } from "node:fs";
import { renderToHTML } from "@blkc-code/render-web/server";

const kit = JSON.parse(readFileSync("kits/pixel-office/kit.json", "utf8"));
const { html } = renderToHTML(kit, "home");
```

## Credits

Inspired by [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) by Pablo De
Lucca, MIT licensed. See [NOTICE](./NOTICE). No Pixel Agents code or art is included yet.
