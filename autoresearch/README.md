# Grid Combat Autoresearch

This directory contains the implementation and documentation for an autonomous research system designed to improve the AI of the strategic game **Grid Combat**.

## Overview

The Autoresearch project implements a "Generalised Two-Loop MCTS Pipeline" for optimizing game heuristics. It leverages Large Language Models (LLMs) to propose and evaluate changes to the AI logic, iteratively improving its performance without human intervention.

For full details on the project architecture, empirical results, and findings, please refer to the **[Autoresearch section in the main README.md](../README.md#autoresearch--autonomous-ai-improvement)**.

```mermaid
flowchart TD
    subgraph L1["Loop 1 — Autoresearch (continuous)"]
        A([Start / Resume]) --> B[Read ai.js<br/>+ build prompt]
        B --> C["Inference<br/>Gemini 2.5 Flash-Lite<br/>or Qwen 2.5 3B"]
        C --> D{Parse<br/>response}
        D -- "no JS found" --> B
        D -- "JS extracted" --> E{Sanity<br/>check}
        E -- fail --> B
        E -- pass --> F[backup ai.js<br/>log change]
        F --> G["Evaluate<br/>400 games · Node.js"]
        G --> H{"win_rate<br/>returned?"}
        H -- crash --> I["Revert<br/>restore from backup<br/>store error tail"]
        I --> B
        H -- yes --> J{"win_rate<br/>> best?"}
        J -- no --> K["Discard<br/>restore from backup"]
        K --> B
        J -- yes --> L["Keep<br/>update best<br/>save zip to Drive"]
        L --> B
    end

    subgraph L2["Loop 2 — Directed Research (human-guided)"]
        M["Observe gameplay<br/>identify failure mode"]
        M --> N["Reason with game constants<br/>damage tables · code structure"]
        N --> O["Write targeted change<br/>to ai.js"]
        O --> P[log change<br/>save zip to Drive]
    end

    P -- "inject & resume" --> A
```

## Contents

-   **`GridCombat_Autoresearch.ipynb`**: The primary implementation of the research loop, designed to run in Google Colab. It handles the inference, evaluation, and persistence of the research experiments.
-   **`AUTORESEARCH.md`**: Documents the theoretical framework and the generalized two-loop architecture used by this system.
-   **`SPARSITY_RESOLUTION.md`**: Research document exploring the resolution of semantic sparsity in natural language processing through heuristic smoothing, manifolds, and Mixture of Experts (MoE) architectures.
-   **`ai.js`**: The current best version of the Grid Combat AI heuristic.
-   **`baseline_ai.js`**: The baseline AI used for comparison during experiments.
-   **`evaluate.js`**: The Node.js-based evaluation script that measures the win rate of the candidate AI against the baseline across 400 games.
-   **`game_core.js`**: The core game logic and constants shared by the AI and the evaluator.

## Note on Notebook Display

> [!NOTE]
> The `GridCombat_Autoresearch.ipynb` file may not be displayed correctly by the GitHub Markdown viewer due to its size and format. For an accurate view of the notebook's content, including all instructions and results, please use the **RAW** mode or open it directly in Google Colab.
