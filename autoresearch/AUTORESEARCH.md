# Autoresearch Framework
## A Generalised Two-Loop MCTS Pipeline for Autonomous Parameter and Heuristic Optimisation

---

## Overview

This framework describes a general-purpose autonomous research pipeline that combines LLM-driven search with human-guided structural reasoning to optimise complex systems where the objective is measurable but the mechanism is opaque. It was developed and validated empirically through the GridCombat game AI project, where it produced a 12.5 point win rate improvement in a single session and established a reproducible methodology for iterative improvement.

The core insight is that a human expert and an autonomous search operate in genuinely different dimensional spaces and are therefore complementary rather than competing. The human reasons from domain knowledge to identify structurally sound branches. The autonomous loop exhausts those branches parametrically. Neither can do the other's job.

---

## Architecture

### The Two Loops

```
┌─────────────────────────────────────────────────────┐
│                     LOOP 2 (Human)                  │
│                                                     │
│  Reason from domain knowledge → identify structural │
│  flaws → derive targeted fixes → inject as new      │
│  parameters with zero/neutral defaults → validate   │
│  committed results → re-root when plateau reached   │
└───────────────────┬─────────────────────────────────┘
                    │ re-root / inject
┌───────────────────▼─────────────────────────────────┐
│                     LOOP 1 (Autonomous)             │
│                                                     │
│  LLM proposes change → evaluator scores it →        │
│  keep if improvement, revert if not →               │
│  repeat until plateau                               │
└─────────────────────────────────────────────────────┘
```

### The MCTS Analogy

Loop 1 is structurally equivalent to Monte Carlo Tree Search. Each experiment is a simulation: the LLM proposes a move (a change to the candidate), the evaluator runs a playout (N evaluations), and the keep/revert decision propagates the result back. The experiment history fed into each prompt is the tree memory.

The root node is defined by the current baseline. All scores are measured relative to this root. When Loop 1 finds a new best it has discovered a productive child node. When it plateaus it has exhausted the subtree reachable from the current root. Re-rooting promotes the best child to the new root and restarts the search from a clean history.

This makes the pipeline an **anytime algorithm**: at any point the current candidate is the best known solution. Loop 2 validates and re-roots. Loop 1 continues searching from the new node indefinitely. The score ceiling is not fixed — it rises with each re-rooting cycle.

---

## Components

### Invariant Core — Do Not Modify Between Domains

These components are domain-agnostic and should remain unchanged when adapting the framework to a new problem.

**`autoresearch.py` — the main loop:**

```python
import os, subprocess, hashlib, time
from llm_client import propose_change      # domain-agnostic LLM call
from evaluator import evaluate             # DOMAIN-SPECIFIC: replace this
from history import read_history, append_history, best_score_from_history
from archive import save_archive, load_archive

RESULTS_FILE   = 'results.tsv'
CANDIDATE_FILE = 'candidate.js'            # DOMAIN-SPECIFIC: replace with your representation file
BASELINE_FILE  = 'baseline.js'            # DOMAIN-SPECIFIC: replace with your baseline file
PLATEAU_THRESHOLD = 6                     # experiments at same score before re-root is warranted

def run():
    load_archive()
    best = best_score_from_history()
    experiment = 0

    while True:
        experiment += 1
        print(f'Experiment #{experiment} | Best: {best:.4f}')

        candidate_code = open(CANDIDATE_FILE).read()
        history        = open(RESULTS_FILE).read()
        patch          = propose_change(candidate_code, history, experiment, best)

        if patch is None:
            time.sleep(60); continue       # quota exhausted — wait and retry

        backup = open(CANDIDATE_FILE).read()
        apply_patch(patch, CANDIDATE_FILE)

        score = evaluate()                 # DOMAIN-SPECIFIC: returns scalar, higher = better
        delta = score - best

        if delta > 0:
            best = score
            status = 'KEEP'
        else:
            open(CANDIDATE_FILE, 'w').write(backup)   # revert
            status = 'DISCARD'

        append_history(experiment, score, status, patch.description)
        save_archive()
        print(f'  {status} — score: {score:.4f} ({delta:+.4f})')
```

**`history.py` — results tracking:**

