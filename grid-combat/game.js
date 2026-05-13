// ==================== CONFIGURATION ====================
const TEAMS = ['Gold', 'Blue'];
const UNITS = {
    infantry: { name: 'Infantry', char: 'i', hp: 10, move: 3, vision: 2, damage: { infantry: 5, tank: 2, mech: 3, heavy: 2, artillery: 4, rocket: 3 }, capture: true, desc: 'Basic unit.' },
    tank: { name: 'Tank', char: 'T', hp: 10, move: 2, vision: 3, damage: { infantry: 8, tank: 6, mech: 5, heavy: 4, artillery: 5, rocket: 6 }, capture: false, desc: 'Mobile armor.' },
    mech: { name: 'Mech', char: 'm', hp: 12, move: 2, vision: 2, damage: { infantry: 6, tank: 5, mech: 5, heavy: 3, artillery: 6, rocket: 5 }, capture: true, desc: 'Heavy infantry.' },
    heavy: { name: 'Heavy Tank', char: 'H', hp: 16, move: 2, vision: 2, damage: { infantry: 10, tank: 8, mech: 9, heavy: 6, artillery: 7, rocket: 8 }, capture: false, desc: 'Juggernaut.' },
    artillery: { name: 'Artillery', char: 'A', hp: 8, move: 2, vision: 5, damage: { infantry: 9, tank: 8, mech: 8, heavy: 6, artillery: 5, rocket: 7 }, capture: false, ranged: true, minRange: 3, maxRange: 4, desc: 'Long range. Cannot both move and fire.' },
    rocket: { name: 'Rocket', char: 'R', hp: 7, move: 2, vision: 4, damage: { infantry: 6, tank: 10, mech: 9, heavy: 8, artillery: 6, rocket: 5 }, capture: false, ranged: true, minRange: 3, maxRange: 5, desc: 'Anti-armor. Cannot both move and fire.' }
};

const TERRAIN = {
    plain: { name: 'Plains', char: '·', def: 0.85, move: 1, desc: 'Open ground' },
    wood: { name: 'Woods', char: '♣', def: 0.70, move: 2, desc: 'Light cover' },
    mountain: { name: 'Mountain', char: '▲', def: 0.40, move: 3, desc: 'Heavy cover' },
    road: { name: 'Road', char: '═', def: 1.0, move: 1, desc: 'Fast movement' },
    water: { name: 'Water', char: '≋', def: 0.0, move: 255, desc: 'Impassable to ground units' }
};

const STRUCTURES = { hq: { char: '★', name: 'HQ', desc: 'Capture to win' } };

// ==================== GLOBAL VARIABLES ====================
let map = [], units = [], structures = [], turn = 0, selectedUnit = null;
let movableTiles = [], attackableTiles = [], pendingCaptures = [];
let gameOver = false, gameWinner = null, actionHistory = [], gameHistory = [];
let aiThinking = false, aiPaused = false, aiFast = false, aiSession = 0;
let turnsSinceLastCombat = 0;
let currentScenario = 'borderClash';
let boardWidth = 20, boardHeight = 13;
let gameMode = 'hvai';
let lastThreatCheckState = false;
let aiDefendLatch = { 0: false, 1: false };
const SAVE_KEY = 'gridwars_save';
const UNIT_VALUE = { infantry: 10, mech: 30, tank: 70, heavy: 160, artillery: 60, rocket: 150 };

// ==================== HELPER FUNCTIONS ====================
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function aiSleep(ms) { return sleep(aiFast && gameMode === 'avai' ? 0 : ms); }

function spawnFloatingText(x, y, text, type = 'damage') {
    const board = document.getElementById('board');
    const index = y * boardWidth + x;
    const cell = board.children[index];
    if (cell) {
        const div = document.createElement('div');
        div.className = `float-text float-${type}`;
        div.textContent = text;
        cell.appendChild(div);
        setTimeout(() => div.remove(), 1200);
    }
}

function highlightActor(x, y, isActive) {
    const index = y * boardWidth + x;
    const cell = document.getElementById('board').children[index];
    if (cell) isActive ? cell.classList.add('active-actor') : cell.classList.remove('active-actor');
}

function highlightTarget(x, y, isActive) {
    const index = y * boardWidth + x;
    const cell = document.getElementById('board').children[index];
    if (cell) isActive ? cell.classList.add('target-actor') : cell.classList.remove('target-actor');
}

// Home Territory Gradient
const HOME_GRADIENT_MAX = 0.18, HOME_GRADIENT_FULL = 0.10, HOME_GRADIENT_FADE = 12;
function getHomeTerritoryBonus(unit) {
    const hq = structures.find(s => s.type === 'hq' && s.team === unit.team);
    if (!hq) return 0;
    const dist = Math.abs(unit.x - hq.x) + Math.abs(unit.y - hq.y);
    if (dist <= HOME_GRADIENT_FULL) return HOME_GRADIENT_MAX;
    if (dist >= HOME_GRADIENT_FADE) return 0;
    const t = (dist - HOME_GRADIENT_FULL) / (HOME_GRADIENT_FADE - HOME_GRADIENT_FULL);
    return HOME_GRADIENT_MAX * (1 - t);
}

// ==================== COMBAT & PATHFINDING ====================
function resolveCombat(attacker, defender) {
    const atkData = UNITS[attacker.type], defData = UNITS[defender.type];
    turnsSinceLastCombat = 0; // Reset Stalemate Breaker

    let counterDamage = 0;
    const baseDamage = atkData.damage[defender.type] || 0;
    const terrain = map[defender.y][defender.x];
    const terrainDef = TERRAIN[terrain.type].def;
    const homeBonus = getHomeTerritoryBonus(defender);
    const defMod = terrainDef * (1 - homeBonus);
    const hpRatio = attacker.hp / attacker.maxHp;
    const finalDamage = Math.floor(baseDamage * hpRatio * defMod);

    if (homeBonus > 0.02) log(`Home ground: ${TEAMS[defender.team]} ${defData.name} +${Math.round(homeBonus*100)}% def`);

    const combatLog = { type: 'combat', attacker, defender, damageDealt: finalDamage, counterDamage: 0, deadUnit: null };
    defender.hp -= finalDamage;
    log(`${TEAMS[attacker.team]} ${atkData.name} attacks ${TEAMS[defender.team]} ${defData.name} for ${finalDamage} damage`);

    const dist = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);

    if (defender.hp <= 0) {
        log(`${TEAMS[defender.team]} ${defData.name} destroyed!`);
        combatLog.deadUnit = defender;
        units = units.filter(u => u !== defender);
    } else {
        if (!defData.ranged && dist === 1) {
            counterDamage = Math.floor((defData.damage[attacker.type] || 0) * (defender.hp / defender.maxHp));
            combatLog.counterDamage = counterDamage;
            attacker.hp -= counterDamage;
            log(`${TEAMS[defender.team]} ${defData.name} counters for ${counterDamage} damage`);
            if (attacker.hp <= 0) {
                log(`${TEAMS[attacker.team]} ${atkData.name} destroyed!`);
                combatLog.deadUnit = attacker;
                units = units.filter(u => u !== attacker);
            }
        }
    }

    actionHistory.push(combatLog);
    updateUndoButton();
    return { damage: finalDamage, counter: counterDamage, kill: !!combatLog.deadUnit };
}

function getMovableTiles(unit, allowFriendlyPass = false) {
    if (unit.moved) return [];
    const tiles = [];
    const visited = new Set();
    const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
    visited.add(`${unit.x},${unit.y}`);

    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = [
            { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }
        ];

        for (const next of neighbors) {
            if (next.x < 0 || next.x >= map[0].length || next.y < 0 || next.y >= map.length) continue;
            const key = `${next.x},${next.y}`;
            if (visited.has(key)) continue;

            const terrain = map[next.y][next.x];
            const moveCost = TERRAIN[terrain.type].move;
            if (moveCost >= 255) continue;

            const otherUnit = getUnitAt(next.x, next.y);
            if (otherUnit) {
                if (allowFriendlyPass && otherUnit.team === unit.team) {
                    // Allowed to path through
                } else {
                    continue;
                }
            }

            const newCost = current.cost + moveCost;
            if (newCost <= UNITS[unit.type].move) {
                visited.add(key);
                if (!otherUnit || (allowFriendlyPass && otherUnit.team === unit.team)) {
                    if (!otherUnit || otherUnit.team !== unit.team) {
                        tiles.push({ x: next.x, y: next.y, cost: newCost });
                    }
                }
                queue.push({ x: next.x, y: next.y, cost: newCost });
            }
        }
    }
    return tiles;
}

function getDistToHQ(hqX, hqY) {
    const dist = Array(map.length).fill(null).map(() => Array(map[0].length).fill(999));
    const queue = [{x: hqX, y: hqY, d: 0}];
    dist[hqY][hqX] = 0;
    while (queue.length > 0) {
        const {x, y, d} = queue.shift();
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= map[0].length || ny < 0 || ny >= map.length) continue;
            if (TERRAIN[map[ny][nx].type].move >= 255) continue;
            if (dist[ny][nx] <= d + 1) continue;
            dist[ny][nx] = d + 1;
            queue.push({x: nx, y: ny, d: d + 1});
        }
    }
    return dist;
}

// ==================== THREAT & HQ DETECTION ====================
function calculateHQVision() {
    const stellarHQ = structures.find(s => s.type === 'hq' && s.team === 0);
    const lunarHQ = structures.find(s => s.type === 'hq' && s.team === 1);
    if (!stellarHQ || !lunarHQ) return Math.max(4, Math.floor(Math.max(boardWidth, boardHeight) * 0.25));
    const hqDistance = Math.abs(stellarHQ.x - lunarHQ.x) + Math.abs(stellarHQ.y - lunarHQ.y);
    return Math.max(4, Math.min(10, Math.floor(hqDistance * 0.35)));
}

function checkPlayerDetection() {
    if (turn !== 0) return;
    const aiHQ = structures.find(s => s.type === 'hq' && s.team === 1);
    if (!aiHQ) return;

    const visionRadius = calculateHQVision();
    const threats = detectHQThreats(aiHQ, 0).filter(t => t.canCapture);

    if (threats.length > 0 && !lastThreatCheckState) {
        const closestThreat = threats.reduce((min, t) => t.distance < min.distance ? t : min);
        log(`Detected! Enemy ${UNITS[closestThreat.unit.type].name} entered AI range`);
        lastThreatCheckState = true;
    } else if (threats.length === 0) {
        lastThreatCheckState = false;
    }
}

function detectHQThreats(hq, enemyTeam) {
    const threats = [];
    const visionRadius = calculateHQVision();
    units.forEach(unit => {
        if (unit.team === enemyTeam) {
            const dist = Math.abs(unit.x - hq.x) + Math.abs(unit.y - hq.y);
            if (dist <= visionRadius) threats.push({ unit, distance: dist, canCapture: UNITS[unit.type].capture });
        }
    });
    return threats;
}

function calculateTimeToReach(fromX, fromY, toX, toY, moveSpeed) {
    const distMap = getDistToHQ(toX, toY);
    const pathDist = distMap[fromY][fromX];
    if (pathDist === 999) return 999;
    return Math.ceil(pathDist / moveSpeed);
}

function shouldDefend(aiTeam) {
    const enemyTeam = 1 - aiTeam;
    const aiHQ = structures.find(s => s.type === 'hq' && s.team === aiTeam);
    const playerHQ = structures.find(s => s.type === 'hq' && s.team === enemyTeam);
    if (!aiHQ || !playerHQ) { aiDefendLatch[aiTeam] = false; return false; }

    const threats = detectHQThreats(aiHQ, enemyTeam).filter(t => t.canCapture);
    if (threats.length === 0) { aiDefendLatch[aiTeam] = false; return false; }
    if (aiDefendLatch[aiTeam]) return true;

    const closestThreat = threats.reduce((min, t) => t.distance < min.distance ? t : min);
    const turnsToAIHQ = calculateTimeToReach(closestThreat.unit.x, closestThreat.unit.y, aiHQ.x, aiHQ.y, UNITS[closestThreat.unit.type].move);

    const aiCapturingUnits = units.filter(u => u.team === aiTeam && UNITS[u.type].capture);
    if (aiCapturingUnits.length === 0) { aiDefendLatch[aiTeam] = true; return true; }

    let minTurnsToPlayerHQ = 999;
    aiCapturingUnits.forEach(unit => {
        const turns = calculateTimeToReach(unit.x, unit.y, playerHQ.x, playerHQ.y, UNITS[unit.type].move);
        if (turns < minTurnsToPlayerHQ) minTurnsToPlayerHQ = turns;
    });

    const avgCaptureTime = 3;
    if (turnsToAIHQ + avgCaptureTime < minTurnsToPlayerHQ + avgCaptureTime) { aiDefendLatch[aiTeam] = true; return true; }
    return false;
}

