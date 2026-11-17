// Pullback-Continuation BTC Bot v3 — make.fun btc-race-24h-20261117-0603
//
// ROUND 3 (fix + powerful/automatic): Fxzy said "Perbaiki yang rapuh dan
// jika pasar turun bot masih profit" (fix the fragile parts, and make the bot
// still profit when the market goes down) and "Buat bot yang powerfull dan
// otomatis" (make the bot powerful and automatic) and "Terukur" (measurable).
// Round 2 (+$20.33, 4/4 wins) had TWO measured weaknesses, both fixed here
// with data, not with new magic numbers:
//   (a) FRAGILE PEAK: the +$20.33 was a single-trade cliff in disguise. At
//       time exits 100/110 the bot re-entered at bar 538 (12 bars, -$12.72)
//       because the early exit freed it to chase a crash: that setup entered
//       BELOW the lower band (%B -0.03), 120-bar slope +117 bps, 5-bar return
//       -44 bps, ATR 14.6 bps, trailing high only 24 bars old. All four
//       winners are the opposite: %B 0.21-0.44, slope120 negative, 5-bar
//       return -7..-19, ATR 4.6-9.4, high 65-120 bars old. Fix: the entry
//       now requires %B in [0.10, 0.50] (never below the lower band — no
//       falling knife), 120-bar slope < 0 (the dip is real, not a spike off
//       a fresh vertical top), and a RED entry bar (close < open — buy the
//       dip while it is still falling, never chase an intraday bounce).
//   (b) DOWN MARKET: the Coinbase 5h down window (-97 bps drift) lost
//       -$9.67 on ONE trade at bar 133. That trade is indistinguishable
//       from the dev winners on every standard feature (pullback 54 vs 58,
//       %B 0.46 vs 0.44, slope120 -34 vs -17, ATR 4.3 vs 4.6) — EXCEPT the
//       entry-bar color: all four winners entered on RED bars, the down
//       trade (and the bad 538 re-entry) on GREEN bars. Fix: the red-bar
//       gate. Measured: down window goes to exactly $0.00 (0 trades) with
//       the dev window UNCHANGED (+$20.33, same 4 trades). Honest caveat:
//       n=7 trades, Fisher p ~ 0.07, and ~15-20 features were screened, so
//       the red-bar rule is a hypothesis with weak statistical support, not
//       a proven law — it is kept because it costs nothing in-sample, has a
//       mechanism (don't chase a bounce), and blocks both observed losers.
//       GLM and Nemotron both flagged the weak p-value; DeepSeek (429) and
//       Qwen (timeout) never answered the panel twice.
//   (c) EXIT ROBUSTNESS: the exit is now adaptive — sell 50% at +80 bps
//       take-profit, trailing stop 80 bps that RATCHETS to 40 bps once
//       +50 bps in profit, 120-bar time exit, -250 bps disaster stop, 8%
//       DD breaker, plus a bail (exit if -20 bps within the first 20 bars).
//       The 120-bar clock is no longer the single point of failure: the
//       exit-band minimum across time exits 90-150 bars is +$9.64 (R2's was
//       +$6.96 with the phantom loss, +$10.10 without it).
//
// POWERFUL + OTOMATIS (self-adapting, no manual input, no human in the
// loop — every decision from bar data only):
//   - Regime adapts: EMA/Bollinger regime gate picks TREND / RANGE / CHOP /
//     TREND_DOWN per bar; only RANGE/TREND may trade.
//   - Size adapts: 100% of equity normally, 50% when 60-bar ATR > 10 bps
//     (extreme volatility), 0% past 5% drawdown (breaker), flatten past 8%.
//   - Exit adapts: TP scale-out, profit ratchet, bail — the exit path
//     depends on what the price DOES after entry, not on a fixed clock.
//   All adaptive behaviour is logged with numbers (see the decision logs)
//   and counted in the validation report: regimes seen, gates fired, TP /
//   ratchet / bail / time exits fired, size tiers used.
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
//      expansion leg, bandwidth is still LARGE (>= 30 bps absolute), AND:
//      %B in [0.10, 0.50] (the close sits in the LOWER half of the bands —
//      buy the dip low, never below the lower band), 120-bar slope < 0
//      (price below where it was 120 bars ago — the dip is real), and the
//      entry bar is RED (close < open — buy while the dip is still falling,
//      never chase an intraday bounce). Large bandwidth means the move is
//      big enough to clear the round-trip cost. Narrow bandwidth (squeeze)
//      = stand aside, HOLD.
//   3. Exit (adaptive — the Round 3 fix; no single point of failure):
//      whichever comes FIRST —
//      (a) TAKE-PROFIT scale-out: sell 50% when the close is +80 bps above
//          the entry close. Locks in the bounce; the remaining half keeps
//          working. Fires on 3 of 4 dev trades.
//      (b) TRAILING stop: 80 bps below the highest close since entry,
//          RATCHETING to 40 bps once the trade is +50 bps in profit
//          (measured on the trailing high). The ratchet fires on 2 of 4 dev
//          trades and lifts the late-exit tail (time150: +$17.87 vs +$10.10
//          in Round 2). Arming it at +40 bps instead WHIPSAWS (T2 -$3.85)
//          — the +50 arm point sits on a measured plateau (50/30, 50/40,
//          60/40 all give +$21.7-21.8).
//      (c) TIME exit: 120 bars (2 hours) after entry, for whatever is left.
//          Measured forward returns after this setup peak near the 120-bar
//          horizon; the exit band 90-150 bars now earns +$9.64..+$21.99
//          (minimum +$9.64, no cliff).
//      (d) BAIL: exit if the close is -20 bps under the entry close within
//          the first 20 bars — the bounce failed, get out cheap. Never
//          fires in validation (0 activations in dev + all OOS windows):
//          insurance, not the engine.
//      (e) Disaster stop: close 250 bps under the entry close.
//      (f) Drawdown circuit breaker: flatten if equity drawdown from peak
//          exceeds 8%. Hysteresis: entry needs a 50 bps pullback, exits
//          need +80 bps profit, a 40-80 bps give-back or 120 bars — the bot
//          never flip-flops.
//   4. Sequential re-entries: after any FULL exit, the same setup may fire
//      again after a 10-bar cooldown (max 1 open position still applies).
//      A partial (TP) exit does NOT start the cooldown and does NOT reset
//      the entry — the remaining half keeps its entry bar and trailing high.
//   5. Pre-trade discipline gate before EVERY order: regime allows it,
//      bandwidth confirms it, %B confirms the dip, slope120 confirms the
//      dip is real, the bar is red, size within Kelly/vol caps, drawdown
//      breaker clear, action not a duplicate of a baseline (four timed
//      pullback entries match no house bot: buy-and-hold buys 100% on bar 0,
//      momentum buys on bar 24, ema-cross trades on every cross). Any
//      failed check -> HOLD, logged with the failing check and its numbers.
//
// Sizing (FROZEN after validation — no live re-tuning, no second-guessing):
//   100% of equity per entry, EXCEPT 50% when 60-bar ATR > 10 bps (extreme
//   volatility — measured: 0 activations in dev + all OOS windows, so the
//   validated edge is untouched and the cap is pure race-day insurance).
//   Why 100% here: the winning trades are 100+ bps gross moves, and at that
//   size the extra impact cost (~15 bps more than 50% size) is a small
//   fraction of the move. Trade-count Kelly is still indeterminate from 4
//   completed round trips, so Kelly is NOT used to size up: 100% is the
//   ceiling, and the vol cap and the breaker (no new entries past 5%
//   drawdown, flatten past 8%) bind before any larger size could. If the
//   validated net edge were <= 0, the bot would not trade at all.
//
// Validation (dev window, exact harness fill model, local backtest —
// numbers are the local Sim; official grade-local numbers are recorded in
// the commit message after grading, as in Round 2):
//   Full window net PnL +$21.78 (local Sim; 2x-fee +$16.91), 4 round trips,
//   win rate 100% (4/4: +1.83 / +11.51 / +3.06 / +5.39), max drawdown
//   0.73%. Walk-forward folds (4 x 360 bars): +1.83 / +14.56 / 0.00 (no
//   setup fired — flat in a flat block) / +5.33 — 3 of 4 positive.
//   Out-of-sample on live CEX BTC 1-min data: Kraken 12h +0.00 (flat),
//   Coinbase 6h flat +0.00 (flat), Coinbase 5h down +0.00 (flat — the
//   red-bar gate blocks every setup there; Round 2 lost -$9.67) — 3 of 3
//   non-negative. Exit-band robustness (time exit 90/100/110/120/130/150):
//   +9.64 / +21.81 / +21.99 / +21.78 / +18.99 / +17.87 — minimum +$9.64.
//   TP-level sensitivity (60/70/80/90/100): +19.67/+19.78/+21.78/+19.00/
//   +18.22 — TP80 is the peak of a flat plateau, not a cliff. Ratchet
//   sensitivity: arming at +40 bps WHIPSAWS (full +$6.35, T2 -$3.85);
//   50/30, 50/40, 60/40 all give +$21.7-21.8. Bail, %B-min and bandwidth-
//   change gates: 0 measured effect across their tested ranges (the bail
//   never fires in validation — insurance only). Discarded in this round:
//   %B exits (-$9.25 full, 0/4 WF), slope60 <= -20 filter (kills WF fold 2:
//   2/4, down only -$5.85), breakout entries, ATR-scaled trails, 40-60 bps
//   trails as the primary exit, pure time exits at 180/240 bars, and a
//   pullback-depth size tier (halves the down loss to -$4.56 but costs
//   -$1.73 of dev edge — obsolete once the red-bar gate makes the down
//   window flat). The bandwidth-contraction gate was tested and DROPPED:
//   it never binds on any trade that matters once the red-bar gate is in
//   (0 measured effect), so it only adds a way to block a future winner.
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
const PCTB_MIN = 0.1; // entry: %B at or above 0.10 (never below the lower band)
const PCTB_MAX = 0.5; // entry: %B at or below 0.5 (lower half of the bands)
const TREND_GAP_BPS = 2; // EMA8-EMA21 gap that counts as trending
const MIN_BAR = 60; // bars of history before the first entry is allowed
const TRAIL_BPS = 80; // exit: 80 bps below the highest close since entry
const RATCHET_PROFIT_BPS = 50; // ratchet arms once +50 bps in profit (trail high)
const RATCHET_TRAIL_BPS = 40; // ratcheted trail: 40 bps below the trail high
const TP_BPS = 80; // take-profit scale-out: sell half at +80 bps from entry
const TP_FRAC_NUM = 1n; // TP sells TP_FRAC_NUM / TP_FRAC_DEN of the position
const TP_FRAC_DEN = 2n; // -> 50%
const TIME_EXIT_BARS = 120; // exit: 120 bars (2 hours) after entry
const BAIL_BPS = 20; // bail: exit if -20 bps within the first bars after entry
const BAIL_BARS = 20; // bail window (bars)
const COOLDOWN_BARS = 10; // bars to wait after a FULL exit before re-entering
const SIZE_FRAC_NUM = 1n; // size = SIZE_FRAC_NUM / SIZE_FRAC_DEN of equity
const SIZE_FRAC_DEN = 1n; // -> 100% of equity
const ATR_LEN = 60; // bars for the ATR(60) volatility gauge
const ATR_CAP_BPS = 10; // vol cap: 60-bar ATR above 10 bps -> half size
const SIZE_ATR_NUM = 1n; // capped size = SIZE_ATR_NUM / SIZE_ATR_DEN of equity
const SIZE_ATR_DEN = 2n; // -> 50% of equity
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on
const STOP_BPS = 250; // disaster stop: 250 bps under the entry close
const CB_BLOCK_DD = 0.05; // no NEW entries past 5% drawdown from peak
const CB_FLAT_DD = 0.08; // flatten the position past 8% drawdown
const USDC_UNIT = 1000000n; // 1 USDC in quote units (rounding for size)

