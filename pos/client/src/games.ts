import type { BetMode, GameType } from "./types";

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

export function getGame(game: GameType): GameDef {
  return GAMES.find((g) => g.id === game)!;
}

export function gameLabel(game: GameType) {
  return getGame(game).label;
}

export function modeLabel(mode: BetMode | null | undefined) {
  if (!mode) return "";
  if (mode === "straight") return "Straight";
  if (mode === "box") return "Box";
  return "Straight + Box";
}

export function formatTicketLine(game: GameType, numbers: string[], betMode?: BetMode | null) {
  const mode = modeLabel(betMode);
  const nums = getGame(game).kind === "digit1" ? numbers.join("") : numbers.join("-");
  return mode ? `${gameLabel(game)} ${mode} · ${nums}` : `${gameLabel(game)} · ${nums}`;
}