// ==================== DANGER & MAP ANALYSIS ====================
const UNIT_THREAT_WEIGHT = { infantry: 1, mech: 2, tank: 4, heavy: 6, artillery: 0, rocket: 0 };
const UNIT_CAUTION = { infantry: 5, mech: 4, tank: 2, heavy: 1, artillery: 3, rocket: 3 };

function buildDangerMap(enemyTeam = 0) {
    const height = map.length, width = map[0].length;
    const danger = Array.from({ length: height }, () => new Float32Array(width));
    units.filter(u => u.team === enemyTeam).forEach(enemy => {
        const weight = UNIT_THREAT_WEIGHT[enemy.type] ?? 1;
        if (weight === 0) return;

        const enemyMoves = getMovableTiles(enemy, false);
        enemyMoves.push({x: enemy.x, y: enemy.y});

        const uData = UNITS[enemy.type];
        const minR = uData.ranged ? uData.minRange : 1, maxR = uData.ranged ? uData.maxRange : 1;

        enemyMoves.forEach(moveTile => {
            danger[moveTile.y][moveTile.x] += weight * 0.5;

			// Ranged units only attack from their current position
            const isCurrentPos = (moveTile.x === enemy.x && moveTile.y === enemy.y);
            if (uData.ranged && !isCurrentPos) return;

            for (let dy = -maxR; dy <= maxR; dy++) {
                for (let dx = -maxR; dx <= maxR; dx++) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minR || dist > maxR) continue;
                    const tx = moveTile.x + dx, ty = moveTile.y + dy;
                    if (tx >= 0 && tx < width && ty >= 0 && ty < height) danger[ty][tx] += weight;
                }
            }
        });
    });
    return danger;
}

function buildSafetyMap(enemyTeam) {
    const height = map.length, width = map[0].length;
    const covered = Array.from({ length: height }, () => new Uint8Array(width));

    units.filter(u => u.team === enemyTeam).forEach(enemy => {
        const uData = UNITS[enemy.type];
        const moves = getMovableTiles(enemy, false);
        moves.push({ x: enemy.x, y: enemy.y });
        const minR = uData.ranged ? uData.minRange : 1, maxR = uData.ranged ? uData.maxRange : 1;

        moves.forEach(moveTile => {
		    // Ranged units do not offer safety cover if they have to move to do it
            const isCurrentPos = (moveTile.x === enemy.x && moveTile.y === enemy.y);
            if (uData.ranged && !isCurrentPos) return;

            for (let dy = -maxR; dy <= maxR; dy++) {
                for (let dx = -maxR; dx <= maxR; dx++) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (dist < minR || dist > maxR) continue;
                    const tx = moveTile.x + dx, ty = moveTile.y + dy;
                    if (tx >= 0 && tx < width && ty >= 0 && ty < height) covered[ty][tx] = 1;
                }
            }
        });
    });

    const safety = Array.from({ length: height }, () => new Float32Array(width));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!covered[y][x]) safety[y][x] = 10 + (TERRAIN[map[y][x].type].def * 10);
        }
    }
    return safety;
}

function countAdjacentTeamUnits(x, y, team) {
    const neighbors = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
    return neighbors.filter(n => n.x >= 0 && n.x < map[0].length && n.y >= 0 && n.y < map.length && getUnitAt(n.x, n.y)?.team === team).length;
}

// ==================== AI TURN LOGIC ====================
async function runAITurn(team = 1) {
    if (gameOver || turn !== team) return;
    const mySession = aiSession;
    aiThinking = true;
    updateUI();

    const allAIUnits = units.filter(u => u.team === team && !u.moved);
    const rangedUnits = [], capturerUnits = [], otherUnits = [];
    allAIUnits.forEach(u => {
        if (UNITS[u.type].ranged) rangedUnits.push(u);
        else if (UNITS[u.type].capture) capturerUnits.push(u);
        else otherUnits.push(u);
    });
    const aiUnits = [...rangedUnits, ...capturerUnits, ...otherUnits];

    const defendMode = shouldDefend(team);
    if (defendMode) { log(`${TEAMS[team]} AI: Defensive positioning!`); await aiSleep(800); }

    const _ev = evaluatePosition();
    const _ownMat = team === 0 ? _ev.goldMaterial : _ev.blueMaterial;
    const _enemyMat = team === 0 ? _ev.blueMaterial : _ev.goldMaterial;
    const materialRatio = _enemyMat > 0 ? _ownMat / _enemyMat : 1;
    let conserveDepth = materialRatio >= 0.85 ? 0 : Math.min(1, (0.85 - materialRatio) / 0.35);
    const advantageRatio = _enemyMat > 0 ? _ownMat / _enemyMat : 1;

	// Desperation curve. If losing, reduce conservation and increase desperation
    let desperation = 0;
    if (materialRatio < 0.4) {
        conserveDepth = materialRatio / 0.4;       // Drops from 1.0 down to 0 as parity worsens
        desperation = 1.0 - (materialRatio / 0.4); // Rises from 0 up to 1.0
    }

    let breachMultiplier = 1.0;
    if (advantageRatio > 1.3 && !defendMode) {
        breachMultiplier = Math.max(0.2, 1.8 - advantageRatio);
        log(`${TEAMS[team]} AI: Breach tactics initiated!`);
    } else if (conserveDepth > 0) {
        log(`${TEAMS[team]} AI: Conservation doctrine active.`);
    }

    const dangerMap = buildDangerMap(1 - team);
    const safetyMap = buildSafetyMap(1 - team);

    async function waitWhilePaused() { while (aiPaused && !gameOver) await sleep(100); }

    for (const unit of aiUnits) {
        if (gameOver) break;
        if (aiSession !== mySession) { aiThinking = false; return; }
        if (!units.includes(unit)) continue;

        await waitWhilePaused();
        if (aiSession !== mySession) { aiThinking = false; return; }

        highlightActor(unit.x, unit.y, true);
        await aiSleep(600);
        if (aiSession !== mySession) { aiThinking = false; return; }

        // --- CAPTURE CHECK ---
        const standingStruct = getStructureAt(unit.x, unit.y);
        if (standingStruct && standingStruct.type === 'hq' && standingStruct.team !== unit.team && UNITS[unit.type].capture) {
            queueCapture(unit, standingStruct);
            unit.moved = true; unit.hasMovedThisTurn = true;

            const infoEl = document.getElementById('pending-capture-info');
            if (infoEl) { infoEl.style.display = 'block'; infoEl.textContent = `${TEAMS[unit.team]} capturing...`; }

            if (!aiFast) spawnFloatingText(unit.x, unit.y, "CAPTURING", "capture");
            await aiSleep(1000);
            highlightActor(unit.x, unit.y, false);
            render();
            continue;
        }

        // --- PRE-MOVE ATTACK ---
        let attacked = await tryAiAttack(unit, conserveDepth, breachMultiplier, mySession);

        // --- MOVEMENT ---
        if (!attacked && !unit.moved) {
            const movable = getMovableTiles(unit, true);
            movable.push({ x: unit.x, y: unit.y, cost: 0 });

            if (movable.length > 0) {
                let targetX, targetY, targetHQ;
                const enemyTeam = 1 - team;

                if (defendMode) {
                    const aiHQ = structures.find(s => s.type === 'hq' && s.team === team);
                    if (aiHQ) { targetX = aiHQ.x; targetY = aiHQ.y; targetHQ = aiHQ; }
                    else {
                        targetHQ = structures.find(s => s.type === 'hq' && s.team === null);
                        if (!targetHQ) targetHQ = structures.find(s => s.type === 'hq' && s.team === enemyTeam);
                        if (targetHQ) { targetX = targetHQ.x; targetY = targetHQ.y; }
                    }
                } else {
                    targetHQ = structures.find(s => s.type === 'hq' && s.team === null);
                    if (!targetHQ) targetHQ = structures.find(s => s.type === 'hq' && s.team === enemyTeam);
                    if (targetHQ) { targetX = targetHQ.x; targetY = targetHQ.y; }
                }

                if (targetX !== undefined && targetY !== undefined) {
                    const distMap = getDistToHQ(targetX, targetY);
                    const ownHQ = structures.find(s => s.type === 'hq' && s.team === team);
                    const ownDistMap = ownHQ ? getDistToHQ(ownHQ.x, ownHQ.y) : null;

                    movable.sort((a, b) => {
                        let scoreA = 0, scoreB = 0;

                        const getDistToNearestEnemy = (tx, ty) => {
                            let min = 99;
                            units.forEach(u => { if (u.team === enemyTeam) { const d = Math.abs(u.x - tx) + Math.abs(u.y - ty); if (d < min) min = d; } });
                            return min;
                        };
                        const distA = getDistToNearestEnemy(a.x, a.y), distB = getDistToNearestEnemy(b.x, b.y);

                        // Terrain Defense
                        const getTerrainDef = (x, y) => TERRAIN[map[y][x].type].def;
                        const getTerrainScore = (x, y) => {
                            const def = getTerrainDef(x, y);
                            let pts = (1.0 - def) * 100;
                            if (map[y][x].type === 'road') pts -= 20;
                            if (UNITS[unit.type].capture && ownDistMap && !defendMode) {
                                const distToOwn = ownDistMap[y][x], distToEnemy = distMap[y][x];
                                if (distToOwn < distToEnemy) pts -= (1.0 - def) * 100 * 1.5;
                            }
                            return pts;
                        };

                        scoreA += getTerrainScore(a.x, a.y); scoreB += getTerrainScore(b.x, b.y);

                        // Aggression & Caution
                        const caution = (UNIT_CAUTION[unit.type] || 3) * (1 + conserveDepth * 1.5) * breachMultiplier * (1 - desperation);
                        const rawDangerA = dangerMap[a.y][a.x] * getTerrainDef(a.x, a.y) * caution;
                        const rawDangerB = dangerMap[b.y][b.x] * getTerrainDef(b.x, b.y) * caution;

                        const getCohesion = (tx, ty) => {
                            let c = 0;
                            units.forEach(u => { if (u.team === team) { const d = Math.abs(u.x - tx) + Math.abs(u.y - ty); if (d > 0 && d <= 3) c += (4 - d) * 2; } });
                            return c;
                        };

                        const cohesionA = getCohesion(a.x, a.y), cohesionB = getCohesion(b.x, b.y);

                        scoreA -= Math.max(0, rawDangerA - (cohesionA * 1.5));
                        scoreB -= Math.max(0, rawDangerB - (cohesionB * 1.5));
                        scoreA += cohesionA; scoreB += cohesionB;
                        scoreA += safetyMap[a.y][a.x]; scoreB += safetyMap[b.y][b.x];

                        // Unit specifics
                        if (UNITS[unit.type].ranged) {
                            const maxR = UNITS[unit.type].maxRange;
                            if (distA > maxR + 2 && distB > maxR + 2) {
                                scoreA -= distMap[a.y][a.x] * 5; scoreB -= distMap[b.y][b.x] * 5;
                            } else {
                                if (distA <= 1) scoreA -= 500; if (distB <= 1) scoreB -= 500;
                                if (distA === maxR) scoreA += 300 + (rawDangerA * 0.8);
                                if (distB === maxR) scoreB += 300 + (rawDangerB * 0.8);
                                if (distA >= UNITS[unit.type].minRange && distA < maxR) scoreA += 50;
                                if (distB >= UNITS[unit.type].minRange && distB < maxR) scoreB += 50;
                            }
                        } else {
                            let hqPullWeight = defendMode ? 20 : 4 + conserveDepth * 10;
                            if (breachMultiplier < 1.0) hqPullWeight += 15;
							hqPullWeight += desperation * 50; // Pull toward the HQ when losing
                            scoreA -= distMap[a.y][a.x] * hqPullWeight; scoreB -= distMap[b.y][b.x] * hqPullWeight;
                            if (!defendMode) {
                                const approachWeight = 3 * (1 - conserveDepth * 0.8);
                                scoreA -= distA * approachWeight; scoreB -= distB * approachWeight;
                            }
                        }

                        // Capture
                        const structA = getStructureAt(a.x, a.y), structB = getStructureAt(b.x, b.y);
                        if (UNITS[unit.type].capture) {
                            if (structA && structA.team !== unit.team) scoreA += 200;
                            if (structB && structB.team !== unit.team) scoreB += 200;
                        }

						if (defendMode && ownHQ) {
                                // Intercept approaching capturers (threshold 6, weight 100 are Loop 1 targets)
                                const threatUnit = units.find(u => u.team === enemyTeam && UNITS[u.type].capture && Math.abs(u.x - ownHQ.x) + Math.abs(u.y - ownHQ.y) <= 6);
                                if (threatUnit) {
                                    // Active threat: pull toward intercepting it
                                    scoreA -= (Math.abs(a.x - threatUnit.x) + Math.abs(a.y - threatUnit.y)) * 100;
                                    scoreB -= (Math.abs(b.x - threatUnit.x) + Math.abs(b.y - threatUnit.y)) * 100;
                                } else {
                                    // No threat: reward holding the HQ tile
                                    if (a.x === ownHQ.x && a.y === ownHQ.y) scoreA += 2000;
                                    if (b.x === ownHQ.x && b.y === ownHQ.y) scoreB += 2000;
                                }
                            }

                        // Deconfliction
                        if (targetX !== undefined) {
                            const fellowUnits = aiUnits.filter(u2 => u2 !== unit && !u2.moved && units.includes(u2));
                            const isOnFellowPath = (tx, ty) => fellowUnits.some(u2 => { const d = distMap[u2.y][u2.x]; const dNext = distMap[ty][tx]; const adjToFellow = Math.abs(u2.x - tx) + Math.abs(u2.y - ty) <= UNITS[u2.type].move; return adjToFellow && dNext < d; });
                            if (isOnFellowPath(a.x, a.y)) scoreA -= 60; if (isOnFellowPath(b.x, b.y)) scoreB -= 60;
                        }

                        const ditherA = (((a.x * 7) + (a.y * 13) + (turn * 3)) % 10) / 10 - 0.5;
                        const ditherB = (((b.x * 7) + (b.y * 13) + (turn * 3)) % 10) / 10 - 0.5;
                        scoreA += ditherA; scoreB += ditherB;

                        return scoreB - scoreA;
                    });
                }

                const move = movable[0];
                highlightActor(unit.x, unit.y, false);
                unit.x = move.x; unit.y = move.y; unit.moved = true; unit.hasMovedThisTurn = true;

                render();
                highlightActor(unit.x, unit.y, true);
                await aiSleep(500);

                const structAfterMove = getStructureAt(unit.x, unit.y);
                if (structAfterMove && structAfterMove.team !== unit.team && UNITS[unit.type].capture) {
                    queueCapture(unit, structAfterMove);
                    if (!aiFast) spawnFloatingText(unit.x, unit.y, "SEIZING", "capture");
                }
            }
        }

        // --- POST-MOVE ATTACK ---
        if (!attacked && !UNITS[unit.type].ranged && !unit.hasAttacked) {
            await tryAiAttack(unit, conserveDepth, breachMultiplier, mySession);
        }

        if (aiSession !== mySession) { aiThinking = false; return; }
        highlightActor(unit.x, unit.y, false);
        render();
        await aiSleep(200);
    }

    aiThinking = false;
    if (aiSession !== mySession) return;
    endTurn();
}

