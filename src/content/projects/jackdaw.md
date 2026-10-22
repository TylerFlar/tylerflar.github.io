---
title: "Jackdaw"
summary: "A Python copy of the game Balatro that matches the real game exactly, built as a reinforcement learning environment."
image: /assets/images/projects/jackdaw/cover.png
date: 2026-03-15
cv: project/jackdaw
category: software
role: "Author and maintainer of an open-source package with outside contributors"
links:
    - { label: Code, href: "https://github.com/TylerFlar/jackdaw-balatro" }
    - { label: Docs, href: "https://tylerflar.github.io/jackdaw-balatro/" }
---

[Balatro](https://www.playbalatro.com/) is a poker roguelike. You build a deck and a set of jokers whose effects multiply together, and a run either snowballs into millions of chips or dies around ante 4. That makes it a good reinforcement learning testbed: long games, a reward that mostly comes at the end, a huge action space and a lot of randomness. The catch is that the game is a closed Lua program.

**Jackdaw** is a full Python reimplementation of the Balatro engine, exposed as a Gymnasium environment, plus a test harness that keeps checking it against the real game.

![Jackdaw](/assets/images/projects/jackdaw/cover.png)

## Why not drive the real game?

A community mod, BalatroBot, already opens a socket into a running copy of Balatro, so the obvious move is to let an agent play the real thing. I started there, and it doesn't work for training:

- **It crashes at machine speed.** With no human-length pause between actions, the game's animation-driven state machine ends up in states it never expects.
- **It's expensive to run in parallel.** N copies means N game processes and N sockets that can each break, against N Python objects in one process.
- **You can't see inside it.** There's no breakpoint inside a joker's trigger, no snapshot in the middle of scoring, and no way to ask what the shop would have been on another seed.

So Jackdaw reimplements the engine and keeps the live connection for checking, not training. The same environment runs on either backend by swapping one adapter:

```python
from jackdaw.env import BalatroEnvironment, DirectAdapter

env = BalatroEnvironment(adapter_factory=DirectAdapter)   # in-process simulator
```

```python
from jackdaw.bridge import LiveBackend, BridgeAdapter

env = BalatroEnvironment(                                  # the actual game
    adapter_factory=lambda: BridgeAdapter(LiveBackend("127.0.0.1", 12346))
)
# Same observations, same masks, same actions.
```

## Matching the random numbers

Scoring is tedious but doable: a 14-step pipeline, 150 joker effects, enhancements, editions, seals and boss blinds. The randomness is harder. If the simulator's shop, boss and shuffle don't match the real game for the same seed, nothing downstream can be compared.

Balatro's RNG has three layers:

1. **`pseudohash`**, a custom string-to-float hash used only to start things off.
2. **`pseudoseed`**, about 65 named streams (`'boss'`, `'shuffle'` and so on), each a float advanced on its own, so a draw from one never changes another. The game rounds to 13 decimals between steps, and that has to be copied exactly:

```python
def _truncate_13(x: float) -> float:
    """Replicate Lua's tonumber(string.format("%.13f", x))."""
    return float(f"{x:.13f}")
```

3. **LuaJIT's Tausworthe generator.** The stream value seeds `math.randomseed()` and one `math.random()` is drawn. Matching it meant porting LuaJIT's `lj_prng.c`, down to reinterpreting the bits of a double while seeding.

Some seeds the community calls "bugged" deal freak decks, like 52 copies of one card. My port crashed on them, and an outside contributor, Kenneth Adams ([PR #5](https://github.com/TylerFlar/jackdaw-balatro/pull/5)), worked out why: those seeds divide by zero partway through the hash. Lua doesn't raise an error there. The result becomes NaN, survives the rounding step, and pins the generator to one value. The fix copies Lua's arithmetic instead of guarding against it, and the bugged seeds now deal the same decks as the real game.

## Checking against the real game

Unit tests can only check what I think the game does, and that was the weak point. So correctness is checked by running the same actions in the simulator and in the real game, then comparing the state:

```python
start_both(sim, live, seed="MY_SEED", delay=delay)   # identical runs, both backends
select_blind(sim, live, delay=delay)
add_both(sim, live, key="j_jolly")                   # inject the same joker
play_hand(sim, live, [0, 1, 2, 3, 4], delay=delay)   # same action

diffs = compare_state(sim, live, label="after play with j_jolly")
```

`compare_state` checks the phase, money, ante, chips, hands and discards left, the cards in hand, deck size, jokers in order, and consumables, and names the field that drifted. 275 scenarios cover 150 jokers, 28 boss blinds, 24 tags, 22 tarots, 22 modifiers, 16 spectrals and 13 planets, and they run one at a time or by category:

```bash
jackdaw validate --category jokers
jackdaw validate --scenario joker_jolly
```

It found real bugs. Kenneth Adams ran the full suite against a real copy of the game ([PR #2](https://github.com/TylerFlar/jackdaw-balatro/pull/2)) and found 10 differences that every offline test had passed, because my picture of the game was consistent and wrong. In one, cards created during a run weren't registered as used, so later shops could offer them again. The worst kind was a stray RNG draw. It doesn't crash anything. The run just quietly stops being the run its seed describes, and only a diff against the real game catches it.

His fixes took the live suite from 266 to 270 of 275 scenarios, alongside the 1,480 offline tests at the time. A second, larger sweep from him ([PR #8](https://github.com/TylerFlar/jackdaw-balatro/pull/8)) replayed whole games in lockstep with the real one and landed 60 more fixes. Three `math.random()` calls in the original Lua skip the seeded streams entirely, so those are documented as known differences.

## The RL interface

**Observations are entities.** A fixed 235-number vector holds the phase, ante, money, hand levels, blind and deck. Cards stay variable-length: hand cards, jokers, consumables, shop items and pack cards each get their own small encoding, and an empty set has shape (0, D). Set encoders, transformers and pointer networks can use the state without a fixed cap on jokers.

**Actions are factored.** There are 21 action types, each with an optional card selection and target, instead of one huge flat list. **Masks** say which actions, cards and targets are legal, so an agent never has to learn the rules by failing.

For off-the-shelf training, a Gymnasium wrapper flattens the legal actions into a `Discrete(500)` space with `action_masks()` for MaskablePPO. The bare environment returns no reward, so you can define your own, and the wrapper has optional shaping for when win or loss alone is too sparse to learn from.

## Where it stands

The engine, the environment and the validation harness are done and hold up against the real game. Training is the open part: the MaskablePPO baseline and its metrics run, but an agent that plays well enough to win reliably isn't there yet.

It's published as an MIT-licensed package with hosted docs. I've reviewed and merged 13 pull requests from five outside contributors, including both live-validation sweeps.
