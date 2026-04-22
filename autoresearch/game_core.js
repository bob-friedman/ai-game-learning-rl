'use strict';
// ============================================================
// game_core.js  —  FIXED: do not modify
// Headless game engine extracted from game.js.
// All functions take an explicit `state` object; no DOM, no async.
// ============================================================

const TEAMS = ['Gold', 'Blue'];

const UNITS = {
    infantry:  { name: 'Infantry',    hp: 10, move: 3, vision: 2, damage: { infantry:5,tank:2,mech:3,heavy:2,artillery:4,rocket:3 }, capture:true,  ranged:false },
    tank:      { name: 'Tank',         hp: 10, move: 2, vision: 3, damage: { infantry:8,tank:6,mech:5,heavy:4,artillery:5,rocket:6 }, capture:false, ranged:false },
    mech:      { name: 'Mech',         hp: 12, move: 2, vision: 2, damage: { infantry:6,tank:5,mech:5,heavy:3,artillery:6,rocket:5 }, capture:true,  ranged:false },
    heavy:     { name: 'Heavy Tank',   hp: 16, move: 2, vision: 2, damage: { infantry:10,tank:8,mech:9,heavy:6,artillery:7,rocket:8 }, capture:false, ranged:false },
    artillery: { name: 'Artillery',    hp: 8,  move: 2, vision: 5, damage: { infantry:9,tank:8,mech:8,heavy:6,artillery:5,rocket:7 }, capture:false, ranged:true, minRange:3, maxRange:4 },
    rocket:    { name: 'Rocket',       hp: 7,  move: 2, vision: 4, damage: { infantry:6,tank:10,mech:9,heavy:8,artillery:6,rocket:5 }, capture:false, ranged:true, minRange:3, maxRange:5 }
};

const TERRAIN = {
    plain:    { def: 0.85, move: 1 },
    wood:     { def: 0.70, move: 2 },
    mountain: { def: 0.40, move: 3 },
    road:     { def: 1.00, move: 1 },
    water:    { def: 0.00, move: 255 }
};

// ---- Scenarios -------------------------------------------------------
function parseMapString(str) {
    const charMap = { '·':'plain','♣':'wood','▲':'mountain','═':'road','≋':'water' };
    return str.trim().split('\n').map((line,y) =>
        line.split('').map((ch,x) => ({ type: charMap[ch] || 'plain', x, y }))
    );
}

