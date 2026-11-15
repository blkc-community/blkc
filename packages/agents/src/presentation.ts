/**
 * Presentation config for an office (or any agentic view built on BLKC).
 *
 * This is the "agentic presentation layer": a data-driven description of how an office
 * (or a dispatch center, a video pipeline, etc.) is rendered. It is deliberately
 * separate from office-state.json (which holds runtime data) so that presentation can
 * be forked, themed, and regenerated without touching agent/task state.
 *
 * BLKC provides the rendering primitives (render-canvas, render-web). This config
 * describes *what* to render and *how*. Users (or a skill) can edit it freely.
 */

export type PresentationRoleStyle = {
  color: string;
  label?: string;
};

export type PresentationConfig = {
  /** Schema version for forward compatibility. */
  version: number;
  /** Human-readable name for this presentation. */
  name: string;
  /** Overall visual theme (palette, font). Mirrors the kit theme but can override. */
  theme?: {
    palette?: Record<string, string>;
    fontFamily?: string;
  };
  /** Per-role visual styling (color, label). */
  roles?: Record<string, PresentationRoleStyle>;
  /** Which panels/sections to show. */
  panels?: {
    agents?: boolean;
    tasks?: boolean;
    audit?: boolean;
    map?: boolean;
  };
  /** Asset paths (sprites, backgrounds, tilesets) — relative to the kit folder. */
  assets?: {
    sprite?: string;
    background?: string;
    tileset?: string;
  };
  /** Free-form notes for the user or a generating skill. */
  notes?: string;
};

export const DEFAULT_PRESENTATION: PresentationConfig = {
  version: 1,
  name: "Office",
  theme: {
    palette: {
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      primary: "#00ff88",
      accent: "#ff6b6b",
    },
    fontFamily: "'Press Start 2P', monospace",
  },
  roles: {
    coder: { color: "#3b82f6", label: "Coder" },
    tester: { color: "#22c55e", label: "Tester" },
    reviewer: { color: "#f59e0b", label: "Reviewer" },
  },
  panels: { agents: true, tasks: true, audit: true, map: true },
  assets: {},
};
