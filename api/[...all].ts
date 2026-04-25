/**
 * Función Vercel única que sirve toda la API Express.
 *
 * Vercel detecta cualquier archivo bajo `api/` como handler. Aquí convertimos
 * la app Express del monorepo en el handler por defecto, montando toda la
 * lógica del juego Lucky Six bajo `/api/*`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { buildApp } from "../6/server/src/app.js";
import { loadServerConfig } from "../6/server/src/config.js";
import { openDatabase } from "../6/server/src/db.js";

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
