// ==================== CONFIGURATION ====================
const TEAMS = ['Marines', 'Aliens'];

const UNITS = {
    assault: { name: 'Assault', char: 'M', hp: 12, move: 4, range: 4, dmg: 6 },
    heavy:   { name: 'Heavy',   char: 'H', hp: 16, move: 2, range: 6, dmg: 9 },
    drone:   { name: 'Drone',   char: 'D', hp: 8,  move: 6, range: 2, dmg: 4 },

    stalker: { name: 'Stalker', char: 'S', hp: 10, move: 5, range: 3, dmg: 7 }, // Changed from Hunter (X) to Stalker (S)
    brute:   { name: 'Brute',   char: 'B', hp: 22, move: 3, range: 2, dmg: 10 }
};

const TERRAIN = {
    floor: { name: 'Deck',     char: '.', cover: 1.0, move: 1, blocksLoS: false },
    wall:  { name: 'Bulkhead', char: '#', cover: 0.0, move: 255, blocksLoS: true },
    cover: { name: 'Console',  char: 'X', cover: 0.6, move: 2, blocksLoS: false }, // Changed to X, adjusted to 40% reduction
    door:  { name: 'Airlock',  char: '+', cover: 0.8, move: 1, blocksLoS: true }
};

let map = [], units = [], turn = 0, selectedUnit = null;
let movableTiles = [], attackableTiles = [];
let aiThinking = false, gameOver = false;

// ==================== MAP GENERATION ====================
const MAP_STRING = `
####################
#.......#..........#
#..XX...+...XXXX...#
#.......#..........#
####+####..........#
#.......#...XXXX...#
#..XX...+..........#
#.......############
#.......+..........#
#..XXX..#...XXXX...#
#.......#..........#
####################`.trim();

const boardWidth = 20;
const boardHeight = 12;

function initGame() {
    const lines = MAP_STRING.split('\n');
    const charMap = { '.': 'floor', '#': 'wall', 'X': 'cover', '+': 'door' };

    map = lines.map((line, y) => line.split('').map((char, x) => ({ type: charMap[char] || 'floor', x, y })));

    units = [
        { id: 1, type: 'assault', x: 1, y: 1, team: 0, hp: 12, maxHp: 12, moved: false, attacked: false },
        { id: 2, type: 'assault', x: 2, y: 3, team: 0, hp: 12, maxHp: 12, moved: false, attacked: false },
        { id: 3, type: 'heavy',   x: 1, y: 2, team: 0, hp: 16, maxHp: 16, moved: false, attacked: false },
        { id: 4, type: 'drone',   x: 3, y: 1, team: 0, hp: 8,  maxHp: 8,  moved: false, attacked: false },

        { id: 5, type: 'stalker', x: 18, y: 2, team: 1, hp: 10, maxHp: 10, moved: false, attacked: false },
        { id: 6, type: 'stalker', x: 15, y: 4, team: 1, hp: 10, maxHp: 10, moved: false, attacked: false },
        { id: 7, type: 'stalker', x: 18, y: 9, team: 1, hp: 10, maxHp: 10, moved: false, attacked: false },
        { id: 8, type: 'brute',   x: 12, y: 8, team: 1, hp: 22, maxHp: 22, moved: false, attacked: false }
    ];

    render();
    log("BREACH INITIATED. Eliminate all alien signatures. Check Tactical Manual for intel.");
}

// ==================== LINE OF SIGHT & PATHFINDING ====================
function hasLoS(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = (dx > dy ? dx : -dy) / 2, e2;
    let cx = x0, cy = y0;

    while (true) {
        if (cx === x1 && cy === y1) return true;
        if ((cx !== x0 || cy !== y0) && TERRAIN[map[cy][cx].type].blocksLoS) return false;

        e2 = err;
        if (e2 > -dx) { err -= dy; cx += sx; }
        if (e2 < dy) { err += dx; cy += sy; }
    }
}

