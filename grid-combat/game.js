/**
 * Grid Combat - Game Logic
 * A tactical strategy game for reinforcement learning research.
 */

// === Constants ===

const TEAMS = ['Gold', 'Blue'];

const UNITS = {
    infantry: {
        name: 'Infantry', char: 'i', hp: 10, move: 3, vision: 2,
        damage: { infantry: 5, tank: 2, mech: 3, heavy: 2, artillery: 4, rocket: 3 },
        capture: true, desc: 'Basic unit.'
    },
    tank: {
        name: 'Tank', char: 'T', hp: 10, move: 2, vision: 3,
        damage: { infantry: 8, tank: 6, mech: 5, heavy: 4, artillery: 5, rocket: 6 },
        capture: false, desc: 'Mobile armor.'
    },
    mech: {
        name: 'Mech', char: 'm', hp: 12, move: 2, vision: 2,
        damage: { infantry: 6, tank: 5, mech: 5, heavy: 3, artillery: 6, rocket: 5 },
        capture: true, desc: 'Heavy infantry.'
    },
    heavy: {
        name: 'Heavy Tank', char: 'H', hp: 16, move: 2, vision: 2,
        damage: { infantry: 10, tank: 8, mech: 9, heavy: 6, artillery: 7, rocket: 8 },
        capture: false, desc: 'Juggernaut.'
    },
    artillery: {
        name: 'Artillery', char: 'A', hp: 8, move: 2, vision: 5,
        damage: { infantry: 9, tank: 8, mech: 8, heavy: 6, artillery: 5, rocket: 7 },
        capture: false, ranged: true, minRange: 3, maxRange: 4,
        desc: 'Long range. Cannot move and fire.'
    },
    rocket: {
        name: 'Rocket', char: 'R', hp: 7, move: 2, vision: 4,
        damage: { infantry: 6, tank: 10, mech: 9, heavy: 8, artillery: 6, rocket: 5 },
        capture: false, ranged: true, minRange: 3, maxRange: 5,
        desc: 'Anti-armor. Cannot move and fire.'
    }
};

const TERRAIN = {
    plain: { name: 'Plains', char: '·', def: 0.85, move: 1, desc: 'Open ground' },
    wood: { name: 'Woods', char: '♣', def: 0.70, move: 2, desc: 'Light cover' },
    mountain: { name: 'Mountain', char: '▲', def: 0.40, move: 3, desc: 'Heavy cover' },
    road: { name: 'Road', char: '═', def: 1.0, move: 1, desc: 'Fast movement' },
    water: { name: 'Water', char: '≋', def: 0.0, move: 255, desc: 'Impassable to ground units' }
};

const STRUCTURES = {
    hq: { char: '★', name: 'HQ', desc: 'Capture to win' }
};

