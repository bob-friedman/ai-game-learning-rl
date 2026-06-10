// Audio System
const AudioSys = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    playTone: function(freq, type, duration, vol=0.1, slideTo=null) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    playNoise: function(duration, vol=0.2) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    },
    shoot: function() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },
    explosion: function(large=false) {
        this.playNoise(large ? 0.5 : 0.2, large ? 0.4 : 0.2);
    },
    rescue: function() {
        this.playTone(880, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(1100, 'sine', 0.2, 0.1), 100);
        setTimeout(() => this.playTone(1320, 'sine', 0.2, 0.1), 200);
    },
    humanDie: function() {
        this.playTone(200, 'sawtooth', 0.3, 0.15);
    },
    extraLife: function() {
        [440, 554, 659, 880].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 'square', 0.15, 0.1), i * 100);
        });
    }
};

// Game Config
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ui = {
    score: document.getElementById('scoreVal'),
    high: document.getElementById('highScore'),
    wave: document.getElementById('waveVal'),
    lives: document.getElementById('livesVal'),
    final: document.getElementById('finalScore'),
    start: document.getElementById('startScreen'),
    over: document.getElementById('gameOverScreen'),
    layer: document.getElementById('ui-layer')
};
let state = {
    running: false,
    score: 0,
    highScore: parseInt(localStorage.getItem('robotron_high') || '0'),
    lives: 3,
    wave: 1,
    frames: 0,
    width: 800,
    height: 600,
    rescueBonus: 0,
    warmup: 0,
    deathFlash: 0
};
let player, bullets = [], enemies = [], humans = [], particles = [];

