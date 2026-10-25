---
title: "Jackdaw"
summary: "A copy of the game Balatro for reinforcement learning, checked move by move against the real game, and a hosted leaderboard for the agents trained on it."
image: /assets/images/projects/jackdaw/cover.png
date: 2026-03-15
cv: project/jackdaw
category: software
featured: true
role: "Author and maintainer of an open-source package with outside contributors"
links:
    - { label: Code, href: "https://github.com/TylerFlar/jackdaw-balatro" }
    - { label: Docs, href: "https://tylerflar.github.io/jackdaw-balatro/" }
    - { label: Arena, href: "https://arena.tylerflar.com" }
    - { label: Arena code, href: "https://github.com/TylerFlar/jackdaw-arena" }
---

[Balatro](https://www.playbalatro.com/) is a poker roguelike. You build a deck and a set of jokers whose effects multiply together, and a run either snowballs into millions of chips or dies around ante 4. That makes it a good reinforcement learning testbed: long games, a reward that mostly comes at the end, a huge action space and a lot of randomness. The catch is that the game is a closed Lua program.

**Jackdaw** is a full reimplementation of the Balatro engine, exposed as a Gymnasium environment, plus a test harness that keeps checking it against the real game. I wrote it in Python in March 2026 and ported the engine to Rust in October, keeping the Python interface. [Jackdaw Arena](https://arena.tylerflar.com) is its hosted leaderboard, where agents are scored on seeds nobody has seen.

![Jackdaw](/assets/images/projects/jackdaw/cover.png)

## Why not drive the real game?

A community mod, BalatroBot, already opens a socket into a running copy of Balatro, so the obvious move is to let an agent play the real thing. I started there, and it doesn't work for training:

- **It crashes at machine speed.** With no human-length pause between actions, the game's animation-driven state machine ends up in states it never expects.
- **It's expensive to run in parallel.** N copies means N game processes and N sockets that can each break, against N engines in one process.
- **You can't see inside it.** There's no breakpoint inside a joker's trigger, no snapshot in the middle of scoring, and no way to ask what the shop would have been on another seed.

So Jackdaw reimplements the engine and keeps the live connection for checking, not training. The same environment runs on either backend by swapping one adapter:

```python
from jackdaw.env import BalatroEnvironment, DirectAdapter

env = BalatroEnvironment(adapter_factory=DirectAdapter)   # the simulator, in process
```

```python
from jackdaw.bridge import LiveAdapter, LiveBackend

env = BalatroEnvironment(                                  # the actual game
    adapter_factory=lambda: LiveAdapter(LiveBackend("127.0.0.1", 12346))
)
# Same observations and actions. The mask leaves out moves BalatroBot can't make.
```

## Matching the random numbers

Scoring is tedious but doable: a 14-step pipeline, 150 joker effects, enhancements, editions, seals and boss blinds. The randomness is harder. If the simulator's shop, boss and shuffle don't match the real game for the same seed, nothing downstream can be compared.

Balatro's RNG has three layers:

1. **`pseudohash`**, a custom string-to-float hash used only to start things off.
2. **`pseudoseed`**, about 65 named streams (`'boss'`, `'shuffle'` and so on), each a float advanced on its own, so a draw from one never changes another. Between steps the game rounds each stream to 13 decimals with `tonumber(string.format("%.13f", x))`, and that has to be copied exactly.
3. **LuaJIT's Tausworthe generator.** The stream value seeds `math.randomseed()` and one `math.random()` is drawn. Matching it meant porting LuaJIT's `lj_prng.c`, down to reinterpreting the bits of a double while seeding. The Rust version is checked against LuaJIT over a million draws.

Copying the rounding exactly turned out to include ties. The game ships with LuaJIT 2.0.5, whose `string.format` goes through the C runtime and rounds an exact decimal tie to even. My test fixtures came from LuaJIT 2.1, which rounds it away from zero. A tie comes up about once in $2^{39}$ draws, so no recorded run had hit one. The engine now rounds ties to even, and the expected answers were recomputed in the game's own `lua51.dll`:

```rust
// 2^-14 = 0.00006103515625 exactly: a tie at the 13th decimal; the game's LuaJIT 2.0.5
// prints `0.0000610351562` (G181).
assert_eq!(truncate13(1.0 / 16384.0), 0.000_061_035_156_2);
```

Some seeds the community calls "bugged" deal freak decks, like 52 copies of one card. The Python engine crashed on them, and an outside contributor, Kenneth Adams ([PR #5](https://github.com/TylerFlar/jackdaw-balatro/pull/5)), worked out why: those seeds divide by zero partway through the hash. Lua doesn't raise an error there. The result becomes NaN, survives the rounding step, and pins the generator to one value. The fix copies Lua's arithmetic instead of guarding against it, and the bugged seeds now deal the same decks as the real game.

## Checking against the real game

Unit tests can only check what I think the game does, and that was the weak point. So correctness is checked by running the same actions in the simulator and in the real game, then comparing the state:

```python
start_both(ls, seed="MY_SEED", delay=delay)   # the game and its shadow run
select_blind(ls, delay=delay)
add_both(ls, key="j_jolly")                   # inject the same joker into both
play_hand(ls, [0, 1, 2, 3, 4], delay=delay)   # same action, compared as it happens

diffs = compare_state(ls, label="after play with j_jolly")
```

Every answer from the game is compared with the simulator's view, field by field, and a difference names the field that drifted. 275 scenarios cover 150 jokers, 28 boss blinds, 24 tags, 22 tarots, 22 modifiers, 16 spectrals and 13 planets, and they run one at a time or by category:

```bash
jackdaw validate --category jokers
jackdaw validate --scenario joker_jolly
```

It found real bugs. Kenneth Adams ran the full suite against a real copy of the game ([PR #2](https://github.com/TylerFlar/jackdaw-balatro/pull/2)) and found 10 differences that every offline test had passed, because my picture of the game was consistent and wrong. In one, cards created during a run weren't registered as used, so later shops could offer them again. The worst kind was a stray RNG draw. It doesn't crash anything. The run just quietly stops being the run its seed describes, and only a diff against the real game catches it.

His fixes took the live suite from 266 to 270 of 275 scenarios, alongside the 1,480 offline tests at the time. A second, larger sweep from him ([PR #8](https://github.com/TylerFlar/jackdaw-balatro/pull/8)) replayed whole games in lockstep with the real one and landed 60 more fixes. Three `math.random()` calls in the original Lua skip the seeded streams entirely. They only choose between two versions of a few packs with the same cards, so they're documented as known differences.

## Porting it to Rust

By October the Python engine was the slow part. A play took 124 µs, and the Gym environment stepped about 5,400 times a second, which is slow for training runs of tens of millions of steps. So I ported the engine to Rust, with PyO3 bindings so the Python API stayed.

The port didn't treat the Python engine as the truth either. It started with an audit: a script lists every function, card-specific branch, RNG call site and joker context call in the game's Lua source as a row in a ledger, 1,921 rows across twelve files, and each row was reviewed against the source and tied to the Rust code and the test that covers it. The Python engine served as an oracle along the way. The Rust engine stepped next to it, and every disagreement was traced back to the Lua. Once the two agreed on every step, their answers were frozen into test fixtures and the Python engine was deleted.

The audit and the live runs below found 115 places where the old engine and the game disagreed, among them challenge rules, disabled boss blinds, Blueprint and Brainstorm's copy rules, card prices, and the order the game's own LuaJIT visits the poker hands in, which the source leaves unspecified. Right before the port, Agamjyot Singh Chadha's pull requests ([#26–30](https://github.com/TylerFlar/jackdaw-balatro/pulls?q=is%3Apr+author%3Agarfield-oo7)) added golden tests that pin the engine's runs, roughly doubled the Python engine's Gym throughput, and fixed observations that leaked face-down cards to the agent. His golden tests then ran against the Rust engine.

From the 0.2.0 changelog, with the Rust times on one core of a Ryzen 9 9950X3D:

| | Python (0.1) | Rust (0.2) |
|---|---:|---:|
| Start a run | 327 µs | 4 µs |
| Play a hand | 124 µs | 1.0 µs |
| Cash out and fill the shop | 326 µs | 2.2 µs |
| Copy a run | 563 µs | 0.3 µs |
| Gym environment | 5,400 steps/s | 180,000 steps/s |
| Vector environment, 8 threads | | 1.1M steps/s |

To check the port against the real game, I ran `jackdaw lockstep` on four copies of Balatro at once. It plays whole games, sends every move to the simulator first and then to the game, and compares every answer: 200 games and 11,446 steps with no difference left unexplained. The first runs found two engine bugs, both fixed. All 269 validation scenarios that BalatroBot can run pass. The other six need something it can't do, like skipping a blind for a tag that opens a pack.

The live game isn't quite vanilla either. BalatroBot runs on the Steamodded mod loader, which changes a few things, like when Marble Joker's Stone card joins the deck. The simulator follows vanilla, and a catalog of the known Steamodded and BalatroBot differences tells the lockstep which ones to expect.

## The RL interface

**Observations are entities.** A fixed 235-number vector holds the phase, ante, money, hand levels, blind and deck. Cards stay variable-length: hand cards, jokers, consumables, shop items and pack cards each get their own small encoding, and an empty set has shape (0, D). Set encoders, transformers and pointer networks can use the state without a fixed cap on jokers.

**Actions are factored.** There are 23 action types, each with an optional card selection and target, instead of one huge flat list. **Masks** say which actions, cards and targets are legal, so an agent never has to learn the rules by failing.

For off-the-shelf training, a Gymnasium wrapper flattens the legal actions into a `Discrete(500)` space with `action_masks()` for MaskablePPO, and a vector environment steps many of them at once in Rust. The bare environment returns no reward, so you can define your own, and the wrappers have optional shaping for when win or loss alone is too sparse to learn from.

## Training an agent

The repo's demo trains MaskablePPO for 30 million steps, which takes 40 minutes on a desktop CPU. Then every agent plays the same 1,000 runs, on seeds training never saw:

| Agent | Blinds beaten per run | Best ante | Wins |
|---|---:|---:|---:|
| MaskablePPO | 4.52 ± 0.13 | 8 | 0% |
| `smart_agent`, a hand-written heuristic | 5.38 ± 0.13 | 7 | 0% |
| Random legal moves | 0.001 | 1 | 0% |

The ± is one standard error. PPO goes from beating no blinds to about four and a half per run, but the hand-written agent is still ahead by almost a blind, and it also reads face-down cards, which an agent can't. Nothing wins a run yet. Learning hadn't stopped: the last 10 million steps still added 0.3 blinds per episode.

Two things went wrong on the way there:

- **Stalling was free.** With the default reward, the loss penalty is 0.2 and the discount factor 0.995, so putting off the end of a lost run saved $0.2 \times (1 - 0.995) = 0.001$ per step, exactly what a step cost. An early policy learned to sort and swap cards until the 2,000-step cap and beat no blinds. The demo drops the loss penalty and pays more for progress.
- **Free moves looped.** An earlier demo's greedy policy could get stuck. In some states its most likely action was a free move, like swapping two cards, and from the next state another one, so 48% of its greedy episodes ran into the step cap. The environments now allow at most 10 free moves in a row, and no episode reaches the cap.

## Jackdaw Arena

A result on your own machine is hard for anyone else to trust, because a local evaluation picks its own seeds in a simulator that can snapshot and look ahead. [Jackdaw Arena](https://arena.tylerflar.com) is a hosted benchmark that takes that freedom away:

- **Seeds nobody has seen.** The agent runs on your machine and plays over HTTPS, and the server holds the only copy of the game. Each episode gets a fresh 16-character seed from a cryptographic random generator, kept secret until the episode ends.
- **Every episode counts.** Each agent gets 500 episodes on a track and is ranked once all of them have ended. An abandoned episode keeps the score it had reached.
- **Verified and public.** When an episode ends, the server replays it and checks that it lands on the same state hash. Then the seed and the list of moves are published, so anyone can replay it with jackdaw.

![The Jackdaw Arena leaderboard on October 25, 2026: the smart baseline at 4.93 blinds per run, the PPO demo ranked first at 4.47, and the random baseline at 0.01, each over 500 runs.](/assets/images/projects/jackdaw/arena-leaderboard.png)

The score is the mean number of blinds beaten, with its 95% interval. The two house baselines are listed but not ranked. The client's `ArenaEnv` works like the local Gym environment, with the same observations, actions and masks, so a trained policy plays unchanged:

```python
from jackdaw_arena import ArenaEnv

env = ArenaEnv()
obs, info = env.reset()                    # the server picks the seed
done = False
while not done:
    action = model.predict(obs, action_masks=env.action_masks())[0]
    obs, reward, terminated, truncated, info = env.step(int(action))
    done = terminated or truncated
```

It runs serverless on AWS. CloudFront serves the React site from S3 and sends the API to a FastAPI app on Lambda, with the data in Aurora DSQL, and Terraform sets all of it up. The database keeps each episode's seed and the index of every move, which is enough to rebuild the game exactly. Each Lambda instance keeps recent games in memory, and one that hasn't seen an episode rebuilds it by replaying its moves, which the Rust engine makes cheap. So any instance can serve any step, and a retried request gets back the response it lost.

Every green push to `main` deploys: migrate the database, publish a new Lambda version and health-check it, move traffic to it, upload the site and smoke-test it, and move traffic back if anything fails. Results belong to an engine version. A jackdaw release that changes the rules starts a new season with an empty leaderboard. One that keeps them has to replay every ended episode of the season to the same final state before a deploy lets it take traffic.

## Where it stands

The engine, the environments, the live check and the arena all work. Training is the open part: the demo agent beats about four and a half blinds per run, the hand-written baseline still beats it, and no agent has won a run.

Jackdaw is an MIT-licensed package with hosted docs and prebuilt wheels for Linux, macOS and Windows. I've reviewed and merged 18 pull requests from six outside contributors, including both of Kenneth Adams's live-validation sweeps.
