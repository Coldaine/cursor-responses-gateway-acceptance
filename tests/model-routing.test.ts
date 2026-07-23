import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ModelRouter } from "../server/model-routing.js";

describe("model routing", () => {
  it("resolves configured aliases and rejects unlisted models when configured", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cursor-model-routing-"));
    const configPath = join(directory, "model-routing.yaml");
    await writeFile(configPath, "aliases:\n  cheap: cursor-fast\nallow_unlisted_models: false\n", "utf8");
    const router = new ModelRouter(configPath);

    await expect(router.resolve("cheap")).resolves.toBe("cursor-fast");
    await expect(router.resolve("not-allowed")).rejects.toThrow("not permitted");
  });
});
