import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
dotenv.config({ path: path.join(root, ".env") });

export const config = {
  port: Number(process.env.PORT ?? 43880),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(root, process.env.DATABASE_PATH)
    : path.join(root, "server/data/loteria-pos.db"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
