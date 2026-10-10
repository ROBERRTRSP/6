export type GameType = "quiniela" | "pale" | "tripleta" | "super_pale" | "pick3" | "pick4";

export type BetMode = "straight" | "box" | "straight_box";

export type TicketStatus = "sold" | "void";

export type Ticket = {
  id: string;
  ticketNumber: string;
  game: GameType;
  betMode: BetMode | null;
  numbers: string[];
  amountCents: number;
  status: TicketStatus;
  createdAt: number;
  voidedAt: number | null;
};

export type DailySummary = {
  date: string;
  soldCount: number;
  voidCount: number;
  soldAmountCents: number;
  voidAmountCents: number;
  netAmountCents: number;
  byGame: Record<GameType, { count: number; amountCents: number }>;
};

export type CreateTicketInput = {
  game: GameType;
  betMode?: BetMode | null;
  numbers: string[];
  amountCents: number;
};