// Global BFS to let AI navigate through corridors towards Marines
function buildMarineDistanceMap() {
    const distMap = Array.from({ length: boardHeight }, () => new Int32Array(boardWidth).fill(999));
    const queue = [];

    units.forEach(u => {
        if (u.team === 0) {
            queue.push({ x: u.x, y: u.y, d: 0 });
            distMap[u.y][u.x] = 0;
        }
    });

    while (queue.length > 0) {
        const {x, y, d} = queue.shift();
        const neighbors = [{x: x+1, y}, {x: x-1, y}, {x, y: y+1}, {x, y: y-1}];

        for (let n of neighbors) {
            if (n.x >= 0 && n.x < boardWidth && n.y >= 0 && n.y < boardHeight) {
                if (TERRAIN[map[n.y][n.x].type].move < 255) {
                    if (distMap[n.y][n.x] > d + 1) {
                        distMap[n.y][n.x] = d + 1;
                        queue.push({ x: n.x, y: n.y, d: d + 1 });
                    }
                }
            }
        }
    }
    return distMap;
}

function getMovableTiles(unit) {
    if (unit.moved) return [];
    const tiles = [];
    const visited = new Set();
    const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
    visited.add(`${unit.x},${unit.y}`);

    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = [{ x: current.x+1, y: current.y }, { x: current.x-1, y: current.y }, { x: current.x, y: current.y+1 }, { x: current.x, y: current.y-1 }];

        for (const next of neighbors) {
            if (next.x < 0 || next.x >= boardWidth || next.y < 0 || next.y >= boardHeight) continue;
            const key = `${next.x},${next.y}`;
            if (visited.has(key)) continue;

            const terrain = map[next.y][next.x];
            const moveCost = TERRAIN[terrain.type].move;
            if (moveCost >= 255) continue;

            const otherUnit = getUnitAt(next.x, next.y);
            if (otherUnit && otherUnit.team !== unit.team) continue;

            const newCost = current.cost + moveCost;
            if (newCost <= UNITS[unit.type].move) {
                visited.add(key);
                if (!otherUnit) tiles.push({ x: next.x, y: next.y });
                queue.push({ x: next.x, y: next.y, cost: newCost });
            }
        }
    }
    return tiles;
}

function getAttackTargets(unit) {
    if (unit.attacked) return [];
    const targets = [];
    const range = UNITS[unit.type].range;

    units.forEach(target => {
        if (target.team !== unit.team) {
            const dist = Math.abs(target.x - unit.x) + Math.abs(target.y - unit.y);
            if (dist <= range && hasLoS(unit.x, unit.y, target.x, target.y)) {
                targets.push({ x: target.x, y: target.y });
            }
        }
    });
    return targets;
}

// ==================== COMBAT ====================
function getUnitAt(x, y) { return units.find(u => u.x === x && u.y === y); }

function resolveCombat(attacker, defender) {
    const atkData = UNITS[attacker.type];
    const defTerrain = map[defender.y][defender.x];
    const coverMod = TERRAIN[defTerrain.type].cover;

    // DESIGN UPDATE: Weapons are lethal. Removed HP-scaling for damage.
    // A unit with 1 HP hits just as hard as a unit with full HP.
    let finalDamage = Math.ceil(atkData.dmg * coverMod);
    if (finalDamage < 1) finalDamage = 1;

    defender.hp -= finalDamage;
    log(`${TEAMS[attacker.team]} ${atkData.name} blasts ${TEAMS[defender.team]} ${UNITS[defender.type].name} for ${finalDamage} dmg!`);

    if (coverMod < 1.0) log(`  -> Target was in cover (${Math.round((1-coverMod)*100)}% absorbed).`);

    if (defender.hp <= 0) {
        log(`*** ${TEAMS[defender.team]} ${UNITS[defender.type].name} TERMINATED. ***`);
        units = units.filter(u => u !== defender);
    }
    return finalDamage;
}

// ==================== ADVANCED CQB AI ====================
async function runAITurn() {
    aiThinking = true;
    updateUI();

    const aiUnits = units.filter(u => u.team === 1);

    for (const unit of aiUnits) {
        if (gameOver || !units.includes(unit)) continue;

        let targets = getAttackTargets(unit);
        if (targets.length > 0) {
            await executeAIAttack(unit, targets);
            if (!unit.moved) await executeAIMove(unit);
        } else {
            await executeAIMove(unit);
            targets = getAttackTargets(unit);
            if (targets.length > 0) await executeAIAttack(unit, targets);
        }
        await sleep(300);
    }

    aiThinking = false;
    endTurn();
}

