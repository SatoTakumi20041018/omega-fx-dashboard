"use client";

import { useEffect, useState, useCallback } from "react";
import type { Indicators, Signal } from "@/lib/indicators";
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
  { system: "v5.3 (M15)", pnl: "+¥21,659", trades: 25, wr: "56.0%", pf: 2.21, p5: "93%", status: "Best" },
  { system: "v7.1 (M5)", pnl: "+¥12,742", trades: 116, wr: "39.7%", pf: 1.29, p5: "49%", status: "M5 Best" },
  { system: "v6.3 (M5)", pnl: "+¥10,598", trades: 127, wr: "37.8%", pf: 1.09, p5: "46%", status: "Active" },
];

function sessionBadge(s: string) {
  const colors: Record<string, string> = {
    OVERLAP: "bg-green-500/20 text-green-400 border-green-500/30",
    LONDON: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ACTIVE: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    OFF: "bg-gray-700/40 text-gray-500 border-gray-600/30",
  };
  return colors[s] || colors.OFF;
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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const now = new Date();
  const utc = now.toISOString().slice(11, 16);
  const jst = new Date(now.getTime() + 9 * 3600000).toISOString().slice(11, 16);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">OMEGA FX</div>
          <div className="text-gray-500">Loading market data...</div>
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
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { indicators: ind, signals, chartData, rsiData, session } = data;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OMEGA FX Dashboard</h1>
          <p className="text-sm text-gray-500">v5.3 + v7.1 Real-Time Signal Scanner</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{utc} UTC / {jst} JST</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${sessionBadge(session)}`}>
            {session}
          </span>
        </div>
      </div>

      {/* Price */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-gray-500">USD/JPY</span>
          <span className="text-4xl font-mono font-bold">{ind.price.toFixed(3)}</span>
        </div>
      </div>

      {/* Indicators Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase">M5 (5-min)</h3>
          <Metric label="RSI(2)" value={ind.m5_rsi2.toFixed(1)}
            sub={ind.m5_rsi2 < 25 ? "OVERSOLD" : ind.m5_rsi2 > 75 ? "OVERBOUGHT" : "Neutral"} />
          <Metric label="RSI(14)" value={ind.m5_rsi14.toFixed(1)} />
          <Metric label="Trend" value={ind.m5_trend ? "UP" : "DOWN"} />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase">M15 (15-min)</h3>
          <Metric label="RSI(2)" value={ind.m15_rsi2.toFixed(1)} />
          <Metric label="RSI(14)" value={ind.m15_rsi14.toFixed(1)}
            sub={`Trend: ${ind.m15_trend ? "UP" : "DOWN"}`} />
          <Metric label="ATR" value={`${ind.m15_atr_pips.toFixed(1)} pips`} />
          <Metric label="Regime" value={`${ind.atr_pctile.toFixed(0)}th %ile`}
            sub={ind.atr_pctile < 20 ? "Too quiet" : ind.atr_pctile > 90 ? "Too volatile" : "OK"} />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase">H1 (1-hour)</h3>
          <Metric label="RSI(14)" value={ind.h1_rsi14.toFixed(1)} />
          <Metric label="Trend" value={ind.h1_trend ? "UP" : "DOWN"} />
          <Metric label="MACD" value={`${ind.h1_macd > 0 ? "+" : ""}${ind.h1_macd.toFixed(4)}`}
            sub={ind.h1_macd > 0 ? "Bullish" : "Bearish"} />
        </div>
      </div>

      {/* Signals */}
      {signals.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
            <span className="inline-block w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            ACTIVE SIGNALS
          </h2>
          {signals.map((sig, i) => (
            <div key={i} className={`rounded-xl p-5 border-2 ${
              sig.direction === "BUY"
                ? "bg-green-950/30 border-green-500/40"
                : "bg-red-950/30 border-red-500/40"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${
                    sig.direction === "BUY" ? "text-green-400" : "text-red-400"
                  }`}>
                    {sig.direction}
                  </span>
                  <span className="text-sm text-gray-400">[{sig.system}]</span>
                </div>
                <span className="text-sm text-gray-500">
                  Confidence: {(sig.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <Metric label="Entry" value={sig.entry.toFixed(3)} />
                <Metric label="TP" value={sig.tp.toFixed(3)} sub={`+${sig.tp_pips.toFixed(1)} pips`} />
                <Metric label="SL" value={sig.sl.toFixed(3)} sub={`-${sig.sl_pips.toFixed(1)} pips`} />
                <Metric label="R:R" value={`${sig.rr.toFixed(1)}:1`} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{sig.reason}</span>
                <span>
                  <span className="text-green-400">Win: +¥{sig.win_jpy.toFixed(0)}</span>
                  {" / "}
                  <span className="text-red-400">Loss: -¥{sig.loss_jpy.toFixed(0)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
          <h2 className="text-lg font-bold text-gray-500 mb-2">No Active Signals</h2>
          <p className="text-sm text-gray-600">Waiting for market conditions to align...</p>
        </div>
      )}

      {/* Chart */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="text-sm font-bold text-gray-400 mb-4">USD/JPY M5 (5-day)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={false} stroke="#4b5563" />
            <YAxis domain={["auto", "auto"]} stroke="#4b5563" fontSize={12}
              tickFormatter={(v: number) => v.toFixed(2)} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "8px" }}
              labelFormatter={(l) => new Date(String(l)).toLocaleString("ja-JP")}
              formatter={(v) => [Number(v).toFixed(3), "USD/JPY"]}
            />
            <Area type="monotone" dataKey="price" stroke="#3b82f6" fill="url(#priceGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* RSI Chart */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="text-sm font-bold text-gray-400 mb-4">M15 RSI(14)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={rsiData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={false} stroke="#4b5563" />
            <YAxis domain={[0, 100]} stroke="#4b5563" fontSize={12} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: "8px" }} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="5 5" />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="5 5" />
            <ReferenceLine y={50} stroke="#4b5563" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="rsi" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Performance Table */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="text-sm font-bold text-gray-400 mb-4">OOS Performance (Walk-Forward Validated)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2">System</th>
              <th className="text-right py-2">P&L</th>
              <th className="text-right py-2">Trades</th>
              <th className="text-right py-2">WR</th>
              <th className="text-right py-2">PF</th>
              <th className="text-right py-2">P(+5% in 5)</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {PERF_DATA.map((r, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2 font-mono">{r.system}</td>
                <td className="py-2 text-right text-green-400 font-mono">{r.pnl}</td>
                <td className="py-2 text-right">{r.trades}</td>
                <td className="py-2 text-right">{r.wr}</td>
                <td className="py-2 text-right">{r.pf}</td>
                <td className="py-2 text-right">{r.p5}</td>
                <td className="py-2 text-right">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 py-4">
        OMEGA FX System | Last update: {lastUpdate?.toLocaleString("ja-JP")} |
        Auto-refresh: 60s | Account: ¥10,000
      </div>
    </div>
  );
}
