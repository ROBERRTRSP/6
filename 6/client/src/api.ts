import type {
  AdminStats,
  AuditLogEntry,
  BackupResult,
  PlayerMovement,
  PlayerRecord,
  PlayRecord,
  PlayResponse,
  PublicGameConfig,
} from "./types";

function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined)?.trim().replace(/\/$/, "") ?? "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function json<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("API no disponible");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Error de servidor");
  return body;
}

export async function fetchSettings(): Promise<PublicGameConfig> {
  return json(await fetch(apiUrl("/api/settings")));
}

export async function fetchMachineUrl(): Promise<{ url: string }> {
  return json(await fetch(apiUrl("/api/machine-url")));
}

export async function fetchStats(): Promise<AdminStats> {
  return json(await fetch(apiUrl("/api/stats")));
}

export async function fetchHistory(limit = 20): Promise<{ plays: PlayRecord[] }> {
  return json(await fetch(apiUrl(`/api/history?limit=${limit}`)));
}

export async function playRound(bets: Record<number, number>): Promise<PlayResponse> {
  return json(
    await fetch(apiUrl("/api/play"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bets }),
    })
  );
}

export async function adminLogin(username: string, password: string): Promise<void> {
  await json(
    await fetch(apiUrl("/api/admin/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    })
  );
}

export async function fetchAdminSettings(): Promise<PublicGameConfig> {
  return json(await fetch(apiUrl("/api/admin/settings"), { credentials: "include" }));
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return json(await fetch(apiUrl("/api/admin/stats"), { credentials: "include" }));
}

export async function fetchAdminPlays(limit = 100): Promise<{ plays: PlayRecord[] }> {
  return json(await fetch(apiUrl(`/api/admin/plays?limit=${limit}`), { credentials: "include" }));
}

export async function fetchAuditLogs(limit = 100): Promise<{ logs: AuditLogEntry[] }> {
  return json(await fetch(apiUrl(`/api/admin/audit?limit=${limit}`), { credentials: "include" }));
}

export async function fetchAdminPlayers(q = ""): Promise<{ players: PlayerRecord[] }> {
  return json(
    await fetch(apiUrl(`/api/admin/players?q=${encodeURIComponent(q)}&limit=100`), { credentials: "include" })
  );
}

export async function createAdminPlayer(input: {
  alias: string;
  phone?: string;
  pin: string;
  balanceCents?: number;
  active?: boolean;
  note?: string;
}): Promise<{ player: PlayerRecord }> {
  return json(
    await fetch(apiUrl("/api/admin/players"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    })
  );
}

export async function fetchPlayerMovements(playerId: string): Promise<{ movements: PlayerMovement[] }> {
  return json(await fetch(apiUrl(`/api/admin/players/${playerId}/history?limit=100`), { credentials: "include" }));
}

export async function adjustAdminPlayerBalance(
  playerId: string,
  input: { type: "topup" | "debit"; amountCents: number; note?: string }
): Promise<{ player: PlayerRecord; movement: PlayerMovement }> {
  return json(
    await fetch(apiUrl(`/api/admin/players/${playerId}/balance`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    })
  );
}

export async function setAdminPlayerStatus(
  playerId: string,
  active: boolean
): Promise<{ player: PlayerRecord; movement: PlayerMovement }> {
  return json(
    await fetch(apiUrl(`/api/admin/players/${playerId}/status`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active }),
    })
  );
}

export async function startAdminPlayer(playerId: string): Promise<{ player: PlayerRecord }> {
  return json(
    await fetch(apiUrl(`/api/admin/players/${playerId}/start`), {
      method: "POST",
      credentials: "include",
    })
  );
}

export async function clearActivePlayer(): Promise<{ activePlayer: null }> {
  return json(
    await fetch(apiUrl("/api/active-player/clear"), {
      method: "POST",
    })
  );
}

export async function activatePlayerByQr(qrCode: string): Promise<{ activePlayer: PlayerRecord }> {
  return json(
    await fetch(apiUrl("/api/player/activate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrCode }),
    })
  );
}

export async function patchAdminSettings(patch: Partial<PublicGameConfig>): Promise<PublicGameConfig> {
  return json(
    await fetch(apiUrl("/api/admin/settings"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    })
  );
}

export async function runMaintenanceTest(kind: string): Promise<{ ok: true; kind: string; checkedAt: number }> {
  return json(
    await fetch(apiUrl("/api/admin/maintenance/test"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind }),
    })
  );
}

export async function createBackup(): Promise<BackupResult> {
  return json(
    await fetch(apiUrl("/api/admin/maintenance/backup"), {
      method: "POST",
      credentials: "include",
    })
  );
}
