// ==================== CONFIGURATION ====================
const UNITS = {
    assault: { name: 'Assault', char: 'M', hp: 12, move: 4, range: 4, dmg: 6 },
    heavy:   { name: 'Heavy',   char: 'H', hp: 16, move: 2, range: 6, dmg: 9 },
    drone:   { name: 'Drone',   char: 'D', hp: 8,  move: 6, range: 2, dmg: 4 },
    stalker: { name: 'Stalker', char: 'S', hp: 10, move: 5, range: 3, dmg: 7 },
    brute:   { name: 'Brute',   char: 'B', hp: 22, move: 3, range: 2, dmg: 10 }
};
const TERRAIN = {
    floor: { name: 'Deck',     char: '.', cover: 1.0, move: 1, blocks: false },
    wall:  { name: 'Bulkhead', char: '#', cover: 0.0, move: 99, blocks: true },
    cover: { name: 'Console',  char: 'X', cover: 0.6, move: 2, blocks: false },
    door:  { name: 'Airlock',  char: '+', cover: 0.8, move: 1, blocks: true }
};

const boardWidth = 20, boardHeight = 12;

const LEVELS = {
    classic: `####################\n#.......#..........#\n#..XX...+...XXXX...#\n#.......#..........#\n####+####..........#\n#.......#...XXXX...#\n#..XX...+..........#\n#.......############\n#.......+..........#\n#..XXX..#...XXXX...#\n#.......#..........#\n####################`,
    killbox: `####################\n#..................#\n#..X............X..#\n#..................#\n#.......XXXX.......#\n#.......XXXX.......#\n#..................#\n#..X............X..#\n#..................#\n#..................#\n#..................#\n####################`,
    maze: `####################\n#.#....#.......#...#\n#.#.##.###.###.#.#.#\n#...#..#...#...#.#.#\n#####.##.###.###.#.#\n#.....#..#.........#\n#.###.####.#########\n#.#...#....#.......#\n#.#####.##.#######.#\n#.......#..........#\n#..................#\n####################`,
    perimeter: `####################\n#........##........#\n#........##........#\n####+####....####+##\n#..................#\n#..X............X..#\n#.......##.......#.#\n#.......##.......#.#\n####+####....####+##\n#........##........#\n#........##........#\n####################`
};

let map = [], units = [], turn = 0, selectedUnit = null;
let movableTiles = [], attackableTiles = [];
let aiThinking = false, gameOver = false;

// ==================== ENGINE ====================

function initGame(mapString) {
    const lines = mapString.split('\n');
    const charMap = { '.': 'floor', '#': 'wall', 'X': 'cover', '+': 'door' };
    map = [];
    for (let y = 0; y < boardHeight; y++) {
        let rowStr = (lines[y] || "").trim().padEnd(boardWidth, "#");
        let row = [];
        for (let x = 0; x < boardWidth; x++) {
            row.push({ type: charMap[rowStr[x]] || 'wall', x, y });
        }
        map.push(row);
    }
    units = [];
    const marineSpawns = findSmartSpawns(0);
    const alienSpawns = findSmartSpawns(1);
    const mT = ['assault','heavy','assault','drone'];
    const aT = ['stalker','stalker','stalker','brute'];
    mT.forEach((type, i) => {
        let p = marineSpawns[i] || {x:1, y:1};
        units.push({id:i, type, x:p.x, y:p.y, team:0, hp:UNITS[type].hp, maxHp:UNITS[type].hp, moved:false, attacked:false});
    });
    aT.forEach((type, i) => {
        let p = alienSpawns[i] || {x:18, y:1};
        units.push({id:i+4, type, x:p.x, y:p.y, team:1, hp:UNITS[type].hp, maxHp:UNITS[type].hp, moved:false, attacked:false});
    });
    render();
    log("SYSTEMS ONLINE. GOOD HUNTING.");
}

