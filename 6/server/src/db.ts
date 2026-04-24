import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type {
  AdminStats,
  AuditLogEntry,
  BackupResult,
  BetsCents,
  GameSettings,
  LineResult,
  PlayerMovement,
  PlayerRecord,
  PlayerStatus,
  PlayRecord,
  RtpMode,
} from "./types.js";

const defaults: GameSettings = {
  creditValueCents: 100,
  jackpotSeedCents: 50_000,
  jackpotPoolCents: 50_000,
  jackpotContributionPercent: 3,
  houseMarginPercent: 12,
  prizeFundPercent: 85,
  soundVolume: 85,
  brightness: 100,
  cooldownMs: 900,
  demoMode: false,
  maintenanceMode: false,
  rtpMode: "normal",
  minStakeCents: 100,
  maxStakeCents: 100_000 * 100,
  maxBetPerFaceCents: 50_000,
};

const MAX_PLAYER_INITIAL_BALANCE_CENTS = 100_000 * 100;
const MAX_PLAYER_BALANCE_CENTS = 100_000 * 100;
const MAX_PLAYER_MOVEMENT_CENTS = 10_000 * 100;

export function openDatabase(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance_cents INTEGER NOT NULL,
      credits_sold_cents INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plays (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      bets_json TEXT NOT NULL,
      dice_json TEXT NOT NULL,
      results_json TEXT NOT NULL,
      total_wager_cents INTEGER NOT NULL,
      payout_cents INTEGER NOT NULL,
      jackpot_paid_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL,
      free_rerolls INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      admin_user TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT
    );
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      phone TEXT UNIQUE,
      pin TEXT NOT NULL UNIQUE,
      balance_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
      note TEXT,
      qr_code TEXT,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_movements (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id),
      created_at INTEGER NOT NULL,
      admin_user TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      balance_before_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_plays_created ON plays (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_players_alias ON players (alias);
    CREATE INDEX IF NOT EXISTS idx_player_movements_player_created ON player_movements (player_id, created_at DESC);
  `);

  db.prepare(`INSERT OR IGNORE INTO wallet (id, balance_cents, credits_sold_cents) VALUES (1, 500000, 500000)`).run();
  const putDefault = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, value] of Object.entries(defaults)) putDefault.run(key, String(value));
  return db;
}

export type Db = ReturnType<typeof openDatabase>;

function rawSetting(db: Db, key: keyof GameSettings): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? String(defaults[key]);
}

function intSetting(db: Db, key: keyof GameSettings): number {
  const value = Number(rawSetting(db, key));
  return Number.isFinite(value) ? Math.trunc(value) : Number(defaults[key]);
}

function boolSetting(db: Db, key: keyof GameSettings): boolean {
  return rawSetting(db, key) === "true";
}

export function readSettings(db: Db): GameSettings {
  const mode = rawSetting(db, "rtpMode");
  return {
    creditValueCents: intSetting(db, "creditValueCents"),
    jackpotSeedCents: intSetting(db, "jackpotSeedCents"),
    jackpotPoolCents: intSetting(db, "jackpotPoolCents"),
    jackpotContributionPercent: intSetting(db, "jackpotContributionPercent"),
    houseMarginPercent: intSetting(db, "houseMarginPercent"),
    prizeFundPercent: intSetting(db, "prizeFundPercent"),
    soundVolume: intSetting(db, "soundVolume"),
    brightness: intSetting(db, "brightness"),
    cooldownMs: intSetting(db, "cooldownMs"),
    demoMode: boolSetting(db, "demoMode"),
    maintenanceMode: boolSetting(db, "maintenanceMode"),
    rtpMode: mode === "conservative" || mode === "promotional" ? mode : "normal",
    minStakeCents: intSetting(db, "minStakeCents"),
    maxStakeCents: intSetting(db, "maxStakeCents"),
    maxBetPerFaceCents: intSetting(db, "maxBetPerFaceCents"),
  };
}

export function patchSettings(db: Db, patch: Partial<GameSettings>, adminUser: string): GameSettings {
  const before = readSettings(db);
  const next: GameSettings = { ...before, ...patch };
  const economyTotal = next.jackpotContributionPercent + next.houseMarginPercent + next.prizeFundPercent;
  if (next.jackpotContributionPercent < 0 || next.houseMarginPercent < 0 || next.prizeFundPercent < 0) {
    throw new Error("Los porcentajes de economía no pueden ser negativos");
  }
  if (economyTotal !== 100) throw new Error("Economía inválida: jackpot + casa + premios debe sumar 100%");
  if (next.soundVolume < 0 || next.soundVolume > 100 || next.brightness < 25 || next.brightness > 100) {
    throw new Error("Volumen o brillo fuera de rango");
  }

  db.transaction(() => {
    const stmt = db.prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    for (const [key, value] of Object.entries(next)) stmt.run({ key, value: String(value) });
    db.prepare(
      `INSERT INTO audit_log (created_at, admin_user, action, before_json, after_json)
       VALUES (@createdAt, @adminUser, 'settings.patch', @beforeJson, @afterJson)`
    ).run({
      createdAt: Date.now(),
      adminUser,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(next),
    });
  })();

  return readSettings(db);
}

export function writeAuditLog(db: Db, adminUser: string, action: string, before: unknown = null, after: unknown = null) {
  db.prepare(
    `INSERT INTO audit_log (created_at, admin_user, action, before_json, after_json)
     VALUES (@createdAt, @adminUser, @action, @beforeJson, @afterJson)`
  ).run({
    createdAt: Date.now(),
    adminUser,
    action,
    beforeJson: before === null ? null : JSON.stringify(before),
    afterJson: after === null ? null : JSON.stringify(after),
  });
}

export function writeJackpotPool(db: Db, jackpotPoolCents: number) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('jackpotPoolCents', @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ value: String(Math.max(0, Math.trunc(jackpotPoolCents))) });
}

export function readBalance(db: Db): number {
  const row = db.prepare(`SELECT balance_cents FROM wallet WHERE id = 1`).get() as { balance_cents: number };
  return row.balance_cents;
}

export function readActivePlayer(db: Db): PlayerRecord | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'activePlayerId'`).get() as
    | { value: string }
    | undefined;
  if (!row?.value) return null;
  try {
    return getPlayer(db, row.value);
  } catch {
    return null;
  }
}

