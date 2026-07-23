import { z } from "zod";

const responseRequestSchema = z
  .object({
    model: z.string().min(1),
    input: z.union([z.string(), z.array(z.unknown())]),
    instructions: z.string().nullable().optional(),
    tools: z.array(z.unknown()).optional().default([]),
    tool_choice: z.unknown().optional().default("auto"),
    allowed_tools: z.array(z.string()).optional(),
    stream: z.boolean().optional().default(false),
    store: z.boolean().optional().default(true),
    previous_response_id: z.string().min(1).optional(),
  })
  .passthrough();

export type ResponseRequest = z.infer<typeof responseRequestSchema>;

export function parseResponseRequest(value: unknown): ResponseRequest {
  return responseRequestSchema.parse(value);
}

function renderContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content);

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return String(part);
      const value = part as Record<string, unknown>;
      switch (value.type) {
        case "input_text":
        case "output_text":
          return typeof value.text === "string" ? value.text : "";
        case "input_image":
          return `[image input: ${String(value.image_url ?? value.file_id ?? "unknown")}]`;
        case "refusal":
          return `[refusal: ${String(value.refusal ?? "")}]`;
        default:
          return JSON.stringify(value);
      }
    })
    .join("\n");
}

function renderItem(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const value = item as Record<string, unknown>;

  if (value.type === "message") {
    return `[${String(value.role ?? "user")}]\n${renderContent(value.content)}`;
  }

  if (value.type === "function_call_output") {
    return `[tool output ${String(value.call_id ?? "unknown")}]\n${renderContent(value.output)}`;
  }

  return `[${String(value.type ?? "item")}]\n${JSON.stringify(value)}`;
}

export function renderInputForCursor(input: ResponseRequest["input"]): string {
  if (typeof input === "string") return `[user]\n${input}`;
  return input.map(renderItem).join("\n\n");
}
