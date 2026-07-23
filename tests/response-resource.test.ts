import { describe, expect, it } from "vitest";

import { createCompletedResponse } from "../server/openresponses.js";

describe("Open Responses resource construction", () => {
  it("creates a completed assistant message response with the required stable fields", () => {
    const response = createCompletedResponse({
      id: "resp_test",
      model: "cursor-test",
      text: "hello from Cursor",
      createdAt: 1_764_000_000,
    });

    expect(response).toEqual({
      id: "resp_test",
      object: "response",
      created_at: 1_764_000_000,
      completed_at: 1_764_000_000,
      status: "completed",
      incomplete_details: null,
      model: "cursor-test",
      previous_response_id: null,
      instructions: null,
      output: [
        {
          id: "msg_resp_test",
          type: "message",
          status: "completed",
          role: "assistant",
          phase: "final_answer",
          content: [
            {
              type: "output_text",
              text: "hello from Cursor",
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
      store: true,
      background: false,
      service_tier: "default",
      metadata: {},
      safety_identifier: null,
      prompt_cache_key: null,
    });
  });
});
