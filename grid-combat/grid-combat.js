const TEAMS = ['Stellar Command', 'Lunar Directorate'];
const UNITS = {
    infantry: {
        name: 'Infantry',
        char: 'i',
        hp: 10,
        move: 3,
        vision: 2,
        damage: {
            infantry: 5,
            tank: 2,
            mech: 3,
            heavy: 2,
            artillery: 4,
            rocket: 3
        },
        capture: !0,
        desc: 'Basic unit. Can capture HQ.'
    },
    tank: {
        name: 'Tank',
        char: 'T',
        hp: 10,
        move: 2,
        vision: 3,
        damage: {
            infantry: 8,
            tank: 6,
            mech: 5,
            heavy: 4,
            artillery: 5,
            rocket: 6
        },
        capture: !1,
        desc: 'Mobile armor. Road bonus essential.'
    },
    mech: {
        name: 'Mech',
        char: 'm',
        hp: 12,
        move: 2,
        vision: 2,
        damage: {
            infantry: 6,
            tank: 5,
            mech: 5,
            heavy: 3,
            artillery: 6,
            rocket: 5
        },
        capture: !0,
        desc: 'Heavy infantry. Better defense than tanks.'
    },
    heavy: {
        name: 'Heavy Tank',
        char: 'H',
        hp: 16,
        move: 2,
        vision: 2,
        damage: {
            infantry: 10,
            tank: 8,
            mech: 9,
            heavy: 6,
            artillery: 7,
            rocket: 8
        },
        capture: !1,
        desc: 'Juggernaut. Slow but devastating'
    },
    artillery: {
        name: 'Artillery',
        char: 'A',
        hp: 8,
        move: 2,
        vision: 5,
        damage: {
            infantry: 9,
            tank: 8,
            mech: 8,
            heavy: 6,
            artillery: 5,
            rocket: 7
        },
        capture: !1,
        ranged: !0,
        minRange: 3,
        maxRange: 4,
        desc: 'Long range. Cannot move and fire.'
    },
    rocket: {
        name: 'Rocket',
        char: 'R',
        hp: 7,
        move: 2,
        vision: 4,
        damage: {
            infantry: 6,
            tank: 10,
            mech: 9,
            heavy: 8,
            artillery: 6,
            rocket: 5
        },
        capture: !1,
        ranged: !0,
        minRange: 3,
        maxRange: 5,
        desc: 'Anti-armor specialist. Fragile. Range 3-5.'
    }
};
const TERRAIN = {
    plain: {
        name: 'Plains',
        char: '·',
        def: 0.85,
        move: 1,
        desc: 'Open ground'
    },
    wood: {
        name: 'Woods',
        char: '♣',
        def: 0.70,
        move: 2,
        desc: 'Light cover'
    },
    mountain: {
        name: 'Mountain',
        char: '▲',
        def: 0.40,
        move: 3,
        desc: 'Heavy cover'
    },
    road: {
        name: 'Road',
        char: '═',
        def: 1.0,
        move: 1,
        desc: 'Fast movement'
    },
    water: {
        name: 'Water',
        char: '≋',
        def: 0.0,
        move: 255,
        desc: 'Impassable to ground units'
    }
};
const STRUCTURES = {
    hq: {
        char: '★',
        name: 'HQ',
        desc: 'Capture to win'
    }
};

function resolveCombat(attacker, defender) {
    const atkData = UNITS[attacker.type];
    const defData = UNITS[defender.type];
    const baseDamage = atkData.damage[defender.type] || 0;
    const terrain = map[defender.y][defender.x];
    const defMod = TERRAIN[terrain.type].def;
    const hpRatio = attacker.hp / attacker.maxHp;
    const finalDamage = Math.floor(baseDamage * hpRatio * defMod);
    const combatLog = {
        type: 'combat',
        attacker: attacker,
        defender: defender,
        damageDealt: finalDamage,
        counterDamage: 0,
        deadUnit: null
    };
    defender.hp -= finalDamage;
    log(`${TEAMS[attacker.team]} ${atkData.name} attacks ${TEAMS[defender.team]} ${defData.name} for ${finalDamage} damage`);
    const dist = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
    if (defender.hp <= 0) {
        log(`${TEAMS[defender.team]} ${defData.name} destroyed!`);
        combatLog.deadUnit = defender;
        units = units.filter(u => u !== defender)
    } else {
        if (!defData.ranged && dist === 1) {
            const counterDamage = Math.floor((defData.damage[attacker.type] || 0) * (defender.hp / defender.maxHp));
            combatLog.counterDamage = counterDamage;
            attacker.hp -= counterDamage;
            log(`${TEAMS[defender.team]} ${defData.name} counters for ${counterDamage} damage`);
            if (attacker.hp <= 0) {
                log(`${TEAMS[attacker.team]} ${atkData.name} destroyed!`);
                combatLog.deadUnit = attacker;
                units = units.filter(u => u !== attacker)
            }
        }
    }
    actionHistory.push(combatLog);
    updateUndoButton()
}