async function tryAiAttack(unit, conserveDepth = 0, breachMultiplier = 1.0, mySession = aiSession) {
    const targets = getAttackTargets(unit);
    if (targets.length > 0) {
        const targetPos = selectOptimalTarget(unit, targets, breachMultiplier);
        if (targetPos) {
            const targetUnit = getUnitAt(targetPos.x, targetPos.y);
            if (targetUnit) {
                // Veto for bad trades when conserving
                if (conserveDepth > 0.3 && !UNITS[unit.type].ranged) {
                    const isRangedTarget = UNITS[targetUnit.type].ranged;
                    const counterDmg = isRangedTarget ? 0 : Math.floor((UNITS[targetUnit.type]?.damage?.[unit.type] || 0) * (targetUnit.hp / targetUnit.maxHp) * (TERRAIN[map[unit.y][unit.x].type]?.def || 0.85));
                    const wouldDie = counterDmg >= unit.hp;
                    const badTrade = counterDmg > unit.hp * 0.5 && conserveDepth > 0.6;
                    const isCapturer = UNITS[targetUnit.type].capture;
                    if (breachMultiplier >= 1.0 && (wouldDie || badTrade) && !isCapturer) { unit.hasAttacked = true; return; }
                }

                highlightTarget(targetUnit.x, targetUnit.y, true);
                await aiSleep(600);
                if (aiSession !== mySession) return false;

                const result = resolveCombat(unit, targetUnit);
                if (!aiFast) {
                    if (result.damage > 0) spawnFloatingText(targetUnit.x, targetUnit.y, `-${result.damage}`, "damage");
                    else spawnFloatingText(targetUnit.x, targetUnit.y, "MISS", "miss");
                    if (result.counter > 0) setTimeout(() => { spawnFloatingText(unit.x, unit.y, `-${result.counter}`, "counter"); }, 200);
                }

                await aiSleep(1500);
                if (aiSession !== mySession) return false;

                highlightTarget(targetUnit.x, targetUnit.y, false);
                unit.hasAttacked = true;
                if (UNITS[unit.type].ranged) unit.moved = true;
                unit.hasMovedThisTurn = true;

                render();
                if (units.includes(unit)) highlightActor(unit.x, unit.y, true);
                return true;
            }
        }
    }
    return false;
}

function getAttackTargets(unit) {
    const targets = [];
    const uData = UNITS[unit.type];
    if (unit.hasAttacked) return [];

    if (uData.ranged) {
        for (let dy = -uData.maxRange; dy <= uData.maxRange; dy++) {
            for (let dx = -uData.maxRange; dx <= uData.maxRange; dx++) {
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist < uData.minRange || dist > uData.maxRange) continue;
                const tx = unit.x + dx, ty = unit.y + dy;
                if (tx < 0 || tx >= map[0].length || ty < 0 || ty >= map.length) continue;
                const target = getUnitAt(tx, ty);
                if (target && target.team !== unit.team) targets.push({ x: tx, y: ty });
            }
        }
    } else {
        const neighbors = [{ x: unit.x + 1, y: unit.y }, { x: unit.x - 1, y: unit.y }, { x: unit.x, y: unit.y + 1 }, { x: unit.x, y: unit.y - 1 }];
        for (const pos of neighbors) {
            if (pos.x < 0 || pos.x >= map[0].length || pos.y < 0 || pos.y >= map.length) continue;
            const target = getUnitAt(pos.x, pos.y);
            if (target && target.team !== unit.team) targets.push(pos);
        }
    }
    return targets;
}

function calculateAttackValue(attacker, target, targetPos, breachMultiplier = 1.0) {
    const atkData = UNITS[attacker.type], defData = UNITS[target.type];
    const struct = getStructureAt(target.x, target.y);
    const isThreateningHQ = struct && struct.type === 'hq' && struct.team === attacker.team;
    if (isThreateningHQ) return 5000;

    const baseDamage = atkData.damage[target.type] || 0;
    const hpRatio = attacker.hp / attacker.maxHp;
    const terrain = map[target.y][target.x];
    const defMod = TERRAIN[terrain.type].def;
    const damage = Math.ceil(baseDamage * hpRatio * defMod);

    const targetVal = UNIT_VALUE[target.type] || 20;
    let score = (damage / target.maxHp) * targetVal;

	if (defData.capture) {
        const ownHQ = structures.find(s => s.type === 'hq' && s.team === attacker.team);
        if (ownHQ) {
            const distToHQ = Math.abs(target.x - ownHQ.x) + Math.abs(target.y - ownHQ.y);
            if (distToHQ <= 4) {
                score += (5 - distToHQ) * 100;
            }
        }
    }

    if (damage >= target.hp) {
        score += targetVal * 0.5;
        if (defData.capture) score += 50;
        if (defData.ranged) score += 40;
    }

    if (!atkData.ranged) {
        const remainingHP = Math.max(0, target.hp - damage);
        let counterDamage = 0;
        if (!defData.ranged && remainingHP > 0) {
            const counterRatio = remainingHP / target.maxHp;
            counterDamage = Math.floor((defData.damage[attacker.type] || 0) * counterRatio);
        }

        const selfVal = UNIT_VALUE[attacker.type] || 20;
        const selfPreservationMod = Math.min(1.0, breachMultiplier);
        const valueLost = (counterDamage / attacker.maxHp) * selfVal * selfPreservationMod;
        score -= valueLost;

        if (counterDamage >= attacker.hp) {
            if (targetVal < selfVal * 1.5 && selfPreservationMod > 0.5) score -= 1000;
        }

        if (hpRatio < 0.5 && counterDamage > 0) {
            const cautionPenalty = (1 - hpRatio) * 50 * selfPreservationMod;
            score -= cautionPenalty;
        }

        const adjacentThreats = countAdjacentTeamUnits(attacker.x, attacker.y, target.team);
        if (adjacentThreats > 1) {
            const cautionLevel = UNIT_CAUTION[attacker.type] ?? 3;
            score -= (adjacentThreats - 1) * 20 * cautionLevel * selfPreservationMod;
        }
    }

    const alliesAroundTarget = countAdjacentTeamUnits(target.x, target.y, attacker.team) - 1;
    if (alliesAroundTarget > 0) score += (alliesAroundTarget * 15);

    if (turnsSinceLastCombat > 4) score += (turnsSinceLastCombat * 10);
    score += Math.random() * 5;

    return score;
}

function selectOptimalTarget(attacker, targets, breachMultiplier = 1.0) {
    if (targets.length === 0) return null;
    let bestTarget = null, bestValue = -Infinity;
    for (const pos of targets) {
        const target = getUnitAt(pos.x, pos.y);
        if (!target) continue;
        const value = calculateAttackValue(attacker, target, pos, breachMultiplier);
        if (value > bestValue) { bestValue = value; bestTarget = pos; }
    }
    return bestTarget;
}