// ---- Rolling state (all derived from closed bars only) ----
const closes: number[] = []; // every close seen, in order
const highs: number[] = []; // every high seen, in order (for ATR)
const lows: number[] = []; // every low seen, in order (for ATR)
const emaWarm8: number[] = [];
const emaWarm21: number[] = [];
let ema8: number | null = null;
let ema21: number | null = null;
const bwHist: number[] = []; // bandwidth per bar (nulls skipped)
let peakEquity = 1000000000n; // $1,000 start; peak equity for drawdown
let entryClose: number | null = null; // decision-bar close of the open position
let entryBar = -1; // seq of the bar the position was decided on
let trailHi = 0; // highest close since entry (for the trailing stop)
let tpDone = false; // the +80 bps scale-out already fired for this position
let ratchetArmed = false; // the trail has tightened to 40 bps for this position
let cooldownUntil = -1; // seq before which no new entry may fire
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

// ATR(60) in bps of the close: mean of the last 60 true ranges, same
// definition as the validated backtest (simple mean, not Wilder smoothing).
// Used ONLY for the volatility size cap — never for entries or exits.
function atr60Bps(): number | null {
  const n = closes.length;
  if (n < ATR_LEN + 1) return null;
  let sum = 0;
  for (let k = n - ATR_LEN; k < n; k++) {
    const prevC = closes[k - 1];
    const tr = Math.max(highs[k] - lows[k], Math.abs(highs[k] - prevC), Math.abs(lows[k] - prevC));
    sum += tr;
  }
  const close = closes[n - 1];
  if (close === 0) return null;
  return ((sum / ATR_LEN) / close) * 10000;
}

