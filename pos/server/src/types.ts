export type GameType = "quiniela" | "pale" | "tripleta";

export type TicketStatus = "sold" | "void";

export type Ticket = {
  id: string;
  ticketNumber: string;
  game: GameType;
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
  numbers: string[];
  amountCents: number;
};
