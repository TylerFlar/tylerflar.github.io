---
title: "Jackdaw"
summary: "A bit-exact Python reimplementation of Balatro, built as a reinforcement learning environment."
image: /assets/images/projects/jackdaw/cover.png
date: 2026-07-22
date_range: "Mar 2026 – Present"
---

[Balatro](https://www.playbalatro.com/) is a poker roguelike with a deceptively nasty decision problem underneath it: you build a deck and a set of jokers whose effects multiply into each other, and a run either compounds into millions of chips or dies quietly on ante 4. It is a great RL testbed—long horizon, sparse terminal reward, combinatorial action space, heavy stochasticity—but the game itself is a closed Lua application.

**Jackdaw** is my answer: a complete Python reimplementation of the Balatro engine, exposed as a Gymnasium environment, with a differential-testing harness that continuously checks the reimplementation against the retail game.

![Jackdaw](/assets/images/projects/jackdaw/cover.png)

---

## Why not just drive the real game?

The community mod **BalatroBot** already exposes a socket into a running copy of Balatro, so the obvious move is to skip the reimplementation entirely and let an agent play the real thing. I started there, and it doesn't hold up as a *training* substrate:

- **It races.** Feeding actions at machine speed—no human-scale delay between them—drives the game into states its animation-driven state machine never expects. It crashes.
- **It doesn't parallelize cheaply.** You can run N copies of Balatro, but that's N game processes, N mod sockets, and N sources of flake, against N Python objects in one process.
- **It's opaque.** You can't set a breakpoint inside a joker's trigger, snapshot state mid-scoring, or ask "what would the shop have been at a different seed?"

So Jackdaw reimplements the engine, and keeps the live connection—for *validation* instead of training. The same environment runs against either backend by swapping one adapter:

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

That symmetry is the whole design. It's what makes the correctness story below possible.

---

## The hard part is the RNG

Reimplementing scoring is tedious but tractable: a 14-phase pipeline, 150 joker effects, enhancements, editions, seals, boss blinds. Write it carefully and test it.

Reproducing *randomness* is a different kind of problem. If a simulator's shop, boss, and shuffle diverge from the real game's for the same seed, nothing downstream can be compared. Balatro's RNG turns out to be three layers deep:

**Layer 1 — `pseudohash`.** A custom string→float hash, iterating bytes in reverse through a nonlinear accumulator involving division, multiplication by $\pi$, and mod 1. Used only to initialize.

**Layer 2 — `pseudoseed`.** Every subsystem gets its own named stream (`'boss'`, `'shuffle'`, `'rarity1sho'`, …—about 65 of them), each a float advanced by a float-domain LCG. Streams are independent: advancing `'boss'` never perturbs `'shuffle'`. Crucially, the game rounds to 13 decimals between steps, which has to be replicated exactly:

```python
def _truncate_13(x: float) -> float:
    """Replicate Lua's tonumber(string.format("%.13f", x))."""
    return float(f"{x:.13f}")
```

**Layer 3 — LuaJIT's TW223.** The Layer-2 float is fed to `math.randomseed()` and one `math.random()` is drawn—so LuaJIT's combined Tausworthe generator is effectively used as a one-shot seed→output function. Matching it means porting `lj_prng.c` down to the IEEE 754 bit-pattern reinterpretation during seeding and the 10-step warm-up:

```python
d = d * _PI + _E
u0 = unpack_q(pack_d(d))[0]          # reinterpret the double's bits as uint64
if u0 < _MIN0:
    u0 += _MIN0
```

### The bugged-seed bug

The most instructive failure came from seeds the Balatro community calls **"bugged"**—seeds like `7LB2WVPK` that deal freak decks (52 identical cards). My port crashed on them with `ZeroDivisionError`.

The crash *was* the finding. Those seeds hit `num == 0` partway through the hash. Lua doesn't raise there: `x/0` is `inf`, `inf % 1` is `nan`, and the `nan` survives the `%.13f` round-trip—deterministically pinning `math.randomseed` to one constant. The freak decks aren't a glitch in the game so much as an emergent property of its float semantics, and my "safer" Python was the thing that was wrong. The fix is to emulate the arithmetic rather than defend against it:

```python
try:
    q = 1.1239285023 / num
except ZeroDivisionError:
    q = math.copysign(math.inf, num)
num = (q * byte * math.pi + math.pi * i) % 1
```

Verified against LuaJIT 2.1: `random(1, 52)` pins to 52, and erratic `7LB2WVPK` deals 52 identical 10-of-Spades—same as retail.

---

## Differential validation

Unit tests can only assert what I *believe* the game does, and my beliefs were the unreliable part. So correctness is checked differentially: run the same action sequence on the simulator and on live Balatro, then diff the resulting states.

```python
start_both(sim, live, seed="MY_SEED", delay=delay)   # identical runs, both backends
select_blind(sim, live, delay=delay)
add_both(sim, live, key="j_jolly")                   # inject the same joker
play_hand(sim, live, [0, 1, 2, 3, 4], delay=delay)   # same action

diffs = compare_state(sim, live, label="after play with j_jolly")
```

`compare_state` diffs phase, money, ante, chips, hands and discards left, hand cards, deck size, ordered jokers, and consumables. A failure names the exact field that drifted. About 250 scenarios cover the surface area—150 jokers, 28 boss blinds, 22 tarots, 20 modifiers, 18 spectrals, 13 planets—runnable individually or by category:

```bash
jackdaw validate --category jokers
jackdaw validate --scenario joker_jolly
```

This is where the project earned its keep. A single validation sweep surfaced **10 real divergences** that every offline test had passed, because they were all cases where my mental model was self-consistent and wrong:

- Created cards weren't being registered in `used_jokers` **at creation time**, so shop contents, pack contents, and created consumables failed to exclude their own key from later pools for the rest of the run. One generated fixture contained the same planet card twice.
- Idol / Mail / Ancient / Castle re-roll their targets at run start and at round **end**, not round start—and over every playing card, not just the deck.
- Purple Seal, Riff-raff, Cartomancer, and 8 Ball were creating hardcoded cards instead of drawing from the real pool resolver with their own RNG append keys.
- Descriptor-created cards must pass `soulable=False`; only pack-opened cards roll for The Soul, so consumable-triggered creates were silently consuming `soul_*` RNG stream draws and desyncing everything after them.

That last class is the reason this harness exists. An incorrectly consumed RNG draw produces *plausible* output forever after—no crash, no failing assertion, just a run that quietly stops being the run the seed describes. Only a diff against the real game catches it. The suite now sits at **270/275 live scenarios** passing alongside **1,480 offline tests**, with the remainder documented (3 are artifacts of the Steamodded loader reimplementing those spectrals; 2 share one unresolved pool divergence on a multi-ante path).

I also keep an honest list of what *can't* be reproduced. Three `math.random()` calls in the Lua source bypass the pseudoseed system entirely and read whatever LuaJIT's global state happens to be. They're often accidentally deterministic, but not guaranteed—so they're documented as a known deviation rather than papered over.

---

## The RL interface

With a trustworthy engine, the environment design gets to be about the learning problem.

**Observations are entity-based, not flattened.** A fixed 235-dim global vector carries phase, ante, money, hand levels, blind info, deck composition, and vouchers. Everything card-shaped stays variable-length:

| Entity | Dim | Encodes |
|---|---|---|
| `hand_card` | 15 | rank, suit, enhancement, edition, seal, position, chips, scoring flags |
| `joker` | 15 | center key, edition, cost, sell value, rarity, position, ability flags |
| `consumable` | 7 | center key, card set, cost, sell value, usability |
| `shop_item` | 9 | center key, card set, cost, edition, rarity, affordability |
| `pack_card` | 15 | same encoding as `hand_card` |

Empty types have shape `(0, D)` rather than being padded, which lets set encoders, transformers, and pointer networks consume the state without a max-jokers ceiling baked into the interface.

**Actions are factored.** 21 action types, each optionally carrying a card selection and an entity target—rather than one enormous flat enum:

```python
action = FactoredAction(action_type=0, card_target=(0, 2, 4), entity_target=None)
```

**Masks are first-class.** The environment reports which action types are legal, which cards are selectable, and per-type which entities are valid targets, so an agent never has to learn legality from scratch.

For off-the-shelf training there's a Gymnasium wrapper that flattens legal `FactoredAction`s into a `Discrete(500)` index space each step (card combinations sampled down to a 200-per-type budget when the combinatorics explode) and exposes `action_masks()` for MaskablePPO:

```bash
python scripts/train_ppo.py --total-timesteps 500000
tensorboard --logdir runs/balatro_ppo
```

The bare environment deliberately returns **no reward**—just `terminated`, `truncated`, and both the current and previous raw state, so you can define your own signal. The wrapper offers optional shaping for when sparse win/loss is too thin to learn from:

| Component | Trigger | Value |
|---|---|---|
| Step penalty | every step | −0.001 (−0.002 in shop) |
| Blind beaten | round advances | +0.15 × (ante / 8) |
| Boss blind beaten | ante advances | +0.10 × (ante / 8) |
| Efficient clear | hands left on clear | +0.01 × hands_left |
| Score progress | chips toward target | +0.02 × min(Δ / target, 1) |
| Win / loss | terminal | +0.5 / −0.2 |

Episode-level metrics (`balatro/mean_ante_reached`, `balatro/win_rate`, rounds beaten) log straight to tensorboard, since raw return says little about whether an agent is actually getting deeper into a run.

---

## Where it stands

The engine, environment, and validation harness are done and hold up under differential testing—which was always the part that had to be right first, since an agent trained against a subtly wrong simulator learns a subtly wrong game. Training is the open half: the MaskablePPO baseline and its metrics plumbing are in place, but the interesting result—an agent that reliably reasons about joker synergies well enough to close out ante 8—isn't there yet.

It's published as an MIT-licensed package with hosted docs, and has started taking outside contributions—including engine fixes found by pointing LLM agents at full runs and watching where the simulator and the real game part ways.

---

### Links

- Source: [github.com/TylerFlar/jackdaw-balatro](https://github.com/TylerFlar/jackdaw-balatro)
- Docs: [tylerflar.github.io/jackdaw-balatro](https://tylerflar.github.io/jackdaw-balatro/)