function findSmartSpawns(team) {
    let found = [];
    if (team === 0) {
        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < boardHeight; y++) {
                if (TERRAIN[map[y][x].type].move < 10 && !getUnitAt(x,y)) {
                    found.push({x, y}); if (found.length >= 4) return found;
                }
            }
        }
    } else {
        for (let x = boardWidth - 1; x >= 10; x--) {
            for (let y = 0; y < boardHeight; y++) {
                if (TERRAIN[map[y][x].type].move < 10 && !getUnitAt(x,y)) {
                    found.push({x, y}); if (found.length >= 4) return found;
                }
            }
        }
    }
    return found;
}

function hasLoS(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = (dx > dy ? dx : -dy) / 2, e2;
    let cx = x0, cy = y0;
    while (true) {
        if (cx === x1 && cy === y1) return true;
        if ((cx !== x0 || cy !== y0) && (cx !== x1 || cy !== y1) && TERRAIN[map[cy][cx].type].blocks) return false;
        e2 = err;
        if (e2 > -dx) { err -= dy; cx += sx; }
        if (e2 < dy) { err += dx; cy += sy; }
    }
}

function buildHeatmap() {
    const distMap = Array.from({ length: boardHeight }, () => new Int32Array(boardWidth).fill(999));
    const queue = [];
    units.forEach(u => { if (u.team === 0) { queue.push({ x: u.x, y: u.y, d: 0 }); distMap[u.y][u.x] = 0; } });
    while (queue.length > 0) {
        const {x, y, d} = queue.shift();
        for (let [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
            let nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < boardWidth && ny >= 0 && ny < boardHeight) {
                if (TERRAIN[map[ny][nx].type].move < 10 && distMap[ny][nx] > d + 1) {
                    distMap[ny][nx] = d + 1; queue.push({ x: nx, y: ny, d: d + 1 });
                }
            }
        }
    }
    return distMap;
}

