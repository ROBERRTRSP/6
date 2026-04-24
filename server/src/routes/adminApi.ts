import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Db } from "../db.js";
import { countRolls, getPublicSettings, listRolls, setPublicSettings } from "../db.js";
import { requireAdmin, type AdminRequest } from "../middleware/adminSession.js";

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function createAdminRouter(db: Db, adminUser: string, adminPassword: string) {
  const r = Router();

  r.post("/login", (req, res) => {
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");

    if (username === adminUser && safeEqualString(password, adminPassword)) {
      req.session.admin = true;
      return res.json({ ok: true });
    }
    return res.status(401).json({ error: "Invalid credentials" });
  });

  r.post("/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  r.get("/me", requireAdmin, (req: AdminRequest, res) => {
    res.json({ admin: true, user: adminUser });
  });

  r.get("/plays", requireAdmin, (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json({ plays: listRolls(db, Number.isFinite(limit) ? limit : 100) });
  });

  r.get("/stats", requireAdmin, (_req, res) => {
    res.json({ totalPlays: countRolls(db) });
  });

  r.get("/settings", requireAdmin, (_req, res) => {
    res.json(getPublicSettings(db));
  });

  r.patch("/settings", requireAdmin, (req, res) => {
    try {
      const body = req.body ?? {};
      const patch: Partial<{ primaryColor: string; soundEnabled: boolean }> = {};

      if (body.primaryColor !== undefined) {
        patch.primaryColor = String(body.primaryColor);
      }
      if (body.soundEnabled !== undefined) {
        patch.soundEnabled = Boolean(body.soundEnabled);
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No valid fields" });
      }

      setPublicSettings(db, patch);
      res.json(getPublicSettings(db));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid request";
      res.status(400).json({ error: message });
    }
  });

  return r;
}