const SCENARIOS = {
    borderClash: {
        name: 'Border Clash', width: 16, height: 12,
        mapString:
`≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`,
        structures: [{ type:'hq',x:3,y:2,team:0 },{ type:'hq',x:12,y:9,team:1 }],
        units: [
            {type:'infantry',x:2,y:2,team:0},{type:'infantry',x:4,y:2,team:0},
            {type:'mech',x:3,y:3,team:0},{type:'tank',x:2,y:3,team:0},
            {type:'tank',x:4,y:4,team:0},{type:'artillery',x:3,y:4,team:0},
            {type:'infantry',x:13,y:9,team:1},{type:'infantry',x:11,y:9,team:1},
            {type:'mech',x:12,y:8,team:1},{type:'tank',x:13,y:8,team:1},
            {type:'tank',x:11,y:7,team:1},{type:'artillery',x:12,y:7,team:1}
        ]
    },
    siege: {
        name: 'Siege', width: 18, height: 13,
        mapString:
`≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`,
        structures: [{ type:'hq',x:9,y:2,team:1 },{ type:'hq',x:9,y:10,team:0 }],
        units: [
            {type:'infantry',x:8,y:2,team:1},{type:'infantry',x:10,y:2,team:1},
            {type:'mech',x:9,y:3,team:1},{type:'tank',x:7,y:4,team:1},
            {type:'tank',x:11,y:4,team:1},{type:'artillery',x:9,y:5,team:1},
            {type:'infantry',x:8,y:10,team:0},{type:'infantry',x:10,y:10,team:0},
            {type:'mech',x:9,y:9,team:0},{type:'tank',x:7,y:8,team:0},
            {type:'tank',x:11,y:8,team:0},{type:'artillery',x:9,y:7,team:0}
        ]
    },
    bridgeHead: {
        name: 'River Crossing', width: 20, height: 14,
        mapString:
`≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`,
        structures: [{ type:'hq',x:3,y:2,team:0 },{ type:'hq',x:16,y:11,team:1 }],
        units: [
            {type:'infantry',x:2,y:2,team:0},{type:'infantry',x:4,y:2,team:0},
            {type:'mech',x:3,y:3,team:0},{type:'tank',x:2,y:4,team:0},
            {type:'tank',x:4,y:4,team:0},{type:'artillery',x:3,y:5,team:0},
            {type:'infantry',x:17,y:11,team:1},{type:'infantry',x:15,y:11,team:1},
            {type:'mech',x:16,y:10,team:1},{type:'tank',x:17,y:9,team:1},
            {type:'tank',x:15,y:9,team:1},{type:'artillery',x:16,y:8,team:1}
        ]
    },
    gauntlet: {
        name: 'The Gauntlet', width: 12, height: 16,
        mapString:
`≋≋≋≋≋≋≋≋≋≋≋≋
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
≋≋≋≋≋≋≋≋≋≋≋≋`,
        structures: [{ type:'hq',x:6,y:2,team:0 },{ type:'hq',x:5,y:13,team:1 }],
        units: [
            {type:'infantry',x:5,y:2,team:0},{type:'infantry',x:7,y:2,team:0},
            {type:'mech',x:6,y:3,team:0},{type:'tank',x:5,y:4,team:0},
            {type:'tank',x:7,y:4,team:0},{type:'heavy',x:8,y:5,team:0},
            {type:'infantry',x:6,y:13,team:1},{type:'infantry',x:4,y:13,team:1},
            {type:'mech',x:5,y:12,team:1},{type:'tank',x:6,y:11,team:1},
            {type:'tank',x:4,y:11,team:1},{type:'heavy',x:3,y:10,team:1}
        ]
    }
};

// ---- State creation --------------------------------------------------
function createGameState(scenarioId) {
    const sc = SCENARIOS[scenarioId];
    if (!sc) throw new Error(`Unknown scenario: ${scenarioId}`);
    let uid = 0;
    return {
        map: parseMapString(sc.mapString),
        units: sc.units.map(u => ({
            id: uid++, ...u,
            maxHp: UNITS[u.type].hp, hp: UNITS[u.type].hp,
            moved: false, hasAttacked: false, hasMovedThisTurn: false, pendingCapture: false
        })),
        structures: sc.structures.map(s => ({ ...s, captureLeft: 20 })),
        turn: 0,
        gameOver: false,
        gameWinner: null,
        pendingCaptures: [],
        aiDefendLatch: { 0: false, 1: false },
        boardWidth: sc.width,
        boardHeight: sc.height,
        turnsSinceLastCombat: 0,
        totalTurns: 0
    };
}

// ---- Core accessors --------------------------------------------------
function getUnitAt(state, x, y) {
    return state.units.find(u => u.x === x && u.y === y) || null;
}

function getStructureAt(state, x, y) {
    return state.structures.find(s => s.x === x && s.y === y) || null;
}

// ---- Movement --------------------------------------------------------
function getMovableTiles(state, unit, allowFriendlyPass = false) {
    if (unit.moved) return [];
    const tiles = [];
    const visited = new Set();
    const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
    visited.add(`${unit.x},${unit.y}`);
    while (queue.length > 0) {
        const current = queue.shift();
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = current.x + dx, ny = current.y + dy;
            if (nx < 0 || nx >= state.map[0].length || ny < 0 || ny >= state.map.length) continue;
            const key = `${nx},${ny}`;
            if (visited.has(key)) continue;
            const moveCost = TERRAIN[state.map[ny][nx].type].move;
            if (moveCost >= 255) continue;
            const occupant = getUnitAt(state, nx, ny);
            if (occupant) {
                if (allowFriendlyPass && occupant.team === unit.team) {
                    // pass through friendly — fall through, but don't add to tiles
                } else {
                    continue; // enemy or no-pass: blocked
                }
            }
            const newCost = current.cost + moveCost;
            if (newCost <= UNITS[unit.type].move) {
                visited.add(key);
                if (!occupant) tiles.push({ x: nx, y: ny, cost: newCost }); // can stop here
                queue.push({ x: nx, y: ny, cost: newCost });
            }
        }
    }
    return tiles;
}