export function setActivePlayer(db: Db, playerId: string | null, adminUser: string) {
  const before = readActivePlayer(db);
  if (playerId) {
    const player = getPlayer(db, playerId);
    if (player.status !== "active") throw new Error("Jugador bloqueado");
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('activePlayerId', @playerId)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ playerId });
    writeAuditLog(db, adminUser, "player.start_game", before, player);
    return player;
  }
  db.prepare(`DELETE FROM settings WHERE key = 'activePlayerId'`).run();
  writeAuditLog(db, adminUser, "player.clear_active", before, null);
  return null;
}

export function setBalance(db: Db, balanceCents: number) {
  db.prepare(`UPDATE wallet SET balance_cents = @balance WHERE id = 1`).run({ balance: Math.max(0, Math.trunc(balanceCents)) });
}

export function insertPlay(db: Db, record: PlayRecord) {
  db.prepare(
    `INSERT INTO plays (
      id, created_at, bets_json, dice_json, results_json, total_wager_cents,
      payout_cents, jackpot_paid_cents, balance_after_cents, free_rerolls
    ) VALUES (
      @id, @createdAt, @betsJson, @diceJson, @resultsJson, @totalWager,
      @payout, @jackpotPaid, @balanceAfter, @freeRerolls
    )`
  ).run({
    id: record.id,
    createdAt: record.createdAt,
    betsJson: JSON.stringify(record.bets),
    diceJson: JSON.stringify(record.dice),
    resultsJson: JSON.stringify(record.lineResults),
    totalWager: record.totalWagerCents,
    payout: record.payoutCents,
    jackpotPaid: record.jackpotPaidCents,
    balanceAfter: record.balanceAfterCents,
    freeRerolls: record.freeRerolls,
  });
}

