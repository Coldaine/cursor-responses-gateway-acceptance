import { createApp } from "./app.js";

const apiKey = process.env.OPENRESPONSES_API_KEY ?? process.env.CURSOR_OPENRESPONSES_API_KEY;
if (!apiKey) {
  throw new Error(
    "OPENRESPONSES_API_KEY (or CURSOR_OPENRESPONSES_API_KEY) must be set before starting the server",
  );
}

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const app = createApp({
  apiKey,
  cursorApiKey: process.env.CURSOR_API_KEY,
  cwd: process.env.CURSOR_WORKSPACE_CWD ?? process.cwd(),
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Cursor Open Responses provider listening on http://127.0.0.1:${port}`);
});
