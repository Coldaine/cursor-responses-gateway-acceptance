import type { Response } from "express";

import type { ResponseResource } from "./openresponses.js";

function writeEvent(response: Response, event: Record<string, unknown>): void {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function writeCompletedResponseStream(
  response: Response,
  resource: ResponseResource,
): void {
  let sequenceNumber = 0;
  const next = () => sequenceNumber++;
  const item = resource.output[0];
  const part = item.content[0];

  response.status(200);
  response.set({
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  });
  response.flushHeaders();

  writeEvent(response, {
    type: "response.created",
    sequence_number: next(),
    response: resource,
  });
  writeEvent(response, {
    type: "response.in_progress",
    sequence_number: next(),
    response: resource,
  });
  writeEvent(response, {
    type: "response.output_item.added",
    sequence_number: next(),
    output_index: 0,
    item: { ...item, status: "in_progress", content: [] },
  });
  writeEvent(response, {
    type: "response.content_part.added",
    sequence_number: next(),
    item_id: item.id,
    output_index: 0,
    content_index: 0,
    part: { ...part, text: "" },
  });
  writeEvent(response, {
    type: "response.output_text.delta",
    sequence_number: next(),
    item_id: item.id,
    output_index: 0,
    content_index: 0,
    delta: part.text,
  });
  writeEvent(response, {
    type: "response.output_text.done",
    sequence_number: next(),
    item_id: item.id,
    output_index: 0,
    content_index: 0,
    text: part.text,
  });
  writeEvent(response, {
    type: "response.content_part.done",
    sequence_number: next(),
    item_id: item.id,
    output_index: 0,
    content_index: 0,
    part,
  });
  writeEvent(response, {
    type: "response.output_item.done",
    sequence_number: next(),
    output_index: 0,
    item,
  });
  writeEvent(response, {
    type: "response.completed",
    sequence_number: next(),
    response: resource,
  });
  response.write("data: [DONE]\n\n");
  response.end();
}
