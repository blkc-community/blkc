/**
 * BLKC CLI - Local Blocks
 *
 * `blkc dev` draws a project's own components: a Block whose folder has a
 * render.web.tsx is compiled and registered under its id, replacing a built-in of
 * the same name. Tailwind classes the renderer's stylesheet doesn't have are
 * compiled too, so a change to a forked Block looks right straight away.
 *
 * This runs the project's own code in this process, like any dev server does.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInThisContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { transform } from "sucrase";
import { compile } from "tailwindcss";
import tailwindTheme from "tailwindcss/theme.css";
import * as renderWeb from "@blkc-code/render-web";
import blkcTheme from "@blkc-code/render-web/theme.css";

const { getBlockComponent, registerBlock, unregisterBlock } = renderWeb;

const ENTRY_NAMES = ["render.web.tsx", "render.web.jsx", "render.web.ts", "render.web.js"];
const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".json", "/index.tsx", "/index.ts", "/index.js"];

const BUNDLED: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@blkc-code/render-web": renderWeb,
};

export function findComponentFile(blockDir: string): string | undefined {
  return ENTRY_NAMES.map((name) => path.join(blockDir, name)).find((file) => existsSync(file));
}

/** Load a component file and the relative files it imports. Returns the sources it read. */
function loadModule(file: string, cache: Map<string, { exports: unknown }>, sources: string[]): unknown {
  const cached = cache.get(file);
  if (cached) return cached.exports;

  const source = readFileSync(file, "utf8");
  if (file.endsWith(".json")) return JSON.parse(source);
  sources.push(source);

  const { code } = transform(source, {
    transforms: ["typescript", "jsx", "imports"],
    jsxRuntime: "automatic",
    production: true,
    filePath: file,
  });
  const module = { exports: {} as unknown };
  cache.set(file, module);

  const localRequire = (request: string): unknown => {
    if (request in BUNDLED) return BUNDLED[request];
    if (request.startsWith(".")) {
      const base = path.resolve(path.dirname(file), request);
      const found = EXTENSIONS.map((ext) => base + ext).find((candidate) => existsSync(candidate) && !candidate.endsWith(path.sep));
      if (!found) throw new Error(`Cannot find ${request}, imported from ${path.basename(file)}`);
      return loadModule(found, cache, sources);
    }
    return createRequire(file)(request); // the project's own node_modules
  };

  const wrapper = runInThisContext(`(function (exports, require, module) {${code}\n})`, { filename: file }) as (
    exports: unknown,
    require: (request: string) => unknown,
    module: { exports: unknown },
  ) => void;
  wrapper(module.exports, localRequire, module);
  return module.exports;
}

type TailwindCompiler = Awaited<ReturnType<typeof compile>>;
let tailwind: TailwindCompiler | undefined;

async function compileClasses(sources: string[]): Promise<string> {
  if (sources.length === 0) return "";
  tailwind ??= await compile(
    `@layer theme, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n${blkcTheme}\n@layer utilities { @tailwind utilities; }`,
    { loadStylesheet: async (_id, base) => ({ path: "theme.css", base, content: tailwindTheme }) },
  );
  const candidates = sources.join("\n").split(/[\s"'`]+/).filter((word) => word.length > 0 && word.length < 200);
  // A fresh build each time would keep old classes around, but those are harmless in a preview.
  return tailwind.build(candidates).replace(/<\/style/gi, "<\\/style");
}

export interface LocalBlock {
  id: string;
  file: string;
}

export interface LocalBlocksResult {
  css: string;
  errors: { file: string; message: string }[];
  loaded: string[];
}

/** What we replaced, so removing a local Block brings the built-in back. */
const originals = new Map<string, ReturnType<typeof getBlockComponent>>();

/** Make the registry match the project's Blocks as they are on disk right now. */
export async function syncLocalBlocks(blocks: LocalBlock[]): Promise<LocalBlocksResult> {
  for (const [id, original] of originals) {
    if (original) registerBlock(id, original.component, original.manifest);
    else unregisterBlock(id);
  }
  originals.clear();

  const errors: LocalBlocksResult["errors"] = [];
  const loaded: string[] = [];
  const sources: string[] = [];
  for (const { id, file } of blocks) {
    try {
      const exported = loadModule(file, new Map(), sources) as { default?: unknown };
      const component = typeof exported === "function" ? exported : exported?.default;
      if (typeof component !== "function") {
        throw new Error("It needs a default export: the component to draw.");
      }
      originals.set(id, getBlockComponent(id));
      registerBlock(id, component as Parameters<typeof registerBlock>[1]);
      loaded.push(file);
    } catch (error) {
      errors.push({ file, message: error instanceof Error ? error.message : String(error) });
    }
  }

  let css = "";
  try {
    css = await compileClasses(sources);
  } catch (error) {
    errors.push({ file: "Tailwind", message: error instanceof Error ? error.message : String(error) });
  }
  return { css, errors, loaded };
}