type PlayRow = {
  id: string;
  createdAt: number;
  betsJson: string;
  diceJson: string;
  resultsJson: string;
  totalWagerCents: number;
  payoutCents: number;
  jackpotPaidCents: number;
  balanceAfterCents: number;
  freeRerolls: number;
};

function parsePlay(row: PlayRow): PlayRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    bets: JSON.parse(row.betsJson) as BetsCents,
    dice: JSON.parse(row.diceJson),
    lineResults: JSON.parse(row.resultsJson) as LineResult[],
    totalWagerCents: row.totalWagerCents,
    payoutCents: row.payoutCents,
    jackpotPaidCents: row.jackpotPaidCents,
    balanceAfterCents: row.balanceAfterCents,
    freeRerolls: row.freeRerolls,
  };
}

export function listPlays(db: Db, limit = 50): PlayRecord[] {
  const rows = db
    .prepare(
      `SELECT id, created_at as createdAt, bets_json as betsJson, dice_json as diceJson,
              results_json as resultsJson, total_wager_cents as totalWagerCents,
              payout_cents as payoutCents, jackpot_paid_cents as jackpotPaidCents,
              balance_after_cents as balanceAfterCents, free_rerolls as freeRerolls
       FROM plays ORDER BY created_at DESC LIMIT ?`
    )
    .all(Math.max(1, Math.min(500, Math.trunc(limit)))) as PlayRow[];
  return rows.map(parsePlay);
}

export function listAuditLogs(db: Db, limit = 100): AuditLogEntry[] {
  return db
    .prepare(
      `SELECT id, created_at as createdAt, admin_user as adminUser, action, before_json as beforeJson, after_json as afterJson
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.min(500, Math.trunc(limit)))) as AuditLogEntry[];
}

type PlayerRow = {
  id: string;
  alias: string;
  phone: string | null;
  pin: string;
  balanceCents: number;
  status: PlayerStatus;
  note: string | null;
  qrCode: string | null;
  createdAt: number;
  createdBy: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanOptional(value: unknown): string | null {
  const text = cleanText(value);
  return text.length > 0 ? text : null;
}

function normalizePlayer(row: PlayerRow): PlayerRecord {
  return {
    ...row,
    status: row.status === "inactive" ? "inactive" : "active",
  };
}

export function getPlayer(db: Db, playerId: string): PlayerRecord {
  const row = db
    .prepare(
      `SELECT id, alias, phone, pin, balance_cents as balanceCents, status, note,
              qr_code as qrCode, created_at as createdAt, created_by as createdBy
       FROM players WHERE id = ?`
    )
    .get(playerId) as PlayerRow | undefined;
  if (!row) throw new Error("Jugador no encontrado");
  return normalizePlayer(row);
}

function insertPlayerMovement(
  db: Db,
  movement: Omit<PlayerMovement, "id" | "createdAt">
): PlayerMovement {
  const record: PlayerMovement = {
    ...movement,
    id: nanoid(),
    createdAt: Date.now(),
  };
  db.prepare(
    `INSERT INTO player_movements (
      id, player_id, created_at, admin_user, type, amount_cents,
      balance_before_cents, balance_after_cents, note
    ) VALUES (
      @id, @playerId, @createdAt, @adminUser, @type, @amountCents,
      @balanceBeforeCents, @balanceAfterCents, @note
    )`
  ).run(record);
  return record;
}

export function settlePlayerPlayBalance(
  db: Db,
  playerId: string,
  wagerCents: number,
  payoutCents: number,
  roundId: string
): PlayerRecord {
  const before = getPlayer(db, playerId);
  if (before.status !== "active") throw new Error("Jugador bloqueado");
  if (before.balanceCents < wagerCents) throw new Error("Saldo insuficiente del jugador");

  const nextBalance = before.balanceCents - wagerCents + payoutCents;
  db.prepare(`UPDATE players SET balance_cents = ? WHERE id = ?`).run(nextBalance, playerId);
  insertPlayerMovement(db, {
    playerId,
    adminUser: "system",
    type: "play",
    amountCents: payoutCents - wagerCents,
    balanceBeforeCents: before.balanceCents,
    balanceAfterCents: nextBalance,
    note: `round:${roundId}`,
  });
  return getPlayer(db, playerId);
}

export function searchPlayers(db: Db, query = "", limit = 50): PlayerRecord[] {
  const q = cleanText(query);
  const capped = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = q
    ? (db
        .prepare(
          `SELECT id, alias, phone, pin, balance_cents as balanceCents, status, note,
                  qr_code as qrCode, created_at as createdAt, created_by as createdBy
           FROM players
           WHERE alias LIKE @term OR phone LIKE @term OR pin LIKE @term OR id LIKE @term
           ORDER BY created_at DESC
           LIMIT @limit`
        )
        .all({ term: `%${q}%`, limit: capped }) as PlayerRow[])
    : (db
        .prepare(
          `SELECT id, alias, phone, pin, balance_cents as balanceCents, status, note,
                  qr_code as qrCode, created_at as createdAt, created_by as createdBy
           FROM players
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(capped) as PlayerRow[]);
  return rows.map(normalizePlayer);
}

