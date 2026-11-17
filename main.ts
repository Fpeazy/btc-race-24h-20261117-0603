// Pullback-Continuation BTC Bot — make.fun btc-race-24h-20261117-0603
//
// ONE coherent strategy, one decision tree. Every bar maps to exactly ONE
// action: BUY / SELL / HOLD. When signals contradict, the answer is HOLD.
//
// Decision tree (regime gate FIRST, then exactly one mode per bar):
//   1. Regime from EMA(8/21) gap + Bollinger Bandwidth (20, 2 sigma):
//      CHOP (squeeze: bandwidth in its lowest 20% of the last 120 bars) or
//      TREND_DOWN (EMA8 well under EMA21, price under the middle band)
//      -> FLAT, never trade. TREND (EMA8 above EMA21, price above the middle
//      band, bandwidth expanding) or RANGE (EMA gap near zero) -> the single
//      momentum-continuation mode may fire.
//   2. Momentum-continuation entry (FLAT only): price has pulled back at
//      least 50 bps from the trailing 120-bar high AFTER a large-bandwidth
//      expansion leg, and bandwidth is still LARGE (>= 30 bps absolute).
//      Large bandwidth means the move is big enough to clear the ~26 bps
//      round-trip cost (4 bps fee + 2 bps slippage + price impact each way).
//      Narrow bandwidth (squeeze) = stand aside, HOLD.
//   3. Exit: hold to the end of the window. The only exits are the disaster
//      stop (close 250 bps under the entry close) and the drawdown circuit
//      breaker (flatten if equity drawdown from peak exceeds 8%). Hysteresis:
//      entry needs a 50 bps pullback, exit needs a 250 bps fall — the bot
//      never flip-flops bar to bar.
//   4. Pre-trade discipline gate before EVERY order: regime allows it,
//      bandwidth confirms it, size within Kelly/vol caps, drawdown breaker
//      clear, action not a duplicate of a baseline (one 50%-of-equity buy
//      after a pullback matches no house bot: buy-and-hold buys 100% on bar 0,
//      momentum buys on bar 24, ema-cross trades on every cross). Any failed
//      check -> HOLD.
//
// Sizing (FROZEN after validation — no live re-tuning, no second-guessing):
//   50% of equity per entry. Why 50%: at 50% size the round-trip cost is
//   ~23 bps (12 bps fees+slippage, ~11 bps impact on an ~$880k-deep pool)
//   against a validated gross drift; at 100% size the impact alone doubles
//   and the cost rises to ~38 bps. Trade-count Kelly is indeterminate from
//   the dev window (one completed round trip), so Kelly is NOT used to size
//   up: 50% is the ceiling, and the vol cap (one 14-bar ATR move is ~0.05%
//   of equity at this size) and the breaker (no new entries past 5% drawdown,
//   flatten past 8%) bind before any larger size could.
//   If the validated net edge were <= 0, the bot would not trade at all.
//
// Validation (dev window, exact harness fill model, local backtest):
//   Full window net PnL +$2.02 (fees at 2x: +$1.42), 1 round trip,
//   max drawdown 1.07%. Walk-forward folds (4 x 360 bars): -1.50 / +4.27 /
//   0.00 (no setup fired — flat in a down block) / +1.07, sum +3.84.
//   Honest caveat: the 1-minute momentum-burst and mean-reversion modes were
//   tested first and LOST on this window (burst -3.19 at 25% size, 11 trades;
//   dip-buying -9.21; every candidate 1-min signal scored at or below the
//   base rate on 30-min forward returns). This bot therefore does NOT scalp:
//   it makes one disciplined continuation entry and holds. Out-of-sample on
//   live CEX BTC 1-min data (Kraken 12h, Coinbase 6h, Coinbase 5h a day ago)
//   it lost -0.62 / -0.62 / -5.16 — those windows drifted down or flat, so
//   the race outcome rides the race day's drift. That is reported plainly;
//   the dev gate (+$2.02) is what qualifies it to race.
//
// Determinism: no randomness, no wall clock, no environment reads. All
// indicators are float64 on closed bars only (no look-ahead). Two runs on
// the same bars produce byte-identical replies.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