// BFS distance map from (hqX, hqY) ignoring unit blockage
function getDistToHQ(state, hqX, hqY) {
    const H = state.map.length, W = state.map[0].length;
    const dist = Array.from({ length: H }, () => new Int32Array(W).fill(999));
    const queue = [{ x: hqX, y: hqY, d: 0 }];
    dist[hqY][hqX] = 0;
    while (queue.length > 0) {
        const { x, y, d } = queue.shift();
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            if (TERRAIN[state.map[ny][nx].type].move >= 255) continue;
            if (dist[ny][nx] <= d + 1) continue;
            dist[ny][nx] = d + 1;
            queue.push({ x: nx, y: ny, d: d + 1 });
        }
    }
    return dist;
}

// ---- Home territory bonus --------------------------------------------
const HOME_GRADIENT_MAX  = 0.18;
const HOME_GRADIENT_FULL = 0.10;
const HOME_GRADIENT_FADE = 12;

function getHomeTerritoryBonus(state, unit) {
    const hq = state.structures.find(s => s.type === 'hq' && s.team === unit.team);
    if (!hq) return 0;
    const dist = Math.abs(unit.x - hq.x) + Math.abs(unit.y - hq.y);
    if (dist <= HOME_GRADIENT_FULL) return HOME_GRADIENT_MAX;
    if (dist >= HOME_GRADIENT_FADE) return 0;
    const t = (dist - HOME_GRADIENT_FULL) / (HOME_GRADIENT_FADE - HOME_GRADIENT_FULL);
    return HOME_GRADIENT_MAX * (1 - t);
}

// ---- Combat ----------------------------------------------------------
function resolveCombat(state, attacker, defender) {
    const atkData = UNITS[attacker.type], defData = UNITS[defender.type];
    state.turnsSinceLastCombat = 0;

    const baseDamage = atkData.damage[defender.type] || 0;
    const terrainDef = TERRAIN[state.map[defender.y][defender.x].type].def;
    const homeBonus  = getHomeTerritoryBonus(state, defender);
    const defMod     = terrainDef * (1 - homeBonus);
    const hpRatio    = attacker.hp / attacker.maxHp;
    const finalDamage = Math.floor(baseDamage * hpRatio * defMod);

    defender.hp -= finalDamage;
    let counterDamage = 0;

    const dist = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);

    if (defender.hp <= 0) {
        state.units = state.units.filter(u => u !== defender);
    } else if (!defData.ranged && dist === 1) {
        counterDamage = Math.floor((defData.damage[attacker.type] || 0) * (defender.hp / defender.maxHp));
        attacker.hp -= counterDamage;
        if (attacker.hp <= 0) {
            state.units = state.units.filter(u => u !== attacker);
        }
    }

    return { damage: finalDamage, counter: counterDamage };
}

// ---- Attack target enumeration --------------------------------------
function getAttackTargets(state, unit) {
    if (unit.hasAttacked) return [];
    const uData = UNITS[unit.type];
    const targets = [];
    if (uData.ranged) {
        for (let dy = -uData.maxRange; dy <= uData.maxRange; dy++) {
            for (let dx = -uData.maxRange; dx <= uData.maxRange; dx++) {
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist < uData.minRange || dist > uData.maxRange) continue;
                const tx = unit.x + dx, ty = unit.y + dy;
                if (tx < 0 || tx >= state.map[0].length || ty < 0 || ty >= state.map.length) continue;
                const tgt = getUnitAt(state, tx, ty);
                if (tgt && tgt.team !== unit.team) targets.push({ x: tx, y: ty });
            }
        }
    } else {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const tx = unit.x + dx, ty = unit.y + dy;
            if (tx < 0 || tx >= state.map[0].length || ty < 0 || ty >= state.map.length) continue;
            const tgt = getUnitAt(state, tx, ty);
            if (tgt && tgt.team !== unit.team) targets.push({ x: tx, y: ty });
        }
    }
    return targets;
}

