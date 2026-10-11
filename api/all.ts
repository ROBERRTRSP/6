/**
 * Vercel serverless entry that mounts the POS Simple Express API.
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
  (process.env.VERCEL ? "/tmp/pos-simple.db" : path.join(posRoot, "server/data/pos-simple.db"));

const db = openDb(databasePath);
const app: express.Express = createApp(db, { serveClient: false });

export default app;