```python
HEADER = 'experiment\tscore\teval_time_s\tstatus\tdescription\n'

def best_score_from_history():
    try:
        lines = open(RESULTS_FILE).read().strip().splitlines()
        scores = [float(l.split('\t')[1]) for l in lines[1:] if l.split('\t')[3] == 'KEEP']
        return max(scores) if scores else 50.0
    except FileNotFoundError:
        return 50.0                        # clean start if file absent or deleted

def append_history(experiment, score, status, description):
    if not os.path.exists(RESULTS_FILE):
        open(RESULTS_FILE, 'w').write(HEADER)
    with open(RESULTS_FILE, 'a') as f:
        f.write(f'{experiment}\t{score:.4f}\t0\t{status}\t{description}\n')
```

**`archive.py` — persistence:**

```python
import zipfile

ARCHIVE_PATH   = '/path/to/drive/repo.zip'            # DOMAIN-SPECIFIC: set your archive path
WORK_DIR       = '/path/to/workdir'                   # DOMAIN-SPECIFIC: set your working directory
ARCHIVE_FILES  = ['candidate.js', 'baseline.js',      # DOMAIN-SPECIFIC: list your files
                  'results.tsv', 'changes.log']

def save_archive():
    with zipfile.ZipFile(ARCHIVE_PATH, 'w') as z:
        for f in ARCHIVE_FILES:
            z.write(os.path.join(WORK_DIR, f), f)

def load_archive():
    with zipfile.ZipFile(ARCHIVE_PATH, 'r') as z:
        z.extractall(WORK_DIR)
```

---

### Domain Adapter — Replace These for Each New Problem

These are the only components that change between domains. Each has a clear contract.

#### 1. The Evaluator

**Contract:** Takes no arguments (reads `CANDIDATE_FILE` and `BASELINE_FILE` from disk), returns a scalar score where higher is better, baseline = 50.0.

**GridCombat implementation:**
```python
def evaluate():
    result = subprocess.run(
        ['node', 'evaluate.js'],
        capture_output=True, text=True, timeout=EVAL_TIMEOUT_S
    )
    for line in result.stdout.splitlines():
        if line.startswith('win_rate:'):
            return float(line.split()[1])
    raise RuntimeError('Evaluator produced no score')
```

**For other domains, replace with:**
- Drug candidate: binding affinity simulation (e.g. AutoDock Vina score)
- Compiler flags: benchmark suite runtime (e.g. SPEC CPU score, inverted)
- Neural architecture: validation accuracy on held-out set
- Materials design: DFT energy minimisation output
- Robot control policy: simulation reward over N episodes

The evaluator is the only true domain dependency. If you can express your objective as a scalar that the evaluator returns in finite time, the framework works.

#### 2. The Representation File

**Contract:** A text file the LLM can propose SEARCH/REPLACE patches against. Should be human-readable. Parameters to tune should be clearly named constants at the top of the file.

**GridCombat implementation:** `ai.js` — a JavaScript heuristic scoring function with named constants:
```javascript
const UNIT_THREAT_WEIGHT = { infantry:1, mech:2, tank:4, heavy:6, artillery:0, rocket:0 };
const UNIT_CAUTION       = { infantry:5, mech:4, tank:2, heavy:1, artillery:3, rocket:3 };
const SPATIAL_SUPPORT_WEIGHT = 0;   // Loop 1 tuning target — increase to activate
```

**Design principles for any domain:**
- Named constants at the top with comments marking them as tuning targets
- Zero/neutral defaults for new parameters so the baseline is untouched until Loop 1 finds a nonzero value
- Clear separation between structural logic (Loop 2 territory) and tuneable weights (Loop 1 territory)

#### 3. The Domain Constants Summary

**Contract:** A multi-line string injected into every LLM prompt describing the domain rules, unit/component properties, and known tuning targets. This is the primary mechanism by which Loop 2 human knowledge is communicated to Loop 1.

**GridCombat implementation:**
```python
DOMAIN_CONSTANTS_SUMMARY = """
Unit stats: infantry(hp:10,move:3,capture:true), mech(hp:12,move:2,capture:true),
tank(hp:10,move:2), heavy(hp:14,move:1), artillery(hp:8,move:2,range:3-4),
rocket(hp:10,move:2,range:3-5). Ranged units cannot counter-attack.

Combat: finalDamage = floor(baseDamage * (attacker.hp/maxHp) * terrainDef * (1-homeBonus))

Known tuning targets:
  UNIT_THREAT_WEIGHT : controls danger map weighting per unit type
  UNIT_CAUTION       : controls risk tolerance per unit type
  intercept threshold: 6  (Manhattan distance to trigger HQ defender intercept)
  intercept weight   : 100 (score penalty per tile from intercepting unit to threat)
"""
```

