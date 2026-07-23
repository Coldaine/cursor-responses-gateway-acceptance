import { createApp } from "./app.js";

const apiKey = process.env.CURSOR_RESPONSES_API_KEY;
if (!apiKey) {
  throw new Error(
    "CURSOR_RESPONSES_API_KEY must be set before starting the server",
  );
}

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const app = createApp({
  apiKey,
  cursorApiKey: process.env.CURSOR_API_KEY,
  defaultModel: process.env.CURSOR_MODEL,
  cwd: process.env.CURSOR_WORKSPACE_CWD ?? process.cwd(),
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Cursor Responses Gateway listening on http://127.0.0.1:${port}`);
});