// ==================== RENDERING & UI ====================
function showTileInfo(x, y) {
    const terrain = map[y][x];
    const tData = TERRAIN[terrain.type];
    document.getElementById('info-terrain').textContent = tData.name;
    document.getElementById('info-defense').textContent = tData.def > 0 ? `${Math.floor((1 - tData.def) * 100)}% protection` : 'None';
    document.getElementById('info-move').textContent = tData.move >= 255 ? 'Impassable' : tData.move;

    const struct = getStructureAt(x, y);
    const structEl = document.getElementById('info-structure');
    const pendingEl = document.getElementById('pending-capture-info');
    pendingEl.style.display = 'none';

    if (struct) {
        let info = STRUCTURES[struct.type].name;
        if (struct.team !== null) info += ` (${TEAMS[struct.team]})`;

        if (struct.captureLeft < 20) {
            const progress = Math.floor(((20 - struct.captureLeft) / 20) * 100);
            info += ` [${progress}% captured]`;
            const capturingUnit = units.find(u => u.pendingCapture && u.x === x && u.y === y);
            if (capturingUnit) {
                info += ` by ${TEAMS[capturingUnit.team]} ${UNITS[capturingUnit.type].name}`;
                pendingEl.textContent = `Capturing: ${progress}% complete (${struct.captureLeft} pts remaining)`;
                pendingEl.style.display = 'block';
            }
        } else if (turn === 0 && struct.team !== 0) {
            const canCapture = units.some(u => u.team === 0 && UNITS[u.type].capture && Math.abs(u.x - x) + Math.abs(u.y - y) <= UNITS[u.type].move);
            if (canCapture) {
                info += " [Can start capturing]";
                pendingEl.textContent = "HQ can be seized (requires multiple turns)";
                pendingEl.style.display = 'block';
                pendingEl.style.color = '#ff0';
            }
        }
        structEl.textContent = info;
    } else {
        structEl.textContent = '-';
    }

    const unit = getUnitAt(x, y);
    const unitEl = document.getElementById('info-unit');
    if (unit) {
        const uData = UNITS[unit.type];
        const homeBonus = getHomeTerritoryBonus(unit);
        const bonusPct = Math.round(homeBonus * 100);
        unitEl.innerHTML = `<span class="${unit.team === 0 ? 'stellar' : 'lunar'}">${uData.name}</span> (${unit.hp}/${unit.maxHp}) ${unit.moved ? '[MOVED]' : ''}`;
        unitEl.innerHTML += `<br><small>${uData.desc}</small>`;
        if (bonusPct > 0) {
            const col = unit.team === 0 ? '#ffd700' : '#4da6ff';
            unitEl.innerHTML += `<br><small style="color:${col}">⚔ Home territory: +${bonusPct}% defence</small>`;
        }
        if (uData.capture) unitEl.innerHTML += `<small> Can capture HQ.</small>`;
        if (uData.ranged) unitEl.innerHTML += `<small> Attack range ${uData.minRange}-${uData.maxRange}.</small>`;

        if (unit.pendingCapture && struct) {
            const progress = Math.floor(((20 - struct.captureLeft) / 20) * 100);
            unitEl.innerHTML += `<br><small style="color:#0f0">Capturing HQ: ${progress}%</small>`;
        }
    } else {
        unitEl.textContent = '-';
    }
}

function resizeBoard() {
    const board = document.getElementById('board');
    const isMobile = window.innerWidth <= 800;

    // Calculate available space
    const maxWidth = window.innerWidth - (isMobile ? 10 : 30);
    const maxHeight = window.innerHeight - 30;

    // Estimate UI width/height based on layout
    const availableWidth = isMobile ? maxWidth : maxWidth - 360;
    const availableHeight = isMobile ? maxHeight * 0.52 : maxHeight;

    const cellW = Math.floor(availableWidth / boardWidth);
    const cellH = Math.floor(availableHeight / boardHeight);

    // Size clamping
    let size = Math.min(cellW, cellH, 45);
    const MIN_CELL_SIZE = isMobile ? 16 : 24;
    if (size < MIN_CELL_SIZE) size = MIN_CELL_SIZE;

    document.documentElement.style.setProperty('--cell-size', `${size}px`);
    board.style.gridTemplateColumns = `repeat(${boardWidth}, ${size}px)`;
    board.style.gridTemplateRows = `repeat(${boardHeight}, ${size}px)`;
}

function render() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    const rangedAttackTiles = [];
    if (selectedUnit && UNITS[selectedUnit.type].ranged) {
        const uData = UNITS[selectedUnit.type];
        for (let dy = -uData.maxRange; dy <= uData.maxRange; dy++) {
            for (let dx = -uData.maxRange; dx <= uData.maxRange; dx++) {
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist === 0 || dist > uData.maxRange) continue;
                const tx = selectedUnit.x + dx, ty = selectedUnit.y + dy;
                if (tx < 0 || tx >= boardWidth || ty < 0 || ty >= boardHeight) continue;
                rangedAttackTiles.push({x: tx, y: ty, dist: dist});
            }
        }
    }

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            const cell = document.createElement('div');
            cell.className = `cell ${map[y][x].type}`;

            const terrainChar = document.createElement('span');
            terrainChar.className = 'terrain-char';
            terrainChar.textContent = TERRAIN[map[y][x].type].char;
            cell.appendChild(terrainChar);

            const unit = getUnitAt(x, y);
            const struct = getStructureAt(x, y);

            if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) cell.classList.add('selected');

            const isMovable = movableTiles.find(t => t.x === x && t.y === y);
            if (isMovable) {
                cell.classList.add('movable');
                const blockingUnit = getUnitAt(x, y);
                if (blockingUnit && blockingUnit.team === selectedUnit?.team) cell.classList.add('friendly-passable');
            }

            if (attackableTiles.find(t => t.x === x && t.y === y)) cell.classList.add('range-indicator');

            const rangedTile = rangedAttackTiles.find(t => t.x === x && t.y === y);
            if (rangedTile) {
                cell.classList.add('range-highlight');
                if (rangedTile.dist < UNITS[selectedUnit.type].minRange) cell.classList.add('min-range-highlight');
            }

            if (struct) {
                const structSpan = document.createElement('span');
                structSpan.textContent = STRUCTURES[struct.type].char;
                structSpan.className = 'structure';
                if (struct.team !== null) structSpan.classList.add(struct.team === 0 ? 'stellar' : 'lunar');
                else structSpan.classList.add('neutral');
                cell.appendChild(structSpan);

                if (struct.captureLeft < 20) {
                    const capDiv = document.createElement('div');
                    capDiv.className = 'pending-capture';
                    cell.appendChild(capDiv);

                    const progressDiv = document.createElement('div');
                    progressDiv.className = 'capture-progress';
                    progressDiv.style.width = `${(1 - struct.captureLeft/20) * 100}%`;
                    cell.appendChild(progressDiv);
                }

                if (struct.team !== turn && turn === 0 && struct.type === 'hq') {
                    const captureUnits = units.filter(u => u.team === 0 && UNITS[u.type].capture && Math.abs(u.x - x) + Math.abs(u.y - y) <= UNITS[u.type].move);
                    if (captureUnits.length > 0) cell.classList.add('hq-target');
                }
            }

            if (unit) {
                const unitSpan = document.createElement('span');
                unitSpan.textContent = UNITS[unit.type].char;
                unitSpan.className = unit.team === 0 ? 'stellar' : 'lunar';
                cell.appendChild(unitSpan);
                cell.classList.add(unit.team === 0 ? 'stellar-unit' : 'lunar-unit');

                const dot = document.createElement('div');
                dot.className = 'hp-dot';
                const pct = unit.hp / unit.maxHp;
                dot.classList.add(pct > 0.66 ? 'hp-high' : pct > 0.33 ? 'hp-mid' : 'hp-low');
                cell.appendChild(dot);
            }

            const stellarHQ = structures.find(s => s.type === 'hq' && s.team === 0);
            const lunarHQ   = structures.find(s => s.type === 'hq' && s.team === 1);
            if (stellarHQ) {
                const d = Math.abs(x - stellarHQ.x) + Math.abs(y - stellarHQ.y);
                if (d <= HOME_GRADIENT_FULL)  cell.classList.add('home-near-gold');
                else if (d < HOME_GRADIENT_FADE * 0.5) cell.classList.add('home-mid-gold');
            }
            if (lunarHQ) {
                const d = Math.abs(x - lunarHQ.x) + Math.abs(y - lunarHQ.y);
                if (d <= HOME_GRADIENT_FULL)  cell.classList.add('home-near-blue');
                else if (d < HOME_GRADIENT_FADE * 0.5) cell.classList.add('home-mid-blue');
            }

            // Touch & Hover interactions
            cell.onclick = () => onCellClick(x, y);
            cell.onmouseover = () => showTileInfo(x, y);

            board.appendChild(cell);
        }
    }
    resizeBoard();
}

// ==================== SCENARIOS & INIT ====================
function parseMapString(str) {
    const lines = str.split('\n');
    const charMap = { '·': 'plain', '♣': 'wood', '▲': 'mountain', '═': 'road', '≋': 'water' };
    return lines.map((line, y) => line.split('').map((char, x) => ({ type: charMap[char] || 'plain', x, y })));
}

const SCENARIOS = {
  borderClash: {
    name: 'Border Clash', width: 16, height: 12,
    mapString: `
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
≋·····♣≋≋♣·····≋
≋····▲▲≋≋▲▲····≋
≋······≋≋······≋
≋······≋≋······≋
≋······══······≋
≋······══······≋
≋······≋≋······≋
≋······≋≋······≋
≋····▲▲≋≋▲▲····≋
≋·····♣≋≋♣·····≋
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    structures: [{ type: 'hq', x: 3, y: 2, team: 0 }, { type: 'hq', x: 12, y: 9, team: 1 }],
    units: [
      { type: 'infantry', x: 2, y: 2, team: 0 }, { type: 'infantry', x: 4, y: 2, team: 0 },
      { type: 'mech', x: 3, y: 3, team: 0 }, { type: 'tank', x: 2, y: 3, team: 0 },
      { type: 'tank', x: 4, y: 4, team: 0 }, { type: 'artillery', x: 3, y: 4, team: 0 },
      { type: 'infantry', x: 13, y: 9, team: 1 }, { type: 'infantry', x: 11, y: 9, team: 1 },
      { type: 'mech', x: 12, y: 8, team: 1 }, { type: 'tank', x: 13, y: 8, team: 1 },
      { type: 'tank', x: 11, y: 7, team: 1 }, { type: 'artillery', x: 12, y: 7, team: 1 }
    ]
  },
  siege: {
    name: 'Siege', width: 18, height: 13,
    mapString: `
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
≋················≋
≋·▲▲·····♣♣····▲▲≋
≋·▲▲···········▲▲≋
≋················≋
≋················≋
≋≋≋≋≋≋≋══≋≋≋≋≋≋≋≋≋
≋················≋
≋················≋
≋····♣♣♣··♣♣♣····≋
≋·······▲▲·······≋
≋················≋
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    structures: [{ type: 'hq', x: 9, y: 2, team: 1 }, { type: 'hq', x: 9, y: 10, team: 0 }],
    units: [
      { type: 'infantry', x: 8, y: 2, team: 1 }, { type: 'infantry', x: 10, y: 2, team: 1 },
      { type: 'mech', x: 9, y: 3, team: 1 }, { type: 'tank', x: 7, y: 4, team: 1 },
      { type: 'tank', x: 11, y: 4, team: 1 }, { type: 'artillery', x: 9, y: 5, team: 1 },
      { type: 'infantry', x: 8, y: 10, team: 0 }, { type: 'infantry', x: 10, y: 10, team: 0 },
      { type: 'mech', x: 9, y: 9, team: 0 }, { type: 'tank', x: 7, y: 8, team: 0 },
      { type: 'tank', x: 11, y: 8, team: 0 }, { type: 'artillery', x: 9, y: 7, team: 0 }
    ]
  },
  bridgeHead: {
    name: 'River Crossing', width: 20, height: 14,
    mapString: `
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
≋··················≋
≋·▲▲······♣♣♣♣·····≋
≋····≋≋≋≋··········≋
≋·····≋≋≋≋≋≋≋≋·····≋
≋······≋≋≋≋≋≋≋≋≋≋··≋
≋·······≋≋≋≋≋≋≋≋≋≋≋≋
≋········══≋≋≋≋≋≋≋≋≋
≋≋≋≋≋≋≋≋≋══········≋
≋≋≋≋≋≋≋≋≋≋≋≋·······≋
≋··♣♣♣♣····≋≋≋≋····≋
≋··········≋≋≋≋····≋
≋··············▲▲··≋
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    structures: [{ type: 'hq', x: 3, y: 2, team: 0 }, { type: 'hq', x: 16, y: 11, team: 1 }],
    units: [
      { type: 'infantry', x: 2, y: 2, team: 0 }, { type: 'infantry', x: 4, y: 2, team: 0 },
      { type: 'mech', x: 3, y: 3, team: 0 }, { type: 'tank', x: 2, y: 4, team: 0 },
      { type: 'tank', x: 4, y: 4, team: 0 }, { type: 'artillery', x: 3, y: 5, team: 0 },
      { type: 'infantry', x: 17, y: 11, team: 1 }, { type: 'infantry', x: 15, y: 11, team: 1 },
      { type: 'mech', x: 16, y: 10, team: 1 }, { type: 'tank', x: 17, y: 9, team: 1 },
      { type: 'tank', x: 15, y: 9, team: 1 }, { type: 'artillery', x: 16, y: 8, team: 1 }
    ]
  },
  gauntlet: {
    name: 'The Gauntlet', width: 12, height: 16,
    mapString: `
≋≋≋≋≋≋≋≋≋≋≋≋
≋··········≋
≋··▲····▲··≋
≋··▲····▲··≋
≋··········≋
≋··♣≋≋≋≋♣··≋
≋··≋≋══≋≋··≋
≋≋≋≋≋··≋≋··≋
≋··≋≋··≋≋··≋
≋···≋══≋···≋
≋··♣≋≋≋≋♣··≋
≋··········≋
≋··▲····▲··≋
≋··▲····▲··≋
≋··········≋
≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    structures: [{ type: 'hq', x: 6, y: 2, team: 0 }, { type: 'hq', x: 5, y: 13, team: 1 }],
    units: [
      { type: 'infantry', x: 5, y: 2, team: 0 }, { type: 'infantry', x: 7, y: 2, team: 0 },
      { type: 'mech', x: 6, y: 3, team: 0 }, { type: 'tank', x: 5, y: 4, team: 0 },
      { type: 'tank', x: 7, y: 4, team: 0 }, { type: 'heavy', x: 8, y: 5, team: 0 },
      { type: 'infantry', x: 6, y: 13, team: 1 }, { type: 'infantry', x: 4, y: 13, team: 1 },
      { type: 'mech', x: 5, y: 12, team: 1 }, { type: 'tank', x: 6, y: 11, team: 1 },
      { type: 'tank', x: 4, y: 11, team: 1 }, { type: 'heavy', x: 3, y: 10, team: 1 }
    ]
  }
};

