/// <reference types="cookie-session" />
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import {
  adjustPlayerBalance,
  backupDatabase,
  createPlayer,
  getAdminStats,
  listAuditLogs,
  listPlayerMovements,
  listPlays,
  normalizeRtpMode,
  patchSettings,
  readBalance,
  readSettings,
  searchPlayers,
  setPlayerStatus,
  setActivePlayer,
  writeAuditLog,
  type Db,
} from "../db.js";
import type { GameSettings } from "../types.js";

type AdminSession = (CookieSessionInterfaces.CookieSessionObject & { adminUser?: string }) | null;

function adminSession(req: Request): AdminSession {
  return req.session as AdminSession;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!adminSession(req)?.adminUser) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  next();
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function toBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function createAdminRouter(db: Db, adminUser: string, adminPassword: string) {
  const router = Router();

  router.post("/login", (req, res) => {
    const body = req.body as { username?: string; password?: string };
    if (body.username !== adminUser || body.password !== adminPassword) {
      res.status(401).json({ error: "PIN o usuario inválido" });
      return;
    }
    if (!req.session) req.session = {} as CookieSessionInterfaces.CookieSessionObject;
    (req.session as CookieSessionInterfaces.CookieSessionObject & { adminUser?: string }).adminUser = adminUser;
    res.json({ ok: true });
  });

  router.post("/logout", (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  router.get("/me", requireAdmin, (req, res) => {
    res.json({ username: adminSession(req)?.adminUser });
  });

  router.get("/stats", requireAdmin, (_req, res) => {
    res.json(getAdminStats(db));
  });

  router.get("/plays", requireAdmin, (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json({ plays: listPlays(db, Number.isFinite(limit) ? limit : 100) });
  });

  router.get("/audit", requireAdmin, (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json({ logs: listAuditLogs(db, Number.isFinite(limit) ? limit : 100) });
  });

  router.get("/players", requireAdmin, (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    res.json({
      players: searchPlayers(
        db,
        typeof req.query.q === "string" ? req.query.q : "",
        Number.isFinite(limit) ? limit : 50
      ),
    });
  });

  router.post("/players", requireAdmin, (req, res) => {
    try {
      res.json({
        player: createPlayer(db, req.body ?? {}, adminSession(req)?.adminUser ?? "admin"),
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo crear jugador" });
    }
  });

  router.get("/players/:id/history", requireAdmin, (req, res) => {
    try {
      const playerId = String(req.params.id);
      const limit = Number(req.query.limit ?? 100);
      res.json({ movements: listPlayerMovements(db, playerId, Number.isFinite(limit) ? limit : 100) });
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : "Jugador no encontrado" });
    }
  });

  router.post("/players/:id/balance", requireAdmin, (req, res) => {
    try {
      const playerId = String(req.params.id);
      res.json(adjustPlayerBalance(db, playerId, req.body ?? {}, adminSession(req)?.adminUser ?? "admin"));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo ajustar saldo" });
    }
  });

  router.patch("/players/:id/status", requireAdmin, (req, res) => {
    try {
      const playerId = String(req.params.id);
      const body = req.body as { active?: unknown };
      res.json(setPlayerStatus(db, playerId, body.active !== false, adminSession(req)?.adminUser ?? "admin"));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo cambiar estado" });
    }
  });

  router.post("/players/:id/start", requireAdmin, (req, res) => {
    try {
      const player = setActivePlayer(db, String(req.params.id), adminSession(req)?.adminUser ?? "admin");
      res.json({ player });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo iniciar jugador" });
    }
  });

  router.get("/settings", requireAdmin, (_req, res) => {
    res.json({ ...readSettings(db), balanceCents: readBalance(db), activePlayer: null, now: Date.now() });
  });

  router.patch("/settings", requireAdmin, (req, res) => {
    try {
      const body = req.body as Partial<Record<keyof GameSettings, unknown>>;
      const patch: Partial<GameSettings> = {};
      const numericKeys: Array<keyof GameSettings> = [
        "creditValueCents",
        "jackpotSeedCents",
        "jackpotPoolCents",
        "jackpotContributionPercent",
        "houseMarginPercent",
        "prizeFundPercent",
        "soundVolume",
        "brightness",
        "cooldownMs",
        "minStakeCents",
        "maxStakeCents",
        "maxBetPerFaceCents",
      ];
      for (const key of numericKeys) {
        const value = toNumber(body[key]);
        if (value !== undefined) (patch as Record<string, number>)[key] = value;
      }
      const demoMode = toBool(body.demoMode);
      const maintenanceMode = toBool(body.maintenanceMode);
      const rtpMode = normalizeRtpMode(body.rtpMode);
      if (demoMode !== undefined) patch.demoMode = demoMode;
      if (maintenanceMode !== undefined) patch.maintenanceMode = maintenanceMode;
      if (rtpMode !== undefined) patch.rtpMode = rtpMode;

      res.json({ ...patchSettings(db, patch, adminSession(req)?.adminUser ?? "admin"), balanceCents: readBalance(db), activePlayer: null, now: Date.now() });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo guardar" });
    }
  });

  router.post("/maintenance/test", requireAdmin, (req, res) => {
    const body = req.body as { kind?: string };
    writeAuditLog(db, adminSession(req)?.adminUser ?? "admin", `maintenance.test.${body.kind ?? "unknown"}`, null, { ok: true });
    res.json({ ok: true, kind: body.kind ?? "unknown", checkedAt: Date.now() });
  });

  router.post("/maintenance/backup", requireAdmin, async (req, res) => {
    try {
      const backupDir = path.resolve(process.cwd(), "server", "data", "backups");
      res.json(await backupDatabase(db, backupDir, adminSession(req)?.adminUser ?? "admin"));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "No se pudo crear backup" });
    }
  });

  return router;
}
