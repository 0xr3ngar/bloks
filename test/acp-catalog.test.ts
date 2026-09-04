// The ACP catalog is data: a new engine is a spec, not a driver.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ACP_SPECS } from "../server/drivers/acp.ts";
import { BUILT_IN_DRIVERS } from "../server/drivers/builtIn.ts";
import { CLI_PROVIDERS } from "../server/providers.ts";

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
