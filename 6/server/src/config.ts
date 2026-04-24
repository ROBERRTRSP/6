import path from "node:path";

export type ServerConfig = {
  dbPath: string;
  adminUser: string;
  adminPassword: string;
  sessionSecret: string;
  isProduction: boolean;
  corsOrigin: boolean | string | RegExp | (boolean | string | RegExp)[];
  repoRoot: string;
  serverDir: string;
};

export function loadServerConfig(serverDir: string, repoRoot: string): ServerConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const onVercel = Boolean(process.env.VERCEL);

  const dbPath =
    process.env.DATABASE_PATH?.trim() ||
    (onVercel ? path.join("/tmp", "lucky-six.db") : path.join(serverDir, "data", "lucky-six.db"));

  const adminUser = process.env.ADMIN_USER ?? "admin";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "2468";
  const sessionSecret = process.env.SESSION_SECRET ?? "dev-only-lucky-six-change-me";
  const corsOrigin = process.env.CORS_ORIGIN?.trim() || (isProduction ? false : true);

  if (isProduction && (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)) {
    throw new Error("ADMIN_PASSWORD and SESSION_SECRET are required in production");
  }

  return {
    dbPath,
    adminUser,
    adminPassword,
    sessionSecret,
    isProduction,
    corsOrigin,
    repoRoot,
    serverDir,
  };
}