function getMovableTiles(unit, allowFriendlyPass = !1) {
    if (unit.moved) return [];
    const tiles = [];
    const visited = new Set();
    const queue = [{
        x: unit.x,
        y: unit.y,
        cost: 0
    }];
    visited.add(`${unit.x},${unit.y}`);
    while (queue.length > 0) {
        const current = queue.shift();
        const neighbors = [{
            x: current.x + 1,
            y: current.y
        }, {
            x: current.x - 1,
            y: current.y
        }, {
            x: current.x,
            y: current.y + 1
        }, {
            x: current.x,
            y: current.y - 1
        }];
        for (const next of neighbors) {
            if (next.x < 0 || next.x >= map[0].length || next.y < 0 || next.y >= map.length) continue;
            const key = `${next.x},${next.y}`;
            if (visited.has(key)) continue;
            const terrain = map[next.y][next.x];
            const moveCost = TERRAIN[terrain.type].move;
            if (moveCost >= 255) continue;
            const otherUnit = getUnitAt(next.x, next.y);
            if (otherUnit) {
                if (allowFriendlyPass && otherUnit.team === unit.team) {} else {
                    continue
                }
            }
            const newCost = current.cost + moveCost;
            if (newCost <= UNITS[unit.type].move) {
                visited.add(key);
                if (!otherUnit || (allowFriendlyPass && otherUnit.team === unit.team)) {
                    if (!otherUnit || otherUnit.team !== unit.team) {
                        tiles.push({
                            x: next.x,
                            y: next.y,
                            cost: newCost
                        })
                    }
                }
                queue.push({
                    x: next.x,
                    y: next.y,
                    cost: newCost
                })
            }
        }
    }
    return tiles
}

function getDistToHQ(hqX, hqY) {
    const dist = Array(map.length).fill(null).map(() => Array(map[0].length).fill(999));
    const queue = [{
        x: hqX,
        y: hqY,
        d: 0
    }];
    dist[hqY][hqX] = 0;
    while (queue.length > 0) {
        const {
            x,
            y,
            d
        } = queue.shift();
        for (const [dx, dy] of [
                [0, 1],
                [0, -1],
                [1, 0],
                [-1, 0]
            ]) {
            const nx = x + dx,
                ny = y + dy;
            if (nx < 0 || nx >= map[0].length || ny < 0 || ny >= map.length) continue;
            if (TERRAIN[map[ny][nx].type].move >= 255) continue;
            if (dist[ny][nx] <= d + 1) continue;
            dist[ny][nx] = d + 1;
            queue.push({
                x: nx,
                y: ny,
                d: d + 1
            })
        }
    }
    return dist
}

function calculateHQVision() {
    const stellarHQ = structures.find(s => s.type === 'hq' && s.team === 0);
    const lunarHQ = structures.find(s => s.type === 'hq' && s.team === 1);
    if (!stellarHQ || !lunarHQ) {
        return Math.max(4, Math.floor(Math.max(boardWidth, boardHeight) * 0.25))
    }
    const hqDistance = Math.abs(stellarHQ.x - lunarHQ.x) + Math.abs(stellarHQ.y - lunarHQ.y);
    const calculatedVision = Math.floor(hqDistance * 0.35);
    const vision = Math.max(4, Math.min(10, calculatedVision));
    return vision
}
let lastThreatCheckState = !1;

function checkPlayerDetection() {
    if (turn !== 0) return;
    const aiHQ = structures.find(s => s.type === 'hq' && s.team === 1);
    if (!aiHQ) return;
    const visionRadius = calculateHQVision();
    const threats = detectHQThreats(aiHQ, 0);
    const capturingThreats = threats.filter(t => t.canCapture);
    if (capturingThreats.length > 0 && !lastThreatCheckState) {
        const closestThreat = capturingThreats.reduce((min, t) => t.distance < min.distance ? t : min);
        const unitName = UNITS[closestThreat.unit.type].name;
        log(`Detected! Enemy ${unitName} has entered AI detection range (${closestThreat.distance}/${visionRadius} tiles from HQ)`);
        lastThreatCheckState = !0
    } else if (capturingThreats.length === 0) {
        lastThreatCheckState = !1
    }
}

function detectHQThreats(hq, enemyTeam) {
    const threats = [];
    const visionRadius = calculateHQVision();
    units.forEach(unit => {
        if (unit.team === enemyTeam) {
            const dist = Math.abs(unit.x - hq.x) + Math.abs(unit.y - hq.y);
            if (dist <= visionRadius) {
                threats.push({
                    unit: unit,
                    distance: dist,
                    canCapture: UNITS[unit.type].capture
                })
            }
        }
    });
    return threats
}

function calculateTimeToReach(fromX, fromY, toX, toY, moveSpeed) {
    const distMap = getDistToHQ(toX, toY);
    const pathDist = distMap[fromY][fromX];
    if (pathDist === 999) return 999;
    return Math.ceil(pathDist / moveSpeed)
}

function shouldDefend(aiTeam) {
    const aiHQ = structures.find(s => s.type === 'hq' && s.team === aiTeam);
    if (!aiHQ) return !1;
    const playerHQ = structures.find(s => s.type === 'hq' && s.team === 0);
    if (!playerHQ) return !1;
    const threats = detectHQThreats(aiHQ, 0);
    const capturingThreats = threats.filter(t => t.canCapture);
    if (capturingThreats.length === 0) return !1;
    const closestThreat = capturingThreats.reduce((min, t) => t.distance < min.distance ? t : min);
    const threatUnit = closestThreat.unit;
    const turnsToAIHQ = calculateTimeToReach(threatUnit.x, threatUnit.y, aiHQ.x, aiHQ.y, UNITS[threatUnit.type].move);
    const aiCapturingUnits = units.filter(u => u.team === aiTeam && UNITS[u.type].capture);
    if (aiCapturingUnits.length === 0) return !0;
    let minTurnsToPlayerHQ = 999;
    aiCapturingUnits.forEach(unit => {
        const turns = calculateTimeToReach(unit.x, unit.y, playerHQ.x, playerHQ.y, UNITS[unit.type].move);
        if (turns < minTurnsToPlayerHQ) minTurnsToPlayerHQ = turns
    });
    const avgCaptureTime = 3;
    const totalAttackTime = minTurnsToPlayerHQ + avgCaptureTime;
    const totalDefenseTime = turnsToAIHQ + avgCaptureTime;
    return totalDefenseTime < totalAttackTime
}