const SCENARIOS = {
    borderClash: {
        name: 'Border Clash',
        width: 16,
        height: 12,
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
`.trim(),
        structures: [
            { type: 'hq', x: 3, y: 2, team: 0 },
            { type: 'hq', x: 12, y: 9, team: 1 }
        ],
        units: [
            { type: 'infantry', x: 2, y: 2, team: 0 },
            { type: 'infantry', x: 4, y: 2, team: 0 },
            { type: 'mech', x: 3, y: 3, team: 0 },
            { type: 'tank', x: 2, y: 3, team: 0 },
            { type: 'tank', x: 4, y: 4, team: 0 },
            { type: 'artillery', x: 3, y: 4, team: 0 },
            { type: 'infantry', x: 13, y: 9, team: 1 },
            { type: 'infantry', x: 11, y: 9, team: 1 },
            { type: 'mech', x: 12, y: 8, team: 1 },
            { type: 'tank', x: 13, y: 8, team: 1 },
            { type: 'tank', x: 11, y: 7, team: 1 },
            { type: 'artillery', x: 12, y: 7, team: 1 }
        ]
    },
    siege: {
        name: 'Siege',
        width: 18,
        height: 13,
        mapString: `
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
≋················≋
≋··▲▲····♣♣····▲▲≋
≋··▲▲··········▲▲≋
≋················≋
≋················≋
≋≋≋≋≋≋≋══≋≋≋≋≋≋≋≋≋
≋················≋
≋················≋
≋····♣♣♣··♣♣♣····≋
≋·······▲▲·······≋
≋················≋
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
`.trim(),
        structures: [
            { type: 'hq', x: 9, y: 2, team: 1 },
            { type: 'hq', x: 9, y: 10, team: 0 }
        ],
        units: [
            { type: 'infantry', x: 8, y: 2, team: 1 },
            { type: 'infantry', x: 10, y: 2, team: 1 },
            { type: 'mech', x: 9, y: 3, team: 1 },
            { type: 'tank', x: 7, y: 4, team: 1 },
            { type: 'tank', x: 11, y: 4, team: 1 },
            { type: 'artillery', x: 9, y: 5, team: 1 },
            { type: 'infantry', x: 8, y: 10, team: 0 },
            { type: 'infantry', x: 10, y: 10, team: 0 },
            { type: 'mech', x: 9, y: 9, team: 0 },
            { type: 'tank', x: 7, y: 8, team: 0 },
            { type: 'tank', x: 11, y: 8, team: 0 },
            { type: 'artillery', x: 9, y: 7, team: 0 }
        ]
    },
    bridgeHead: {
        name: 'River Crossing',
        width: 20,
        height: 14,
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
`.trim(),
        structures: [
            { type: 'hq', x: 3, y: 2, team: 0 },
            { type: 'hq', x: 16, y: 11, team: 1 }
        ],
        units: [
            { type: 'infantry', x: 2, y: 2, team: 0 },
            { type: 'infantry', x: 4, y: 2, team: 0 },
            { type: 'mech', x: 3, y: 3, team: 0 },
            { type: 'tank', x: 2, y: 4, team: 0 },
            { type: 'tank', x: 4, y: 4, team: 0 },
            { type: 'artillery', x: 3, y: 5, team: 0 },
            { type: 'infantry', x: 17, y: 11, team: 1 },
            { type: 'infantry', x: 15, y: 11, team: 1 },
            { type: 'mech', x: 16, y: 10, team: 1 },
            { type: 'tank', x: 17, y: 9, team: 1 },
            { type: 'tank', x: 15, y: 9, team: 1 },
            { type: 'artillery', x: 16, y: 8, team: 1 }
        ]
    },
    gauntlet: {
        name: 'The Gauntlet',
        width: 12,
        height: 16,
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
≋≋≋≋≋≋≋≋≋≋≋≋
`.trim(),
        structures: [
            { type: 'hq', x: 6, y: 2, team: 0 },
            { type: 'hq', x: 5, y: 13, team: 1 }
        ],
        units: [
            { type: 'infantry', x: 5, y: 2, team: 0 },
            { type: 'infantry', x: 7, y: 2, team: 0 },
            { type: 'mech', x: 6, y: 3, team: 0 },
            { type: 'tank', x: 5, y: 4, team: 0 },
            { type: 'tank', x: 7, y: 4, team: 0 },
            { type: 'heavy', x: 8, y: 5, team: 0 },
            { type: 'infantry', x: 6, y: 13, team: 1 },
            { type: 'infantry', x: 4, y: 13, team: 1 },
            { type: 'mech', x: 5, y: 12, team: 1 },
            { type: 'tank', x: 6, y: 11, team: 1 },
            { type: 'tank', x: 4, y: 11, team: 1 },
            { type: 'heavy', x: 3, y: 10, team: 1 }
        ]
    }
};

const ADVANCED_SCENARIOS = {
    borderClashAdvanced: {
        name: 'Border Clash - Advanced',
        width: 16,
        height: 12,
        mapString: SCENARIOS.borderClash.mapString,
        structures: SCENARIOS.borderClash.structures,
        units: [
            ...SCENARIOS.borderClash.units,
            { type: 'infantry', x: 1, y: 3, team: 0 },
            { type: 'rocket', x: 2, y: 5, team: 0 },
            { type: 'infantry', x: 14, y: 8, team: 1 },
            { type: 'rocket', x: 13, y: 6, team: 1 }
        ]
    },
    siegeAdvanced: {
        name: 'Siege - Advanced',
        width: 18,
        height: 13,
        mapString: SCENARIOS.siege.mapString,
        structures: SCENARIOS.siege.structures,
        units: [
            ...SCENARIOS.siege.units,
            { type: 'mech', x: 7, y: 3, team: 1 },
            { type: 'heavy', x: 9, y: 4, team: 1 },
            { type: 'tank', x: 9, y: 8, team: 0 },
            { type: 'rocket', x: 6, y: 9, team: 0 }
        ]
    },
    bridgeHeadAdvanced: {
        name: 'River Crossing - Advanced',
        width: 20,
        height: 14,
        mapString: SCENARIOS.bridgeHead.mapString,
        structures: SCENARIOS.bridgeHead.structures,
        units: [
            ...SCENARIOS.bridgeHead.units,
            { type: 'infantry', x: 3, y: 1, team: 0 },
            { type: 'rocket', x: 1, y: 5, team: 0 },
            { type: 'infantry', x: 16, y: 12, team: 1 },
            { type: 'heavy', x: 18, y: 10, team: 1 }
        ]
    },
    gauntletAdvanced: {
        name: 'The Gauntlet - Advanced',
        width: 12,
        height: 16,
        mapString: SCENARIOS.gauntlet.mapString,
        structures: SCENARIOS.gauntlet.structures,
        units: [
            ...SCENARIOS.gauntlet.units,
            { type: 'mech', x: 4, y: 4, team: 0 },
            { type: 'artillery', x: 3, y: 4, team: 0 },
            { type: 'mech', x: 7, y: 11, team: 1 },
            { type: 'artillery', x: 8, y: 11, team: 1 }
        ]
    }
};

Object.assign(SCENARIOS, ADVANCED_SCENARIOS);

const SKIRMISH_TEMPLATES = {
    medium: {
        name: 'Lake Crossing',
        width: 16,
        height: 14,
        unitsPerSide: 11,
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
`.trim(),
        randomizableZones: [
            { x: 2, y: 1, width: 5, height: 5 },
            { x: 9, y: 1, width: 5, height: 5 },
            { x: 2, y: 8, width: 5, height: 5 },
            { x: 9, y: 8, width: 5, height: 5 }
        ],
        stellarSpawnZones: [
            { x: 1, y: 1, width: 5, height: 4 },
            { x: 1, y: 7, width: 4, height: 3 }
        ],
        lunarSpawnZones: [
            { x: 12, y: 1, width: 5, height: 4 },
            { x: 13, y: 10, width: 4, height: 3 }
        ],
        stellarHQ: { x: 3, y: 2 },
        lunarHQ: { x: 13, y: 11 }
    },
    large: {
        name: 'Mountain Frontier',
        width: 20,
        height: 16,
        unitsPerSide: 12,
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋
`.trim(),
        randomizableZones: [
            { x: 1, y: 1, width: 8, height: 5 },
            { x: 1, y: 6, width: 8, height: 4 },
            { x: 1, y: 10, width: 8, height: 5 },
            { x: 13, y: 1, width: 8, height: 5 },
            { x: 13, y: 6, width: 8, height: 4 },
            { x: 13, y: 10, width: 8, height: 5 }
        ],
        stellarSpawnZones: [
            { x: 1, y: 1, width: 7, height: 5 },
            { x: 1, y: 6, width: 7, height: 4 },
            { x: 1, y: 10, width: 7, height: 5 }
        ],
        lunarSpawnZones: [
            { x: 12, y: 1, width: 7, height: 5 },
            { x: 12, y: 6, width: 7, height: 4 },
            { x: 12, y: 10, width: 7, height: 5 }
        ],
        stellarHQ: { x: 3, y: 2 },
        lunarHQ: { x: 16, y: 13 }
    }
};

// === Global State ===

let map = [];
let units = [];
let structures = [];
let turn = 0;
let selectedUnit = null;
let movableTiles = [];
let attackableTiles = [];
let gameOver = false;
let actionHistory = [];
let aiThinking = false;
let currentScenario = 'borderClash';
let pendingCaptures = [];
let boardWidth = 20;
let boardHeight = 13;
let lastThreatCheckState = false;

// === Core Logic: Combat & Movement ===

function resolveCombat(attacker, defender) {
    const attackerData = UNITS[attacker.type];
    const defenderData = UNITS[defender.type];

    const baseDamage = attackerData.damage[defender.type] || 0;
    const terrain = map[defender.y][defender.x];
    const defenseModifier = TERRAIN[terrain.type].def;
    const hpRatio = attacker.hp / attacker.maxHp;
    const finalDamage = Math.floor(baseDamage * hpRatio * defenseModifier);

    const combatLog = {
        type: 'combat',
        attacker: attacker,
        defender: defender,
        damageDealt: finalDamage,
        counterDamage: 0,
        deadUnit: null
    };

    defender.hp -= finalDamage;
    log(`${TEAMS[attacker.team]} ${attackerData.name} attacks ${TEAMS[defender.team]} ${defenderData.name} for ${finalDamage} damage`);

    const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);

    if (defender.hp <= 0) {
        log(`${TEAMS[defender.team]} ${defenderData.name} destroyed!`);
        combatLog.deadUnit = defender;
        units = units.filter(unit => unit !== defender);
    } else {
        if (!defenderData.ranged && distance === 1) {
            const counterDamage = Math.floor((defenderData.damage[attacker.type] || 0) * (defender.hp / defender.maxHp));
            combatLog.counterDamage = counterDamage;
            attacker.hp -= counterDamage;
            log(`${TEAMS[defender.team]} ${defenderData.name} counters for ${counterDamage} damage`);
            if (attacker.hp <= 0) {
                log(`${TEAMS[attacker.team]} ${attackerData.name} destroyed!`);
                combatLog.deadUnit = attacker;
                units = units.filter(unit => unit !== attacker);
            }
        }
    }
    actionHistory.push(combatLog);
    updateUndoButton();
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
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= map[0].length || neighbor.y < 0 || neighbor.y >= map.length) continue;
            const key = `${neighbor.x},${neighbor.y}`;
            if (visited.has(key)) continue;

            const terrain = map[neighbor.y][neighbor.x];
            const moveCost = TERRAIN[terrain.type].move;
            if (moveCost >= 255) continue;

            const otherUnit = getUnitAt(neighbor.x, neighbor.y);
            if (otherUnit) {
                if (allowFriendlyPass && otherUnit.team === unit.team) {
                    // Passable
                } else {
                    continue;
                }
            }

            const newCost = current.cost + moveCost;
            if (newCost <= UNITS[unit.type].move) {
                visited.add(key);
                if (!otherUnit || (allowFriendlyPass && otherUnit.team === unit.team)) {
                    if (!otherUnit || otherUnit.team !== unit.team) {
                        tiles.push({ x: neighbor.x, y: neighbor.y, cost: newCost });
                    }
                }
                queue.push({ x: neighbor.x, y: neighbor.y, cost: newCost });
            }
        }
    }
    return tiles;
}

function getAttackTargets(unit) {
    const targets = [];
    const unitData = UNITS[unit.type];
    if (unit.hasAttacked) return [];

    if (unitData.ranged) {
        for (let dy = -unitData.maxRange; dy <= unitData.maxRange; dy++) {
            for (let dx = -unitData.maxRange; dx <= unitData.maxRange; dx++) {
                const distance = Math.abs(dx) + Math.abs(dy);
                if (distance < unitData.minRange || distance > unitData.maxRange) continue;
                const targetX = unit.x + dx;
                const targetY = unit.y + dy;
                if (targetX < 0 || targetX >= map[0].length || targetY < 0 || targetY >= map.length) continue;
                const target = getUnitAt(targetX, targetY);
                if (target && target.team !== unit.team) {
                    targets.push({ x: targetX, y: targetY });
                }
            }
        }
    } else {
        const neighbors = [
            { x: unit.x + 1, y: unit.y },
            { x: unit.x - 1, y: unit.y },
            { x: unit.x, y: unit.y + 1 },
            { x: unit.x, y: unit.y - 1 }
        ];
        for (const pos of neighbors) {
            if (pos.x < 0 || pos.x >= map[0].length || pos.y < 0 || pos.y >= map.length) continue;
            const target = getUnitAt(pos.x, pos.y);
            if (target && target.team !== unit.team) {
                targets.push(pos);
            }
        }
    }
    return targets;
}

// === Utility Functions ===

function getUnitAt(x, y) {
    return units.find(unit => unit.x === x && unit.y === y);
}

function getStructureAt(x, y) {
    return structures.find(structure => structure.x === x && structure.y === y);
}

function getDistToHQ(hqX, hqY) {
    const distanceGrid = Array(map.length).fill(null).map(() => Array(map[0].length).fill(999));
    const queue = [{ x: hqX, y: hqY, distance: 0 }];
    distanceGrid[hqY][hqX] = 0;

    while (queue.length > 0) {
        const { x, y, distance } = queue.shift();
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const neighborX = x + dx, neighborY = y + dy;
            if (neighborX < 0 || neighborX >= map[0].length || neighborY < 0 || neighborY >= map.length) continue;
            if (TERRAIN[map[neighborY][neighborX].type].move >= 255) continue;
            if (distanceGrid[neighborY][neighborX] <= distance + 1) continue;
            distanceGrid[neighborY][neighborX] = distance + 1;
            queue.push({ x: neighborX, y: neighborY, distance: distance + 1 });
        }
    }
    return distanceGrid;
}

function calculateHQVision() {
    const stellarHQ = structures.find(structure => structure.type === 'hq' && structure.team === 0);
    const lunarHQ = structures.find(structure => structure.type === 'hq' && structure.team === 1);
    if (!stellarHQ || !lunarHQ) {
        return Math.max(4, Math.floor(Math.max(boardWidth, boardHeight) * 0.25));
    }
    const hqDistance = Math.abs(stellarHQ.x - lunarHQ.x) + Math.abs(stellarHQ.y - lunarHQ.y);
    const calculatedVision = Math.floor(hqDistance * 0.35);
    return Math.max(4, Math.min(10, calculatedVision));
}

function calculateTimeToReach(fromX, fromY, toX, toY, moveSpeed) {
    const distMap = getDistToHQ(toX, toY);
    const pathDist = distMap[fromY][fromX];
    if (pathDist === 999) return 999;
    return Math.ceil(pathDist / moveSpeed);
}

function parseMapString(str) {
    const lines = str.split('\n');
    const charMap = {
        '·': 'plain',
        '♣': 'wood',
        '▲': 'mountain',
        '═': 'road',
        '≋': 'water'
    };
    return lines.map((line, y) =>
        line.split('').map((char, x) => ({
            type: charMap[char] || 'plain',
            x,
            y
        }))
    );
}

// === AI Logic ===

function checkPlayerDetection() {
    if (turn !== 0) return;
    const aiHQ = structures.find(structure => structure.type === 'hq' && structure.team === 1);
    if (!aiHQ) return;
    const visionRadius = calculateHQVision();
    const threats = detectHQThreats(aiHQ, 0);
    const capturingThreats = threats.filter(threat => threat.canCapture);

    if (capturingThreats.length > 0 && !lastThreatCheckState) {
        const closestThreat = capturingThreats.reduce((min, threat) =>
            threat.distance < min.distance ? threat : min
        );
        const unitName = UNITS[closestThreat.unit.type].name;
        log(`Detected! Enemy ${unitName} has entered AI detection range (${closestThreat.distance}/${visionRadius} tiles from HQ)`);
        lastThreatCheckState = true;
    } else if (capturingThreats.length === 0) {
        lastThreatCheckState = false;
    }
}

function detectHQThreats(hq, enemyTeam) {
    const threats = [];
    const visionRadius = calculateHQVision();
    units.forEach(unit => {
        if (unit.team === enemyTeam) {
            const distance = Math.abs(unit.x - hq.x) + Math.abs(unit.y - hq.y);
            if (distance <= visionRadius) {
                threats.push({
                    unit: unit,
                    distance: distance,
                    canCapture: UNITS[unit.type].capture
                });
            }
        }
    });
    return threats;
}

function shouldDefend(aiTeam) {
    const aiHQ = structures.find(structure => structure.type === 'hq' && structure.team === aiTeam);
    if (!aiHQ) return false;
    const playerHQ = structures.find(structure => structure.type === 'hq' && structure.team === 0);
    if (!playerHQ) return false;

    const threats = detectHQThreats(aiHQ, 0);
    const capturingThreats = threats.filter(threat => threat.canCapture);
    if (capturingThreats.length === 0) return false;

    const closestThreat = capturingThreats.reduce((min, threat) =>
        threat.distance < min.distance ? threat : min
    );
    const threatUnit = closestThreat.unit;
    const turnsToAIHQ = calculateTimeToReach(
        threatUnit.x, threatUnit.y,
        aiHQ.x, aiHQ.y,
        UNITS[threatUnit.type].move
    );

    const aiCapturingUnits = units.filter(unit => unit.team === aiTeam && UNITS[unit.type].capture);
    if (aiCapturingUnits.length === 0) return true;

    let minTurnsToPlayerHQ = 999;
    aiCapturingUnits.forEach(unit => {
        const turns = calculateTimeToReach(
            unit.x, unit.y,
            playerHQ.x, playerHQ.y,
            UNITS[unit.type].move
        );
        if (turns < minTurnsToPlayerHQ) minTurnsToPlayerHQ = turns;
    });

    const avgCaptureTime = 3;
    const totalAttackTime = minTurnsToPlayerHQ + avgCaptureTime;
    const totalDefenseTime = turnsToAIHQ + avgCaptureTime;
    return totalDefenseTime < totalAttackTime;
}

function calculateAttackValue(attacker, target) {
    const attackerData = UNITS[attacker.type];
    const defenderData = UNITS[target.type];
    const UNIT_COSTS = {
        infantry: 10,
        tank: 25,
        mech: 15,
        heavy: 40,
        artillery: 30,
        rocket: 35
    };

    const baseDamage = attackerData.damage[target.type] || 0;
    const hpRatio = attacker.hp / attacker.maxHp;
    const terrain = map[target.y][target.x];
    const defenseModifier = TERRAIN[terrain.type].def;
    const damage = Math.floor(baseDamage * hpRatio * defenseModifier);

    const targetCost = UNIT_COSTS[target.type] || 20;
    let gain = damage * (targetCost / 10);

    if (damage >= target.hp) {
        gain += targetCost * 1.5;
    }
    if (defenderData.capture && damage >= target.hp) {
        gain += 50;
    }

    let loss = 0;
    if (!attackerData.ranged) {
        const remainingHP = Math.max(0, target.hp - damage);
        const counterHpRatio = remainingHP / target.maxHp;
        const counterDamage = Math.floor(
            (defenderData.damage[attacker.type] || 0) * counterHpRatio
        );
        const selfCost = UNIT_COSTS[attacker.type] || 20;
        loss = counterDamage * (selfCost / 10);
        if (counterDamage >= attacker.hp) {
            loss += selfCost * 2;
        }
    }

    const healthRatio = attacker.hp / attacker.maxHp;
    if (healthRatio < 0.5) {
        loss += (1 - healthRatio) * 40;
    }
    return gain - loss;
}

function selectOptimalTarget(attacker, targets) {
    if (targets.length === 0) return null;
    let bestTarget = null;
    let bestValue = -Infinity;
    for (const pos of targets) {
        const target = getUnitAt(pos.x, pos.y);
        if (!target) continue;
        const value = calculateAttackValue(attacker, target);
        if (value > bestValue) {
            bestValue = value;
            bestTarget = pos;
        }
    }
    return bestTarget;
}

function runAITurn() {
    if (gameOver || turn !== 1) return;
    aiThinking = true;
    updateUI();

    const allAIUnits = units.filter(unit => unit.team === 1 && !unit.moved);
    const rangedUnits = [];
    const capturerUnits = [];
    const otherUnits = [];

    allAIUnits.forEach(unit => {
        const unitData = UNITS[unit.type];
        if (unitData.ranged) {
            rangedUnits.push(unit);
        } else if (unitData.capture) {
            capturerUnits.push(unit);
        } else {
            otherUnits.push(unit);
        }
    });

    const aiUnits = [...rangedUnits, ...capturerUnits, ...otherUnits];
    const defendMode = shouldDefend(1);
    if (defendMode) {
        const visionRange = calculateHQVision();
        log(`AI: Defensive positioning activated - threats detected near HQ! (vision range: ${visionRange} tiles)`);
    }

    function processNextUnit() {
        if (aiUnits.length === 0 || gameOver) {
            aiThinking = false;
            endTurn();
            return;
        }

        const unit = aiUnits.shift();
        if (!units.includes(unit)) {
            processNextUnit();
            return;
        }

        const standingStructure = getStructureAt(unit.x, unit.y);
        if (standingStructure &&
            standingStructure.type === 'hq' &&
            standingStructure.team !== unit.team &&
            UNITS[unit.type].capture) {
            queueCapture(unit, standingStructure);
            unit.moved = true;
            unit.hasMovedThisTurn = true;
            const unitName = UNITS[unit.type].name;
            const teamName = TEAMS[unit.team];
            const infoEl = document.getElementById('pending-capture-info');
            if (infoEl) {
                infoEl.style.display = 'block';
                infoEl.style.color = unit.team === 0 ? '#ffd700' : '#4da6ff';
                infoEl.textContent = `${teamName} ${unitName} holding position to capture HQ...`;
            }
            render();
            setTimeout(processNextUnit, 300);
            return;
        }

        const targets = getAttackTargets(unit);
        if (targets.length > 0 && !unit.hasMovedThisTurn) {
            const targetPos = selectOptimalTarget(unit, targets);
            if (targetPos) {
                const targetUnit = getUnitAt(targetPos.x, targetPos.y);
                if (targetUnit) {
                    resolveCombat(unit, targetUnit);
                    unit.hasAttacked = true;
                    unit.moved = true;
                    unit.hasMovedThisTurn = true;
                    render();
                    setTimeout(processNextUnit, 400);
                    return;
                }
            }
        }

        const movable = getMovableTiles(unit, true);
        if (movable.length > 0) {
            const isDefending = shouldDefend(1);
            let targetX, targetY, targetHQ;

            if (isDefending) {
                const aiHQ = structures.find(structure => structure.type === 'hq' && structure.team === 1);
                if (aiHQ) {
                    targetX = aiHQ.x;
                    targetY = aiHQ.y;
                    targetHQ = aiHQ;
                } else {
                    targetHQ = structures.find(structure => structure.type === 'hq' && structure.team === null);
                    if (!targetHQ) targetHQ = structures.find(structure => structure.type === 'hq' && structure.team === 0);
                    if (targetHQ) {
                        targetX = targetHQ.x;
                        targetY = targetHQ.y;
                    }
                }
            } else {
                targetHQ = structures.find(structure => structure.type === 'hq' && structure.team === null);
                if (!targetHQ) {
                    targetHQ = structures.find(structure => structure.type === 'hq' && structure.team === 0);
                }
                if (targetHQ) {
                    targetX = targetHQ.x;
                    targetY = targetHQ.y;
                }
            }

            if (targetX !== undefined && targetY !== undefined) {
                const distMap = getDistToHQ(targetX, targetY);
                const hasInfantry = units.some(unit => unit.team === 1 && UNITS[unit.type].capture);
                const isHQ = (coordX, coordY) => structures.some(structure => structure.x === coordX && structure.y === coordY && structure.type === 'hq');
                movable.sort((optionA, optionB) => {
                    let scoreA = distMap[optionA.y][optionA.x];
                    let scoreB = distMap[optionB.y][optionB.x];
                    if (!UNITS[unit.type].capture && hasInfantry) {
                        if (isHQ(optionA.x, optionA.y)) scoreA += 500;
                        if (isHQ(optionB.x, optionB.y)) scoreB += 500;
                    }
                    return scoreA - scoreB;
                });
            }

            const move = movable[0];
            unit.x = move.x;
            unit.y = move.y;
            unit.moved = true;
            unit.hasMovedThisTurn = true;

            const structAfterMove = getStructureAt(unit.x, unit.y);
            if (structAfterMove && structAfterMove.team !== unit.team && UNITS[unit.type].capture) {
                queueCapture(unit, structAfterMove);
            }

            if (!UNITS[unit.type].ranged && !unit.hasAttacked) {
                const postMoveTargets = getAttackTargets(unit);
                if (postMoveTargets.length > 0) {
                    const targetPos = selectOptimalTarget(unit, postMoveTargets);
                    if (targetPos) {
                        const targetUnit = getUnitAt(targetPos.x, targetPos.y);
                        if (targetUnit) {
                            resolveCombat(unit, targetUnit);
                            unit.hasAttacked = true;
                            render();
                            setTimeout(processNextUnit, 400);
                            return;
                        }
                    }
                }
            }
            render();
        }
        setTimeout(processNextUnit, 400);
    }
    processNextUnit();
}

// === Game Management ===

function loadScenario(scenarioId) {
    currentScenario = scenarioId;
    actionHistory = [];
    gameOver = false;
    aiThinking = false;
    pendingCaptures = [];
    const randomBtn = document.getElementById('random-btn');
    const isSkirmish = scenarioId.startsWith('skirmish');
    randomBtn.style.display = isSkirmish ? 'inline-block' : 'none';

    if (isSkirmish) {
        loadSkirmish(scenarioId);
    } else {
        const scenario = SCENARIOS[scenarioId];
        boardWidth = scenario.width;
        boardHeight = scenario.height;
        map = parseMapString(scenario.mapString);
        structures = scenario.structures.map(structure => ({
            ...structure,
            captureLeft: 20
        }));
        units = scenario.units.map((unit, index) => ({
            id: index,
            ...unit,
            maxHp: UNITS[unit.type].hp,
            hp: UNITS[unit.type].hp,
            moved: false,
            hasAttacked: false,
            hasMovedThisTurn: false,
            pendingCapture: false
        }));
        turn = 0;
        selectedUnit = null;
        movableTiles = [];
        attackableTiles = [];
        document.getElementById('board').className = '';
    }
    document.getElementById('board').style.gridTemplateColumns = `repeat(${boardWidth}, 28px)`;
    document.getElementById('board').style.gridTemplateRows = `repeat(${boardHeight}, 28px)`;
    render();
    updateUI();
    document.getElementById('scenario-picker').value = scenarioId;
    log(`Scenario: ${SCENARIOS[scenarioId]?.name || scenarioId} loaded`);
    const visionRadius = calculateHQVision();
    log(`HQ Vision Range: ${visionRadius} tiles`);
}

function endTurn() {
    units.forEach(unit => {
        if (unit.team === turn) {
            const structure = getStructureAt(unit.x, unit.y);
            if (structure && structure.type === 'hq' && structure.team !== unit.team && UNITS[unit.type].capture) {
                queueCapture(unit, structure);
            }
        }
    });

    processPendingCaptures();
    if (gameOver) return;

    const stellarCanCapture = units.some(unit => unit.team === 0 && UNITS[unit.type].capture);
    const lunarCanCapture = units.some(unit => unit.team === 1 && UNITS[unit.type].capture);

    if (!stellarCanCapture && !lunarCanCapture) {
        gameOver = true;
        log('Stalemate! No capturing units remain on either side.');
        log('Game ends in a draw.');
        return;
    }

    turn = 1 - turn;
    lastThreatCheckState = false;
    units.forEach(unit => {
        unit.moved = false;
        unit.hasAttacked = false;
        unit.hasMovedThisTurn = false;
    });
    selectedUnit = null;
    movableTiles = [];
    attackableTiles = [];
    actionHistory = [];

    render();
    updateUI();
    if (turn === 1 && !gameOver) {
        setTimeout(() => runAITurn(), 500);
    }
}

function undoMove() {
    if (actionHistory.length === 0 || turn !== 0 || aiThinking) return;
    const lastAction = actionHistory.pop();

    if (lastAction.type === 'move') {
        const unit = lastAction.unit;
        unit.x = lastAction.fromX;
        unit.y = lastAction.fromY;
        unit.moved = false;
        unit.hasMovedThisTurn = false;
        unit.hasAttacked = false;
        unit.pendingCapture = false;
        pendingCaptures = pendingCaptures.filter(pendingCapture => pendingCapture.unit !== unit);
        log('Movement undone');
    }
    else if (lastAction.type === 'combat') {
        const { attacker, defender, damageDealt, counterDamage, deadUnit } = lastAction;
        defender.hp += damageDealt;
        attacker.hp += counterDamage;
        if (deadUnit) {
            units.push(deadUnit);
            log(`${UNITS[deadUnit.type].name} resurrection (Undo)`);
        }
        attacker.hasAttacked = false;
        log('Combat undone');
    }

    selectedUnit = null;
    movableTiles = [];
    attackableTiles = [];
    render();
    updateUndoButton();
}

function queueCapture(unit, structure) {
    if (structure.team === unit.team) return;
    if (!UNITS[unit.type].capture) return;
    unit.pendingCapture = true;
    if (!pendingCaptures.find(pendingCapture => pendingCapture.unit === unit && pendingCapture.structure === structure)) {
        pendingCaptures.push({ unit, structure });
    }
}

function processPendingCaptures() {
    if (pendingCaptures.length === 0) return;
    const infoEl = document.getElementById('pending-capture-info');

    for (const { unit, structure } of pendingCaptures) {
        if (!units.includes(unit) || unit.x !== structure.x || unit.y !== structure.y) continue;
        const capturePoints = Math.floor((unit.hp / unit.maxHp) * 10);
        structure.captureLeft -= capturePoints;
        const teamName = TEAMS[unit.team];

        infoEl.style.display = 'block';
        infoEl.style.color = unit.team === 0 ? '#ffd700' : '#4da6ff';
        infoEl.textContent = `${teamName} seizing HQ: -${capturePoints} pts (${Math.max(0, structure.captureLeft)} remaining)`;
        log(`${teamName} ${UNITS[unit.type].name} captures ${capturePoints} pts (${structure.captureLeft} remaining)`);

        if (structure.captureLeft <= 0) {
            structure.team = unit.team;
            structure.captureLeft = 20;
            infoEl.textContent = `★ HQ CAPTURED by ${teamName}! ★`;
            infoEl.style.color = '#00ff00';
            log(`HQ CAPTURED by ${teamName}!`);

            const allHQs = structures.filter(s => s.type === 'hq');
            if (allHQs.every(s => s.team === 0)) { gameOver = true; log(`Victory! Gold wins!`); }
            else if (allHQs.every(s => s.team === 1)) { gameOver = true; log(`Victory! Blue wins!`); }
        }
    }
    pendingCaptures = [];
    units.forEach(unit => unit.pendingCapture = false);
    requestAnimationFrame(render);
}

// === Skirmish Generation ===

function randomizeCurrent() {
    if (currentScenario.startsWith('skirmish')) {
        loadSkirmish(currentScenario);
    }
}

function randomizeTerrainInZones(map, zones) {
    const swappableTypes = ['plain', 'wood'];
    zones.forEach(zone => {
        for (let y = zone.y; y < zone.y + zone.height; y++) {
            for (let x = zone.x; x < zone.x + zone.width; x++) {
                if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) {
                    const cell = map[y][x];
                    if (swappableTypes.includes(cell.type)) {
                        if (Math.random() < 0.3) {
                            cell.type = cell.type === 'plain' ? 'wood' : 'plain';
                        }
                        if (cell.type === 'plain' && Math.random() < 0.05) {
                            cell.type = 'mountain';
                        }
                    }
                }
            }
        }
    });
}

function varyPosition(basePos, maxVariation = 1) {
    return {
        x: basePos.x + Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation,
        y: basePos.y + Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation
    };
}

function findValidSpawnInZone(zone, map, occupiedPositions) {
    const attempts = 50;
    for (let i = 0; i < attempts; i++) {
        const x = zone.x + Math.floor(Math.random() * zone.width);
        const y = zone.y + Math.floor(Math.random() * zone.height);
        if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) continue;
        const terrain = map[y][x];
        if (TERRAIN[terrain.type].move >= 255) continue;
        const key = `${x},${y}`;
        if (occupiedPositions.has(key)) continue;
        return { x, y };
    }
    return {
        x: zone.x + Math.floor(zone.width / 2),
        y: zone.y + Math.floor(zone.height / 2)
    };
}

function generateUnitComposition(count) {
    const composition = [];
    composition.push('infantry', 'infantry', 'mech', 'tank', 'tank');
    const fillerPool = ['infantry', 'mech', 'tank', 'heavy', 'artillery', 'rocket'];
    while (composition.length < count) {
        const randomUnit = fillerPool[Math.floor(Math.random() * fillerPool.length)];
        composition.push(randomUnit);
    }
    return composition.sort(() => Math.random() - 0.5);
}

function loadSkirmish(type) {
    const templateKey = type === 'skirmishMedium' ? 'medium' : 'large';
    const template = SKIRMISH_TEMPLATES[templateKey];
    boardWidth = template.width;
    boardHeight = template.height;
    map = parseMapString(template.mapString);
    randomizeTerrainInZones(map, template.randomizableZones);

    const stellarHQPos = varyPosition(template.stellarHQ, 1);
    const lunarHQPos = varyPosition(template.lunarHQ, 1);
    structures = [
        { type: 'hq', x: stellarHQPos.x, y: stellarHQPos.y, team: 0, captureLeft: 20 },
        { type: 'hq', x: lunarHQPos.x, y: lunarHQPos.y, team: 1, captureLeft: 20 }
    ];

    const stellarComposition = generateUnitComposition(template.unitsPerSide);
    const lunarComposition = generateUnitComposition(template.unitsPerSide);
    units = [];
    let unitId = 0;
    const occupiedPositions = new Set();
    occupiedPositions.add(`${stellarHQPos.x},${stellarHQPos.y}`);
    occupiedPositions.add(`${lunarHQPos.x},${lunarHQPos.y}`);

    stellarComposition.forEach((unitType, index) => {
        const zoneIndex = index % template.stellarSpawnZones.length;
        const zone = template.stellarSpawnZones[zoneIndex];
        const pos = findValidSpawnInZone(zone, map, occupiedPositions);
        occupiedPositions.add(`${pos.x},${pos.y}`);
        units.push({
            id: unitId++,
            type: unitType,
            x: pos.x,
            y: pos.y,
            team: 0,
            maxHp: UNITS[unitType].hp,
            hp: UNITS[unitType].hp,
            moved: false,
            hasAttacked: false,
            hasMovedThisTurn: false,
            pendingCapture: false
        });
    });

    lunarComposition.forEach((unitType, index) => {
        const zoneIndex = index % template.lunarSpawnZones.length;
        const zone = template.lunarSpawnZones[zoneIndex];
        const pos = findValidSpawnInZone(zone, map, occupiedPositions);
        occupiedPositions.add(`${pos.x},${pos.y}`);
        units.push({
            id: unitId++,
            type: unitType,
            x: pos.x,
            y: pos.y,
            team: 1,
            maxHp: UNITS[unitType].hp,
            hp: UNITS[unitType].hp,
            moved: false,
            hasAttacked: false,
            hasMovedThisTurn: false,
            pendingCapture: false
        });
    });

    turn = 0;
    selectedUnit = null;
    movableTiles = [];
    attackableTiles = [];
    document.getElementById('board').className = 'skirmish-bg';
    document.getElementById('board').style.gridTemplateColumns = `repeat(${boardWidth}, 28px)`;
    document.getElementById('board').style.gridTemplateRows = `repeat(${boardHeight}, 28px)`;
    render();
    updateUI();
    log(`Skirmish: ${template.name}`);
    const visionRadius = calculateHQVision();
    log(`HQ Vision Range: ${visionRadius} tiles`);
}

// === UI & Rendering ===

function showTileInfo(x, y) {
    const terrain = map[y][x];
    const terrainData = TERRAIN[terrain.type];
    document.getElementById('info-terrain').textContent = terrainData.name;
    document.getElementById('info-defense').textContent = terrainData.def > 0 ? `${Math.floor((1 - terrainData.def) * 100)}% protection` : 'None';
    document.getElementById('info-move').textContent = terrainData.move >= 255 ? 'Impassable' : terrainData.move;

    const structure = getStructureAt(x, y);
    const structEl = document.getElementById('info-structure');
    const pendingEl = document.getElementById('pending-capture-info');
    pendingEl.style.display = 'none';

    if (structure) {
        let info = STRUCTURES[structure.type].name;
        if (structure.team !== null) info += ` (${TEAMS[structure.team]})`;
        if (structure.captureLeft < 20) {
            const progress = Math.floor(((20 - structure.captureLeft) / 20) * 100);
            info += ` [${progress}% captured]`;
            const capturingUnit = units.find(unit =>
                unit.pendingCapture && unit.x === x && unit.y === y
            );
            if (capturingUnit) {
                info += ` by ${TEAMS[capturingUnit.team]} ${UNITS[capturingUnit.type].name}`;
                pendingEl.textContent = `Capturing: ${progress}% complete (${structure.captureLeft} pts remaining)`;
                pendingEl.style.display = 'block';
            }
        }
        else if (turn === 0 && structure.team !== 0) {
            const canCapture = units.some(unit =>
                unit.team === 0 &&
                UNITS[unit.type].capture &&
                Math.abs(unit.x - x) + Math.abs(unit.y - y) <= UNITS[unit.type].move
            );
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
        const unitData = UNITS[unit.type];
        unitEl.innerHTML = `<span class="${unit.team === 0 ? 'stellar' : 'lunar'}">${unitData.name}</span> (${unit.hp}/${unit.maxHp}) ${unit.moved ? '[MOVED]' : ''}`;
        unitEl.innerHTML += `<br><small>${unitData.desc}</small>`;
        if (unitData.capture) unitEl.innerHTML += `<br><small>✓ Can capture HQ</small>`;
        if (unitData.ranged) unitEl.innerHTML += `<br><small>↔ Range ${unitData.minRange}-${unitData.maxRange}</small>`;
        if (uData.capture) unitEl.innerHTML += `<small> Can capture HQ.</small>`;
        if (uData.ranged) unitEl.innerHTML += `<small> Attack range ${uData.minRange}-${uData.maxRange}.</small>`;
        if (unit.pendingCapture && structure) {
            const progress = Math.floor(((20 - structure.captureLeft) / 20) * 100);
            unitEl.innerHTML += `<br><small style="color:#0f0">Capturing HQ: ${progress}%</small>`;
        }
    } else {
        unitEl.textContent = '-';
    }
}

function render() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    const rangedAttackTiles = [];

    if (selectedUnit && UNITS[selectedUnit.type].ranged) {
        const unitData = UNITS[selectedUnit.type];
        for (let dy = -unitData.maxRange; dy <= unitData.maxRange; dy++) {
            for (let dx = -unitData.maxRange; dx <= unitData.maxRange; dx++) {
                const distance = Math.abs(dx) + Math.abs(dy);
                if (distance === 0 || distance > unitData.maxRange) continue;
                const targetX = selectedUnit.x + dx;
                const targetY = selectedUnit.y + dy;
                if (targetX < 0 || targetX >= boardWidth || targetY < 0 || targetY >= boardHeight) continue;
                rangedAttackTiles.push({ x: targetX, y: targetY, distance: distance });
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
            const structure = getStructureAt(x, y);

            if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
                cell.classList.add('selected');
            }

            const isMovable = movableTiles.find(tile => tile.x === x && tile.y === y);
            if (isMovable) {
                cell.classList.add('movable');
                const blockingUnit = getUnitAt(x, y);
                if (blockingUnit && blockingUnit.team === selectedUnit?.team) {
                    cell.classList.add('friendly-passable');
                }
            }

            if (attackableTiles.find(tile => tile.x === x && tile.y === y)) {
                cell.classList.add('range-indicator');
            }

            const rangedTile = rangedAttackTiles.find(tile => tile.x === x && tile.y === y);
            if (rangedTile) {
                cell.classList.add('range-highlight');
                if (rangedTile.distance < UNITS[selectedUnit.type].minRange) {
                    cell.classList.add('min-range-highlight');
                }
            }

            if (structure) {
                const structSpan = document.createElement('span');
                structSpan.textContent = STRUCTURES[structure.type].char;
                structSpan.className = 'structure';
                if (structure.team !== null) {
                    structSpan.classList.add(structure.team === 0 ? 'stellar' : 'lunar');
                } else {
                    structSpan.classList.add('neutral');
                }
                cell.appendChild(structSpan);

                if (structure.captureLeft < 20) {
                    const capDiv = document.createElement('div');
                    capDiv.className = 'pending-capture';
                    cell.appendChild(capDiv);

                    const progressDiv = document.createElement('div');
                    progressDiv.className = 'capture-progress';
                    progressDiv.style.width = `${(1 - structure.captureLeft / 20) * 100}%`;
                    cell.appendChild(progressDiv);
                }

                if (structure.team !== turn && turn === 0 && structure.type === 'hq') {
                    const captureUnits = units.filter(unit =>
                        unit.team === 0 &&
                        UNITS[unit.type].capture &&
                        Math.abs(unit.x - x) + Math.abs(unit.y - y) <= UNITS[unit.type].move
                    );
                    if (captureUnits.length > 0) {
                        cell.classList.add('hq-target');
                    }
                }
            }

            if (unit) {
                const unitSpan = document.createElement('span');
                unitSpan.textContent = UNITS[unit.type].char;
                unitSpan.className = unit.team === 0 ? 'stellar' : 'lunar';
                cell.appendChild(unitSpan);
                cell.classList.add(unit.team === 0 ? 'stellar-unit' : 'lunar-unit');

                if (unit.hp < unit.maxHp) {
                    const hpPercent = (unit.hp / unit.maxHp) * 100;
                    if (hpPercent <= 33) {
                        cell.style.opacity = '0.6';
                    } else if (hpPercent <= 66) {
                        cell.style.opacity = '0.8';
                    }
                }
            }

            cell.onclick = () => onCellClick(x, y);
            cell.onmouseover = () => showTileInfo(x, y);
            board.appendChild(cell);
        }
    }
}

function onCellClick(x, y) {
    if (gameOver || turn !== 0 || aiThinking) return;

    const clickedUnit = getUnitAt(x, y);
    const clickedStructure = getStructureAt(x, y);

    if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
        selectedUnit = null;
        movableTiles = [];
        attackableTiles = [];
        render();
        return;
    }

    if (clickedUnit && clickedUnit.team === 0) {
        if (clickedUnit.moved && clickedUnit.hasAttacked) {
            reportFail("Unit has already acted this turn.");
            return;
        }
        selectedUnit = clickedUnit;
        movableTiles = clickedUnit.moved ? [] : getMovableTiles(clickedUnit, true);
        attackableTiles = getAttackTargets(clickedUnit);
        render();
        return;
    } else if (clickedUnit && !selectedUnit) {
        reportFail("Cannot control enemy units.");
        return;
    }

    if (selectedUnit) {
        const isAttackable = attackableTiles.find(tile => tile.x === x && tile.y === y);
        const isMovable = movableTiles.find(tile => tile.x === x && tile.y === y);

        if (isAttackable && clickedUnit && clickedUnit.team !== 0) {
            recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);
            resolveCombat(selectedUnit, clickedUnit);
            recordCombat();
            selectedUnit.moved = true;
            selectedUnit.hasAttacked = true;
            selectedUnit.hasMovedThisTurn = true;
            selectedUnit = null;
            movableTiles = [];
            attackableTiles = [];
            render();
            updateUI();
            return;
        }

        if (isMovable && (!clickedUnit || (clickedStructure && clickedStructure.type === 'hq' && UNITS[selectedUnit.type].capture))) {
            recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);
            selectedUnit.x = x;
            selectedUnit.y = y;
            if (clickedStructure && clickedStructure.team !== selectedUnit.team && UNITS[selectedUnit.type].capture) {
                queueCapture(selectedUnit, clickedStructure);
            }

            const isRanged = UNITS[selectedUnit.type].ranged;
            if (isRanged) {
                selectedUnit.moved = true;
                selectedUnit.hasMovedThisTurn = true;
                selectedUnit = null;
                movableTiles = [];
                attackableTiles = [];
            } else {
                selectedUnit.moved = true;
                selectedUnit.hasMovedThisTurn = true;
                movableTiles = [];
                attackableTiles = getAttackTargets(selectedUnit);
            }
            checkPlayerDetection();
            render();
            updateUI();
            return;
        }

        if (clickedUnit) {
            if (clickedUnit.team === 0) reportFail("Cannot attack friendly units.");
            else reportFail("Target is out of range.");
        } else {
            const terrain = map[y][x];
            if (TERRAIN[terrain.type].move >= 255) reportFail("Terrain is impassable.");
            else reportFail("Destination is too far.");
        }
    }
}

function updateUI() {
    document.getElementById('turn').textContent = turn + 1;
    const teamEl = document.getElementById('team');
    if (aiThinking) {
        teamEl.textContent = "AI Moving...";
        teamEl.className = 'lunar';
    } else {
        teamEl.textContent = TEAMS[turn === 0 ? 0 : 1];
        teamEl.className = turn === 0 ? 'stellar' : 'lunar';
    }
    const endTurnBtn = document.querySelector('button[onclick="confirmEndTurn()"]');
    if (endTurnBtn) {
        endTurnBtn.disabled = aiThinking || gameOver;
    }
    updateUndoButton();
}

function recordMove(unit, fromX, fromY) {
    actionHistory.push({
        type: 'move',
        unit: unit,
        fromX: fromX,
        fromY: fromY,
        toX: unit.x,
        toY: unit.y
    });
    updateUndoButton();
}

function recordCombat() {
    // Reset action history on combat to prevent undoing through combat
    actionHistory = [];
    updateUndoButton();
}

function updateUndoButton() {
    const btn = document.getElementById('undo-btn');
    btn.disabled = actionHistory.length === 0 || turn !== 0 || aiThinking;
}

function confirmEndTurn() {
    const unmovedUnits = units.filter(unit => unit.team === 0 && !unit.hasMovedThisTurn);
    if (unmovedUnits.length > 0) {
        document.getElementById('turn-confirm-msg').textContent =
            `You have ${unmovedUnits.length} unmoved unit${unmovedUnits.length !== 1 ? 's' : ''}. End turn anyway?`;
        document.getElementById('turn-confirm-modal').style.display = 'block';
    } else {
        executeEndTurn();
    }
}

function executeEndTurn() {
    closeTurnConfirm();
    endTurn();
}

function closeTurnConfirm() {
    document.getElementById('turn-confirm-modal').style.display = 'none';
}

function confirmReset() {
    document.getElementById('modal-overlay').style.display = 'block';
}

function executeReset() {
    closeModal();
    loadScenario(currentScenario);
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

function reportFail(msg) {
    const el = document.getElementById('pending-capture-info');
    el.textContent = `✖ ${msg}`;
    el.style.color = '#ff5566';
    el.style.display = 'block';
    if (window.failTimer) clearTimeout(window.failTimer);
    window.failTimer = setTimeout(() => {
        if (el.textContent.includes('✖')) el.style.display = 'none';
    }, 1500);
}

function log(msg) {
    const logDiv = document.getElementById('log');
    const entry = document.createElement('div');
    entry.textContent = `> ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// === Initialization ===

loadScenario('borderClash');