function getMovableTiles(unit) {
    if (unit.moved || unit.attacked) return [];
    let tiles = [], q = [{x: unit.x, y: unit.y, cost: 0}], v = new Set([`${unit.x},${unit.y}`]);
    while (q.length > 0) {
        let c = q.shift();
        for (let [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
            let nx = c.x + dx, ny = c.y + dy;
            if (nx < 0 || nx >= boardWidth || ny < 0 || ny >= boardHeight || v.has(`${nx},${ny}`)) continue;
            let cost = TERRAIN[map[ny][nx].type].move;
            if (cost > 10 || getUnitAt(nx, ny)) continue;
            if (c.cost + cost <= UNITS[unit.type].move) {
                v.add(`${nx},${ny}`); tiles.push({x: nx, y: ny});
                q.push({x: nx, y: ny, cost: c.cost + cost});
            }
        }
    }
    return tiles;
}

function getAttackTargets(unit) {
    if (unit.attacked) return [];
    let targets = [], range = UNITS[unit.type].range;
    units.forEach(u => {
        if (u.team !== unit.team) {
            let dist = Math.max(Math.abs(u.x - unit.x), Math.abs(u.y - unit.y));
            if (dist <= range && hasLoS(unit.x, unit.y, u.x, u.y)) targets.push({x: u.x, y: u.y});
        }
    });
    return targets;
}

/**
 * FIXED: Combat with awaiting rendering and text
 */
async function performCombat(attacker, defender) {
    // 1. Initial Attack
    let dmg = Math.ceil(UNITS[attacker.type].dmg * TERRAIN[map[defender.y][defender.x].type].cover);
    defender.hp -= dmg;
    log(`${UNITS[attacker.type].name} hits ${UNITS[defender.type].name} for ${dmg}`);

    render(); // Update HP bar before text
    spawnFloatingText(defender.x, defender.y, `-${dmg}`, false);

    await new Promise(r => setTimeout(r, 600));

    // 2. Reflex Fire check
    if (defender.hp > 0) {
        let dist = Math.max(Math.abs(attacker.x - defender.x), Math.abs(attacker.y - defender.y));
        let canReflex = dist <= UNITS[defender.type].range && hasLoS(defender.x, defender.y, attacker.x, attacker.y);

        if (canReflex) {
            let rDmg = Math.ceil(UNITS[defender.type].dmg * TERRAIN[map[attacker.y][attacker.x].type].cover);
            attacker.hp -= rDmg;
            log(`!!! REFLEX: ${UNITS[defender.type].name} hits back for ${rDmg}`);

            render(); // Update attacker HP bar
            spawnFloatingText(attacker.x, attacker.y, `-${rDmg}`, true);

            await new Promise(r => setTimeout(r, 600));
        }
    }

    // 3. Cleanup Dead
    const initialCount = units.length;
    units = units.filter(u => u.hp > 0);
    if (units.length < initialCount) {
        // Log who died
        if (defender.hp <= 0) log(`*** ${UNITS[defender.type].name} TERMINATED ***`);
        if (attacker.hp <= 0) log(`*** ${UNITS[attacker.type].name} TERMINATED ***`);
    }

    checkWinState();
    render();
}

async function runAITurn() {
    aiThinking = true; updateUI();
    const heatmap = buildHeatmap();
    const aiUnits = units.filter(u => u.team === 1);
    for (const unit of aiUnits) {
        if (gameOver || !units.includes(unit)) continue;
        let targets = getAttackTargets(unit);
        if (targets.length === 0) {
            let movable = getMovableTiles(unit);
            if (movable.length > 0) {
                let bestMove = null, bestVal = 999;
                movable.forEach(m => {
                    let val = heatmap[m.y][m.x];
                    if (val === 999) {
                        let nearestMarine = units.filter(u=>u.team===0)[0];
                        if(nearestMarine) val = 50 + (Math.abs(m.x - nearestMarine.x) + Math.abs(m.y - nearestMarine.y));
                    }
                    if (val < bestVal) { bestVal = val; bestMove = m; }
                });
                if (bestMove) { unit.x = bestMove.x; unit.y = bestMove.y; unit.moved = true; render(); await new Promise(r => setTimeout(r, 400)); targets = getAttackTargets(unit); }
            }
        }
        if (targets.length > 0 && !unit.attacked) {
            let tUnit = getUnitAt(targets[0].x, targets[0].y);
            await performCombat(unit, tUnit);
            unit.attacked = true;
            await new Promise(r => setTimeout(r, 400));
        }
    }
    aiThinking = false; endTurn();
}

function getUnitAt(x, y) { return units.find(u => u.x === x && u.y === y); }

function render() {
    const board = document.getElementById('board');
    board.style.gridTemplateColumns = `repeat(${boardWidth}, var(--cell-size))`;
    board.innerHTML = '';
    for (let y = 0; y < boardHeight; y++) {
        for (let x = 0; x < boardWidth; x++) {
            const cell = document.createElement('div');
            cell.className = `cell ${map[y][x].type}`;
            cell.id = `cell-${x}-${y}`;
            const unit = getUnitAt(x, y);
            if (!unit) {
                const s = document.createElement('span'); s.className = 'terrain-char';
                s.textContent = TERRAIN[map[y][x].type].char; cell.appendChild(s);
            }
            if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) cell.classList.add('selected');
            if (movableTiles.find(t => t.x === x && t.y === y)) cell.classList.add('movable');
            if (attackableTiles.find(t => t.x === x && t.y === y)) cell.classList.add('range-highlight');
            if (unit) {
                const uSpan = document.createElement('span'); uSpan.textContent = UNITS[unit.type].char;
                uSpan.className = unit.team === 0 ? 'marine' : 'alien'; cell.appendChild(uSpan);
                const hp = document.createElement('div'); hp.className = 'hp-bar-container';
                hp.innerHTML = `<div class="hp-bar" style="width:${(unit.hp/unit.maxHp)*100}%"></div>`;
                if(unit.team === 1) cell.classList.add('alien-unit'); cell.appendChild(hp);
            }
            cell.onclick = () => onCellClick(x, y);
            board.appendChild(cell);
        }
    }
}