function runAITurn() {
    if (gameOver || turn !== 1) return;
    aiThinking = !0;
    updateUI();
    const aiUnits = units.filter(u => u.team === 1 && !u.moved);
    const defendMode = shouldDefend(1);
    if (defendMode) {
        const visionRange = calculateHQVision();
        log(`AI: Defensive positioning activated - threats detected near HQ! (vision range: ${visionRange} tiles)`)
    }

    function processNextUnit() {
        if (aiUnits.length === 0 || gameOver) {
            aiThinking = !1;
            endTurn();
            return
        }
        const unit = aiUnits.shift();
        if (!units.includes(unit)) {
            processNextUnit();
            return
        }
        const standingStruct = getStructureAt(unit.x, unit.y);
        if (standingStruct && standingStruct.type === 'hq' && standingStruct.team !== unit.team && UNITS[unit.type].capture) {
            queueCapture(unit, standingStruct);
            unit.moved = !0;
            unit.hasMovedThisTurn = !0;
            const uName = UNITS[unit.type].name;
            const tName = TEAMS[unit.team];
            const infoEl = document.getElementById('pending-capture-info');
            if (infoEl) {
                infoEl.style.display = 'block';
                infoEl.style.color = '#4da6ff';
                infoEl.textContent = `${tName} ${uName} holding position to capture HQ...`
            }
            render();
            setTimeout(processNextUnit, 300);
            return
        }
        const targets = getAttackTargets(unit);
        if (targets.length > 0 && !unit.hasMovedThisTurn) {
            const targetPos = selectOptimalTarget(unit, targets);
            if (!targetPos) return;
            const targetUnit = getUnitAt(targetPos.x, targetPos.y);
            if (targetUnit) {
                resolveCombat(unit, targetUnit);
                unit.hasAttacked = !0;
                if (UNITS[unit.type].ranged) {
                    unit.moved = !0;
                    unit.hasMovedThisTurn = !0
                } else {
                    unit.moved = !0;
                    unit.hasMovedThisTurn = !0
                }
                render();
                setTimeout(processNextUnit, 400);
                return
            }
        }
        const movable = getMovableTiles(unit, !0);
        if (movable.length > 0) {
            const defendMode = shouldDefend(1);
            let targetX, targetY, targetHQ;
            if (defendMode) {
                const aiHQ = structures.find(s => s.type === 'hq' && s.team === 1);
                if (aiHQ) {
                    targetX = aiHQ.x;
                    targetY = aiHQ.y;
                    targetHQ = aiHQ
                } else {
                    targetHQ = structures.find(s => s.type === 'hq' && s.team === null);
                    if (!targetHQ) targetHQ = structures.find(s => s.type === 'hq' && s.team === 0);
                    if (targetHQ) {
                        targetX = targetHQ.x;
                        targetY = targetHQ.y
                    }
                }
            } else {
                targetHQ = structures.find(s => s.type === 'hq' && s.team === null);
                if (!targetHQ) {
                    targetHQ = structures.find(s => s.type === 'hq' && s.team === 0)
                }
                if (targetHQ) {
                    targetX = targetHQ.x;
                    targetY = targetHQ.y
                }
            }
            if (targetX !== undefined && targetY !== undefined) {
                const distMap = getDistToHQ(targetX, targetY);
                const hasInfantry = units.some(u => u.team === 1 && UNITS[u.type].capture);
                const isHQ = (tx, ty) => structures.some(s => s.x === tx && s.y === ty && s.type === 'hq');
                movable.sort((a, b) => {
                    let scoreA = distMap[a.y][a.x];
                    let scoreB = distMap[b.y][b.x];
                    if (!UNITS[unit.type].capture && hasInfantry) {
                        if (isHQ(a.x, a.y)) scoreA += 500;
                        if (isHQ(b.x, b.y)) scoreB += 500
                    }
                    return scoreA - scoreB
                })
            }
            const move = movable[0];
            const fromX = unit.x,
                fromY = unit.y;
            unit.x = move.x;
            unit.y = move.y;
            unit.moved = !0;
            unit.hasMovedThisTurn = !0;
            const structAfterMove = getStructureAt(unit.x, unit.y);
            if (structAfterMove && structAfterMove.team !== unit.team && UNITS[unit.type].capture) {
                queueCapture(unit, structAfterMove)
            }
            if (!UNITS[unit.type].ranged && !unit.hasAttacked) {
                const postMoveTargets = getAttackTargets(unit);
                if (postMoveTargets.length > 0) {
                    const targetPos = selectOptimalTarget(unit, postMoveTargets);
                    if (targetPos) {
                        const targetUnit = getUnitAt(targetPos.x, targetPos.y);
                        if (targetUnit) {
                            resolveCombat(unit, targetUnit);
                            unit.hasAttacked = !0;
                            render();
                            setTimeout(processNextUnit, 400);
                            return
                        }
                    }
                }
            }
            render()
        }
        setTimeout(processNextUnit, 400)
    }
    processNextUnit()
}

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
                pendingEl.style.display = 'block'
            }
        } else if (turn === 0 && struct.team !== 0) {
            const canCapture = units.some(u => u.team === 0 && UNITS[u.type].capture && Math.abs(u.x - x) + Math.abs(u.y - y) <= UNITS[u.type].move);
            if (canCapture) {
                info += " [Can start capturing]";
                pendingEl.textContent = "HQ can be seized (requires multiple turns)";
                pendingEl.style.display = 'block';
                pendingEl.style.color = '#ff0'
            }
        }
        structEl.textContent = info
    } else {
        structEl.textContent = '-'
    }
    const unit = getUnitAt(x, y);
    const unitEl = document.getElementById('info-unit');
    if (unit) {
        const uData = UNITS[unit.type];
        unitEl.innerHTML = `<span class="${unit.team === 0 ? 'stellar' : 'lunar'}">${uData.name}</span> (${unit.hp}/${unit.maxHp}) ${unit.moved ? '[MOVED]' : ''}`;
        unitEl.innerHTML += `<br><small>${uData.desc}</small>`;
        if (uData.capture) unitEl.innerHTML += `<br><small>✓ Can capture HQ</small>`;
        if (uData.ranged) unitEl.innerHTML += `<br><small>↔ Range ${uData.minRange}-${uData.maxRange}</small>`;
        if (unit.pendingCapture && struct) {
            const progress = Math.floor(((20 - struct.captureLeft) / 20) * 100);
            unitEl.innerHTML += `<br><small style="color:#0f0">Capturing HQ: ${progress}%</small>`
        }
    } else {
        unitEl.textContent = '-'
    }
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
                if (dist < uData.minRange || dist > uData.maxRange) continue;
                const tx = selectedUnit.x + dx;
                const ty = selectedUnit.y + dy;
                if (tx < 0 || tx >= boardWidth || ty < 0 || ty >= boardHeight) continue;
                rangedAttackTiles.push({
                    x: tx,
                    y: ty,
                    dist: dist
                })
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
            if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
                cell.classList.add('selected')
            }
            const isMovable = movableTiles.find(t => t.x === x && t.y === y);
            if (isMovable) {
                cell.classList.add('movable');
                const blockingUnit = getUnitAt(x, y);
                if (blockingUnit && blockingUnit.team === selectedUnit?.team) {
                    cell.classList.add('friendly-passable')
                }
            }
            if (attackableTiles.find(t => t.x === x && t.y === y)) {
                cell.classList.add('range-indicator')
            }
            const rangedTile = rangedAttackTiles.find(t => t.x === x && t.y === y);
            if (rangedTile) {
                cell.classList.add('range-highlight');
                if (rangedTile.dist <= UNITS[selectedUnit.type].minRange + 1) {
                    cell.classList.add('min-range-highlight')
                }
            }
            if (struct) {
                const structSpan = document.createElement('span');
                structSpan.textContent = STRUCTURES[struct.type].char;
                structSpan.className = 'structure';
                if (struct.team !== null) {
                    structSpan.classList.add(struct.team === 0 ? 'stellar' : 'lunar')
                } else {
                    structSpan.classList.add('neutral')
                }
                cell.appendChild(structSpan);
                if (struct.captureLeft < 20) {
                    const capDiv = document.createElement('div');
                    capDiv.className = 'pending-capture';
                    cell.appendChild(capDiv);
                    const progressDiv = document.createElement('div');
                    progressDiv.className = 'capture-progress';
                    progressDiv.style.width = `${(1 - struct.captureLeft/20) * 100}%`;
                    cell.appendChild(progressDiv)
                }
                if (struct.team !== turn && turn === 0 && struct.type === 'hq') {
                    const captureUnits = units.filter(u => u.team === 0 && UNITS[u.type].capture && Math.abs(u.x - x) + Math.abs(u.y - y) <= UNITS[u.type].move);
                    if (captureUnits.length > 0) {
                        cell.classList.add('hq-target')
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
                    if (hpPercent > 66) {} else if (hpPercent > 33) {
                        cell.style.opacity = '0.8'
                    } else {
                        cell.style.opacity = '0.6'
                    }
                }
            }
            cell.onclick = () => onCellClick(x, y);
            cell.onmouseover = () => showTileInfo(x, y);
            board.appendChild(cell)
        }
    }
}