const ADVANCED_SCENARIOS = {
  borderClashAdvanced: {
    name: 'Border Clash - Advanced', width: 16, height: 12,
    mapString: SCENARIOS.borderClash.mapString, structures: SCENARIOS.borderClash.structures,
    units: [
      { type: 'infantry', x: 2, y: 2, team: 0 }, { type: 'infantry', x: 4, y: 2, team: 0 }, { type: 'infantry', x: 1, y: 3, team: 0 },
      { type: 'mech', x: 3, y: 3, team: 0 }, { type: 'tank', x: 2, y: 4, team: 0 }, { type: 'tank', x: 4, y: 4, team: 0 },
      { type: 'artillery', x: 3, y: 4, team: 0 }, { type: 'rocket', x: 2, y: 5, team: 0 },
      { type: 'infantry', x: 13, y: 9, team: 1 }, { type: 'infantry', x: 11, y: 9, team: 1 }, { type: 'infantry', x: 14, y: 8, team: 1 },
      { type: 'mech', x: 12, y: 8, team: 1 }, { type: 'tank', x: 13, y: 7, team: 1 }, { type: 'tank', x: 11, y: 7, team: 1 },
      { type: 'artillery', x: 12, y: 7, team: 1 }, { type: 'rocket', x: 13, y: 6, team: 1 }
    ]
  },
  siegeAdvanced: {
    name: 'Siege - Advanced', width: 18, height: 13,
    mapString: SCENARIOS.siege.mapString, structures: SCENARIOS.siege.structures,
    units: [
      { type: 'infantry', x: 8, y: 2, team: 1 }, { type: 'infantry', x: 10, y: 2, team: 1 }, { type: 'mech', x: 9, y: 3, team: 1 },
      { type: 'mech', x: 7, y: 3, team: 1 }, { type: 'tank', x: 7, y: 4, team: 1 }, { type: 'tank', x: 11, y: 4, team: 1 },
      { type: 'artillery', x: 9, y: 5, team: 1 }, { type: 'heavy', x: 9, y: 4, team: 1 },
      { type: 'infantry', x: 8, y: 10, team: 0 }, { type: 'infantry', x: 10, y: 10, team: 0 }, { type: 'mech', x: 9, y: 9, team: 0 },
      { type: 'tank', x: 7, y: 8, team: 0 }, { type: 'tank', x: 11, y: 8, team: 0 }, { type: 'tank', x: 9, y: 8, team: 0 },
      { type: 'artillery', x: 9, y: 7, team: 0 }, { type: 'rocket', x: 6, y: 9, team: 0 }
    ]
  },
  bridgeHeadAdvanced: {
    name: 'River Crossing - Advanced', width: 20, height: 14,
    mapString: SCENARIOS.bridgeHead.mapString, structures: SCENARIOS.bridgeHead.structures,
    units: [
      { type: 'infantry', x: 2, y: 2, team: 0 }, { type: 'infantry', x: 4, y: 2, team: 0 }, { type: 'infantry', x: 3, y: 1, team: 0 },
      { type: 'mech', x: 3, y: 3, team: 0 }, { type: 'tank', x: 2, y: 4, team: 0 }, { type: 'tank', x: 4, y: 4, team: 0 },
      { type: 'artillery', x: 3, y: 5, team: 0 }, { type: 'rocket', x: 1, y: 5, team: 0 },
      { type: 'infantry', x: 17, y: 11, team: 1 }, { type: 'infantry', x: 15, y: 11, team: 1 }, { type: 'infantry', x: 16, y: 12, team: 1 },
      { type: 'mech', x: 16, y: 10, team: 1 }, { type: 'tank', x: 17, y: 9, team: 1 }, { type: 'tank', x: 15, y: 9, team: 1 },
      { type: 'artillery', x: 16, y: 8, team: 1 }, { type: 'heavy', x: 18, y: 10, team: 1 }
    ]
  },
  gauntletAdvanced: {
    name: 'The Gauntlet - Advanced', width: 12, height: 16,
    mapString: SCENARIOS.gauntlet.mapString, structures: SCENARIOS.gauntlet.structures,
    units: [
      { type: 'infantry', x: 5, y: 2, team: 0 }, { type: 'infantry', x: 7, y: 2, team: 0 }, { type: 'mech', x: 6, y: 3, team: 0 },
      { type: 'mech', x: 4, y: 4, team: 0 }, { type: 'tank', x: 5, y: 4, team: 0 }, { type: 'tank', x: 7, y: 4, team: 0 },
      { type: 'heavy', x: 8, y: 5, team: 0 }, { type: 'artillery', x: 3, y: 4, team: 0 },
      { type: 'infantry', x: 6, y: 13, team: 1 }, { type: 'infantry', x: 4, y: 13, team: 1 }, { type: 'mech', x: 5, y: 12, team: 1 },
      { type: 'mech', x: 7, y: 11, team: 1 }, { type: 'tank', x: 6, y: 11, team: 1 }, { type: 'tank', x: 4, y: 11, team: 1 },
      { type: 'heavy', x: 3, y: 10, team: 1 }, { type: 'artillery', x: 8, y: 11, team: 1 }
    ]
  }
};
Object.assign(SCENARIOS, ADVANCED_SCENARIOS);

const SKIRMISH_TEMPLATES = {
  medium: {
    name: 'Lake Crossing', width: 16, height: 14, unitsPerSide: 11,
    mapString: `
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
≋············▲▲≋
≋·▲▲···♣♣····▲▲≋
≋·▲▲·≋≋≋≋≋≋····≋
≋···≋≋≋≋≋≋≋≋···≋
≋···≋≋≋≋≋≋≋≋≋··≋
≋···≋≋≋≋≋≋≋≋≋··≋
≋·≋≋≋≋≋≋≋≋≋≋···≋
≋··≋≋≋≋≋≋≋≋≋···≋
≋···≋≋≋≋≋≋≋≋···≋
≋·▲··≋≋≋≋≋≋·▲▲·≋
≋·▲▲···♣♣···▲▲·≋
≋·▲▲···········≋
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    randomizableZones: [
      {x: 2, y: 1, width: 5, height: 5}, {x: 9, y: 1, width: 5, height: 5},
      {x: 2, y: 8, width: 5, height: 5}, {x: 9, y: 8, width: 5, height: 5}
    ],
    stellarSpawnZones: [ {x: 1, y: 1, width: 5, height: 4}, {x: 1, y: 7, width: 4, height: 3} ],
    lunarSpawnZones: [ {x: 12, y: 1, width: 5, height: 4}, {x: 13, y: 10, width: 4, height: 3} ],
    stellarHQ: {x: 3, y: 2}, lunarHQ: {x: 13, y: 11}
  },
  large: {
    name: 'Mountain Frontier', width: 20, height: 16, unitsPerSide: 12,
    mapString: `
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
≋········▲▲········≋
≋·▲▲·····▲▲·····▲▲·≋
≋·▲▲··♣··▲▲··♣··▲▲·≋
≋·····♣··▲▲··♣·····≋
≋··♣·····▲▲·····♣··≋
≋········▲▲········≋
≋········══········≋
≋········══········≋
≋········▲▲········≋
≋···♣····▲▲····♣···≋
≋·····♣··▲▲··♣·····≋
≋·▲▲··♣··▲▲··♣··▲▲·≋
≋·▲▲·····▲▲·····▲▲·≋
≋········▲▲········≋
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    randomizableZones: [
      {x: 1, y: 1, width: 8, height: 5}, {x: 1, y: 6, width: 8, height: 4}, {x: 1, y: 10, width: 8, height: 5},
      {x: 13, y: 1, width: 8, height: 5}, {x: 13, y: 6, width: 8, height: 4}, {x: 13, y: 10, width: 8, height: 5}
    ],
    stellarSpawnZones: [ {x: 1, y: 1, width: 7, height: 5}, {x: 1, y: 6, width: 7, height: 4}, {x: 1, y: 10, width: 7, height: 5} ],
    lunarSpawnZones: [ {x: 12, y: 1, width: 7, height: 5}, {x: 12, y: 6, width: 7, height: 4}, {x: 12, y: 10, width: 7, height: 5} ],
    stellarHQ: {x: 3, y: 2}, lunarHQ: {x: 16, y: 13}
  }
};

function randomizeTerrainInZones(map, zones) {
    const swappableTypes = ['plain', 'wood'];
    zones.forEach(zone => {
        for (let y = zone.y; y < zone.y + zone.height; y++) {
            for (let x = zone.x; x < zone.x + zone.width; x++) {
                if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) {
                    const cell = map[y][x];
                    if (swappableTypes.includes(cell.type)) {
                        if (Math.random() < 0.3) cell.type = cell.type === 'plain' ? 'wood' : 'plain';
                        if (cell.type === 'plain' && Math.random() < 0.05) cell.type = 'mountain';
                    }
                }
            }
        }
    });
}

function varyPosition(basePos, maxVariation = 1) {
    return { x: basePos.x + Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation, y: basePos.y + Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation };
}

function findValidSpawnInZone(zone, map, occupiedPositions) {
    const attempts = 50;
    for (let i = 0; i < attempts; i++) {
        const x = zone.x + Math.floor(Math.random() * zone.width);
        const y = zone.y + Math.floor(Math.random() * zone.height);
        if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) continue;
        if (TERRAIN[map[y][x].type].move >= 255) continue;
        const key = `${x},${y}`;
        if (occupiedPositions.has(key)) continue;
        return {x, y};
    }
    return { x: zone.x + Math.floor(zone.width / 2), y: zone.y + Math.floor(zone.height / 2) };
}

function generateUnitComposition(count) {
    const composition = ['infantry', 'infantry', 'mech', 'tank', 'tank'];
    const fillerPool = ['infantry', 'mech', 'tank', 'heavy', 'artillery', 'rocket'];
    while (composition.length < count) composition.push(fillerPool[Math.floor(Math.random() * fillerPool.length)]);
    return composition.sort(() => Math.random() - 0.5);
}

// ==================== GAME STATE LOGIC ====================
function getUnitAt(x, y) { return units.find(u => u.x === x && u.y === y); }
function getStructureAt(x, y) { return structures.find(s => s.x === x && s.y === y); }

