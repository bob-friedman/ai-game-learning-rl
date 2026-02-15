const TEAMS = ["Stellar Command", "Lunar Directorate"],
  UNITS = {
    infantry: {
      name: "Infantry",
      char: "i",
      hp: 10,
      move: 3,
      vision: 2,
      damage: {
        infantry: 5,
        tank: 2,
        mech: 3,
        heavy: 2,
        artillery: 4,
        rocket: 3,
      },
      capture: !0,
      desc: "Basic unit. Can capture HQ.",
    },
    tank: {
      name: "Tank",
      char: "T",
      hp: 10,
      move: 2,
      vision: 3,
      damage: {
        infantry: 8,
        tank: 6,
        mech: 5,
        heavy: 4,
        artillery: 5,
        rocket: 6,
      },
      capture: !1,
      desc: "Mobile armor. Road bonus essential.",
    },
    mech: {
      name: "Mech",
      char: "m",
      hp: 12,
      move: 2,
      vision: 2,
      damage: {
        infantry: 6,
        tank: 5,
        mech: 5,
        heavy: 3,
        artillery: 6,
        rocket: 5,
      },
      capture: !0,
      desc: "Heavy infantry. Better defense than tanks.",
    },
    heavy: {
      name: "Heavy Tank",
      char: "H",
      hp: 16,
      move: 2,
      vision: 2,
      damage: {
        infantry: 10,
        tank: 8,
        mech: 9,
        heavy: 6,
        artillery: 7,
        rocket: 8,
      },
      capture: !1,
      desc: "Juggernaut. Slow but devastating",
    },
    artillery: {
      name: "Artillery",
      char: "A",
      hp: 8,
      move: 2,
      vision: 5,
      damage: {
        infantry: 9,
        tank: 8,
        mech: 8,
        heavy: 6,
        artillery: 5,
        rocket: 7,
      },
      capture: !1,
      ranged: !0,
      minRange: 3,
      maxRange: 4,
      desc: "Long range. Cannot move and fire.",
    },
    rocket: {
      name: "Rocket",
      char: "R",
      hp: 7,
      move: 2,
      vision: 4,
      damage: {
        infantry: 6,
        tank: 10,
        mech: 9,
        heavy: 8,
        artillery: 6,
        rocket: 5,
      },
      capture: !1,
      ranged: !0,
      minRange: 3,
      maxRange: 5,
      desc: "Anti-armor specialist. Fragile. Range 3-5.",
    },
  },
  TERRAIN = {
    plain: {
      name: "Plains",
      char: "·",
      def: 0.85,
      move: 1,
      desc: "Open ground",
    },
    wood: { name: "Woods", char: "♣", def: 0.7, move: 2, desc: "Light cover" },
    mountain: {
      name: "Mountain",
      char: "▲",
      def: 0.4,
      move: 3,
      desc: "Heavy cover",
    },
    road: { name: "Road", char: "═", def: 1, move: 1, desc: "Fast movement" },
    water: {
      name: "Water",
      char: "≋",
      def: 0,
      move: 255,
      desc: "Impassable to ground units",
    },
  },
  STRUCTURES = { hq: { char: "★", name: "HQ", desc: "Capture to win" } };
