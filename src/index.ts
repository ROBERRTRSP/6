/**
 * Punto de entrada para Vercel (Express on Vercel).
 *
 * Importamos `express` directamente para asegurar la detección por parte de
 * Vercel y reutilizamos toda la lógica del monorepo en `6/`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import { buildApp } from "../6/server/src/app.js";
import { loadServerConfig } from "../6/server/src/config.js";
import { openDatabase } from "../6/server/src/db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "6");
const serverDir = path.join(repoRoot, "server");

const config = loadServerConfig(serverDir, repoRoot);
const db = openDatabase(config.dbPath);
const app: express.Express = buildApp(db, {
  serveClient: false,
  repoRoot: config.repoRoot,
  adminUser: config.adminUser,
  adminPassword: config.adminPassword,
  sessionSecret: config.sessionSecret,
  isProduction: config.isProduction,
  corsOrigin: config.corsOrigin,
});

export default app;
