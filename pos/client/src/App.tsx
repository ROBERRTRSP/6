import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSummary, fetchTickets, sellTicket, voidTicket } from "./api";
import type { DailySummary, GameType, Ticket } from "./types";

const GAMES: Array<{ id: GameType; label: string; picks: number; hint: string }> = [
  { id: "quiniela", label: "Quiniela", picks: 1, hint: "1 número · 00–99" },
  { id: "pale", label: "Pale", picks: 2, hint: "2 números · 00–99" },
  { id: "tripleta", label: "Tripleta", picks: 3, hint: "3 números · 00–99" },
];

const QUICK_AMOUNTS = [25, 50, 100, 200, 500] as const;

function money(cents: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function clockLabel(ts: number) {
  return new Intl.DateTimeFormat("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(ts);
}

function gameLabel(game: GameType) {
  return GAMES.find((g) => g.id === game)?.label ?? game;
}

export function App() {
  const [game, setGame] = useState<GameType>("quiniela");
  const [digits, setDigits] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState("25");
  const [amountMode, setAmountMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [lastTicket, setLastTicket] = useState<Ticket | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [now, setNow] = useState(Date.now());
  const receiptRef = useRef<HTMLDivElement>(null);

  const picksNeeded = GAMES.find((g) => g.id === game)!.picks;
  const amountCents = Math.round((Number(amount) || 0) * 100);
  const canSell = picked.length === picksNeeded && amountCents >= 100 && !busy;

  async function refresh() {
    const [summaryRes, ticketsRes] = await Promise.all([fetchSummary(), fetchTickets()]);
    setSummary(summaryRes);
    setTickets(ticketsRes.tickets);
  }

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    setDigits("");
    setPicked([]);
    setAmountMode(false);
    setError(null);
  }, [game]);

  const liveNumber = useMemo(() => {
    if (!digits) return "--";
    return digits.padStart(2, "0");
  }, [digits]);

  function pushDigit(d: string) {
    setError(null);
    if (amountMode) {
      setAmount((prev) => {
        const next = prev === "0" ? d : `${prev}${d}`;
        return next.length > 6 ? prev : next;
      });
      return;
    }
    if (picked.length >= picksNeeded) return;
    const next = `${digits}${d}`.slice(0, 2);
    setDigits(next);
    if (next.length === 2) {
      setPicked((prev) => [...prev, next]);
      setDigits("");
    }
  }

  function backspace() {
    setError(null);
    if (amountMode) {
      setAmount((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
      return;
    }
    if (digits) {
      setDigits((prev) => prev.slice(0, -1));
      return;
    }
    setPicked((prev) => prev.slice(0, -1));
  }

  function clearEntry() {
    setDigits("");
    setPicked([]);
    setError(null);
    if (amountMode) setAmount("0");
  }

  async function onSell() {
    if (!canSell) return;
    setBusy(true);
    setError(null);
    try {
      const ticket = await sellTicket({
        game,
        numbers: picked,
        amountCents,
      });
      setLastTicket(ticket);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 700);
      setPicked([]);
      setDigits("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vender.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key >= "0" && event.key <= "9") {
        event.preventDefault();
        pushDigit(event.key);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        backspace();
        return;
      }
      if (event.key === "Escape" || event.key.toLowerCase() === "c") {
        event.preventDefault();
        clearEntry();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void onSell();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function onVoid(id: string) {
    if (!window.confirm("¿Anular este ticket?")) return;
    setBusy(true);
    try {
      await voidTicket(id);
      if (lastTicket?.id === id) setLastTicket((t) => (t ? { ...t, status: "void", voidedAt: Date.now() } : t));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular.");
    } finally {
      setBusy(false);
    }
  }

  function printReceipt() {
    window.print();
  }

  return (
    <div className={`shell ${flash ? "shell--flash" : ""}`}>
      <div className="atmosphere" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brandMark">BR</span>
          <div>
            <p className="brandName">Banca Rápida</p>
            <p className="brandTag">POS de lotería</p>
          </div>
        </div>
        <div className="topMeta">
          <span>{clockLabel(now)}</span>
          <strong>{money(summary?.netAmountCents ?? 0)}</strong>
        </div>
      </header>

      <main className="stage">
        <section className="sellPane" aria-label="Venta">
          <div className="gameTabs" role="tablist">
            {GAMES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={game === item.id}
                className={game === item.id ? "gameTab is-active" : "gameTab"}
                onClick={() => setGame(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>

          <div className="ticketBoard">
            <p className="boardLabel">{amountMode ? "Monto de la jugada" : "Números jugados"}</p>
            <div className="picks">
              {Array.from({ length: picksNeeded }).map((_, index) => (
                <div key={index} className={`pick ${picked[index] ? "is-filled" : index === picked.length ? "is-current" : ""}`}>
                  {picked[index] ?? (index === picked.length ? liveNumber : "--")}
                </div>
              ))}
            </div>
            <div className="amountRow">
              <button
                type="button"
                className={amountMode ? "amountToggle is-active" : "amountToggle"}
                onClick={() => setAmountMode((v) => !v)}
              >
                Monto
              </button>
              <strong className="amountValue">{money(amountCents)}</strong>
            </div>
            <div className="quickAmounts">
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={Number(amount) === value ? "chip is-active" : "chip"}
                  onClick={() => {
                    setAmount(String(value));
                    setAmountMode(false);
                  }}
                >
                  {money(value * 100)}
                </button>
              ))}
            </div>
          </div>

          <div className="keypad" aria-label="Teclado">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => (
              <button
                key={key}
                type="button"
                className={`key ${key === "C" ? "key--mute" : ""} ${key === "⌫" ? "key--mute" : ""}`}
                onClick={() => {
                  if (key === "C") clearEntry();
                  else if (key === "⌫") backspace();
                  else pushDigit(key);
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {error ? <p className="error">{error}</p> : null}

          <button type="button" className="sellBtn" disabled={!canSell} onClick={() => void onSell()}>
            {busy ? "Procesando…" : `Vender · ${money(amountCents)}`}
          </button>
        </section>

        <aside className="sidePane">
          <div className="summaryStrip">
            <div>
              <span>Vendidos hoy</span>
              <strong>{summary?.soldCount ?? 0}</strong>
            </div>
            <div>
              <span>Anulados</span>
              <strong>{summary?.voidCount ?? 0}</strong>
            </div>
            <div>
              <span>Neto</span>
              <strong>{money(summary?.netAmountCents ?? 0)}</strong>
            </div>
          </div>

          <div className={`receipt ${lastTicket ? "is-visible" : ""}`} ref={receiptRef}>
            {lastTicket ? (
              <>
                <div className="receiptHead">
                  <p>Banca Rápida</p>
                  <span>#{lastTicket.ticketNumber}</span>
                </div>
                <p className="receiptGame">{gameLabel(lastTicket.game)}</p>
                <p className="receiptNums">{lastTicket.numbers.join(" · ")}</p>
                <p className="receiptAmt">{money(lastTicket.amountCents)}</p>
                <p className="receiptMeta">
                  {new Date(lastTicket.createdAt).toLocaleString("es-DO")}
                  {lastTicket.status === "void" ? " · ANULADO" : ""}
                </p>
                <div className="receiptActions">
                  <button type="button" onClick={printReceipt}>
                    Imprimir
                  </button>
                  {lastTicket.status === "sold" ? (
                    <button type="button" className="danger" onClick={() => void onVoid(lastTicket.id)}>
                      Anular
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="receiptEmpty">El último ticket aparecerá aquí listo para imprimir.</p>
            )}
          </div>

          <div className="history">
            <div className="historyHead">
              <h2>Ventas del día</h2>
              <button type="button" className="ghost" onClick={() => void refresh()}>
                Actualizar
              </button>
            </div>
            <ul>
              {tickets.length === 0 ? <li className="empty">Sin ventas todavía.</li> : null}
              {tickets.map((ticket) => (
                <li key={ticket.id} className={ticket.status === "void" ? "is-void" : ""}>
                  <div>
                    <strong>
                      {gameLabel(ticket.game)} · {ticket.numbers.join("-")}
                    </strong>
                    <span>
                      #{ticket.ticketNumber} · {clockLabel(ticket.createdAt)}
                    </span>
                  </div>
                  <div className="histRight">
                    <em>{money(ticket.amountCents)}</em>
                    {ticket.status === "sold" ? (
                      <button type="button" onClick={() => void onVoid(ticket.id)}>
                        Anular
                      </button>
                    ) : (
                      <span className="voidTag">Anulado</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
