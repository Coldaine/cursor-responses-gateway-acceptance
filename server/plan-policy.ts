import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export interface VerifiedPlan {
  path: string;
  status: "approved";
  body: string;
  bodyHash: string;
}

export class PlanPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanPolicyError";
  }
}

function hashPlanBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function parsePlan(content: string): { metadata: Map<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n*/);
  if (!match) {
    throw new PlanPolicyError("Plan must begin with YAML front matter");
  }

  const metadata = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      metadata.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  return { metadata, body: content.slice(match[0].length) };
}

function serializePlan(metadata: Map<string, string>, body: string): string {
  const header = [...metadata.entries()]
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `---\n${header}\n---\n\n${body}`;
}

export async function approvePlan(planPath: string): Promise<VerifiedPlan> {
  const parsed = parsePlan(await readFile(planPath, "utf8"));
  if (parsed.metadata.get("status") !== "draft") {
    throw new PlanPolicyError("Only a draft plan can be approved");
  }

  const bodyHash = hashPlanBody(parsed.body);
  parsed.metadata.set("status", "approved");
  parsed.metadata.set("body_sha256", bodyHash);
  await writeFile(planPath, serializePlan(parsed.metadata, parsed.body), "utf8");
  return { path: planPath, status: "approved", body: parsed.body, bodyHash };
}

export async function verifyApprovedPlan(planPath: string): Promise<VerifiedPlan> {
  const parsed = parsePlan(await readFile(planPath, "utf8"));
  if (parsed.metadata.get("status") !== "approved") {
    throw new PlanPolicyError("Plan is not approved");
  }

  const expectedHash = parsed.metadata.get("body_sha256");
  const actualHash = hashPlanBody(parsed.body);
  if (!expectedHash || expectedHash !== actualHash) {
    throw new PlanPolicyError("Plan body does not match its approved hash");
  }
  return { path: planPath, status: "approved", body: parsed.body, bodyHash: actualHash };
}
