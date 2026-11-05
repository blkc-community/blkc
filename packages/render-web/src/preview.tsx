/**
 * BLKC Render-Web - Preview any manifest.
 *
 * `<ManifestPreview manifest />` draws a Block, a Kit page or a Circuit. It is
 * what `blkc dev` and the playground show, so it never throws on an incomplete
 * manifest: anything it cannot draw becomes a visible note on the page.
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 */

import React, { ReactNode } from "react";
import { BlockInstance } from "@blkc-code/core";
import { isBlockRegistered, renderBlock } from "./index.js";
import { resolveKitPage, kitPageStyle } from "./kit.js";

export type ManifestKind = "block" | "kit" | "circuit";

type Row = Partial<Record<
  | "id" | "name" | "title" | "slug" | "summary" | "description" | "kind" | "type" | "required"
  | "attributes" | "entryPoint" | "example" | "inputs" | "outputs" | "content" | "pages"
  | "blocks" | "kits" | "kitId" | "blockId" | "version" | "capabilities" | "boards"
  | "columns" | "transitions" | "from" | "to" | "wipLimit",
  unknown
>>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** Work out what a parsed manifest is from its shape; null if it is none of them. */
export function manifestKind(manifest: unknown): ManifestKind | null {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) return null;
  const m = manifest as Row;
  if (Array.isArray(m.kits)) return "circuit";
  if (Array.isArray(m.blocks)) return "kit";
  if (m.kind === "ui" || m.kind === "capability" || m.attributes || m.entryPoint) return "block";
  return null;
}

/** The pages a Kit can show, for a page picker. */
export function kitPages(manifest: unknown): { slug: string; title: string }[] {
  const content = (manifest as Row | null)?.content as Row | undefined;
  return rows(content?.pages).map((page) => ({
    slug: text(page.slug) || "home",
    title: text(page.title) || text(page.slug) || "Home",
  }));
}

function Note({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mx-auto my-6 w-full max-w-3xl rounded-lg border border-border p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Card({ title, summary, label, children }: { title: string; summary?: string; label: string; children?: ReactNode }): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {summary && <p className="text-lg text-muted-foreground">{summary}</p>}
      </header>
      {children}
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }): ReactNode {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((item, index) => <li key={index} className="rounded-lg border border-border px-3 py-2">{item}</li>)}
      </ul>
    </section>
  );
}

function BlockPreview({ manifest }: { manifest: Row }): ReactNode {
  const id = text(manifest.id);
  const name = text(manifest.name) || id;
  const summary = text(manifest.summary);

  if (manifest.kind === "capability" || manifest.entryPoint) {
    return (
      <Card title={name} summary={summary} label="Capability Block">
        <Note>A capability Block runs code and has no page to draw, so this shows what it takes and returns.</Note>
        <ListSection title="Inputs" items={strings(manifest.inputs)} />
        <ListSection title="Outputs" items={strings(manifest.outputs)} />
      </Card>
    );
  }

  const example = (manifest.example ?? {}) as Row;
  if (isBlockRegistered(id)) {
    const result = renderBlock({ block: id, props: example } as BlockInstance);
    if (result.success) return result.element;
    return <Note>Block &quot;{id}&quot; could not render its example: {result.error}</Note>;
  }

  const attributes = Object.entries((manifest.attributes ?? {}) as Record<string, Row>);
  return (
    <Card title={name} summary={summary} label="UI Block">
      <Note>
        There is no component registered for &quot;{id}&quot; yet, so this shows its attributes and example.
        Register one with registerBlock() to see it drawn.
      </Note>
      <ListSection
        title="Attributes"
        items={attributes.map(([key, a]) => `${key}: ${text(a.type) || "unknown"}${a.required ? " (required)" : ""}`)}
      />
      {Object.keys(example).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Example</h2>
          <pre className="overflow-x-auto rounded-lg border border-border p-3 text-xs">{JSON.stringify(example, null, 2)}</pre>
        </section>
      )}
    </Card>
  );
}

function KitPreview({ manifest, page }: { manifest: Row; page?: string }): ReactNode {
  const name = text(manifest.name) || text(manifest.id);
  const pages = kitPages(manifest);
  if (pages.length === 0) {
    return <Note>{name} has no pages yet. Add one to pages/home.json or to content.pages in kit.json.</Note>;
  }
  const slug = page ?? pages[0].slug;
  const instances = resolveKitPage(manifest as never, slug);
  if (!instances) return <Note>{name} has no page called &quot;{slug}&quot;.</Note>;
  if (instances.length === 0) {
    return <Note>This page has no Blocks yet. List some under &quot;blocks&quot; in the page and save.</Note>;
  }
  return instances.map((instance, index) => {
    const result = renderBlock(instance);
    return (
      <React.Fragment key={index}>
        {result.success ? result.element : <Note>{result.error}</Note>}
      </React.Fragment>
    );
  });
}

function Board({ board }: { board: Row }): ReactNode {
  const columns = rows(board.columns);
  const nameOf = (id: unknown): string => text(columns.find((column) => column.id === id)?.name) || text(id);
  const transitions = rows(board.transitions);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold">{text(board.name) || text(board.id)}</h2>
        {text(board.description) && <p className="text-sm text-muted-foreground">{text(board.description)}</p>}
      </div>
      <div className="flex flex-wrap gap-3">
        {columns.map((column, index) => (
          <div key={index} className="flex min-h-32 min-w-40 flex-1 flex-col gap-1 rounded-lg border border-border p-3">
            <h3 className="text-sm font-semibold">{text(column.name) || text(column.id)}</h3>
            {typeof column.wipLimit === "number" && (
              <p className="text-xs text-muted-foreground">Limit: {column.wipLimit}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {transitions.length === 0
          ? "Tasks can move between any columns."
          : `Moves: ${transitions.map((t) => `${nameOf(t.from)} → ${nameOf(t.to)}`).join(", ")}`}
      </p>
    </section>
  );
}

function CircuitPreview({ manifest }: { manifest: Row }): ReactNode {
  const boards = rows(manifest.boards);
  return (
    <Card title={text(manifest.name) || text(manifest.id)} summary={text(manifest.summary)} label="Circuit">
      {boards.length === 0
        ? <Note>This Circuit has no boards yet. Add one to boards/main.json.</Note>
        : boards.map((board, index) => <Board key={index} board={board} />)}
      <ListSection title="Kits" items={rows(manifest.kits).map((kit) => `${text(kit.kitId)} ${text(kit.version)}`)} />
      <ListSection title="Capabilities" items={rows(manifest.capabilities).map((c) => `${text(c.blockId)} ${text(c.version)}`)} />
    </Card>
  );
}

export interface ManifestPreviewProps {
  manifest: unknown;
  /** For a Kit: which page to show. Defaults to its first page. */
  page?: string;
}

/** Draw a Block, a Kit page or a Circuit. */
export function ManifestPreview({ manifest, page }: ManifestPreviewProps): ReactNode {
  const kind = manifestKind(manifest);
  const m = manifest as Row;
  const style = kind === "kit" ? kitPageStyle(manifest as never) : undefined;
  return (
    <div className="blkc-page" style={style}>
      {kind === "block" && <BlockPreview manifest={m} />}
      {kind === "kit" && <KitPreview manifest={m} page={page} />}
      {kind === "circuit" && <CircuitPreview manifest={m} />}
      {kind === null && <Note>This is not a Block, Kit or Circuit manifest.</Note>}
    </div>
  );
}
