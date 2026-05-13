'use strict';
const { SCENARIOS, createGameState, endTurn, evaluatePosition } = require('./game_core');
const { runAITurn: newAI }      = require('./ai');
const { runAITurn: baselineAI } = require('./baseline_ai');
const EVAL_SCENARIOS       = ['borderClash', 'siege', 'bridgeHead', 'gauntlet'];
const GAMES_PER_SCENARIO   = 50;
const MAX_GAME_TURNS       = 120;
const STALEMATE_TURNS      = 30;
const TIMEOUT_MATERIAL_EDGE = 1.15;
function runGame(ai0, ai1, scenarioId) {
    const state = createGameState(scenarioId);
    while (!state.gameOver) {
        if (state.totalTurns >= MAX_GAME_TURNS) {
            const ev = evaluatePosition(state);
            if      (ev.goldMaterial > ev.blueMaterial * TIMEOUT_MATERIAL_EDGE) state.gameWinner = 0;
            else if (ev.blueMaterial > ev.goldMaterial * TIMEOUT_MATERIAL_EDGE) state.gameWinner = 1;
            else                                                                  state.gameWinner = -1;
            state.gameOver = true;
            break;
        }
        if (state.turnsSinceLastCombat >= STALEMATE_TURNS) {
            state.gameOver  = true;
            state.gameWinner = -1;
            break;
        }
        const currentTeam = state.turn;
        const ai = currentTeam === 0 ? ai0 : ai1;
        ai(state, currentTeam);
        endTurn(state);
    }
    return state.gameWinner;
}
function evaluateAI() {
    let wins = 0, losses = 0, draws = 0, total = 0;
    for (const scenarioId of EVAL_SCENARIOS) {
        let scWins = 0, scLosses = 0, scDraws = 0;
        for (let i = 0; i < GAMES_PER_SCENARIO; i++) {
            const r1 = runGame(baselineAI, newAI, scenarioId);
            total++;
            if      (r1 === 1)  { wins++;   scWins++;   }
            else if (r1 === 0)  { losses++; scLosses++; }
            else                { draws++;  scDraws++;  }
            const r2 = runGame(newAI, baselineAI, scenarioId);
            total++;
            if      (r2 === 0)  { wins++;   scWins++;   }
            else if (r2 === 1)  { losses++; scLosses++; }
            else                { draws++;  scDraws++;  }
        }
        const scTotal = GAMES_PER_SCENARIO * 2;
        const scRate  = ((scWins + scDraws * 0.5) / scTotal * 100).toFixed(1);
        console.error(`  ${scenarioId.padEnd(16)} W:${scWins} L:${scLosses} D:${scDraws}  rate:${scRate}%`);
    }
    const winRate = (wins + draws * 0.5) / total * 100;
    return { wins, losses, draws, total, winRate };
}
const t0      = Date.now();
console.error(`Evaluating ai.js vs baseline_ai.js — ${EVAL_SCENARIOS.length * GAMES_PER_SCENARIO * 2} games`);
const result  = evaluateAI();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('---');
console.log(`win_rate:    ${result.winRate.toFixed(4)}`);
console.log(`wins:        ${result.wins}`);
console.log(`losses:      ${result.losses}`);
console.log(`draws:       ${result.draws}`);
console.log(`total_games: ${result.total}`);
console.log(`eval_time_s: ${elapsed}`);
