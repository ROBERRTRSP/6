import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { DiceStage } from "./DiceStage";
import {
  adjustAdminPlayerBalance,
  adminLogin,
  activatePlayerByQr,
  clearActivePlayer,
  createAdminPlayer,
  createBackup,
  fetchAdminPlayers,
  fetchAdminPlays,
  fetchAdminSettings,
  fetchAdminStats,
  fetchAuditLogs,
  fetchHistory,
  fetchMachineUrl,
  fetchPlayerMovements,
  fetchSettings,
  fetchStats,
  patchAdminSettings,
  playRound,
  runMaintenanceTest,
  setAdminPlayerStatus,
  startAdminPlayer,
} from "./api";
import { playJackpot, playRoll, playWin, unlockAudio } from "./sound";
import type {
  AdminStats,
  AuditLogEntry,
  BetsCents,
  Face,
  PlayerMovement,
  PlayerRecord,
  PlayRecord,
  PlayResponse,
  PublicGameConfig,
  RtpMode,
} from "./types";

const FACES: Face[] = [1, 2, 3, 4, 5, 6];
const QUICK = [100, 500, 1000, 2000] as const;
const EMPTY_BETS: BetsCents = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
const SAVED_BETS_KEY = "lucky-six.current-bets";

function readSavedBets(): BetsCents {
  if (typeof window === "undefined") return { ...EMPTY_BETS };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_BETS_KEY) ?? "{}") as Partial<Record<Face, unknown>>;
    return FACES.reduce(
      (next, face) => ({
        ...next,
        [face]: Math.max(0, Math.trunc(Number(parsed[face]) || 0)),
      }),
      { ...EMPTY_BETS }
    );
  } catch {
    return { ...EMPTY_BETS };
  }
}

function money(cents: number) {
  const hasCents = Math.abs(cents) % 100 !== 0;
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(cents / 100);
}

function dollarsToCents(value: number) {
  return Math.max(0, Math.round((Number(value) || 0) * 100));
}

function centsToDollars(value: number) {
  return Number((value / 100).toFixed(2));
}

function totalBet(bets: BetsCents) {
  return FACES.reduce((sum, face) => sum + bets[face], 0);
}

function lastDice(result: PlayResponse | null): Face[] {
  return result?.dice[result.dice.length - 1] ?? [1, 2, 3, 4, 5, 6];
}

function resultTone(result: PlayResponse) {
  if (result.jackpotPaidCents > 0) return "jackpot";
  if (result.payoutCents > 0) return "win";
  return "lose";
}

function resultMessage(result: PlayResponse | null) {
  if (!result) return "Elegí uno o varios números y tocá JUGAR.";
  if (result.jackpotPaidCents > 0) return "JACKPOT WINNER";
  if (result.payoutCents > 0) return `Premio total ${money(result.payoutCents)}`;
  return "Los dados visibles no tuvieron aciertos de pago.";
}

