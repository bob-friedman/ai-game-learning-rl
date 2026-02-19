const TEAMS = ['Gold', 'Blue'];
const UNITS = {
  infantry: {
    name: 'Infantry', char: 'i', hp: 10, move: 3, vision: 2,
    damage: { infantry: 5, tank: 2, mech: 3, heavy: 2, artillery: 4, rocket: 3 },
    capture: true, desc: 'Basic unit.'
  },
  tank: {
    name: 'Tank', char: 'T', hp: 10, move: 2, vision: 3,  // Reduced from 6
    damage: { infantry: 8, tank: 6, mech: 5, heavy: 4, artillery: 5, rocket: 6 },
    capture: false, desc: 'Mobile armor.'
  },
  mech: {
    name: 'Mech', char: 'm', hp: 12, move: 2, vision: 2,  // Reduced from 4
    damage: { infantry: 6, tank: 5, mech: 5, heavy: 3, artillery: 6, rocket: 5 },
    capture: true, desc: 'Heavy infantry.'
  },
  heavy: {
    name: 'Heavy Tank', char: 'H', hp: 16, move: 2, vision: 2,  // Reduced from 4
    damage: { infantry: 10, tank: 8, mech: 9, heavy: 6, artillery: 7, rocket: 8 },
    capture: false, desc: 'Juggernaut.'
  },
  artillery: {
    name: 'Artillery', char: 'A', hp: 8, move: 2, vision: 5,
    damage: { infantry: 9, tank: 8, mech: 8, heavy: 6, artillery: 5, rocket: 7 },
    capture: false, ranged: true, minRange: 3, maxRange: 4,
    desc: 'Long range. Cannot both move and fire.'
  },
  rocket: {
    name: 'Rocket', char: 'R', hp: 7, move: 2, vision: 4,  // Reduced from 5
    damage: { infantry: 6, tank: 10, mech: 9, heavy: 8, artillery: 6, rocket: 5 },
    capture: false, ranged: true, minRange: 3, maxRange: 5,
    desc: 'Anti-armor. Cannot both move and fire.'
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

// === HELPER FUNCTIONS FOR ASYNC AI ===
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function spawnFloatingText(x, y, text, type = 'damage') {
    const board = document.getElementById('board');
    const index = y * boardWidth + x;
    const cell = board.children[index];
    if (cell) {
        const div = document.createElement('div');
        div.className = `float-text float-${type}`;
        div.textContent = text;
        cell.appendChild(div);
        // Note: Logic ensures we don't call render() immediately after this
    }
}

function highlightActor(x, y, isActive) {
    const index = y * boardWidth + x;
    const cell = document.getElementById('board').children[index];
    if (cell) {
        if (isActive) cell.classList.add('active-actor');
        else cell.classList.remove('active-actor');
    }
}

function highlightTarget(x, y, isActive) {
    const index = y * boardWidth + x;
    const cell = document.getElementById('board').children[index];
    if (cell) {
        if (isActive) cell.classList.add('target-actor');
        else cell.classList.remove('target-actor');
    }
}

// === HOME TERRITORY GRADIENT ===
// Returns a defense bonus [0.0 – HOME_GRADIENT_MAX] that rewards units
// fighting close to their own HQ.  Applies equally to both sides.
const HOME_GRADIENT_MAX  = 0.18;  // Maximum bonus at HQ tile itself
const HOME_GRADIENT_FULL = 0.10;  // Full bonus within this many tiles of HQ
const HOME_GRADIENT_FADE = 12;    // Bonus fades to zero beyond this distance

function getHomeTerritoryBonus(unit) {
  const hq = structures.find(s => s.type === 'hq' && s.team === unit.team);
  if (!hq) return 0;
  const dist = Math.abs(unit.x - hq.x) + Math.abs(unit.y - hq.y);
  if (dist <= HOME_GRADIENT_FULL) return HOME_GRADIENT_MAX;
  if (dist >= HOME_GRADIENT_FADE) return 0;
  // Linear fade from MAX down to 0 between FULL and FADE distances
  const t = (dist - HOME_GRADIENT_FULL) / (HOME_GRADIENT_FADE - HOME_GRADIENT_FULL);
  return HOME_GRADIENT_MAX * (1 - t);
}

// === MODIFIED COMBAT LOGIC TO RETURN DATA (FIXED SCOPE) ===
function resolveCombat(attacker, defender) {
  const atkData = UNITS[attacker.type];
  const defData = UNITS[defender.type];

  // FIX: Declare at function scope so it is accessible outside the if block
  let counterDamage = 0;

  // Calculate damage
  const baseDamage = atkData.damage[defender.type] || 0;
  const terrain = map[defender.y][defender.x];
  const terrainDef = TERRAIN[terrain.type].def;
  // Home Territory Gradient: defender fights harder near their own HQ
  const homeBonus = getHomeTerritoryBonus(defender);
  // Combined modifier: terrain defence × (1 - homeBonus) shrinks incoming damage
  const defMod = terrainDef * (1 - homeBonus);
  const hpRatio = attacker.hp / attacker.maxHp;
  const finalDamage = Math.floor(baseDamage * hpRatio * defMod);

  // Log gradient effect when meaningful
  if (homeBonus > 0.02) {
    const pct = Math.round(homeBonus * 100);
    log(`Home ground: ${TEAMS[defender.team]} ${defData.name} gains +${pct}% territorial defence`);
  }

  // Prepare history log
  const combatLog = {
    type: 'combat',
    attacker: attacker,
    defender: defender,
    damageDealt: finalDamage,
    counterDamage: 0, // Will be updated if counter occurs
    deadUnit: null
  };

  // Apply damage
  defender.hp -= finalDamage;
  log(`${TEAMS[attacker.team]} ${atkData.name} attacks ${TEAMS[defender.team]} ${defData.name} for ${finalDamage} damage`);

  const dist = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);

  if (defender.hp <= 0) {
    log(`${TEAMS[defender.team]} ${defData.name} destroyed!`);
    combatLog.deadUnit = defender; // Remember who died
    units = units.filter(u => u !== defender);
  } else {
    // Counter-attack logic
    if (!defData.ranged && dist === 1) {
      // FIX: Assign to the function-scoped variable, do not redeclare with const
      counterDamage = Math.floor((defData.damage[attacker.type] || 0) * (defender.hp / defender.maxHp));

      combatLog.counterDamage = counterDamage; // Update log

      attacker.hp -= counterDamage;
      log(`${TEAMS[defender.team]} ${defData.name} counters for ${counterDamage} damage`);

      if (attacker.hp <= 0) {
        log(`${TEAMS[attacker.team]} ${atkData.name} destroyed!`);
        combatLog.deadUnit = attacker; // Attacker might die too
        units = units.filter(u => u !== attacker);
      }
    }
  }

  // Push to combined history
  actionHistory.push(combatLog);
  updateUndoButton();

  // RETURN DATA FOR VISUALS
  // FIX: counterDamage is now accessible here
  return { damage: finalDamage, counter: counterDamage, kill: !!combatLog.deadUnit };
}

// FIX #2: FRIENDLY UNIT MOVEMENT THROUGH UNITS/STRUCTURES
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

    for (const next of neighbors) {
      // Boundary check
      if (next.x < 0 || next.x >= map[0].length || next.y < 0 || next.y >= map.length) continue;

      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;

      const terrain = map[next.y][next.x];
      const moveCost = TERRAIN[terrain.type].move;
      if (moveCost >= 255) continue; // Impassable terrain

      // Check for blocking units
      const otherUnit = getUnitAt(next.x, next.y);
      if (otherUnit) {
        // Allow pathing THROUGH friendly units (but not stopping on them)
        if (allowFriendlyPass && otherUnit.team === unit.team) {
          // Continue pathfinding through this tile but don't add to movable tiles yet
        } else {
          // Enemy unit blocks movement
          continue;
        }
      }

      const newCost = current.cost + moveCost;
      if (newCost <= UNITS[unit.type].move) {
        visited.add(key);
        // Only add to movable tiles if no enemy unit occupies the space
        // Friendly units don't block pathfinding but we can't END movement on them (except HQ capture handled later)
        if (!otherUnit || (allowFriendlyPass && otherUnit.team === unit.team)) {
          // Don't add tiles with friendly units to movable list (can't end move there)
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

// ==================== HQ THREAT DETECTION ====================
// Calculate appropriate HQ vision radius based on map size and HQ distance
function calculateHQVision() {
  // Find both HQs
  const stellarHQ = structures.find(s => s.type === 'hq' && s.team === 0);
  const lunarHQ = structures.find(s => s.type === 'hq' && s.team === 1);

  if (!stellarHQ || !lunarHQ) {
    // Fallback: use a percentage of map size if one HQ is missing
    return Math.max(4, Math.floor(Math.max(boardWidth, boardHeight) * 0.25));
  }

  // Calculate Manhattan distance between HQs
  const hqDistance = Math.abs(stellarHQ.x - lunarHQ.x) + Math.abs(stellarHQ.y - lunarHQ.y);

  // Vision radius = 35% of HQ distance (gives AI time to react)
  // Min of 4 tiles (for very small maps)
  // Max of 10 tiles (to avoid excessive early detection on huge maps)
  const calculatedVision = Math.floor(hqDistance * 0.35);
  const vision = Math.max(4, Math.min(10, calculatedVision));

  return vision;
}

// Check if player has entered AI detection range (called after player moves)
let lastThreatCheckState = false; // Track if we've already warned
// Once defend mode is triggered it stays latched until ALL capturing threats
// leave the detection radius entirely — prevents turn-by-turn mode flickering
// that caused infantry to alternate between retreating and mountain-seeking.
let aiDefendLatch = false;
function checkPlayerDetection() {
  if (turn !== 0) return; // Only check during player turn

  const aiHQ = structures.find(s => s.type === 'hq' && s.team === 1);
  if (!aiHQ) return;

  const visionRadius = calculateHQVision();
  const threats = detectHQThreats(aiHQ, 0);
  const capturingThreats = threats.filter(t => t.canCapture);

  // If we have capturing threats and haven't warned yet this turn
  if (capturingThreats.length > 0 && !lastThreatCheckState) {
    const closestThreat = capturingThreats.reduce((min, t) =>
      t.distance < min.distance ? t : min
    );
    const unitName = UNITS[closestThreat.unit.type].name;
    log(`Detected! Enemy ${unitName} has entered AI detection range (${closestThreat.distance}/${visionRadius} tiles from HQ)`);
    lastThreatCheckState = true;
  } else if (capturingThreats.length === 0) {
    lastThreatCheckState = false; // Reset if no threats
  }
}

// Detects enemy units within HQ vision radius
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
        });
      }
    }
  });

  return threats;
}

