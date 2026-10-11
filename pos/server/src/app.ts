import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import type { Db } from "./db.js";
import { createApiRouter } from "./routes/api.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(db: Db, options?: { serveClient?: boolean }) {
  const app = express();
  const serveClient = options?.serveClient !== false;
  app.use(
    cors({
      origin: config.nodeEnv === "production" && config.corsOrigin !== "*" ? config.corsOrigin : true,
    })
  );
  app.use(express.json());
  app.use("/api", createApiRouter(db));

  if (serveClient) {
    const clientDist = path.resolve(here, "../../client/dist");
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDist, "index.html"), (err) => {
        if (err) next();
      });
    });
  }

  return app;
}
