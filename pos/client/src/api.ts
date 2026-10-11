import type { BetMode, DailySummary, GameType, Ticket } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  return data;
}

export function fetchHealth() {
  return request<{ ok: boolean }>("/api/health");
}

export function fetchSummary() {
  return request<DailySummary>("/api/summary");
}

export function fetchTickets(limit = 40) {
  return request<{ tickets: Ticket[] }>(`/api/tickets?limit=${limit}`);
}

export function sellTicket(input: {
  game: GameType;
  betMode?: BetMode | null;
  numbers: string[];
  amountCents: number;
}) {
  return request<Ticket>("/api/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function voidTicket(id: string) {
  return request<Ticket>(`/api/tickets/${id}/void`, { method: "POST" });
}
