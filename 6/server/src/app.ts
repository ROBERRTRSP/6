import fs from "node:fs";
import path from "node:path";
import cookieSession from "cookie-session";
import cors from "cors";
import express from "express";
import type { Db } from "./db.js";
import { createAdminRouter } from "./routes/adminApi.js";
import { createPublicRouter } from "./routes/publicApi.js";

export type BuildAppOptions = {
  serveClient: boolean;
  repoRoot: string;
  adminUser: string;
  adminPassword: string;
  sessionSecret: string;
  isProduction: boolean;
  corsOrigin: boolean | string | RegExp | (boolean | string | RegExp)[];
};

export function buildApp(db: Db, options: BuildAppOptions) {
  const app = express();

  if (process.env.VERCEL) {
    app.set("trust proxy", 1);
  }

  app.use(cors({ origin: options.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  app.use(
    cookieSession({
      name: "lsix.sid",
      keys: [options.sessionSecret],
      httpOnly: true,
      sameSite: "lax",
      secure: options.isProduction,
      maxAge: 1000 * 60 * 60 * 8,
    })
  );

  app.use("/api", createPublicRouter(db));
  app.use("/api/admin", createAdminRouter(db, options.adminUser, options.adminPassword));

  if (options.serveClient) {
    const clientDist = path.resolve(options.repoRoot, "client", "dist");
    const indexHtml = path.join(clientDist, "index.html");
    if (fs.existsSync(indexHtml)) {
      app.use(express.static(clientDist));
      app.get("*", (_req, res) => res.sendFile(indexHtml));
    }
  }

  return app;
}