**For other domains, replace with:**
- The rules and constraints of the system
- The measurable properties of components (equivalent to unit stats)
- The named constants that are known tuning candidates
- Any domain-specific relationships that affect the objective

#### 4. The Good Targets List

**Contract:** A bulleted list injected into the LLM prompt directing it toward the most productive search directions. Updated by Loop 2 as new parameters are introduced or old ones are exhausted.

**GridCombat implementation:**
```python
GOOD_TARGETS = """
Good targets:
- Adjusting UNIT_THREAT_WEIGHT values for specific unit types
- Adjusting UNIT_CAUTION values for specific unit types
- Tweaking intercept threshold (currently 6) and weight (currently 100)
- Small scoped heuristic additions (e.g. retreating when HP is low)

Do NOT target:
- Parameters already exhausted in the experiment history
- Structural changes to the algorithm (those are Loop 2 territory)
"""
```

---

### The LLM Prompt — Full Template

```python
def build_prompt(candidate_code, history, experiment_num, best_score):
    return f"""You are an autonomous researcher. Your job is to improve the system
defined in candidate.js by making small, focused changes guided by the score signal.

## Current experiment: #{experiment_num}
## Best score so far: {best_score:.4f}  (baseline = 50.0, higher is better)
## Evaluation: {EVAL_DESCRIPTION}        # DOMAIN-SPECIFIC: describe your evaluator
{DOMAIN_CONSTANTS_SUMMARY}

## Experiment history (use this to avoid repeating failures):
{history}

## Current candidate.js — the ONLY file you may modify:
```
{candidate_code}
```

## Your task
Make ONE focused change to improve the score.

{GOOD_TARGETS}

## CRITICAL Directives:
1. DO NOT suggest a change if a similar change recently failed in the experiment history.
2. DO NOT call functions that do not already exist in the provided code.
3. Output ONLY a SEARCH/REPLACE block in this exact format:

<<<<SEARCH
[exact text to find]
====
[replacement text]
>>>>REPLACE

Then one line: description of what you changed and why.
"""
```

---

## Operational Protocols

### Loop 1 — Running the Autonomous Search

1. Ensure `candidate.js` and `baseline.js` are identical at the start of a new session (or after re-rooting)
2. Delete `results.tsv` to reset history (do not overwrite — deletion is simpler and sufficient)
3. Run `autoresearch.py` — the loop runs indefinitely until interrupted or quota is exhausted
4. Monitor for the plateau signal: 6 or more consecutive experiments at the same score

### Loop 2 — Human Structural Intervention

Triggered by: plateau signal, human identification of a domain flaw, or a null result from a structural test.

**Before injecting a new parameter:**
1. Reason from domain knowledge to identify the structural gap — not from the score signal
2. Verify the proposed fix does not overlap with emergent behaviour already present in the system (the most common cause of null results)
3. Ask: how often does the vulnerable condition actually occur during evaluation? If rarely, no weight value produces a detectable signal
4. Implement with a zero/neutral default so the baseline is completely untouched
5. Update `DOMAIN_CONSTANTS_SUMMARY` and `GOOD_TARGETS` to name the new parameter explicitly

**Injecting the change:**
```bash
# 1. Edit candidate.js directly with the structural change
# 2. Log it
echo 'directed: description of change' >> changes.log
# 3. Save archive
# 4. Resume Loop 1
```

### Re-Rooting Protocol

Triggered by: plateau signal (6+ consecutive experiments at same score).

**Mandatory Loop 2 validation before re-rooting:**
1. Human review of all committed diffs — confirm each is structurally coherent, not a numerical accident
2. Manual testing against a human opponent or domain expert — confirm qualitative improvement
3. Sanity check for evaluator overfitting — does the improvement generalise beyond the test set?

**The re-rooting operation:**
```bash
cp candidate.js baseline.js     # promote validated best to new root
rm results.tsv                  # delete history — deletion is sufficient, no marker needed
# update best_score = 50.0 in session state
# save archive
# resume Loop 1
```

