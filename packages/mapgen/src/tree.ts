/**
 * A project as a world, before anything is placed. A folder holding an application is a
 * building. A folder holding none is a road, at any depth, named by its literal path. Loose
 * files sit on the road of their own folder, grouped by type. Files that look like secrets
 * are kept apart, for the vault.
 *
 * Only names and counts are read here, and package manifests for links. Never source code.
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_APP_MARKERS, IGNORE, gitignoredNames, isOwnRepo, markerMatcher, readPackage } from "./project-files.js";

export type TreeKind = "road" | "building" | "part" | "group" | "file";

export interface TreeNode {
  /** Stable, from the path: "road:apps", "building:apps/web", "part:apps/web/src/api", "group:apps:Docs", "file:apps/x.md". */
  id: string;
  kind: TreeKind;
  name: string;
  /** From the top of the project. The root road's is "". */
  path: string;
  /** Files git tracks here, or on disk if it isn't tracked yet. */
  files?: number;
  /** Which item a part is, such as "Desk". */
  item?: string;
  children: TreeNode[];
}

export interface ProjectTree {
  root: TreeNode;
  /** Files that matched the Secrets group: their paths only. */
  secrets: TreeNode[];
  /** `from` depends on `to`, by building id. */
  links: { from: string; to: string }[];
  /** The scan hit its limit, so this isn't all of the project. */
  truncated: boolean;
}

export interface TreeOptions {
  markers?: string[];
  replaceDefaults?: boolean;
  /** Folders that are buildings even with no marker. */
  include?: string[];
  /** Never shown: a folder name, or a path from the top. */
  ignore?: string[];
  /** Walk these even if gitignored or separate repos. */
  roads?: string[];
  /** Added to the built-in groups. Giving a built-in group's name replaces its patterns. */
  fileGroups?: Record<string, string[]>;
  /** Added to the built-in items. Each entry is a folder name, or a path ending that folder's path. */
  partTypes?: Record<string, string[]>;
}

export const SECRETS_GROUP = "Secrets";

