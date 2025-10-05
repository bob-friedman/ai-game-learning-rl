// boxes.js

// ---------------------- Config ----------------------
const TILE_SIZE = 42;
const MOVE_ANIM_MS = 150;
const BOB_AMPLITUDE = 2.5;
const BOB_FREQ = 0.014;
const PRE_RENDER_SCALE = 3;

// ---------------------- DOM ----------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const levelSelect = document.getElementById('levelSelect');
const dpadButtons = document.querySelectorAll('.dbtn');
const resetBtn = document.getElementById('resetBtn');
const nextBtn = document.getElementById('nextBtn');
const undoBtn = document.getElementById('undoBtn');
const toggleDpadBtn = document.getElementById('toggleDpadBtn');
const dpad = document.getElementById('dpad');

// ---------------------- Sprites ----------------------
const SPRITE_SVGS = {
  floor: `<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="#a9a9a9"/><g fill="#9f9f9f"><rect x="0" y="0" width="${TILE_SIZE/2}" height="${TILE_SIZE/2}" opacity="0.25"/><rect x="${TILE_SIZE/2}" y="${TILE_SIZE/2}" width="${TILE_SIZE/2}" height="${TILE_SIZE/2}" opacity="0.25"/></g></svg>`,
  wall: `<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="#555"/><g fill="#666"><rect x="4" y="6" width="${TILE_SIZE-8}" height="${TILE_SIZE-12}" rx="6" ry="6"/></g><g stroke="#444" stroke-width="2" opacity="0.6"><line x1="4" y1="${TILE_SIZE/3}" x2="${TILE_SIZE-4}" y2="${TILE_SIZE/3}"/><line x1="4" y1="${2*TILE_SIZE/3}" x2="${TILE_SIZE-4}" y2="${2*TILE_SIZE/3}"/></g></svg>`,
  goal: `<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="transparent"/><circle cx="${TILE_SIZE/2}" cy="${TILE_SIZE/2}" r="${TILE_SIZE * 0.22 + 3}" fill="#c79a00"/>
<circle cx="${TILE_SIZE/2}" cy="${TILE_SIZE/2}" r="${TILE_SIZE * 0.22}" fill="#ffd700"/></svg>`,
  box: `<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="transparent"/><rect x="6" y="8" width="${TILE_SIZE-12}" height="${TILE_SIZE-16}" rx="6" fill="#8b5a2b" stroke="#5a371d" stroke-width="2"/><rect x="10" y="12" width="${TILE_SIZE-20}" height="${TILE_SIZE-24}" rx="4" fill="#a26b3c" opacity="0.9"/><path d="M10 ${TILE_SIZE-12} L${TILE_SIZE-10} ${TILE_SIZE-12}" stroke="#5a371d" stroke-width="2"/></svg>`,
  player: `<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${TILE_SIZE}" height="${TILE_SIZE}" viewBox="0 0 ${TILE_SIZE} ${TILE_SIZE}"><rect width="${TILE_SIZE}" height="${TILE_SIZE}" fill="transparent"/><circle cx="${TILE_SIZE/2}" cy="${TILE_SIZE/2 - 4}" r="${TILE_SIZE * 0.26 + 2}" fill="#1969b3"/>
<circle cx="${TILE_SIZE/2}" cy="${TILE_SIZE/2 - 4}" r="${TILE_SIZE * 0.26}" fill="#1e90ff"/><circle cx="${TILE_SIZE/2 - 6}" cy="${TILE_SIZE/2 - 8}" r="3" fill="#fff"/><circle cx="${TILE_SIZE/2 + 6}" cy="${TILE_SIZE/2 - 8}" r="3" fill="#fff"/><circle cx="${TILE_SIZE/2 - 6}" cy="${TILE_SIZE/2 - 8}" r="1.1" fill="#000"/><circle cx="${TILE_SIZE/2 + 6}" cy="${TILE_SIZE/2 - 8}" r="1.1" fill="#000"/></svg>`
};
const SPRITES = {};

function preRenderSprite(drawCommands) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = TILE_SIZE * PRE_RENDER_SCALE;
  canvas.width = size;
  canvas.height = size;
  
  ctx.scale(PRE_RENDER_SCALE, PRE_RENDER_SCALE);
  
  drawCommands(ctx);
  
  return canvas;
}