// Calculate approximate time for a unit to reach a position
function calculateTimeToReach(fromX, fromY, toX, toY, moveSpeed) {
  const distMap = getDistToHQ(toX, toY);
  const pathDist = distMap[fromY][fromX];
  if (pathDist === 999) return 999; // Unreachable
  return Math.ceil(pathDist / moveSpeed);
}

// Determine if AI should switch to defensive mode
function shouldDefend(aiTeam) {
  const aiHQ = structures.find(s => s.type === 'hq' && s.team === aiTeam);
  if (!aiHQ) { aiDefendLatch = false; return false; }

  const playerHQ = structures.find(s => s.type === 'hq' && s.team === 0);
  if (!playerHQ) { aiDefendLatch = false; return false; }

  const threats = detectHQThreats(aiHQ, 0);
  const capturingThreats = threats.filter(t => t.canCapture);

  // LATCH CLEAR: only drop out of defend mode when no capturing threats
  // remain anywhere in the detection radius — not just when timing flips
  if (capturingThreats.length === 0) {
    aiDefendLatch = false;
    return false;
  }

  // If latch is already set, keep defending regardless of timing recalculation.
  if (aiDefendLatch) return true;

  // Fresh threat — run timing check to decide whether to engage latch.
  const closestThreat = capturingThreats.reduce((min, t) =>
    t.distance < min.distance ? t : min
  );
  const threatUnit = closestThreat.unit;
  const turnsToAIHQ = calculateTimeToReach(
    threatUnit.x, threatUnit.y,
    aiHQ.x, aiHQ.y,
    UNITS[threatUnit.type].move
  );

  const aiCapturingUnits = units.filter(u => u.team === aiTeam && UNITS[u.type].capture);
  if (aiCapturingUnits.length === 0) { aiDefendLatch = true; return true; }

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

  if (totalDefenseTime < totalAttackTime) {
    aiDefendLatch = true; // Latch ON — will not drop until threat clears
    return true;
  }
  return false;
}

// === DANGER MAP: How threatened is each tile by player units? ===
// Weights reflect how dangerous each player unit type is to be adjacent to.
const UNIT_THREAT_WEIGHT = {
  infantry: 1,
  mech: 2,
  tank: 4,
  heavy: 6,
  artillery: 0,  // Ranged — dangerous but doesn't threaten adjacent tiles directly
  rocket: 0
};

