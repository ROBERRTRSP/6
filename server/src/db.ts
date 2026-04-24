import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { PublicSettings } from "./types.js";

const DEFAULT_SETTINGS: PublicSettings = {
  primaryColor: "#c9a227",
  soundEnabled: true,
};

export function openDatabase(dbPath: string) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY,
      chosen_number INTEGER NOT NULL,
      dice_json TEXT NOT NULL,
      matches INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rolls_created_at ON rolls (created_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertDefault = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  );
  insertDefault.run("primary_color", DEFAULT_SETTINGS.primaryColor);
  insertDefault.run("sound_enabled", DEFAULT_SETTINGS.soundEnabled ? "1" : "0");

  return db;
}

export type Db = ReturnType<typeof openDatabase>;

export function getPublicSettings(db: Db): PublicSettings {
  const rowColor = db
    .prepare(`SELECT value FROM settings WHERE key = 'primary_color'`)
    .get() as { value: string } | undefined;
  const rowSound = db
    .prepare(`SELECT value FROM settings WHERE key = 'sound_enabled'`)
    .get() as { value: string } | undefined;

  return {
    primaryColor: rowColor?.value ?? DEFAULT_SETTINGS.primaryColor,
    soundEnabled: (rowSound?.value ?? "1") === "1",
  };
}

export function setPublicSettings(
  db: Db,
  patch: Partial<{ primaryColor: string; soundEnabled: boolean }>
) {
  if (patch.primaryColor !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(patch.primaryColor)) {
      throw new Error("primaryColor must be a #RRGGBB hex value");
    }
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('primary_color', @v)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ v: patch.primaryColor });
  }
  if (patch.soundEnabled !== undefined) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('sound_enabled', @v)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run({ v: patch.soundEnabled ? "1" : "0" });
  }
}

export function insertRoll(
  db: Db,
  input: {
    id: string;
    chosenNumber: number;
    dice: number[];
    matches: number;
    createdAt: number;
  }
) {
  db.prepare(
    `INSERT INTO rolls (id, chosen_number, dice_json, matches, created_at)
     VALUES (@id, @chosenNumber, @diceJson, @matches, @createdAt)`
  ).run({
    id: input.id,
    chosenNumber: input.chosenNumber,
    diceJson: JSON.stringify(input.dice),
    matches: input.matches,
    createdAt: input.createdAt,
  });
}

export function listRolls(db: Db, limit: number) {
  const rows = db
    .prepare(
      `SELECT id, chosen_number as chosenNumber, dice_json as diceJson, matches, created_at as createdAt
       FROM rolls
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(Math.min(Math.max(limit, 1), 500)) as Array<{
    id: string;
    chosenNumber: number;
    diceJson: string;
    matches: number;
    createdAt: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    chosenNumber: r.chosenNumber,
    dice: JSON.parse(r.diceJson) as number[],
    matches: r.matches,
    createdAt: r.createdAt,
  }));
}

export function countRolls(db: Db): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM rolls`).get() as { c: number };
  return row.c;
}
