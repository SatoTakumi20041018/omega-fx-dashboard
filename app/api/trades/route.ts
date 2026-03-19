import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

const TRADES_FILE = "/home/takumi/work/FX/fx_trading_systems/trade_journal/trades.jsonl";
const STATE_FILE = "/home/takumi/work/FX/fx_trading_systems/trade_journal/state.json";

export const dynamic = "force-dynamic";

interface AutoTrade {
  timestamp: string;
  pair: string;
  direction: string | number; // "BUY"/"SELL" or 1/-1
  entry_price: number;
  tp_price?: number;
  sl_price?: number;
  tp_pips?: number;
  sl_pips?: number;
  exit_price?: number;
  exit_reason?: string;
  pnl_pips?: number;
  pnl_jpy?: number;
  won?: boolean;
  lot: number;
  confirms?: number;
  bars_held?: number;
  trail_active?: boolean;
  mt5_ticket?: number;
  status: "open" | "closed";
  label?: string;
}

interface AutoState {
  equity: number;
  total_pnl: number;
  total_trades: number;
  total_wins: number;
  consec_losses: number;
  lot_mult: number;
  daily_loss: number;
  last_day: string;
  open_position: {
    direction: number;
    entry: number;
    tp: number;
    sl: number;
    lot: number;
    timestamp: string;
    trail_active: boolean;
    bars_held: number;
    live: boolean;
    mt5_ticket?: number;
  } | null;
}

export async function GET() {
  try {
    // Read trades JSONL
    let trades: AutoTrade[] = [];
    if (existsSync(TRADES_FILE)) {
      const raw = await readFile(TRADES_FILE, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          trades.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
    }

    // Read state JSON
    let state: AutoState = {
      equity: 10000,
      total_pnl: 0,
      total_trades: 0,
      total_wins: 0,
      consec_losses: 0,
      lot_mult: 1.0,
      daily_loss: 0,
      last_day: "",
      open_position: null,
    };
    if (existsSync(STATE_FILE)) {
      try {
        const raw = await readFile(STATE_FILE, "utf-8");
        state = JSON.parse(raw);
      } catch {
        // use defaults
      }
    }

    return NextResponse.json(
      { trades, state },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