// UNIT_CAUTION: How much does each AI unit type care about the danger score?
// Capturers (infantry/mech) are squishy and mission-critical — they must be cautious.
// Heavy armor can accept more risk.
const UNIT_CAUTION = {
  infantry: 5,
  mech: 4,
  tank: 2,
  heavy: 1,
  artillery: 3,
  rocket: 3
};

function buildDangerMap() {
  const height = map.length;
  const width = map[0].length;
  const danger = Array.from({ length: height }, () => new Float32Array(width));

  // Analyze every Player Unit
  units.filter(u => u.team === 0).forEach(enemy => {
    // 1. How scary is this unit?
    const weight = UNIT_THREAT_WEIGHT[enemy.type] ?? 1;
    if (weight === 0) return;

    // 2. Where can this enemy MOVE?
    // We get all possible tiles the enemy can reach next turn
    const enemyMoves = getMovableTiles(enemy, false);

    // Add the enemy's current position (in case they don't move but shoot)
    enemyMoves.push({x: enemy.x, y: enemy.y});

    // 3. From those move tiles, where can they ATTACK?
    const uData = UNITS[enemy.type];
    const minR = uData.ranged ? uData.minRange : 1;
    const maxR = uData.ranged ? uData.maxRange : 1;

    enemyMoves.forEach(moveTile => {
      // Mark the move tile itself as dangerous (collision risk/blocking)
      danger[moveTile.y][moveTile.x] += weight * 0.5;

      // Project attack range from this potential position
      // Optimization: Scan only a bounding box around the moveTile
      for (let dy = -maxR; dy <= maxR; dy++) {
        for (let dx = -maxR; dx <= maxR; dx++) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist < minR || dist > maxR) continue;

          const tx = moveTile.x + dx;
          const ty = moveTile.y + dy;

          // Bounds check
          if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
            // INCREASE DANGER
            // We add the weight to this tile because the enemy can hit it next turn.
            danger[ty][tx] += weight;
          }
        }
      }
    });
  });

  return danger;
}

// Armor-specific threat map: tracks tiles reachable by player tanks and heavy tanks only.
// This is kept separate from the general danger map so capturers can apply
// a stronger, redundancy-scaled avoidance without over-penalising normal infantry threats.
const ARMOR_TYPES = new Set(['tank', 'heavy']);

function buildArmorThreatMap() {
  const height = map.length;
  const width = map[0].length;
  const armorThreat = Array.from({ length: height }, () => new Float32Array(width));

  units.filter(u => u.team === 0 && ARMOR_TYPES.has(u.type)).forEach(enemy => {
    const weight = UNIT_THREAT_WEIGHT[enemy.type]; // 4 for tank, 6 for heavy
    // The tile the armor occupies is maximally dangerous
    armorThreat[enemy.y][enemy.x] += weight * 2;
    // All tiles it can reach this turn
    const reachable = getMovableTiles(enemy, false);
    reachable.forEach(t => { armorThreat[t.y][t.x] += weight; });
  });

  return armorThreat;
}

// Count how many player units are adjacent to (x,y) — used for post-attack survival check
function countAdjacentEnemies(x, y) {
  const neighbors = [
    { x: x + 1, y }, { x: x - 1, y },
    { x, y: y + 1 }, { x, y: y - 1 }
  ];
  return neighbors.filter(n =>
    n.x >= 0 && n.x < map[0].length &&
    n.y >= 0 && n.y < map.length &&
    getUnitAt(n.x, n.y)?.team === 0
  ).length;
}

