import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import { getPlayer, insertPlay, readBalance, readSettings, setBalance, settlePlayerPlayBalance, writeJackpotPool, type Db } from "./db.js";
import type { BetsCents, Face, LineResult, PlayResponse } from "./types.js";

const FACES: Face[] = [1, 2, 3, 4, 5, 6];

function money(cents: number): string {
  return `US$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function emptyBets(): BetsCents {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

function rollDice(): Face[] {
  return Array.from({ length: 6 }, () => randomInt(1, 7) as Face);
}

function countFace(dice: Face[], face: Face): number {
  return dice.filter((v) => v === face).length;
}

export function normalizeBets(raw: unknown): BetsCents {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const source = body.bets && typeof body.bets === "object" ? (body.bets as Record<string, unknown>) : body;
  const bets = emptyBets();

  for (const face of FACES) {
    const value = Number(source[String(face)] ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Apuesta inválida en ${face}`);
    bets[face] = Math.trunc(value);
  }

  return bets;
}

function multiplierForCount(count: number): number {
  return count >= 3 ? count : 0;
}

function cloneActive(bets: BetsCents): BetsCents {
  return { ...bets };
}

function hasActiveBet(bets: BetsCents): boolean {
  return FACES.some((face) => bets[face] > 0);
}

function applyRtpMode(dice: Face[], mode: string, active: BetsCents): Face[] {
  if (mode === "normal") return dice;

  const jackpotFaces = FACES.filter((face) => active[face] > 0 && countFace(dice, face) === 6);
  if (mode === "conservative" && jackpotFaces.length > 0 && randomInt(0, 100) < 45) {
    const copy = [...dice];
    copy[0] = ((copy[0] % 6) + 1) as Face;
    return copy;
  }

  if (mode === "promotional" && hasActiveBet(active) && randomInt(0, 100) < 10) {
    const candidates = FACES.filter((face) => active[face] > 0);
    const face = candidates[randomInt(0, candidates.length)];
    return [face, face, face, ...dice.slice(3)] as Face[];
  }

  return dice;
}

export function executeLuckySixPlay(db: Db, rawBets: unknown): PlayResponse {
  const bets = normalizeBets(rawBets);
  const body = rawBets && typeof rawBets === "object" ? (rawBets as Record<string, unknown>) : {};
  const playerId = typeof body.playerId === "string" && body.playerId.trim() ? body.playerId.trim() : null;
  const totalWager = FACES.reduce((sum, face) => sum + bets[face], 0);
  if (totalWager <= 0) throw new Error("Indicá al menos una apuesta");

  const tx = db.transaction(() => {
    const settings = readSettings(db);
    if (settings.maintenanceMode) throw new Error("Juego en mantenimiento");
    if (totalWager < settings.minStakeCents) throw new Error(`Apuesta mínima: ${money(settings.minStakeCents)}`);
    if (totalWager > settings.maxStakeCents) throw new Error(`Apuesta máxima: ${money(settings.maxStakeCents)}`);
    for (const face of FACES) {
      if (bets[face] > settings.maxBetPerFaceCents) throw new Error(`Apuesta en ${face} supera el máximo`);
    }

    const playerBefore = playerId ? getPlayer(db, playerId) : null;
    const balanceBefore = playerBefore?.balanceCents ?? readBalance(db);
    if (playerBefore && playerBefore.status !== "active") throw new Error("Jugador bloqueado");
    if (!settings.demoMode && balanceBefore < totalWager) throw new Error(playerId ? "Saldo insuficiente del jugador" : "Saldo insuficiente");
    if (!settings.demoMode && !playerId) setBalance(db, balanceBefore - totalWager);

    let jackpotPool = settings.jackpotPoolCents + Math.floor((totalWager * settings.jackpotContributionPercent) / 100);
    const officialDice = applyRtpMode(rollDice(), settings.rtpMode, cloneActive(bets));
    const lineResults: LineResult[] = [];
    let payout = 0;
    let jackpotPaid = 0;

    for (const face of FACES) {
      const stake = bets[face];
      if (stake <= 0) continue;

      const count = countFace(officialDice, face);
      const multiplier = multiplierForCount(count);
      const lineWin = stake * multiplier;
      let lineJackpot = 0;
      if (count === 6) {
        lineJackpot = jackpotPool;
        jackpotPool = settings.jackpotSeedCents;
      }

      const totalLineWin = lineWin + lineJackpot;
      payout += totalLineWin;
      jackpotPaid += lineJackpot;
      lineResults.push({
        face,
        stakeCents: stake,
        count,
        outcome: lineJackpot > 0 ? "jackpot" : multiplier > 0 ? "win" : "lose",
        payoutCents: totalLineWin,
        jackpotPaidCents: lineJackpot,
      });
    }

    const record = {
      id: nanoid(),
      createdAt: Date.now(),
      bets,
      dice: [officialDice],
      lineResults,
      totalWagerCents: totalWager,
      payoutCents: payout,
      jackpotPaidCents: jackpotPaid,
      balanceAfterCents: 0,
      freeRerolls: 0,
    };

    writeJackpotPool(db, jackpotPool);
    const balanceAfter = settings.demoMode
      ? balanceBefore
      : playerId
        ? settlePlayerPlayBalance(db, playerId, totalWager, payout, record.id).balanceCents
        : (() => {
            if (payout > 0) setBalance(db, readBalance(db) + payout);
            return readBalance(db);
          })();
    record.balanceAfterCents = balanceAfter;
    insertPlay(db, record);
    return { ...record, jackpotPoolCents: jackpotPool };
  });

  return tx();
}
