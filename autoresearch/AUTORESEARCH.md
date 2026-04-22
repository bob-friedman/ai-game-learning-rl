# GridCombat Autoresearch

An autonomous research instrument for iterative game AI improvement on constrained hardware.
Built for Google Colab free tier (T4 GPU). Documented and released as open scientific work.

---

## What This Is

The architecture and procedure of this system are based on the [autoresearch](https://github.com/karpathy/autoresearch) project by Andrej Karpathy.

This notebook implements a closed-loop system that autonomously proposes, evaluates, and
commits modifications to a game AI heuristic (`ai.js`) for a turn-based strategy game.
A local language model generates code changes; a Node.js evaluator measures win rate across
200 games; the harness keeps or reverts each change and loops. No human intervention is
required between experiments.

The system is not a prototype. It is a complete, documented, reproducible research instrument
with a formal findings section. Its contribution is the architecture, the constraints it
navigates, and the boundary conditions it establishes — not the win rate number alone.

---

## Empirical Result

| Metric | Value |
|---|---|
| Baseline win rate | 50.0% |
| Best achieved | 61.75% (Experiment #1) |
| Gain | +11.75 points |
| Evaluator | 200 games · 4 scenarios · noise ≈ 1.5 pts |
| Model | Qwen2.5-3B-Instruct · 4-bit NF4 |
| Hardware | Google Colab T4 · 16 GB VRAM |
| Time per experiment | ~12 minutes |

---

## Architecture — Two Complementary Loops

The system implements two loops operating at different levels. They are not redundant.

### Loop 1 — Autoresearch (this notebook)

Runs continuously without human input. The model makes small, focused changes guided solely
by win rate. Its value is iteration rate and parametric optimisation — not algorithmic reasoning.

Capable of: parameter tuning, simple heuristic additions, emergent behavioural correction.

Not capable of: diagnosing systemic failures, producing substantial algorithmic additions,
or reasoning from game state it cannot observe.

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
the model sees what broke. This does not resolve the capacity constraint but closes an
information gap.

On **keep**: the git bundle is saved to Google Drive immediately. Session expiry
is non-destructive — the best `ai.js` and full commit history survive.

On **discard**: `git reset --hard` reverts to the prior best. The result is logged.

---

## Findings

### Established

The harness is correct and produces real results. It handles inference failures, syntax
errors, missing required functions, and session interruption without human intervention.
An 11.75-point gain in experiment #1 confirms the pipeline generates genuine improvement.

The Qwen2.5-3B-Instruct model at 4-bit NF4 quantization is the correct instrument for
this loop on a T4 GPU. Larger models exceed available VRAM or inference time budgets.

### Refuted — Null Hypothesis Confirmed

**A 3B parameter model is insufficient for sustained autonomous code modification.**

Seven consecutive crashes at the same file location with identical proposals confirm the
model fixates rather than explores and degrades at a predictable point in every generation.
This is not a problem of the prompt or configuration. It is a known boundary condition
of small models under iterative agentic load. The harness compensates for individual
failures but cannot compensate for a model that cannot genuinely vary its proposals.

The technical cause is well established: models below approximately 7B parameters lose
syntactic coherence under long-form code generation. The model maintains structural
integrity in the early portion of a file and degrades as the context fills — producing
a consistent crash at a predictable location rather than a random one.

### Open

Whether the 11.75-point win rate gain translates to harder human play is untested.
These are independent questions. An AI can improve against a fixed baseline while
remaining trivially exploitable by a human who plays differently. Both must be
evaluated separately.

---

## Hardware and Platform Constraints

| Constraint | Value | Consequence |
|---|---|---|
| T4 VRAM | 16 GB total | 7B model exhausts inference buffer; 3B is the ceiling at 4-bit NF4 |
| Inference time | ~12 min / experiment | ~60 experiments per session maximum |
| Session duration | Unpredictable; ~1.5 hr observed | Manual restart required; model re-downloads (~6 GB) each session |
| Evaluator noise | ≈ 1.5 win rate points | Changes below this threshold are indistinguishable from noise |
| Storage | Google Drive bundle | Git history and best ai.js survive session expiry; model does not |

---

## Future Direction

**A more capable small model.** As the Qwen family and others advance, a future 3B–4B
model with stronger instruction-following and long-form code generation capability may
resolve the fixation and degradation pattern without exceeding T4 constraints. The
architecture requires no change — only a `MODEL_ID` update in Cell 6. The harness,
evaluator, git strategy, and two-loop design remain valid at any model size.

This is the only direction identified as tractable within current constraints. It is
not actionable until a suitable model exists. Continuing sessions with the current model
beyond what the evidence already establishes is not a productive use of the resource.

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

Requirements: Google account with Colab access and GPU runtime (T4 free tier is sufficient).

1. Open the notebook in Colab and select a GPU runtime.
2. Run Cell 1 (Drive mount and paths).
3. Run Cell 2 (Node.js and Python packages).
4. Run Cell 3 (git identity).
5. Upload `ai.js`, `baseline_ai.js`, `game_core.js`, `evaluate.js` via the Colab file browser.
6. Run Cell 4 (repo setup) and Cell 5 (initial commit — first run only).
7. Run Cell 6 (model load — ~3–4 minutes).
8. Run Cell 7 (orchestrator definitions).
9. Run Cell 8 (experiment loop — runs until interrupted or session expires).

On session restart: re-run Cells 1, 2, 3, 4, 6, 7, 8. Skip Cell 5.

---

## On the Value of This Work

The win rate number is not the primary contribution. The contribution is the system itself:
a reproducible, formally documented research instrument that establishes what is and is not
achievable within these constraints. It saves subsequent researchers the weeks required to
rediscover these boundary conditions independently.

The null hypothesis is confirmed. The boundary is known. The architecture is sound. The next
advance requires only a more capable model at the same hardware budget — a condition that
will be met as the field progresses.

This work is released to the community without reservation.

---

## Research Note — On Session Design

Each Colab session yields approximately 60 experiments. This is not a platform for sustained
convergence over weeks. It is a tool for capturing large, obvious improvements in deliberate,
hypothesis-driven sessions.

The question before each session: *what specific improvement do we predict exists, and what
result would refute that prediction?*

Unfocused continuation across many sessions produces noise rather than knowledge. Resources
are finite. Time is irreplaceable.

---

## References

- Karpathy, A. (2024). [autoresearch](https://github.com/karpathy/autoresearch). GitHub repository.