// === ASYNC AI TURN EXECUTION ===
async function runAITurn() {
  if (gameOver || turn !== 1) return;
  aiThinking = true;
  updateUI();

  // === UNIT PRIORITIZATION: Process in strategic order ===
  const allAIUnits = units.filter(u => u.team === 1 && !u.moved);
  const rangedUnits = [];
  const capturerUnits = [];
  const otherUnits = [];

  allAIUnits.forEach(u => {
    const uData = UNITS[u.type];
    if (uData.ranged) rangedUnits.push(u);
    else if (uData.capture) capturerUnits.push(u);
    else otherUnits.push(u);
  });

  const aiUnits = [...rangedUnits, ...capturerUnits, ...otherUnits];

  const defendMode = shouldDefend(1);
  if (defendMode) {
    const visionRange = calculateHQVision();
    log(`AI: Defensive positioning activated - threats detected near HQ!`);
    await sleep(800);
  }

  // Build threat maps ONCE per turn (snapshot of player threat coverage)
  const dangerMap = buildDangerMap();
  const armorThreatMap = buildArmorThreatMap();

  // SEQUENTIAL ASYNC LOOP
  for (const unit of aiUnits) {
    if (gameOver) break;
    // Check if unit still exists (could be killed by counter attack from prev unit)
    if (!units.includes(unit)) continue;

    // --- 1. VISUAL HIGHLIGHT (Thinking) ---
    highlightActor(unit.x, unit.y, true);
    await sleep(600); // Wait for player to see who is acting

    // --- 2. CAPTURE LOGIC ---
    const standingStruct = getStructureAt(unit.x, unit.y);
    if (standingStruct && standingStruct.type === 'hq' && standingStruct.team !== unit.team && UNITS[unit.type].capture) {
      queueCapture(unit, standingStruct);
      unit.moved = true;
      unit.hasMovedThisTurn = true;

      const infoEl = document.getElementById('pending-capture-info');
      if (infoEl) {
          infoEl.style.display = 'block';
          infoEl.style.color = '#4da6ff';
          infoEl.textContent = `Blue ${UNITS[unit.type].name} capturing...`;
      }

      spawnFloatingText(unit.x, unit.y, "CAPTURING", "capture");
      await sleep(1000); // Let text float
      highlightActor(unit.x, unit.y, false);
      render();
      continue; // Skip rest of turn for this unit
    }

    // --- 3. ATTACK (Pre-Move) ---
    // If we attack, we skip movement unless we kill? No, usually attack ends turn.
    let attacked = await tryAiAttack(unit);

    // --- 4. MOVEMENT ---
    if (!attacked && !unit.moved) {
        const movable = getMovableTiles(unit, true);
		// Direct the AI to Wait
        movable.push({ x: unit.x, y: unit.y, cost: 0 });
        if (movable.length > 0) {
            // Target Selection Logic (same as original)
            let targetX, targetY, targetHQ;
            if (defendMode) {
                const aiHQ = structures.find(s => s.type === 'hq' && s.team === 1);
                if (aiHQ) { targetX = aiHQ.x; targetY = aiHQ.y; targetHQ = aiHQ; }
                else {
                    targetHQ = structures.find(s => s.type === 'hq' && s.team === null);
                    if (!targetHQ) targetHQ = structures.find(s => s.type === 'hq' && s.team === 0);
                    if (targetHQ) { targetX = targetHQ.x; targetY = targetHQ.y; }
                }
            } else {
                targetHQ = structures.find(s => s.type === 'hq' && s.team === null);
                if (!targetHQ) targetHQ = structures.find(s => s.type === 'hq' && s.team === 0);
                if (targetHQ) { targetX = targetHQ.x; targetY = targetHQ.y; }
            }

            if (targetX !== undefined && targetY !== undefined) {
                const distMap = getDistToHQ(targetX, targetY);
                const hasInfantry = units.some(u => u.team === 1 && UNITS[u.type].capture);
                const isHQ = (tx, ty) => structures.some(s => s.x === tx && s.y === ty && s.type === 'hq');
                const cautionWeight = UNIT_CAUTION[unit.type] ?? 3;

                // Capturer redundancy: how many OTHER capturers are still active this turn?
                // If this unit is one of many, it can afford to take a safer route.
                // If it is the last capturer alive, it must press on despite armor risk.
                let armorAvoidWeight = 0;
                if (UNITS[unit.type].capture) {
                    const otherCapturers = units.filter(
                        u => u.team === 1 && u !== unit && UNITS[u.type].capture
                    );
                    // Scale: 0 other capturers → no extra penalty (must advance)
                    //        1 other capturer  → modest extra penalty
                    //        2+                → strong avoidance; let the safer one lead
                    const redundancy = Math.min(otherCapturers.length, 3);
                    armorAvoidWeight = redundancy * 6; // 0 / 6 / 12 / 18
                }

                movable.sort((a, b) => {
                    let scoreA = 0;
                    let scoreB = 0;

                    // --- PRE-CALCULATION ---
                    const getDistToNearestEnemy = (tx, ty) => {
                        let min = 99;
                        units.forEach(u => {
                            if (u.team === 0) {
                                const d = Math.abs(u.x - tx) + Math.abs(u.y - ty);
                                if (d < min) min = d;
                            }
                        });
                        return min;
                    };
                    const distA = getDistToNearestEnemy(a.x, a.y);
                    const distB = getDistToNearestEnemy(b.x, b.y);

                    // 1. TERRAIN DEFENSE
                    const getTerrainDef = (x, y) => TERRAIN[map[y][x].type].def; // 0.4 = mtn, 1.0 = road

                    // Convert float def to score: Mountain (0.4) -> 60pts, Road (1.0) -> 0pts
                    const getTerrainScore = (x, y) => {
                        const def = getTerrainDef(x, y);
                        let pts = (1.0 - def) * 100;
                        if (map[y][x].type === 'road') pts -= 20; // Active penalty for roads
                        return pts;
                    };

                    // DYNAMIC WEIGHT: Only use terrain if enemies are close
                    // AND we are not in emergency defend mode (urgency beats comfort)
                    if (!defendMode && (distA < 8 || distB < 8)) {
                        scoreA += getTerrainScore(a.x, a.y);
                        scoreB += getTerrainScore(b.x, b.y);
                    }

                    // 2. CALCULATED AGGRESSION
                    const caution = UNIT_CAUTION[unit.type] || 3;

                    // Calculate "Effective Danger"
                    // If I stand on a Mountain (0.4 def), I only take 40% of the danger penalty.
                    // If I stand on a Road (1.0 def), I take 100% of the penalty.
                    const defA = getTerrainDef(a.x, a.y);
                    const defB = getTerrainDef(b.x, b.y);

                    // Danger * DefenseMod * Caution
                    // This creates "Baiting": AI will stand in danger ONLY if it has cover.
                    scoreA -= dangerMap[a.y][a.x] * defA * caution;
                    scoreB -= dangerMap[b.y][b.x] * defB * caution;

                    // 3. UNIT SPECIFIC BEHAVIOR
                    if (UNITS[unit.type].ranged) {
                        const maxR = UNITS[unit.type].maxRange;
                        if (distA > maxR + 2 && distB > maxR + 2) {
                            scoreA -= distMap[a.y][a.x] * 5; // March
                            scoreB -= distMap[b.y][b.x] * 5;
                        } else {
                            if (distA <= 1) scoreA -= 500;
                            if (distB <= 1) scoreB -= 500;
                            if (distA === maxR) scoreA += 100;
                            if (distB === maxR) scoreB += 100;
                            if (distA >= UNITS[unit.type].minRange && distA < maxR) scoreA += 50;
                            if (distB >= UNITS[unit.type].minRange && distB < maxR) scoreB += 50;
                        }
                    } else {
                        // Melee Rush vs Defensive Retreat
                        // In defend mode the target IS the AI HQ: use a much stronger
                        // pull weight so terrain bonuses cannot override the order to
                        // fall back.  Also suppress the enemy-approach term — charging
                        // toward the attacker is exactly what defend mode must NOT do.
                        const hqPullWeight = defendMode ? 20 : 4;
                        scoreA -= distMap[a.y][a.x] * hqPullWeight;
                        scoreB -= distMap[b.y][b.x] * hqPullWeight;

                        if (!defendMode) {
                            // Engage Aggression: only press the enemy when NOT defending
                            scoreA -= distA * 3;
                            scoreB -= distB * 3;
                        }
                    }

                    // 4. CAPTURE LOGIC
                    const structA = getStructureAt(a.x, a.y);
                    const structB = getStructureAt(b.x, b.y);
                    if (UNITS[unit.type].capture) {
                         if (structA && structA.team !== unit.team) scoreA += 200;
                         if (structB && structB.team !== unit.team) scoreB += 200;
                    }

                    // 5. DECONFLICTION: penalise tiles that sit on a fellow AI unit's
                    //    shortest path to the HQ target.  Avoids corridor self-blocking.
                    if (targetX !== undefined) {
                        const fellowUnits = aiUnits.filter(u2 =>
                            u2 !== unit && !u2.moved && units.includes(u2)
                        );
                        const isOnFellowPath = (tx, ty) => fellowUnits.some(u2 => {
                            const d = distMap[u2.y][u2.x];
                            const dNext = distMap[ty][tx];
                            // It's on a fellow's path if it's closer to target than the fellow
                            // AND it's adjacent to the fellow's current position
                            const adjToFellow = Math.abs(u2.x - tx) + Math.abs(u2.y - ty) <= UNITS[u2.type].move;
                            return adjToFellow && dNext < d;
                        });
                        if (isOnFellowPath(a.x, a.y)) scoreA -= 60;
                        if (isOnFellowPath(b.x, b.y)) scoreB -= 60;
                    }

                    return scoreB - scoreA;
                });
            }

            // Execute Move
            const move = movable[0];
            highlightActor(unit.x, unit.y, false); // Clear old highlight

            unit.x = move.x;
            unit.y = move.y;
            unit.moved = true;
            unit.hasMovedThisTurn = true;

            // Render Movement immediately
            render();
            highlightActor(unit.x, unit.y, true); // Highlight new position
            await sleep(500); // Pause to let player see the move

            // Verify capture after move
            const structAfterMove = getStructureAt(unit.x, unit.y);
            if (structAfterMove && structAfterMove.team !== unit.team && UNITS[unit.type].capture) {
                queueCapture(unit, structAfterMove);
                spawnFloatingText(unit.x, unit.y, "SEIZING", "capture");
            }
        }
    }

    // --- 5. ATTACK (Post-Move) ---
    if (!attacked && !UNITS[unit.type].ranged && !unit.hasAttacked) {
        await tryAiAttack(unit);
    }

    // Cleanup for this unit
    highlightActor(unit.x, unit.y, false);
    render(); // Ensure board is clean for next unit
    await sleep(200); // Tiny pause between units
  }

  aiThinking = false;
  endTurn();
}