async function loadAssets() {
  // 1. Create a temporary 84x84 canvas ONLY for the player sprite.
  const playerCanvas = document.createElement('canvas');
  const playerCtx = playerCanvas.getContext('2d');
  const hiresSize = 84; // Use a fixed high resolution
  playerCanvas.width = hiresSize;
  playerCanvas.height = hiresSize;

  playerCtx.beginPath();
  playerCtx.arc(hiresSize / 2, hiresSize / 2 - 8, hiresSize * 0.26 + 4, 0, 2 * Math.PI);
  playerCtx.fillStyle = '#1969b3';
  playerCtx.fill();
  playerCtx.beginPath();
  playerCtx.arc(hiresSize / 2, hiresSize / 2 - 8, hiresSize * 0.26, 0, 2 * Math.PI);
  playerCtx.fillStyle = '#1e90ff';
  playerCtx.fill();
  playerCtx.beginPath();
  playerCtx.arc(hiresSize / 2 - 12, hiresSize / 2 - 16, 6, 0, 2 * Math.PI);
  playerCtx.arc(hiresSize / 2 + 12, hiresSize / 2 - 16, 6, 0, 2 * Math.PI);
  playerCtx.fillStyle = '#fff';
  playerCtx.fill();
  playerCtx.beginPath();
  playerCtx.arc(hiresSize / 2 - 12, hiresSize / 2 - 16, 2.2, 0, 2 * Math.PI);
  playerCtx.arc(hiresSize / 2 + 12, hiresSize / 2 - 16, 2.2, 0, 2 * Math.PI);
  playerCtx.fillStyle = '#000';
  playerCtx.fill();

  SPRITES.player = playerCanvas;

  const goalCanvas = document.createElement('canvas');
  const goalCtx = goalCanvas.getContext('2d');
  goalCanvas.width = hiresSize;
  goalCanvas.height = hiresSize;

  goalCtx.beginPath();
  goalCtx.arc(hiresSize / 2, hiresSize / 2, hiresSize * 0.22 + 6, 0, 2 * Math.PI);
  goalCtx.fillStyle = '#c79a00';
  goalCtx.fill();
  // Fill
  goalCtx.beginPath();
  goalCtx.arc(hiresSize / 2, hiresSize / 2, hiresSize * 0.22, 0, 2 * Math.PI);
  goalCtx.fillStyle = '#ffd700';
  goalCtx.fill();

  SPRITES.goal = goalCanvas;

  const otherSprites = ['floor', 'wall', 'box'];
  const spritePromises = otherSprites.map(key => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        SPRITES[key] = img;
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load sprite: ${key}`));
      img.src = 'data:image/svg+xml;base64,' + btoa(SPRITE_SVGS[key]);
    });
  });

  await Promise.all(spritePromises);
}

// ---------------------- Game state ----------------------
const levelSets = [
    { name: 'Microban I', file: 'levels/microban.txt' },
    { name: 'Microban II', file: 'levels/microban2.txt' },
    { name: 'Microban III', file: 'levels/microban3.txt' },
    { name: 'Microban IV', file: 'levels/microban4.txt' },
];
let currentSetIndex = 0;
let levels = [];
let currentLevelIndex = 0;
let board = [];
let width = 0, height = 0;
let player = { x: 0, y: 0, px: 0, py: 0, moving: false, from: null, to: null, moveStart: 0, facing: { dx: 0, dy: -1 } };
let boxes = [];
let goals = [];
let undoStack = [];
let moves = 0;
let touchStartX = 0, touchStartY = 0;
const SWIPE_THRESHOLD = 30;

// ---------------------- Level Parsing ---------------------
function parseSokobanLevels(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const levels = [];
    let currentName = '';
    let currentMap = [];
    const commitLevel = () => {
        if (currentMap.length > 0) {
            levels.push({ name: currentName || `Level ${levels.length + 1}`, map: currentMap });
        }
    };
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(';')) {
            commitLevel();
            currentName = trimmed.substring(1).trim();
            currentMap = [];
        } else if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            // This handles the 'Name' format, assuming it's on its own line
            if (currentName) currentName += ` - ${trimmed.slice(1, -1)}`;
            else currentName = trimmed.slice(1, -1);
        } else if (trimmed.length > 0) {
            currentMap.push(line);
        }
    }
    commitLevel();
    return levels;
}

function populateLevelSelect() {
  if (!levelSelect) return;
  levelSelect.innerHTML = '';

  const actionsGroup = document.createElement('optgroup');
  actionsGroup.label = 'Actions';
  actionsGroup.innerHTML = `
    <option value="next">Next Level</option>
    <option value="reset">Reset Level</option>
  `;
  levelSelect.appendChild(actionsGroup);

  const levelsGroup = document.createElement('optgroup');
  levelsGroup.label = 'Levels';
  levels.forEach((lvl, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = lvl.name || `Level ${i + 1}`;
    levelsGroup.appendChild(opt);
  });
  levelSelect.appendChild(levelsGroup);

  const setsGroup = document.createElement('optgroup');
  setsGroup.label = 'Change Set';
  levelSets.forEach((set, i) => {
    const opt = document.createElement('option');
    opt.value = `set_${i}`;
    opt.textContent = set.name;
    setsGroup.appendChild(opt);
  });
  levelSelect.appendChild(setsGroup);
}

function parseLevelMap(mapLines) {
    const h = mapLines.length; const w = Math.max(...mapLines.map(l => l.length));
    const b = []; const boxList = []; const goalsList = []; let pl = null;
    for (let y = 0; y < h; y++) {
        b[y] = []; const row = mapLines[y] || ''; const trimmedRow = row.trim();
        if (trimmedRow.length === 0) { for (let x = 0; x < w; x++) { b[y][x] = '#'; } continue; }
        const firstCharIndex = row.indexOf(trimmedRow); const lastCharIndex = firstCharIndex + trimmedRow.length - 1;
        for (let x = 0; x < w; x++) {
            if (x < firstCharIndex || x > lastCharIndex) { b[y][x] = '#'; continue; }
            const ch = row[x]; b[y][x] = (ch === '#') ? '#' : ' ';
            switch (ch) {
                case '@': pl = { x, y, px: x * TILE_SIZE, py: y * TILE_SIZE, moving: false, from: null, to: null, moveStart: 0, facing: { dx: 0, dy: -1 } }; break;
                case '$': boxList.push({ x, y, px: x * TILE_SIZE, py: y * TILE_SIZE, moving: false, from: null, to: null, moveStart: 0 }); break;
                case '.': goalsList.push({ x, y }); break;
                case '+': pl = { x, y, px: x * TILE_SIZE, py: y * TILE_SIZE, moving: false, from: null, to: null, moveStart: 0, facing: { dx: 0, dy: -1 } }; goalsList.push({ x, y }); break;
                case '*': boxList.push({ x, y, px: x * TILE_SIZE, py: y * TILE_SIZE, moving: false, from: null, to: null, moveStart: 0 }); goalsList.push({ x, y }); break;
            }
        }
    }
    return { board: b, boxes: boxList, goals: goalsList, player: pl, width: w, height: h };
}

// ---------------------- Helpers & Movement ----------------------
function boxAt(x, y) { return boxes.find(b => b.x === x && b.y === y); }
function isWall(x, y) { return (y < 0 || y >= board.length || x < 0 || x >= (board[y] || []).length || board[y][x] === '#'); }
function deepCopyStateForUndo() { return { player: { x: player.x, y: player.y, facing: { ...player.facing } }, boxes: boxes.map(b => ({ x: b.x, y: b.y })) }; }
function restoreStateFromUndo(state) {
  player.x = state.player.x; player.y = state.player.y; player.facing = { ...state.player.facing };
  player.moving = false; player.px = player.x * TILE_SIZE; player.py = player.y * TILE_SIZE;
  boxes.forEach((b, i) => { b.x = state.boxes[i].x; b.y = state.boxes[i].y; b.moving = false; b.px = b.x * TILE_SIZE; b.py = b.y * TILE_SIZE; });
}
function pushUndoState() { undoStack.push(deepCopyStateForUndo()); if (undoStack.length > 200) undoStack.shift(); }
function undoMove() { if (!undoStack.length) return; const prev = undoStack.pop(); restoreStateFromUndo(prev); if (moves > 0) moves--; }
function tryMove(dx, dy) {
  if (player.moving || isLevelComplete()) return;
  const nx = player.x + dx, ny = player.y + dy; if (isWall(nx, ny)) return;
  const targetBox = boxAt(nx, ny);
  if (!targetBox) { pushUndoState(); startPlayerMove(nx, ny, dx, dy); moves++; } 
  else {
    const bx = targetBox.x + dx, by = targetBox.y + dy; if (isWall(bx, by) || boxAt(bx, by)) return;
    pushUndoState(); startBoxMove(targetBox, bx, by); startPlayerMove(nx, ny, dx, dy); moves++;
  }
}
function startPlayerMove(nx, ny, dx, dy) { player.moving = true; player.from = { x: player.x, y: player.y }; player.to = { x: nx, y: ny }; player.moveStart = performance.now(); player.x = nx; player.y = ny; player.facing = { dx, dy }; }
function startBoxMove(box, nx, ny) { box.moving = true; box.from = { x: box.x, y: box.y }; box.to = { x: nx, y: ny }; box.moveStart = performance.now(); box.x = nx; box.y = ny; }

// ---------------------- Animation, Rendering, etc. -------------
function ease(t) { return t * t * (3 - 2 * t); }
function updateAnimations() {
  const now = performance.now();
  if (player.moving && player.from && player.to) {
    const t = Math.min(1, (now - player.moveStart) / MOVE_ANIM_MS); const e = ease(t);
    player.px = (player.from.x + (player.to.x - player.from.x) * e) * TILE_SIZE;
    player.py = (player.from.y + (player.to.y - player.from.y) * e) * TILE_SIZE;
    if (t >= 1) player.moving = false;
  } else { player.px = player.x * TILE_SIZE; player.py = player.y * TILE_SIZE; }
  boxes.forEach(box => {
    if (box.moving && box.from && box.to) {
      const t = Math.min(1, (now - box.moveStart) / MOVE_ANIM_MS); const e = ease(t);
      box.px = (box.from.x + (box.to.x - box.from.x) * e) * TILE_SIZE;
      box.py = (box.from.y + (box.to.y - box.from.y) * e) * TILE_SIZE;
      if (t >= 1) box.moving = false;
    } else { box.px = box.x * TILE_SIZE; box.py = box.y * TILE_SIZE; }
  });
}
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Set crisp rendering for all tiles. This is the only setting needed now.
  ctx.imageSmoothingEnabled = false; 

  for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) { const px = x * TILE_SIZE, py = y * TILE_SIZE; if (isWall(x, y)) { ctx.drawImage(SPRITES.wall, px, py, TILE_SIZE, TILE_SIZE); } else { ctx.drawImage(SPRITES.floor, px, py, TILE_SIZE, TILE_SIZE); } } }

  ctx.imageSmoothingEnabled = true;
  goals.forEach(g => { ctx.drawImage(SPRITES.goal, g.x * TILE_SIZE, g.y * TILE_SIZE, TILE_SIZE, TILE_SIZE); });
  ctx.imageSmoothingEnabled = false;
  
  boxes.forEach(b => { ctx.drawImage(SPRITES.box, b.px, b.py, TILE_SIZE, TILE_SIZE); });
  
  let bob = player.moving ? Math.sin(performance.now() * BOB_FREQ) * BOB_AMPLITUDE : 0;
  ctx.save(); ctx.translate(player.px + TILE_SIZE / 2, player.py + TILE_SIZE / 2 + bob);
  const fd = player.facing; let angle = 0;
  if (fd.dx === 1) angle = Math.PI / 2; else if (fd.dx === -1) angle = -Math.PI / 2; else if (fd.dy === 1) angle = Math.PI;
  ctx.rotate(angle);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(SPRITES.player, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}
function isLevelComplete() { if (!goals.length || !boxes.length) return false; return boxes.every(b => goals.some(g => g.x === b.x && g.y === b.y)); }

function loadLevel(index) {
  if (!levels || !levels[index]) return;
  currentLevelIndex = index;
  try {
    // Save the last played level for the current set
    localStorage.setItem('boxes_lastSetIndex', currentSetIndex);
    localStorage.setItem('boxes_lastLevelIndex', index);
  } catch (e) {
    console.error("Could not save level to localStorage.", e);
  }
  const lvl = levels[index]; const parsed = parseLevelMap(lvl.map);
  board = parsed.board; boxes = parsed.boxes; goals = parsed.goals; player = parsed.player || { x: 0, y: 0, px: 0, py: 0, moving: false, from: null, to: null, moveStart: 0, facing: { dx: 0, dy: -1 } };
  width = parsed.width; height = parsed.height;
  player.px = player.x * TILE_SIZE; player.py = player.y * TILE_SIZE;
  boxes.forEach(b => { b.px = b.x * TILE_SIZE; b.py = b.y * TILE_SIZE; b.moving = false; });
  undoStack = []; moves = 0;
  if (levelSelect) levelSelect.value = String(index);
  canvas.width = width * TILE_SIZE; canvas.height = height * TILE_SIZE;
}

function loadNextLevel() {
    const nextIndex = (currentLevelIndex + 1) % levels.length;
    loadLevel(nextIndex);
}
function handleKeyboard(e) {
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') tryMove(0, -1); else if (k === 'arrowdown' || k === 's') tryMove(0, 1);
  else if (k === 'arrowleft' || k === 'a') tryMove(-1, 0); else if (k === 'arrowright' || k === 'd') tryMove(1, 0);
  else if (k === 'u' || k === 'z') undoMove(); else if (k === 'r' && confirm('Reset the level?')) loadLevel(currentLevelIndex);
}
function handleTouchStart(e) { e.preventDefault(); if (e.touches.length > 0) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; } }
function handleTouchEnd(e) {
    e.preventDefault(); if (touchStartX === 0 && touchStartY === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartX; const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = 0; touchStartY = 0;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx > SWIPE_THRESHOLD) tryMove(1, 0); else if (dx < -SWIPE_THRESHOLD) tryMove(-1, 0); } 
    else { if (dy > SWIPE_THRESHOLD) tryMove(0, 1); else if (dy < -SWIPE_THRESHOLD) tryMove(0, -1); }
}
window.addEventListener('keydown', handleKeyboard);
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
dpadButtons.forEach(btn => {
  btn.addEventListener('pointerdown', () => {
    const dir = btn.dataset.dir;
    if (dir === 'up') tryMove(0, -1); else if (dir === 'down') tryMove(0, 1);
    else if (dir === 'left') tryMove(-1, 0); else if (dir === 'right') tryMove(1, 0);
  });
});

// ---------------------- UI hooks ----------------------
resetBtn?.addEventListener('click', () => loadLevel(currentLevelIndex));
nextBtn?.addEventListener('click', () => loadNextLevel());
undoBtn?.addEventListener('click', () => undoMove());

levelSelect?.addEventListener('change', e => {
  const value = e.target.value;

  if (value.startsWith('set_')) {
    // Handle level set changes
    const i = parseInt(value.split('_')[1], 10);
    if (!Number.isNaN(i)) {
      loadLevelSet(i);
    }
  } else if (value === 'next') {
    loadNextLevel();
  } else if (value === 'reset') {
    loadLevel(currentLevelIndex);
  } else {
    const i = parseInt(value, 10);
    if (!Number.isNaN(i)) {
      loadLevel(i);
    }
  }
  
  e.target.value = String(currentLevelIndex);
  e.target.blur();
});

toggleDpadBtn?.addEventListener('click', () => {
  dpad?.classList.toggle('dpad-visible');
});

// ---------------------- Game Loop ----------------------
function loop() {
  updateAnimations(); drawBoard();
  if (isLevelComplete()) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, canvas.height / 2 - 28, canvas.width, 56);
    ctx.fillStyle = '#fff'; ctx.font = '20px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Level Complete!', canvas.width / 2, canvas.height / 2 + 6);
  }
  requestAnimationFrame(loop);
}

async function loadLevelSet(setIndex, startingLevel = 0) {
    if (!levelSets[setIndex]) return;
    currentSetIndex = setIndex;

    const fileToLoad = levelSets[setIndex].file;
    try {
        const response = await fetch(fileToLoad);
        if (!response.ok) throw new Error(`Network response was not ok for ${fileToLoad}`);
        const levelText = await response.text();
        levels = parseSokobanLevels(levelText);
        if (!levels.length) throw new Error(`No levels were parsed from ${fileToLoad}.`);
        
        populateLevelSelect();
        loadLevel(startingLevel);
    } catch (err) {
        console.error('Could not fetch or parse level data:', err);
        // Fallback to a default level if a set fails to load
        levels = [{ name: 'Error: Load Failed', map: ['#####', '#.@.#', '#.$.#', '#...#', '#####'] }];
        populateLevelSelect();
        loadLevel(0);
    }
}

async function initializeGame() {
    let startSet = 0;
    let startLevel = 0;
    try {
        const savedSetIndex = localStorage.getItem('boxes_lastSetIndex');
        const savedLevelIndex = localStorage.getItem('boxes_lastLevelIndex');

        if (savedSetIndex !== null) {
            const parsedSetIndex = parseInt(savedSetIndex, 10);
            if (!isNaN(parsedSetIndex) && parsedSetIndex >= 0 && parsedSetIndex < levelSets.length) {
                startSet = parsedSetIndex;
                if (savedLevelIndex !== null) {
                    const parsedLevelIndex = parseInt(savedLevelIndex, 10);
                    // We will pass this to loadLevelSet, which will then check its validity
                    if (!isNaN(parsedLevelIndex)) {
                        startLevel = parsedLevelIndex;
                    }
                }
            }
        }
    } catch (e) {
        console.error("Could not load progress from localStorage.", e);
    }
    
    // Load the determined set and level
    await loadLevelSet(startSet, startLevel);

    requestAnimationFrame(loop);
}

async function main() {
  try {
    await loadAssets();
    initializeGame();
  } catch (error) {
    console.error("Failed to load assets. Game cannot start.", error);
  }
}

main();
