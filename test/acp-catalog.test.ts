// The ACP catalog is data: a new engine is a spec, not a driver.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { instanceConfigs } from "../server/config.ts";
import { ACP_SPECS, acpDriver } from "../server/drivers/acp.ts";
import { BUILT_IN_DRIVERS } from "../server/drivers/builtIn.ts";
import { resolveCli } from "../server/path.ts";
import { CLI_PROVIDERS } from "../server/providers.ts";
import { startHarness } from "./helpers/server.ts";

test("Pi is a catalogued ACP engine", () => {
  const spec = ACP_SPECS.find((s) => s.kind === "pi");
  assert.ok(spec, "kind pi belongs in ACP_SPECS");
  assert.equal(spec?.command, "pi-acp");
  assert.deepEqual(spec?.args, []);
  assert.equal(spec?.probePath, true, "pi-acp --version starts a session");
  assert.ok(CLI_PROVIDERS.some((p) => p.kind === "pi"), "kind pi belongs in CLI_PROVIDERS");
  assert.ok(
    BUILT_IN_DRIVERS.some((d) => d.driverKind === "pi"),
    "kind pi is registered via acpDriver",
  );
});

test("the default fleet creates a Pi instance, even if config already has others", () => {
  assert.ok(Object.values(instanceConfigs({})).some((e) => e.driver === "pi"));
  const saved = instanceConfigs({ instances: { claude: { driver: "claudeAgent" } } });
  assert.ok(
    Object.values(saved).some((e) => e.driver === "pi"),
    "a saved instances map written before Pi existed must still probe it",
  );
});

test("resolveCli finds a well-known global bin when PATH is empty", () => {
  const home = mkdtempSync(join(tmpdir(), "bloks-pi-path-"));
  const bin = join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const fake = join(bin, "pi-acp");
  writeFileSync(fake, "#!/bin/sh\n", { mode: 0o755 });

  const prevHome = process.env.HOME;
  const prevPath = process.env.PATH;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.PATH = "/nonexistent";
  try {
    assert.equal(resolveCli("pi-acp"), fake);
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
    process.env.PATH = prevPath;
  }
});

test("Pi's snapshot is available when pi-acp is installed off PATH", async () => {
  const home = mkdtempSync(join(tmpdir(), "bloks-pi-snap-"));
  const bin = join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "pi-acp"), "#!/bin/sh\n", { mode: 0o755 });

  const spec = ACP_SPECS.find((s) => s.kind === "pi")!;
  const prevHome = process.env.HOME;
  const prevPath = process.env.PATH;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.PATH = "/nonexistent";
  try {
    const inst = await acpDriver(spec).create({
      instanceId: "pi",
      displayName: "Pi",
      enabled: true,
      config: { cli: "pi-acp", fullAuto: false },
      environment: {},
    });
    const snap = await inst.snapshot();
    assert.equal(snap.state, "available");
    assert.equal(snap.authenticated, false, "installed must not depend on auth");
    await inst.dispose();
  } finally {
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevProfile;
    process.env.PATH = prevPath;
  }
});

test("the harness reports Pi available when pi-acp lives in a global bin", async () => {
  const h = await startHarness();
  try {
    const bin = join(h.home, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "pi-acp"), "#!/bin/sh\n", { mode: 0o755 });

    const { instances } = await h.json("/api/instances");
    const pi = instances.find((i: { driverKind: string }) => i.driverKind === "pi");
    assert.ok(pi, "default fleet must create a pi instance");
    assert.equal(pi.snapshot.state, "available");
    assert.equal(pi.snapshot.authenticated, false);

    const { providers } = await h.json("/api/providers");
    const row = providers.find((p: { kind: string }) => p.kind === "pi");
    assert.equal(row?.connected, true);
  } finally {
    await h.stop();
  }
});