function resolveCombat(attacker, defender) {
  const attackerData = UNITS[attacker.type],
    defenderData = UNITS[defender.type],
    baseDamage = attackerData.damage[defender.type] || 0,
    terrainTile = map[defender.y][defender.x],
    defenseMod = TERRAIN[terrainTile.type].def,
    attackerHpRatio = attacker.hp / attacker.maxHp,
    damageDealt = Math.floor(baseDamage * attackerHpRatio * defenseMod),
    combatLog = {
      type: "combat",
      attacker: attacker,
      defender: defender,
      damageDealt: damageDealt,
      counterDamage: 0,
      deadUnit: null,
    };
  ((defender.hp -= damageDealt),
    log(
      `${TEAMS[attacker.team]} ${attackerData.name} attacks ${TEAMS[defender.team]} ${defenderData.name} for ${damageDealt} damage`,
    ));
  const dist =
    Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
  if (defender.hp <= 0)
    (log(`${TEAMS[defender.team]} ${defenderData.name} destroyed!`),
      (combatLog.deadUnit = defender),
      (units = units.filter((attacker) => attacker !== defender)));
  else if (!defenderData.ranged && 1 === dist) {
    const baseDamage = Math.floor(
      (defenderData.damage[attacker.type] || 0) *
        (defender.hp / defender.maxHp),
    );
    ((combatLog.counterDamage = baseDamage),
      (attacker.hp -= baseDamage),
      log(
        `${TEAMS[defender.team]} ${defenderData.name} counters for ${baseDamage} damage`,
      ),
      attacker.hp <= 0 &&
        (log(`${TEAMS[attacker.team]} ${attackerData.name} destroyed!`),
        (combatLog.deadUnit = attacker),
        (units = units.filter((defender) => defender !== attacker))));
  }
  (actionHistory.push(combatLog), updateUndoButton());
}
function getMovableTiles(unit, allowFriendlyPass = false) {
  if (unit.moved) return [];
  const tiles = [],
    visited = new Set(),
    queue = [{ x: unit.x, y: unit.y, cost: 0 }];
  for (visited.add(`${unit.x},${unit.y}`); queue.length > 0; ) {
    const current = queue.shift(),
      neighborPositions = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];
    for (const pos of neighborPositions) {
      if (
        pos.x < 0 ||
        pos.x >= map[0].length ||
        pos.y < 0 ||
        pos.y >= map.length
      )
        continue;
      const key = `${pos.x},${pos.y}`;
      if (visited.has(key)) continue;
      const terrain = map[pos.y][pos.x],
        moveCost = TERRAIN[terrain.type].move;
      if (moveCost >= 255) continue;
      const blockingUnit = getUnitAt(pos.x, pos.y);
      if (
        blockingUnit &&
        (!allowFriendlyPass || blockingUnit.team !== unit.team)
      )
        continue;
      const totalCost = current.cost + moveCost;
      totalCost <= UNITS[unit.type].move &&
        (visited.add(key),
        (!blockingUnit ||
          (allowFriendlyPass && blockingUnit.team === unit.team)) &&
          ((blockingUnit && blockingUnit.team === unit.team) ||
            tiles.push({ x: pos.x, y: pos.y, cost: totalCost })),
        queue.push({ x: pos.x, y: pos.y, cost: totalCost }));
    }
  }
  return tiles;
}
function getDistToHQ(t, e) {
  const n = Array(map.length)
      .fill(null)
      .map(() => Array(map[0].length).fill(999)),
    a = [{ x: t, y: e, d: 0 }];
  for (n[e][t] = 0; a.length > 0; ) {
    const { x: t, y: e, d: i } = a.shift();
    for (const [r, o] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const s = t + r,
        y = e + o;
      s < 0 ||
        s >= map[0].length ||
        y < 0 ||
        y >= map.length ||
        TERRAIN[map[y][s].type].move >= 255 ||
        n[y][s] <= i + 1 ||
        ((n[y][s] = i + 1), a.push({ x: s, y: y, d: i + 1 }));
    }
  }
  return n;
}
function calculateHQVision() {
  const t = structures.find((t) => "hq" === t.type && 0 === t.team),
    e = structures.find((t) => "hq" === t.type && 1 === t.team);
  if (!t || !e)
    return Math.max(4, Math.floor(0.25 * Math.max(boardWidth, boardHeight)));
  const n = Math.abs(t.x - e.x) + Math.abs(t.y - e.y),
    a = Math.floor(0.35 * n);
  return Math.max(4, Math.min(10, a));
}
let lastThreatCheckState = !1;
function checkPlayerDetection() {
  if (0 !== turn) return;
  const t = structures.find((t) => "hq" === t.type && 1 === t.team);
  if (!t) return;
  const e = calculateHQVision(),
    n = detectHQThreats(t, 0).filter((t) => t.canCapture);
  if (n.length > 0 && !lastThreatCheckState) {
    const t = n.reduce((t, e) => (e.distance < t.distance ? e : t));
    (log(
      `Detected! Enemy ${UNITS[t.unit.type].name} has entered AI detection range (${t.distance}/${e} tiles from HQ)`,
    ),
      (lastThreatCheckState = !0));
  } else 0 === n.length && (lastThreatCheckState = !1);
}
function detectHQThreats(t, e) {
  const n = [],
    a = calculateHQVision();
  return (
    units.forEach((i) => {
      if (i.team === e) {
        const e = Math.abs(i.x - t.x) + Math.abs(i.y - t.y);
        e <= a &&
          n.push({ unit: i, distance: e, canCapture: UNITS[i.type].capture });
      }
    }),
    n
  );
}
function calculateTimeToReach(t, e, n, a, i) {
  const r = getDistToHQ(n, a)[e][t];
  return 999 === r ? 999 : Math.ceil(r / i);
}
function shouldDefend(t) {
  const e = structures.find((e) => "hq" === e.type && e.team === t);
  if (!e) return !1;
  const n = structures.find((t) => "hq" === t.type && 0 === t.team);
  if (!n) return !1;
  const a = detectHQThreats(e, 0).filter((t) => t.canCapture);
  if (0 === a.length) return !1;
  const i = a.reduce((t, e) => (e.distance < t.distance ? e : t)).unit,
    r = calculateTimeToReach(i.x, i.y, e.x, e.y, UNITS[i.type].move),
    o = units.filter((e) => e.team === t && UNITS[e.type].capture);
  if (0 === o.length) return !0;
  let s = 999;
  o.forEach((t) => {
    const e = calculateTimeToReach(t.x, t.y, n.x, n.y, UNITS[t.type].move);
    e < s && (s = e);
  });
  return r + 3 < s + 3;
}
function runAITurn() {
  if (gameOver || 1 !== turn) return;
  ((aiThinking = !0), updateUI());
  const availableUnits = units.filter(
      (availableUnits) => 1 === availableUnits.team && !availableUnits.moved,
    ),
    rangedUnits = [],
    capturingUnits = [],
    otherUnits = [];
  availableUnits.forEach((availableUnits) => {
    const unitQueue = UNITS[availableUnits.type];
    unitQueue.ranged
      ? rangedUnits.push(availableUnits)
      : unitQueue.capture
        ? capturingUnits.push(availableUnits)
        : otherUnits.push(availableUnits);
  });
  const unitQueue = [...e, ...n, ...a];
  if (shouldDefend(1)) {
    log(
      `AI: Defensive positioning activated - threats detected near HQ! (vision range: ${calculateHQVision()} tiles)`,
    );
  }
  !(function availableUnits() {
    if (0 === unitQueue.length || gameOver)
      return ((aiThinking = !1), void endTurn());
    const rangedUnits = unitQueue.shift();
    if (!units.includes(rangedUnits)) return void availableUnits();
    const capturingUnits = getStructureAt(rangedUnits.x, rangedUnits.y);
    if (
      capturingUnits &&
      "hq" === capturingUnits.type &&
      capturingUnits.team !== rangedUnits.team &&
      UNITS[rangedUnits.type].capture
    ) {
      (queueCapture(rangedUnits, capturingUnits),
        (rangedUnits.moved = !0),
        (rangedUnits.hasMovedThisTurn = !0));
      const otherUnits = UNITS[rangedUnits.type].name,
        unitQueue = TEAMS[rangedUnits.team],
        r = document.getElementById("pending-capture-info");
      return (
        r &&
          ((r.style.display = "block"),
          (r.style.color = "#4da6ff"),
          (r.textContent = `${unitQueue} ${otherUnits} holding position to capture HQ...`)),
        render(),
        void setTimeout(availableUnits, 300)
      );
    }
    const otherUnits = getAttackTargets(rangedUnits);
    if (otherUnits.length > 0 && !rangedUnits.hasMovedThisTurn) {
      const capturingUnits = selectOptimalTarget(rangedUnits, otherUnits);
      if (!capturingUnits) return;
      const unitQueue = getUnitAt(capturingUnits.x, capturingUnits.y);
      if (unitQueue)
        return (
          resolveCombat(rangedUnits, unitQueue),
          (rangedUnits.hasAttacked = !0),
          UNITS[rangedUnits.type].ranged,
          (rangedUnits.moved = !0),
          (rangedUnits.hasMovedThisTurn = !0),
          render(),
          void setTimeout(availableUnits, 400)
        );
    }
    const r = getMovableTiles(rangedUnits, !0);
    if (r.length > 0) {
      let capturingUnits, otherUnits, unitQueue;
      if (shouldDefend(1)) {
        const availableUnits = structures.find(
          (availableUnits) =>
            "hq" === availableUnits.type && 1 === availableUnits.team,
        );
        availableUnits
          ? ((capturingUnits = availableUnits.x),
            (otherUnits = availableUnits.y),
            (unitQueue = availableUnits))
          : ((unitQueue = structures.find(
              (availableUnits) =>
                "hq" === availableUnits.type && null === availableUnits.team,
            )),
            unitQueue ||
              (unitQueue = structures.find(
                (availableUnits) =>
                  "hq" === availableUnits.type && 0 === availableUnits.team,
              )),
            unitQueue &&
              ((capturingUnits = unitQueue.x), (otherUnits = unitQueue.y)));
      } else
        ((unitQueue = structures.find(
          (availableUnits) =>
            "hq" === availableUnits.type && null === availableUnits.team,
        )),
          unitQueue ||
            (unitQueue = structures.find(
              (availableUnits) =>
                "hq" === availableUnits.type && 0 === availableUnits.team,
            )),
          unitQueue &&
            ((capturingUnits = unitQueue.x), (otherUnits = unitQueue.y)));
      if (void 0 !== capturingUnits && void 0 !== otherUnits) {
        const availableUnits = getDistToHQ(capturingUnits, otherUnits),
          unitQueue = units.some(
            (availableUnits) =>
              1 === availableUnits.team && UNITS[availableUnits.type].capture,
          ),
          o = (availableUnits, rangedUnits) =>
            structures.some(
              (capturingUnits) =>
                capturingUnits.x === availableUnits &&
                capturingUnits.y === rangedUnits &&
                "hq" === capturingUnits.type,
            );
        r.sort((capturingUnits, otherUnits) => {
          let r = availableUnits[capturingUnits.y][capturingUnits.x],
            s = availableUnits[otherUnits.y][otherUnits.x];
          return (
            !UNITS[rangedUnits.type].capture &&
              unitQueue &&
              (o(capturingUnits.x, capturingUnits.y) && (r += 500),
              o(otherUnits.x, otherUnits.y) && (s += 500)),
            r - s
          );
        });
      }
      const o = r[0];
      (rangedUnits.x, rangedUnits.y);
      ((rangedUnits.x = o.x),
        (rangedUnits.y = o.y),
        (rangedUnits.moved = !0),
        (rangedUnits.hasMovedThisTurn = !0));
      const s = getStructureAt(rangedUnits.x, rangedUnits.y);
      if (
        (s &&
          s.team !== rangedUnits.team &&
          UNITS[rangedUnits.type].capture &&
          queueCapture(rangedUnits, s),
        !UNITS[rangedUnits.type].ranged && !rangedUnits.hasAttacked)
      ) {
        const capturingUnits = getAttackTargets(rangedUnits);
        if (capturingUnits.length > 0) {
          const otherUnits = selectOptimalTarget(rangedUnits, capturingUnits);
          if (otherUnits) {
            const capturingUnits = getUnitAt(otherUnits.x, otherUnits.y);
            if (capturingUnits)
              return (
                resolveCombat(rangedUnits, capturingUnits),
                (rangedUnits.hasAttacked = !0),
                render(),
                void setTimeout(availableUnits, 400)
              );
          }
        }
      }
      render();
    }
    setTimeout(availableUnits, 400);
  })();
}
function showTileInfo(t, e) {
  const n = map[e][t],
    a = TERRAIN[n.type];
  ((document.getElementById("info-terrain").textContent = a.name),
    (document.getElementById("info-defense").textContent =
      a.def > 0 ? `${Math.floor(100 * (1 - a.def))}% protection` : "None"),
    (document.getElementById("info-move").textContent =
      a.move >= 255 ? "Impassable" : a.move));
  const i = getStructureAt(t, e),
    r = document.getElementById("info-structure"),
    o = document.getElementById("pending-capture-info");
  if (((o.style.display = "none"), i)) {
    let n = STRUCTURES[i.type].name;
    if ((null !== i.team && (n += ` (${TEAMS[i.team]})`), i.captureLeft < 20)) {
      const a = Math.floor(((20 - i.captureLeft) / 20) * 100);
      n += ` [${a}% captured]`;
      const r = units.find((n) => n.pendingCapture && n.x === t && n.y === e);
      r &&
        ((n += ` by ${TEAMS[r.team]} ${UNITS[r.type].name}`),
        (o.textContent = `Capturing: ${a}% complete (${i.captureLeft} pts remaining)`),
        (o.style.display = "block"));
    } else if (0 === turn && 0 !== i.team) {
      units.some(
        (n) =>
          0 === n.team &&
          UNITS[n.type].capture &&
          Math.abs(n.x - t) + Math.abs(n.y - e) <= UNITS[n.type].move,
      ) &&
        ((n += " [Can start capturing]"),
        (o.textContent = "HQ can be seized (requires multiple turns)"),
        (o.style.display = "block"),
        (o.style.color = "#ff0"));
    }
    r.textContent = n;
  } else r.textContent = "-";
  const s = getUnitAt(t, e),
    y = document.getElementById("info-unit");
  if (s) {
    const t = UNITS[s.type];
    if (
      ((y.innerHTML = `<span class="${0 === s.team ? "stellar" : "lunar"}">${t.name}</span> (${s.hp}/${s.maxHp}) ${s.moved ? "[MOVED]" : ""}`),
      (y.innerHTML += `<br><small>${t.desc}</small>`),
      t.capture && (y.innerHTML += "<br><small>✓ Can capture HQ</small>"),
      t.ranged &&
        (y.innerHTML += `<br><small>↔ Range ${t.minRange}-${t.maxRange}</small>`),
      s.pendingCapture && i)
    ) {
      const t = Math.floor(((20 - i.captureLeft) / 20) * 100);
      y.innerHTML += `<br><small style="color:#0f0">Capturing HQ: ${t}%</small>`;
    }
  } else y.textContent = "-";
}
function render() {
  const t = document.getElementById("board");
  t.innerHTML = "";
  const e = [];
  if (selectedUnit && UNITS[selectedUnit.type].ranged) {
    const t = UNITS[selectedUnit.type];
    for (let n = -t.maxRange; n <= t.maxRange; n++)
      for (let a = -t.maxRange; a <= t.maxRange; a++) {
        const i = Math.abs(a) + Math.abs(n);
        if (i < t.minRange || i > t.maxRange) continue;
        const r = selectedUnit.x + a,
          o = selectedUnit.y + n;
        r < 0 ||
          r >= boardWidth ||
          o < 0 ||
          o >= boardHeight ||
          e.push({ x: r, y: o, dist: i });
      }
  }
  for (let n = 0; n < map.length; n++)
    for (let a = 0; a < map[n].length; a++) {
      const i = document.createElement("div");
      i.className = `cell ${map[n][a].type}`;
      const r = document.createElement("span");
      ((r.className = "terrain-char"),
        (r.textContent = TERRAIN[map[n][a].type].char),
        i.appendChild(r));
      const o = getUnitAt(a, n),
        s = getStructureAt(a, n);
      selectedUnit &&
        selectedUnit.x === a &&
        selectedUnit.y === n &&
        i.classList.add("selected");
      if (movableTiles.find((t) => t.x === a && t.y === n)) {
        i.classList.add("movable");
        const t = getUnitAt(a, n);
        t &&
          t.team === selectedUnit?.team &&
          i.classList.add("friendly-passable");
      }
      attackableTiles.find((t) => t.x === a && t.y === n) &&
        i.classList.add("range-indicator");
      const y = e.find((t) => t.x === a && t.y === n);
      if (
        (y &&
          (i.classList.add("range-highlight"),
          y.dist <= UNITS[selectedUnit.type].minRange + 1 &&
            i.classList.add("min-range-highlight")),
        s)
      ) {
        const t = document.createElement("span");
        if (
          ((t.textContent = STRUCTURES[s.type].char),
          (t.className = "structure"),
          null !== s.team
            ? t.classList.add(0 === s.team ? "stellar" : "lunar")
            : t.classList.add("neutral"),
          i.appendChild(t),
          s.captureLeft < 20)
        ) {
          const t = document.createElement("div");
          ((t.className = "pending-capture"), i.appendChild(t));
          const e = document.createElement("div");
          ((e.className = "capture-progress"),
            (e.style.width = 100 * (1 - s.captureLeft / 20) + "%"),
            i.appendChild(e));
        }
        if (s.team !== turn && 0 === turn && "hq" === s.type) {
          units.filter(
            (t) =>
              0 === t.team &&
              UNITS[t.type].capture &&
              Math.abs(t.x - a) + Math.abs(t.y - n) <= UNITS[t.type].move,
          ).length > 0 && i.classList.add("hq-target");
        }
      }
      if (o) {
        const t = document.createElement("span");
        if (
          ((t.textContent = UNITS[o.type].char),
          (t.className = 0 === o.team ? "stellar" : "lunar"),
          i.appendChild(t),
          i.classList.add(0 === o.team ? "stellar-unit" : "lunar-unit"),
          o.hp < o.maxHp)
        ) {
          const t = (o.hp / o.maxHp) * 100;
          t > 66 || (i.style.opacity = t > 33 ? "0.8" : "0.6");
        }
      }
      ((i.onclick = () => onCellClick(a, n)),
        (i.onmouseover = () => showTileInfo(a, n)),
        t.appendChild(i));
    }
}
function queueCapture(t, e) {
  e.team !== t.team &&
    UNITS[t.type].capture &&
    ((t.pendingCapture = !0),
    pendingCaptures.find((n) => n.unit === t && n.structure === e) ||
      pendingCaptures.push({ unit: t, structure: e }));
}
function processPendingCaptures() {
  if (0 === pendingCaptures.length) return;
  const t = document.getElementById("pending-capture-info");
  for (const { unit: e, structure: n } of pendingCaptures) {
    if (!units.includes(e) || e.x !== n.x || e.y !== n.y) continue;
    const a = Math.floor((e.hp / e.maxHp) * 10);
    n.captureLeft -= a;
    const i = TEAMS[e.team];
    if (
      ((t.style.display = "block"),
      (t.style.color = 0 === e.team ? "#ffd700" : "#4da6ff"),
      (t.textContent = `${i} seizing HQ: -${a} pts (${Math.max(0, n.captureLeft)} remaining)`),
      log(
        `${i} ${UNITS[e.type].name} captures ${a} pts (${n.captureLeft} remaining)`,
      ),
      n.captureLeft <= 0)
    ) {
      n.team;
      ((n.team = e.team),
        (n.captureLeft = 20),
        (t.textContent = `★ HQ CAPTURED by ${i}! ★`),
        (t.style.color = "#00ff00"),
        log(`HQ CAPTURED by ${i}!`));
      const a = structures.filter((t) => "hq" === t.type);
      a.every((t) => 0 === t.team)
        ? ((gameOver = !0), log("VICTORY! Stellar Command wins!"))
        : a.every((t) => 1 === t.team) &&
          ((gameOver = !0), log("VICTORY! Lunar Directorate wins!"));
    }
  }
  ((pendingCaptures = []),
    units.forEach((t) => (t.pendingCapture = !1)),
    requestAnimationFrame(render));
}
function parseMapString(t) {
  const e = t.split("\n"),
    n = {
      "·": "plain",
      "♣": "wood",
      "▲": "mountain",
      "═": "road",
      "≋": "water",
    };
  return e.map((t, e) =>
    t.split("").map((t, a) => ({ type: n[t] || "plain", x: a, y: e })),
  );
}
const SCENARIOS = {
    borderClash: {
      name: "Border Clash",
      width: 16,
      height: 12,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋·····♣≋≋♣·····≋\n≋····▲▲≋≋▲▲····≋\n≋······≋≋······≋\n≋······≋≋······≋\n≋······══······≋\n≋······══······≋\n≋······≋≋······≋\n≋······≋≋······≋\n≋····▲▲≋≋▲▲····≋\n≋·····♣≋≋♣·····≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 3, y: 2, team: 0 },
        { type: "hq", x: 12, y: 9, team: 1 },
      ],
      units: [
        { type: "infantry", x: 2, y: 2, team: 0 },
        { type: "infantry", x: 4, y: 2, team: 0 },
        { type: "mech", x: 3, y: 3, team: 0 },
        { type: "tank", x: 2, y: 3, team: 0 },
        { type: "tank", x: 4, y: 4, team: 0 },
        { type: "artillery", x: 3, y: 4, team: 0 },
        { type: "infantry", x: 13, y: 9, team: 1 },
        { type: "infantry", x: 11, y: 9, team: 1 },
        { type: "mech", x: 12, y: 8, team: 1 },
        { type: "tank", x: 13, y: 8, team: 1 },
        { type: "tank", x: 11, y: 7, team: 1 },
        { type: "artillery", x: 12, y: 7, team: 1 },
      ],
    },
    siege: {
      name: "Siege",
      width: 18,
      height: 13,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋················≋\n≋··▲▲····♣♣····▲▲≋\n≋··▲▲··········▲▲≋\n≋················≋\n≋················≋\n≋≋≋≋≋≋≋══≋≋≋≋≋≋≋≋≋\n≋················≋\n≋················≋\n≋····♣♣♣··♣♣♣····≋\n≋·······▲▲·······≋\n≋················≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 9, y: 2, team: 1 },
        { type: "hq", x: 9, y: 10, team: 0 },
      ],
      units: [
        { type: "infantry", x: 8, y: 2, team: 1 },
        { type: "infantry", x: 10, y: 2, team: 1 },
        { type: "mech", x: 9, y: 3, team: 1 },
        { type: "tank", x: 7, y: 4, team: 1 },
        { type: "tank", x: 11, y: 4, team: 1 },
        { type: "artillery", x: 9, y: 5, team: 1 },
        { type: "infantry", x: 8, y: 10, team: 0 },
        { type: "infantry", x: 10, y: 10, team: 0 },
        { type: "mech", x: 9, y: 9, team: 0 },
        { type: "tank", x: 7, y: 8, team: 0 },
        { type: "tank", x: 11, y: 8, team: 0 },
        { type: "artillery", x: 9, y: 7, team: 0 },
      ],
    },
    bridgeHead: {
      name: "River Crossing",
      width: 20,
      height: 14,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋··················≋\n≋·▲▲······♣♣♣♣·····≋\n≋····≋≋≋≋··········≋\n≋·····≋≋≋≋≋≋≋≋··≋\n≋······≋≋≋≋≋≋≋≋≋≋··≋\n≋·······≋≋≋≋≋≋≋≋≋≋≋≋\n≋········══≋≋≋≋≋≋≋≋≋\n≋≋≋≋≋≋≋≋≋══········≋\n≋≋≋≋≋≋≋≋≋≋≋≋·······≋\n≋··♣♣♣♣····≋≋≋≋····≋\n≋··········≋≋≋≋····≋\n≋··············▲▲··≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 3, y: 2, team: 0 },
        { type: "hq", x: 16, y: 11, team: 1 },
      ],
      units: [
        { type: "infantry", x: 2, y: 2, team: 0 },
        { type: "infantry", x: 4, y: 2, team: 0 },
        { type: "mech", x: 3, y: 3, team: 0 },
        { type: "tank", x: 2, y: 4, team: 0 },
        { type: "tank", x: 4, y: 4, team: 0 },
        { type: "artillery", x: 3, y: 5, team: 0 },
        { type: "infantry", x: 17, y: 11, team: 1 },
        { type: "infantry", x: 15, y: 11, team: 1 },
        { type: "mech", x: 16, y: 10, team: 1 },
        { type: "tank", x: 17, y: 9, team: 1 },
        { type: "tank", x: 15, y: 9, team: 1 },
        { type: "artillery", x: 16, y: 8, team: 1 },
      ],
    },
    gauntlet: {
      name: "The Gauntlet",
      width: 12,
      height: 16,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋\n≋··········≋\n≋··▲····▲··≋\n≋··▲····▲··≋\n≋··········≋\n≋··♣≋≋≋≋♣··≋\n≋··≋≋══≋≋··≋\n≋≋≋≋≋··≋≋··≋\n≋··≋≋··≋≋··≋\n≋···≋══≋···≋\n≋··♣≋≋≋≋♣··≋\n≋··········≋\n≋··▲····▲··≋\n≋··▲····▲··≋\n≋··········≋\n≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 6, y: 2, team: 0 },
        { type: "hq", x: 5, y: 13, team: 1 },
      ],
      units: [
        { type: "infantry", x: 5, y: 2, team: 0 },
        { type: "infantry", x: 7, y: 2, team: 0 },
        { type: "mech", x: 6, y: 3, team: 0 },
        { type: "tank", x: 5, y: 4, team: 0 },
        { type: "tank", x: 7, y: 4, team: 0 },
        { type: "heavy", x: 8, y: 5, team: 0 },
        { type: "infantry", x: 6, y: 13, team: 1 },
        { type: "infantry", x: 4, y: 13, team: 1 },
        { type: "mech", x: 5, y: 12, team: 1 },
        { type: "tank", x: 6, y: 11, team: 1 },
        { type: "tank", x: 4, y: 11, team: 1 },
        { type: "heavy", x: 3, y: 10, team: 1 },
      ],
    },
  },
  ADVANCED_SCENARIOS = {
    borderClashAdvanced: {
      name: "Border Clash - Advanced",
      width: 16,
      height: 12,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋·····♣≋≋♣·····≋\n≋····▲▲≋≋▲▲····≋\n≋······≋≋······≋\n≋······≋≋······≋\n≋······══······≋\n≋······══······≋\n≋······≋≋······≋\n≋······≋≋······≋\n≋····▲▲≋≋▲▲····≋\n≋·····♣≋≋♣·····≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 3, y: 2, team: 0 },
        { type: "hq", x: 12, y: 9, team: 1 },
      ],
      units: [
        { type: "infantry", x: 2, y: 2, team: 0 },
        { type: "infantry", x: 4, y: 2, team: 0 },
        { type: "infantry", x: 1, y: 3, team: 0 },
        { type: "mech", x: 3, y: 3, team: 0 },
        { type: "tank", x: 2, y: 4, team: 0 },
        { type: "tank", x: 4, y: 4, team: 0 },
        { type: "artillery", x: 3, y: 4, team: 0 },
        { type: "rocket", x: 2, y: 5, team: 0 },
        { type: "infantry", x: 13, y: 9, team: 1 },
        { type: "infantry", x: 11, y: 9, team: 1 },
        { type: "infantry", x: 14, y: 8, team: 1 },
        { type: "mech", x: 12, y: 8, team: 1 },
        { type: "tank", x: 13, y: 7, team: 1 },
        { type: "tank", x: 11, y: 7, team: 1 },
        { type: "artillery", x: 12, y: 7, team: 1 },
        { type: "rocket", x: 13, y: 6, team: 1 },
      ],
    },
    siegeAdvanced: {
      name: "Siege - Advanced",
      width: 18,
      height: 13,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋················≋\n≋··▲▲····♣♣····▲▲≋\n≋··▲▲··········▲▲≋\n≋················≋\n≋················≋\n≋≋≋≋≋≋≋══≋≋≋≋≋≋≋≋≋\n≋················≋\n≋················≋\n≋····♣♣♣··♣♣♣····≋\n≋·······▲▲·······≋\n≋················≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 9, y: 2, team: 1 },
        { type: "hq", x: 9, y: 10, team: 0 },
      ],
      units: [
        { type: "infantry", x: 8, y: 2, team: 1 },
        { type: "infantry", x: 10, y: 2, team: 1 },
        { type: "mech", x: 9, y: 3, team: 1 },
        { type: "mech", x: 7, y: 3, team: 1 },
        { type: "tank", x: 7, y: 4, team: 1 },
        { type: "tank", x: 11, y: 4, team: 1 },
        { type: "artillery", x: 9, y: 5, team: 1 },
        { type: "heavy", x: 9, y: 4, team: 1 },
        { type: "infantry", x: 8, y: 10, team: 0 },
        { type: "infantry", x: 10, y: 10, team: 0 },
        { type: "mech", x: 9, y: 9, team: 0 },
        { type: "tank", x: 7, y: 8, team: 0 },
        { type: "tank", x: 11, y: 8, team: 0 },
        { type: "tank", x: 9, y: 8, team: 0 },
        { type: "artillery", x: 9, y: 7, team: 0 },
        { type: "rocket", x: 6, y: 9, team: 0 },
      ],
    },
    bridgeHeadAdvanced: {
      name: "River Crossing - Advanced",
      width: 20,
      height: 14,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋··················≋\n≋·▲▲······♣♣♣♣·····≋\n≋····≋≋≋≋··········≋\n≋·····≋≋≋≋≋≋≋≋·····≋\n≋······≋≋≋≋≋≋≋≋≋≋··≋\n≋·······≋≋≋≋≋≋≋≋≋≋≋≋\n≋········══≋≋≋≋≋≋≋≋≋\n≋≋≋≋≋≋≋≋≋══········≋\n≋≋≋≋≋≋≋≋≋≋≋≋·······≋\n≋··♣♣♣♣····≋≋≋≋····≋\n≋··········≋≋≋≋····≋\n≋··············▲▲··≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 3, y: 2, team: 0 },
        { type: "hq", x: 16, y: 11, team: 1 },
      ],
      units: [
        { type: "infantry", x: 2, y: 2, team: 0 },
        { type: "infantry", x: 4, y: 2, team: 0 },
        { type: "infantry", x: 3, y: 1, team: 0 },
        { type: "mech", x: 3, y: 3, team: 0 },
        { type: "tank", x: 2, y: 4, team: 0 },
        { type: "tank", x: 4, y: 4, team: 0 },
        { type: "artillery", x: 3, y: 5, team: 0 },
        { type: "rocket", x: 1, y: 5, team: 0 },
        { type: "infantry", x: 17, y: 11, team: 1 },
        { type: "infantry", x: 15, y: 11, team: 1 },
        { type: "infantry", x: 16, y: 12, team: 1 },
        { type: "mech", x: 16, y: 10, team: 1 },
        { type: "tank", x: 17, y: 9, team: 1 },
        { type: "tank", x: 15, y: 9, team: 1 },
        { type: "artillery", x: 16, y: 8, team: 1 },
        { type: "heavy", x: 18, y: 10, team: 1 },
      ],
    },
    gauntletAdvanced: {
      name: "The Gauntlet - Advanced",
      width: 12,
      height: 16,
      mapString:
        "\n≋≋≋≋≋≋≋≋≋≋≋≋\n≋··········≋\n≋··▲····▲··≋\n≋··▲····▲··≋\n≋··········≋\n≋··♣≋≋≋≋♣··≋\n≋··≋≋══≋≋··≋\n≋≋≋≋≋··≋≋··≋\n≋··≋≋··≋≋··≋\n≋···≋══≋···≋\n≋··♣≋≋≋≋♣··≋\n≋··········≋\n≋··▲····▲··≋\n≋··▲····▲··≋\n≋··········≋\n≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
      structures: [
        { type: "hq", x: 6, y: 2, team: 0 },
        { type: "hq", x: 5, y: 13, team: 1 },
      ],
      units: [
        { type: "infantry", x: 5, y: 2, team: 0 },
        { type: "infantry", x: 7, y: 2, team: 0 },
        { type: "mech", x: 6, y: 3, team: 0 },
        { type: "mech", x: 4, y: 4, team: 0 },
        { type: "tank", x: 5, y: 4, team: 0 },
        { type: "tank", x: 7, y: 4, team: 0 },
        { type: "heavy", x: 8, y: 5, team: 0 },
        { type: "artillery", x: 3, y: 4, team: 0 },
        { type: "infantry", x: 6, y: 13, team: 1 },
        { type: "infantry", x: 4, y: 13, team: 1 },
        { type: "mech", x: 5, y: 12, team: 1 },
        { type: "mech", x: 7, y: 11, team: 1 },
        { type: "tank", x: 6, y: 11, team: 1 },
        { type: "tank", x: 4, y: 11, team: 1 },
        { type: "heavy", x: 3, y: 10, team: 1 },
        { type: "artillery", x: 8, y: 11, team: 1 },
      ],
    },
  };