function queueCapture(unit, structure) {
    if (structure.team === unit.team) return;
    if (!UNITS[unit.type].capture) return;
    unit.pendingCapture = !0;
    if (!pendingCaptures.find(pc => pc.unit === unit && pc.structure === structure)) {
        pendingCaptures.push({
            unit,
            structure
        })
    }
}

function processPendingCaptures() {
    if (pendingCaptures.length === 0) return;
    const infoEl = document.getElementById('pending-capture-info');
    for (const {
            unit,
            structure
        }
        of pendingCaptures) {
        if (!units.includes(unit) || unit.x !== structure.x || unit.y !== structure.y) continue;
        const capturePoints = Math.floor((unit.hp / unit.maxHp) * 10);
        structure.captureLeft -= capturePoints;
        const tName = TEAMS[unit.team];
        infoEl.style.display = 'block';
        infoEl.style.color = unit.team === 0 ? '#ffd700' : '#4da6ff';
        infoEl.textContent = `${tName} seizing HQ: -${capturePoints} pts (${Math.max(0, structure.captureLeft)} remaining)`;
        log(`${tName} ${UNITS[unit.type].name} captures ${capturePoints} pts (${structure.captureLeft} remaining)`);
        if (structure.captureLeft <= 0) {
            const previousTeam = structure.team;
            structure.team = unit.team;
            structure.captureLeft = 20;
            infoEl.textContent = `★ HQ CAPTURED by ${tName}! ★`;
            infoEl.style.color = '#00ff00';
            log(`HQ CAPTURED by ${tName}!`);
            const allHQs = structures.filter(s => s.type === 'hq');
            if (allHQs.every(s => s.team === 0)) {
                gameOver = !0;
                log(`VICTORY! Stellar Command wins!`)
            } else if (allHQs.every(s => s.team === 1)) {
                gameOver = !0;
                log(`VICTORY! Lunar Directorate wins!`)
            }
        }
    }
    pendingCaptures = [];
    units.forEach(u => u.pendingCapture = !1);
    requestAnimationFrame(render)
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
    return lines.map((line, y) => line.split('').map((char, x) => ({
        type: charMap[char] || 'plain',
        x,
        y
    })))
}
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
        structures: [{
            type: 'hq',
            x: 3,
            y: 2,
            team: 0
        }, {
            type: 'hq',
            x: 12,
            y: 9,
            team: 1
        }],
        units: [{
            type: 'infantry',
            x: 2,
            y: 2,
            team: 0
        }, {
            type: 'infantry',
            x: 4,
            y: 2,
            team: 0
        }, {
            type: 'mech',
            x: 3,
            y: 3,
            team: 0
        }, {
            type: 'tank',
            x: 2,
            y: 3,
            team: 0
        }, {
            type: 'tank',
            x: 4,
            y: 4,
            team: 0
        }, {
            type: 'artillery',
            x: 3,
            y: 4,
            team: 0
        }, {
            type: 'infantry',
            x: 13,
            y: 9,
            team: 1
        }, {
            type: 'infantry',
            x: 11,
            y: 9,
            team: 1
        }, {
            type: 'mech',
            x: 12,
            y: 8,
            team: 1
        }, {
            type: 'tank',
            x: 13,
            y: 8,
            team: 1
        }, {
            type: 'tank',
            x: 11,
            y: 7,
            team: 1
        }, {
            type: 'artillery',
            x: 12,
            y: 7,
            team: 1
        }]
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
        structures: [{
            type: 'hq',
            x: 9,
            y: 2,
            team: 1
        }, {
            type: 'hq',
            x: 9,
            y: 10,
            team: 0
        }],
        units: [{
            type: 'infantry',
            x: 8,
            y: 2,
            team: 1
        }, {
            type: 'infantry',
            x: 10,
            y: 2,
            team: 1
        }, {
            type: 'mech',
            x: 9,
            y: 3,
            team: 1
        }, {
            type: 'tank',
            x: 7,
            y: 4,
            team: 1
        }, {
            type: 'tank',
            x: 11,
            y: 4,
            team: 1
        }, {
            type: 'artillery',
            x: 9,
            y: 5,
            team: 1
        }, {
            type: 'infantry',
            x: 8,
            y: 10,
            team: 0
        }, {
            type: 'infantry',
            x: 10,
            y: 10,
            team: 0
        }, {
            type: 'mech',
            x: 9,
            y: 9,
            team: 0
        }, {
            type: 'tank',
            x: 7,
            y: 8,
            team: 0
        }, {
            type: 'tank',
            x: 11,
            y: 8,
            team: 0
        }, {
            type: 'artillery',
            x: 9,
            y: 7,
            team: 0
        }]
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
        structures: [{
            type: 'hq',
            x: 3,
            y: 2,
            team: 0
        }, {
            type: 'hq',
            x: 16,
            y: 11,
            team: 1
        }],
        units: [{
            type: 'infantry',
            x: 2,
            y: 2,
            team: 0
        }, {
            type: 'infantry',
            x: 4,
            y: 2,
            team: 0
        }, {
            type: 'mech',
            x: 3,
            y: 3,
            team: 0
        }, {
            type: 'tank',
            x: 2,
            y: 4,
            team: 0
        }, {
            type: 'tank',
            x: 4,
            y: 4,
            team: 0
        }, {
            type: 'artillery',
            x: 3,
            y: 5,
            team: 0
        }, {
            type: 'infantry',
            x: 17,
            y: 11,
            team: 1
        }, {
            type: 'infantry',
            x: 15,
            y: 11,
            team: 1
        }, {
            type: 'mech',
            x: 16,
            y: 10,
            team: 1
        }, {
            type: 'tank',
            x: 17,
            y: 9,
            team: 1
        }, {
            type: 'tank',
            x: 15,
            y: 9,
            team: 1
        }, {
            type: 'artillery',
            x: 16,
            y: 8,
            team: 1
        }]
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
        structures: [{
            type: 'hq',
            x: 6,
            y: 2,
            team: 0
        }, {
            type: 'hq',
            x: 5,
            y: 13,
            team: 1
        }],
        units: [{
            type: 'infantry',
            x: 5,
            y: 2,
            team: 0
        }, {
            type: 'infantry',
            x: 7,
            y: 2,
            team: 0
        }, {
            type: 'mech',
            x: 6,
            y: 3,
            team: 0
        }, {
            type: 'tank',
            x: 5,
            y: 4,
            team: 0
        }, {
            type: 'tank',
            x: 7,
            y: 4,
            team: 0
        }, {
            type: 'heavy',
            x: 8,
            y: 5,
            team: 0
        }, {
            type: 'infantry',
            x: 6,
            y: 13,
            team: 1
        }, {
            type: 'infantry',
            x: 4,
            y: 13,
            team: 1
        }, {
            type: 'mech',
            x: 5,
            y: 12,
            team: 1
        }, {
            type: 'tank',
            x: 6,
            y: 11,
            team: 1
        }, {
            type: 'tank',
            x: 4,
            y: 11,
            team: 1
        }, {
            type: 'heavy',
            x: 3,
            y: 10,
            team: 1
        }]
    }
};
let map = [];
let units = [];
let structures = [];
let turn = 0;
let selectedUnit = null;
let movableTiles = [];
let attackableTiles = [];
let gameOver = !1;
let actionHistory = [];
let aiThinking = !1;
let currentScenario = 'borderClash';
let pendingCaptures = [];
let boardWidth = 20;
let boardHeight = 13;

