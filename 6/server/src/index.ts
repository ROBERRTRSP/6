import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import { openDatabase } from "./db.js";
import { createAdminRouter } from "./routes/adminApi.js";
import { createPublicRouter } from "./routes/publicApi.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.PORT ?? 43778);
const dbPath = process.env.DATABASE_PATH ?? path.join(rootDir, "data", "lucky-six.db");
const adminUser = process.env.ADMIN_USER ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "2468";
const sessionSecret = process.env.SESSION_SECRET ?? "dev-only-lucky-six-change-me";
const isProduction = process.env.NODE_ENV === "production";
const corsOrigin = process.env.CORS_ORIGIN?.trim() || (isProduction ? false : true);

if (isProduction && (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)) {
  throw new Error("ADMIN_PASSWORD and SESSION_SECRET are required in production");
}

const db = openDatabase(dbPath);
const app = express();

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "64kb" }));
app.use(
  session({
    name: "lsix.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use("/api", createPublicRouter(db));
app.use("/api/admin", createAdminRouter(db, adminUser, adminPassword));

const clientDist = path.resolve(rootDir, "..", "client", "dist");
const indexHtml = path.join(clientDist, "index.html");
if (fs.existsSync(indexHtml)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(indexHtml));
}

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