Object.assign(SCENARIOS, ADVANCED_SCENARIOS);
let map = [],
  units = [],
  structures = [],
  turn = 0,
  selectedUnit = null,
  movableTiles = [],
  attackableTiles = [],
  gameOver = !1,
  actionHistory = [],
  aiThinking = !1,
  currentScenario = "borderClash",
  pendingCaptures = [],
  boardWidth = 20,
  boardHeight = 13;
function loadScenario(t) {
  ((currentScenario = t),
    (actionHistory = []),
    (gameOver = !1),
    (aiThinking = !1),
    (pendingCaptures = []));
  const e = document.getElementById("random-btn"),
    n = t.startsWith("skirmish");
  if (((e.style.display = n ? "inline-block" : "none"), n)) loadSkirmish(t);
  else {
    const e = SCENARIOS[t];
    ((boardWidth = e.width),
      (boardHeight = e.height),
      (map = parseMapString(e.mapString)),
      (structures = e.structures.map((t) => ({ ...t, captureLeft: 20 }))),
      (units = e.units.map((t, e) => ({
        id: e,
        ...t,
        maxHp: UNITS[t.type].hp,
        hp: UNITS[t.type].hp,
        moved: !1,
        hasAttacked: !1,
        hasMovedThisTurn: !1,
        pendingCapture: !1,
      }))),
      (turn = 0),
      (selectedUnit = null),
      (movableTiles = []),
      (attackableTiles = []),
      (document.getElementById("board").className = ""));
  }
  ((document.getElementById("board").style.gridTemplateColumns =
    `repeat(${boardWidth}, 28px)`),
    render(),
    updateUI(),
    (document.getElementById("scenario-picker").value = t),
    log(`Scenario: ${SCENARIOS[t]?.name || t} loaded`));
  log(`HQ Vision Range: ${calculateHQVision()} tiles (scaled for map size)`);
}
function randomizeCurrent() {
  currentScenario.startsWith("skirmish") && loadSkirmish(currentScenario);
}
const SKIRMISH_TEMPLATES = {
  medium: {
    name: "Lake Crossing",
    width: 16,
    height: 14,
    unitsPerSide: 11,
    mapString:
      "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋············▲▲≋\n≋·▲▲···♣♣····▲▲≋\n≋·▲▲·≋≋≋≋≋≋····≋\n≋···≋≋≋≋≋≋≋≋···≋\n≋···≋≋≋≋≋≋≋≋≋··≋\n≋···≋≋≋≋≋≋≋≋≋··≋\n≋·≋≋≋≋≋≋≋≋≋≋···≋\n≋··≋≋≋≋≋≋≋≋≋···≋\n≋···≋≋≋≋≋≋≋≋···≋\n≋·▲··≋≋≋≋≋≋·▲▲·≋\n≋·▲▲···♣♣···▲▲·≋\n≋·▲▲···········≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
    randomizableZones: [
      { x: 2, y: 1, width: 5, height: 5 },
      { x: 9, y: 1, width: 5, height: 5 },
      { x: 2, y: 8, width: 5, height: 5 },
      { x: 9, y: 8, width: 5, height: 5 },
    ],
    stellarSpawnZones: [
      { x: 1, y: 1, width: 5, height: 4 },
      { x: 1, y: 7, width: 4, height: 3 },
    ],
    lunarSpawnZones: [
      { x: 12, y: 1, width: 5, height: 4 },
      { x: 13, y: 10, width: 4, height: 3 },
    ],
    stellarHQ: { x: 3, y: 2 },
    lunarHQ: { x: 13, y: 11 },
  },
  large: {
    name: "Mountain Frontier",
    width: 20,
    height: 16,
    unitsPerSide: 12,
    mapString:
      "\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n≋········▲▲········≋\n≋·▲▲·····▲▲·····▲▲·≋\n≋·▲▲··♣··▲▲··♣··▲▲·≋\n≋·····♣··▲▲··♣·····≋\n≋··♣·····▲▲·····♣··≋\n≋········▲▲········≋\n≋········══········≋\n≋········══········≋\n≋········▲▲········≋\n≋···♣····▲▲····♣···≋\n≋·····♣··▲▲··♣·····≋\n≋·▲▲··♣··▲▲··♣··▲▲·≋\n≋·▲▲·····▲▲·····▲▲·≋\n≋········▲▲········≋\n≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋\n".trim(),
    randomizableZones: [
      { x: 1, y: 1, width: 8, height: 5 },
      { x: 1, y: 6, width: 8, height: 4 },
      { x: 1, y: 10, width: 8, height: 5 },
      { x: 13, y: 1, width: 8, height: 5 },
      { x: 13, y: 6, width: 8, height: 4 },
      { x: 13, y: 10, width: 8, height: 5 },
    ],
    stellarSpawnZones: [
      { x: 1, y: 1, width: 7, height: 5 },
      { x: 1, y: 6, width: 7, height: 4 },
      { x: 1, y: 10, width: 7, height: 5 },
    ],
    lunarSpawnZones: [
      { x: 12, y: 1, width: 7, height: 5 },
      { x: 12, y: 6, width: 7, height: 4 },
      { x: 12, y: 10, width: 7, height: 5 },
    ],
    stellarHQ: { x: 3, y: 2 },
    lunarHQ: { x: 16, y: 13 },
  },
};
function randomizeTerrainInZones(t, e) {
  const n = ["plain", "wood"];
  e.forEach((e) => {
    for (let a = e.y; a < e.y + e.height; a++)
      for (let i = e.x; i < e.x + e.width; i++)
        if (a >= 0 && a < t.length && i >= 0 && i < t[0].length) {
          const e = t[a][i];
          n.includes(e.type) &&
            (Math.random() < 0.3 &&
              (e.type = "plain" === e.type ? "wood" : "plain"),
            "plain" === e.type &&
              Math.random() < 0.05 &&
              (e.type = "mountain"));
        }
  });
}
function varyPosition(t, e = 1) {
  return {
    x: t.x + Math.floor(Math.random() * (2 * e + 1)) - e,
    y: t.y + Math.floor(Math.random() * (2 * e + 1)) - e,
  };
}
function findValidSpawnInZone(t, e, n) {
  for (let a = 0; a < 50; a++) {
    const a = t.x + Math.floor(Math.random() * t.width),
      i = t.y + Math.floor(Math.random() * t.height);
    if (i < 0 || i >= e.length || a < 0 || a >= e[0].length) continue;
    const r = e[i][a];
    if (TERRAIN[r.type].move >= 255) continue;
    const o = `${a},${i}`;
    if (!n.has(o)) return { x: a, y: i };
  }
  return {
    x: t.x + Math.floor(t.width / 2),
    y: t.y + Math.floor(t.height / 2),
  };
}
function generateUnitComposition(t) {
  const e = [];
  e.push("infantry", "infantry", "mech", "tank", "tank");
  const n = ["infantry", "mech", "tank", "heavy", "artillery", "rocket"];
  for (; e.length < t; ) {
    const t = n[Math.floor(Math.random() * n.length)];
    e.push(t);
  }
  return e.sort(() => Math.random() - 0.5);
}
function loadSkirmish(t) {
  const e = SKIRMISH_TEMPLATES["skirmishMedium" === t ? "medium" : "large"];
  ((boardWidth = e.width),
    (boardHeight = e.height),
    (map = parseMapString(e.mapString)),
    randomizeTerrainInZones(map, e.randomizableZones));
  const n = varyPosition(e.stellarHQ, 1),
    a = varyPosition(e.lunarHQ, 1);
  structures = [
    { type: "hq", x: n.x, y: n.y, team: 0, captureLeft: 20 },
    { type: "hq", x: a.x, y: a.y, team: 1, captureLeft: 20 },
  ];
  const i = generateUnitComposition(e.unitsPerSide),
    r = generateUnitComposition(e.unitsPerSide);
  units = [];
  let o = 0;
  const s = new Set();
  (s.add(`${n.x},${n.y}`),
    s.add(`${a.x},${a.y}`),
    i.forEach((t, n) => {
      const a = n % e.stellarSpawnZones.length,
        i = findValidSpawnInZone(e.stellarSpawnZones[a], map, s);
      (s.add(`${i.x},${i.y}`),
        units.push({
          id: o++,
          type: t,
          x: i.x,
          y: i.y,
          team: 0,
          maxHp: UNITS[t].hp,
          hp: UNITS[t].hp,
          moved: !1,
          hasAttacked: !1,
          hasMovedThisTurn: !1,
          pendingCapture: !1,
        }));
    }),
    r.forEach((t, n) => {
      const a = n % e.lunarSpawnZones.length,
        i = findValidSpawnInZone(e.lunarSpawnZones[a], map, s);
      (s.add(`${i.x},${i.y}`),
        units.push({
          id: o++,
          type: t,
          x: i.x,
          y: i.y,
          team: 1,
          maxHp: UNITS[t].hp,
          hp: UNITS[t].hp,
          moved: !1,
          hasAttacked: !1,
          hasMovedThisTurn: !1,
          pendingCapture: !1,
        }));
    }),
    (turn = 0),
    (selectedUnit = null),
    (movableTiles = []),
    (attackableTiles = []),
    (document.getElementById("board").className = "skirmish-bg"),
    (document.getElementById("board").style.gridTemplateColumns =
      `repeat(${boardWidth}, 28px)`),
    render(),
    updateUI(),
    log(`Skirmish: ${e.name} - ${e.unitsPerSide} units per side`));
  log(`ℹ HQ Vision Range: ${calculateHQVision()} tiles (scaled for map size)`);
}
function getUnitAt(t, e) {
  return units.find((n) => n.x === t && n.y === e);
}
function getStructureAt(t, e) {
  return structures.find((n) => n.x === t && n.y === e);
}
function getAttackTargets(t) {
  const e = [],
    n = UNITS[t.type];
  if (t.hasAttacked) return [];
  if (n.ranged)
    for (let a = -n.maxRange; a <= n.maxRange; a++)
      for (let i = -n.maxRange; i <= n.maxRange; i++) {
        const r = Math.abs(i) + Math.abs(a);
        if (r < n.minRange || r > n.maxRange) continue;
        const o = t.x + i,
          s = t.y + a;
        if (o < 0 || o >= map[0].length || s < 0 || s >= map.length) continue;
        const y = getUnitAt(o, s);
        y && y.team !== t.team && e.push({ x: o, y: s });
      }
  else {
    const n = [
      { x: t.x + 1, y: t.y },
      { x: t.x - 1, y: t.y },
      { x: t.x, y: t.y + 1 },
      { x: t.x, y: t.y - 1 },
    ];
    for (const a of n) {
      if (a.x < 0 || a.x >= map[0].length || a.y < 0 || a.y >= map.length)
        continue;
      const n = getUnitAt(a.x, a.y);
      n && n.team !== t.team && e.push(a);
    }
  }
  return e;
}
function calculateAttackValue(t, e, n) {
  const a = UNITS[t.type],
    i = UNITS[e.type],
    r = {
      infantry: 10,
      tank: 25,
      mech: 15,
      heavy: 40,
      artillery: 30,
      rocket: 35,
    },
    o = a.damage[e.type] || 0,
    s = t.hp / t.maxHp,
    y = map[e.y][e.x],
    c = TERRAIN[y.type].def,
    m = Math.floor(o * s * c),
    l = r[e.type] || 20;
  let d = m * (l / 10);
  (m >= e.hp && (d += 1.5 * l), i.capture && m >= e.hp && (d += 50));
  let u = 0;
  if (!a.ranged) {
    const n = Math.max(0, e.hp - m) / e.maxHp,
      a = Math.floor((i.damage[t.type] || 0) * n),
      o = r[t.type] || 20;
    ((u = a * (o / 10)), a >= t.hp && (u += 2 * o));
  }
  const p = t.hp / t.maxHp;
  if (p < 0.5) {
    u += 40 * (1 - p);
  }
  return d - u;
}
function selectOptimalTarget(t, e) {
  if (0 === e.length) return null;
  let n = null,
    a = -1 / 0;
  for (const i of e) {
    const e = getUnitAt(i.x, i.y);
    if (!e) continue;
    const r = calculateAttackValue(t, e, i);
    r > a && ((a = r), (n = i));
  }
  return n;
}
function endTurn() {
  if (
    (units.forEach((t) => {
      if (t.team === turn) {
        const e = getStructureAt(t.x, t.y);
        e &&
          "hq" === e.type &&
          e.team !== t.team &&
          UNITS[t.type].capture &&
          queueCapture(t, e);
      }
    }),
    processPendingCaptures(),
    gameOver)
  )
    return;
  const t = units.some((t) => 0 === t.team && UNITS[t.type].capture),
    e = units.some((t) => 1 === t.team && UNITS[t.type].capture);
  if (!t && !e)
    return (
      (gameOver = !0),
      log("STALEMATE! No capturing units remain on either side."),
      void log("Game ends in a draw.")
    );
  ((turn = 1 - turn),
    (lastThreatCheckState = !1),
    units.forEach((t) => {
      ((t.moved = !1), (t.hasAttacked = !1), (t.hasMovedThisTurn = !1));
    }),
    (selectedUnit = null),
    (movableTiles = []),
    (attackableTiles = []),
    (actionHistory = []),
    (moveHistory = []),
    (combatHistory = []),
    render(),
    updateUI(),
    1 !== turn || gameOver || setTimeout(() => runAITurn(), 500));
}
function recordMove(t, e, n) {
  (actionHistory.push({
    type: "move",
    unit: t,
    fromX: e,
    fromY: n,
    toX: t.x,
    toY: t.y,
  }),
    updateUndoButton());
}
function recordCombat() {
  ((actionHistory = []), updateUndoButton());
}
function updateUndoButton() {
  document.getElementById("undo-btn").disabled =
    0 === actionHistory.length || 0 !== turn || aiThinking;
}
function undoMove() {
  if (0 === actionHistory.length || 0 !== turn || aiThinking) return;
  const t = actionHistory.pop();
  if ("move" === t.type) {
    const e = t.unit;
    ((e.x = t.fromX),
      (e.y = t.fromY),
      (e.moved = !1),
      (e.hasMovedThisTurn = !1),
      (e.hasAttacked = !1),
      (e.pendingCapture = !1),
      (pendingCaptures = pendingCaptures.filter((t) => t.unit !== e)),
      log("Movement undone"));
  } else if ("combat" === t.type) {
    const {
      attacker: e,
      defender: n,
      damageDealt: a,
      counterDamage: i,
      deadUnit: r,
    } = t;
    ((n.hp += a),
      (e.hp += i),
      r && (units.push(r), log(`${UNITS[r.type].name} resurrection (Undo)`)),
      (e.hasAttacked = !1),
      log("Combat undone"));
  }
  ((selectedUnit = null),
    (movableTiles = []),
    (attackableTiles = []),
    render(),
    updateUndoButton());
}
function confirmEndTurn() {
  const t = units.filter((t) => 0 === t.team && !t.hasMovedThisTurn);
  t.length > 0
    ? ((document.getElementById("turn-confirm-msg").textContent =
        `You have ${t.length} unmoved unit${1 !== t.length ? "s" : ""}. End turn anyway?`),
      (document.getElementById("turn-confirm-modal").style.display = "block"))
    : executeEndTurn();
}
function executeEndTurn() {
  (closeTurnConfirm(), endTurn());
}
function closeTurnConfirm() {
  document.getElementById("turn-confirm-modal").style.display = "none";
}
function confirmReset() {
  document.getElementById("modal-overlay").style.display = "block";
}
function executeReset() {
  (closeModal(), loadScenario(currentScenario));
}
function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
}
function reportFail(t) {
  const e = document.getElementById("pending-capture-info");
  ((e.textContent = `✖ ${t}`),
    (e.style.color = "#ff5566"),
    (e.style.display = "block"),
    window.failTimer && clearTimeout(window.failTimer),
    (window.failTimer = setTimeout(() => {
      e.textContent.includes("✖") && (e.style.display = "none");
    }, 1500)));
}
function onCellClick(t, e) {
  if (gameOver || 0 !== turn || aiThinking) return;
  const n = getUnitAt(t, e),
    a = getStructureAt(t, e);
  if (selectedUnit && selectedUnit.x === t && selectedUnit.y === e)
    return (
      (selectedUnit = null),
      (movableTiles = []),
      (attackableTiles = []),
      void render()
    );
  if (n && 0 === n.team)
    return n.moved
      ? void reportFail("Unit has already acted this turn.")
      : ((selectedUnit = n),
        (movableTiles = getMovableTiles(n, !0)),
        (attackableTiles = getAttackTargets(n)),
        void render());
  if (!n || selectedUnit) {
    if (selectedUnit) {
      const i = attackableTiles.find((n) => n.x === t && n.y === e),
        r = movableTiles.find((n) => n.x === t && n.y === e);
      if (i && n && 0 !== n.team)
        return (
          recordMove(selectedUnit, selectedUnit.x, selectedUnit.y),
          resolveCombat(selectedUnit, n),
          recordCombat(),
          (selectedUnit.moved = !0),
          (selectedUnit.hasAttacked = !0),
          (selectedUnit.hasMovedThisTurn = !0),
          (selectedUnit = null),
          (movableTiles = []),
          (attackableTiles = []),
          render(),
          void updateUI()
        );
      if (
        r &&
        (!n || (a && "hq" === a.type && UNITS[selectedUnit.type].capture))
      ) {
        (recordMove(selectedUnit, selectedUnit.x, selectedUnit.y),
          (selectedUnit.x = t),
          (selectedUnit.y = e),
          a &&
            a.team !== selectedUnit.team &&
            UNITS[selectedUnit.type].capture &&
            queueCapture(selectedUnit, a));
        return (
          UNITS[selectedUnit.type].ranged
            ? ((selectedUnit.moved = !0),
              (selectedUnit.hasMovedThisTurn = !0),
              (selectedUnit = null),
              (movableTiles = []),
              (attackableTiles = []))
            : ((selectedUnit.moved = !0),
              (selectedUnit.hasMovedThisTurn = !0),
              (movableTiles = []),
              (attackableTiles = getAttackTargets(selectedUnit))),
          checkPlayerDetection(),
          render(),
          void updateUI()
        );
      }
      if (n)
        0 === n.team
          ? reportFail("Cannot attack friendly units.")
          : reportFail("Target is out of range.");
      else {
        const n = map[e][t];
        TERRAIN[n.type].move >= 255
          ? reportFail("Terrain is impassable.")
          : reportFail("Destination is too far.");
      }
    }
  } else reportFail("Cannot control enemy units.");
}
function updateUI() {
  document.getElementById("turn").textContent = turn + 1;
  const t = document.getElementById("team");
  aiThinking
    ? ((t.textContent = "AI Moving..."), (t.className = "lunar"))
    : ((t.textContent = TEAMS[0 === turn ? 0 : 1]),
      (t.className = 0 === turn ? "stellar" : "lunar"));
  const e = document.querySelector('button[onclick="confirmEndTurn()"]');
  (e && (e.disabled = aiThinking || gameOver), updateUndoButton());
}
function log(t) {
  const e = document.getElementById("log"),
    n = document.createElement("div");
  ((n.textContent = `> ${t}`),
    e.appendChild(n),
    (e.scrollTop = e.scrollHeight));
}
loadScenario("borderClash");
