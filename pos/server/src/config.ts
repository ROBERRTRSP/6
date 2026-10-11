import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
dotenv.config({ path: path.join(root, ".env") });

function resolveDatabasePath() {
  if (process.env.DATABASE_PATH) {
    return path.isAbsolute(process.env.DATABASE_PATH)
      ? process.env.DATABASE_PATH
      : path.resolve(root, process.env.DATABASE_PATH);
  }
  if (process.env.VERCEL) {
    return path.join("/tmp", "pos-simple.db");
  }
  return path.join(root, "server/data/pos-simple.db");
}

export const config = {
  port: Number(process.env.PORT ?? 43880),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databasePath: resolveDatabasePath(),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