// ---- Capture --------------------------------------------------------
function queueCapture(state, unit, structure) {
    if (structure.team === unit.team) return;
    if (!UNITS[unit.type].capture) return;
    unit.pendingCapture = true;
    if (!state.pendingCaptures.find(pc => pc.unit === unit && pc.structure === structure)) {
        state.pendingCaptures.push({ unit, structure });
    }
}

function processPendingCaptures(state) {
    for (const { unit, structure } of state.pendingCaptures) {
        if (!state.units.includes(unit)) continue;
        if (unit.x !== structure.x || unit.y !== structure.y) continue;
        const pts = Math.max(1, Math.floor((unit.hp / unit.maxHp) * 10));
        structure.captureLeft -= pts;
        if (structure.captureLeft <= 0) {
            structure.team       = unit.team;
            structure.captureLeft = 20;
            const hqs = state.structures.filter(s => s.type === 'hq');
            if (hqs.every(s => s.team === 0)) { state.gameOver = true; state.gameWinner = 0; }
            else if (hqs.every(s => s.team === 1)) { state.gameOver = true; state.gameWinner = 1; }
        }
    }
    state.pendingCaptures = [];
    state.units.forEach(u => { u.pendingCapture = false; });
}

// ---- Turn end -------------------------------------------------------
function endTurn(state) {
    // Capture phase — units standing on enemy structures
    state.units.forEach(u => {
        if (u.team === state.turn) {
            const s = getStructureAt(state, u.x, u.y);
            if (s && s.type === 'hq' && s.team !== u.team && UNITS[u.type].capture) {
                queueCapture(state, u, s);
            }
        }
    });
    processPendingCaptures(state);
    if (state.gameOver) return;

    // Elimination checks
    const goldUnits = state.units.filter(u => u.team === 0);
    const blueUnits = state.units.filter(u => u.team === 1);
    const goldCap   = goldUnits.some(u => UNITS[u.type].capture);
    const blueCap   = blueUnits.some(u => UNITS[u.type].capture);

    if (blueUnits.length === 0) {
        state.gameOver = true; state.gameWinner = goldCap ? 0 : -1; return;
    }
    if (goldUnits.length === 0) {
        state.gameOver = true; state.gameWinner = blueCap ? 1 : -1; return;
    }
    if (!goldCap && !blueCap) {
        state.gameOver = true; state.gameWinner = -1; return;
    }

    state.turn = 1 - state.turn;
    state.turnsSinceLastCombat++;
    state.totalTurns++;
    state.units.forEach(u => { u.moved = false; u.hasAttacked = false; u.hasMovedThisTurn = false; });
}

// ---- Position evaluation (headless) ---------------------------------
const UNIT_VALUE = { infantry:10, mech:30, tank:70, heavy:160, artillery:60, rocket:150 };

function evaluatePosition(state) {
    const gold = state.units.filter(u => u.team === 0);
    const blue = state.units.filter(u => u.team === 1);
    const mat  = side => side.reduce((s, u) => s + Math.round((UNIT_VALUE[u.type]||20) * (u.hp / u.maxHp)), 0);
    return { goldMaterial: mat(gold), blueMaterial: mat(blue) };
}

module.exports = {
    TEAMS, UNITS, TERRAIN, UNIT_VALUE,
    SCENARIOS, parseMapString, createGameState,
    getUnitAt, getStructureAt,
    getHomeTerritoryBonus, HOME_GRADIENT_MAX, HOME_GRADIENT_FULL, HOME_GRADIENT_FADE,
    getMovableTiles, getDistToHQ,
    resolveCombat, getAttackTargets,
    queueCapture, processPendingCaptures, endTurn,
    evaluatePosition
};