async function onCellClick(x, y) {
    if (gameOver || turn !== 0 || aiThinking) return;
    const clickedUnit = getUnitAt(x, y);
    updateInfo(x, y);
    if (clickedUnit && clickedUnit.team === 0 && !clickedUnit.attacked) {
        selectedUnit = clickedUnit; movableTiles = getMovableTiles(clickedUnit); attackableTiles = getAttackTargets(clickedUnit); render(); return;
    }
    if (selectedUnit) {
        const isAtk = attackableTiles.find(t => t.x === x && t.y === y);
        const isMov = movableTiles.find(t => t.x === x && t.y === y);
        if (isAtk && clickedUnit && clickedUnit.team === 1) {
            let refAttacker = selectedUnit;
            refAttacker.attacked = true; refAttacker.moved = true;
            selectedUnit = null; movableTiles = []; attackableTiles = [];
            await performCombat(refAttacker, clickedUnit);
            return;
        }
        if (isMov && !clickedUnit) {
            selectedUnit.x = x; selectedUnit.y = y; selectedUnit.moved = true;
            movableTiles = []; attackableTiles = getAttackTargets(selectedUnit); render(); return;
        }
    }
    selectedUnit = null; movableTiles = []; attackableTiles = []; render();
}

function endTurn() {
    if (gameOver || aiThinking) return;
    turn = 1 - turn; units.forEach(u => { u.moved = false; u.attacked = false; });
    selectedUnit = null; movableTiles = []; attackableTiles = [];
    render(); updateUI(); if (turn === 1) setTimeout(runAITurn, 500);
}

function updateUI() {
    document.getElementById('turn').textContent = turn + 1;
    const t = document.getElementById('team'); t.textContent = turn === 0 ? 'MARINES' : 'ALIEN PHASE...';
    t.style.color = turn === 0 ? 'var(--text-marine)' : 'var(--text-alien)';
    document.getElementById('end-btn').disabled = (turn !== 0 || aiThinking || gameOver);
}

function log(msg) { const l = document.getElementById('log'); l.innerHTML += `<div>> ${msg}</div>`; l.scrollTop = l.scrollHeight; }

function spawnFloatingText(x, y, text, isReflex) {
    const cell = document.getElementById(`cell-${x}-${y}`);
    if (!cell) return;
    const div = document.createElement('div');
    div.className = isReflex ? 'float-text float-reflex' : 'float-text';
    div.textContent = text;
    cell.appendChild(div);
    setTimeout(() => { if (div && div.parentNode) div.remove(); }, 1000);
}

function checkWinState() {
    const m = units.filter(u => u.team === 0).length, a = units.filter(u => u.team === 1).length;
    if (a === 0) { log("SECTOR CLEARED. VICTORY."); gameOver = true; }
    else if (m === 0) { log("SQUAD WIPED. DEFEAT."); gameOver = true; }
    if (gameOver) document.getElementById('end-btn').disabled = true;
}

function resetGame() {
    gameOver = false; turn = 0; aiThinking = false; units = []; selectedUnit = null;
    movableTiles = []; attackableTiles = [];
    document.getElementById('log').innerHTML = '';
    document.getElementById('end-btn').disabled = false;
    initGame(LEVELS[document.getElementById('levelSelect').value]);
    updateUI();
}

function updateInfo(x, y) {
    if (!map[y] || !map[y][x]) return;
    const t = TERRAIN[map[y][x].type], u = getUnitAt(x, y);
    document.getElementById('info-terrain').textContent = t.name;
    document.getElementById('info-defense').textContent = (t.cover < 1 ? Math.round((1-t.cover)*100)+"%" : "None");
    document.getElementById('info-unit').textContent = (u ? UNITS[u.type].name + " (HP:"+u.hp+")" : "-");
}

initGame(LEVELS.classic);