function exportCsv(rows: PlayRecord[]) {
  const header = ["fecha", "id", "apuestas", "dados", "apostado", "pagado", "jackpot", "free_games"];
  const lines = rows.map((row) =>
    [
      new Date(row.createdAt).toISOString(),
      row.id,
      FACES.map((face) => `${face}:${row.bets[face]}`).join(" "),
      row.dice.map((d) => d.join("-")).join("|"),
      row.totalWagerCents,
      row.payoutCents,
      row.jackpotPaidCents,
      row.freeRerolls,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lucky-six-report-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type AdminTab = "dashboard" | "players" | "config" | "economy" | "jackpot" | "history" | "reports" | "security" | "maintenance";
type ReportPeriod = "day" | "week" | "month";
type EconomyPreset = "conservative" | "balanced" | "promotional";

const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "players", label: "Jugadores" },
  { id: "config", label: "Configuración" },
  { id: "economy", label: "Economía" },
  { id: "jackpot", label: "Jackpot" },
  { id: "history", label: "Historial" },
  { id: "reports", label: "Reportes" },
  { id: "security", label: "Seguridad" },
  { id: "maintenance", label: "Mantenimiento" },
];

const ECONOMY_PRESETS: Record<EconomyPreset, Pick<PublicGameConfig, "jackpotContributionPercent" | "houseMarginPercent" | "prizeFundPercent">> = {
  conservative: { jackpotContributionPercent: 3, houseMarginPercent: 17, prizeFundPercent: 80 },
  balanced: { jackpotContributionPercent: 3, houseMarginPercent: 12, prizeFundPercent: 85 },
  promotional: { jackpotContributionPercent: 5, houseMarginPercent: 7, prizeFundPercent: 88 },
};

function periodStart(period: ReportPeriod) {
  const date = new Date();
  if (period === "day") date.setHours(0, 0, 0, 0);
  if (period === "week") date.setDate(date.getDate() - 7);
  if (period === "month") date.setMonth(date.getMonth() - 1);
  return date.getTime();
}

function filterByPeriod(rows: PlayRecord[], period: ReportPeriod) {
  const start = periodStart(period);
  return rows.filter((row) => row.createdAt >= start);
}

function sumRows(rows: PlayRecord[], key: "totalWagerCents" | "payoutCents" | "jackpotPaidCents") {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

function betsLabel(bets: BetsCents) {
  return FACES.filter((face) => bets[face] > 0)
    .map((face) => `${face}:${money(bets[face])}`)
    .join(" ");
}

function dollarsFromPercent(percent: number) {
  return money(percent * 100);
}

function playerConnectUrl(playerId: string, machineUrl?: string) {
  if (machineUrl) {
    const url = new URL(machineUrl);
    url.searchParams.set("player", playerId);
    return url.toString();
  }
  if (typeof window === "undefined") return `lucky-six-player:${playerId}`;
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("player", playerId);
  return url.toString();
}

function AdminPanel({ onClose, onStartPlayer }: { onClose: () => void; onStartPlayer: (player: PlayerRecord) => void }) {
  const [logged, setLogged] = useState(false);
  const [pin, setPin] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [settings, setSettings] = useState<PublicGameConfig | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [selectedPlayerQr, setSelectedPlayerQr] = useState("");
  const [machineUrl, setMachineUrl] = useState("");
  const [playerMovements, setPlayerMovements] = useState<PlayerMovement[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [newPlayer, setNewPlayer] = useState({
    alias: "",
    phone: "",
    pin: "",
    balanceCents: 0,
    active: true,
    note: "",
  });
  const [balanceAction, setBalanceAction] = useState({ type: "topup" as "topup" | "debit", amountCents: 0, note: "" });
  const [economyDraft, setEconomyDraft] = useState({
    jackpotContributionPercent: 3,
    houseMarginPercent: 12,
    prizeFundPercent: 85,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [s, st, p, audit, playerList, machine] = await Promise.all([
      fetchAdminSettings(),
      fetchAdminStats(),
      fetchAdminPlays(300),
      fetchAuditLogs(150),
      fetchAdminPlayers(playerSearch),
      fetchMachineUrl(),
    ]);
    setSettings(s);
    setStats(st);
    setPlays(p.plays);
    setAuditLogs(audit.logs);
    setPlayers(playerList.players);
    setMachineUrl(machine.url);
    setSelectedPlayer((current) =>
      current ? playerList.players.find((player) => player.id === current.id) ?? current : playerList.players[0] ?? null
    );
  }, [playerSearch]);

  const reportRows = useMemo(() => filterByPeriod(plays, period), [period, plays]);
  const jackpotPayments = useMemo(() => plays.filter((play) => play.jackpotPaidCents > 0), [plays]);
  const economySum =
    economyDraft.jackpotContributionPercent + economyDraft.houseMarginPercent + economyDraft.prizeFundPercent;

  useEffect(() => {
    if (!settings) return;
    setEconomyDraft({
      jackpotContributionPercent: settings.jackpotContributionPercent,
      houseMarginPercent: settings.houseMarginPercent,
      prizeFundPercent: settings.prizeFundPercent,
    });
  }, [settings]);

  useEffect(() => {
    if (!selectedPlayer) {
      setSelectedPlayerQr("");
      return;
    }
    void QRCode.toDataURL(playerConnectUrl(selectedPlayer.id, machineUrl), {
      margin: 1,
      width: 220,
      color: { dark: "#160b04", light: "#fff7df" },
    }).then(setSelectedPlayerQr);
  }, [machineUrl, selectedPlayer]);

  async function submitLogin() {
    try {
      setError("");
      await adminLogin("admin", pin);
      setLogged(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No autorizado");
    }
  }

  async function save(patch: Partial<PublicGameConfig>) {
    try {
      setError("");
      const next = await patchAdminSettings(patch);
      setSettings(next);
      const [st, audit] = await Promise.all([fetchAdminStats(), fetchAuditLogs(150)]);
      setStats(st);
      setAuditLogs(audit.logs);
      setNotice("Configuración guardada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function saveEconomy() {
    if (economySum !== 100) {
      setError("La economía debe sumar exactamente 100%.");
      return;
    }
    await save(economyDraft);
  }

  async function maintenance(kind: "touch" | "sound" | "backup" | "restart") {
    try {
      setError("");
      if (kind === "sound") {
        await unlockAudio();
        playRoll();
        window.setTimeout(() => playWin(), 900);
      }
      if (kind === "backup") {
        const backup = await createBackup();
        setNotice(`Backup creado: ${backup.file}`);
      } else if (kind === "restart") {
        await runMaintenanceTest("restart-ui");
        window.location.reload();
      } else {
        await runMaintenanceTest(kind);
        setNotice(kind === "touch" ? "Test táctil registrado." : "Test de sonido ejecutado.");
      }
      const audit = await fetchAuditLogs(150);
      setAuditLogs(audit.logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de mantenimiento");
    }
  }

  async function searchPlayerList() {
    try {
      setError("");
      const result = await fetchAdminPlayers(playerSearch);
      setPlayers(result.players);
      setSelectedPlayer(result.players[0] ?? null);
      setPlayerMovements([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar jugadores");
    }
  }

  async function selectPlayer(player: PlayerRecord) {
    setSelectedPlayer(player);
    try {
      const history = await fetchPlayerMovements(player.id);
      setPlayerMovements(history.movements);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar historial del jugador");
    }
  }

  async function submitCreatePlayer() {
    try {
      setError("");
      setNotice("");
      const created = await createAdminPlayer(newPlayer);
      setNotice(`Jugador creado correctamente. ID: ${created.player.id}`);
      setNewPlayer({ alias: "", phone: "", pin: "", balanceCents: 0, active: true, note: "" });
      const list = await fetchAdminPlayers(playerSearch);
      setPlayers(list.players);
      await selectPlayer(created.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear jugador");
    }
  }

  async function submitBalanceAction() {
    if (!selectedPlayer) return;
    try {
      setError("");
      const result = await adjustAdminPlayerBalance(selectedPlayer.id, balanceAction);
      setSelectedPlayer(result.player);
      setPlayers((current) => current.map((player) => (player.id === result.player.id ? result.player : player)));
      setBalanceAction({ type: balanceAction.type, amountCents: 0, note: "" });
      const [history, list] = await Promise.all([fetchPlayerMovements(result.player.id), fetchAdminPlayers(playerSearch)]);
      setPlayerMovements(history.movements);
      setPlayers(list.players);
      setNotice(balanceAction.type === "topup" ? "Saldo agregado." : "Saldo descontado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ajustar saldo");
    }
  }

  async function toggleSelectedPlayerStatus() {
    if (!selectedPlayer) return;
    try {
      setError("");
      const result = await setAdminPlayerStatus(selectedPlayer.id, selectedPlayer.status !== "active");
      setSelectedPlayer(result.player);
      setPlayers((current) => current.map((player) => (player.id === result.player.id ? result.player : player)));
      const history = await fetchPlayerMovements(result.player.id);
      setPlayerMovements(history.movements);
      setNotice(result.player.status === "active" ? "Jugador activado." : "Jugador bloqueado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar estado");
    }
  }

  async function startSelectedPlayer() {
    if (!selectedPlayer) return;
    try {
      setError("");
      const result = await startAdminPlayer(selectedPlayer.id);
      onStartPlayer(result.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo empezar juego");
    }
  }

  const dashboardCards = [
    ["Total apostado", money(stats?.totalWageredToday ?? 0)],
    ["Total pagado", money(stats?.totalPaidToday ?? 0)],
    ["Ganancia neta", money(stats?.netToday ?? 0)],
    ["Partidas", String(stats?.playsToday ?? 0)],
    ["Jackpot actual", money(stats?.jackpotPoolCents ?? 0)],
    ["Jackpot hits", String(stats?.jackpotHitsToday ?? 0)],
  ];

  return (
    <div className="modalBackdrop">
      <section className="adminPanel proAdminPanel">
        <header className="adminHeader proAdminHeader">
          <div>
            <p className="eyebrow">Panel administrador</p>
            <h2>Lucky Six Dice Machine</h2>
            <p className="muted">Operación táctil, reportes, seguridad y mantenimiento local.</p>
          </div>
          <button className="ghostBtn" onClick={onClose}>Cerrar</button>
        </header>

        {!logged ? (
          <div className="loginBox proLogin">
            <label>PIN administrador</label>
            <input className="adminInput" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
            <button className="primaryBtn" onClick={submitLogin}>Entrar</button>
            <p className="muted">PIN demo: 2468. Usá ADMIN_PASSWORD para producción.</p>
            {error ? <p className="errorText">{error}</p> : null}
          </div>
        ) : (
          <div className="adminWorkspace">
            <nav className="adminTabs" aria-label="Secciones admin">
              {ADMIN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={activeTab === tab.id ? "adminTab adminTabActive" : "adminTab"}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="adminContent">
              {activeTab === "dashboard" ? (
          <>
            <div className="adminGrid">
                    {dashboardCards.map(([label, value]) => (
                      <div className="statCard adminStatCard" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="adminTwoCols">
                    <section className="adminSectionCard">
                      <h3>Estado máquina</h3>
                      <p>Modo demo: <strong>{settings?.demoMode ? "Activo" : "Inactivo"}</strong></p>
                      <p>Mantenimiento: <strong>{settings?.maintenanceMode ? "Activo" : "Inactivo"}</strong></p>
                      <p>RTP: <strong>{settings?.rtpMode ?? "normal"}</strong></p>
                    </section>
                    <section className="adminSectionCard">
                      <h3>Último jackpot</h3>
                      <p>{stats?.lastJackpotWinner ?? "Sin ganador registrado"}</p>
                      <p className="muted">Free games hoy: {stats?.freeGamesToday ?? 0}</p>
                    </section>
                  </div>
                </>
              ) : null}

              {activeTab === "players" ? (
                <section className="playersPanel">
                  <div className="playersToolbar">
                    <label className="playerSearchBox">
                      <span>Buscar jugador</span>
                      <input
                        className="adminInput"
                        value={playerSearch}
                        placeholder="Nombre, teléfono, PIN o ID"
                        onChange={(e) => setPlayerSearch(e.target.value)}
                      />
                    </label>
                    <button className="primaryBtn playerSearchBtn" onClick={() => void searchPlayerList()}>
                      Buscar jugador
                    </button>
                  </div>

                  <div className="adminTwoCols playersGrid">
                    <section className="adminSectionCard createPlayerCard">
                      <h3>+ CREAR JUGADOR</h3>
                      <div className="playerFormGrid">
                        <label>Nombre / Alias
                          <input className="adminInput" value={newPlayer.alias} onChange={(e) => setNewPlayer((p) => ({ ...p, alias: e.target.value }))} />
                        </label>
                        <label>Teléfono opcional
                          <input className="adminInput" value={newPlayer.phone} onChange={(e) => setNewPlayer((p) => ({ ...p, phone: e.target.value }))} />
                        </label>
                        <label>PIN de acceso
                          <input className="adminInput" value={newPlayer.pin} inputMode="numeric" onChange={(e) => setNewPlayer((p) => ({ ...p, pin: e.target.value }))} />
                        </label>
                        <label>Balance inicial (US$ · máx. 100,000)
                          <input
                            className="adminInput"
                            type="number"
                            min={0}
                            max={100000}
                            step="0.01"
                            value={centsToDollars(newPlayer.balanceCents)}
                            onChange={(e) => setNewPlayer((p) => ({ ...p, balanceCents: dollarsToCents(Number(e.target.value)) }))}
                          />
                        </label>
                        <label>Nota interna
                          <input className="adminInput" value={newPlayer.note} onChange={(e) => setNewPlayer((p) => ({ ...p, note: e.target.value }))} />
                        </label>
                        <label className="toggleRow playerActiveToggle">
                          <span>Activo</span>
                          <input type="checkbox" checked={newPlayer.active} onChange={(e) => setNewPlayer((p) => ({ ...p, active: e.target.checked }))} />
                        </label>
                      </div>
                      <button className="primaryBtn createPlayerBtn" onClick={() => void submitCreatePlayer()}>
                        + Crear jugador
                      </button>
                    </section>

                    <section className="adminSectionCard">
                      <h3>Jugadores</h3>
                      <div className="playerList">
                        {players.length === 0 ? <p className="muted">Sin jugadores encontrados.</p> : null}
                        {players.map((player) => (
                          <button
                            key={player.id}
                            className={selectedPlayer?.id === player.id ? "playerRow playerRowActive" : "playerRow"}
                            onClick={() => void selectPlayer(player)}
                          >
                            <span>
                              <strong>{player.alias}</strong>
                              <small>{player.phone || "Sin teléfono"} · PIN {player.pin}</small>
                            </span>
                            <span className={player.status === "active" ? "playerStatusActive" : "playerStatusBlocked"}>
                              {player.status === "active" ? "Activo" : "Bloqueado"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
            </div>

                  {selectedPlayer ? (
                    <div className="adminTwoCols playersGrid">
                      <section className="adminSectionCard selectedPlayerCard">
                        <h3>Jugador seleccionado</h3>
                        <p>ID: <strong className="mono">{selectedPlayer.id}</strong></p>
                        <p>Balance: <strong>{money(selectedPlayer.balanceCents)}</strong></p>
                        <p>Estado: <strong>{selectedPlayer.status === "active" ? "Activo" : "Bloqueado"}</strong></p>
                        <div className="qrConnectBox">
                          {selectedPlayerQr ? <img src={selectedPlayerQr} alt={`QR de ${selectedPlayer.alias}`} /> : null}
                          <div>
                            <strong>Escanear QR para conectar</strong>
                            <p className="muted">El celular debe estar en la misma red Wi-Fi que la máquina.</p>
                            <p className="mono qrLinkText">{playerConnectUrl(selectedPlayer.id, machineUrl)}</p>
                          </div>
                        </div>
                        <p className="muted">Creado por {selectedPlayer.createdBy} el {new Date(selectedPlayer.createdAt).toLocaleString("es")}</p>
                        <div className="playerActionBtns">
                          <button className="ghostBtn" onClick={() => setBalanceAction((a) => ({ ...a, type: "topup" }))}>
                            Agregar más saldo
                          </button>
                          <button className="ghostBtn" onClick={() => setBalanceAction((a) => ({ ...a, type: "debit" }))}>
                            Descontar saldo
                          </button>
                          <button className="ghostBtn" onClick={() => void toggleSelectedPlayerStatus()}>
                            {selectedPlayer.status === "active" ? "Bloquear jugador" : "Activar jugador"}
                          </button>
                          <button
                            className="primaryBtn"
                            disabled={selectedPlayer.status !== "active"}
                            onClick={() => void startSelectedPlayer()}
                          >
                            Conectar ahora
                          </button>
                        </div>
                      </section>

                      <section className="adminSectionCard">
                        <h3>{balanceAction.type === "topup" ? "Agregar saldo" : "Descontar saldo"}</h3>
                        <div className="playerFormGrid">
                          <label>Monto (US$ · máx. 10,000)
                            <input
                              className="adminInput"
                              type="number"
                              min={0}
                              max={10000}
                              step="0.01"
                              value={centsToDollars(balanceAction.amountCents)}
                              onChange={(e) => setBalanceAction((a) => ({ ...a, amountCents: dollarsToCents(Number(e.target.value)) }))}
                            />
                          </label>
                          <label>Nota
                            <input className="adminInput" value={balanceAction.note} onChange={(e) => setBalanceAction((a) => ({ ...a, note: e.target.value }))} />
                          </label>
                        </div>
                        <button className="primaryBtn" onClick={() => void submitBalanceAction()}>
                          {balanceAction.type === "topup" ? "Agregar saldo" : "Descontar saldo"}
                        </button>
                      </section>
                    </div>
                  ) : null}

                  <div className="tableWrap tallTable">
                    <table>
                      <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Antes</th><th>Después</th><th>Admin</th><th>Nota</th></tr></thead>
                      <tbody>
                        {playerMovements.length === 0 ? <tr><td colSpan={7}>Selecciona un jugador para ver historial.</td></tr> : null}
                        {playerMovements.map((movement) => (
                          <tr key={movement.id}>
                            <td>{new Date(movement.createdAt).toLocaleString("es")}</td>
                            <td>{movement.type}</td>
                            <td>{money(movement.amountCents)}</td>
                            <td>{money(movement.balanceBeforeCents)}</td>
                            <td>{money(movement.balanceAfterCents)}</td>
                            <td>{movement.adminUser}</td>
                            <td>{movement.note ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {activeTab === "config" && settings ? (
                <div className="settingsGrid proSettingsGrid">
                  <label>Min apuesta<input type="number" value={settings.minStakeCents} onChange={(e) => save({ minStakeCents: Number(e.target.value) })} /></label>
                  <label>Max apuesta<input type="number" value={settings.maxStakeCents} onChange={(e) => save({ maxStakeCents: Number(e.target.value) })} /></label>
                  <label>Max por número<input type="number" value={settings.maxBetPerFaceCents} onChange={(e) => save({ maxBetPerFaceCents: Number(e.target.value) })} /></label>
                <label>Volumen<input type="range" min="0" max="100" value={settings.soundVolume} onChange={(e) => save({ soundVolume: Number(e.target.value) })} /></label>
                <label>Brillo<input type="range" min="25" max="100" value={settings.brightness} onChange={(e) => save({ brightness: Number(e.target.value) })} /></label>
                <label>Tiempo entre jugadas<input type="number" value={settings.cooldownMs} onChange={(e) => save({ cooldownMs: Number(e.target.value) })} /></label>
                <label>RTP
                  <select value={settings.rtpMode} onChange={(e) => save({ rtpMode: e.target.value as RtpMode })}>
                    <option value="normal">Normal</option>
                    <option value="conservative">Conservador</option>
                    <option value="promotional">Promocional</option>
                  </select>
                </label>
                  <button className={settings.demoMode ? "toggleOn" : "ghostBtn"} onClick={() => save({ demoMode: !settings.demoMode })}>Demo mode</button>
                <button className={settings.maintenanceMode ? "toggleOn" : "ghostBtn"} onClick={() => save({ maintenanceMode: !settings.maintenanceMode })}>Mantenimiento</button>
              </div>
            ) : null}

              {activeTab === "economy" ? (
                <section className="economyPanel">
                  <div className="adminTwoCols">
                    <div className="adminSectionCard">
                      <h3>Distribución economía</h3>
                      <p className={economySum === 100 ? "economyOk" : "economyBad"}>
                        Total configurado: <strong>{economySum}%</strong>
                      </p>
                      <p className="muted">Aplica solo a nuevas jugadas. Cada cambio queda registrado en logs.</p>
                    </div>
                    <div className="adminSectionCard">
                      <h3>Simulación por apuesta de $100</h3>
                      <div className="simulationGrid">
                        <span>Jackpot</span><strong>{dollarsFromPercent(economyDraft.jackpotContributionPercent)}</strong>
                        <span>Casa</span><strong>{dollarsFromPercent(economyDraft.houseMarginPercent)}</strong>
                        <span>Fondo premios</span><strong>{dollarsFromPercent(economyDraft.prizeFundPercent)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="presetRow">
                    <button className="ghostBtn" onClick={() => setEconomyDraft(ECONOMY_PRESETS.conservative)}>
                      Conservador
                    </button>
                    <button className="ghostBtn" onClick={() => setEconomyDraft(ECONOMY_PRESETS.balanced)}>
                      Balanceado
                    </button>
                    <button className="ghostBtn" onClick={() => setEconomyDraft(ECONOMY_PRESETS.promotional)}>
                      Promocional
                    </button>
                  </div>

                  <div className="economySliders">
                    <label>
                      <span>Porcentaje jackpot <strong>{economyDraft.jackpotContributionPercent}%</strong></span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={economyDraft.jackpotContributionPercent}
                        onChange={(e) =>
                          setEconomyDraft((draft) => ({
                            ...draft,
                            jackpotContributionPercent: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Margen casa <strong>{economyDraft.houseMarginPercent}%</strong></span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={economyDraft.houseMarginPercent}
                        onChange={(e) =>
                          setEconomyDraft((draft) => ({
                            ...draft,
                            houseMarginPercent: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Fondo premios <strong>{economyDraft.prizeFundPercent}%</strong></span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={economyDraft.prizeFundPercent}
                        onChange={(e) =>
                          setEconomyDraft((draft) => ({
                            ...draft,
                            prizeFundPercent: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>

                  <button className="primaryBtn economySaveBtn" disabled={economySum !== 100} onClick={() => void saveEconomy()}>
                    Guardar economía
                  </button>
                </section>
              ) : null}

              {activeTab === "jackpot" && settings ? (
                <>
                  <div className="settingsGrid proSettingsGrid">
                    <label>Monto base<input type="number" value={settings.jackpotSeedCents} onChange={(e) => save({ jackpotSeedCents: Number(e.target.value) })} /></label>
                    <label>Jackpot actual<input type="number" value={settings.jackpotPoolCents} onChange={(e) => save({ jackpotPoolCents: Number(e.target.value) })} /></label>
                    <div className="adminSectionCard compactAdminCard">
                      <span className="muted">% acumulación</span>
                      <strong>{settings.jackpotContributionPercent}%</strong>
                      <small>Se cambia en Economía.</small>
                    </div>
            </div>
            <div className="tableWrap">
              <table>
                      <thead><tr><th>Hora</th><th>Pago jackpot</th><th>Apuestas</th><th>Dados finales</th></tr></thead>
                      <tbody>
                        {jackpotPayments.length === 0 ? <tr><td colSpan={4}>Sin pagos jackpot.</td></tr> : null}
                        {jackpotPayments.map((p) => (
                          <tr key={p.id}><td>{new Date(p.createdAt).toLocaleString("es")}</td><td>{money(p.jackpotPaidCents)}</td><td>{betsLabel(p.bets)}</td><td>{p.dice.at(-1)?.join(" ")}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {activeTab === "history" ? (
                <div className="tableWrap tallTable">
                  <table>
                    <thead><tr><th>Hora</th><th>Apuestas</th><th>6 dados finales</th><th>Pago</th></tr></thead>
                <tbody>
                  {plays.map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.createdAt).toLocaleString("es")}</td>
                          <td>{betsLabel(p.bets)}</td>
                          <td className="mono">{p.dice.at(-1)?.join(" ")}</td>
                      <td>{money(p.payoutCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              ) : null}

              {activeTab === "reports" ? (
                <>
                  <div className="reportHeader">
                    <div className="periodBtns">
                      {(["day", "week", "month"] as ReportPeriod[]).map((p) => (
                        <button key={p} className={period === p ? "adminTab adminTabActive" : "adminTab"} onClick={() => setPeriod(p)}>
                          {p === "day" ? "Día" : p === "week" ? "Semana" : "Mes"}
                        </button>
                      ))}
                    </div>
                    <button className="ghostBtn" onClick={() => exportCsv(reportRows)}>Export CSV</button>
                  </div>
                  <div className="adminGrid">
                    <div className="statCard"><span>Apostado</span><strong>{money(sumRows(reportRows, "totalWagerCents"))}</strong></div>
                    <div className="statCard"><span>Pagado</span><strong>{money(sumRows(reportRows, "payoutCents"))}</strong></div>
                    <div className="statCard"><span>Ganancia</span><strong>{money(sumRows(reportRows, "totalWagerCents") - sumRows(reportRows, "payoutCents"))}</strong></div>
                    <div className="statCard"><span>Partidas</span><strong>{reportRows.length}</strong></div>
                  </div>
                </>
              ) : null}

              {activeTab === "security" ? (
                <>
                  <div className="adminTwoCols">
                    <section className="adminSectionCard">
                      <h3>Acceso</h3>
                      <p>Usuario actual: <strong>admin</strong></p>
                      <p>Nivel: <strong>Owner</strong></p>
                      <p className="muted">Niveles preparados: Owner, Manager, Técnico. El PIN protege cambios y reportes.</p>
                    </section>
                    <section className="adminSectionCard">
                      <h3>Logs de cambios</h3>
                      <p>{auditLogs.length} eventos recientes.</p>
                    </section>
                  </div>
                  <div className="tableWrap tallTable">
                    <table>
                      <thead><tr><th>Hora</th><th>Admin</th><th>Acción</th><th>Detalle</th></tr></thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("es")}</td><td>{log.adminUser}</td><td>{log.action}</td><td className="mono">{log.afterJson ?? ""}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {activeTab === "maintenance" ? (
                <div className="maintenanceGrid">
                  <button className="maintenanceBtn" onClick={() => maintenance("touch")}>Test táctil</button>
                  <button className="maintenanceBtn" onClick={() => maintenance("sound")}>Test sonido</button>
                  <button className="maintenanceBtn" onClick={() => maintenance("backup")}>Backup SQLite</button>
                  <button className="maintenanceBtn dangerMaintenance" onClick={() => maintenance("restart")}>Reinicio UI</button>
                </div>
              ) : null}

              {notice ? <p className="adminMsg">{notice}</p> : null}
            {error ? <p className="errorText">{error}</p> : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function App() {
  const [settings, setSettings] = useState<PublicGameConfig | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [history, setHistory] = useState<PlayRecord[]>([]);
  const [activePlayer, setActivePlayer] = useState<PlayerRecord | null>(null);
  const [bets, setBets] = useState<BetsCents>(() => readSavedBets());
  const [focus, setFocus] = useState<Face>(1);
  const [rolling, setRolling] = useState(false);
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState<PlayResponse | null>(null);
  const [banner, setBanner] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [lastTouch, setLastTouch] = useState(Date.now());
  const adminTimer = useRef<number | null>(null);

  const wager = totalBet(bets);
  const displayBalance = activePlayer?.balanceCents ?? settings?.balanceCents ?? 0;
  const attract = Date.now() - lastTouch > 20_000 && wager === 0 && !rolling;
  const tone = !rolling && result ? resultTone(result) : "idle";
  const dice = lastDice(result);
  const finalCounts = useMemo(
    () =>
      FACES.map((face) => ({
        face,
        count: dice.filter((value) => value === face).length,
      })).filter((item) => item.count > 0),
    [dice]
  );
  const winningFaces = useMemo(
    () =>
      result?.lineResults
        .filter((line) => line.payoutCents > 0)
        .map((line) => line.face) ?? [],
    [result]
  );

  const refresh = useCallback(async () => {
    const [cfg, st, hist] = await Promise.all([fetchSettings(), fetchStats(), fetchHistory(12)]);
    setSettings(cfg);
    setActivePlayer(cfg.activePlayer);
    setStats(st);
    setHistory(hist.plays);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setBanner(e instanceof Error ? e.message : "Sin conexión"));
    const id = window.setInterval(() => void refresh().catch(() => {}), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const playerParam = new URLSearchParams(window.location.search).get("player");
    if (!playerParam) return;
    void activatePlayerByQr(playerParam)
      .then(({ activePlayer: player }) => {
        setActivePlayer(player);
        setSettings((current) => (current ? { ...current, activePlayer: player, balanceCents: player.balanceCents } : current));
        setBanner(`Jugador conectado: ${player.alias}`);
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch((e) => setBanner(e instanceof Error ? e.message : "No se pudo conectar el QR"));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_BETS_KEY, JSON.stringify(bets));
  }, [bets]);

  const touch = useCallback(() => setLastTouch(Date.now()), []);

  function add(amount: number) {
    touch();
    setBets((current) => ({ ...current, [focus]: current[focus] + amount }));
  }

  function maxBet() {
    if (!settings) return;
    touch();
    setBets((current) => ({ ...current, [focus]: settings.maxBetPerFaceCents }));
  }

  async function play() {
    if (!settings || rolling) return;
    touch();
    setBanner("");
    setResult(null);
    if (wager <= 0) {
      setBanner("Seleccioná al menos una apuesta.");
      return;
    }
    try {
      await unlockAudio();
      const response = await playRound(bets);
      setResult(response);
      setRolling(true);
      if (!muted) playRoll();
      await new Promise((r) => window.setTimeout(r, 2800));
      setSettings((s) =>
        s ? { ...s, balanceCents: response.balanceAfterCents, jackpotPoolCents: response.jackpotPoolCents } : s
      );
      setActivePlayer((player) => (player ? { ...player, balanceCents: response.balanceAfterCents } : player));
      if (!muted) {
        const rt = resultTone(response);
        if (rt === "jackpot") playJackpot();
        else if (rt === "win") playWin();
      }
      setHistory((h) => [response, ...h].slice(0, 12));
      void refresh().catch(() => {});
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Error al jugar");
    } finally {
      setRolling(false);
    }
  }

  return (
    <div className={`app ${tone}Tone`} style={{ filter: `brightness(${settings?.brightness ?? 100}%)` }} onPointerDown={touch}>
      <button
        className="adminHotCorner"
        aria-label="Acceso administrador"
        onPointerDown={() => {
          adminTimer.current = window.setTimeout(() => setShowAdmin(true), 5000);
        }}
        onPointerUp={() => {
          if (adminTimer.current) window.clearTimeout(adminTimer.current);
        }}
      />
      <button className="adminVisibleBtn" type="button" onClick={() => setShowAdmin(true)}>
        Admin
      </button>
      {activePlayer ? (
        <button
          className="playerLogoutBtn"
          type="button"
          onClick={() => {
            setActivePlayer(null);
            void clearActivePlayer().catch(() => {});
          }}
        >
          Salir jugador
        </button>
      ) : null}

      <header className="topHud">
        <div className="hudCard">
          <span>{activePlayer ? `Jugador: ${activePlayer.alias}` : "Balance"}</span>
          <strong>{money(displayBalance)}</strong>
        </div>
        <div className={`hudCard resultHud ${tone}`}>
          <span>Resultado</span>
          <strong>{attract ? "Toca para jugar" : rolling ? "Rodando dados oficiales" : resultMessage(result)}</strong>
          {banner ? <small>{banner}</small> : null}
        </div>
        <div className="jackpotCard"><span>JACKPOT</span><strong>{money(settings?.jackpotPoolCents ?? 0)}</strong></div>
        <button className="soundBtn" onClick={() => setMuted((m) => !m)}>{muted ? "SONIDO OFF" : "SONIDO ON"}</button>
      </header>

      <main className="gameLayout">
        <section className="stagePanel">
          <DiceStage
            dice={dice}
            rolling={rolling}
            jackpot={tone === "jackpot"}
            attract={attract}
            winningFaces={winningFaces}
            settled={Boolean(result && !rolling)}
          />
        </section>

        <section className="betPanel">
          {result && !rolling ? (
            <div className={`resultDock ${tone}`}>
              <>
                <div className="resultDockCounts">
                  {finalCounts.map(({ face, count }) => (
                    <span key={face} className={winningFaces.includes(face) ? "resultCounterWin" : ""}>
                      {face} = {count}x
                    </span>
                  ))}
                </div>
                <div className="diceReadout resultDockDice">
                  {dice.map((d, i) => (
                    <span key={`${d}-${i}`} className={winningFaces.includes(d) ? "diceReadoutWin" : ""}>
                      {d}
                    </span>
                  ))}
                </div>
              </>
            </div>
          ) : null}

          <div className="faceGrid">
            {FACES.map((face) => (
              <button
                key={face}
                className={`faceBtn ${focus === face ? "focused" : ""} ${bets[face] > 0 ? "active" : ""}`}
                onClick={() => {
                  touch();
                  setFocus(face);
                }}
              >
                <span className="faceNumber">{face}</span>
                <small>{money(bets[face])}</small>
              </button>
            ))}
          </div>

          <div className="quickRow">
            {QUICK.map((amount) => <button key={amount} onClick={() => add(amount)}>+{money(amount)}</button>)}
            <button onClick={maxBet}>MAX</button>
            <button onClick={() => setBets({ ...EMPTY_BETS })}>BORRAR</button>
          </div>

          <div className="summaryStrip">
            <span>Total: <strong>{money(wager)}</strong></span>
            <span>Aporte jackpot: <strong>{money(Math.floor((wager * (settings?.jackpotContributionPercent ?? 3)) / 100))}</strong></span>
          </div>

          <button className="playBtn" disabled={rolling || !settings || settings.maintenanceMode} onClick={play}>
            {rolling ? "RODANDO..." : "JUGAR"}
          </button>
        </section>
      </main>

      <footer className="bottomInfo">
        <span>{settings?.demoMode ? "MODO DEMO ACTIVO" : "Offline local · SQLite · RNG servidor"}</span>
        <span>Jugadas hoy: {stats?.playsToday ?? 0} · Pagado hoy: {money(stats?.totalPaidToday ?? 0)}</span>
      </footer>

      <aside className="historyRail">
        <h3>Últimas</h3>
        {history.slice(0, 6).map((h) => (
          <div key={h.id} className="historyItem">
            <span>{h.dice.at(-1)?.join(" ")}</span>
            <strong>{money(h.payoutCents)}</strong>
          </div>
        ))}
      </aside>

      {showAdmin ? (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onStartPlayer={(player) => {
            setActivePlayer(player);
            setSettings((current) => (current ? { ...current, activePlayer: player, balanceCents: player.balanceCents } : current));
            setShowAdmin(false);
            setBanner("");
          }}
        />
      ) : null}
      {tone === "jackpot" ? <div className="coinRain" aria-hidden>{Array.from({ length: 36 }, (_, i) => <i key={i} />)}</div> : null}
    </div>
  );
}
