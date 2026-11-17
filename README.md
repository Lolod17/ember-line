# EMBER LINE

[![make.fun Best Game 01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![Rank](https://make.fun/badge/best-game-01/Lolod17/ember-line/rank.svg)](https://make.fun/bounty/best-game-01)
[![Reward](https://make.fun/badge/best-game-01/Lolod17/ember-line/reward.svg)](https://make.fun/bounty/best-game-01)

EMBER LINE is a one-screen firebreak arcade game. Fire spreads across a grid of trees each tick, and you drag with the mouse to paint firebreaks on a fixed water budget before it reaches the village.

## Run it locally

```sh
node serve.ts
```

Then open http://localhost:8080.

## Controls

| Input | Action |
| --- | --- |
| Mouse drag | Paint firebreak |
| X | Erase |
| Space | Next wave |
| P | Pause |
| R | Restart |

## Score

`score = trees saved × 10 + waves survived × 250 + water banked × 2`

Water is banked at the end of every wave that is completed and also when the run ends; the HUD bar shows the current wave's water, and the result panels show the banked total.

## About

The game is a single static page under `game/` with no build step and no network requests.

## License

MIT — see [LICENSE](LICENSE).