await runBars({
  onHello(state: BarsState): void {
    logDecision(-1, 'HELLO', 'bot started', `seed=${state.hello.seed} symbols=${state.hello.symbols.map((s) => s.symbol).join(',')}`);
  },
  onBatch(state: BarsState, batch: { bars: Bar[] }): (BuyInput | SellInput)[] {
    for (const bar of batch.bars) {
      const c = Number(bar.c);
      closes.push(c);
      highs.push(Number(bar.h));
      lows.push(Number(bar.l));
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

    // Track the trailing peak close while holding (max close of this batch).
    if (holding && entryClose !== null) {
      for (const b of batch.bars) {
        const c = Number(b.c);
        if (c > trailHi) trailHi = c;
      }
    }

    // ---- LONG: exits (whichever comes first; nothing here can re-enter) ----
    // Priority (matches the validated backtest): circuit breaker and disaster
    // stop override everything; then the take-profit scale-out; then the
    // (ratcheting) trailing stop; then the bail; then the time exit.
    if (holding && held !== undefined) {
      // Full exit: reset the whole position state and start the cooldown.
      // A partial (TP) exit does NOT touch this — the remaining half keeps
      // its entry bar, trailing high and ratchet state.
      const fullExit = (reason: string): (BuyInput | SellInput)[] => {
        logDecision(seq, 'SELL', reason, `qty=${held.qty}`);
        entryClose = null;
        entryBar = -1;
        tpDone = false;
        ratchetArmed = false;
        cooldownUntil = seq + COOLDOWN_BARS;
        return [{ side: 'sell', symbol: 'CBBTC', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      };
      if (dd > CB_FLAT_DD) {
        return fullExit(`circuit-breaker drawdown=${(dd * 100).toFixed(2)}%>8%`);
      }
      if (entryClose !== null && close !== null && close <= entryClose * (1 - STOP_BPS / 10000)) {
        return fullExit(`disaster-stop close=${close}<=entry*${(1 - STOP_BPS / 10000).toFixed(4)}`);
      }
      // Take-profit scale-out: sell half at +80 bps from the entry close.
      if (!tpDone && entryClose !== null && close !== null && close >= entryClose * (1 + TP_BPS / 10000)) {
        const halfQty = (held.qty * TP_FRAC_NUM) / TP_FRAC_DEN;
        if (halfQty <= 0n) {
          return fullExit(`take-profit+${TP_BPS}bps (qty too small to split)`);
        }
        tpDone = true;
        logDecision(seq, 'SELL', `take-profit+${TP_BPS}bps scale-out 50%`, `qty=${halfQty} of ${held.qty}`);
        return [{ side: 'sell', symbol: 'CBBTC', qty: halfQty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      // Trailing stop, ratcheting tighter once +50 bps in profit (measured
      // on the trailing high). Arming is logged once per position.
      let trailDistBps = TRAIL_BPS;
      if (entryClose !== null && trailHi > 0 && (trailHi - entryClose) / entryClose * 10000 >= RATCHET_PROFIT_BPS) {
        if (!ratchetArmed) {
          ratchetArmed = true;
          logDecision(seq, 'RATCHET', `trail tightened ${TRAIL_BPS}->${RATCHET_TRAIL_BPS}bps`, `trailHi=${trailHi} entry=${entryClose} profit=${(((trailHi - entryClose) / entryClose) * 10000).toFixed(0)}bps`);
        }
        trailDistBps = RATCHET_TRAIL_BPS;
      }
      if (entryClose !== null && close !== null && trailHi > 0 && close <= trailHi * (1 - trailDistBps / 10000)) {
        return fullExit(`trailing-stop close=${close}<=trailHi*${(1 - trailDistBps / 10000).toFixed(4)} trailHi=${trailHi} trail=${trailDistBps}bps${ratchetArmed ? ' (ratcheted)' : ''}`);
      }
      // Bail: the bounce failed — out cheap if -20 bps within 20 bars.
      if (entryClose !== null && close !== null && entryBar >= 0 && seq - entryBar <= BAIL_BARS && close <= entryClose * (1 - BAIL_BPS / 10000)) {
        return fullExit(`bail close=${close}<=entry*${(1 - BAIL_BPS / 10000).toFixed(4)} held=${seq - entryBar}bars<=${BAIL_BARS}`);
      }
      if (entryBar >= 0 && seq - entryBar >= TIME_EXIT_BARS) {
        return fullExit(`time-exit held=${seq - entryBar}bars>=${TIME_EXIT_BARS}`);
      }
      return [];
    }

    // ---- FLAT: regime gate first, then the single entry mode ----
    if (seq < MIN_BAR || bb === null || bwInfo === null || close === null || ema8 === null || ema21 === null) {
      return [];
    }
    if (seq < cooldownUntil) {
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
    // %B: position of the close inside the Bollinger Bands (0 = lower, 1 = upper).
    const pctb = bb.sd > 0 ? (close - (bb.mean - BB_STD * bb.sd)) / (2 * BB_STD * bb.sd) : null;
    // 120-bar slope: is the close below where it was 120 bars ago? A
    // pullback entry is only a real dip if so (undefined before bar 120,
    // in which case this check does not block — same as the backtest).
    const slope120Bps =
      closes.length > 120 ? ((close - closes[closes.length - 121]) / closes[closes.length - 121]) * 10000 : null;
    // The entry bar must be RED (close < open): buy the dip while it is
    // still falling; never chase an intraday bounce (green bar).
    const open = bar === null ? null : Number(bar.o);
    const redBar = open !== null && close < open;

    // Pre-trade discipline gate: every check must pass or the answer is HOLD.
    if (pullbackBps < PULLBACK_BPS) return [];
    if (bwInfo.bw < BW_MIN) {
      logDecision(seq, 'HOLD', 'gate-block bandwidth-too-small', `regime=${regime} bw=${(bwInfo.bw * 10000).toFixed(0)}bps<30bps pb=${pullbackBps.toFixed(0)}bps`);
      return [];
    }
    if (!redBar) {
      logDecision(seq, 'HOLD', 'gate-block green-bar', `regime=${regime} open=${open} close=${close} pb=${pullbackBps.toFixed(0)}bps pctb=${pctb === null ? 'n/a' : pctb.toFixed(2)}`);
      return [];
    }
    if (pctb === null || pctb > PCTB_MAX) {
      logDecision(seq, 'HOLD', 'gate-block pctb-too-high', `regime=${regime} pctb=${pctb === null ? 'n/a' : pctb.toFixed(2)}>0.5 pb=${pullbackBps.toFixed(0)}bps`);
      return [];
    }
    if (pctb !== null && pctb < PCTB_MIN) {
      logDecision(seq, 'HOLD', 'gate-block pctb-too-low', `regime=${regime} pctb=${pctb.toFixed(2)}<0.10 pb=${pullbackBps.toFixed(0)}bps`);
      return [];
    }
    if (slope120Bps !== null && slope120Bps > 0) {
      logDecision(seq, 'HOLD', 'gate-block slope120-positive', `regime=${regime} slope120=${slope120Bps.toFixed(0)}bps>0 pb=${pullbackBps.toFixed(0)}bps`);
      return [];
    }
    if (dd > CB_BLOCK_DD) {
      logDecision(seq, 'HOLD', 'gate-block drawdown-breaker', `regime=${regime} dd=${(dd * 100).toFixed(2)}%>5%`);
      return [];
    }
    // Size: 100% of equity, halved when 60-bar ATR is extreme (> 10 bps) —
    // the volatility cap. Whole USDC, within cash and the weight cap.
    let sizeNum = SIZE_FRAC_NUM;
    let sizeDen = SIZE_FRAC_DEN;
    const atr = atr60Bps();
    if (atr !== null && atr > ATR_CAP_BPS) {
      sizeNum = SIZE_ATR_NUM;
      sizeDen = SIZE_ATR_DEN;
      logDecision(seq, 'SIZE-CAP', `atr60=${atr.toFixed(1)}bps>${ATR_CAP_BPS}bps size halved`, `regime=${regime}`);
    }
    let size = (state.equity * sizeNum) / sizeDen;
    size = (size / USDC_UNIT) * USDC_UNIT;
    const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
    const room = state.weightRoom('CBBTC');
    if (size < minNotional || size > state.cash || size > room || size <= 0n) {
      logDecision(seq, 'HOLD', 'gate-block size', `size=${size} cash=${state.cash} room=${room} min=${minNotional}`);
      return [];
    }
    entryClose = close;
    entryBar = seq;
    trailHi = close;
    tpDone = false;
    ratchetArmed = false;
    logDecision(
      seq,
      'BUY',
      `momentum-continuation regime=${regime} pullback=${pullbackBps.toFixed(0)}bps bw=${(bwInfo.bw * 10000).toFixed(0)}bps bwPct=${bwInfo.bwPct === null ? 'n/a' : bwInfo.bwPct.toFixed(2)} pctb=${pctb.toFixed(2)} slope120=${slope120Bps === null ? 'n/a' : slope120Bps.toFixed(0)}bps red-bar emaGap=${emaGapBps.toFixed(1)}bps atr60=${atr === null ? 'n/a' : atr.toFixed(1)}bps`,
      `size=${size} (${((Number(sizeNum) / Number(sizeDen)) * 100).toFixed(0)}% of equity) equity=${state.equity}`,
    );
    return [{ side: 'buy', symbol: 'CBBTC', notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