function loadScenario(scenarioId) {
    currentScenario = scenarioId; actionHistory = []; gameOver = false; gameWinner = null;
    gameHistory = []; aiThinking = false; pendingCaptures = [];
    aiDefendLatch = { 0: false, 1: false }; aiPaused = false; aiFast = false; turnsSinceLastCombat = 0; aiSession++;

    const randomBtn = document.getElementById('random-btn');
    const isSkirmish = scenarioId.startsWith('skirmish');
    randomBtn.style.display = isSkirmish ? 'inline-block' : 'none';

    if (isSkirmish) {
        loadSkirmish(scenarioId);
    } else {
        const scenario = SCENARIOS[scenarioId];
        boardWidth = scenario.width; boardHeight = scenario.height;
        map = parseMapString(scenario.mapString);
        structures = scenario.structures.map(s => ({ ...s, captureLeft: 20 }));
        units = scenario.units.map((u, idx) => ({
            id: idx, ...u, maxHp: UNITS[u.type].hp, hp: UNITS[u.type].hp,
            moved: false, hasAttacked: false, hasMovedThisTurn: false, pendingCapture: false
        }));
        turn = 0; selectedUnit = null; movableTiles = []; attackableTiles = [];
    }

    document.getElementById('scenario-picker').value = scenarioId;
    if (typeof _pendingScenario !== 'undefined') _pendingScenario = scenarioId;
    log(`Scenario: ${SCENARIOS[scenarioId]?.name || scenarioId} loaded`);
    render(); updateUI();
}

function randomizeCurrent() { if (currentScenario.startsWith('skirmish')) loadSkirmish(currentScenario); }

function loadSkirmish(type) {
    const templateKey = type === 'skirmishMedium' ? 'medium' : 'large';
    const template = SKIRMISH_TEMPLATES[templateKey];
    boardWidth = template.width; boardHeight = template.height;
    map = parseMapString(template.mapString);
    randomizeTerrainInZones(map, template.randomizableZones);

    const stellarHQPos = varyPosition(template.stellarHQ, 1), lunarHQPos = varyPosition(template.lunarHQ, 1);
    structures = [{ type: 'hq', x: stellarHQPos.x, y: stellarHQPos.y, team: 0, captureLeft: 20 }, { type: 'hq', x: lunarHQPos.x, y: lunarHQPos.y, team: 1, captureLeft: 20 }];

    const stellarComposition = generateUnitComposition(template.unitsPerSide), lunarComposition = generateUnitComposition(template.unitsPerSide);
    units = []; let unitId = 0; const occupiedPositions = new Set();
    occupiedPositions.add(`${stellarHQPos.x},${stellarHQPos.y}`); occupiedPositions.add(`${lunarHQPos.x},${lunarHQPos.y}`);

    const spawnSide = (composition, spawnZones, teamId) => {
        composition.forEach((unitType, idx) => {
            const zone = spawnZones[idx % spawnZones.length];
            const pos = findValidSpawnInZone(zone, map, occupiedPositions);
            occupiedPositions.add(`${pos.x},${pos.y}`);
            units.push({ id: unitId++, type: unitType, x: pos.x, y: pos.y, team: teamId, maxHp: UNITS[unitType].hp, hp: UNITS[unitType].hp, moved: false, hasAttacked: false, hasMovedThisTurn: false, pendingCapture: false });
        });
    };

    spawnSide(stellarComposition, template.stellarSpawnZones, 0);
    spawnSide(lunarComposition, template.lunarSpawnZones, 1);
    turn = 0; selectedUnit = null; movableTiles = []; attackableTiles = [];

    render(); updateUI(); log(`Skirmish: ${template.name}`);
}

function queueCapture(unit, structure) {
    if (structure.team === unit.team) return;
    if (!UNITS[unit.type].capture) return;
    unit.pendingCapture = true;
    if (!pendingCaptures.find(pc => pc.unit === unit && pc.structure === structure)) pendingCaptures.push({ unit, structure });
}

function processPendingCaptures() {
    if (pendingCaptures.length === 0) return;
    const infoEl = document.getElementById('pending-capture-info');

    for (const { unit, structure } of pendingCaptures) {
        if (!units.includes(unit) || unit.x !== structure.x || unit.y !== structure.y) continue;

        const capturePoints = Math.max(1, Math.floor((unit.hp / unit.maxHp) * 10));
        structure.captureLeft -= capturePoints;
        const tName = TEAMS[unit.team];

        infoEl.style.display = 'block';
        infoEl.style.color = unit.team === 0 ? '#ffd700' : '#4da6ff';
        infoEl.textContent = `${tName} seizing HQ: -${capturePoints} pts (${Math.max(0, structure.captureLeft)} rem)`;
        log(`${tName} ${UNITS[unit.type].name} captures ${capturePoints} pts (${structure.captureLeft} rem)`);

        if (structure.captureLeft <= 0) {
            structure.team = unit.team;
            structure.captureLeft = 20;
            infoEl.textContent = `★ HQ CAPTURED by ${tName}! ★`;
            infoEl.style.color = '#00ff00';
            log(`HQ CAPTURED by ${tName}!`);
            const allHQs = structures.filter(s => s.type === 'hq');
            if (allHQs.every(s => s.team === 0)) { gameOver = true; gameWinner = 0; log(`Victory! Gold wins!`); }
            else if (allHQs.every(s => s.team === 1)) { gameOver = true; gameWinner = 1; log(`Victory! Blue wins!`); }
        }
    }
    pendingCaptures = [];
    units.forEach(u => u.pendingCapture = false);
    requestAnimationFrame(render);
}

function endTurn() {
    recordTurnSnapshot(turn);

    units.forEach(u => {
        if (u.team === turn) {
            const s = getStructureAt(u.x, u.y);
            if (s && s.type === 'hq' && s.team !== u.team && UNITS[u.type].capture) queueCapture(u, s);
        }
    });

    processPendingCaptures();
    if (gameOver) { finalizeHistory(gameWinner); return; }

    const stellarUnits = units.filter(u => u.team === 0), lunarUnits = units.filter(u => u.team === 1);
    const stellarCanCapture = stellarUnits.some(u => UNITS[u.type].capture), lunarCanCapture = lunarUnits.some(u => UNITS[u.type].capture);
    // Annihilation: winner must have capturers to claim a true win, else stalemate (Cases 3-6)
    if (lunarUnits.length === 0) {
        if (stellarCanCapture) { gameOver = true; gameWinner = 0; log('Enemy Destroyed! Gold wins!'); finalizeHistory(0); updateUI(); return; }
        else { gameOver = true; gameWinner = -1; log('Enemy Destroyed, but Gold has no capture units — Stalemate!'); finalizeHistory(-1); updateUI(); return; }
    }
    if (stellarUnits.length === 0) {
        if (lunarCanCapture) { gameOver = true; gameWinner = 1; log('Allied Army Destroyed! Blue wins!'); finalizeHistory(1); updateUI(); return; }
        else { gameOver = true; gameWinner = -1; log('Allied Army Destroyed, but Blue has no capture units — Stalemate!'); finalizeHistory(-1); updateUI(); return; }
    }
    // Both sides alive, neither can capture (Case 7)
    if (!stellarCanCapture && !lunarCanCapture) { gameOver = true; gameWinner = -1; log('Stalemate! Neither side has capture units. Game ends in a draw.'); finalizeHistory(-1); updateUI(); return; }

    turn = 1 - turn; lastThreatCheckState = false; turnsSinceLastCombat++;
    units.forEach(u => { u.moved = false; u.hasAttacked = false; u.hasMovedThisTurn = false; });
    selectedUnit = null; movableTiles = []; attackableTiles = []; actionHistory = [];

    render(); updateUI();

    if (turn === 1 && !gameOver) setTimeout(() => runAITurn(1), 500);
    else if (turn === 0 && !gameOver && gameMode === 'avai') setTimeout(() => runAITurn(0), 500);
}

function recordMove(unit, fromX, fromY) { actionHistory.push({ type: 'move', unit, fromX, fromY, toX: unit.x, toY: unit.y }); updateUndoButton(); }
function recordCombat() { actionHistory = []; updateUndoButton(); }
function updateUndoButton() { const btn = document.getElementById('undo-btn'); btn.disabled = actionHistory.length === 0 || turn !== 0 || aiThinking; }

function undoMove() {
    if (actionHistory.length === 0 || turn !== 0 || aiThinking) return;
    const lastAction = actionHistory.pop();

    if (lastAction.type === 'move') {
        const unit = lastAction.unit;
        unit.x = lastAction.fromX; unit.y = lastAction.fromY;
        unit.moved = false; unit.hasMovedThisTurn = false; unit.hasAttacked = false; unit.pendingCapture = false;
        pendingCaptures = pendingCaptures.filter(pc => pc.unit !== unit);
        log('Movement undone');
    } else if (lastAction.type === 'combat') {
        const { attacker, defender, damageDealt, counterDamage, deadUnit } = lastAction;
        defender.hp += damageDealt; attacker.hp += counterDamage;
        if (deadUnit) { units.push(deadUnit); log(`${UNITS[deadUnit.type].name} resurrection (Undo)`); }
        attacker.hasAttacked = false; log('Combat undone');
    }
    selectedUnit = null; movableTiles = []; attackableTiles = [];
    render(); updateUndoButton();
}

function onCellClick(x, y) {
    if (gameOver || turn !== 0 || aiThinking) return;
    const clickedUnit = getUnitAt(x, y);
    const clickedStruct = getStructureAt(x, y);

    showTileInfo(x, y); // Always update info panel on click (mobile friendly)

    if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
        selectedUnit = null; movableTiles = []; attackableTiles = []; render(); return;
    }

    if (clickedUnit && clickedUnit.team === 0) {
        if (clickedUnit.moved && clickedUnit.hasAttacked) { reportFail("Unit already acted."); return; }
        selectedUnit = clickedUnit;
        movableTiles = clickedUnit.moved ? [] : getMovableTiles(clickedUnit, true);
        attackableTiles = getAttackTargets(clickedUnit);
        render(); return;
    } else if (clickedUnit && !selectedUnit) {
        reportFail("Cannot control enemy."); return;
    }

    if (selectedUnit) {
        const isAttackable = attackableTiles.find(t => t.x === x && t.y === y);
        const isMovable = movableTiles.find(t => t.x === x && t.y === y);

        if (isAttackable && clickedUnit && clickedUnit.team !== 0) {
            aiThinking = true;
            highlightTarget(clickedUnit.x, clickedUnit.y, true);
            recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);

            const res = resolveCombat(selectedUnit, clickedUnit);
            recordCombat();

            if (res.damage > 0) spawnFloatingText(clickedUnit.x, clickedUnit.y, `-${res.damage}`, "damage");
            else spawnFloatingText(clickedUnit.x, clickedUnit.y, "MISS", "miss");
            if (res.counter > 0) setTimeout(() => spawnFloatingText(selectedUnit.x, selectedUnit.y, `-${res.counter}`, "counter"), 200);

            selectedUnit.moved = true; selectedUnit.hasAttacked = true; selectedUnit.hasMovedThisTurn = true;

            setTimeout(() => {
                highlightTarget(clickedUnit.x, clickedUnit.y, false);
                selectedUnit = null; movableTiles = []; attackableTiles = [];
                aiThinking = false; render(); updateUI();
            }, 1200);
            return;
        }

        if (isMovable && (!clickedUnit || (clickedStruct && clickedStruct.type === 'hq' && UNITS[selectedUnit.type].capture))) {
            recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);
            selectedUnit.x = x; selectedUnit.y = y;

            if (clickedStruct && clickedStruct.team !== selectedUnit.team && UNITS[selectedUnit.type].capture) queueCapture(selectedUnit, clickedStruct);

            if (UNITS[selectedUnit.type].ranged) {
                selectedUnit.moved = true; selectedUnit.hasMovedThisTurn = true;
                selectedUnit = null; movableTiles = []; attackableTiles = [];
            } else {
                selectedUnit.moved = true; selectedUnit.hasMovedThisTurn = true;
                movableTiles = []; attackableTiles = getAttackTargets(selectedUnit);
            }
            checkPlayerDetection(); render(); updateUI(); return;
        }

        if (clickedUnit) {
            if (clickedUnit.team === 0) reportFail("Cannot attack friendly."); else reportFail("Target out of range.");
        } else {
            const terrain = map[y][x];
            if (TERRAIN[terrain.type].move >= 255) reportFail("Impassable."); else reportFail("Too far.");
        }
    }
}

