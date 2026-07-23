import {
  Agent,
  Cursor,
  type SDKMessage,
  type SDKModel,
} from "@cursor/sdk";

export interface CursorRunOptions {
  apiKey: string;
  model: string;
  cwd: string;
  prompt: string;
  onEvent?: (event: SDKMessage) => void | Promise<void>;
}

export interface CursorRunOutput {
  text: string;
  events: SDKMessage[];
}

export interface CursorRunner {
  listModels(apiKey: string): Promise<SDKModel[]>;
  run(options: CursorRunOptions): Promise<CursorRunOutput>;
}

export function collectAssistantText(events: Iterable<SDKMessage>): string {
  return [...events]
    .flatMap((event) =>
      event.type === "assistant"
        ? event.message.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
        : [],
    )
    .join("");
}

export class CursorSdkRunner implements CursorRunner {
  async listModels(apiKey: string): Promise<SDKModel[]> {
    return Cursor.models.list({ apiKey });
  }

  async run(options: CursorRunOptions): Promise<CursorRunOutput> {
    const agent = await Agent.create({
      apiKey: options.apiKey,
      name: "Open Responses provider",
      model: { id: options.model },
      local: { cwd: options.cwd },
    });

    try {
      const run = await agent.send(options.prompt);
      const events: SDKMessage[] = [];

      for await (const event of run.stream()) {
        events.push(event);
        await options.onEvent?.(event);
      }

      const result = await run.wait();
      if (result.status !== "finished") {
        throw new Error(`Cursor run ended with status ${result.status}`);
      }

      return { text: collectAssistantText(events), events };
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  }
}
