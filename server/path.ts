// Finding the CLIs when nobody set up the environment.
//
// Launched from a terminal, this server inherits a login shell's PATH and
// every engine is findable. Launched from Finder, it inherits launchd's
// minimal one (/usr/bin:/bin:/usr/sbin:/sbin), and `spawn("claude")`
// fails with ENOENT even though the CLI is right there. To the person
// looking at the app, that reads as "Bloks cannot see anything I have
// installed", which is the worst possible first impression.
//
// Two layers close it. The desktop shell asks the user's login shell for
// its real PATH before this process starts (electron/main.mjs), which is
// the correct fix when it works. This file is the backstop for when it
// does not: the places node CLIs actually get installed on a Mac, checked
// on disk and appended so lookup can find them.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

function nvmBins(home: string): string[] {
  const root = join(home, ".nvm", "versions", "node");
  try {
    return readdirSync(root).map((v) => join(root, v, "bin"));
  } catch {
    return [];
  }
}

/** Where a `npm i -g`, brew, volta, pnpm or plain installer puts a CLI.
 * Order matters only for ties, so the common ones come first. */
function candidateDirs(): string[] {
  const home = homedir();
  const prefix = process.env.npm_config_prefix || process.env.PREFIX;

  if (process.platform === "win32") {
    // npm's global prefix and the installers' usual homes. AppData paths
    // resolve from env because roaming profiles move them.
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const local = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return [
      join(appData, "npm"),
      join(local, "Programs"),
      join(home, ".grok", "bin"),
      join(home, ".local", "bin"),
      ...(prefix ? [prefix, join(prefix, "bin")] : []),
    ];
  }

  return [
    "/opt/homebrew/bin", // Apple Silicon brew
    "/usr/local/bin", // Intel brew, and half the installers ever written
    join(home, ".local", "bin"),
    join(home, ".local", "share", "pnpm"),
    join(home, ".grok", "bin"), // the xAI installer’s private prefix
    join(home, ".npm-global", "bin"),
    join(home, "Library", "pnpm"),
    join(home, ".volta", "bin"),
    join(home, ".fnm", "aliases", "default", "bin"),
    join(home, ".local", "share", "fnm", "aliases", "default", "bin"),
    ...(process.env.FNM_MULTISHELL_PATH ? [process.env.FNM_MULTISHELL_PATH] : []),
    join(home, "bin"),
    ...(prefix ? [join(prefix, "bin")] : []),
    ...nvmBins(home),
  ];
}

function namesFor(cli: string): string[] {
  if (process.platform === "win32" && !/\.[A-Za-z0-9]+$/.test(cli)) {
    const exts = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";");
    return [cli, ...exts.map((ext) => cli + ext)];
  }
  return [cli];
}

/**
 * Locate a CLI the same way widenPath would, without requiring PATH to
 * already include the directory. PATH still wins when it has a hit.
 */
export function resolveCli(cli: string): string | null {
  if (!cli) return null;
  if (cli.includes("/") || cli.includes("\\")) return existsSync(cli) ? cli : null;

  const seen = new Set<string>();
  const dirs = [...(process.env.PATH ?? "").split(delimiter), ...candidateDirs()];
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    for (const name of namesFor(cli)) {
      const full = join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

/**
 * Append any real install directory that PATH is missing.
 *
 * Append rather than prepend on purpose: when the environment already
 * resolves a CLI, that resolution should win. This only adds places to
 * look after everything the user's setup said.
 */
export function widenPath() {
  const current = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const have = new Set(current);

  const missing = candidateDirs().filter((dir) => !have.has(dir) && existsSync(dir));
  if (missing.length) {
    process.env.PATH = [...current, ...missing].join(delimiter);
  }
}