// Helper: AI Attack Sequence with Visuals
async function tryAiAttack(unit) {
    const targets = getAttackTargets(unit);
    if (targets.length > 0) {
        const targetPos = selectOptimalTarget(unit, targets);
        if (targetPos) {
            const targetUnit = getUnitAt(targetPos.x, targetPos.y);
            if (targetUnit) {
                // 1. Highlight Target
                highlightTarget(targetUnit.x, targetUnit.y, true);
                // log(`AI targeting ${UNITS[targetUnit.type].name}...`);
                await sleep(600); // Pause to see target

                // 2. Resolve Logic (Updates HP internally)
                const result = resolveCombat(unit, targetUnit);

                // 3. Show Numbers (Before Render Wipes Them!)
                if (result.damage > 0) spawnFloatingText(targetUnit.x, targetUnit.y, `-${result.damage}`, "damage");
                else spawnFloatingText(targetUnit.x, targetUnit.y, "MISS", "miss");

                if (result.counter > 0) {
                    // Small delay for counter number
                    setTimeout(() => {
                        spawnFloatingText(unit.x, unit.y, `-${result.counter}`, "counter");
                    }, 200);
                }

                // 4. BIG PAUSE - Allow reading numbers.
                // Do NOT call render() here, or text disappears.
                await sleep(1500);

                // 5. Cleanup Visuals & Commit State
                highlightTarget(targetUnit.x, targetUnit.y, false);
                unit.hasAttacked = true;
                if (UNITS[unit.type].ranged) unit.moved = true;
                unit.hasMovedThisTurn = true;

                render(); // NOW update HP bars

                // Re-highlight actor because render cleared it
                if (units.includes(unit)) highlightActor(unit.x, unit.y, true);

                return true;
            }
        }
    }
    return false;
}

// FIX #4: ENHANCED CAPTURE FEEDBACK IN INFO PANEL & LOG
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

    // ===== SHOW CAPTURE PROGRESS IN INFO PANEL =====
    if (struct.captureLeft < 20) {
      const progress = Math.floor(((20 - struct.captureLeft) / 20) * 100);
      info += ` [${progress}% captured]`;

      // Show who is capturing
      const capturingUnit = units.find(u =>
        u.pendingCapture && u.x === x && u.y === y
      );
      if (capturingUnit) {
        info += ` by ${TEAMS[capturingUnit.team]} ${UNITS[capturingUnit.type].name}`;
        pendingEl.textContent = `Capturing: ${progress}% complete (${struct.captureLeft} pts remaining)`;
        pendingEl.style.display = 'block';
      }
    }
    // Show capture opportunity for player
    else if (turn === 0 && struct.team !== 0) {
      const canCapture = units.some(u =>
        u.team === 0 &&
        UNITS[u.type].capture &&
        Math.abs(u.x - x) + Math.abs(u.y - y) <= UNITS[u.type].move
      );
      if (canCapture) {
        info += " [Can start capturing]";
        pendingEl.textContent = "HQ can be seized (requires multiple turns)";
        pendingEl.style.display = 'block';
        pendingEl.style.color = '#ff0';
      }
    }
    // ===== END CAPTURE FEEDBACK =====

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

    // Show capture status for selected unit
    if (unit.pendingCapture && struct) {
      const progress = Math.floor(((20 - struct.captureLeft) / 20) * 100);
      unitEl.innerHTML += `<br><small style="color:#0f0">Capturing HQ: ${progress}%</small>`;
    }
  } else {
    unitEl.textContent = '-';
  }
}

