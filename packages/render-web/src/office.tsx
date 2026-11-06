/**
 * BLKC Render-Web - The office Block's markup.
 *
 * A canvas Block has two halves. This one is plain HTML: the canvas element, its data,
 * and a list of who is doing what, which still reads well with no JavaScript. The other
 * half, @blkc-code/render-canvas, finds the canvas and draws in it.
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 */

import type { ReactNode } from "react";
import { clsx } from "./clsx.js";
import type { BlockProps } from "./types.js";

interface OfficeAgentValue { id?: unknown; name?: unknown; role?: unknown; state?: unknown; task?: unknown }
interface OfficeTaskValue { title?: unknown; state?: unknown }

export interface OfficeProps {
  heading?: string;
  intro?: string;
  cols?: number;
  rows?: number;
  rooms?: unknown[];
  doors?: unknown[];
  furniture?: unknown[];
  agents?: OfficeAgentValue[];
  tasks?: OfficeTaskValue[];
}

const STATE_LABEL: Record<string, string> = {
  working: "Working", thinking: "Thinking", blocked: "Blocked", reviewing: "Reviewing", idle: "On a break", done: "Finished", away: "Away",
};
const STATE_CLASS: Record<string, string> = {
  working: "bg-emerald-500", thinking: "bg-sky-500", blocked: "bg-red-500", reviewing: "bg-violet-500", idle: "bg-amber-500", done: "bg-yellow-400", away: "bg-zinc-400",
};
const TASK_MARK: Record<string, string> = { todo: "bg-amber-300", doing: "bg-sky-400", done: "bg-emerald-400" };

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const array = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** JSON that is safe inside a <script>: nothing in it can close the tag. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}

export function OfficeBlock({ props: p, className, style }: BlockProps<OfficeProps>): ReactNode {
  const agents = array<OfficeAgentValue>(p.agents);
  const tasks = array<OfficeTaskValue>(p.tasks);
  const done = tasks.filter((task) => task.state === "done").length;
  const percent = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const scene = { cols: p.cols, rows: p.rows, rooms: p.rooms, doors: p.doors, furniture: p.furniture, agents, tasks };
  const heading = text(p.heading);

  return (
    <section className={clsx("blkc-office w-full px-6 py-16 sm:py-20", className)} style={style} data-blkc-canvas-root="">
      <div className="mx-auto flex w-full max-w-blkc flex-col gap-8">
        {(heading || p.intro) && (
          <header className="flex max-w-2xl flex-col gap-3">
            {heading && <h2 className="blkc-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl">{heading}</h2>}
            {p.intro && <p className="text-lg text-muted-foreground">{text(p.intro)}</p>}
          </header>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="overflow-hidden rounded-xl border border-border bg-muted shadow-lg">
            <canvas
              data-blkc-canvas="office"
              role="img"
              aria-label={`${heading || "Pixel office"}: ${agents.length} agents. Their status is listed beside this picture.`}
              className="block aspect-[26/17] h-auto w-full touch-manipulation [image-rendering:pixelated]"
              style={p.cols && p.rows ? { aspectRatio: `${p.cols} / ${p.rows}` } : undefined}
            />
            <script type="application/json" data-blkc-canvas-data="" dangerouslySetInnerHTML={{ __html: safeJson(scene) }} />
          </div>
          <aside className="flex flex-col gap-6">
            {agents.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Agents</h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {agents.map((agent, index) => {
                    const state = text(agent.state) || "idle";
                    return (
                      <li key={index}>
                        <button
                          type="button"
                          disabled
                          aria-pressed="false"
                          data-blkc-agent={text(agent.id)}
                          className="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-inherit transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default aria-pressed:border-primary aria-pressed:bg-muted"
                        >
                          <span className={clsx("mt-1.5 size-2.5 shrink-0 rounded-full", STATE_CLASS[state] ?? "bg-zinc-400")} aria-hidden="true" />
                          <span className="flex min-w-0 flex-col">
                            <span className="text-sm font-semibold">
                              {text(agent.name) || text(agent.id)}
                              <span className="font-normal text-muted-foreground"> · {STATE_LABEL[state] ?? state}</span>
                            </span>
                            {text(agent.task) && <span className="text-sm text-muted-foreground">{text(agent.task)}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {tasks.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quests: {done} of {tasks.length} done</h3>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Quests finished">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {tasks.map((task, index) => (
                    <li key={index} className={clsx("flex items-start gap-2", task.state === "done" && "text-muted-foreground line-through")}>
                      <span className={clsx("mt-1 size-3 shrink-0 rounded-sm", TASK_MARK[text(task.state)] ?? TASK_MARK["todo"])} aria-hidden="true" />
                      <span>{text(task.title)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
