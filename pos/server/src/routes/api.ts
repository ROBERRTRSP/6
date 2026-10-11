import { Router } from "express";
import type { Db } from "../db.js";
import { createTicket, getDailySummary, getTicket, listTickets, voidTicket } from "../db.js";
import type { BetMode, CreateTicketInput, GameType } from "../types.js";

function parseLimit(value: unknown) {
  const n = Number(value ?? 50);
  return Number.isFinite(n) ? Math.trunc(n) : 50;
}

export function createApiRouter(db: Db) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "loteria-pos", now: Date.now() });
  });

  router.get("/summary", (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json(getDailySummary(db, date));
  });

  router.get("/tickets", (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    res.json({ tickets: listTickets(db, parseLimit(req.query.limit), date) });
  });

  router.get("/tickets/:id", (req, res) => {
    const ticket = getTicket(db, req.params.id);
    if (!ticket) {
      res.status(404).json({ error: "Ticket no encontrado." });
      return;
    }
    res.json(ticket);
  });

  router.post("/tickets", (req, res) => {
    try {
      const body = req.body as Partial<CreateTicketInput>;
      const ticket = createTicket(db, {
        game: body.game as GameType,
        betMode: (body.betMode as BetMode | null | undefined) ?? null,
        numbers: Array.isArray(body.numbers) ? body.numbers.map(String) : [],
        amountCents: Number(body.amountCents),
      });
      res.status(201).json(ticket);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo vender." });
    }
  });

  router.post("/tickets/:id/void", (req, res) => {
    try {
      const ticket = voidTicket(db, req.params.id);
      res.json(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo anular.";
      res.status(message.includes("no encontrado") ? 404 : 400).json({ error: message });
    }
  });

  return router;
}