function loadScenario(scenarioId) {
    currentScenario = scenarioId;
    actionHistory = [];
    gameOver = !1;
    aiThinking = !1;
    pendingCaptures = [];
    const randomBtn = document.getElementById('random-btn');
    const isSkirmish = scenarioId.startsWith('skirmish');
    randomBtn.style.display = isSkirmish ? 'inline-block' : 'none';
    if (isSkirmish) {
        loadSkirmish(scenarioId)
    } else {
        const scenario = SCENARIOS[scenarioId];
        boardWidth = scenario.width;
        boardHeight = scenario.height;
        map = parseMapString(scenario.mapString);
        structures = scenario.structures.map(s => ({
            ...s,
            captureLeft: 20
        }));
        units = scenario.units.map((u, idx) => ({
            id: idx,
            ...u,
            maxHp: UNITS[u.type].hp,
            hp: UNITS[u.type].hp,
            moved: !1,
            hasAttacked: !1,
            hasMovedThisTurn: !1,
            pendingCapture: !1
        }));
        turn = 0;
        selectedUnit = null;
        movableTiles = [];
        attackableTiles = [];
        document.getElementById('board').className = ''
    }
    document.getElementById('board').style.gridTemplateColumns = `repeat(${boardWidth}, 28px)`;
    render();
    updateUI();
    document.getElementById('scenario-picker').value = scenarioId;
    log(`Scenario: ${SCENARIOS[scenarioId]?.name || scenarioId} loaded`);
    const visionRadius = calculateHQVision();
    log(`HQ Vision Range: ${visionRadius} tiles (scaled for map size)`)
}