// ==================== UI STATE & MENUS ====================
function updateUI() {
    document.getElementById('turn').textContent = turn + 1;
    const teamEl = document.getElementById('team');
    const isAIvsAI = gameMode === 'avai';

    if (aiThinking) {
        teamEl.textContent = `${TEAMS[turn === 0 ? 0 : 1]} Moving...`;
        teamEl.className = turn === 0 ? 'stellar' : 'lunar';
    } else {
        teamEl.textContent = TEAMS[turn === 0 ? 0 : 1];
        teamEl.className = turn === 0 ? 'stellar' : 'lunar';
    }

    // Always keep mode buttons in sync with actual gameMode state
    document.getElementById('mode-hvai-btn').classList.toggle('active-mode', gameMode === 'hvai');
    document.getElementById('mode-avai-btn').classList.toggle('active-mode', gameMode === 'avai');

    const endTurnBtn = document.querySelector('button[onclick="confirmEndTurn()"]');
    if (endTurnBtn) endTurnBtn.disabled = aiThinking || gameOver || isAIvsAI;

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.disabled = actionHistory.length === 0 || turn !== 0 || aiThinking || isAIvsAI;

    const pauseBtn = document.getElementById('pause-btn'), fastBtn = document.getElementById('fast-btn');
    if (pauseBtn) { pauseBtn.style.display = isAIvsAI ? 'inline-block' : 'none'; pauseBtn.textContent = aiPaused ? 'Resume' : 'Pause'; }
    if (fastBtn) { fastBtn.style.display = isAIvsAI ? 'inline-block' : 'none'; fastBtn.textContent = aiFast ? 'Slow' : 'Fast Speed'; fastBtn.classList.toggle('active-mode', aiFast); }
}

const logQueue = []; let logBusy = false;
function log(msg) { logQueue.push(msg); if (!logBusy) processLogQueue(); }
function processLogQueue() {
    if (logQueue.length === 0) { logBusy = false; return; }
    logBusy = true;
    const msg = logQueue.shift();
    const logDiv = document.getElementById('log');
    const entry = document.createElement('div');
    entry.textContent = `> ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
    setTimeout(processLogQueue, 50);
}

function setGameMode(mode) {
    if (mode === gameMode) return;
    gameMode = mode; aiPaused = false; aiFast = false;
    document.getElementById('mode-hvai-btn').classList.toggle('active-mode', mode === 'hvai');
    document.getElementById('mode-avai-btn').classList.toggle('active-mode', mode === 'avai');

    if (mode === 'avai') {
        log('AI vs AI — switching mode, continuing game.');
        if (!gameOver && turn === 0 && !aiThinking) setTimeout(() => runAITurn(0), 800);
    } else {
        log('Human vs AI — your move, Gold!');
    }
    updateUI();
}

function togglePause() { if (gameMode !== 'avai') return; aiPaused = !aiPaused; updateUI(); log(aiPaused ? 'AI vs AI paused.' : 'AI vs AI resumed.'); }
function toggleFast() { if (gameMode !== 'avai') return; aiFast = !aiFast; updateUI(); log(aiFast ? 'Fast mode ON — animations disabled.' : 'Normal speed — animations restored.'); }

let _menuOpen = false;
function toggleMenu() {
    _menuOpen = !_menuOpen;
    document.getElementById('menu-panel').classList.toggle('open', _menuOpen);
    document.getElementById('menu-toggle-btn').classList.toggle('active-mode', _menuOpen);
}

let _pendingScenario = null;
function previewScenario(id) { _pendingScenario = id; }
function commitScenario() {
    const id = _pendingScenario || document.getElementById('scenario-picker').value;
    const inProgress = isInProgress();
    if (inProgress && id !== currentScenario) { document.getElementById('scenario-confirm-modal').style.display = 'block'; } else { _doLoadScenario(id); }
}
function executeCommitScenario() { document.getElementById('scenario-confirm-modal').style.display = 'none'; _doLoadScenario(_pendingScenario || currentScenario); }
function cancelCommitScenario() {
    document.getElementById('scenario-confirm-modal').style.display = 'none';
    const picker = document.getElementById('scenario-picker'); if (picker) picker.value = currentScenario;
    _pendingScenario = currentScenario;
}
function _doLoadScenario(id) { loadScenario(id); if (gameMode === 'avai') setTimeout(() => runAITurn(0), 800); }

// ==================== HISTORY & ANALYSIS ====================
function evaluatePosition() {
    const goldUnits = units.filter(u => u.team === 0), blueUnits = units.filter(u => u.team === 1);
    const calcMaterial = side => side.reduce((s, u) => s + Math.round((UNIT_VALUE[u.type] || 20) * (u.hp / u.maxHp)), 0);

    const goldMaterial = calcMaterial(goldUnits), blueMaterial = calcMaterial(blueUnits);
    const mapSize = boardWidth + boardHeight;
    const goldHQ = structures.find(s => s.type === 'hq' && s.team === 0), blueHQ = structures.find(s => s.type === 'hq' && s.team === 1);
    const blueHQDist = blueHQ ? getDistToHQ(blueHQ.x, blueHQ.y) : null, goldHQDist = goldHQ ? getDistToHQ(goldHQ.x, goldHQ.y) : null;

    const calcPressure = (capturers, hqDistMap) => { if (!hqDistMap) return 0; return capturers.filter(u => UNITS[u.type].capture).reduce((s, u) => { const dist = hqDistMap[u.y][u.x]; return s + Math.max(0, mapSize - dist); }, 0); };

    const goldPressure = calcPressure(goldUnits, blueHQDist), bluePressure = calcPressure(blueUnits, goldHQDist);
    let goldSeize = 0, blueSeize = 0;

    if (blueHQ && blueHQ.captureLeft < 20) goldSeize = (20 - blueHQ.captureLeft) * 12;
    if (goldHQ && goldHQ.captureLeft < 20) blueSeize = (20 - goldHQ.captureLeft) * 12;

    const goldTotal = goldMaterial + goldPressure + goldSeize, blueTotal = blueMaterial + bluePressure + blueSeize;
    return { goldCount: goldUnits.length, blueCount: blueUnits.length, goldMaterial, blueMaterial, goldPressure, bluePressure, goldSeize, blueSeize, goldTotal, blueTotal, balance: goldTotal - blueTotal };
}

function recordTurnSnapshot(mover) {
    const ev = evaluatePosition();
    const calcDoctrineForTeam = (team) => {
        const ownMat = team === 0 ? ev.goldMaterial : ev.blueMaterial, enemyMat = team === 0 ? ev.blueMaterial : ev.goldMaterial;
        const ratio = enemyMat > 0 ? ownMat / enemyMat : 1;
        const depth = ratio >= 0.85 ? 0 : Math.min(1, (0.85 - ratio) / 0.35);
        const breach = ratio > 1.3 ? Math.max(0.2, 1.8 - ratio) : 1.0;
        return { ratio: Math.round(ratio * 100) / 100, conserveDepth: Math.round(depth * 100) / 100, breachMultiplier: Math.round(breach * 100) / 100 };
    };

    const goldDoctrine = calcDoctrineForTeam(0), blueDoctrine = calcDoctrineForTeam(1);
    const movedStates = units.map(u => u.moved);
    units.forEach(u => { u.moved = false; });
    const dangerVsGold = buildDangerMap(0), dangerVsBlue = buildDangerMap(1), safetyVsBlue = buildSafetyMap(1), safetyVsGold = buildSafetyMap(0);
    units.forEach((u, i) => { u.moved = movedStates[i]; });

    const goldHQ = structures.find(s => s.type === 'hq' && s.team === 0), blueHQ = structures.find(s => s.type === 'hq' && s.team === 1);
    const blueHQDist = blueHQ ? getDistToHQ(blueHQ.x, blueHQ.y) : null, goldHQDist = goldHQ ? getDistToHQ(goldHQ.x, goldHQ.y) : null;

    const unitSnapshot = units.map(u => {
        const isGold = u.team === 0;
        const doctrine = isGold ? goldDoctrine : blueDoctrine;
        const dangerScore = isGold ? dangerVsBlue[u.y][u.x] : dangerVsGold[u.y][u.x];
        const safetyScore = isGold ? safetyVsBlue[u.y][u.x] : safetyVsGold[u.y][u.x];
        const hqDistMap = isGold ? blueHQDist : goldHQDist;
        const caution = (UNIT_CAUTION[u.type] || 3) * (1 + doctrine.conserveDepth * 1.5) * doctrine.breachMultiplier;
        const terrainDef = TERRAIN[map[u.y][u.x].type].def;
        const rawDanger = dangerScore * terrainDef * caution;
        const approachWeight = 3 * (1 - doctrine.conserveDepth * 0.8);
        const hqPullWeight = 4 + doctrine.conserveDepth * 10;
        const enemyTeam = 1 - u.team;
        let distToNearestEnemy = 99;

        units.forEach(e => { if (e.team === enemyTeam) { const d = Math.abs(e.x - u.x) + Math.abs(e.y - u.y); if (d < distToNearestEnemy) distToNearestEnemy = d; } });

        return {
            team: isGold ? 'gold' : 'blue', type: u.type, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp,
            hpPct: Math.round((u.hp / u.maxHp) * 100), terrain: map[u.y][u.x].type,
            dangerScore: Math.round(dangerScore * 10) / 10, safetyScore: Math.round(safetyScore * 10) / 10,
            distToEnemyHQ: hqDistMap ? hqDistMap[u.y][u.x] : null, distToNearestEnemy,
            materialRatio: doctrine.ratio, conserveDepth: doctrine.conserveDepth, breachMultiplier: doctrine.breachMultiplier,
            caution: Math.round(caution * 100) / 100, rawDanger: Math.round(rawDanger * 100) / 100,
            approachWeight: Math.round(approachWeight * 100) / 100, hqPullWeight: Math.round(hqPullWeight * 100) / 100
        };
    });

    gameHistory.push({ snapTurn: gameHistory.length + 1, gameTurn: turn + 1, mover, ...ev, units: unitSnapshot, hindsightValue: null, outcome: null });
}

function finalizeHistory(winner) {
    const n = gameHistory.length; if (n === 0) return;
    const signal = winner === 0 ? 1 : winner === 1 ? -1 : 0;
    const outcomeLabel = winner === 0 ? 'Gold wins' : winner === 1 ? 'Blue wins' : 'Draw';
    gameHistory.forEach((snap, i) => { snap.hindsightValue = Math.round(signal * ((i + 1) / n) * 100); snap.outcome = outcomeLabel; });
    log(`History finalized — ${n} turns · outcome: ${outcomeLabel}. Open History to review.`);
}

function openHistoryModal() {
    if (gameHistory.length === 0) { log('No history yet — turns are recorded as the game progresses.'); return; }
    document.getElementById('history-title-scenario').textContent = SCENARIOS[currentScenario]?.name || currentScenario;
    const finished = gameHistory.some(s => s.outcome !== null);
    document.getElementById('history-subtitle').innerHTML = `${gameHistory.length} turn snapshot${gameHistory.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Mode: ${gameMode === 'avai' ? 'AI vs AI' : 'Human vs AI'} &nbsp;·&nbsp; ` + (finished ? `Outcome: <strong style="color:#4c4">${gameHistory[gameHistory.length - 1].outcome}</strong>` : '<em style="color:#aaa">In progress — hindsight assigned after game ends</em>');
    buildHistoryTable(); drawHistoryChart(); document.getElementById('history-modal').style.display = 'block';
}
function closeHistoryModal() { document.getElementById('history-modal').style.display = 'none'; }

function buildHistoryTable() {
    const tbody = document.getElementById('history-tbody'); tbody.innerHTML = '';
    gameHistory.forEach(s => {
        const tr = document.createElement('tr');
        const moverHtml = s.mover === 0 ? `<span class="h-gold">Gold</span>` : `<span class="h-blue">Blue</span>`;
        const balCls = s.balance > 0 ? 'h-pos' : s.balance < 0 ? 'h-neg' : 'h-zero';
        const balStr = s.balance > 0 ? `+${s.balance}` : `${s.balance}`;

        let hintStr, hintCls;
        if (s.hindsightValue === null) { hintStr = '—'; hintCls = 'h-pending'; }
        else { hintCls = s.hindsightValue > 5 ? 'h-pos' : s.hindsightValue < -5 ? 'h-neg' : 'h-zero'; hintStr = s.hindsightValue > 0 ? `+${s.hindsightValue}` : `${s.hindsightValue}`; }

        let seizeHtml = '<span class="h-zero">—</span>';
        if (s.goldSeize > 0 || s.blueSeize > 0) {
            const parts = []; if (s.goldSeize > 0) parts.push(`<span class="h-gold">G+${s.goldSeize}</span>`); if (s.blueSeize > 0) parts.push(`<span class="h-blue">B+${s.blueSeize}</span>`);
            seizeHtml = parts.join(' ');
        }

        tr.innerHTML = `<td>${s.snapTurn}</td><td>${moverHtml}</td><td><span class="h-gold">${s.goldCount}u · ${s.goldMaterial}pt</span></td><td><span class="h-blue">${s.blueCount}u · ${s.blueMaterial}pt</span></td><td><span class="h-gold">${s.goldPressure}</span></td><td><span class="h-blue">${s.bluePressure}</span></td><td>${seizeHtml}</td><td><span class="${balCls}">${balStr}</span></td><td><span class="${hintCls}">${hintStr}</span></td>`;
        tbody.appendChild(tr);
    });
    const wrap = document.getElementById('history-table-wrap'); setTimeout(() => { wrap.scrollTop = wrap.scrollHeight; }, 50);
}

function drawHistoryChart() {
    const canvas = document.getElementById('history-chart'); const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 640; canvas.height = canvas.offsetHeight || 80;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);

    const balances = gameHistory.map(s => s.balance); const n = balances.length;
    if (n < 2) { ctx.fillStyle = '#444'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText('Need at least 2 turns to render chart', W / 2, H / 2 + 4); return; }

    const maxAbs = Math.max(1, ...balances.map(Math.abs));
    const toY = v => H / 2 - (v / maxAbs) * (H / 2 - 8); const toX = i => 1 + (i / (n - 1)) * (W - 2);

    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX(0), H / 2); balances.forEach((v, i) => ctx.lineTo(toX(i), toY(v))); ctx.lineTo(toX(n - 1), H / 2); ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,215,0,0.30)'); grad.addColorStop(0.5, 'rgba(120,120,120,0.05)'); grad.addColorStop(1, 'rgba(77,166,255,0.30)');
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    balances.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v))); ctx.stroke();
    balances.forEach((v, i) => { ctx.beginPath(); ctx.arc(toX(i), toY(v), 2.5, 0, Math.PI * 2); ctx.fillStyle = v > 0 ? '#ffd700' : v < 0 ? '#4da6ff' : '#888'; ctx.fill(); });

    ctx.fillStyle = '#444'; ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.fillText('Gold ▲', 4, 11); ctx.fillText('Blue ▼', 4, H - 3); ctx.textAlign = 'right'; ctx.fillText(`Turn ${n}`, W - 3, H - 3);
}

function exportHistoryJSON() {
    if (gameHistory.length === 0) { log('No history to export yet.'); return; }
    const payload = {
        scenario: currentScenario, scenarioName: SCENARIOS[currentScenario]?.name || currentScenario, mode: gameMode, exportedAt: new Date().toISOString(), outcome: gameHistory[gameHistory.length - 1].outcome ?? 'in-progress',
        metricNotes: {
            material: 'HP-weighted sum of UNIT_VALUE per side (damaged units count less)', pressure: 'Sum of (mapSize − dist_to_enemy_HQ) for each capturing unit', seizure: 'Active HQ capture progress × 12 (immediate win threat)',
            total: 'material + pressure + seizure for each side', balance: 'goldTotal − blueTotal  (positive = Gold favoured)', hindsight: 'outcome_signal × (i+1)/n × 100  [null until game ends]', hindsightFormula:'signal: +1=GoldWins −1=BlueWins 0=Draw | weight=(snapIndex+1)/totalSnaps',
            unitFields: { dangerScore: 'Raw danger map value at unit position', safetyScore: 'Safety map value — 0 if inside fire envelope, 10+terrainDef*10 if outside', hpPct: 'hp/maxHp as integer percentage', distToEnemyHQ: 'BFS walkable distance to enemy HQ', distToNearestEnemy: 'Manhattan distance to nearest enemy unit', terrain: 'Terrain type at unit position', materialRatio: 'ownMaterial / enemyMaterial at snapshot time', conserveDepth: '0 when ratio>=0.85; scales to 1.0 — drives caution up, approachWeight down', breachMultiplier: 'Reduces self-preservation when AI has large material advantage', caution: 'UNIT_CAUTION*(1+conserveDepth*1.5)*breachMultiplier — multiplies rawDanger', rawDanger: 'dangerScore*terrainDef*caution — actual penalty applied to tile score', approachWeight: '3*(1-conserveDepth*0.8) — per-tile bonus for closing on enemy', hqPullWeight: '4+conserveDepth*10 — per-tile bonus for advancing toward enemy HQ' }
        }, turns: gameHistory
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gridwars_history_${currentScenario}_${Date.now()}.json`; a.click();
    log(`History exported — ${gameHistory.length} turns.`);
}

// ==================== SAVE, LOAD & SAFETY CONFIRMS ====================
function saveGame() {
    if (aiThinking) { reportFail("Cannot save during AI turn."); return; }
    const savedUnits = units.map(u => ({ id: u.id, type: u.type, x: u.x, y: u.y, team: u.team, hp: u.hp, maxHp: u.maxHp, moved: u.moved, hasAttacked: u.hasAttacked, hasMovedThisTurn: u.hasMovedThisTurn, pendingCapture: u.pendingCapture }));
    const savedStructures = structures.map(s => ({ type: s.type, x: s.x, y: s.y, team: s.team, captureLeft: s.captureLeft }));
    const savedMap = map.map(row => row.map(cell => cell.type));
    const saveData = { version: 1, timestamp: Date.now(), currentScenario, boardWidth, boardHeight, map: savedMap, units: savedUnits, structures: savedStructures, turn, gameOver, gameWinner, aiDefendLatch, lastThreatCheckState, gameMode, aiFast, gameHistory, turnsSinceLastCombat };
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        const ts = new Date(saveData.timestamp).toLocaleTimeString(); log(`Game saved — Turn ${turn + 1} · ${ts}`);
        updateLoadButtonState();
    } catch (e) { reportFail("Save failed: " + e.message); }
}

