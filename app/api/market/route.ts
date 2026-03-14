import { NextResponse } from "next/server";
import { computeRSI, computeEMA, computeATR, computeMACD, checkSignals } from "@/lib/indicators";
import type { Indicators } from "@/lib/indicators";

interface YFQuote {
  timestamp: number[];
  indicators: {
    quote: Array<{
      open: (number | null)[];
      high: (number | null)[];
      low: (number | null)[];
      close: (number | null)[];
      volume: (number | null)[];
    }>;
  };
}

async function fetchYahoo(symbol: string, interval: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Yahoo API ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error("No chart data");

  const ts = result.timestamp as number[];
  const q = result.indicators.quote[0];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const timestamps: number[] = [];

  for (let i = 0; i < ts.length; i++) {
    if (q.close[i] != null && q.high[i] != null && q.low[i] != null && q.open[i] != null) {
      opens.push(q.open[i]!);
      highs.push(q.high[i]!);
      lows.push(q.low[i]!);
      closes.push(q.close[i]!);
      timestamps.push(ts[i]);
    }
  }
  return { opens, highs, lows, closes, timestamps };
}

export async function GET() {
  try {
    const [m5, m15, h1] = await Promise.all([
      fetchYahoo("USDJPY=X", "5m", "5d"),
      fetchYahoo("USDJPY=X", "15m", "60d"),
      fetchYahoo("USDJPY=X", "1h", "60d"),
    ]);

    if (m5.closes.length < 30 || m15.closes.length < 100 || h1.closes.length < 50) {
      return NextResponse.json({ error: "Insufficient data" }, { status: 503 });
    }

    const pip = 0.01;

    // M5 indicators
    const m5_rsi2 = computeRSI(m5.closes, 2);
    const m5_rsi14 = computeRSI(m5.closes, 14);
    const m5_ema20 = computeEMA(m5.closes, 20);
    const m5_atr14 = computeATR(m5.highs, m5.lows, m5.closes, 14);

    // M15 indicators
    const m15_rsi2 = computeRSI(m15.closes, 2);
    const m15_rsi14 = computeRSI(m15.closes, 14);
    const m15_ema20 = computeEMA(m15.closes, 20);
    const m15_atr14 = computeATR(m15.highs, m15.lows, m15.closes, 14);
    const m15_macd = computeMACD(m15.closes);

    // ATR percentile (last 100 values)
    const atrSlice = m15_atr14.filter(v => !isNaN(v)).slice(-100);
    const lastATR = atrSlice[atrSlice.length - 1];
    const atrPctile = atrSlice.filter(v => v <= lastATR).length / atrSlice.length * 100;

    // H1 indicators
    const h1_rsi14 = computeRSI(h1.closes, 14);
    const h1_ema20 = computeEMA(h1.closes, 20);
    const h1_macd = computeMACD(h1.closes);

    const last = (arr: number[]) => arr[arr.length - 1];
    const lastN = (arr: number[], n: number) => arr.slice(-n);

    const m5r2 = computeRSI(m5.closes, 2);
    const m5r2_last3 = lastN(m5r2, 3).filter(v => !isNaN(v));

    const indicators: Indicators = {
      price: last(m5.closes),
      m5_rsi2: last(m5_rsi2),
      m5_rsi14: last(m5_rsi14),
      m5_trend: last(m5.closes) > last(m5_ema20),
      m15_rsi2: last(m15_rsi2),
      m15_rsi14: last(m15_rsi14),
      m15_atr_pips: last(m15_atr14) / pip,
      m15_trend: last(m15.closes) > last(m15_ema20),
      m15_macd: last(m15_macd.histogram),
      atr_pctile: atrPctile,
      h1_rsi14: last(h1_rsi14),
      h1_trend: last(h1.closes) > last(h1_ema20),
      h1_macd: last(h1_macd.histogram),
      m5_rsi2_min3: m5r2_last3.length > 0 ? Math.min(...m5r2_last3) : 50,
      m5_rsi2_max3: m5r2_last3.length > 0 ? Math.max(...m5r2_last3) : 50,
      timestamp: new Date().toISOString(),
    };

    const hourUTC = new Date().getUTCHours();
    const signals = checkSignals(indicators, hourUTC);

    // Price history for chart (last 200 M5 bars)
    const chartData = m5.closes.slice(-200).map((c, i) => ({
      time: new Date(m5.timestamps[m5.timestamps.length - 200 + i] * 1000).toISOString(),
      price: c,
    }));

    // RSI history for chart
    const rsiData = m15_rsi14.slice(-100).map((r, i) => {
      const idx = m15.timestamps.length - 100 + i;
      return {
        time: idx >= 0 ? new Date(m15.timestamps[idx] * 1000).toISOString() : "",
        rsi: isNaN(r) ? null : r,
      };
    }).filter(d => d.time);

    return NextResponse.json({
      indicators,
      signals,
      chartData,
      rsiData,
      hourUTC,
      session: hourUTC >= 13 && hourUTC < 16 ? "OVERLAP" :
               hourUTC >= 7 && hourUTC < 8 ? "LONDON" :
               hourUTC >= 7 && hourUTC < 21 ? "ACTIVE" : "OFF",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