function randomizeCurrent() {
    if (currentScenario.startsWith('skirmish')) {
        loadSkirmish(currentScenario)
    }
}
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
        randomizableZones: [{
            x: 2,
            y: 1,
            width: 5,
            height: 5
        }, {
            x: 9,
            y: 1,
            width: 5,
            height: 5
        }, {
            x: 2,
            y: 8,
            width: 5,
            height: 5
        }, {
            x: 9,
            y: 8,
            width: 5,
            height: 5
        }],
        stellarSpawnZones: [{
            x: 1,
            y: 1,
            width: 5,
            height: 4
        }, {
            x: 1,
            y: 7,
            width: 4,
            height: 3
        }],
        lunarSpawnZones: [{
            x: 12,
            y: 1,
            width: 5,
            height: 4
        }, {
            x: 13,
            y: 10,
            width: 4,
            height: 3
        }],
        stellarHQ: {
            x: 3,
            y: 2
        },
        lunarHQ: {
            x: 13,
            y: 11
        }
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
        randomizableZones: [{
            x: 1,
            y: 1,
            width: 8,
            height: 5
        }, {
            x: 1,
            y: 6,
            width: 8,
            height: 4
        }, {
            x: 1,
            y: 10,
            width: 8,
            height: 5
        }, {
            x: 13,
            y: 1,
            width: 8,
            height: 5
        }, {
            x: 13,
            y: 6,
            width: 8,
            height: 4
        }, {
            x: 13,
            y: 10,
            width: 8,
            height: 5
        }],
        stellarSpawnZones: [{
            x: 1,
            y: 1,
            width: 7,
            height: 5
        }, {
            x: 1,
            y: 6,
            width: 7,
            height: 4
        }, {
            x: 1,
            y: 10,
            width: 7,
            height: 5
        }],
        lunarSpawnZones: [{
            x: 12,
            y: 1,
            width: 7,
            height: 5
        }, {
            x: 12,
            y: 6,
            width: 7,
            height: 4
        }, {
            x: 12,
            y: 10,
            width: 7,
            height: 5
        }],
        stellarHQ: {
            x: 3,
            y: 2
        },
        lunarHQ: {
            x: 16,
            y: 13
        }
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
                        if (Math.random() < 0.3) {
                            cell.type = cell.type === 'plain' ? 'wood' : 'plain'
                        }
                        if (cell.type === 'plain' && Math.random() < 0.05) {
                            cell.type = 'mountain'
                        }
                    }
                }
            }
        }
    })
}

function varyPosition(basePos, maxVariation = 1) {
    return {
        x: basePos.x + Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation,
        y: basePos.y + Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation
    }
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
        return {
            x,
            y
        }
    }
    return {
        x: zone.x + Math.floor(zone.width / 2),
        y: zone.y + Math.floor(zone.height / 2)
    }
}