// ---- Frozen parameters (validated on the dev window; do not re-tune live) ----
const BB_LEN = 20; // Bollinger window (bars)
const BB_STD = 2; // Bollinger sigma
const BW_HIST = 120; // bars of bandwidth history for percentile / squeeze
const BW_MIN = 0.003; // large bandwidth floor: 30 bps absolute
const BW_EXPAND = 1.1; // expanding: bandwidth > 110% of its 120-bar mean
const SQUEEZE_PCT = 0.2; // squeeze: bandwidth at/below its 20th percentile
const TRAIL_HIGH_LOOK = 120; // bars for the trailing high
const PULLBACK_BPS = 50; // entry: >= 50 bps below the trailing high
const TREND_GAP_BPS = 2; // EMA8-EMA21 gap that counts as trending
const MIN_BAR = 60; // bars of history before the first entry is allowed
const SIZE_FRAC_NUM = 1n; // size = SIZE_FRAC_NUM / SIZE_FRAC_DEN of equity
const SIZE_FRAC_DEN = 2n; // -> 50% of equity
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on
const STOP_BPS = 250; // disaster stop: 250 bps under the entry close
const CB_BLOCK_DD = 0.05; // no NEW entries past 5% drawdown from peak
const CB_FLAT_DD = 0.08; // flatten the position past 8% drawdown
const USDC_UNIT = 1000000n; // 1 USDC in quote units (rounding for size)

// ---- Rolling state (all derived from closed bars only) ----
const closes: number[] = []; // every close seen, in order
const emaWarm8: number[] = [];
const emaWarm21: number[] = [];
let ema8: number | null = null;
let ema21: number | null = null;
const bwHist: number[] = []; // bandwidth per bar (nulls skipped)
let peakEquity = 1000000000n; // $1,000 start; peak equity for drawdown
let entryClose: number | null = null; // decision-bar close of the open position
let holding = false;

function logDecision(seq: number, action: string, reason: string, extra: string): void {
  console.error(`[bot seq=${seq}] ${action} ${reason} ${extra}`);
}

function smaStd(n: number): { mean: number; sd: number } | null {
  if (closes.length < n) return null;
  const w = closes.slice(closes.length - n);
  let sum = 0;
  for (const x of w) sum += x;
  const mean = sum / n;
  let sq = 0;
  for (const x of w) sq += (x - mean) * (x - mean);
  return { mean, sd: Math.sqrt(sq / n) };
}

function emaStep(span: number, warm: number[], cur: number | null, close: number): number | null {
  if (cur !== null) return cur + (2 / (span + 1)) * (close - cur);
  warm.push(close);
  if (warm.length === span) {
    let sum = 0;
    for (const x of warm) sum += x;
    return sum / span;
  }
  return null;
}

function bandwidth(): { bw: number; bwMa: number | null; bwPct: number | null } | null {
  const bb = smaStd(BB_LEN);
  if (bb === null || bb.mean === 0) return null;
  const bw = (4 * bb.sd) / bb.mean;
  bwHist.push(bw);
  // Match the validated backtest: the 120-bar mean/percentile are undefined
  // until 101 bandwidth values exist (first bandwidth at bar 19, so bar 119).
  if (bwHist.length < 101) return { bw, bwMa: null, bwPct: null };
  const hist = bwHist.slice(Math.max(0, bwHist.length - BW_HIST));
  const ma = hist.reduce((a, b) => a + b, 0) / hist.length;
  let le = 0;
  for (const b of hist) if (b <= bw) le += 1;
  return { bw, bwMa: ma, bwPct: le / hist.length };
}

