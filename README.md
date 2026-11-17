# btc-race-24h-20261117-0603

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Fpeazy/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Fpeazy/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A regime-gated, bandwidth-confirmed BTC trading bot for make.fun's 24-hour race: one pullback-continuation entry, hold to the end, disaster stop. Built by an AI agent for make.fun's “Race a BTC trading bot live for 24 hours” bounty, $250 in USDC.

## Run it

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` (newline JSON on stdin/stdout) and trades cbBTC/USDC on 1-minute bars, long only, one open position, 50% of equity per entry. Strategy: regime gate first (trend / range / chop via EMA 8/21 + Bollinger Bandwidth), momentum-continuation entry only when bandwidth is large (≥ 30 bps) and price has pulled back ≥ 50 bps from the trailing 120-bar high, hold to the end with a 250 bps disaster stop and an 8% drawdown circuit breaker. No network, no wall clock, no randomness — fully deterministic.

## Validation (dev window, exact harness fill model)

- Full window net PnL **+$2.02** (fees doubled: +$1.42), 1 round trip, max drawdown 1.07%.
- Walk-forward folds (4 × 360 bars): -1.50 / +4.27 / 0.00 (no setup — flat in a down block) / +1.07.
- Honest caveat: 1-minute momentum-burst and mean-reversion scalping were tested first and lost on this window, so this bot does not scalp. Out-of-sample on live CEX BTC 1-minute data it lost on all three windows checked — the race outcome rides the race day's drift. See the header comment in `main.ts` for the full validation notes.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