function generateUnitComposition(count) {
    const composition = [];
    composition.push('infantry', 'infantry', 'mech', 'tank', 'tank');
    const fillerPool = ['infantry', 'mech', 'tank', 'heavy', 'artillery', 'rocket'];
    while (composition.length < count) {
        const randomUnit = fillerPool[Math.floor(Math.random() * fillerPool.length)];
        composition.push(randomUnit)
    }
    return composition.sort(() => Math.random() - 0.5)
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
    structures = [{
        type: 'hq',
        x: stellarHQPos.x,
        y: stellarHQPos.y,
        team: 0,
        captureLeft: 20
    }, {
        type: 'hq',
        x: lunarHQPos.x,
        y: lunarHQPos.y,
        team: 1,
        captureLeft: 20
    }];
    const stellarComposition = generateUnitComposition(template.unitsPerSide);
    const lunarComposition = generateUnitComposition(template.unitsPerSide);
    units = [];
    let unitId = 0;
    const occupiedPositions = new Set();
    occupiedPositions.add(`${stellarHQPos.x},${stellarHQPos.y}`);
    occupiedPositions.add(`${lunarHQPos.x},${lunarHQPos.y}`);
    stellarComposition.forEach((unitType, idx) => {
        const zoneIdx = idx % template.stellarSpawnZones.length;
        const zone = template.stellarSpawnZones[zoneIdx];
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
            moved: !1,
            hasAttacked: !1,
            hasMovedThisTurn: !1,
            pendingCapture: !1
        })
    });
    lunarComposition.forEach((unitType, idx) => {
        const zoneIdx = idx % template.lunarSpawnZones.length;
        const zone = template.lunarSpawnZones[zoneIdx];
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
            moved: !1,
            hasAttacked: !1,
            hasMovedThisTurn: !1,
            pendingCapture: !1
        })
    });
    turn = 0;
    selectedUnit = null;
    movableTiles = [];
    attackableTiles = [];
    document.getElementById('board').className = 'skirmish-bg';
    document.getElementById('board').style.gridTemplateColumns = `repeat(${boardWidth}, 28px)`;
    render();
    updateUI();
    log(`Skirmish: ${template.name} - ${template.unitsPerSide} units per side`);
    const visionRadius = calculateHQVision();
    log(`ℹ HQ Vision Range: ${visionRadius} tiles (scaled for map size)`)
}

function getUnitAt(x, y) {
    return units.find(u => u.x === x && u.y === y)
}

function getStructureAt(x, y) {
    return structures.find(s => s.x === x && s.y === y)
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
                const tx = unit.x + dx;
                const ty = unit.y + dy;
                if (tx < 0 || tx >= map[0].length || ty < 0 || ty >= map.length) continue;
                const target = getUnitAt(tx, ty);
                if (target && target.team !== unit.team) {
                    targets.push({
                        x: tx,
                        y: ty
                    })
                }
            }
        }
    } else {
        const neighbors = [{
            x: unit.x + 1,
            y: unit.y
        }, {
            x: unit.x - 1,
            y: unit.y
        }, {
            x: unit.x,
            y: unit.y + 1
        }, {
            x: unit.x,
            y: unit.y - 1
        }];
        for (const pos of neighbors) {
            if (pos.x < 0 || pos.x >= map[0].length || pos.y < 0 || pos.y >= map.length) continue;
            const target = getUnitAt(pos.x, pos.y);
            if (target && target.team !== unit.team) {
                targets.push(pos)
            }
        }
    }
    return targets
}

function selectOptimalTarget(attacker, targets) {
    if (targets.length === 0) return null;
    const scores = targets.map(pos => {
        const target = getUnitAt(pos.x, pos.y);
        if (!target) return {
            pos,
            score: -999
        };
        let score = 0;
        const uData = UNITS[target.type];
        if (uData.capture) score += 100;
        const damage = Math.floor((UNITS[attacker.type].damage[target.type] || 0) * (attacker.hp / attacker.maxHp) * TERRAIN[map[target.y][target.x].type].def);
        if (damage >= target.hp) score += 75;
        if (uData.ranged) score += 40;
        const counter = uData.damage[attacker.type] || 0;
        if (counter >= 7) score += 30;
        const defMod = TERRAIN[map[target.y][target.x].type].def;
        if (defMod <= 0.7) score += 20;
        return {
            pos,
            score
        }
    });
    return scores.reduce((best, curr) => curr.score > best.score ? curr : best).pos
}

function endTurn() {
    units.forEach(u => {
        if (u.team === turn) {
            const s = getStructureAt(u.x, u.y);
            if (s && s.type === 'hq' && s.team !== u.team && UNITS[u.type].capture) {
                queueCapture(u, s)
            }
        }
    });
    processPendingCaptures();
    if (gameOver) return;
    const stellarCanCapture = units.some(u => u.team === 0 && UNITS[u.type].capture);
    const lunarCanCapture = units.some(u => u.team === 1 && UNITS[u.type].capture);
    if (!stellarCanCapture && !lunarCanCapture) {
        gameOver = !0;
        log('STALEMATE! No capturing units remain on either side.');
        log('Game ends in a draw.');
        return
    }
    turn = 1 - turn;
    lastThreatCheckState = !1;
    units.forEach(u => {
        u.moved = !1;
        u.hasAttacked = !1;
        u.hasMovedThisTurn = !1
    });
    selectedUnit = null;
    movableTiles = [];
    attackableTiles = [];
    actionHistory = [];
    render();
    updateUI();
    if (turn === 1 && !gameOver) {
        setTimeout(() => runAITurn(), 500)
    }
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
    updateUndoButton()
}

function recordCombat() {
    actionHistory = [];
    updateUndoButton()
}

function updateUndoButton() {
    const btn = document.getElementById('undo-btn');
    btn.disabled = actionHistory.length === 0 || turn !== 0 || aiThinking
}

