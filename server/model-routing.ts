import { readFile } from "node:fs/promises";
import { parse } from "yaml";

export class ModelRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRoutingError";
  }
}

export class ModelRouter {
  constructor(private readonly configPath: string) {}

  async resolve(requestedModel: string): Promise<string> {
    let source: string;
    try {
      source = await readFile(this.configPath, "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return requestedModel;
      throw error;
    }
    const config = parse(source) as { aliases?: unknown; allow_unlisted_models?: unknown } | null;
    if (!config || typeof config !== "object") throw new ModelRoutingError("model-routing.yaml must be an object");
    const aliases = config.aliases;
    if (aliases !== undefined && (typeof aliases !== "object" || aliases === null || Array.isArray(aliases))) {
      throw new ModelRoutingError("model-routing.yaml aliases must be an object");
    }
    const alias = (aliases as Record<string, unknown> | undefined)?.[requestedModel];
    if (alias !== undefined) {
      if (typeof alias !== "string" || alias.length === 0) {
        throw new ModelRoutingError(`Model alias ${requestedModel} must resolve to a non-empty string`);
      }
      return alias;
    }
    if (config.allow_unlisted_models === false) {
      throw new ModelRoutingError(`Model ${requestedModel} is not permitted by model-routing.yaml`);
    }
    return requestedModel;
  }
}