function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { reportFail("No save found."); return; }
    let saveData;
    try { saveData = JSON.parse(raw); } catch (e) { reportFail("Save data corrupted."); return; }
    if (!saveData || saveData.version !== 1) { reportFail("Incompatible save version."); return; }

    currentScenario = saveData.currentScenario; boardWidth = saveData.boardWidth; boardHeight = saveData.boardHeight;
    map = saveData.map.map((row, y) => row.map((type, x) => ({ type, x, y })));
    structures = saveData.structures.map(s => ({ ...s }));
    units = saveData.units.map(u => ({ ...u }));
    turn = saveData.turn; gameOver = saveData.gameOver; gameWinner = saveData.gameWinner ?? null;
    aiDefendLatch = saveData.aiDefendLatch ?? { 0: false, 1: false }; lastThreatCheckState = saveData.lastThreatCheckState;
    gameMode = saveData.gameMode ?? 'hvai'; aiPaused = false; aiFast = saveData.aiFast ?? false;
    gameHistory = saveData.gameHistory ?? []; turnsSinceLastCombat = saveData.turnsSinceLastCombat ?? 0;

    document.getElementById('mode-hvai-btn').classList.toggle('active-mode', gameMode === 'hvai');
    document.getElementById('mode-avai-btn').classList.toggle('active-mode', gameMode === 'avai');
    selectedUnit = null; movableTiles = []; attackableTiles = []; actionHistory = []; aiThinking = false; pendingCaptures = [];

    const picker = document.getElementById('scenario-picker'); if (picker) picker.value = currentScenario;
    render(); updateUI(); updateLoadButtonState();
    log(`Game loaded.`);
    if (!gameOver) { if (turn === 1) setTimeout(() => runAITurn(1), 800); else if (turn === 0 && gameMode === 'avai') setTimeout(() => runAITurn(0), 800); }
}

function updateLoadButtonState() {
    const btn = document.getElementById('load-btn'); if (!btn) return;
    const hasSave = !!localStorage.getItem(SAVE_KEY); btn.disabled = !hasSave;
}

function reportFail(msg) {
    const el = document.getElementById('pending-capture-info');
    el.textContent = `✖ ${msg}`; el.style.color = '#ff5566'; el.style.display = 'block';
    if (window.failTimer) clearTimeout(window.failTimer);
    window.failTimer = setTimeout(() => { if (el.textContent.includes('✖')) el.style.display = 'none'; }, 1500);
}

function confirmEndTurn() {
    const unmovedUnits = units.filter(u => u.team === 0 && !u.hasMovedThisTurn);
    if (unmovedUnits.length > 0) {
        document.getElementById('turn-confirm-msg').textContent = `You have ${unmovedUnits.length} unmoved unit${unmovedUnits.length !== 1 ? 's' : ''}. End turn anyway?`;
        document.getElementById('turn-confirm-modal').style.display = 'block';
    } else executeEndTurn();
}
function executeEndTurn() { closeTurnConfirm(); endTurn(); }
function closeTurnConfirm() { document.getElementById('turn-confirm-modal').style.display = 'none'; }
function confirmReset() { document.getElementById('modal-overlay').style.display = 'block'; }
function executeReset() {
    closeModal(); loadScenario(currentScenario);
    if (gameMode === 'avai') { log('AI vs AI — Restarting...'); setTimeout(() => runAITurn(0), 800); }
}
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

function isInProgress() { return !gameOver && (turn > 0 || units.some(u => u.hasMovedThisTurn || u.hasAttacked || u.moved)); }

function showConfirm(title, message, onYes) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').innerHTML = message;
    const modal = document.getElementById('confirm-modal');
    modal.style.display = 'flex';

    const yesBtn = document.getElementById('confirm-yes');
    const noBtn  = document.getElementById('confirm-no');

    yesBtn.addEventListener('click', function yesHandler() {
        modal.style.display = 'none';
        onYes();
        yesBtn.removeEventListener('click', yesHandler);
    }, { once: true });

    noBtn.addEventListener('click', function noHandler() {
        modal.style.display = 'none';
        noBtn.removeEventListener('click', noHandler);
    }, { once: true });
}

function confirmSetMode(newMode) {
    if (newMode === gameMode) return;
    if (!gameOver && units.length > 0) {
        showConfirm("Switch Mode?", "Switching mode requires a reset. Current progress will be lost.<br>Reset and switch?", () => {
            setGameMode(newMode);
            loadScenario(currentScenario);
            if (newMode === 'avai') setTimeout(() => runAITurn(0), 800);
        });
    } else {
        setGameMode(newMode);
        if (newMode === 'avai' && !gameOver) setTimeout(() => runAITurn(0), 800);
    }
}

function confirmLoadGame() {
    if (isInProgress()) {
        showConfirm("Load Saved Game?", "Current progress will be lost.<br>Load saved game anyway?", loadGame);
    } else { loadGame(); }
}

function confirmRandomize() {
    if (isInProgress()) {
        showConfirm("New Random Map?", "Current game will be lost.<br>Generate a new random skirmish map?", randomizeCurrent);
    } else { randomizeCurrent(); }
}

// ==================== INITIALIZATION ====================
window.addEventListener('resize', resizeBoard);
loadScenario('borderClash');
updateLoadButtonState();
_pendingScenario = 'borderClash';