Resetting to 50.0 is not losing progress. The new `baseline.js` embodies all prior gains. 50.0 now means parity with a stronger baseline than before. Any improvement found above 50.0 in the new session is additive depth on the search tree.

---

## Key Design Principles

### Zero-Default Parameters
New parameters introduced by Loop 2 must default to zero or neutral values. This guarantees the baseline is mathematically identical before and after injection. Loop 1 then searches for nonzero values from a clean 50.0 starting point. Violation of this principle invalidates the score signal.

### Separation of Concerns
Loop 1 owns: parameter values, weight magnitudes, threshold values.
Loop 2 owns: algorithm structure, new mechanisms, validation, re-rooting.
Neither loop should do the other's job. The LLM cannot reliably discover novel algorithms. The human cannot efficiently search a 10-dimensional parameter space.

### The Pre-Test Diagnostic
Before investing Loop 1 sessions in a new structural parameter, estimate how often the condition it targets actually occurs during evaluation. A parameter that only fires in rare scenarios cannot produce a detectable win rate signal regardless of its value. One targeted diagnostic counter during a single evaluation run is sufficient to answer this question before committing to a full search.

### Emergent Property Audit
Before proposing a new mechanism, audit the existing system for emergent behaviour that may already address the same gap through a different pathway. The most common cause of null results is a proposed fix that the system already handles implicitly. In the GridCombat case, the existing cohesion bonus already produced implicit ranged unit screening, making an explicit screening parameter redundant.

### Honest Baselines
`baseline.js` must always represent the best validated solution from the prior session, not an arbitrary fixed opponent. If the baseline is weaker than the current candidate for reasons unrelated to the current search, the score signal is inflated and Loop 1 will find spurious improvements. Re-rooting maintains baseline honesty across sessions.

---

## Plateau and Score Reference

| Signal | Meaning | Action |
|---|---|---|
| Score rising | Productive subtree | Keep running Loop 1 |
| Plateau (6+ experiments) | Subtree exhausted | Trigger Loop 2 validation and re-root |
| Regression then recovery | Correct revert behaviour | No action needed |
| Null result from structural test | Emergent overlap or rare condition | Discard patch, document finding, continue |
| Loop 2 structural fix ready | New branch to explore | Inject with zero default, update prompt, re-root |

---

## Adapting to a New Domain — Checklist

- [ ] Replace `evaluate()` with a function returning a scalar score for your domain
- [ ] Replace `candidate.js` with your representation file (any text file the LLM can patch)
- [ ] Replace `baseline.js` with the initial unmodified version of that file
- [ ] Write `DOMAIN_CONSTANTS_SUMMARY` describing your system's rules and component properties
- [ ] Write initial `GOOD_TARGETS` listing the first known tuning candidates
- [ ] Set `EVAL_DESCRIPTION` to describe what the evaluator measures and how many trials it runs
- [ ] Set `ARCHIVE_PATH` and `WORK_DIR` to your storage locations
- [ ] Confirm zero-default for any new parameters before first run
- [ ] Delete `results.tsv` before first run

Everything else — the LLM call, the keep/revert logic, the history mechanism, the re-rooting protocol, the two-loop relationship — is unchanged.

---

## Theoretical Note

This pipeline is an anytime algorithm in the computer science sense: it can be interrupted at any point and the current `candidate.js` is the best known solution. Each re-rooting cycle adds one layer of depth to the MCTS search tree. The score ceiling is not predetermined — it rises with each cycle as the baseline is promoted and the search continues from a stronger root.

The human Loop 2 operator functions as a higher-dimensional navigator. The win rate is a low-dimensional, uninterpretable signal that cannot distinguish between mechanisms. The human reasons from domain knowledge — mechanics, constraints, causal relationships — to identify structural improvements that the evaluator cannot discover by search alone. These improvements are projected into the search space as new parameters with zero defaults, where Loop 1 can detect and amplify them through parametric tuning.

The result is not a system that approaches a theoretically perfect solution — in most domains of practical interest that ceiling is computationally intractable. It is a system that approaches the limit of what is exploitable by a domain-competent opponent on the available evaluation set. For most practical applications that is the correct and sufficient target.

Nature does not make all its secrets easily discovered. But a two-loop MCTS with a human reasoning in the higher dimensions is a principled instrument for extracting them one validated branch at a time.
