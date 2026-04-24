import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildApp } from "./app.js";
import { loadServerConfig } from "./config.js";
import { openDatabase } from "./db.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverDir, "..");

const config = loadServerConfig(serverDir, repoRoot);
const db = openDatabase(config.dbPath);
const app = buildApp(db, {
  serveClient: true,
  repoRoot: config.repoRoot,
  adminUser: config.adminUser,
  adminPassword: config.adminPassword,
  sessionSecret: config.sessionSecret,
  isProduction: config.isProduction,
  corsOrigin: config.corsOrigin,
});

const port = Number(process.env.PORT ?? 43778);
const server = app.listen(port, () => {
  console.log(`Lucky Six Dice Jackpot listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
