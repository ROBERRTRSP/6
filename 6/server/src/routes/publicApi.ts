import os from "node:os";
import { Router } from "express";
import { getAdminStats, listPlays, readActivePlayer, readBalance, readSettings, setActivePlayer, type Db } from "../db.js";
import { executeLuckySixPlay } from "../luckyDicePlay.js";

function localMachineUrl() {
  const configured = process.env.PUBLIC_KIOSK_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return `http://${net.address}:5173`;
      }
    }
  }
  return "http://localhost:5173";
}

function playerIdFromQr(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("QR inválido");
  if (text.startsWith("lucky-six-player:")) return text.slice("lucky-six-player:".length);
  try {
    const url = new URL(text);
    return url.searchParams.get("player") ?? url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return text;
  }
}

export function createPublicRouter(db: Db) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, name: "Lucky Six Dice Jackpot" });
  });

  router.get("/machine-url", (_req, res) => {
    res.json({ url: localMachineUrl() });
  });

  router.get("/settings", (_req, res) => {
    const activePlayer = readActivePlayer(db);
    res.json({
      ...readSettings(db),
      balanceCents: activePlayer?.balanceCents ?? readBalance(db),
      activePlayer,
      now: Date.now(),
    });
  });

  router.post("/active-player/clear", (_req, res) => {
    res.json({ activePlayer: setActivePlayer(db, null, "public") });
  });

  router.post("/player/activate", (req, res) => {
    try {
      const body = req.body as { playerId?: unknown; qrCode?: unknown };
      const playerId = playerIdFromQr(body.playerId ?? body.qrCode);
      res.json({ activePlayer: setActivePlayer(db, playerId, "qr") });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo conectar jugador" });
    }
  });

  router.get("/history", (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    res.json({ plays: listPlays(db, Number.isFinite(limit) ? limit : 20) });
  });

  router.get("/stats", (_req, res) => {
    res.json(getAdminStats(db));
  });

  router.post("/play", (req, res) => {
    try {
      const activePlayer = readActivePlayer(db);
      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      res.json(executeLuckySixPlay(db, { bets: body.bets, playerId: activePlayer?.id }));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo jugar" });
    }
  });

  return router;
}