async function executeAIMove(unit) {
    const movable = getMovableTiles(unit);
    if (movable.length === 0) return;

    const marines = units.filter(u => u.team === 0);
    if (marines.length === 0) return;

    // Build a global navigation map to find marines through corridors
    const marineDistMap = buildMarineDistanceMap();

    let bestMove = null;
    let bestScore = -9999;

    movable.forEach(move => {
        let score = 0;
        const terrain = TERRAIN[map[move.y][move.x].type];

        // 1. Advance through corridors (Pathfinding distance)
        const distToMarines = marineDistMap[move.y][move.x];
        score -= (distToMarines * 10);

        // 2. Cover Evaluation
        let hasLoSToEnemy = false;
        marines.forEach(m => {
            if (hasLoS(move.x, move.y, m.x, m.y)) hasLoSToEnemy = true;
        });

        if (hasLoSToEnemy) {
            score += 50; // Huge bonus to get into a firing position

            // BUT if we step into LoS with NO cover, penalize heavily
            if (terrain.cover === 1.0) {
                score -= 60; // Do not stand in open doorways/hallways!
            } else {
                score += (1.0 - terrain.cover) * 40; // Bonus for taking hard cover
            }
        } else {
            // If moving somewhere without LoS, cover is nice but less critical
            score += (1.0 - terrain.cover) * 10;
        }

        // Add slight dither to prevent AI stacking in identical hallways
        score += Math.random() * 2;

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    });

    if (bestMove) {
        unit.x = bestMove.x;
        unit.y = bestMove.y;
        unit.moved = true;
        render();
        await sleep(400);
    }
}

async function executeAIAttack(unit, targets) {
    targets.sort((a, b) => {
        const tA = getUnitAt(a.x, a.y);
        const tB = getUnitAt(b.x, b.y);
        return tA.hp - tB.hp;
    });

    const targetPos = targets[0];
    const targetUnit = getUnitAt(targetPos.x, targetPos.y);

    const dmg = resolveCombat(unit, targetUnit);

    unit.attacked = true;
    render();
    spawnFloatingText(targetUnit.x, targetUnit.y, `-${dmg}`);
    await sleep(600);
}

// ==================== INPUT & RENDERING ====================
function onCellClick(x, y) {
    if (gameOver || turn !== 0 || aiThinking) return;

    showTileInfo(x, y);
    const clickedUnit = getUnitAt(x, y);

    if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
        selectedUnit = null; movableTiles = []; attackableTiles = []; render(); return;
    }

    if (clickedUnit && clickedUnit.team === 0) {
        selectedUnit = clickedUnit;
        movableTiles = getMovableTiles(clickedUnit);
        attackableTiles = getAttackTargets(clickedUnit);
        render(); return;
    }

    if (selectedUnit) {
        const isAttackable = attackableTiles.find(t => t.x === x && t.y === y);
        const isMovable = movableTiles.find(t => t.x === x && t.y === y);

        if (isAttackable && clickedUnit && clickedUnit.team === 1) {
            const dmg = resolveCombat(selectedUnit, clickedUnit);
            selectedUnit.attacked = true;
            selectedUnit.moved = true;
            selectedUnit = null; movableTiles = []; attackableTiles = [];
            checkWinState();
            render();
            spawnFloatingText(clickedUnit.x, clickedUnit.y, `-${dmg}`);
            return;
        }

        if (isMovable && !clickedUnit) {
            selectedUnit.x = x; selectedUnit.y = y;
            selectedUnit.moved = true;
            movableTiles = [];
            attackableTiles = getAttackTargets(selectedUnit);
            render();
            return;
        }
    }
}

