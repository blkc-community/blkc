/** Reading what's in a project: names and counts, and package manifests. Never source code. */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

/** What marks a folder as an application, out of the box. */
export const DEFAULT_APP_MARKERS = ["block.json", "kit.json", "circuit.json", "package.json", "pyproject.toml", "setup.py", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "mix.exs", "deno.json", "pubspec.yaml", "Package.swift", "CMakeLists.txt", "*.csproj", "*.sln"];

export const markerMatcher = (marker: string): RegExp =>
  new RegExp(`^${marker.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

export const IGNORE = new Set(["node_modules", ".git", "dist", "build", "out", "target", "coverage", ".next", ".turbo", ".cache", "vendor", "venv", "__pycache__", ".venv", ".idea", ".vscode", ".claude", ".blkc", ".gemini", ".cursor"]);

/** The plain folder names in a .gitignore. Patterns with wildcards aren't followed. */
export function gitignoredNames(root: string): Set<string> {
  const names = new Set<string>();
  try {
    for (const line of readFileSync(path.join(root, ".gitignore"), "utf8").split("\n")) {
      const name = line.trim().replace(/^\//, "").replace(/\/$/, "");
      if (name && !/[*!#/\s]/.test(name)) names.add(name);
    }
  } catch {
    // no .gitignore
  }
  return names;
}

/** A folder with its own .git is another project, even if it sits inside this one. */
export const isOwnRepo = (dir: string): boolean => existsSync(path.join(dir, ".git"));

export const readPackage = (dir: string): Json | undefined => {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Json;
  } catch {
    return undefined;
  }
};
