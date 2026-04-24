import { Router } from "express";
import type { Db } from "../db.js";
import { getPublicSettings } from "../db.js";
import { executePlay } from "../rollService.js";

export function createPublicRouter(db: Db) {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  r.get("/settings", (_req, res) => {
    res.json(getPublicSettings(db));
  });

  r.post("/play", (req, res) => {
    try {
      const chosenNumber = Number(req.body?.chosenNumber);
      const result = executePlay(db, chosenNumber);
      res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid request";
      res.status(400).json({ error: message });
    }
  });

  return r;
}
