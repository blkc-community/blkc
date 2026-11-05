# Examples

The same Kit page, `packages/render-web/fixtures/kit-basic.json`, rendered three ways.
CI builds all three and fails on any error (`.github/workflows/examples.yml`).

| Folder | Uses | Output |
|---|---|---|
| `html/` | `renderToHTML` in a plain Node script | `dist/index.html` |
| `next/` | `<KitPage>` in a Next.js server component | static export in `out/` |
| `astro/` | `renderToHTML` in an Astro page | `dist/index.html` |

Each one is a separate project. Run `npm install` and `npm run build` inside its folder.