// FIX #5: RANGED UNIT VISUALIZATION OVERLAY + COMPLETE RENDER
function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  // Pre-calculate ranged attack tiles if a ranged unit is selected
  const rangedAttackTiles = [];
  if (selectedUnit && UNITS[selectedUnit.type].ranged) {
    const uData = UNITS[selectedUnit.type];
    for (let dy = -uData.maxRange; dy <= uData.maxRange; dy++) {
      for (let dx = -uData.maxRange; dx <= uData.maxRange; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist === 0 || dist > uData.maxRange) continue;  // Skip self and out-of-range

        const tx = selectedUnit.x + dx;
        const ty = selectedUnit.y + dy;
        if (tx < 0 || tx >= boardWidth || ty < 0 || ty >= boardHeight) continue;

        rangedAttackTiles.push({x: tx, y: ty, dist: dist});
      }
    }
  }

  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const cell = document.createElement('div');
      cell.className = `cell ${map[y][x].type}`;

      // Add terrain character
      const terrainChar = document.createElement('span');
      terrainChar.className = 'terrain-char';
      terrainChar.textContent = TERRAIN[map[y][x].type].char;
      cell.appendChild(terrainChar);

      const unit = getUnitAt(x, y);
      const struct = getStructureAt(x, y);

      // Selection highlighting
      if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
        cell.classList.add('selected');
      }

      // Movable tiles highlighting (including friendly-passable visualization)
      const isMovable = movableTiles.find(t => t.x === x && t.y === y);
      if (isMovable) {
        cell.classList.add('movable');
        // Visual indicator for tiles with friendly units we can move through
        const blockingUnit = getUnitAt(x, y);
        if (blockingUnit && blockingUnit.team === selectedUnit?.team) {
          cell.classList.add('friendly-passable');
        }
      }

      // Attackable tiles highlighting
      if (attackableTiles.find(t => t.x === x && t.y === y)) {
        cell.classList.add('range-indicator');
      }

      // Ranged attack visualization
      const rangedTile = rangedAttackTiles.find(t => t.x === x && t.y === y);
      if (rangedTile) {
        cell.classList.add('range-highlight');
        if (rangedTile.dist < UNITS[selectedUnit.type].minRange) {
          cell.classList.add('min-range-highlight');
        }
      }

      // Structure rendering
      if (struct) {
        const structSpan = document.createElement('span');
        structSpan.textContent = STRUCTURES[struct.type].char;
        structSpan.className = 'structure';
        if (struct.team !== null) {
          structSpan.classList.add(struct.team === 0 ? 'stellar' : 'lunar');
        } else {
          structSpan.classList.add('neutral');
        }
        cell.appendChild(structSpan);

        // Capture progress bar visualization
        if (struct.captureLeft < 20) {
          const capDiv = document.createElement('div');
          capDiv.className = 'pending-capture';
          cell.appendChild(capDiv);

          const progressDiv = document.createElement('div');
          progressDiv.className = 'capture-progress';
          progressDiv.style.width = `${(1 - struct.captureLeft/20) * 100}%`;
          cell.appendChild(progressDiv);
        }

        // HQ capture opportunity highlight for player
        if (struct.team !== turn && turn === 0 && struct.type === 'hq') {
          const captureUnits = units.filter(u =>
            u.team === 0 &&
            UNITS[u.type].capture &&
            Math.abs(u.x - x) + Math.abs(u.y - y) <= UNITS[u.type].move
          );
          if (captureUnits.length > 0) {
            cell.classList.add('hq-target');
          }
        }
      }

      // Unit rendering
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

      // Home Territory Gradient tint
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

      cell.onclick = () => onCellClick(x, y);
      cell.onmouseover = () => showTileInfo(x, y);
      board.appendChild(cell);
    }
  }
}

function queueCapture(unit, structure) {
  if (structure.team === unit.team) return;
  if (!UNITS[unit.type].capture) return;
  unit.pendingCapture = true;
  if (!pendingCaptures.find(pc => pc.unit === unit && pc.structure === structure)) {
    pendingCaptures.push({ unit, structure });
  }
}

// FIX #4: PROPER VICTORY CONDITION (owning ALL HQs)
function processPendingCaptures() {
  if (pendingCaptures.length === 0) return;

  const infoEl = document.getElementById('pending-capture-info');

  for (const { unit, structure } of pendingCaptures) {
    // Validation
    if (!units.includes(unit) || unit.x !== structure.x || unit.y !== structure.y) continue;

    // Calculate points
    // Minimum 1 point so a wounded unit can always complete a capture given enough turns
    const capturePoints = Math.max(1, Math.floor((unit.hp / unit.maxHp) * 10));
    structure.captureLeft -= capturePoints;

    // --- NEW: Update Info Box Screen ---
    const tName = TEAMS[unit.team];
    infoEl.style.display = 'block';
    infoEl.style.color = unit.team === 0 ? '#ffd700' : '#4da6ff'; // Gold for Stellar, Blue for Lunar
    infoEl.textContent = `${tName} seizing HQ: -${capturePoints} pts (${Math.max(0, structure.captureLeft)} remaining)`;
    // -----------------------------------

    log(`${tName} ${UNITS[unit.type].name} captures ${capturePoints} pts (${structure.captureLeft} remaining)`);

    // Handle Completion
    if (structure.captureLeft <= 0) {
      const previousTeam = structure.team;
      structure.team = unit.team;
      structure.captureLeft = 20;

      // --- NEW: Success Message ---
      infoEl.textContent = `★ HQ CAPTURED by ${tName}! ★`;
      infoEl.style.color = '#00ff00'; // Green for success
      // ----------------------------

      log(`HQ CAPTURED by ${tName}!`);

      // Check Win Condition
      const allHQs = structures.filter(s => s.type === 'hq');
      if (allHQs.every(s => s.team === 0)) { gameOver = true; log(`Victory! Gold  wins!`); }
      else if (allHQs.every(s => s.team === 1)) { gameOver = true; log(`Victory! Blue wins!`); }
    }
  }

  pendingCaptures = [];
  units.forEach(u => u.pendingCapture = false);
  requestAnimationFrame(render);
}

