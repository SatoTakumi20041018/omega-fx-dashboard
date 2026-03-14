// OMEGA FX — Trade management (client-side localStorage)

export interface Trade {
  id: string;
  timestamp: string;
  direction: "BUY" | "SELL";
  system: string;
  entry: number;
  tp: number;
  sl: number;
  tp_pips: number;
  sl_pips: number;
  lot: number;
  status: "open" | "closed";
  exit_price?: number;
  exit_reason?: "TP" | "SL" | "BE" | "MANUAL" | "TIME";
  exit_time?: string;
  pnl_jpy?: number;
  pnl_pips?: number;
}

export interface Account {
  equity: number;
  initial: number;
  total_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  consec_losses: number;
  lot_mult: number;
  daily_loss: number;
  last_day: string;
}

const TRADES_KEY = "omega_trades";
const ACCOUNT_KEY = "omega_account";
const PIP = 0.01;

export function defaultAccount(): Account {
  return {
    equity: 10000, initial: 10000, total_pnl: 0,
    total_trades: 0, wins: 0, losses: 0,
    consec_losses: 0, lot_mult: 1.0,
    daily_loss: 0, last_day: "",
  };
}

export function loadTrades(): Trade[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(TRADES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveTrades(trades: Trade[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
}

export function loadAccount(): Account {
  if (typeof window === "undefined") return defaultAccount();
  const raw = localStorage.getItem(ACCOUNT_KEY);
  return raw ? { ...defaultAccount(), ...JSON.parse(raw) } : defaultAccount();
}

export function saveAccount(acc: Account) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
}

export function openTrade(
  direction: "BUY" | "SELL",
  system: string,
  entry: number,
  tp: number, sl: number,
  tp_pips: number, sl_pips: number,
  lot: number,
): Trade {
  const trade: Trade = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    direction, system, entry, tp, sl, tp_pips, sl_pips, lot,
    status: "open",
  };
  const trades = loadTrades();
  trades.push(trade);
  saveTrades(trades);
  return trade;
}

export function closeTrade(
  tradeId: string,
  currentPrice: number,
  reason: Trade["exit_reason"],
): Trade | null {
  const trades = loadTrades();
  const idx = trades.findIndex(t => t.id === tradeId);
  if (idx === -1) return null;

  const trade = trades[idx];
  const dir = trade.direction === "BUY" ? 1 : -1;

  let exitPrice = currentPrice;
  if (reason === "TP") exitPrice = trade.tp;
  else if (reason === "SL") exitPrice = trade.sl;

  const pnl_pips = dir * (exitPrice - trade.entry) / PIP;
  const cost_pips = 0.71; // approximate total cost
  const net_pips = pnl_pips - cost_pips;
  const pnl_jpy = net_pips * trade.lot * 100000 * PIP;

  trade.status = "closed";
  trade.exit_price = exitPrice;
  trade.exit_reason = reason;
  trade.exit_time = new Date().toISOString();
  trade.pnl_jpy = Math.round(pnl_jpy);
  trade.pnl_pips = Math.round(net_pips * 10) / 10;

  trades[idx] = trade;
  saveTrades(trades);

  // Update account
  const acc = loadAccount();
  acc.equity += pnl_jpy;
  acc.total_pnl += pnl_jpy;
  acc.total_trades++;
  if (pnl_jpy > 0) {
    acc.wins++;
    acc.consec_losses = 0;
    acc.lot_mult = Math.min(acc.lot_mult * 1.5, 2.5);  // 1.5x after win
  } else {
    acc.losses++;
    acc.consec_losses++;
    // NO RESET — keep previous lot mult, just don't increase
    acc.lot_mult = Math.max(1.0, acc.lot_mult * 0.85);  // gentle 15% reduction
    acc.daily_loss += Math.abs(pnl_jpy);
  }
  saveAccount(acc);

  return trade;
}

export function checkAutoClose(trades: Trade[], currentPrice: number): Trade[] {
  const closed: Trade[] = [];
  for (const t of trades) {
    if (t.status !== "open") continue;
    const dir = t.direction === "BUY" ? 1 : -1;

    // Check TP
    if (dir === 1 && currentPrice >= t.tp) {
      const c = closeTrade(t.id, currentPrice, "TP");
      if (c) closed.push(c);
    } else if (dir === -1 && currentPrice <= t.tp) {
      const c = closeTrade(t.id, currentPrice, "TP");
      if (c) closed.push(c);
    }
    // Check SL
    else if (dir === 1 && currentPrice <= t.sl) {
      const c = closeTrade(t.id, currentPrice, "SL");
      if (c) closed.push(c);
    } else if (dir === -1 && currentPrice >= t.sl) {
      const c = closeTrade(t.id, currentPrice, "SL");
      if (c) closed.push(c);
    }
  }
  return closed;
}

export function getOpenTrades(): Trade[] {
  return loadTrades().filter(t => t.status === "open");
}

export function getClosedTrades(): Trade[] {
  return loadTrades().filter(t => t.status === "closed");
}

export function resetAccount() {
  saveTrades([]);
  saveAccount(defaultAccount());
}