export function createPlayer(
  db: Db,
  input: { alias?: unknown; phone?: unknown; pin?: unknown; balanceCents?: unknown; active?: unknown; note?: unknown },
  adminUser: string
): PlayerRecord {
  const alias = cleanText(input.alias);
  const phone = cleanOptional(input.phone);
  const pin = cleanText(input.pin);
  const note = cleanOptional(input.note);
  const initialBalance = Math.max(0, Math.trunc(Number(input.balanceCents ?? 0) || 0));
  const status: PlayerStatus = input.active === false ? "inactive" : "active";
  if (!alias) throw new Error("Nombre o alias requerido");
  if (!pin) throw new Error("PIN requerido");
  if (initialBalance > MAX_PLAYER_INITIAL_BALANCE_CENTS) throw new Error("Balance inicial máximo: US$100,000");

  const tx = db.transaction(() => {
    const id = nanoid();
    const createdAt = Date.now();
    const qrCode = `lucky-six-player:${id}`;
    try {
      db.prepare(
        `INSERT INTO players (
          id, alias, phone, pin, balance_cents, status, note, qr_code, created_at, created_by
        ) VALUES (
          @id, @alias, @phone, @pin, @balanceCents, @status, @note, @qrCode, @createdAt, @createdBy
        )`
      ).run({
        id,
        alias,
        phone,
        pin,
        balanceCents: initialBalance,
        status,
        note,
        qrCode,
        createdAt,
        createdBy: adminUser,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("players.phone")) throw new Error("Ya existe un jugador con ese teléfono");
      if (msg.includes("players.pin")) throw new Error("Ya existe un jugador con ese PIN");
      throw error;
    }

    if (initialBalance > 0) {
      insertPlayerMovement(db, {
        playerId: id,
        adminUser,
        type: "initial_topup",
        amountCents: initialBalance,
        balanceBeforeCents: 0,
        balanceAfterCents: initialBalance,
        note: "recarga inicial",
      });
    }
    writeAuditLog(db, adminUser, "player.create", null, { id, alias, phone, initialBalance, status });
    return getPlayer(db, id);
  });

  return tx();
}

export function adjustPlayerBalance(
  db: Db,
  playerId: string,
  input: { type?: unknown; amountCents?: unknown; note?: unknown },
  adminUser: string
): { player: PlayerRecord; movement: PlayerMovement } {
  const type = input.type === "debit" ? "debit" : "topup";
  const amount = Math.trunc(Number(input.amountCents ?? 0) || 0);
  const note = cleanOptional(input.note);
  if (amount <= 0) throw new Error("Monto inválido");
  if (amount > MAX_PLAYER_MOVEMENT_CENTS) throw new Error("Monto máximo por movimiento: US$10,000");

  const tx = db.transaction(() => {
    const before = getPlayer(db, playerId);
    const nextBalance = type === "debit" ? before.balanceCents - amount : before.balanceCents + amount;
    if (nextBalance < 0) throw new Error("Saldo insuficiente para descontar");
    if (nextBalance > MAX_PLAYER_BALANCE_CENTS) throw new Error("Balance máximo del jugador: US$100,000");

    db.prepare(`UPDATE players SET balance_cents = ? WHERE id = ?`).run(nextBalance, playerId);
    const movement = insertPlayerMovement(db, {
      playerId,
      adminUser,
      type,
      amountCents: type === "debit" ? -amount : amount,
      balanceBeforeCents: before.balanceCents,
      balanceAfterCents: nextBalance,
      note,
    });
    const player = getPlayer(db, playerId);
    writeAuditLog(db, adminUser, `player.balance.${type}`, before, { player, movement });
    return { player, movement };
  });

  return tx();
}

export function setPlayerStatus(
  db: Db,
  playerId: string,
  active: boolean,
  adminUser: string
): { player: PlayerRecord; movement: PlayerMovement } {
  const tx = db.transaction(() => {
    const before = getPlayer(db, playerId);
    const status: PlayerStatus = active ? "active" : "inactive";
    db.prepare(`UPDATE players SET status = ? WHERE id = ?`).run(status, playerId);
    const movement = insertPlayerMovement(db, {
      playerId,
      adminUser,
      type: "status_change",
      amountCents: 0,
      balanceBeforeCents: before.balanceCents,
      balanceAfterCents: before.balanceCents,
      note: active ? "jugador activado" : "jugador bloqueado",
    });
    const player = getPlayer(db, playerId);
    writeAuditLog(db, adminUser, "player.status", before, player);
    return { player, movement };
  });

  return tx();
}

export function listPlayerMovements(db: Db, playerId: string, limit = 100): PlayerMovement[] {
  getPlayer(db, playerId);
  return db
    .prepare(
      `SELECT id, player_id as playerId, created_at as createdAt, admin_user as adminUser, type,
              amount_cents as amountCents, balance_before_cents as balanceBeforeCents,
              balance_after_cents as balanceAfterCents, note
       FROM player_movements
       WHERE player_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(playerId, Math.max(1, Math.min(300, Math.trunc(limit)))) as PlayerMovement[];
}

export async function backupDatabase(db: Db, backupDir: string, adminUser: string): Promise<BackupResult> {
  fs.mkdirSync(backupDir, { recursive: true });
  const createdAt = Date.now();
  const file = path.join(backupDir, `lucky-six-${createdAt}.db`);
  await db.backup(file);
  writeAuditLog(db, adminUser, "maintenance.backup", null, { file });
  return { ok: true, file, createdAt };
}

export function getAdminStats(db: Db): AdminStats {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = db
    .prepare(
      `SELECT COUNT(*) as playsToday,
              COALESCE(SUM(total_wager_cents), 0) as totalWageredToday,
              COALESCE(SUM(payout_cents), 0) as totalPaidToday,
              COALESCE(SUM(free_rerolls), 0) as freeGamesToday,
              COALESCE(SUM(CASE WHEN jackpot_paid_cents > 0 THEN 1 ELSE 0 END), 0) as jackpotHitsToday
       FROM plays WHERE created_at >= ?`
    )
    .get(start.getTime()) as Pick<AdminStats, "playsToday" | "totalWageredToday" | "totalPaidToday" | "freeGamesToday" | "jackpotHitsToday">;
  const wallet = db.prepare(`SELECT credits_sold_cents as creditsSoldToday FROM wallet WHERE id = 1`).get() as {
    creditsSoldToday: number;
  };
  const winner = db.prepare(`SELECT id FROM plays WHERE jackpot_paid_cents > 0 ORDER BY created_at DESC LIMIT 1`).get() as
    | { id: string }
    | undefined;
  return {
    ...row,
    creditsSoldToday: wallet.creditsSoldToday,
    netToday: row.totalWageredToday - row.totalPaidToday,
    jackpotPoolCents: readSettings(db).jackpotPoolCents,
    lastJackpotWinner: winner?.id ?? null,
  };
}

export function normalizeRtpMode(value: unknown): RtpMode | undefined {
  return value === "normal" || value === "conservative" || value === "promotional" ? value : undefined;
}