// Parse map string into grid
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
      { type: 'infantry', x: 2, y: 2, team: 0 }, { type: 'infantry', x: 4, y: 2, team: 0 }, { type: 'infantry', x: 1, y: 3, team: 0 },
      { type: 'mech', x: 3, y: 3, team: 0 }, { type: 'tank', x: 2, y: 4, team: 0 }, { type: 'tank', x: 4, y: 4, team: 0 },
      { type: 'artillery', x: 3, y: 4, team: 0 }, { type: 'rocket', x: 2, y: 5, team: 0 },
      { type: 'infantry', x: 13, y: 9, team: 1 }, { type: 'infantry', x: 11, y: 9, team: 1 }, { type: 'infantry', x: 14, y: 8, team: 1 },
      { type: 'mech', x: 12, y: 8, team: 1 }, { type: 'tank', x: 13, y: 7, team: 1 }, { type: 'tank', x: 11, y: 7, team: 1 },
      { type: 'artillery', x: 12, y: 7, team: 1 }, { type: 'rocket', x: 13, y: 6, team: 1 }
    ]
  },
  siegeAdvanced: {
    name: 'Siege - Advanced',
    width: 18,
    height: 13,
    mapString: SCENARIOS.siege.mapString,
    structures: SCENARIOS.siege.structures,
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
    name: 'River Crossing - Advanced',
    width: 20,
    height: 14,
    mapString: SCENARIOS.bridgeHead.mapString,
    structures: SCENARIOS.bridgeHead.structures,
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
    name: 'The Gauntlet - Advanced',
    width: 12,
    height: 16,
    mapString: SCENARIOS.gauntlet.mapString,
    structures: SCENARIOS.gauntlet.structures,
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

// ==================== SKIRMISH ====================
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    randomizableZones: [
      {x: 2, y: 1, width: 5, height: 5},
      {x: 9, y: 1, width: 5, height: 5},
      {x: 2, y: 8, width: 5, height: 5},
      {x: 9, y: 8, width: 5, height: 5}
    ],
    stellarSpawnZones: [ {x: 1, y: 1, width: 5, height: 4}, {x: 1, y: 7, width: 4, height: 3} ],
    lunarSpawnZones: [ {x: 12, y: 1, width: 5, height: 4}, {x: 13, y: 10, width: 4, height: 3} ],
    stellarHQ: {x: 3, y: 2},
    lunarHQ: {x: 13, y: 11}
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
≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋`.trim(),
    randomizableZones: [
      {x: 1, y: 1, width: 8, height: 5}, {x: 1, y: 6, width: 8, height: 4}, {x: 1, y: 10, width: 8, height: 5},
      {x: 13, y: 1, width: 8, height: 5}, {x: 13, y: 6, width: 8, height: 4}, {x: 13, y: 10, width: 8, height: 5}
    ],
    stellarSpawnZones: [ {x: 1, y: 1, width: 7, height: 5}, {x: 1, y: 6, width: 7, height: 4}, {x: 1, y: 10, width: 7, height: 5} ],
    lunarSpawnZones: [ {x: 12, y: 1, width: 7, height: 5}, {x: 12, y: 6, width: 7, height: 4}, {x: 12, y: 10, width: 7, height: 5} ],
    stellarHQ: {x: 3, y: 2},
    lunarHQ: {x: 16, y: 13}
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
    if (TERRAIN[map[y][x].type].move >= 255) continue;
    const key = `${x},${y}`;
    if (occupiedPositions.has(key)) continue;
    return {x, y};
  }
  return { x: zone.x + Math.floor(zone.width / 2), y: zone.y + Math.floor(zone.height / 2) };
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

// ==================== GAME STATE & CONTROLS ====================
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

function loadScenario(scenarioId) {
  currentScenario = scenarioId;
  actionHistory = [];
  gameOver = false;
  aiThinking = false;
  pendingCaptures = [];
  aiDefendLatch = false;

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
    structures = scenario.structures.map(s => ({
      ...s,
      captureLeft: 20
    }));
    units = scenario.units.map((u, idx) => ({
      id: idx,
      ...u,
      maxHp: UNITS[u.type].hp,
      hp: UNITS[u.type].hp,
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
}

function randomizeCurrent() {
  if (currentScenario.startsWith('skirmish')) {
    loadSkirmish(currentScenario);
  }
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

  stellarComposition.forEach((unitType, idx) => {
    const zoneIdx = idx % template.stellarSpawnZones.length;
    const zone = template.stellarSpawnZones[zoneIdx];
    const pos = findValidSpawnInZone(zone, map, occupiedPositions);
    occupiedPositions.add(`${pos.x},${pos.y}`);
    units.push({
      id: unitId++, type: unitType, x: pos.x, y: pos.y, team: 0,
      maxHp: UNITS[unitType].hp, hp: UNITS[unitType].hp,
      moved: false, hasAttacked: false, hasMovedThisTurn: false, pendingCapture: false
    });
  });

  lunarComposition.forEach((unitType, idx) => {
    const zoneIdx = idx % template.lunarSpawnZones.length;
    const zone = template.lunarSpawnZones[zoneIdx];
    const pos = findValidSpawnInZone(zone, map, occupiedPositions);
    occupiedPositions.add(`${pos.x},${pos.y}`);
    units.push({
      id: unitId++, type: unitType, x: pos.x, y: pos.y, team: 1,
      maxHp: UNITS[unitType].hp, hp: UNITS[unitType].hp,
      moved: false, hasAttacked: false, hasMovedThisTurn: false, pendingCapture: false
    });
  });

  turn = 0; selectedUnit = null; movableTiles = []; attackableTiles = [];
  document.getElementById('board').className = 'skirmish-bg';
  document.getElementById('board').style.gridTemplateColumns = `repeat(${boardWidth}, 28px)`;
  document.getElementById('board').style.gridTemplateRows = `repeat(${boardHeight}, 28px)`;
  render();
  updateUI();
  log(`Skirmish: ${template.name}`);
}

function getUnitAt(x, y) {
  return units.find(u => u.x === x && u.y === y);
}

function getStructureAt(x, y) {
  return structures.find(s => s.x === x && s.y === y);
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
          targets.push({ x: tx, y: ty });
        }
      }
    }
  } else {
    const neighbors = [
      { x: unit.x + 1, y: unit.y }, { x: unit.x - 1, y: unit.y },
      { x: unit.x, y: unit.y + 1 }, { x: unit.x, y: unit.y - 1 }
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

function calculateAttackValue(attacker, target, targetPos) {
  const atkData = UNITS[attacker.type];
  const defData = UNITS[target.type];

  // 1. UNIT VALUES
  const UNIT_VALUE = {
    infantry: 10, mech: 30, tank: 70, heavy: 160, artillery: 60, rocket: 150
  };

  // --- HQ DEFENSE OVERRIDE (The Last Stand Fix) ---
  // Is the target standing on a structure owned by the AI?
  const struct = getStructureAt(target.x, target.y);
  const isThreateningHQ = struct && struct.type === 'hq' && struct.team === attacker.team;

  // If the enemy is on our HQ, attack by default.
  // Ignore self-preservation. Dealing even 1 HP damage reduces capture rate.
  if (isThreateningHQ) {
      return 5000; // Massive priority, overrides everything else
  }
  // -------------------------------------------------------

  // 2. DAMAGE CALCULATION
  const baseDamage = atkData.damage[target.type] || 0;
  const hpRatio = attacker.hp / attacker.maxHp;
  const terrain = map[target.y][target.x];
  const defMod = TERRAIN[terrain.type].def;
  const damage = Math.ceil(baseDamage * hpRatio * defMod);

  // 3. BASE SCORE
  const targetVal = UNIT_VALUE[target.type] || 20;
  let score = (damage / target.maxHp) * targetVal;

  // 4. LETHALITY BONUS
  if (damage >= target.hp) {
    score += targetVal * 0.5;
    if (defData.capture) score += 50;
    if (defData.ranged) score += 40;
  }

  // 5. SELF-PRESERVATION & CAUTION
  if (!atkData.ranged) {
    const remainingHP = Math.max(0, target.hp - damage);
    let counterDamage = 0;

    if (remainingHP > 0) {
        const counterRatio = remainingHP / target.maxHp;
        counterDamage = Math.floor((defData.damage[attacker.type] || 0) * counterRatio);
    }

    const selfVal = UNIT_VALUE[attacker.type] || 20;
    const valueLost = (counterDamage / attacker.maxHp) * selfVal;
    score -= valueLost;

    if (counterDamage >= attacker.hp) {
        if (targetVal < selfVal * 1.5) {
            score -= 1000;
        }
    }

    if (hpRatio < 0.5 && counterDamage > 0) {
        const cautionPenalty = (1 - hpRatio) * 50;
        score -= cautionPenalty;
    }

    const adjacentThreats = countAdjacentEnemies(attacker.x, attacker.y);
    if (adjacentThreats > 1) {
        const cautionLevel = UNIT_CAUTION[attacker.type] ?? 3;
        score -= (adjacentThreats - 1) * 20 * cautionLevel;
    }
  }

  return score;
}

function selectOptimalTarget(attacker, targets) {
  if (targets.length === 0) return null;
  let bestTarget = null;
  let bestValue = -Infinity;
  for (const pos of targets) {
    const target = getUnitAt(pos.x, pos.y);
    if (!target) continue;
    const value = calculateAttackValue(attacker, target, pos);
    if (value > bestValue) {
      bestValue = value;
      bestTarget = pos;
    }
  }
  return bestTarget;
}

function endTurn() {
  // 1. Queue Captures based on unit positions
  units.forEach(u => {
    if (u.team === turn) {
      const s = getStructureAt(u.x, u.y);
      if (s && s.type === 'hq' && s.team !== u.team && UNITS[u.type].capture) {
        queueCapture(u, s);
      }
    }
  });

  // 2. Resolve HQ Captures (Highest Priority Win Condition)
  processPendingCaptures();

  if (gameOver) return;

  // 3. Count armies for Annihilation/Rout check
  const stellarUnits = units.filter(u => u.team === 0);
  const lunarUnits = units.filter(u => u.team === 1);

  // ROUT CHECK: If an army is wiped out, the survivor wins immediately.
  if (lunarUnits.length === 0) {
    gameOver = true;
    log('Enemy Destroyed! Gold wins!');
    updateUI();
    return;
  }

  if (stellarUnits.length === 0) {
    gameOver = true;
    log('Allied Army Destroyed! Blue wins!');
    updateUI();
    return;
  }

  // 4. STALEMATE CHECK: Both sides exist, but neither can capture HQ.
  const stellarCanCapture = stellarUnits.some(u => UNITS[u.type].capture);
  const lunarCanCapture = lunarUnits.some(u => UNITS[u.type].capture);

  if (!stellarCanCapture && !lunarCanCapture) {
    gameOver = true;
    log('Stalemate! No capturing units remain on either side.');
    log('Game ends in a draw.');
    updateUI();
    return;
  }

  // 5. Proceed to Next Turn
  turn = 1 - turn;
  lastThreatCheckState = false;

  units.forEach(u => {
    u.moved = false;
    u.hasAttacked = false;
    u.hasMovedThisTurn = false;
  });

  selectedUnit = null;
  movableTiles = [];
  attackableTiles = [];
  actionHistory = [];

  render();
  updateUI();

  if (turn === 1 && !gameOver) {
    // Start Async AI Turn
    setTimeout(() => runAITurn(), 500);
  }
}

function recordMove(unit, fromX, fromY) {
  actionHistory.push({
    type: 'move', unit: unit, fromX: fromX, fromY: fromY, toX: unit.x, toY: unit.y
  });
  updateUndoButton();
}

function recordCombat() {
  actionHistory = [];
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('undo-btn');
  btn.disabled = actionHistory.length === 0 || turn !== 0 || aiThinking;
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
    pendingCaptures = pendingCaptures.filter(pc => pc.unit !== unit);
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

function confirmEndTurn() {
  const unmovedUnits = units.filter(u => u.team === 0 && !u.hasMovedThisTurn);
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

function onCellClick(x, y) {
  if (gameOver || turn !== 0 || aiThinking) return;

  const clickedUnit = getUnitAt(x, y);
  const clickedStruct = getStructureAt(x, y);

  // Deselect if clicking selected unit
  if (selectedUnit && selectedUnit.x === x && selectedUnit.y === y) {
    selectedUnit = null; movableTiles = []; attackableTiles = []; render(); return;
  }

  // Attempt Selection
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

  // Handle Movement/Attack with selected unit
  if (selectedUnit) {
    const isAttackable = attackableTiles.find(t => t.x === x && t.y === y);
    const isMovable = movableTiles.find(t => t.x === x && t.y === y);

    // Valid Attack - UPDATED FOR VISUALS
    if (isAttackable && clickedUnit && clickedUnit.team !== 0) {
      // 1. Lock Input
      aiThinking = true; // Block clicks while animation plays

      // 2. Visuals
      highlightTarget(clickedUnit.x, clickedUnit.y, true);

      // 3. Logic
      recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);
      const res = resolveCombat(selectedUnit, clickedUnit);
      recordCombat();

      // 4. Floating Numbers
      if (res.damage > 0) spawnFloatingText(clickedUnit.x, clickedUnit.y, `-${res.damage}`, "damage");
      else spawnFloatingText(clickedUnit.x, clickedUnit.y, "MISS", "miss");

      if (res.counter > 0) {
          setTimeout(() => spawnFloatingText(selectedUnit.x, selectedUnit.y, `-${res.counter}`, "counter"), 200);
      }

      // 5. Update Unit State
      selectedUnit.moved = true;
      selectedUnit.hasAttacked = true;
      selectedUnit.hasMovedThisTurn = true;

      // 6. Delay Render so player sees text
      setTimeout(() => {
          highlightTarget(clickedUnit.x, clickedUnit.y, false);
          selectedUnit = null;
          movableTiles = [];
          attackableTiles = [];
          aiThinking = false; // Unlock Input
          render();
          updateUI();
      }, 1200);

      return;
    }

    // Valid Move
    if (isMovable && (!clickedUnit || (clickedStruct && clickedStruct.type === 'hq' && UNITS[selectedUnit.type].capture))) {
      recordMove(selectedUnit, selectedUnit.x, selectedUnit.y);
      selectedUnit.x = x;
      selectedUnit.y = y;

      if (clickedStruct && clickedStruct.team !== selectedUnit.team && UNITS[selectedUnit.type].capture) {
        queueCapture(selectedUnit, clickedStruct);
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
    teamEl.textContent = "Moving...";
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

const logQueue = [];
let logBusy = false;

function log(msg) {
  logQueue.push(msg);
  if (!logBusy) processLogQueue();
}

function processLogQueue() {
  if (logQueue.length === 0) { logBusy = false; return; }
  logBusy = true;
  const msg = logQueue.shift();
  const logDiv = document.getElementById('log');
  const entry = document.createElement('div');
  entry.textContent = `> ${msg}`;
  logDiv.appendChild(entry);
  logDiv.scrollTop = logDiv.scrollHeight;
  // Faster logs since AI waits in its own loop
  setTimeout(processLogQueue, 50);
}

// Initialize game
loadScenario('borderClash');
