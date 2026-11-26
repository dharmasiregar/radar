# radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dharmasiregar/radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dharmasiregar/radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Description

**Signal Before the Ticker** is a deterministic pre-token protocol radar. For each pre-token protocol, the model computes an implied value as TVL × category multiple × growth multiplier × maturity multiplier × breadth multiplier. The category multiple is the median market-cap-to-TVL ratio of the snapshot's own tokenized protocols in the same category.

The board covers a 40-protocol watchlist plus 220 further rankable pre-token protocols (260 rows). Each row includes a per-factor model breakdown and a concrete farm plan with steps, costs, and time.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=dsk71rdg&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