function showTileInfo(x, y) {
    const terrain = TERRAIN[map[y][x].type];
    document.getElementById('info-terrain').textContent = terrain.name;
    document.getElementById('info-defense').textContent = terrain.cover < 1.0 ? `${Math.round((1-terrain.cover)*100)}% Reduction` : 'None (Open)';

    const unit = getUnitAt(x, y);
    const unitEl = document.getElementById('info-unit');
    if (unit) {
        const uData = UNITS[unit.type];
        unitEl.innerHTML = `<span style="color:${unit.team===0?'#00ffcc':'#ff3366'}">${uData.name}</span> HP:${unit.hp}/${unit.maxHp} | RNG:${uData.range}`;
    } else {
        unitEl.textContent = '-';
    }
}

function render() {
    const board = document.getElementById('board');
    board.style.gridTemplateColumns = `repeat(${boardWidth}, var(--cell-size))`;
    board.style.gridTemplateRows = `repeat(${boardHeight}, var(--cell-size))`;
    board.innerHTML = '';

    for (let y = 0; y < boardHeight; y++) {
        for (let x = 0; x < boardWidth; x++) {
            const cell = document.createElement('div');
            cell.className = `cell ${map[y][x].type}`;

            const terrainChar = document.createElement('span');
            terrainChar.className = 'terrain-char';
            terrainChar.textContent = TERRAIN[map[y][x].type].char;
            cell.appendChild(terrainChar);

            if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) cell.classList.add('selected');
            if (movableTiles.find(t => t.x === x && t.y === y)) cell.classList.add('movable');
            if (attackableTiles.find(t => t.x === x && t.y === y)) cell.classList.add('range-highlight');

            const unit = getUnitAt(x, y);
            if (unit) {
                const unitSpan = document.createElement('span');
                unitSpan.textContent = UNITS[unit.type].char;
                unitSpan.className = unit.team === 0 ? 'marine' : 'alien';
                cell.classList.add(unit.team === 0 ? 'marine-unit' : 'alien-unit');
                cell.appendChild(unitSpan);

                const hpContainer = document.createElement('div');
                hpContainer.className = 'hp-bar-container';
                const hpBar = document.createElement('div');
                hpBar.className = 'hp-bar';
                hpBar.style.width = `${(unit.hp / unit.maxHp) * 100}%`;
                hpContainer.appendChild(hpBar);
                cell.appendChild(hpContainer);
            }

            cell.onclick = () => onCellClick(x, y);
            board.appendChild(cell);
        }
    }
}

function checkWinState() {
    const marines = units.filter(u => u.team === 0);
    const aliens = units.filter(u => u.team === 1);

    if (aliens.length === 0) { log("SECTOR CLEARED. MARINES WIN."); gameOver = true; }
    else if (marines.length === 0) { log("SQUAD WIPED OUT. ALIENS WIN."); gameOver = true; }

    if (gameOver) {
        document.getElementById('end-btn').disabled = true;
        selectedUnit = null; movableTiles = []; attackableTiles = []; render();
    }
}

function endTurn() {
    if (gameOver || aiThinking) return;

    turn = 1 - turn;
    units.forEach(u => { u.moved = false; u.attacked = false; });
    selectedUnit = null; movableTiles = []; attackableTiles = [];

    render(); updateUI();

    if (turn === 1) {
        setTimeout(runAITurn, 500);
    }
}

function updateUI() {
    document.getElementById('turn').textContent = turn + 1;
    const teamEl = document.getElementById('team');
    teamEl.textContent = turn === 0 ? 'MARINES' : 'ALIEN ACTIVITY...';
    teamEl.style.color = turn === 0 ? '#00ffcc' : '#ff3366';
    document.getElementById('end-btn').disabled = (turn !== 0 || aiThinking || gameOver);
}

function log(msg) {
    const logDiv = document.getElementById('log');
    const entry = document.createElement('div');
    entry.innerHTML = `> ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function spawnFloatingText(x, y, text) {
    const index = y * boardWidth + x;
    const cell = document.getElementById('board').children[index];
    if (cell) {
        const div = document.createElement('div');
        div.className = `float-text float-damage`;
        div.textContent = text;
        cell.appendChild(div);
        setTimeout(() => div.remove(), 1000);
    }
}

initGame();
