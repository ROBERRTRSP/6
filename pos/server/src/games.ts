import type { BetMode, GameType } from "./types.js";

export type GameKind = "ball2" | "digit1";

export type GameDef = {
  id: GameType;
  label: string;
  picks: number;
  kind: GameKind;
  hint: string;
  modes: BetMode[] | null;
};

export const GAMES: GameDef[] = [
  { id: "quiniela", label: "Quiniela", picks: 1, kind: "ball2", hint: "2 dígitos · 00–99", modes: null },
  { id: "pale", label: "Pale", picks: 2, kind: "ball2", hint: "4 dígitos · dos números", modes: null },
  { id: "tripleta", label: "Tripleta", picks: 3, kind: "ball2", hint: "6 dígitos · tres números", modes: null },
  { id: "super_pale", label: "Súper Pale", picks: 2, kind: "ball2", hint: "2 loterías · 00–99", modes: null },
  {
    id: "pick3",
    label: "Pick 3",
    picks: 3,
    kind: "digit1",
    hint: "3 dígitos · Straight / Box",
    modes: ["straight", "box", "straight_box"],
  },
  {
    id: "pick4",
    label: "Pick 4",
    picks: 4,
    kind: "digit1",
    hint: "4 dígitos · Straight / Box",
    modes: ["straight", "box", "straight_box"],
  },
];

export const GAME_IDS = GAMES.map((g) => g.id) as GameType[];

export function getGame(game: GameType): GameDef {
  const found = GAMES.find((g) => g.id === game);
  if (!found) throw new Error("Juego no soportado.");
  return found;
}

export function modeLabel(mode: BetMode | null): string {
  if (!mode) return "";
  if (mode === "straight") return "Straight";
  if (mode === "box") return "Box";
  return "Straight + Box";
}

export function emptyByGame(): Record<GameType, { count: number; amountCents: number }> {
  return {
    quiniela: { count: 0, amountCents: 0 },
    pale: { count: 0, amountCents: 0 },
    tripleta: { count: 0, amountCents: 0 },
    super_pale: { count: 0, amountCents: 0 },
    pick3: { count: 0, amountCents: 0 },
    pick4: { count: 0, amountCents: 0 },
  };
}
