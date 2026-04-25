/**
 * Endpoint trivial sin dependencias para verificar que Vercel está sirviendo
 * funciones desde /api en este despliegue. Si /api/health responde JSON,
 * sabemos que el routing por archivos funciona; si no, el proyecto Vercel
 * está apuntando a otra raíz o no está construyendo funciones.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      name: "Lucky Six Dice Jackpot",
      check: "vercel-functions",
      runtime: "node",
      now: Date.now(),
    })
  );
}