/** Secrets comes first, so a file like .env.json is never left in Config. */
export const DEFAULT_FILE_GROUPS: Record<string, string[]> = {
  [SECRETS_GROUP]: [".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "id_rsa", "id_ed25519", ".npmrc", ".netrc"],
  Docs: ["*.md", "*.mdx", "*.rst", "LICENSE*", "NOTICE*"],
  Config: [".env.*", "*.json", "*.jsonc", "*.yaml", "*.yml", "*.toml", "*.config.*", ".*ignore", ".*rc", ".*rc.*", ".editorconfig", "Dockerfile*", "Makefile"],
  Pages: ["*.html", "*.htm"],
  Images: ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.webp", "*.ico"],
  Logs: ["*.log", "*.txt", "*history*"],
  Code: ["*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs", "*.py", "*.go", "*.rs", "*.java", "*.rb", "*.php", "*.sh", "*.css", "*.sql"],
};
const OTHER_GROUP = "Other";
/** Templates are meant to be committed, and hold no real values. */
const SECRET_TEMPLATE = /\.(example|sample|template|dist)$/i;

/** What a folder inside an application is, by its name. Anything else under src/ is a Desk. */
export const DEFAULT_PART_TYPES: Record<string, string[]> = {
  "Server rack": ["api", "server", "servers", "backend", "supabase", "migrations", "db", "database", "prisma"],
  Workbench: ["lib", "libs", "shared", "utils", "core", "common", "kernel"],
  Whiteboard: ["test", "tests", "__tests__", "e2e", "spec", "specs"],
  Bookshelf: ["docs", "doc", "documentation"],
  Toolbox: ["scripts", "tools", "bin", "skills"],
  Plants: ["public", "assets", "static", "images"],
};
const FEATURE_ITEM = "Desk";
const OTHER_ITEM = "Filing cabinet";
/** Folders inside an application that hold its parts, rather than being one. */
const PART_CONTAINERS = new Set(["src", "app", "pages", "features", "modules"]);

const MAX_ENTRIES = 400000;
const MAX_DEPTH = 12;

const clean = (value: string): string => value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
const join = (base: string, name: string): string => (base ? `${base}/${name}` : name);
const within = (rel: string, parent: string): boolean => rel === parent || rel.startsWith(`${parent}/`);

export function scanTree(root: string, options: TreeOptions = {}): ProjectTree {
  const gitignored = gitignoredNames(root);
  const skipped = new Set((options.ignore ?? []).map(clean));
  const isSkipped = (rel: string): boolean => skipped.has(rel) || skipped.has(path.posix.basename(rel));
  const roads = (options.roads ?? []).map(clean);
  /** An added road, somewhere above or below this folder, opens the way through. */
  const onAddedRoad = (rel: string): boolean => roads.some((road) => within(rel, road) || within(road, rel));

  const markers = [...(options.replaceDefaults ? [] : DEFAULT_APP_MARKERS), ...(options.markers ?? [])].map(markerMatcher);
  const includes = new Set((options.include ?? []).map(clean));

  const groupMatchers = Object.entries({ ...DEFAULT_FILE_GROUPS, ...options.fileGroups })
    .sort(([a], [b]) => Number(b === SECRETS_GROUP) - Number(a === SECRETS_GROUP))
    .map(([name, patterns]) => ({ name, patterns: patterns.map(markerMatcher) }));
  const groupOf = (file: string): string =>
    groupMatchers.find((group) => !(group.name === SECRETS_GROUP && SECRET_TEMPLATE.test(file)) && group.patterns.some((pattern) => pattern.test(file)))?.name ?? OTHER_GROUP;

  const customParts = Object.entries(options.partTypes ?? {}).map(([item, folders]) => ({ item, folders: folders.map(clean) }));
  const itemFor = (rel: string, nested: boolean): string => {
    const name = path.posix.basename(rel);
    const custom = customParts.find(({ folders }) => folders.some((folder) => folder === name || rel === folder || rel.endsWith(`/${folder}`)));
    if (custom) return custom.item;
    const known = Object.entries(DEFAULT_PART_TYPES).find(([, folders]) => folders.includes(name));
    if (known) return known[0];
    return nested ? FEATURE_ITEM : OTHER_ITEM;
  };

  // What git tracks is the truth, repo by repo, since an added road can hold separate repos.
  const trackedIn = new Map<string, string[]>();
  const tracked = (repo: string): string[] => {
    let files = trackedIn.get(repo);
    if (!files) {
      try {
        files = execFileSync("git", ["ls-files", "-z"], { cwd: path.join(root, repo), encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
      } catch {
        files = [];
      }
      trackedIn.set(repo, files);
    }
    return files;
  };

  let budget = MAX_ENTRIES;
  let truncated = false;
  const list = (rel: string) => {
    try {
      const entries = readdirSync(path.join(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      budget -= entries.length;
      if (budget <= 0) truncated = true;
      return entries;
    } catch {
      return [];
    }
  };
  const countOnDisk = (rel: string, depth = 0): number => {
    if (budget <= 0 || depth > MAX_DEPTH) return 0;
    let total = 0;
    for (const entry of list(rel)) {
      if (entry.isFile()) total += 1;
      else if (entry.isDirectory() && !entry.name.startsWith(".") && !IGNORE.has(entry.name) && !gitignored.has(entry.name)) total += countOnDisk(join(rel, entry.name), depth + 1);
    }
    return total;
  };
  const countFiles = (rel: string, repo: string): number => {
    const inside = repo ? rel.slice(repo.length + 1) : rel;
    const prefix = inside ? `${inside}/` : "";
    const count = tracked(repo).filter((file) => file.startsWith(prefix)).length;
    return count > 0 ? count : countOnDisk(rel);
  };

  const secrets: TreeNode[] = [];
  const looseFiles = (owner: string, files: string[]): TreeNode[] => {
    const groups = new Map<string, TreeNode[]>();
    for (const file of files) {
      const rel = join(owner, file);
      const node: TreeNode = { id: `file:${rel}`, kind: "file", name: file, path: rel, children: [] };
      const group = groupOf(file);
      if (group === SECRETS_GROUP) {
        secrets.push(node);
        continue;
      }
      groups.set(group, [...(groups.get(group) ?? []), node]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, children]) => ({ id: `group:${owner}:${name}`, kind: "group" as const, name, path: owner, children }));
  };

  /** A folder is shown unless it's hidden, junk, ignored, or another repo no road opened. */
  const showFolder = (rel: string, name: string): boolean => {
    if (IGNORE.has(name) || isSkipped(rel)) return false;
    const opened = onAddedRoad(rel);
    if (name.startsWith(".") && name !== ".github" && !opened) return false;
    if (gitignored.has(name) && !opened) return false;
    return opened || !isOwnRepo(path.join(root, rel));
  };
  const isApp = (rel: string, files: string[]): boolean =>
    includes.has(rel) || files.some((file) => markers.some((marker) => marker.test(file)));

  const partsOf = (rel: string, repo: string, nested: boolean, depth: number): TreeNode[] => {
    const parts: TreeNode[] = [];
    for (const entry of list(rel)) {
      if (!entry.isDirectory()) continue;
      const child = join(rel, entry.name);
      if (entry.name.startsWith(".") || !showFolder(child, entry.name)) continue;
      if (PART_CONTAINERS.has(entry.name) && depth < 3) {
        const inner = partsOf(child, repo, true, depth + 1);
        if (inner.length > 0) {
          parts.push(...inner);
          continue;
        }
      }
      const files = countFiles(child, repo);
      if (files > 0) parts.push({ id: `part:${child}`, kind: "part", name: path.posix.basename(child), path: child, files, item: itemFor(child, nested), children: [] });
    }
    return parts;
  };
  const building = (rel: string, repo: string, files: string[]): TreeNode => ({
    id: `building:${rel}`,
    kind: "building",
    name: path.posix.basename(rel) || path.basename(path.resolve(root)),
    path: rel,
    files: countFiles(rel, repo),
    children: [...partsOf(rel, repo, false, 0), ...looseFiles(rel, files)],
  });

  const walk = (rel: string, repo: string, depth: number): TreeNode => {
    const entries = list(rel);
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const children: TreeNode[] = [];
    if (depth < MAX_DEPTH && budget > 0) {
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const child = join(rel, entry.name);
        if (!showFolder(child, entry.name)) continue;
        const childRepo = isOwnRepo(path.join(root, child)) ? child : repo;
        const childFiles = list(child).filter((item) => item.isFile()).map((item) => item.name);
        if (isApp(child, childFiles)) {
          children.push(building(child, childRepo, childFiles));
        } else {
          const road = walk(child, childRepo, depth + 1);
          if (road.children.length > 0) children.push(road);
        }
      }
    } else if (depth >= MAX_DEPTH) {
      truncated = true;
    }
    return {
      id: `road:${rel}`,
      kind: "road",
      name: rel ? `${path.posix.basename(rel)}/` : "/",
      path: rel,
      children: [...children, ...looseFiles(rel, files)],
    };
  };

  const hasBuildings = (node: TreeNode): boolean => node.children.some((child) => child.kind === "building" || (child.kind === "road" && hasBuildings(child)));
  const topFiles = list("").filter((entry) => entry.isFile()).map((entry) => entry.name);
  let top = walk("", "", 0);
  // With no application inside it, the whole project is one, marked or not.
  if (!hasBuildings(top)) {
    secrets.length = 0;
    top = building("", "", topFiles);
  }

  const buildings: TreeNode[] = [];
  const collect = (node: TreeNode): void => {
    if (node.kind === "building") buildings.push(node);
    for (const child of node.children) if (child.kind === "road") collect(child);
    if (node.kind === "road") for (const child of node.children) if (child.kind === "building") buildings.push(child);
  };
  collect(top);
  const owners = new Map<string, string>();
  const manifests = new Map<string, Record<string, unknown>>();
  for (const node of buildings) {
    const manifest = readPackage(path.join(root, node.path));
    if (!manifest) continue;
    manifests.set(node.id, manifest);
    if (typeof manifest["name"] === "string") owners.set(manifest["name"], node.id);
  }
  const links: { from: string; to: string }[] = [];
  for (const [from, manifest] of manifests) {
    const seen = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const name of Object.keys((manifest[field] ?? {}) as Record<string, unknown>)) {
        const to = owners.get(name);
        if (to && to !== from && !seen.has(to)) {
          seen.add(to);
          links.push({ from, to });
        }
      }
    }
  }
  return { root: top, secrets, links, truncated };
}
