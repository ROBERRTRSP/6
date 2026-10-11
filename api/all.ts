/**
 * Vercel serverless entry that mounts the Banca Rápida POS Express API.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "../pos/server/src/app.js";
import { config } from "../pos/server/src/config.js";
import { openDb } from "../pos/server/src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const posRoot = path.resolve(__dirname, "..", "pos");

const databasePath =
  process.env.DATABASE_PATH ??
  (process.env.VERCEL ? "/tmp/loteria-pos.db" : path.join(posRoot, "server/data/loteria-pos.db"));

const db = openDb(databasePath);
const app: express.Express = createApp(db, { serveClient: false });

export default app;
