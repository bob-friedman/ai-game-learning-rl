'use strict';
const {
    UNITS, TERRAIN, UNIT_VALUE,
    getUnitAt, getStructureAt, getHomeTerritoryBonus,
    getMovableTiles, getDistToHQ, getAttackTargets,
    resolveCombat, queueCapture, evaluatePosition
} = require('./game_core');
const UNIT_THREAT_WEIGHT = { infantry:1, mech:2, tank:4, heavy:6, artillery:0, rocket:0 };
const UNIT_CAUTION       = { infantry:5, mech:4, tank:2, heavy:1, artillery:3, rocket:3 };
function calculateHQVisionRadius(state) {
    const g = state.structures.find(s => s.type === 'hq' && s.team === 0);
    const b = state.structures.find(s => s.type === 'hq' && s.team === 1);
    if (!g || !b) return Math.max(4, Math.floor(Math.max(state.boardWidth, state.boardHeight) * 0.25));
    const hqDist = Math.abs(g.x - b.x) + Math.abs(g.y - b.y);
    return Math.max(4, Math.min(10, Math.floor(hqDist * 0.35)));
}
function detectHQThreats(state, hq, enemyTeam) {
    const radius = calculateHQVisionRadius(state);
    const threats = [];
    state.units.forEach(u => {
        if (u.team === enemyTeam) {
            const dist = Math.abs(u.x - hq.x) + Math.abs(u.y - hq.y);
            if (dist <= radius) threats.push({ unit: u, distance: dist, canCapture: UNITS[u.type].capture });
        }
    });
    return threats;
}
function calculateTimeToReach(state, fromX, fromY, toX, toY, moveSpeed) {
    const distMap = getDistToHQ(state, toX, toY);
    const pathDist = distMap[fromY][fromX];
    return pathDist === 999 ? 999 : Math.ceil(pathDist / moveSpeed);
}
function shouldDefend(state, aiTeam) {
    const enemy = 1 - aiTeam;
    const aiHQ  = state.structures.find(s => s.type === 'hq' && s.team === aiTeam);
    const enHQ  = state.structures.find(s => s.type === 'hq' && s.team === enemy);
    if (!aiHQ || !enHQ) { state.aiDefendLatch[aiTeam] = false; return false; }
    const threats = detectHQThreats(state, aiHQ, enemy).filter(t => t.canCapture);
    if (threats.length === 0) { state.aiDefendLatch[aiTeam] = false; return false; }
    if (state.aiDefendLatch[aiTeam]) return true;
    const closest = threats.reduce((m, t) => t.distance < m.distance ? t : m);
    const turnsToMyHQ = calculateTimeToReach(
        state, closest.unit.x, closest.unit.y, aiHQ.x, aiHQ.y, UNITS[closest.unit.type].move);
    const myCaps = state.units.filter(u => u.team === aiTeam && UNITS[u.type].capture);
    if (myCaps.length === 0) { state.aiDefendLatch[aiTeam] = true; return true; }
    let minTurnsToEnemyHQ = 999;
    myCaps.forEach(u => {
        const t = calculateTimeToReach(state, u.x, u.y, enHQ.x, enHQ.y, UNITS[u.type].move);
        if (t < minTurnsToEnemyHQ) minTurnsToEnemyHQ = t;
    });
    if (turnsToMyHQ < minTurnsToEnemyHQ) { state.aiDefendLatch[aiTeam] = true; return true; }
    return false;
}
function buildDangerMap(state, enemyTeam) {
    const H = state.map.length, W = state.map[0].length;
    const danger = Array.from({ length: H }, () => new Float32Array(W));
    state.units.filter(u => u.team === enemyTeam).forEach(enemy => {
        const weight = UNIT_THREAT_WEIGHT[enemy.type] ?? 1;
        if (weight === 0) return;
        const moves = getMovableTiles(state, enemy, false);
        moves.push({ x: enemy.x, y: enemy.y });
        const ud = UNITS[enemy.type];
        const minR = ud.ranged ? ud.minRange : 1;
        const maxR = ud.ranged ? ud.maxRange : 1;
        moves.forEach(mt => {
            danger[mt.y][mt.x] += weight * 0.5;
            const isCurrentPos = (mt.x === enemy.x && mt.y === enemy.y);
            if (ud.ranged && !isCurrentPos) return;
            for (let dy = -maxR; dy <= maxR; dy++) {
                for (let dx = -maxR; dx <= maxR; dx++) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minR || dist > maxR) continue;
                    const tx = mt.x + dx, ty = mt.y + dy;
                    if (tx >= 0 && tx < W && ty >= 0 && ty < H) danger[ty][tx] += weight;
                }
            }
        });
    });
    return danger;
}
function buildSafetyMap(state, enemyTeam) {
    const H = state.map.length, W = state.map[0].length;
    const covered = Array.from({ length: H }, () => new Uint8Array(W));
    state.units.filter(u => u.team === enemyTeam).forEach(enemy => {
        const ud = UNITS[enemy.type];
        const moves = getMovableTiles(state, enemy, false);
        moves.push({ x: enemy.x, y: enemy.y });
        const minR = ud.ranged ? ud.minRange : 1;
        const maxR = ud.ranged ? ud.maxRange : 1;
        moves.forEach(mt => {
            const isCurrentPos = (mt.x === enemy.x && mt.y === enemy.y);
            if (ud.ranged && !isCurrentPos) return;
            for (let dy = -maxR; dy <= maxR; dy++) {
                for (let dx = -maxR; dx <= maxR; dx++) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minR || dist > maxR) continue;
                    const tx = mt.x + dx, ty = mt.y + dy;
                    if (tx >= 0 && tx < W && ty >= 0 && ty < H) covered[ty][tx] = 1;
                }
            }
        });
    });
    const safety = Array.from({ length: H }, () => new Float32Array(W));
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
            if (!covered[y][x]) safety[y][x] = 10 + TERRAIN[state.map[y][x].type].def * 10;
    return safety;
}
function countAdjacentTeamUnits(state, x, y, team) {
    let count = 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const u = getUnitAt(state, x + dx, y + dy);
        if (u && u.team === team) count++;
    }
    return count;
}
function calculateAttackValue(state, attacker, target, breachMultiplier = 1.0) {
    const atkData = UNITS[attacker.type], defData = UNITS[target.type];
    const struct = getStructureAt(state, target.x, target.y);
    if (struct && struct.type === 'hq' && struct.team === attacker.team) return 5000;
    const baseDamage = atkData.damage[target.type] || 0;
    const hpRatio    = attacker.hp / attacker.maxHp;
    const defMod     = TERRAIN[state.map[target.y][target.x].type].def;
    const damage     = Math.ceil(baseDamage * hpRatio * defMod);
    const targetVal  = UNIT_VALUE[target.type] || 20;
    let score = (damage / target.maxHp) * targetVal;
    if (defData.capture) {
        const ownHQ = state.structures.find(s => s.type === 'hq' && s.team === attacker.team);
        if (ownHQ) {
            const d = Math.abs(target.x - ownHQ.x) + Math.abs(target.y - ownHQ.y);
            if (d <= 4) score += (5 - d) * 100;
        }
    }
    if (damage >= target.hp) {
        score += targetVal * 0.5;
        if (defData.capture) score += 50;
        if (defData.ranged)  score += 40;
    }
    if (!atkData.ranged) {
        const remainHP = Math.max(0, target.hp - damage);
        let counterDmg = 0;
        if (!defData.ranged && remainHP > 0) {
            counterDmg = Math.floor((defData.damage[attacker.type] || 0) * (remainHP / target.maxHp));
        }
        const selfVal  = UNIT_VALUE[attacker.type] || 20;
        const selfMod  = Math.min(1.0, breachMultiplier);
        score -= (counterDmg / attacker.maxHp) * selfVal * selfMod;
        if (counterDmg >= attacker.hp && targetVal < selfVal * 1.5 && selfMod > 0.5) score -= 1000;
        if (hpRatio < 0.5 && counterDmg > 0) score -= (1 - hpRatio) * 50 * selfMod;
        const adjThreats = countAdjacentTeamUnits(state, attacker.x, attacker.y, target.team);
        if (adjThreats > 1) score -= (adjThreats - 1) * 20 * (UNIT_CAUTION[attacker.type] ?? 3) * selfMod;
    }
    const alliesNear = countAdjacentTeamUnits(state, target.x, target.y, attacker.team) - 1;
    if (alliesNear > 0) score += alliesNear * 15;
    if (state.turnsSinceLastCombat > 4) score += state.turnsSinceLastCombat * 10;
    score += Math.random() * 5;
    return score;
}
function selectOptimalTarget(state, attacker, targets, breachMultiplier = 1.0) {
    let best = null, bestVal = -Infinity;
    for (const pos of targets) {
        const tgt = getUnitAt(state, pos.x, pos.y);
        if (!tgt) continue;
        const val = calculateAttackValue(state, attacker, tgt, breachMultiplier);
        if (val > bestVal) { bestVal = val; best = pos; }
    }
    return best;
}
function tryAiAttack(state, unit, conserveDepth = 0, breachMultiplier = 1.0) {
    const targets = getAttackTargets(state, unit);
    if (targets.length === 0) return false;
    const pos = selectOptimalTarget(state, unit, targets, breachMultiplier);
    if (!pos) return false;
    const tgt = getUnitAt(state, pos.x, pos.y);
    if (!tgt) return false;
    if (conserveDepth > 0.3 && !UNITS[unit.type].ranged) {
        const isRangedTgt = UNITS[tgt.type].ranged;
        const ctrDmg = isRangedTgt ? 0 : Math.floor(
            (UNITS[tgt.type].damage?.[unit.type] || 0) *
            (tgt.hp / tgt.maxHp) *
            (TERRAIN[state.map[unit.y][unit.x].type].def || 0.85)
        );
        const wouldDie = ctrDmg >= unit.hp;
        const badTrade = ctrDmg > unit.hp * 0.5 && conserveDepth > 0.6;
        if (breachMultiplier >= 1.0 && (wouldDie || badTrade) && !UNITS[tgt.type].capture) {
            unit.hasAttacked = true;
            return false;
        }
    }
    resolveCombat(state, unit, tgt);
    unit.hasAttacked = true;
    if (UNITS[unit.type].ranged) unit.moved = true;
    unit.hasMovedThisTurn = true;
    return true;
}
function runAITurn(state, team) {
    if (state.gameOver || state.turn !== team) return;
    const unmoved = state.units.filter(u => u.team === team && !u.moved);
    const ranged   = unmoved.filter(u =>  UNITS[u.type].ranged);
    const capturers= unmoved.filter(u => !UNITS[u.type].ranged && UNITS[u.type].capture);
    const others   = unmoved.filter(u => !UNITS[u.type].ranged && !UNITS[u.type].capture);
    const aiUnits  = [...ranged, ...capturers, ...others];
    const defendMode = shouldDefend(state, team);
    const ev = evaluatePosition(state);
    const ownMat   = team === 0 ? ev.goldMaterial : ev.blueMaterial;
    const enemyMat = team === 0 ? ev.blueMaterial : ev.goldMaterial;
    const materialRatio = enemyMat > 0 ? ownMat / enemyMat : 1;
    let conserveDepth  = materialRatio >= 0.85 ? 0 : Math.min(1, (0.85 - materialRatio) / 0.35);
    let desperation    = 0;
    if (materialRatio < 0.4) {
        conserveDepth = materialRatio / 0.4;
        desperation   = 1.0 - materialRatio / 0.4;
    }
    let breachMultiplier = 1.0;
    if (materialRatio > 1.3 && !defendMode) breachMultiplier = Math.max(0.2, 1.8 - materialRatio);
    const dangerMap = buildDangerMap(state, 1 - team);
    const safetyMap = buildSafetyMap(state, 1 - team);
    const enemyTeam = 1 - team;
    for (const unit of aiUnits) {
        if (state.gameOver) break;
        if (!state.units.includes(unit)) continue;
        const standingStruct = getStructureAt(state, unit.x, unit.y);
        if (standingStruct && standingStruct.type === 'hq' &&
            standingStruct.team !== unit.team && UNITS[unit.type].capture) {
            queueCapture(state, unit, standingStruct);
            unit.moved = true; unit.hasMovedThisTurn = true;
            continue;
        }
        let attacked = tryAiAttack(state, unit, conserveDepth, breachMultiplier);
        if (!attacked && !unit.moved) {
            const movable = getMovableTiles(state, unit, true);
            movable.push({ x: unit.x, y: unit.y, cost: 0 });
            let targetX, targetY, ownHQ;
            ownHQ = state.structures.find(s => s.type === 'hq' && s.team === team);
            if (defendMode && ownHQ) {
                targetX = ownHQ.x; targetY = ownHQ.y;
            } else {
                const enemyHQ = state.structures.find(s => s.type === 'hq' && s.team === enemyTeam);
                if (enemyHQ) { targetX = enemyHQ.x; targetY = enemyHQ.y; }
            }
            if (targetX !== undefined) {
                const distMap     = getDistToHQ(state, targetX, targetY);
                const ownDistMap  = ownHQ ? getDistToHQ(state, ownHQ.x, ownHQ.y) : null;
                movable.sort((a, b) => {
                    let sA = 0, sB = 0;
                    const nearestEnemyDist = (tx, ty) => {
                        let min = 99;
                        state.units.forEach(u => {
                            if (u.team === enemyTeam) {
                                const d = Math.abs(u.x - tx) + Math.abs(u.y - ty);
                                if (d < min) min = d;
                            }
                        });
                        return min;
                    };
                    const dA = nearestEnemyDist(a.x, a.y);
                    const dB = nearestEnemyDist(b.x, b.y);
                    const terrainDef = (x, y) => TERRAIN[state.map[y][x].type].def;
                    const terrainScore = (x, y) => {
                        const def = terrainDef(x, y);
                        let pts = (1.0 - def) * 100;
                        if (state.map[y][x].type === 'road') pts -= 20;
                        if (UNITS[unit.type].capture && ownDistMap && !defendMode) {
                            if (ownDistMap[y][x] < distMap[y][x]) pts -= (1.0 - def) * 150;
                        }
                        return pts;
                    };
                    sA += terrainScore(a.x, a.y);
                    sB += terrainScore(b.x, b.y);
                    const caution = (UNIT_CAUTION[unit.type] || 3) *
                        (1 + conserveDepth * 1.5) * breachMultiplier * (1 - desperation);
                    const rdA = dangerMap[a.y][a.x] * terrainDef(a.x, a.y) * caution;
                    const rdB = dangerMap[b.y][b.x] * terrainDef(b.x, b.y) * caution;
                    const cohesion = (tx, ty) => {
                        let c = 0;
                        state.units.forEach(u => {
                            if (u.team === team) {
                                const d = Math.abs(u.x - tx) + Math.abs(u.y - ty);
                                if (d > 0 && d <= 3) c += (4 - d) * 2;
                            }
                        });
                        return c;
                    };
                    const cohA = cohesion(a.x, a.y), cohB = cohesion(b.x, b.y);
                    sA -= Math.max(0, rdA - cohA * 1.5); sB -= Math.max(0, rdB - cohB * 1.5);
                    sA += cohA; sB += cohB;
                    sA += safetyMap[a.y][a.x]; sB += safetyMap[b.y][b.x];
                    if (UNITS[unit.type].ranged) {
                        const maxR = UNITS[unit.type].maxRange;
                        if (dA > maxR + 2 && dB > maxR + 2) {
                            sA -= distMap[a.y][a.x] * 5; sB -= distMap[b.y][b.x] * 5;
                        } else {
                            if (dA <= 1) sA -= 500; if (dB <= 1) sB -= 500;
                            if (dA === maxR) sA += 300 + rdA * 0.8;
                            if (dB === maxR) sB += 300 + rdB * 0.8;
                        }
                    } else {
                        let hqPull = defendMode ? 20 : 4 + conserveDepth * 10;
                        if (breachMultiplier < 1.0) hqPull += 15;
                        hqPull += desperation * 50;
                        sA -= distMap[a.y][a.x] * hqPull;
                        sB -= distMap[b.y][b.x] * hqPull;
                        if (!defendMode) {
                            const apW = 3 * (1 - conserveDepth * 0.8);
                            sA -= dA * apW; sB -= dB * apW;
                        }
                    }
                    if (UNITS[unit.type].capture) {
                        const stA = getStructureAt(state, a.x, a.y);
                        const stB = getStructureAt(state, b.x, b.y);
                        if (stA && stA.team !== unit.team) sA += 200;
                        if (stB && stB.team !== unit.team) sB += 200;
                    }
                    if (defendMode && ownHQ) {
                        const threatUnit = state.units.find(u => u.team === enemyTeam && UNITS[u.type].capture && Math.abs(u.x - ownHQ.x) + Math.abs(u.y - ownHQ.y) <= 6);
                        if (threatUnit) {
                            sA -= (Math.abs(a.x - threatUnit.x) + Math.abs(a.y - threatUnit.y)) * 100;
                            sB -= (Math.abs(b.x - threatUnit.x) + Math.abs(b.y - threatUnit.y)) * 100;
                        } else {
                            if (a.x === ownHQ.x && a.y === ownHQ.y) sA += 2000;
                            if (b.x === ownHQ.x && b.y === ownHQ.y) sB += 2000;
                        }
                    }
                    const fellows = aiUnits.filter(u2 => u2 !== unit && !u2.moved && state.units.includes(u2));
                    const onFellowPath = (tx, ty) => fellows.some(u2 => {
                        return Math.abs(u2.x - tx) + Math.abs(u2.y - ty) <= UNITS[u2.type].move &&
                               distMap[ty][tx] < distMap[u2.y][u2.x];
                    });
                    if (onFellowPath(a.x, a.y)) sA -= 60;
                    if (onFellowPath(b.x, b.y)) sB -= 60;
                    sA += (((a.x * 11) + (a.y * 17) + (state.totalTurns * 5)) % 10) / 10 - 0.5;
                    sB += (((b.x * 11) + (b.y * 17) + (state.totalTurns * 5)) % 10) / 10 - 0.5;
                    return sB - sA;
                });
            }
            const move = movable[0];
            if (move) {
                unit.x = move.x; unit.y = move.y;
                unit.moved = true; unit.hasMovedThisTurn = true;
                const stAfterMove = getStructureAt(state, unit.x, unit.y);
                if (stAfterMove && stAfterMove.team !== unit.team && UNITS[unit.type].capture) {
                    queueCapture(state, unit, stAfterMove);
                }
            }
        }
        if (!attacked && !UNITS[unit.type].ranged && !unit.hasAttacked) {
            tryAiAttack(state, unit, conserveDepth, breachMultiplier);
        }
    }
}
module.exports = { runAITurn };