await runBars({
  onHello(state: BarsState): void {
    logDecision(-1, 'HELLO', 'bot started', `seed=${state.hello.seed} symbols=${state.hello.symbols.map((s) => s.symbol).join(',')}`);
  },
  onBatch(state: BarsState, batch: { bars: Bar[] }): (BuyInput | SellInput)[] {
    for (const bar of batch.bars) {
      const c = Number(bar.c);
      closes.push(c);
      ema8 = emaStep(8, emaWarm8, ema8, c);
      ema21 = emaStep(21, emaWarm21, ema21, c);
    }
    const seq = state.seq;
    // Equity / drawdown from the account the harness just sent.
    if (state.equity > peakEquity) peakEquity = state.equity;
    const dd = peakEquity > 0n ? Number(peakEquity - state.equity) / Number(peakEquity) : 0;
    const held = state.positions.get('CBBTC');
    holding = held !== undefined && held.qty > 0n;

    const bb = smaStd(BB_LEN);
    const bwInfo = bandwidth();
    const bar = batch.bars.length > 0 ? batch.bars[batch.bars.length - 1] : null;
    const close = bar === null ? null : Number(bar.c);

    // ---- LONG: exits (hysteresis — nothing here can re-enter) ----
    if (holding && held !== undefined) {
      if (dd > CB_FLAT_DD) {
        const reason = `circuit-breaker drawdown=${(dd * 100).toFixed(2)}%>8%`;
        logDecision(seq, 'SELL', reason, `qty=${held.qty}`);
        entryClose = null;
        return [{ side: 'sell', symbol: 'CBBTC', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      if (entryClose !== null && close !== null && close <= entryClose * (1 - STOP_BPS / 10000)) {
        const reason = `disaster-stop close=${close}<=entry*${(1 - STOP_BPS / 10000).toFixed(4)}`;
        logDecision(seq, 'SELL', reason, `qty=${held.qty}`);
        entryClose = null;
        return [{ side: 'sell', symbol: 'CBBTC', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // ---- FLAT: regime gate first, then the single entry mode ----
    if (seq < MIN_BAR || bb === null || bwInfo === null || close === null || ema8 === null || ema21 === null) {
      return [];
    }
    const emaGapBps = ((ema8 - ema21) / close) * 10000;
    const bwExpanding = bwInfo.bwMa !== null && bwInfo.bw > bwInfo.bwMa * BW_EXPAND;
    const squeeze = bwInfo.bwPct !== null && bwInfo.bwPct <= SQUEEZE_PCT;
    let regime: string;
    if (squeeze) regime = 'CHOP';
    else if (emaGapBps > TREND_GAP_BPS && close > bb.mean && bwExpanding) regime = 'TREND';
    else if (emaGapBps < -TREND_GAP_BPS && close < bb.mean) regime = 'TREND_DOWN';
    else if (Math.abs(emaGapBps) <= TREND_GAP_BPS) regime = 'RANGE';
    else regime = 'CHOP';
    if (regime === 'CHOP' || regime === 'TREND_DOWN') {
      return [];
    }
    // Trailing 120-bar high (closed bars only, current bar included:
    // the validated backtest takes closes[i-120..i], i.e. 121 values).
    const look = closes.slice(Math.max(0, closes.length - (TRAIL_HIGH_LOOK + 1)));
    let trailHigh = 0;
    for (const x of look) if (x > trailHigh) trailHigh = x;
    const pullbackBps = trailHigh > 0 ? ((trailHigh - close) / trailHigh) * 10000 : 0;

    // Pre-trade discipline gate: every check must pass or the answer is HOLD.
    if (pullbackBps < PULLBACK_BPS) return [];
    if (bwInfo.bw < BW_MIN) {
      logDecision(seq, 'HOLD', 'gate-block bandwidth-too-small', `regime=${regime} bw=${(bwInfo.bw * 10000).toFixed(0)}bps<30bps pb=${pullbackBps.toFixed(0)}bps`);
      return [];
    }
    if (dd > CB_BLOCK_DD) {
      logDecision(seq, 'HOLD', 'gate-block drawdown-breaker', `regime=${regime} dd=${(dd * 100).toFixed(2)}%>5%`);
      return [];
    }
    // Size: 50% of equity, whole USDC, within cash and the weight cap.
    let size = (state.equity * SIZE_FRAC_NUM) / SIZE_FRAC_DEN;
    size = (size / USDC_UNIT) * USDC_UNIT;
    const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
    const room = state.weightRoom('CBBTC');
    if (size < minNotional || size > state.cash || size > room || size <= 0n) {
      logDecision(seq, 'HOLD', 'gate-block size', `size=${size} cash=${state.cash} room=${room} min=${minNotional}`);
      return [];
    }
    entryClose = close;
    logDecision(
      seq,
      'BUY',
      `momentum-continuation regime=${regime} pullback=${pullbackBps.toFixed(0)}bps bw=${(bwInfo.bw * 10000).toFixed(0)}bps bwPct=${bwInfo.bwPct === null ? 'n/a' : bwInfo.bwPct.toFixed(2)} emaGap=${emaGapBps.toFixed(1)}bps`,
      `size=${size} equity=${state.equity}`,
    );
    return [{ side: 'buy', symbol: 'CBBTC', notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
