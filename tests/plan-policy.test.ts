import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  approvePlan,
  verifyApprovedPlan,
} from "../server/plan-policy.js";

describe("plan approval policy", () => {
  it("approves a draft plan and refuses it after its body has changed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cursor-plan-policy-"));
    const planPath = join(directory, "task.md");
    await writeFile(
      planPath,
      "---\nstatus: draft\n---\n\n# Plan\n\nChange one thing.\n",
      "utf8",
    );

    const approved = await approvePlan(planPath);
    expect(approved.status).toBe("approved");
    await expect(verifyApprovedPlan(planPath)).resolves.toMatchObject({
      status: "approved",
      body: "# Plan\n\nChange one thing.\n",
    });
    expect(await readFile(planPath, "utf8")).toContain("body_sha256:");

    await writeFile(
      planPath,
      "---\nstatus: approved\nbody_sha256: stale\n---\n\n# Plan\n\nChanged after approval.\n",
      "utf8",
    );
    await expect(verifyApprovedPlan(planPath)).rejects.toThrow(
      "does not match its approved hash",
    );
  });
});
