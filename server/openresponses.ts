export interface CompletedResponseOptions {
  id: string;
  model: string;
  text: string;
  createdAt: number;
  previousResponseId?: string | null;
  store?: boolean;
}

export interface ResponseResource {
  id: string;
  object: "response";
  created_at: number;
  completed_at: number;
  status: "completed";
  incomplete_details: null;
  model: string;
  previous_response_id: string | null;
  instructions: null;
  output: Array<{
    id: string;
    type: "message";
    status: "completed";
    role: "assistant";
    phase: "final_answer";
    content: Array<{
      type: "output_text";
      text: string;
      annotations: unknown[];
    }>;
  }>;
  error: null;
  tools: unknown[];
  tool_choice: "auto";
  truncation: "disabled";
  parallel_tool_calls: true;
  text: { format: { type: "text" } };
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  top_logprobs: number;
  temperature: number;
  reasoning: { effort: null; summary: null };
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details: { cached_tokens: number };
    output_tokens_details: { reasoning_tokens: number };
  };
  max_output_tokens: null;
  max_tool_calls: null;
  store: boolean;
  background: false;
  service_tier: "default";
  metadata: Record<string, never>;
  safety_identifier: null;
  prompt_cache_key: null;
}

export interface CompactionResource {
  id: string;
  object: "response.compaction";
  created_at: number;
  output: Array<{
    id: string;
    type: "compaction";
    encrypted_content: string;
    created_by: "cursor-openresponses-provider";
  }>;
  usage: ResponseResource["usage"];
}

export function createCompactionResource(options: {
  id: string;
  createdAt: number;
  opaqueContent: string;
}): CompactionResource {
  return {
    id: options.id,
    object: "response.compaction",
    created_at: options.createdAt,
    output: [
      {
        id: `cmp_${options.id}`,
        type: "compaction",
        encrypted_content: options.opaqueContent,
        created_by: "cursor-openresponses-provider",
      },
    ],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

export function createCompletedResponse(
  options: CompletedResponseOptions,
): ResponseResource {
  return {
    id: options.id,
    object: "response",
    created_at: options.createdAt,
    completed_at: options.createdAt,
    status: "completed",
    incomplete_details: null,
    model: options.model,
    previous_response_id: options.previousResponseId ?? null,
    instructions: null,
    output: [
      {
        id: `msg_${options.id}`,
        type: "message",
        status: "completed",
        role: "assistant",
        phase: "final_answer",
        content: [
          {
            type: "output_text",
            text: options.text,
            annotations: [],
          },
        ],
      },
    ],
    error: null,
    tools: [],
    tool_choice: "auto",
    truncation: "disabled",
    parallel_tool_calls: true,
    text: { format: { type: "text" } },
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_logprobs: 0,
    temperature: 1,
    reasoning: { effort: null, summary: null },
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    max_output_tokens: null,
    max_tool_calls: null,
    store: options.store ?? true,
    background: false,
    service_tier: "default",
    metadata: {},
    safety_identifier: null,
    prompt_cache_key: null,
  };
}

export function createFunctionCallResponse(options: {
  id: string;
  model: string;
  functionName: string;
  createdAt: number;
  previousResponseId?: string | null;
  store?: boolean;
}): ResponseResource {
  const response = createCompletedResponse({
    id: options.id,
    model: options.model,
    text: "",
    createdAt: options.createdAt,
    previousResponseId: options.previousResponseId,
    store: options.store,
  });
  return {
    ...response,
    output: [
      {
        id: `fc_${options.id}`,
        type: "function_call",
        call_id: `call_${options.id}`,
        name: options.functionName,
        arguments: "{}",
        status: "completed",
      },
    ],
  } as unknown as ResponseResource;
}