function undoMove() {
    if (actionHistory.length === 0 || turn !== 0 || aiThinking) return;
    const lastAction = actionHistory.pop();
    if (lastAction.type === 'move') {
        const unit = lastAction.unit;
        unit.x = lastAction.fromX;
        unit.y = lastAction.fromY;
        unit.moved = !1;
        unit.hasMovedThisTurn = !1;
        unit.hasAttacked = !1;
        unit.pendingCapture = !1;
        pendingCaptures = pendingCaptures.filter(pc => pc.unit !== unit);
        log('Movement undone')
    } else if (lastAction.type === 'combat') {
        const {
            attacker,
            defender,
            damageDealt,
            counterDamage,
            deadUnit
        } = lastAction;
        defender.hp += damageDealt;
        attacker.hp += counterDamage;
        if (deadUnit) {
            units.push(deadUnit);
            log(`${UNITS[deadUnit.type].name} resurrection (Undo)`)
        }
        attacker.hasAttacked = !1;
        log('Combat undone')
    }
    selectedUnit = null;
    movableTiles = [];
    attackableTiles = [];
    render();
    updateUndoButton()
}

function confirmEndTurn() {
    const unmovedUnits = units.filter(u => u.team === 0 && !u.hasMovedThisTurn);
    if (unmovedUnits.length > 0) {
        document.getElementById('turn-confirm-msg').textContent = `You have ${unmovedUnits.length} unmoved unit${unmovedUnits.length !== 1 ? 's' : ''}. End turn anyway?`;
        document.getElementById('turn-confirm-modal').style.display = 'block'
    } else {
        executeEndTurn()
    }
}

function executeEndTurn() {
    closeTurnConfirm();
    endTurn()
}

function closeTurnConfirm() {
    document.getElementById('turn-confirm-modal').style.display = 'none'
}

function confirmReset() {
    document.getElementById('modal-overlay').style.display = 'block'
}

function executeReset() {
    closeModal();
    loadScenario(currentScenario)
}

function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none'
}

function reportFail(msg) {
    const el = document.getElementById('pending-capture-info');
    el.textContent = `✖ ${msg}`;
    el.style.color = '#ff5566';
    el.style.display = 'block';
    if (window.failTimer) clearTimeout(window.failTimer);
    window.failTimer = setTimeout(() => {
        if (el.textContent.includes('✖')) el.style.display = 'none'
    }, 1500)
}

function onCellClick(x, y) {
    if (gameOver || turn !== 0 || aiThinking) return;
    const clickedUnit = getUnitAt(x, y);
    const clickedStruct = getStructureAt(x, y);
    if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
        selectedUnit = null;
        movableTiles = [];
        attackableTiles = [];
        render();
        return
    }
    if (clickedUnit && clickedUnit.team === 0) {
        if (clickedUnit.moved) {
            reportFail("Unit has already acted this turn.");
            return
        }
        selectedUnit = clickedUnit;
        movableTiles = getMovableTiles(clickedUnit, !0);
        attackableTiles = getAttackTargets(clickedUnit);
        render();
        return
    } else if (clickedUnit && !selectedUnit) {
        reportFail("Cannot control enemy units.");
        return
    }
    if (selectedUnit) {
        const isAttackable = attackableTiles.find(t => t.x === x && t.y === y);
        const isMovable = movableTiles.find(t => t.x === x && t.y === y);
        if (isAttackable && clickedUnit && clickedUnit.team !== 0) {
            recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);
            resolveCombat(selectedUnit, clickedUnit);
            recordCombat();
            selectedUnit.moved = !0;
            selectedUnit.hasAttacked = !0;
            selectedUnit.hasMovedThisTurn = !0;
            selectedUnit = null;
            movableTiles = [];
            attackableTiles = [];
            render();
            updateUI();
            return
        }
        if (isMovable && (!clickedUnit || (clickedStruct && clickedStruct.type === 'hq' && UNITS[selectedUnit.type].capture))) {
            recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);
            selectedUnit.x = x;
            selectedUnit.y = y;
            if (clickedStruct && clickedStruct.team !== selectedUnit.team && UNITS[selectedUnit.type].capture) {
                queueCapture(selectedUnit, clickedStruct)
            }
            const isRanged = UNITS[selectedUnit.type].ranged;
            if (isRanged) {
                selectedUnit.moved = !0;
                selectedUnit.hasMovedThisTurn = !0;
                selectedUnit = null;
                movableTiles = [];
                attackableTiles = []
            } else {
                selectedUnit.moved = !0;
                selectedUnit.hasMovedThisTurn = !0;
                movableTiles = [];
                attackableTiles = getAttackTargets(selectedUnit)
            }
            checkPlayerDetection();
            render();
            updateUI();
            return
        }
        if (clickedUnit) {
            if (clickedUnit.team === 0) reportFail("Cannot attack friendly units.");
            else reportFail("Target is out of range.")
        } else {
            const terrain = map[y][x];
            if (TERRAIN[terrain.type].move >= 255) reportFail("Terrain is impassable.");
            else reportFail("Destination is too far.")
        }
    }
}

function updateUI() {
    document.getElementById('turn').textContent = turn + 1;
    const teamEl = document.getElementById('team');
    if (aiThinking) {
        teamEl.textContent = "AI Moving...";
        teamEl.className = 'lunar'
    } else {
        teamEl.textContent = TEAMS[turn === 0 ? 0 : 1];
        teamEl.className = turn === 0 ? 'stellar' : 'lunar'
    }
    const endTurnBtn = document.querySelector('button[onclick="confirmEndTurn()"]');
    if (endTurnBtn) {
        endTurnBtn.disabled = aiThinking || gameOver
    }
    updateUndoButton()
}

function log(msg) {
    const logDiv = document.getElementById('log');
    const entry = document.createElement('div');
    entry.textContent = `> ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight
}
loadScenario('borderClash')
