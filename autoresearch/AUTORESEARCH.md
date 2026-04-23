# GridCombat Autoresearch

An autonomous research instrument for iterative game AI improvement.
Optimised for Google Colab using Gemini 2.5 Flash-Lite (API) or local T4 GPU (Qwen 2.5 3B).

---

## What This Is

The architecture and procedure of this system are based on the [autoresearch](https://github.com/karpathy/autoresearch) project by Andrej Karpathy.

This notebook implements a closed-loop system that autonomously proposes, evaluates, and
commits modifications to a game AI heuristic (`ai.js`) for a turn-based strategy game.
A language model (Gemini 2.5 Flash-Lite via API or Qwen 2.5 3B locally) generates code changes;
a Node.js evaluator measures win rate across 200 games; the harness keeps or reverts each change
and loops. No human intervention is required between experiments.

The system is not a prototype. It is a complete, documented, reproducible research instrument.
Its contribution is the architecture, the integration of API-based reasoning to overcome local
hardware constraints, and the formal documentation of its findings.

---

## Empirical Result

| Metric | Value |
|---|---|
| Baseline win rate | 50.0% |
| Best achieved | 61.75% (Experiment #1) |
| Gain | +11.75 points |
| Evaluator | 200 games · 4 scenarios · noise ≈ 1.5 pts |
| Primary Model | Gemini 2.5 Flash-Lite (API) |
| Fallback Model | Qwen 2.5 3B · 4-bit NF4 (local) |
| Platform | Google Colab |
| Time per experiment | ~4–12 minutes |

---

## Architecture — Two Complementary Loops

The system implements two loops operating at different levels. They are not redundant.

### Loop 1 — Autoresearch (this notebook)

Runs continuously without human input. The model makes small, focused changes guided solely
by win rate. Its value is iteration rate and parametric optimisation — not algorithmic reasoning.

Capable of: parameter tuning, simple heuristic additions, emergent behavioural correction.

Not capable of: producing substantial algorithmic additions or reasoning from game state it cannot observe.

### Loop 2 — Directed Research (human-guided)

Human observation of gameplay identifies specific failure modes — for example, ranged units
advancing past the front line. These are reasoned about with reference to game constants,
damage tables, and code structure. The result is a targeted algorithmic addition that
Loop 1 cannot discover on its own.

Output is injected into `ai.js` manually, then Loop 1 resumes and fine-tunes within the
expanded capability.

**Injection protocol:**
```bash
# 1. Interrupt Cell 8
# 2. Edit ai.js directly
git add ai.js && git commit -m 'directed: description of change'
git bundle create "$BUNDLE_PATH" --all
# 3. Resume Cell 8
```

### Division of Labour

| Class of change | Loop 1 | Loop 2 |
|---|---|---|
| Parameter tuning | Yes | No |
| Emergent behavioural correction | Yes | No |
| Simple heuristic additions | Occasionally | Yes |
| Targeted fix for a known failure | No | Yes |
| Substantial algorithmic additions | No | Yes |

---

## Experiment Cycle (Loop 1)

```
Inference → Parse → Sanity check → Commit → Evaluate → Keep / Discard / Crash
    ↑                                                          |
    └──────────────────────── loop ────────────────────────────┘
```

On **crash**: the evaluator error tail is stored and prepended to the next prompt, so
the model sees what broke. The use of Gemini 2.5 Flash-Lite has significantly reduced
the frequency of model-induced crashes compared to smaller local models.

On **keep**: the git bundle is saved to Google Drive immediately. Session expiry
is non-destructive — the best `ai.js` and full commit history survive.

On **discard**: `git reset --hard` reverts to the prior best. The result is logged.

---

## Findings

### Established

The autoresearch loop functions correctly and reliably, especially when using Gemini 2.5 Flash-Lite. It handles inference, evaluation, and persistence without human intervention. Significant win rate improvements have been achieved, confirming the pipeline produces real results.

Earlier experiments with Qwen 2.5 3B demonstrated that while 3B-class models can achieve initial gains, they eventually hit a capacity ceiling in agentic use, sometimes fixating on proposals or producing syntax errors in long-form generation. The transition to Gemini 2.5 Flash-Lite successfully bypassed these limitations, allowing for sustained, autonomous exploration of the heuristic search space.

### The Boundary Condition

The autoresearch loop is a tool for capturing improvements through parameter and heuristic search. It is highly effective at optimising existing logic. Discovering entirely novel algorithms remains a task for the human-guided loop, which provides the structural baseline for the autonomous loop to refine.

### Open

Whether the win rate gains translate to harder human play is untested and remains the sole criterion of practical success for this project.

---

## Hardware and Platform Constraints

| Constraint | Value | Consequence |
|---|---|---|
| VRAM (T4) | 16 GB total | Limits local models to ~3B parameters at 4-bit NF4 |
| API Access | Gemini API | Enables higher reasoning capability without local memory limits |
| Inference time | ~4–12 min / experiment | ~60+ experiments per session |
| Session duration | ~1.5–12 hr | Manual restart required; Drive bundle preserves progress |
| Evaluator noise | ≈ 1.5 win rate points | Changes below this threshold are indistinguishable from noise |
| Storage | Google Drive bundle | Git history and best ai.js survive session expiry |

---

## Future Direction

1. **Human play testing.** Test the current best AI against human opponents to verify tactical difficulty improvements.
2. **Advanced Spatial Models.** Implementing complex spatial awareness heuristics for ranged units for the autoresearch loop to parameterise.
3. **Richer Context.** Feeding detailed game logs into the prompt to provide the model with a better understanding of game outcomes.

---

## Files

| File | Purpose |
|---|---|
| `GridCombat_Autoresearch.ipynb` | The notebook — all cells, all documentation |
| `ai.js` | The AI under research (modified by the loop) |
| `baseline_ai.js` | Fixed opponent AI (never modified) |
| `game_core.js` | Game engine (read-only) |
| `evaluate.js` | Evaluator — runs 200 games, prints win_rate |
| `results.tsv` | Experiment log — commit, win_rate, status, description |
| `repo.bundle` | Git bundle saved to Drive on every KEEP |

---

## Reproducing This System

Requirements: Google account with Colab access. Gemini API key (recommended) or T4 GPU runtime.

1. Open the notebook in Colab.
2. Run Cell 1 (Drive mount and paths).
3. Run Cell 2 (Node.js and Python packages).
4. Run Cell 3 (git identity).
5. Upload `ai.js`, `baseline_ai.js`, `game_core.js`, `evaluate.js` via the Colab file browser.
6. Run Cell 4 (repo setup) and Cell 5 (initial commit — first run only).
7. Run Cell 6 (local model) **OR** Cell 6B (Gemini API setup).
8. Run Cell 7 (orchestrator definitions).
9. Run Cell 8 (experiment loop).

On session restart: re-run Cells 1, 2, 3, 4, (6 or 6B), 7, 8. Skip Cell 5.

---

## On the Value of This Work

The contribution is the system itself: a reproducible, formally documented research instrument that demonstrates how API-based models can be integrated into an autonomous research harness to overcome local hardware limitations. It saves subsequent researchers the weeks required to rediscover these boundaries independently and provides a solid foundation for further AI development in strategy games.

This work is released to the community without reservation.

---

## Research Note — On Session Design

Each Colab session yields dozens of experiments. This is not a platform for sustained
convergence over weeks. It is a tool for capturing large, obvious improvements in deliberate,
hypothesis-driven sessions.

The question before each session: *what specific improvement do we predict exists, and what
result would refute that prediction?*

Unfocused continuation across many sessions produces noise rather than knowledge. Resources
are finite. Time is irreplaceable.

---

## References

- Karpathy, A. (2026) [AutoResearch](https://github.com/karpathy/autoresearch). GitHub repository.
