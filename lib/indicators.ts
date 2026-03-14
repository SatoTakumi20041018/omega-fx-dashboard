// OMEGA FX — Indicator calculations (TypeScript port of Python v7.1)

export function computeRSI(closes: number[], period: number): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  const alpha = 1.0 / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = avgGain * (1 - alpha) + gain * alpha;
    avgLoss = avgLoss * (1 - alpha) + loss * alpha;
    rsi[i] = avgLoss < 1e-10 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

export function computeEMA(data: number[], span: number): number[] {
  const ema: number[] = new Array(data.length).fill(NaN);
  const alpha = 2 / (span + 1);
  let sum = 0, count = 0;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(data[i])) continue;
    if (count < span) {
      sum += data[i];
      count++;
      if (count === span) {
        ema[i] = sum / span;
      }
    } else {
      ema[i] = data[i] * alpha + ema[i - 1] * (1 - alpha);
    }
  }
  return ema;
}

export function computeATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const n = highs.length;
  const tr: number[] = new Array(n).fill(NaN);
  const atr: number[] = new Array(n).fill(NaN);

  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += tr[i];
  }
  atr[period] = sum / period;

  for (let i = period + 1; i < n; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

export function computeMACD(closes: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macd = closes.map((_, i) =>
    isNaN(ema12[i]) || isNaN(ema26[i]) ? NaN : ema12[i] - ema26[i]
  );
  const signal = computeEMA(macd.filter(v => !isNaN(v)), 9);

  // Realign signal
  const signalFull: number[] = new Array(closes.length).fill(NaN);
  let si = 0;
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macd[i])) {
      if (si < signal.length) signalFull[i] = signal[si];
      si++;
    }
  }

  const histogram = closes.map((_, i) =>
    isNaN(macd[i]) || isNaN(signalFull[i]) ? NaN : macd[i] - signalFull[i]
  );

  return { macd, signal: signalFull, histogram };
}

export interface Indicators {
  price: number;
  m5_rsi2: number;
  m5_rsi14: number;
  m5_trend: boolean;
  m15_rsi2: number;
  m15_rsi14: number;
  m15_atr_pips: number;
  m15_trend: boolean;
  m15_macd: number;
  atr_pctile: number;
  h1_rsi14: number;
  h1_trend: boolean;
  h1_macd: number;
  m5_rsi2_min3: number;
  m5_rsi2_max3: number;
  timestamp: string;
}

export interface Signal {
  system: string;
  direction: "BUY" | "SELL";
  entry: number;
  tp: number;
  sl: number;
  tp_pips: number;
  sl_pips: number;
  rr: number;
  confidence: number;
  reason: string;
  win_jpy: number;
  loss_jpy: number;
}

export function checkSignals(ind: Indicators, hourUTC: number): Signal[] {
  const signals: Signal[] = [];
  const pip = 0.01;
  const lot = 0.10;
  const pctile = ind.atr_pctile;
  const m15_atr = ind.m15_atr_pips;

  if (pctile < 20 || pctile > 92 || m15_atr < 2.0) return signals;

  // v5.3 MTFMomentum (Overlap: 13-16 UTC)
  if (hourUTC >= 13 && hourUTC < 16) {
    if (ind.m15_rsi14 > 55 && ind.h1_rsi14 > 60 && ind.m5_rsi2_min3 < 35) {
      const tp = 2.0 * m15_atr;
      const sl = 0.5 * m15_atr;
      signals.push({
        system: "v5.3", direction: "BUY",
        entry: ind.price, tp: ind.price + tp * pip, sl: ind.price - sl * pip,
        tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: 0.7,
        reason: `RSI pullback in uptrend (M15=${ind.m15_rsi14.toFixed(1)} H1=${ind.h1_rsi14.toFixed(1)})`,
        win_jpy: tp * lot * 100000 * pip, loss_jpy: sl * lot * 100000 * pip,
      });
    }
    if (ind.m15_rsi14 < 45 && ind.h1_rsi14 < 40 && ind.m5_rsi2_max3 > 65) {
      const tp = 2.0 * m15_atr;
      const sl = 0.5 * m15_atr;
      signals.push({
        system: "v5.3", direction: "SELL",
        entry: ind.price, tp: ind.price - tp * pip, sl: ind.price + sl * pip,
        tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: 0.7,
        reason: `RSI bounce in downtrend`,
        win_jpy: tp * lot * 100000 * pip, loss_jpy: sl * lot * 100000 * pip,
      });
    }
  }

  // v7.1 MTFPullback (Active: 7-21 UTC)
  if (hourUTC >= 7 && hourUTC < 21) {
    // LONG
    let lc = 0;
    if (ind.m15_rsi2 < 30) lc++;
    if (ind.m15_rsi14 > 52) lc++;
    if (ind.h1_rsi14 > 55) lc++;
    if (ind.m15_trend) lc++;
    if (ind.h1_trend) lc++;
    if (ind.m5_rsi2 < 25) lc++;
    if (ind.m15_macd > 0) lc++;
    if (ind.h1_macd > 0) lc++;

    if (lc >= 5) {
      const tp = Math.max(4, 1.5 * m15_atr);
      const sl = Math.max(2, 0.5 * m15_atr);
      signals.push({
        system: "v7.1", direction: "BUY",
        entry: ind.price, tp: ind.price + tp * pip, sl: ind.price - sl * pip,
        tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: lc / 8,
        reason: `${lc}/8 confirms`,
        win_jpy: tp * lot * 100000 * pip, loss_jpy: sl * lot * 100000 * pip,
      });
    }

    // SHORT
    let sc = 0;
    if (ind.m15_rsi2 > 70) sc++;
    if (ind.m15_rsi14 < 48) sc++;
    if (ind.h1_rsi14 < 45) sc++;
    if (!ind.m15_trend) sc++;
    if (!ind.h1_trend) sc++;
    if (ind.m5_rsi2 > 75) sc++;
    if (ind.m15_macd < 0) sc++;
    if (ind.h1_macd < 0) sc++;

    if (sc >= 5) {
      const tp = Math.max(4, 1.5 * m15_atr);
      const sl = Math.max(2.5, 0.6 * m15_atr);
      signals.push({
        system: "v7.1", direction: "SELL",
        entry: ind.price, tp: ind.price - tp * pip, sl: ind.price + sl * pip,
        tp_pips: tp, sl_pips: sl, rr: tp / sl, confidence: sc / 8,
        reason: `${sc}/8 confirms`,
        win_jpy: tp * lot * 100000 * pip, loss_jpy: sl * lot * 100000 * pip,
      });
    }
  }

  return signals;
}
