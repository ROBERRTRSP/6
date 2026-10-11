import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { customAlphabet } from "nanoid";
import { emptyByGame, GAME_IDS, getGame } from "./games.js";
import type { BetMode, CreateTicketInput, DailySummary, GameType, Ticket } from "./types.js";

export type Db = Database.Database;

const ticketId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 10);
const ticketSerial = customAlphabet("0123456789", 6);

function todayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function startOfDayMs(date = todayKey()) {
  return new Date(`${date}T00:00:00.000`).getTime();
}

function endOfDayMs(date = todayKey()) {
  return new Date(`${date}T23:59:59.999`).getTime();
}

function mapTicket(row: {
  id: string;
  ticket_number: string;
  game: string;
  bet_mode: string | null;
  numbers_json: string;
  amount_cents: number;
  status: string;
  created_at: number;
  voided_at: number | null;
}): Ticket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    game: row.game as GameType,
    betMode: (row.bet_mode as BetMode | null) ?? null,
    numbers: JSON.parse(row.numbers_json) as string[],
    amountCents: row.amount_cents,
    status: row.status as Ticket["status"],
    createdAt: row.created_at,
    voidedAt: row.voided_at,
  };
}

export function openDb(databasePath: string): Db {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL UNIQUE,
      game TEXT NOT NULL,
      bet_mode TEXT,
      numbers_json TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      voided_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  `);

  const cols = db.prepare(`PRAGMA table_info(tickets)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "bet_mode")) {
    db.exec(`ALTER TABLE tickets ADD COLUMN bet_mode TEXT`);
  }

  return db;
}

export function normalizeNumbers(game: GameType, numbers: string[]): string[] {
  const def = getGame(game);
  if (!Array.isArray(numbers) || numbers.length !== def.picks) {
    throw new Error(`Este juego requiere ${def.picks} número(s).`);
  }

  return numbers.map((raw, index) => {
    const value = String(raw ?? "").trim();
    if (def.kind === "digit1") {
      if (!/^\d$/.test(value)) {
        throw new Error(`Dígito ${index + 1} inválido (0–9).`);
      }
      return value;
    }
    if (!/^\d{1,2}$/.test(value)) {
      throw new Error(`Número ${index + 1} inválido.`);
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 99) {
      throw new Error(`Número ${index + 1} debe estar entre 00 y 99.`);
    }
    return String(n).padStart(2, "0");
  });
}

function normalizeMode(game: GameType, mode: BetMode | null | undefined): BetMode | null {
  const def = getGame(game);
  if (!def.modes) {
    if (mode) throw new Error("Este juego no usa modalidad Straight/Box.");
    return null;
  }
  const resolved = mode ?? "straight";
  if (!def.modes.includes(resolved)) {
    throw new Error("Modalidad inválida. Use Straight, Box o Straight + Box.");
  }
  return resolved;
}

export function createTicket(db: Db, input: CreateTicketInput): Ticket {
  if (!GAME_IDS.includes(input.game)) {
    throw new Error("Juego no soportado.");
  }
  const amountCents = Math.trunc(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 100) {
    throw new Error("El monto mínimo es RD$1.00.");
  }
  if (amountCents > 50_000_00) {
    throw new Error("El monto máximo por ticket es RD$50,000.00.");
  }

  const numbers = normalizeNumbers(input.game, input.numbers);
  const betMode = normalizeMode(input.game, input.betMode);
  const now = Date.now();
  const ticket: Ticket = {
    id: ticketId(),
    ticketNumber: `${todayKey().replaceAll("-", "").slice(2)}${ticketSerial()}`,
    game: input.game,
    betMode,
    numbers,
    amountCents,
    status: "sold",
    createdAt: now,
    voidedAt: null,
  };

  db.prepare(
    `INSERT INTO tickets (id, ticket_number, game, bet_mode, numbers_json, amount_cents, status, created_at, voided_at)
     VALUES (@id, @ticketNumber, @game, @betMode, @numbersJson, @amountCents, @status, @createdAt, @voidedAt)`
  ).run({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    game: ticket.game,
    betMode: ticket.betMode,
    numbersJson: JSON.stringify(ticket.numbers),
    amountCents: ticket.amountCents,
    status: ticket.status,
    createdAt: ticket.createdAt,
    voidedAt: ticket.voidedAt,
  });

  return ticket;
}

export function listTickets(db: Db, limit = 50, date = todayKey()): Ticket[] {
  const rows = db
    .prepare(
      `SELECT * FROM tickets
       WHERE created_at BETWEEN ? AND ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(startOfDayMs(date), endOfDayMs(date), Math.min(Math.max(limit, 1), 200)) as Array<{
    id: string;
    ticket_number: string;
    game: string;
    bet_mode: string | null;
    numbers_json: string;
    amount_cents: number;
    status: string;
    created_at: number;
    voided_at: number | null;
  }>;
  return rows.map(mapTicket);
}

export function getTicket(db: Db, id: string): Ticket | null {
  const row = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as
    | {
        id: string;
        ticket_number: string;
        game: string;
        bet_mode: string | null;
        numbers_json: string;
        amount_cents: number;
        status: string;
        created_at: number;
        voided_at: number | null;
      }
    | undefined;
  return row ? mapTicket(row) : null;
}

export function voidTicket(db: Db, id: string): Ticket {
  const ticket = getTicket(db, id);
  if (!ticket) throw new Error("Ticket no encontrado.");
  if (ticket.status === "void") throw new Error("El ticket ya está anulado.");

  const voidedAt = Date.now();
  db.prepare(`UPDATE tickets SET status = 'void', voided_at = ? WHERE id = ?`).run(voidedAt, id);
  return { ...ticket, status: "void", voidedAt };
}

export function getDailySummary(db: Db, date = todayKey()): DailySummary {
  const rows = db
    .prepare(
      `SELECT game, status, COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as amount_cents
       FROM tickets
       WHERE created_at BETWEEN ? AND ?
       GROUP BY game, status`
    )
    .all(startOfDayMs(date), endOfDayMs(date)) as Array<{
    game: GameType;
    status: "sold" | "void";
    count: number;
    amount_cents: number;
  }>;

  const byGame = emptyByGame();
  let soldCount = 0;
  let voidCount = 0;
  let soldAmountCents = 0;
  let voidAmountCents = 0;

  for (const row of rows) {
    if (row.status === "sold") {
      soldCount += row.count;
      soldAmountCents += row.amount_cents;
      if (byGame[row.game]) {
        byGame[row.game].count += row.count;
        byGame[row.game].amountCents += row.amount_cents;
      }
    } else {
      voidCount += row.count;
      voidAmountCents += row.amount_cents;
    }
  }

  return {
    date,
    soldCount,
    voidCount,
    soldAmountCents,
    voidAmountCents,
    netAmountCents: soldAmountCents,
    byGame,
  };
}
