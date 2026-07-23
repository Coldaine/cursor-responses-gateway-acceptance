export interface PhaseGateCheck {
  name: string;
  bucket: string;
  state: string;
  link?: string;
}

export interface PhaseGateAssessment {
  state: "pending" | "green" | "failed";
  failedChecks: PhaseGateCheck[];
}

export function assessPhaseGateChecks(
  checks: PhaseGateCheck[],
  requiredCheckNames: string[],
): PhaseGateAssessment {
  const required = new Set(requiredCheckNames);
  const relevant = checks.filter((check) => required.has(check.name));
  const failedChecks = relevant.filter((check) => check.bucket === "fail");
  if (failedChecks.length > 0) return { state: "failed", failedChecks };
  if (required.size === relevant.length && relevant.every((check) => check.bucket === "pass")) {
    return { state: "green", failedChecks: [] };
  }
  return { state: "pending", failedChecks: [] };
}
