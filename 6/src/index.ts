import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildApp } from "../server/src/app.js";
import { loadServerConfig } from "../server/src/config.js";
import { openDatabase } from "../server/src/db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const serverDir = path.join(repoRoot, "server");

const config = loadServerConfig(serverDir, repoRoot);
const db = openDatabase(config.dbPath);
const app = buildApp(db, {
  serveClient: false,
  repoRoot: config.repoRoot,
  adminUser: config.adminUser,
  adminPassword: config.adminPassword,
  sessionSecret: config.sessionSecret,
  isProduction: config.isProduction,
  corsOrigin: config.corsOrigin,
});

export default app;
