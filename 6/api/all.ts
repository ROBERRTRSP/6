/**
 * Función Vercel única que sirve toda la API Express cuando el proyecto
 * Vercel usa Root Directory = `6` en lugar de la raíz del monorepo.
 *
 * El comportamiento es idéntico a `/api/all.ts` en la raíz del repo:
 * monta la misma app Express de Lucky Six bajo `/api/*` con sesiones
 * por cookie (cookie-session) compatibles con serverless.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { buildApp } from "../server/src/app.js";
import { loadServerConfig } from "../server/src/config.js";
import { openDatabase } from "../server/src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
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
