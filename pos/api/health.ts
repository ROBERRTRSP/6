import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      service: "loteria-pos",
      name: "Banca Rápida",
      check: "vercel-functions",
      runtime: "node",
      now: Date.now(),
    })
  );
}