// Diagnostics System
const Diagnostics = {
    logData: [],
    intervalFrames: 120, // 120 frames = 2 seconds at 60fps

    clear: function() {
        this.logData = [];
        this.logData.push("ROBOTRON CLONE AI DIAGNOSTICS LOG");
        this.logData.push("Session Started: " + new Date().toISOString());
        this.logData.push("=======================================\n");
    },

    recordState: function() {
        if (!state.running) return;

        let timeSec = (state.frames / 60).toFixed(1);
        let entry = `--- FRAME ${state.frames} (Time: ~${timeSec}s) ---\n`;
        entry += `STATE: Wave: ${state.wave} | Score: ${state.score} | Lives: ${state.lives}\n`;

        if (player) {
            entry += `PLAYER: X: ${player.x.toFixed(2)}, Y: ${player.y.toFixed(2)} | State: ${player.state}\n`;
        }

        entry += `ENEMIES (Total: ${enemies.length}):\n`;
        enemies.forEach(e => {
            entry += `  ${e.type.toUpperCase()} - X: ${e.x.toFixed(2)}, Y: ${e.y.toFixed(2)}\n`;
        });

        entry += `HUMANS (Total: ${humans.length}):\n`;
        humans.forEach(h => {
            entry += `  TYPE ${h.type} - X: ${h.x.toFixed(2)}, Y: ${h.y.toFixed(2)} | Panic: ${h.panic > 0 ? 'YES' : 'NO'}\n`;
        });

        entry += `BULLETS (Total: ${bullets.length}):\n`;
        bullets.forEach(b => {
            entry += `  ${b.isEnemy ? 'ENEMY' : 'PLAYER'} - X: ${b.x.toFixed(2)}, Y: ${b.y.toFixed(2)}\n`;
        });

        entry += `---------------------------------------\n\n`;
        this.logData.push(entry);
    },

    exportLog: function() {
        this.logData.push("=======================================");
        this.logData.push("Session Ended: " + new Date().toISOString());
        this.logData.push(`Final Score: ${state.score} | Final Wave: ${state.wave}`);

        const blob = new Blob([this.logData.join('')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `robotron_diagnostics_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

const keys = {};

// High score init
ui.high.textContent = state.highScore.toLocaleString();

// Canvas Sprite Helpers
const SPRITE_SCALE = 20;

function rgb(r, g, b, a = 1) {
    return `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${a})`;
}

function hsl(h, s, l, a = 1) {
    return `hsla(${Math.floor(h * 360)}, ${Math.floor(s * 100)}%, ${Math.floor(l * 100)}%, ${a})`;
}

function drawSpriteRect(cx, cy, offsetX, offsetY, w, h, color, angle = 0) {
    ctx.save();
    ctx.translate(cx + offsetX * SPRITE_SCALE, cy - offsetY * SPRITE_SCALE);
    if (angle !== 0) ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.fillRect(-w * SPRITE_SCALE / 2, -h * SPRITE_SCALE / 2, w * SPRITE_SCALE, h * SPRITE_SCALE);
    ctx.restore();
}

function drawSpriteEllipse(cx, cy, offsetX, offsetY, rx, ry, color, angle = 0) {
    ctx.save();
    ctx.translate(cx + offsetX * SPRITE_SCALE, cy - offsetY * SPRITE_SCALE);
    if (angle !== 0) ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * SPRITE_SCALE, ry * SPRITE_SCALE, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function resize() {
    const aspect = 4/3;
    let w = window.innerWidth;
    let h = window.innerHeight;
    if (w/h > aspect) w = h * aspect;
    else h = w / aspect;
    canvas.width = Math.min(800, w);
    canvas.height = Math.min(600, h);
    state.width = canvas.width;
    state.height = canvas.height;
    ctx.imageSmoothingEnabled = false;
    const header = document.querySelector('header');
    const canvasRect = canvas.getBoundingClientRect();
    header.style.width = canvasRect.width + 'px';
    header.style.left = canvasRect.left + 'px';
    header.style.transform = 'none';
}
window.addEventListener('resize', resize);
resize();

// Input handling
window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    keys[e.key] = true;
    keys[e.code] = true;
});
window.addEventListener('keyup', e => {
    keys[e.key] = false;
    keys[e.code] = false;
});

// Mobile joystick
const joystick = document.getElementById('joystick');
const stickHandle = joystick.querySelector('.joystick-handle');
let joyActive = false, joyId = null, joyX = 0, joyY = 0;
function handleJoyStart(e) {
    e.preventDefault();
    joyActive = true;
    const touch = e.changedTouches[0];
    joyId = touch.identifier;
    updateJoystick(touch);
}
function handleJoyMove(e) {
    if (!joyActive) return;
    e.preventDefault();
    for (let t of e.changedTouches) {
        if (t.identifier === joyId) { updateJoystick(t); break; }
    }
}
function handleJoyEnd(e) {
    for (let t of e.changedTouches) {
        if (t.identifier === joyId) {
            joyActive = false; joyX = 0; joyY = 0;
            stickHandle.style.transform = `translate(-50%, -50%)`;
            keys['KeyW'] = keys['KeyS'] = keys['KeyA'] = keys['KeyD'] = false;
            break;
        }
    }
}
function updateJoystick(touch) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const max = rect.width/2 - 20;
    if (dist > max) { dx = (dx/dist)*max; dy = (dy/dist)*max; }
    stickHandle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joyX = dx/max; joyY = dy/max;
    keys['KeyW'] = joyY < -0.3;
    keys['KeyS'] = joyY > 0.3;
    keys['KeyA'] = joyX < -0.3;
    keys['KeyD'] = joyX > 0.3;
}
joystick.addEventListener('touchstart', handleJoyStart, {passive:false});
joystick.addEventListener('touchmove', handleJoyMove, {passive:false});
joystick.addEventListener('touchend', handleJoyEnd);
joystick.addEventListener('mousedown', (e) => { joyActive=true; updateJoystick({clientX:e.clientX,clientY:e.clientY}); });
document.addEventListener('mousemove', (e) => { if(joyActive) updateJoystick({clientX:e.clientX,clientY:e.clientY}); });
document.addEventListener('mouseup', () => { joyActive=false; joyX=joyY=0; stickHandle.style.transform=`translate(-50%,-50%)`; keys['KeyW']=keys['KeyS']=keys['KeyA']=keys['KeyD']=false; });

// Shoot buttons
document.querySelectorAll('.shoot-btn').forEach(btn => {
    const dir = btn.dataset.dir;
    const keyMap = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
    const k = keyMap[dir];
    ['touchstart','mousedown'].forEach(evt => {
        btn.addEventListener(evt, (e) => { e.preventDefault(); keys[k]=true; btn.classList.add('active'); });
    });
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(evt => {
        btn.addEventListener(evt, (e) => { e.preventDefault(); keys[k]=false; btn.classList.remove('active'); });
    });
});

// Safety net: force-release all fire directions on any global pointer-up,
// touch cancel, or focus loss. Without this, an "up" event that misses the
// button (e.g. released over the game-over overlay, a window blur, or a
// system-interrupted touch) would latch a direction true and autofire forever.
function releaseFireButtons() {
    keys['ArrowUp'] = keys['ArrowDown'] = keys['ArrowLeft'] = keys['ArrowRight'] = false;
    document.querySelectorAll('.shoot-btn').forEach(b => b.classList.remove('active'));
}
['mouseup','touchend','touchcancel','blur'].forEach(evt => {
    window.addEventListener(evt, releaseFireButtons);
});

// Base Classes
class Entity {
    constructor(x,y,radius,color) {
        this.x=x; this.y=y; this.radius=radius; this.color=color;
        this.marked=false; this.vx=0; this.vy=0;
    }
    dist(other) { return Math.hypot(this.x-other.x, this.y-other.y); }
    clamp() {
        this.x = Math.max(this.radius, Math.min(state.width-this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(state.height-this.radius, this.y));
    }
}

class Particle {
    constructor(x,y,color,speed=4) {
        this.x=x; this.y=y; this.color=color;
        const a=Math.random()*Math.PI*2;
        const s=Math.random()*speed;
        this.vx=Math.cos(a)*s; this.vy=Math.sin(a)*s;
        this.life=1.0; this.decay=0.9+Math.random()*0.05;
    }
    update() {
        this.x+=this.vx; this.y+=this.vy;
        this.vx*=0.95; this.vy*=0.95;
        this.life*=this.decay;
    }
    draw() {
        ctx.globalAlpha=this.life;
        ctx.fillStyle=this.color;
        ctx.fillRect(this.x-2,this.y-2,4,4);
        ctx.globalAlpha=1;
    }
}

class Bullet extends Entity {
    constructor(x,y,dx,dy,isEnemy=false) {
        super(x,y,3,isEnemy?'#f0f':'#ff0');
        this.dx=dx; this.dy=dy; this.speed=isEnemy?3:10; this.isEnemy=isEnemy;
        this.cruise=false; this.bounce=false;
    }
    update() {
        this.x+=this.dx*this.speed; this.y+=this.dy*this.speed;
        for (let e of enemies) {
            if (e.type === 'electrode' && !e.marked) {
                if (this.dist(e) < e.radius + 3) {
                    this.marked = true;
                    for(let i=0; i<3; i++) {
                        particles.push(new Particle(this.x, this.y, '#ff0', 2));
                    }
                    return;
                }
            }
        }
        if(this.x<0 || this.x>state.width || this.y<0 || this.y>state.height) this.marked=true;

        if (this.isEnemy) {
            this.spinAngle = (this.spinAngle || 0) + 0.35;
            this.phase = (this.phase || 0) + 0.12;
        } else {
            this.huePhase = (this.huePhase || 0) + 0.08;
        }
    }
    draw() {
        if (this.isEnemy) {
            const c = hsl(this.phase, 1, .65);
            drawSpriteRect(this.x, this.y, 0, 0, .55, .55, hsl(this.phase, 1, .65, 0.3), this.spinAngle * 0.5);
            drawSpriteRect(this.x, this.y, 0, 0, .55, .15, c, this.spinAngle);
            drawSpriteRect(this.x, this.y, 0, 0, .15, .55, c, this.spinAngle);
            drawSpriteRect(this.x, this.y, 0, 0, .18, .18, rgb(1,1,1));
        } else {
            const angle = Math.atan2(this.dy, this.dx) + Math.PI/2;
            const c = hsl(this.huePhase, 1, .65);
            drawSpriteRect(this.x, this.y, 0, 0, .22, .8, hsl(this.huePhase, 1, .65, 0.35), angle);
            drawSpriteRect(this.x, this.y, 0, 0, .14, 2, c, angle);
            drawSpriteRect(this.x, this.y, 0, 0, .1, 1, rgb(1,1,1), angle);
        }
    }
}

// Robotron Classes
class AuthenticPlayer extends Entity {
    constructor() {
        super(state.width/2, state.height/2, 8, '#0ff');
        this.state = 'spawning';
        this.stateCount = 0;
        this.spawnDelay = 45;
        this.invuln = 0;
        this.cooldown = 0;
        this.walkPhase = 0;
    }
    update() {
        if (this.state === 'spawning') {
            if (this.spawnDelay > 0) {
                this.spawnDelay--;
                return;
            }
            this.stateCount++;
            if (this.stateCount >= 90) {
                this.state = 'normal';
                this.invuln = 60;
            }
            return;
        }
        if (this.invuln > 0) this.invuln--;
        const speed = 2.8;
        this.vx = 0; this.vy = 0;
        if (keys['KeyW'] || keys['w']) this.vy = -speed;
        if (keys['KeyS'] || keys['s']) this.vy = speed;
        if (keys['KeyA'] || keys['a']) this.vx = -speed;
        if (keys['KeyD'] || keys['d']) this.vx = speed;
        this.x += this.vx;
        this.y += this.vy;
        this.clamp();

        if (this.vx !== 0 || this.vy !== 0) {
            this.walkPhase += Math.hypot(this.vx, this.vy) * 0.15;
        }

        if (this.cooldown > 0) this.cooldown--;
        let sx = 0, sy = 0;
        if (keys['ArrowUp']) sy = -1;
        if (keys['ArrowDown']) sy = 1;
        if (keys['ArrowLeft']) sx = -1;
        if (keys['ArrowRight']) sx = 1;
        if ((sx !== 0 || sy !== 0) && this.cooldown <= 0) {
            const len = Math.hypot(sx, sy);
            bullets.push(new Bullet(this.x, this.y, sx/len, sy/len, false));
            this.cooldown = 8;
            AudioSys.shoot();
        }
    }
    draw() {
        if (this.state === 'spawning') {
            ctx.fillStyle = `rgba(0,255,255,${0.5 + Math.sin(state.frames*0.5)*0.3})`;
            ctx.fillRect(this.x-6, this.y-6, 12, 12);
            return;
        }
        if (this.state === 'dying') {
            const flash = Math.floor(state.frames / 2) % 2;
            const size = 6 + Math.abs(Math.sin(state.frames * 0.4)) * 6;
            ctx.fillStyle = flash ? '#fff' : '#f00';
            ctx.fillRect(this.x - size/2, this.y - size/2, size, size);
            return;
        }

        const phase = Math.sin(this.walkPhase);
        const bob = phase * .05;
        const armSwing = phase * .08;
        const legStretch = phase * .06;
        const isInvuln = this.invuln > 0;

        if (isInvuln && Math.floor(state.frames / 4) % 2 === 0) return;

        const hue = isInvuln ? (state.frames * .05) % 1 : 0;
        const body     = isInvuln ? hsl(hue, 1, .7)              : rgb(.95, .95, .95);
        const head     = isInvuln ? hsl((hue + .33) % 1, 1, .6)  : rgb(1, .2, .2);
        const headDark = isInvuln ? hsl((hue + .33) % 1, 1, .3)  : rgb(.55, .05, .05);
        const dark     = isInvuln ? hsl((hue + .66) % 1, .8, .4) : rgb(.25, .25, .3);
        const eyes = rgb(1, 1, 1);
        const bodyCenterY = -.02 + bob;
        const bodyBottomY = bodyCenterY - .275;

        drawSpriteRect(this.x, this.y, 0, -.55, .7, .14, 'rgba(0,0,0,0.4)');

        const baseLegH = .32;
        const leftLegH  = baseLegH + legStretch;
        const rightLegH = baseLegH - legStretch;
        drawSpriteRect(this.x, this.y, -.14, bodyBottomY - leftLegH /2, .2, leftLegH, dark);
        drawSpriteRect(this.x, this.y, .14, bodyBottomY - rightLegH/2, .2, rightLegH, dark);

        drawSpriteRect(this.x, this.y, 0, bodyCenterY, .55, .55, body);
        drawSpriteRect(this.x, this.y, -.35, bodyCenterY + armSwing, .16, .42, body);
        drawSpriteRect(this.x, this.y, .35, bodyCenterY - armSwing, .16, .42, body);

        drawSpriteRect(this.x, this.y, 0, .42 + bob, .6, .5, head);
        drawSpriteRect(this.x, this.y, 0, .22 + bob, .62, .08, headDark);
        drawSpriteRect(this.x, this.y, 0, .42 + bob, .42, .1, headDark);
        drawSpriteRect(this.x, this.y, -.1, .42 + bob, .08, .08, eyes);
        drawSpriteRect(this.x, this.y, .1, .42 + bob, .08, .08, eyes);
    }
}

class AuthenticGrunt extends Entity {
    constructor(x, y) {
        super(x, y, 8, '#f00');
        this.type = 'grunt';
        this.moveCount = Math.floor(Math.random() * 60);
        this.stateCount = 0;
        this.dx = 0;
        this.dy = 0;
        this.score = 100;
        this.walkPhase = 0;
    }
    getSpeed() {
        const cyclePosition = (state.wave - 1) % 5;
        const baseSpeed = 0.75;
        const increment = 0.07;
        return baseSpeed + (cyclePosition * increment);
    }
    update() {
        if (state.warmup > 0) return;
        for (let e of enemies) {
            if (e.type === 'electrode' && !e.marked) {
                const dist = Math.hypot(this.x - e.x, this.y - e.y);
                const minDist = this.radius + e.radius;
                if (dist < minDist) {
                    const angle = Math.atan2(this.y - e.y, this.x - e.x);
                    const pushDist = minDist - dist + 2;
                    this.x += Math.cos(angle) * pushDist;
                    this.y += Math.sin(angle) * pushDist;
                    this.clamp();
                    break;
                }
            }
        }
        let speed = this.getSpeed();
        if (this.moveCount > 30) speed *= (30 / this.moveCount);
        if (Math.floor(this.moveCount) === 1) {
            this.dx = Math.abs(player.x - this.x) < 4 ? 0 : (player.x > this.x ? 1 : -1);
            this.dy = Math.abs(player.y - this.y) < 4 ? 0 : (player.y > this.y ? 1 : -1);
        }
        const checkCollision = (x, y) => {
            for (let e of enemies) {
                if (e.type === 'electrode' && !e.marked) {
                    if (Math.hypot(x - e.x, y - e.y) < this.radius + e.radius) return true;
                }
            }
            return false;
        };
        const desiredX = this.x + (this.dx * speed);
        const desiredY = this.y + (this.dy * speed);
        if (!checkCollision(desiredX, desiredY)) {
            this.x = desiredX;
            this.y = desiredY;
        } else {
            if (this.dx !== 0 && !checkCollision(desiredX, this.y)) {
                this.x = desiredX;
            }
            else if (this.dy !== 0 && !checkCollision(this.x, desiredY)) {
                this.y = desiredY;
            }
            else {
                const perpX = -this.dy * speed;
                const perpY = this.dx * speed;
                if (!checkCollision(this.x + perpX, this.y + perpY)) {
                    this.x += perpX;
                    this.y += perpY;
                }
                else if (!checkCollision(this.x - perpX, this.y - perpY)) {
                    this.x -= perpX;
                    this.y -= perpY;
                }
            }
        }
        this.clamp();
        this.moveCount = (this.moveCount + 1) % 40;
        this.stateCount++;

        this.walkPhase += speed * 0.5;

        for (let other of enemies) {
            if (other === this || other.type !== 'grunt' || other.marked) continue;
            const sx = this.x - other.x;
            const sy = this.y - other.y;
            const sd = Math.hypot(sx, sy);
            const minSep = this.radius + other.radius - 2; // -2 allows a slight, natural visual overlap
            if (sd < minSep) {
                if (sd === 0) {
                    // Prevent pixel perfect stacking
                    this.x += (Math.random() - 0.5) * 2;
                    this.y += (Math.random() - 0.5) * 2;
                } else {
                    const push = (minSep - sd) * 0.25;
                    this.x += (sx / sd) * push;
                    this.y += (sy / sd) * push;
                }
            }
        }
        this.clamp();
    }
    draw() {
        const c = rgb(.95,.25,.25);
        const dark = rgb(.5, .08, .08);
        const bob = (Math.floor(this.walkPhase * 4) % 2) ? .04 : -.04;

        drawSpriteRect(this.x, this.y, 0, -.55, .7, .14, 'rgba(0,0,0,0.35)');
        drawSpriteRect(this.x, this.y, -.18, -.42 + bob, .22, .28, dark);
        drawSpriteRect(this.x, this.y, .18, -.42 - bob, .22, .28, dark);
        drawSpriteRect(this.x, this.y, 0, -.05, .6, .55, c);
        drawSpriteRect(this.x, this.y, -.42, bob, .18, .4, c);
        drawSpriteRect(this.x, this.y, .42, -bob, .18, .4, c);
        drawSpriteRect(this.x, this.y, 0, .35, .4, .38, c);
        drawSpriteRect(this.x, this.y, -.1, .38, .08, .1, rgb(1,1,.2));
        drawSpriteRect(this.x, this.y, .1, .38, .08, .1, rgb(1,1,.2));
    }
    hit() {
        this.marked = true;
        explode(this.x, this.y, '#f00');
        return true;
    }
}

class AuthenticHulk extends Entity {
    constructor(x, y) {
        super(x, y, 12, '#0f0');
        this.type = 'hulk';
        this.pauseCount = 0;
        this.walkPhase = 0;
        this.targetAngle = Math.random() * Math.PI * 2;
    }
    update() {
        if (state.warmup > 0) return;
        if (this.pauseCount > 0) {
            this.pauseCount--;
            return;
        }

        // Crush Electrodes instantly on contact
        enemies.forEach(e => {
            if (e.type === 'electrode' && !e.marked) {
                if (this.dist(e) < this.radius + e.radius - 2) {
                    e.marked = true;
                    explode(e.x, e.y, '#ff0');
                }
            }
        });

        // Hulks do NOT hunt humans. They lumber around semi-randomly and only
        // kill a human by walking into it. This leaves humans available for the
        // Brains to seek out and convert into Progs.
        if (Math.random() < 0.02) this.targetAngle += (Math.random() - 0.5) * 2;

        // Move steadily
        this.x += Math.cos(this.targetAngle) * 0.9;
        this.y += Math.sin(this.targetAngle) * 0.9;
        this.walkPhase += 0.15;

        // Bounce off walls
        if (this.x <= this.radius || this.x >= state.width - this.radius) {
            this.targetAngle = Math.PI - this.targetAngle;
        }
        if (this.y <= this.radius || this.y >= state.height - this.radius) {
            this.targetAngle = -this.targetAngle;
        }
        this.clamp();

        // Crush Humans
        humans.forEach(h => {
            if (this.dist(h) < this.radius + h.radius - 2) {
                h.marked = true;
                explode(h.x, h.y, '#f8c');
                AudioSys.humanDie();
                addFloat(h.x, h.y, 'CRUSHED', '#f00');
            }
        });
    }
    draw() {
        const bob = (Math.floor(this.walkPhase) % 2) ? .05 : -.05;
        const body = rgb(.35, .55, .35), skin = rgb(.55, .75, .45), dark = rgb(.18, .3, .18);

        drawSpriteRect(this.x, this.y, 0, -.7, 1.1, .14, 'rgba(0,0,0,0.4)');
        drawSpriteRect(this.x, this.y, -.35, -.55 + bob, .35, .4, dark);
        drawSpriteRect(this.x, this.y, .35, -.55 - bob, .35, .4, dark);
        drawSpriteRect(this.x, this.y, 0, -.05, 1.1, .8, body);
        drawSpriteRect(this.x, this.y, 0, -.05, .55, .35, skin);
        drawSpriteRect(this.x, this.y, -.62, bob*1.5, .28, .55, body);
        drawSpriteRect(this.x, this.y, .62, -bob*1.5, .28, .55, body);
        drawSpriteRect(this.x, this.y, 0, .55, .55, .45, body);
        drawSpriteRect(this.x, this.y, -.13, .58, .13, .1, rgb(1, .15, .15));
        drawSpriteRect(this.x, this.y, .13, .58, .13, .1, rgb(1, .15, .15));
    }
    hit(by) {
        const push = 20;
        const dist = this.dist(by);
        if (dist > 0) {
            this.x -= (by.x - this.x) / dist * push;
            this.y -= (by.y - this.y) / dist * push;
        }
        this.pauseCount = 4;
        this.clamp();
        return false;
    }
}

class AuthenticBrain extends Entity {
    constructor(x, y) {
        super(x, y, 11, '#c0f');
        this.type = 'brain';
        this.moveCount = 0;
        this.shootTimer = 60;
        this.dir = 0;
        this.lastDir = -1;   // Direction taken last segment (anti-reversal)
        this.detourDir = -1; // Committed detour direction while primary is blocked
        this.score = 500;
        this.walkPhase = 0;
        this.brainPulse = 0;
    }
    update() {
        if (state.warmup > 0) return;

        // Push out of electrodes if spawn inside them
        enemies.forEach(e => {
            if (e.type === 'electrode' && !e.marked) {
                const dist = this.dist(e);
                const minD = this.radius + e.radius;
                if (dist < minD && dist > 0) {
                    const angle = Math.atan2(this.y - e.y, this.x - e.x);
                    const pushDist = minD - dist + 1;
                    this.x += Math.cos(angle) * pushDist;
                    this.y += Math.sin(angle) * pushDist;
                    this.clamp();
                }
            }
        });

        const dirs = [{x:0,y:-1}, {x:1,y:0}, {x:0,y:1}, {x:-1,y:0}];
	const speed = 1.4; // Sped up so Brains are faster than Panic Humans

        if (this.moveCount > 0) {
            const d = dirs[this.dir];
            const desiredX = this.x + d.x * speed;
            const desiredY = this.y + d.y * speed;

            const checkCollision = (x, y) => {
                for (let e of enemies) {
                    if (e.type === 'electrode' && !e.marked) {
                        if (Math.hypot(x - e.x, y - e.y) < this.radius + e.radius) return true;
                    }
                }
                return false;
            };

            // Capture pre-move position so we can detect being pinned by a wall
            const preX = this.x, preY = this.y;
            if (!checkCollision(desiredX, desiredY)) {
                this.x = desiredX;
                this.y = desiredY;
                this.moveCount -= speed;
                this.clamp();
                // The old check compared against the post-move position,
                // so any normal step (where clamp does nothing) zeroed moveCount.
                // That forced a re-target every single step (worsening Electrode
                // oscillation) and halved the Brain's effective speed to 0.7,
                // making it slower than panicking Humans (1.2). Now we only stop
                // when a wall clamp cancels the entire move.
                if (this.x === preX && this.y === preY) {
                    this.moveCount = 0;
                }
            } else {
                this.moveCount = 0;
            }

            this.walkPhase += 0.12;
            this.brainPulse += 0.12;
        } else {
            this.moveCount = 14; // Distance to travel before re-evaluating target

	    // Lock onto nearest human, only fallback to player if no humans exist
            let target = player;
            if (humans.length > 0) {
                let minDist = Infinity;
                humans.forEach(h => {
                    let d = this.dist(h);
                    if (d < minDist) {
                        minDist = d;
                        target = h;
                    }
                });
            }

            const dx = target.x - this.x;
            const dy = target.y - this.y;

            let primaryDir, secondaryDir;
            if (Math.abs(dx) > Math.abs(dy)) {
                primaryDir = dx > 0 ? 1 : 3;
                secondaryDir = dy > 0 ? 2 : 0;
            } else {
                primaryDir = dy > 0 ? 2 : 0;
                secondaryDir = dx > 0 ? 1 : 3;
            }

            // Graded probe: 0 = fully clear, 1 = clear nearby but an Electrode
            // sits 20-28px out (tight gap / approaching obstacle), 2 = blocked.
            // Probing ~28px out makes the Brain commit to a detour before
            // entering dead-end concave Electrode pockets, while the graded
            // result still lets it squeeze through tight gaps when nothing is
            // fully clear.
            const probeDir = (dirIndex) => {
                const d = dirs[dirIndex];

                // Wall check — only on the axis of travel. The old check tested
                // BOTH axes for every direction, so a Brain flush against a wall
                // (e.g. y === radius at the top) saw even left/right as blocked
                // and could only bounce back and forth, never sliding along the
                // wall toward Humans cornered against it.
                if (d.x !== 0) {
                    const wallX = this.x + d.x * 4;
                    if (wallX <= this.radius || wallX >= state.width - this.radius) return 2;
                }
                if (d.y !== 0) {
                    const wallY = this.y + d.y * 4;
                    if (wallY <= this.radius || wallY >= state.height - this.radius) return 2;
                }

                let result = 0;
                for (let step = 4; step <= 28; step += 8) {
                    const testX = this.x + d.x * step;
                    const testY = this.y + d.y * step;
                    for (let e of enemies) {
                        if (e.type === 'electrode' && !e.marked) {
                            if (Math.hypot(testX - e.x, testY - e.y) < this.radius + e.radius + 1) {
                                if (step <= 12) return 2; // Blocked within this move segment
                                result = 1;               // Blocked only at long range
                            }
                        }
                    }
                }
                return result;
            };

            // Smart Pathing with detour persistence.
            // Old logic re-evaluated greedily every segment: blocked primary ->
            // sidestep -> primary looks clear -> turn back -> blocked again.
            // The Brain wobbled in place against an Electrode and never reached
            // fleeing Humans. Now, once a detour direction is chosen it is kept
            // until the primary direction is genuinely traversable, and the
            // Brain avoids instantly reversing its previous direction.
            const pPrimary = probeDir(primaryDir);
            if (pPrimary === 0) {
                this.dir = primaryDir;
                this.detourDir = -1; // Path to target is clear, drop any detour
            } else if (this.detourDir >= 0 && probeDir(this.detourDir) === 0) {
                // Keep going around the obstacle instead of flip-flopping
                this.dir = this.detourDir;
            } else {
                const reverseDir = this.lastDir >= 0 ? (this.lastDir + 2) % 4 : -1;
                const candidates = [secondaryDir, (secondaryDir + 2) % 4, (primaryDir + 2) % 4];
                let chosen = -1;
                // 1) A fully clear direction that doesn't reverse the last move
                for (const c of candidates) {
                    if (c !== reverseDir && probeDir(c) === 0) { chosen = c; break; }
                }
                // 2) A fully clear direction, even if it reverses
                if (chosen < 0) {
                    for (const c of candidates) {
                        if (probeDir(c) === 0) { chosen = c; break; }
                    }
                }
                // 3) Nothing fully clear: squeeze toward the target through a
                //    tight gap (clear for this segment, Electrode beyond it)
                if (chosen < 0 && pPrimary === 1) chosen = primaryDir;
                if (chosen < 0) {
                    for (const c of candidates) {
                        if (c !== reverseDir && probeDir(c) === 1) { chosen = c; break; }
                    }
                }
                if (chosen < 0) {
                    for (const c of candidates) {
                        if (probeDir(c) === 1) { chosen = c; break; }
                    }
                }
                // 4) Fully boxed in: pick at random and let the push-out resolve
                if (chosen < 0) chosen = Math.floor(Math.random() * 4);
                this.dir = chosen;
                this.detourDir = chosen;
            }
            this.lastDir = this.dir;
        }

        // Convert Humans (Now uses radial distance so corner trapping works)
        humans.forEach(h => {
            if (this.dist(h) <= this.radius + h.radius - 2) {
                h.marked = true;
                explode(h.x, h.y, '#f0f');
                AudioSys.playTone(200, 'sawtooth', 0.3, 0.2);
                addFloat(h.x, h.y, 'CONVERTED', '#f0f');
                enemies.push(new AuthenticProg(h.x, h.y));
            }
        });

        // Shoot at Player
        if (this.shootTimer-- <= 0) {
            this.shootTimer = 100 + Math.random() * 40;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0 && dist < 300) {
                const b = new Bullet(this.x, this.y, dx/dist, dy/dist, true);
                b.speed = 3;
                bullets.push(b);
                AudioSys.playTone(300, 'sawtooth', 0.3, 0.1);
            }
        }
    }
    draw() {
        const c = rgb(.35, .5, 1);
        const dark = rgb(.1, .2, .55);
        const brainPink = rgb(1, .55, .75);
        const brainWrinkle = rgb(.7, .15, .35);
        const bob = Math.sin(this.walkPhase) * .04;
        const pulse = 1 + Math.sin(this.brainPulse) * .04;

        drawSpriteRect(this.x, this.y, 0, -.85, .6, .14, 'rgba(0,0,0,0.4)');
        drawSpriteRect(this.x, this.y, -.13, -.62 + bob*.4, .16, .25, dark);
        drawSpriteRect(this.x, this.y, .13, -.62 - bob*.4, .16, .25, dark);
        drawSpriteRect(this.x, this.y, 0, -.32, .45, .4, c);
        drawSpriteRect(this.x, this.y, -.32, -.3, .13, .32, c);
        drawSpriteRect(this.x, this.y, .32, -.3, .13, .32, c);
        drawSpriteRect(this.x, this.y, -.16, -.05, .13, .14, rgb(0,0,0));
        drawSpriteRect(this.x, this.y, .16, -.05, .13, .14, rgb(0,0,0));
        drawSpriteRect(this.x, this.y, -.16, -.04, .07, .07, rgb(1, .15, .15));
        drawSpriteRect(this.x, this.y, .16, -.04, .07, .07, rgb(1, .15, .15));

        drawSpriteEllipse(this.x, this.y, 0, .42 + bob*.5, .57 * pulse, .4 * pulse, brainPink);
        drawSpriteEllipse(this.x, this.y, 0, .65 + bob*.5, .47 * pulse, .04, brainWrinkle);
        drawSpriteEllipse(this.x, this.y, 0, .42 + bob*.5, .52 * pulse, .03, brainWrinkle);
        drawSpriteEllipse(this.x, this.y, 0, .2 + bob*.5, .42 * pulse, .03, brainWrinkle);
        drawSpriteRect(this.x, this.y, 0, .42 + bob*.5, .07, .78 * pulse, brainWrinkle);
    }
    hit() {
        this.marked = true;
        explode(this.x, this.y, '#c0f');
        return true;
    }
}

class AuthenticProg extends Entity {
    constructor(x, y) {
        super(x, y, 7, '#d08');
        this.type = 'prog';
        this.score = 100;
        this.walkPhase = 0;
        this.eyePulse = 0;
        this.huePhase = 0;
    }
    update() {
        if (state.warmup > 0) return;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            this.x += (dx/dist) * 1.8;
            this.y += (dy/dist) * 1.8;
        }

        this.walkPhase += 0.2;
        this.eyePulse += 0.3;
        this.huePhase += 0.06;

        if (state.frames % 3 === 0) {
            const c = hsl((this.huePhase + Math.random()*0.2 - 0.1) % 1, 1, 0.65);
            particles.push(new Particle(this.x + (Math.random()-0.5)*10, this.y + (Math.random()-0.5)*10, c, 1));
        }

        this.clamp();
    }
    draw() {
        const bob = Math.sin(this.walkPhase) * .12;
        const armSwing = Math.sin(this.walkPhase * .8) * .18;
        const flicker = ((state.frames >> 2) & 1) === 0;
        const c = flicker ? rgb(1, 1, 1) : hsl(this.huePhase, 1, .65);
        const dark = rgb(.55, .05, .45);
        const skin = flicker ? rgb(1, 1, 1) : hsl((this.huePhase + .15) % 1, .85, .55);
        const eyeGlow = (Math.sin(this.eyePulse) * .5 + .5) * .5 + .5;

        drawSpriteRect(this.x, this.y, 0, -.5, .5, .1, 'rgba(0,0,0,0.45)');
        drawSpriteRect(this.x, this.y, -.13, -.35 + bob, .15, .3, dark);
        drawSpriteRect(this.x, this.y, .13, -.35 - bob, .15, .3, dark);
        drawSpriteRect(this.x, this.y, 0, -.02, .46, .46, c);
        drawSpriteRect(this.x, this.y, -.38, .15 + armSwing*.3, .17, .4, c);
        drawSpriteRect(this.x, this.y, .38, .15 - armSwing*.3, .17, .4, c);

        // Rounded head for the mutated Prog
        drawSpriteEllipse(this.x, this.y, 0, .35, .17, .17, skin);
        drawSpriteRect(this.x, this.y, 0, .51, .36, .1, dark);

        drawSpriteRect(this.x, this.y, -.09, .36, .13, .14, rgb(0,0,0));
        drawSpriteRect(this.x, this.y, .09, .36, .13, .14, rgb(0,0,0));
        drawSpriteRect(this.x, this.y, -.09, .37, .1, .1, rgb(1, eyeGlow, .1));
        drawSpriteRect(this.x, this.y, .09, .37, .1, .1, rgb(1, eyeGlow, .1));
        drawSpriteRect(this.x, this.y, 0, .23, .2, .05, rgb(.4, 0, .25));
    }
    hit() {
        this.marked = true;
        explode(this.x, this.y, '#d08');
        return true;
    }
}

class AuthenticHuman extends Entity {
    constructor(type) {
        const x = 50 + Math.random() * (state.width - 100);
        const y = 50 + Math.random() * (state.height - 100);
        super(x, y, 6, '#f8c');
        this.type = type;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.targetAngle = this.wanderAngle;
        this.panic = 0;
        this.walkPhase = Math.random() * 6;
    }
    update() {
        // Avoid Electrodes smoothly
        enemies.forEach(e => {
            if (e.type === 'electrode' && !e.marked) {
                const d = this.dist(e);
                const minD = this.radius + e.radius + 5; // Detection radius
                if (d < minD && d > 0) {
                    const avoidAngle = Math.atan2(this.y - e.y, this.x - e.x);
                    this.targetAngle = avoidAngle; // Steer away
                    if (d < this.radius + e.radius) {
                        // Hard push if actually touching
                        this.x += Math.cos(avoidAngle) * 1;
                        this.y += Math.sin(avoidAngle) * 1;
                    }
                }
            }
        });

        // Flee Logic
        let threat = null;
        let minTD = Infinity;
        enemies.forEach(e => {
            if (e.type === 'hulk' || e.type === 'brain') {
                const d = this.dist(e);
                if (d < minTD) { minTD = d; threat = e; }
            }
        });

        if (threat && minTD < 100) {
            this.targetAngle = Math.atan2(this.y - threat.y, this.x - threat.x);
            this.panic = 10;
        }

        // Smooth Steering Logic
        if (this.panic > 0) {
            this.vx = Math.cos(this.targetAngle) * 1.2;
            this.vy = Math.sin(this.targetAngle) * 1.2;
            this.wanderAngle = this.targetAngle;
            this.panic--;
        } else {
            // Randomly pick a new direction to wander
            if (Math.random() < 0.03) {
                this.targetAngle += (Math.random() - 0.5) * 2.5;
            }

            // Wall Avoidance (Smooth curving away from edges)
            const edgeDist = 40;
            if (this.x < edgeDist) this.targetAngle = 0; // Steer Right
            if (this.x > state.width - edgeDist) this.targetAngle = Math.PI; // Steer Left
            if (this.y < edgeDist) this.targetAngle = Math.PI/2; // Steer Down
            if (this.y > state.height - edgeDist) this.targetAngle = -Math.PI/2; // Steer Up

            // Interpolate current angle towards target angle smoothly
            let diff = this.targetAngle - this.wanderAngle;
            // Normalize difference to find the shortest turn direction
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.wanderAngle += diff * 0.1; // 0.1 is the turn speed

            this.vx = Math.cos(this.wanderAngle) * 0.6;
            this.vy = Math.sin(this.wanderAngle) * 0.6;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.clamp();

        this.walkPhase += Math.hypot(this.vx, this.vy) * 0.15;

        if (this.dist(player) < 20 && player.state === 'normal') {
            this.marked = true;
            const base = [1000, 2000, 3000][this.type];
            const bonus = state.rescueBonus + base;
            state.rescueBonus = Math.min(bonus, 5000);
            state.score += state.rescueBonus;
            addFloat(this.x, this.y, `+${state.rescueBonus}`, '#0f0');
            AudioSys.rescue();
            checkExtraLife();
        }
    }
    draw() {
        const phase = Math.sin(this.walkPhase);
        const bob = phase * .04;
        const armSwing = phase * .07;
        const legStretch = phase * .05;
        const palettes = [
            { body: rgb(1, .45, .75), head: rgb(1, .85, .7), hair: rgb(.85, .55, .25) },
            { body: rgb(.3, .55, 1),  head: rgb(1, .85, .7), hair: rgb(.25, .15, .1)  },
            { body: rgb(1, .9, .25),  head: rgb(1, .85, .7), hair: rgb(.95, .65, .15) },
        ];
        const c = palettes[this.type];
        const flash = (this.panic > 0 && (this.panic & 4)) ? rgb(1,1,1) : c.body;
        const bodyCenterY = -.05 + bob;
        const bodyBottomY = bodyCenterY - .21;

        drawSpriteRect(this.x, this.y, 0, -.45, .5, .1, 'rgba(0,0,0,0.35)');
        const baseLegH = .22;
        const leftLegH  = baseLegH + legStretch;
        const rightLegH = baseLegH - legStretch;
        drawSpriteRect(this.x, this.y, -.1, bodyBottomY - leftLegH /2, .13, leftLegH, c.body);
        drawSpriteRect(this.x, this.y, .1, bodyBottomY - rightLegH/2, .13, rightLegH, c.body);
        drawSpriteRect(this.x, this.y, 0, bodyCenterY, .42, .42, flash);
        drawSpriteRect(this.x, this.y, -.27, bodyCenterY + armSwing, .12, .3, flash);
        drawSpriteRect(this.x, this.y, .27, bodyCenterY - armSwing, .12, .3, flash);
        drawSpriteRect(this.x, this.y, 0, .3 + bob, .26, .26, c.head);
        drawSpriteRect(this.x, this.y, 0, .42 + bob, .28, .08, c.hair);
        drawSpriteRect(this.x, this.y, -.06, .32 + bob, .04, .04, rgb(0,0,0));
        drawSpriteRect(this.x, this.y, .06, .32 + bob, .04, .04, rgb(0,0,0));
    }
}

// Game Functions
function explode(x,y,color) {
    for(let i=0;i<10;i++) particles.push(new Particle(x,y,color));
    AudioSys.explosion();
}
function addFloat(x,y,text,col) {
    const rect = canvas.getBoundingClientRect();
    const el=document.createElement('div');
    el.className='floater'; el.textContent=text;
    el.style.left=(rect.left+x)+'px';
    el.style.top=(rect.top+y)+'px';
    el.style.color=col;
    ui.layer.appendChild(el);
    setTimeout(()=>el.remove(),1000);
}
function checkExtraLife() {
    const every=25000;
    const current=Math.floor(state.score/every);
    const prev=Math.floor((state.score-100)/every);
    if(current>prev) {
        state.lives++;
        AudioSys.extraLife();
        addFloat(state.width/2,state.height/2,'EXTRA LIFE','#ff0');
    }
}
function spawnPos(minDist = 150) {
    let x, y, d;
    const margin = 25; // Prevents spawning flush against wall so Grunts are not trapped by Electrodes
    do {
        x = margin + Math.random() * (state.width - margin * 2);
        y = margin + Math.random() * (state.height - margin * 2);
        d = Math.hypot(x - player.x, y - player.y);
    } while(d < minDist);
    return {x, y};
}
function spawnWave() {
    enemies = []; humans = []; bullets = []; particles = [];
    state.rescueBonus = 0;
    state.warmup = 120;
    player.x = state.width/2;
    player.y = state.height/2;
    player.state = 'spawning';
    player.spawnDelay = 45;
    player.stateCount = 0;
    player.invuln = 120;
    const gruntCount = Math.min(12 + state.wave * 2, 35);
    const hulkCount = Math.min(3 + Math.floor(state.wave/2), 6);
    const brainCount = Math.min(2 + Math.floor(state.wave/3), 5);
    const electrodeCount = Math.min(5 + state.wave, 16);
    const humanCount = Math.min(3 + Math.floor(state.wave/2), 6);
    for (let i = 0; i < humanCount; i++) {
        humans.push(new AuthenticHuman(i % 3));
    }
    for (let i = 0; i < gruntCount; i++) {
        const p = spawnPos();
        enemies.push(new AuthenticGrunt(p.x, p.y));
    }
    for (let i = 0; i < hulkCount; i++) {
        const p = spawnPos();
        enemies.push(new AuthenticHulk(p.x, p.y));
    }
    for (let i = 0; i < brainCount; i++) {
        const p = spawnPos();
        enemies.push(new AuthenticBrain(p.x, p.y));
    }
    for (let i = 0; i < electrodeCount; i++) {
        const p = spawnPos(100);
        const e = new Entity(p.x, p.y, 9, '#ff0');
        e.type = 'electrode';
        e.score = 0;
        e.draw = function() {
            this.pulse = (this.pulse || 0) + 0.12;
            this.hue = (this.hue || 0) + 0.02;
            if (this.shape === undefined) this.shape = Math.floor(Math.random()*2);

            const p = .92 + Math.sin(this.pulse) * .08;
            const r = .55 * p;
            const dark  = hsl(this.hue, 1, .45);
            const light = hsl(this.hue, 1, .75);

            if (this.shape === 0) {
                drawSpriteRect(this.x, this.y, 0, 0, r*1.4, r*1.4, dark, Math.PI/4);
                drawSpriteRect(this.x, this.y, 0, 0, r*1.0, r*1.0, light, Math.PI/4);
            } else {
                ctx.save();
                ctx.translate(this.x, this.y);
                const poly = (radius, color) => {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    for (let i = 0; i < 3; i++) {
                        const a = Math.PI/2 + i * (2 * Math.PI / 3);
                        ctx.lineTo(Math.cos(a) * radius * SPRITE_SCALE, -Math.sin(a) * radius * SPRITE_SCALE);
                    }
                    ctx.closePath();
                    ctx.fill();
                };
                poly(r * 1.05, dark);
                poly(r * 0.7, light);
                ctx.restore();
            }
            drawSpriteRect(this.x, this.y, 0, 0, .22*p, .22*p, rgb(1,1,1));
        };
        enemies.push(e);
    }
    addFloat(state.width/2, state.height/3, `WAVE ${state.wave}`, '#0ff');
}
function killPlayer() {
    state.lives--;
    state.deathFlash = 18;
    player.state = 'dying';
    explode(player.x, player.y, '#0ff');
    AudioSys.explosion(true);
    bullets = [];
    if(state.lives <= 0) {
        state.running = false;
        if(state.score > state.highScore) {
            state.highScore = state.score;
            localStorage.setItem('robotron_high', state.highScore);
            ui.high.textContent = state.highScore.toLocaleString();
        }
        ui.final.textContent = state.score.toLocaleString();
        ui.over.classList.remove('hidden');
        Diagnostics.exportLog();
    } else {
        setTimeout(() => {
		    state.warmup = 150;
            player.x = state.width/2;
            player.y = state.height/2;
            player.state = 'spawning';
            player.spawnDelay = 30;
            player.stateCount = 0;
            player.invuln = 120;
            addFloat(state.width/2, state.height/2, 'RESURRECTION', '#0ff');
        }, 1000);
    }
}
function resolveCollision(circle1, circle2, push=true) {
    const dx = circle1.x - circle2.x;
    const dy = circle1.y - circle2.y;
    const dist = Math.hypot(dx, dy);
    const minDist = circle1.radius + circle2.radius;
    if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        if (push) {
            circle1.x += nx * overlap;
            circle1.y += ny * overlap;
        }
        return true;
    }
    return false;
}

let lastFrameTime = 0;
function update() {
    if(!state.running) return;
    const now = performance.now();
    if (now - lastFrameTime < 16.67) {
        requestAnimationFrame(update);
        return;
    }
    lastFrameTime = now;
    state.frames++;

    if (state.frames % Diagnostics.intervalFrames === 0) Diagnostics.recordState();

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, state.width, state.height);

    if (state.deathFlash > 0) {
        ctx.fillStyle = `rgba(255,0,0,${state.deathFlash / 18 * 0.45})`;
        ctx.fillRect(0, 0, state.width, state.height);
        state.deathFlash--;
    }

    if(state.warmup > 0) {
        state.warmup--;
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 40px Courier New';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 15; ctx.shadowColor = '#0ff';
        const msg = state.warmup > 60 ? "GET READY" : "GO!";
        ctx.fillText(msg, state.width/2, state.height/2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(state.width/2, state.height/2, 100, 0, Math.PI*2 * (state.warmup/120));
        ctx.stroke();
    }

    player.update();
    enemies.forEach(e => {
        if (e.type === 'electrode' && !e.marked) {
            resolveCollision(player, e, true);
        }
    });
    player.clamp();
    player.draw();

    bullets.forEach(b => b.update());
    bullets = bullets.filter(b => !b.marked);
    bullets.forEach(b => b.draw());

    humans.forEach(h => h.update());
    humans = humans.filter(h => !h.marked);
    humans.forEach(h => h.draw());

    enemies.forEach(e => {
        if (e.type !== 'electrode' && e.update) e.update();
    });
    enemies = enemies.filter(e => !e.marked);
    enemies.forEach(e => e.draw());

    particles.forEach(p => p.update());
    particles = particles.filter(p => p.life > 0.1);
    particles.forEach(p => p.draw());

    if (state.warmup <= 0 && player.state === 'normal') {
        bullets.forEach(b => {
            if(b.isEnemy) {
                if(player.dist(b) < player.radius + 3 && player.invuln <= 0) {
                    b.marked = true;
                    killPlayer();
                }
            } else {
                enemies.forEach(e => {
                    if(e.marked) return;
                    if(b.dist(e) < e.radius + 3) {
                        if(e.type === 'electrode') {
                            b.marked = true;
                        } else {
                            b.marked = true;
                            if(e.hit && e.hit(b)) {
                                state.score += (e.score || 100);
                                addFloat(e.x, e.y, (e.score || 100).toString(), '#fff');
                                checkExtraLife();
                            }
                        }
                    }
                });
            }
        });
        enemies.forEach(e => {
            if(e.type === 'electrode') return;
            if(player.dist(e) < e.radius + player.radius && player.invuln <= 0) {
                killPlayer();
            }
        });
    }

    const remaining = enemies.filter(e => ['grunt', 'brain', 'prog'].includes(e.type)).length;
    if(remaining === 0 && state.running && state.warmup <= 0) {
        state.wave++;
        ui.wave.textContent = state.wave;
        spawnWave();
    }

    ui.score.textContent = state.score.toLocaleString();
    ui.lives.textContent = state.lives;
    requestAnimationFrame(update);
}

function startGame() {
    AudioSys.init();
    // Clear any input that may have latched true between matches (e.g. a fire
    // button whose release event was swallowed by the game-over overlay).
    for (const key in keys) keys[key] = false;
    document.querySelectorAll('.shoot-btn').forEach(b => b.classList.remove('active'));
    state.running = true;
    state.score = 0;
    state.lives = 3;
    state.wave = 1;
    state.frames = 0;
    Diagnostics.clear();
    ui.score.textContent = '0';
    ui.wave.textContent = '1';
    ui.lives.textContent = '3';
    ui.start.classList.add('hidden');
    ui.over.classList.add('hidden');
    player = new AuthenticPlayer();
    spawnWave();
    update();
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
resize();
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, state.width, state.height);
