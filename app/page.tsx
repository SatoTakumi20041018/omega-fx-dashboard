"use client";

import { useEffect, useState, useCallback } from "react";
import type { Indicators, Signal } from "@/lib/indicators";
import {
  openTrade, closeTrade, checkAutoClose, getOpenTrades, getClosedTrades,
  loadAccount, resetAccount, type Trade, type Account,
} from "@/lib/trades";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Area, AreaChart,
} from "recharts";

interface MarketData {
  indicators: Indicators;
  signals: Signal[];
  chartData: { time: string; price: number }[];
  rsiData: { time: string; rsi: number | null }[];
  hourUTC: number;
  session: string;
}

const PERF_DATA = [
  { system: "v7.3 (M5)", pnl: "+¥19,550", trades: 90, wr: "50.0%", pf: 1.70, p5: "58%", status: "BEST (CI>1.0)" },
  { system: "v5.3 (M15)", pnl: "+¥21,659", trades: 25, wr: "56.0%", pf: 2.21, p5: "93%", status: "Best PF" },
  { system: "v7.2 (M5)", pnl: "+¥15,844", trades: 118, wr: "44.1%", pf: 1.39, p5: "52%", status: "Previous" },
];

function sessionBadge(s: string) {
  const c: Record<string, string> = {
    OVERLAP: "bg-green-500/20 text-green-400 border-green-500/30",
    LONDON: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ACTIVE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    OFF: "bg-gray-700/40 text-gray-500 border-gray-600/30",
  };
  return c[s] || c.OFF;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-mono font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [opens, setOpens] = useState<Trade[]>([]);
  const [closed, setClosed] = useState<Trade[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [tab, setTab] = useState<"monitor" | "trade" | "journal">("monitor");

  const refreshTrades = useCallback(() => {
    setAccount(loadAccount());
    setOpens(getOpenTrades());
    setClosed(getClosedTrades());
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
      setLastUpdate(new Date());

      // Auto-close open trades if TP/SL hit
      const openTrades = getOpenTrades();
      if (openTrades.length > 0 && json.indicators) {
        const autoClosed = checkAutoClose(openTrades, json.indicators.price);
        if (autoClosed.length > 0) {
          setFlash(`Auto-closed ${autoClosed.length} trade(s): ${autoClosed.map(t =>
            `${t.direction} ${t.exit_reason} ${t.pnl_jpy! > 0 ? "+" : ""}¥${t.pnl_jpy}`
          ).join(", ")}`);
          refreshTrades();
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [refreshTrades]);

  useEffect(() => {
    fetchData();
    refreshTrades();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData, refreshTrades]);

  useEffect(() => {
    if (flash) {
      const t = setTimeout(() => setFlash(null), 5000);
      return () => clearTimeout(t);
    }
  }, [flash]);

  const handleTrade = (sig: Signal) => {
    const lot = account ? Math.min(Math.round(0.10 * (account.lot_mult || 1) * 100) / 100, 0.25) : 0.10;
    openTrade(sig.direction, sig.system, sig.entry, sig.tp, sig.sl, sig.tp_pips, sig.sl_pips, lot);
    setFlash(`Opened ${sig.direction} @ ${sig.entry.toFixed(3)} | Lot: ${lot}`);
    refreshTrades();
  };

  const handleClose = (tradeId: string, reason: Trade["exit_reason"]) => {
    if (!data) return;
    const result = closeTrade(tradeId, data.indicators.price, reason);
    if (result) {
      setFlash(`Closed: ${result.pnl_jpy! > 0 ? "+" : ""}¥${result.pnl_jpy} (${result.exit_reason})`);
      refreshTrades();
    }
  };

  const handleReset = () => {
    if (confirm("Reset account? All trades will be cleared.")) {
      resetAccount();
      refreshTrades();
      setFlash("Account reset to ¥10,000");
    }
  };

  const now = new Date();
  const utc = now.toISOString().slice(11, 16);
  const jst = new Date(now.getTime() + 9 * 3600000).toISOString().slice(11, 16);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">OMEGA FX</div>
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-2xl font-bold mb-2 text-red-400">Error</div>
          <div className="text-gray-500">{error}</div>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { indicators: ind, signals, chartData, rsiData, session } = data;
  const pip = 0.01;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Flash Message */}
      {flash && (
        <div className="bg-blue-900/50 border border-blue-500/40 rounded-lg p-3 text-sm text-blue-300">{flash}</div>
      )}

      {/* Header + Account */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OMEGA FX</h1>
          <p className="text-sm text-gray-500">{utc} UTC / {jst} JST</p>
        </div>
        <div className="flex items-center gap-4">
          {account && (
            <div className="text-right">
              <div className="text-sm text-gray-500">Equity</div>
              <div className={`text-xl font-mono font-bold ${account.total_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                ¥{account.equity.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">
                P&L: {account.total_pnl >= 0 ? "+" : ""}¥{Math.round(account.total_pnl).toLocaleString()} |
                {account.total_trades}T {account.wins}W {account.losses}L
              </div>
            </div>
          )}
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${sessionBadge(session)}`}>{session}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
        {(["monitor", "trade", "journal"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-bold transition-colors ${
              tab === t ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300"
            }`}>
            {t === "monitor" ? "Monitor" : t === "trade" ? `Trade${opens.length > 0 ? ` (${opens.length})` : ""}` : `Journal (${closed.length})`}
          </button>
        ))}
      </div>

      {/* ==================== MONITOR TAB ==================== */}
      {tab === "monitor" && (
        <>
          {/* Price */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <div className="flex items-baseline gap-3">
              <span className="text-sm text-gray-500">USD/JPY</span>
              <span className="text-4xl font-mono font-bold">{ind.price.toFixed(3)}</span>
            </div>
          </div>

          {/* Indicators */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase">M5</h3>
              <Metric label="RSI(2)" value={ind.m5_rsi2.toFixed(1)}
                sub={ind.m5_rsi2 < 25 ? "OVERSOLD" : ind.m5_rsi2 > 75 ? "OVERBOUGHT" : "Neutral"} />
              <Metric label="Trend" value={ind.m5_trend ? "UP" : "DOWN"} />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase">M15</h3>
              <Metric label="RSI(14)" value={ind.m15_rsi14.toFixed(1)} sub={ind.m15_trend ? "Uptrend" : "Downtrend"} />
              <Metric label="ATR" value={`${ind.m15_atr_pips.toFixed(1)} pips`} />
              <Metric label="Regime" value={`${ind.atr_pctile.toFixed(0)}%ile`}
                sub={ind.atr_pctile < 20 ? "Too quiet" : ind.atr_pctile > 90 ? "Too volatile" : "OK"} />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase">H1</h3>
              <Metric label="RSI(14)" value={ind.h1_rsi14.toFixed(1)} />
              <Metric label="Trend" value={ind.h1_trend ? "UP" : "DOWN"} />
              <Metric label="MACD" value={`${ind.h1_macd > 0 ? "+" : ""}${ind.h1_macd.toFixed(4)}`} />
            </div>
          </div>

          {/* Signals with TRADE button */}
          {signals.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
                <span className="inline-block w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                SIGNALS
              </h2>
              {signals.map((sig, i) => (
                <div key={i} className={`rounded-xl p-5 border-2 ${
                  sig.direction === "BUY" ? "bg-green-950/30 border-green-500/40" : "bg-red-950/30 border-red-500/40"
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-bold ${sig.direction === "BUY" ? "text-green-400" : "text-red-400"}`}>
                        {sig.direction}
                      </span>
                      <span className="text-sm text-gray-400">[{sig.system}]</span>
                    </div>
                    <button onClick={() => handleTrade(sig)}
                      className={`px-6 py-2 rounded-lg font-bold text-sm transition-all hover:scale-105 ${
                        sig.direction === "BUY"
                          ? "bg-green-600 hover:bg-green-500 text-white"
                          : "bg-red-600 hover:bg-red-500 text-white"
                      }`}>
                      EXECUTE {sig.direction}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <Metric label="Entry" value={sig.entry.toFixed(3)} />
                    <Metric label="TP" value={sig.tp.toFixed(3)} sub={`+${sig.tp_pips.toFixed(1)}p`} />
                    <Metric label="SL" value={sig.sl.toFixed(3)} sub={`-${sig.sl_pips.toFixed(1)}p`} />
                    <Metric label="R:R" value={`${sig.rr.toFixed(1)}:1`} />
                  </div>
                  <div className="text-sm text-gray-500">{sig.reason}</div>
                  <div className="text-sm mt-1">
                    <span className="text-green-400">Win: +¥{sig.win_jpy.toFixed(0)}</span>
                    {" / "}
                    <span className="text-red-400">Loss: -¥{sig.loss_jpy.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h2 className="text-lg font-bold text-gray-500 mb-2 text-center">No Signals</h2>
              <p className="text-sm text-gray-600 text-center">Waiting for conditions...</p>
              {/* Manual trade buttons */}
              <div className="flex gap-3 justify-center mt-4">
                <button onClick={() => {
                  const tp = Math.max(4, 2.0 * ind.m15_atr_pips);
                  const sl = Math.max(2.5, 0.6 * ind.m15_atr_pips);
                  handleTrade({
                    system: "Manual", direction: "BUY", entry: ind.price,
                    tp: ind.price + tp * pip, sl: ind.price - sl * pip,
                    tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: 0,
                    reason: "Manual entry", win_jpy: tp * 0.1 * 100000 * pip, loss_jpy: sl * 0.1 * 100000 * pip,
                  });
                }} className="px-4 py-2 bg-green-800/50 border border-green-600/40 rounded-lg text-green-400 text-sm hover:bg-green-700/50">
                  Manual BUY
                </button>
                <button onClick={() => {
                  const tp = Math.max(4, 2.0 * ind.m15_atr_pips);
                  const sl = Math.max(2.5, 0.6 * ind.m15_atr_pips);
                  handleTrade({
                    system: "Manual", direction: "SELL", entry: ind.price,
                    tp: ind.price - tp * pip, sl: ind.price + sl * pip,
                    tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: 0,
                    reason: "Manual entry", win_jpy: tp * 0.1 * 100000 * pip, loss_jpy: sl * 0.1 * 100000 * pip,
                  });
                }} className="px-4 py-2 bg-red-800/50 border border-red-600/40 rounded-lg text-red-400 text-sm hover:bg-red-700/50">
                  Manual SELL
                </button>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h3 className="text-sm font-bold text-gray-400 mb-4">USD/JPY M5</h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" tick={false} stroke="#4b5563" />
                <YAxis domain={["auto", "auto"]} stroke="#4b5563" fontSize={12}
                  tickFormatter={(v: number) => v.toFixed(2)} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "8px" }}
                  labelFormatter={(l) => new Date(String(l)).toLocaleString("ja-JP")}
                  formatter={(v) => [Number(v).toFixed(3), "USD/JPY"]} />
                <Area type="monotone" dataKey="price" stroke="#3b82f6" fill="url(#pg)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h3 className="text-sm font-bold text-gray-400 mb-4">M15 RSI(14)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={rsiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" tick={false} stroke="#4b5563" />
                <YAxis domain={[0, 100]} stroke="#4b5563" fontSize={12} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "8px" }} />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="5 5" />
                <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="rsi" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ==================== TRADE TAB ==================== */}
      {tab === "trade" && (
        <>
          {/* Open Positions */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h3 className="text-sm font-bold text-gray-400 mb-4">Open Positions ({opens.length})</h3>
            {opens.length === 0 ? (
              <p className="text-gray-600 text-center py-4">No open positions</p>
            ) : (
              <div className="space-y-3">
                {opens.map(t => {
                  const dir = t.direction === "BUY" ? 1 : -1;
                  const unrealizedPips = dir * (ind.price - t.entry) / pip;
                  const unrealizedJpy = unrealizedPips * t.lot * 100000 * pip;
                  return (
                    <div key={t.id} className={`rounded-lg p-4 border ${
                      unrealizedJpy >= 0 ? "border-green-800/50 bg-green-950/20" : "border-red-800/50 bg-red-950/20"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className={`font-bold ${t.direction === "BUY" ? "text-green-400" : "text-red-400"}`}>
                            {t.direction}
                          </span>
                          <span className="text-gray-500 text-sm ml-2">[{t.system}] {t.lot} lot</span>
                        </div>
                        <div className={`font-mono font-bold ${unrealizedJpy >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {unrealizedJpy >= 0 ? "+" : ""}¥{Math.round(unrealizedJpy).toLocaleString()}
                          <span className="text-xs ml-1">({unrealizedPips >= 0 ? "+" : ""}{unrealizedPips.toFixed(1)}p)</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                        <div><span className="text-gray-500">Entry:</span> {t.entry.toFixed(3)}</div>
                        <div><span className="text-gray-500">TP:</span> {t.tp.toFixed(3)}</div>
                        <div><span className="text-gray-500">SL:</span> {t.sl.toFixed(3)}</div>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
                        <div className={`h-2 rounded-full ${unrealizedPips >= 0 ? "bg-green-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, Math.max(5, Math.abs(unrealizedPips / t.tp_pips) * 100))}%` }} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleClose(t.id, "MANUAL")}
                          className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm font-bold">
                          Close @ Market ({unrealizedJpy >= 0 ? "+" : ""}¥{Math.round(unrealizedJpy)})
                        </button>
                        <button onClick={() => handleClose(t.id, "TP")}
                          className="px-3 py-2 bg-green-800/50 hover:bg-green-700/50 rounded text-sm text-green-400">
                          TP
                        </button>
                        <button onClick={() => handleClose(t.id, "SL")}
                          className="px-3 py-2 bg-red-800/50 hover:bg-red-700/50 rounded text-sm text-red-400">
                          SL
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Trade */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h3 className="text-sm font-bold text-gray-400 mb-4">Quick Trade @ {ind.price.toFixed(3)}</h3>
            <div className="grid grid-cols-2 gap-3">
              {signals.length > 0 ? signals.map((sig, i) => (
                <button key={i} onClick={() => handleTrade(sig)}
                  className={`p-4 rounded-lg font-bold text-lg transition-all hover:scale-[1.02] ${
                    sig.direction === "BUY"
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-red-600 hover:bg-red-500 text-white"
                  }`}>
                  {sig.direction} [{sig.system}]
                  <div className="text-xs font-normal mt-1">
                    TP: +{sig.tp_pips.toFixed(1)}p | SL: -{sig.sl_pips.toFixed(1)}p | R:R {sig.rr.toFixed(1)}
                  </div>
                </button>
              )) : (
                <>
                  <button onClick={() => {
                    const tp = Math.max(4, 2.0 * ind.m15_atr_pips);
                    const sl = Math.max(2.5, 0.6 * ind.m15_atr_pips);
                    handleTrade({
                      system: "Manual", direction: "BUY", entry: ind.price,
                      tp: ind.price + tp * pip, sl: ind.price - sl * pip,
                      tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: 0,
                      reason: "Manual", win_jpy: tp * 0.1 * 100000 * pip, loss_jpy: sl * 0.1 * 100000 * pip,
                    });
                  }} className="p-4 rounded-lg font-bold bg-green-800/40 border border-green-600/30 text-green-400 hover:bg-green-700/40">
                    BUY Manual
                    <div className="text-xs font-normal mt-1">TP/SL auto-calculated from ATR</div>
                  </button>
                  <button onClick={() => {
                    const tp = Math.max(4, 2.0 * ind.m15_atr_pips);
                    const sl = Math.max(2.5, 0.6 * ind.m15_atr_pips);
                    handleTrade({
                      system: "Manual", direction: "SELL", entry: ind.price,
                      tp: ind.price - tp * pip, sl: ind.price + sl * pip,
                      tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: 0,
                      reason: "Manual", win_jpy: tp * 0.1 * 100000 * pip, loss_jpy: sl * 0.1 * 100000 * pip,
                    });
                  }} className="p-4 rounded-lg font-bold bg-red-800/40 border border-red-600/30 text-red-400 hover:bg-red-700/40">
                    SELL Manual
                    <div className="text-xs font-normal mt-1">TP/SL auto-calculated from ATR</div>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Account Stats */}
          {account && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-400">Account</h3>
                <button onClick={handleReset} className="text-xs text-red-500 hover:text-red-400">Reset</button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Metric label="Equity" value={`¥${account.equity.toLocaleString()}`} />
                <Metric label="Total P&L" value={`${account.total_pnl >= 0 ? "+" : ""}¥${Math.round(account.total_pnl).toLocaleString()}`} />
                <Metric label="Win Rate" value={account.total_trades > 0 ? `${(account.wins / account.total_trades * 100).toFixed(1)}%` : "—"} />
                <Metric label="Trades" value={`${account.total_trades}`} sub={`${account.wins}W / ${account.losses}L`} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== JOURNAL TAB ==================== */}
      {tab === "journal" && (
        <>
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-400">Trade History ({closed.length})</h3>
              {closed.length > 0 && (
                <div className="text-sm">
                  <span className="text-gray-500">Total: </span>
                  <span className={closed.reduce((s, t) => s + (t.pnl_jpy || 0), 0) >= 0 ? "text-green-400" : "text-red-400"}>
                    {closed.reduce((s, t) => s + (t.pnl_jpy || 0), 0) >= 0 ? "+" : ""}
                    ¥{Math.round(closed.reduce((s, t) => s + (t.pnl_jpy || 0), 0)).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            {closed.length === 0 ? (
              <p className="text-gray-600 text-center py-8">No completed trades yet. Execute a trade to start tracking.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2">Time</th>
                      <th className="text-left py-2">Dir</th>
                      <th className="text-right py-2">Entry</th>
                      <th className="text-right py-2">Exit</th>
                      <th className="text-right py-2">Pips</th>
                      <th className="text-right py-2">P&L</th>
                      <th className="text-right py-2">Exit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...closed].reverse().map(t => (
                      <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2 text-gray-500">{new Date(t.timestamp).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className={`py-2 font-bold ${t.direction === "BUY" ? "text-green-400" : "text-red-400"}`}>{t.direction}</td>
                        <td className="py-2 text-right font-mono">{t.entry.toFixed(3)}</td>
                        <td className="py-2 text-right font-mono">{t.exit_price?.toFixed(3)}</td>
                        <td className={`py-2 text-right ${(t.pnl_pips || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(t.pnl_pips || 0) >= 0 ? "+" : ""}{t.pnl_pips}
                        </td>
                        <td className={`py-2 text-right font-bold ${(t.pnl_jpy || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(t.pnl_jpy || 0) >= 0 ? "+" : ""}¥{t.pnl_jpy?.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-gray-500">{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Performance */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h3 className="text-sm font-bold text-gray-400 mb-4">OOS Backtest Performance</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2">System</th>
                  <th className="text-right py-2">P&L</th>
                  <th className="text-right py-2">Trades</th>
                  <th className="text-right py-2">WR</th>
                  <th className="text-right py-2">PF</th>
                  <th className="text-right py-2">P(+5% in 5)</th>
                </tr>
              </thead>
              <tbody>
                {PERF_DATA.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 font-mono">{r.system}</td>
                    <td className="py-2 text-right text-green-400 font-mono">{r.pnl}</td>
                    <td className="py-2 text-right">{r.trades}</td>
                    <td className="py-2 text-right">{r.wr}</td>
                    <td className="py-2 text-right">{r.pf}</td>
                    <td className="py-2 text-right">{r.p5}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 py-4">
        OMEGA FX v7.2 | {lastUpdate?.toLocaleString("ja-JP")} | 60s refresh
      </div>
    </div>
  );
}
