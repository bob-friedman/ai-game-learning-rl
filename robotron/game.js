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
        const t = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'square';
        osc1.frequency.setValueAtTime(1600, t);
        osc1.frequency.exponentialRampToValueAtTime(100, t + 0.12);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(1200, t);
        osc2.frequency.exponentialRampToValueAtTime(80, t + 0.12);

        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.12);
        osc2.stop(t + 0.12);
    },
    explosion: function(large=false) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const dur = large ? 0.5 : 0.25;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(large ? 1000 : 1500, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + dur);
        filter.Q.value = 1;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(large ? 0.4 : 0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(t);
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
    rescueBonus: 1000,
    warmup: 0,
    deathFlash: 0
};
let player, bullets = [], enemies = [], humans = [], particles = [];

// Diagnostics System - logs periodic game-state snapshots for AI/QA analysis
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

// Wave Configuration Definition
const WAVES = [
    { Grunt: 10, Hulk: 4, Brain: 0, Daddy: 2, Mommy: 2, Mikey: 2, Electrode: 5 },
    { Grunt: 15, Hulk: 5, Brain: 0, Daddy: 3, Mommy: 3, Mikey: 2, Electrode: 6 },
    { Grunt: 20, Hulk: 6, Brain: 0, Daddy: 3, Mommy: 3, Mikey: 3, Electrode: 7 },
    { Grunt: 25, Hulk: 6, Brain: 1, Daddy: 4, Mommy: 4, Mikey: 3, Electrode: 8 },
    { Grunt: 30, Hulk: 7, Brain: 2, Daddy: 5, Mommy: 5, Mikey: 4, Electrode: 9 },
    { Grunt: 30, Hulk: 7, Brain: 3, Daddy: 5, Mommy: 5, Mikey: 4, Electrode: 10 },
    { Grunt: 30, Hulk: 8, Brain: 3, Daddy: 5, Mommy: 5, Mikey: 4, Electrode: 11 },
    { Grunt: 30, Hulk: 7, Brain: 5, Daddy: 6, Mommy: 6, Mikey: 5, Electrode: 12 }
];

function getWaveConfig(waveNum) {
    // Tanks appear every fourth level instead of every fifth
    if (waveNum % 4 === 0) {
        let scaling = Math.floor(waveNum / 4);
        return {
            Grunt: 0, Hulk: 0, Brain: 0, Tank: 8 + (scaling * 2),
            Daddy: 2, Mommy: 2, Mikey: 2, Electrode: 8 + (scaling * 2)
        };
    }
    let idx = Math.min(waveNum - 1, WAVES.length - 1);
    let base = { ...WAVES[idx], Tank: 0 };
    if (waveNum > WAVES.length) {
        let extra = waveNum - WAVES.length;
        base.Grunt += extra * 5;
        base.Hulk += Math.floor(extra / 2);
        base.Brain += Math.floor(extra / 3);
        base.Electrode += Math.floor(extra);
    }
    return base;
}

// Sprite Asset Manager
const SPRITE_DEFS = {
    player: { w: 14, h: 24, frames: 4, delay: 2 },
    grunt:  { w: 18, h: 27, frames: 3, delay: 10 },
    hulk:   { w: 26, h: 32, frames: 3, delay: 9 },
    brain:  { w: 24, h: 24, frames: 3, delay: 10 },
    prog:   { w: 24, h: 24, frames: 3, delay: 10 },
    tank:   { w: 26, h: 32, frames: 4, delay: 10 },
    daddy:  { w: 16, h: 26, frames: 3, delay: 9 },
    mommy:  { w: 14, h: 28, frames: 3, delay: 9 },
    mikey:  { w: 10, h: 22, frames: 3, delay: 9 }
};

const ImageCache = {
    images: {},
    load: function() {
        const paths = {
            player: './assets/sprites/actors/player.png',
            grunt:  './assets/sprites/actors/enemies/grunt.png',
            hulk:   './assets/sprites/actors/enemies/hulk.png',
            brain:  './assets/sprites/actors/enemies/brain.png',
            prog:   './assets/sprites/actors/enemies/prog.png',
            tank:   './assets/sprites/actors/enemies/tank.png',
            daddy:  './assets/sprites/actors/humans/daddy.png',
            mommy:  './assets/sprites/actors/humans/mommy.png',
            mikey:  './assets/sprites/actors/humans/mikey_alt.png'
        };
        for (let key in paths) {
            let img = new Image();
            img.src = paths[key];
            this.images[key] = img;
        }
    },
    draw: function(ctx, type, x, y, frameTimer, customY = 0) {
        const img = this.images[type];
        if (img && img.complete && img.naturalWidth > 0) {
            const def = SPRITE_DEFS[type];
            let frameIdx = Math.floor(frameTimer / def.delay) % def.frames;
            let frameX = frameIdx * (def.w + 2);
            let drawW = def.w * 1.5;
            let drawH = def.h * 1.5;
            ctx.drawImage(img, frameX, customY, def.w, def.h, x - drawW / 2, y - drawH / 2, drawW, drawH);
            return true;
        }
        return false;
    }
};

const keys = {};

// Canvas Helpers
const SPRITE_SCALE = 20;
function rgb(r, g, b, a = 1) { return `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${a})`; }
function hsl(h, s, l, a = 1) { return `hsla(${Math.floor(h * 360)}, ${Math.floor(s * 100)}%, ${Math.floor(l * 100)}%, ${a})`; }
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
    keys[e.key] = true; keys[e.code] = true;
});
window.addEventListener('keyup', e => {
    keys[e.key] = false; keys[e.code] = false;
});

// Mobile joystick
const joystick = document.getElementById('joystick');
const stickHandle = joystick.querySelector('.joystick-handle');
let joyActive = false, joyId = null, joyX = 0, joyY = 0;
function handleJoyStart(e) { e.preventDefault(); joyActive = true; const touch = e.changedTouches[0]; joyId = touch.identifier; updateJoystick(touch); }
function handleJoyMove(e) { if (!joyActive) return; e.preventDefault(); for (let t of e.changedTouches) { if (t.identifier === joyId) { updateJoystick(t); break; } } }
function handleJoyEnd(e) { for (let t of e.changedTouches) { if (t.identifier === joyId) { joyActive = false; joyX = 0; joyY = 0; stickHandle.style.transform = `translate(-50%, -50%)`; keys['KeyW'] = keys['KeyS'] = keys['KeyA'] = keys['KeyD'] = false; break; } } }
function updateJoystick(touch) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    let dx = touch.clientX - cx, dy = touch.clientY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy), max = rect.width/2 - 20;
    if (dist > max) { dx = (dx/dist)*max; dy = (dy/dist)*max; }
    stickHandle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joyX = dx/max; joyY = dy/max;
    keys['KeyW'] = joyY < -0.3; keys['KeyS'] = joyY > 0.3; keys['KeyA'] = joyX < -0.3; keys['KeyD'] = joyX > 0.3;
}
joystick.addEventListener('touchstart', handleJoyStart, {passive:false});
joystick.addEventListener('touchmove', handleJoyMove, {passive:false});
joystick.addEventListener('touchend', handleJoyEnd);
joystick.addEventListener('mousedown', (e) => { joyActive=true; updateJoystick({clientX:e.clientX,clientY:e.clientY}); });
document.addEventListener('mousemove', (e) => { if(joyActive) updateJoystick({clientX:e.clientX,clientY:e.clientY}); });
document.addEventListener('mouseup', () => { joyActive=false; joyX=joyY=0; stickHandle.style.transform=`translate(-50%,-50%)`; keys['KeyW']=keys['KeyS']=keys['KeyA']=keys['KeyD']=false; });

document.querySelectorAll('.shoot-btn').forEach(btn => {
    const dir = btn.dataset.dir;
    const keyMap = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
    const k = keyMap[dir];
    ['touchstart','mousedown'].forEach(evt => { btn.addEventListener(evt, (e) => { e.preventDefault(); keys[k]=true; btn.classList.add('active'); }); });
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(evt => { btn.addEventListener(evt, (e) => { e.preventDefault(); keys[k]=false; btn.classList.remove('active'); }); });
});
function releaseFireButtons() {
    keys['ArrowUp'] = keys['ArrowDown'] = keys['ArrowLeft'] = keys['ArrowRight'] = false;
    document.querySelectorAll('.shoot-btn').forEach(b => b.classList.remove('active'));
}
['mouseup','touchend','touchcancel','blur'].forEach(evt => { window.addEventListener(evt, releaseFireButtons); });

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
    checkCollision(x, y) {
        for (let e of enemies) {
            if (e.type === 'electrode' && !e.marked) {
                if (Math.hypot(x - e.x, y - e.y) < this.radius + e.radius) return true;
            }
        }
        return false;
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
    update() { this.x+=this.vx; this.y+=this.vy; this.vx*=0.95; this.vy*=0.95; this.life*=this.decay; }
    draw() { ctx.globalAlpha=this.life; ctx.fillStyle=this.color; ctx.fillRect(this.x-2,this.y-2,4,4); ctx.globalAlpha=1; }
}
class Bullet extends Entity {
    constructor(x,y,dx,dy,isEnemy=false) {
        super(x,y,3,isEnemy?'#f0f':'#ff0');
        this.dx=dx; this.dy=dy; this.speed=isEnemy?3:10; this.isEnemy=isEnemy;
        this.isBounceBomb = false;
        this.life = 300;
    }
    update() {
        this.x += this.dx * this.speed;
        this.y += this.dy * this.speed;

        if (this.isBounceBomb) {
            this.life--;
            if (this.life <= 0) this.marked = true;
            if (this.x <= this.radius || this.x >= state.width - this.radius) {
                this.dx *= -1; this.x = Math.max(this.radius, Math.min(state.width - this.radius, this.x));
            }
            if (this.y <= this.radius || this.y >= state.height - this.radius) {
                this.dy *= -1; this.y = Math.max(this.radius, Math.min(state.height - this.radius, this.y));
            }
        } else {
            for (let e of enemies) {
                if (e.type === 'electrode' && !e.marked) {
                    if (this.dist(e) < e.radius + 3) {
                        this.marked = true;
                        for(let i=0; i<3; i++) particles.push(new Particle(this.x, this.y, '#ff0', 2));
                        return;
                    }
                }
            }
            if(this.x<0 || this.x>state.width || this.y<0 || this.y>state.height) this.marked=true;
        }

        if (this.isEnemy) {
            this.spinAngle = (this.spinAngle || 0) + 0.35;
            this.phase = (this.phase || 0) + 0.12;
        } else {
            this.huePhase = (this.huePhase || 0) + 0.08;
        }
    }
    draw() {
        if (this.isBounceBomb) {
            const spin = this.spinAngle || 0;
            const pulse = 0.5 + Math.sin((this.phase || 0) * 2) * 0.5;
            // Dark metal bomb casing
            drawSpriteEllipse(this.x, this.y, 0, 0, .52, .52, '#161616');
            drawSpriteEllipse(this.x, this.y, 0, 0, .44, .44, '#3c3c3c');
            // Molten/charged core that pulses as it rolls
            drawSpriteEllipse(this.x, this.y, 0, 0, .27, .27, `rgb(${230 + Math.floor(pulse*25)}, ${70 + Math.floor(pulse*70)}, 20)`);
            drawSpriteEllipse(this.x, this.y, 0, 0, .12, .12, rgb(1, .95, .75));
            // Three riveted highlights that spin with the bomb's travel for a rolling read
            for (let i = 0; i < 3; i++) {
                const a = spin + i * (Math.PI * 2 / 3);
                drawSpriteEllipse(this.x, this.y, Math.cos(a) * .33, Math.sin(a) * .33, .075, .075, '#777');
            }
            // Specular glint, fixed relative to screen for a glossy sphere feel
            drawSpriteEllipse(this.x, this.y, -.16, .16, .1, .1, 'rgba(255,255,255,0.5)');
        } else if (this.isEnemy) {
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

// Actors
class AuthenticPlayer extends Entity {
    constructor() {
        super(state.width/2, state.height/2, 8, '#0ff');
        this.type = 'player';
        this.state = 'spawning';
        this.stateCount = 0;
        this.spawnDelay = 45;
        this.invuln = 0;
        this.cooldown = 0;
        this.spritesheetY = 0;
        this.frameTimer = 0;
        this.aimX = 1;
        this.aimY = 0;
    }
    update() {
        if (this.state === 'spawning') {
            if (this.spawnDelay > 0) { this.spawnDelay--; return; }
            this.stateCount++;
            if (this.stateCount >= 90) { this.state = 'normal'; this.invuln = 60; }
            return;
        }
        if (this.invuln > 0) this.invuln--;
        const speed = 3.8;
        this.vx = 0; this.vy = 0;
        if (keys['KeyW'] || keys['w']) { this.vy = -speed; this.spritesheetY = 26; }
        if (keys['KeyS'] || keys['s']) { this.vy = speed; this.spritesheetY = 0; }
        if (keys['KeyA'] || keys['a']) { this.vx = -speed; this.spritesheetY = 51; }
        if (keys['KeyD'] || keys['d']) { this.vx = speed; this.spritesheetY = 75; }
        this.x += this.vx; this.y += this.vy;
        this.clamp();
        if (this.vx !== 0 || this.vy !== 0) this.frameTimer++;

        if (this.cooldown > 0) this.cooldown--;
        let sx = 0, sy = 0;
        if (keys['ArrowUp']) sy = -1; if (keys['ArrowDown']) sy = 1;
        if (keys['ArrowLeft']) sx = -1; if (keys['ArrowRight']) sx = 1;
        if ((sx !== 0 || sy !== 0)) {
            const len = Math.hypot(sx, sy);
            this.aimX = sx/len;
            this.aimY = sy/len;
            if (this.cooldown <= 0) {
                bullets.push(new Bullet(this.x, this.y, this.aimX, this.aimY, false));
                this.cooldown = 7;
                AudioSys.shoot();
            }
        }
    }
    draw() {
        if (this.state === 'spawning') {
            ctx.fillStyle = `rgba(0,255,255,${0.5 + Math.sin(state.frames*0.5)*0.3})`;
            ctx.fillRect(this.x-6, this.y-6, 12, 12); return;
        }
        if (this.state === 'dying') {
            const flash = Math.floor(state.frames / 2) % 2;
            const size = 6 + Math.abs(Math.sin(state.frames * 0.4)) * 6;
            ctx.fillStyle = flash ? '#fff' : '#f00';
            ctx.fillRect(this.x - size/2, this.y - size/2, size, size); return;
        }
        const isInvuln = this.invuln > 0;
        if (isInvuln && Math.floor(state.frames / 4) % 2 === 0) return;

        if (ImageCache.draw(ctx, this.type, this.x, this.y, this.frameTimer, this.spritesheetY)) return;

        // Procedural Fallback (Authentic arcade sci-fi look)
        const walkPhase = this.frameTimer * 0.15;
        const phase = Math.sin(walkPhase);
        const bob = phase * .05, legStretch = phase * .06;
        const hue = isInvuln ? (state.frames * .05) % 1 : 0;

        const body = isInvuln ? hsl(hue, 1, .7) : '#e65c00'; // Orange torso
        const legs = isInvuln ? hsl((hue + .5)%1, 1, .5) : '#0055aa'; // Blue legs/armor
        const helmet = isInvuln ? hsl((hue + .2)%1, 1, .6) : '#dddddd'; // Light gray helmet
        const visor = isInvuln ? hsl((hue + .8)%1, 1, .5) : '#00ffff'; // Cyan visor

        const bodyCenterY = -.02 + bob, bodyBottomY = bodyCenterY - .275;

        // Shadow
        drawSpriteRect(this.x, this.y, 0, -.5, .6, .12, 'rgba(0,0,0,0.4)');

        // Legs
        const baseLegH = .3, leftLegH = baseLegH + legStretch, rightLegH = baseLegH - legStretch;
        drawSpriteRect(this.x, this.y, -.15, bodyBottomY - leftLegH/2, .2, leftLegH, legs);
        drawSpriteRect(this.x, this.y, .15, bodyBottomY - rightLegH/2, .2, rightLegH, legs);

        // Torso
        drawSpriteRect(this.x, this.y, 0, bodyCenterY, .5, .5, body);

        // Shoulders/Armor accents
        drawSpriteRect(this.x, this.y, 0, bodyCenterY + .15, .6, .2, legs);

        // Head (Helmet)
        drawSpriteRect(this.x, this.y, 0, .4 + bob, .45, .45, helmet);
        // Visor
        drawSpriteRect(this.x, this.y, 0, .45 + bob, .35, .15, visor);

        // Gun arm / weapon
        const aimAng = Math.atan2(this.aimY, this.aimX);
        ctx.save();
        ctx.translate(this.x, this.y - bodyCenterY * SPRITE_SCALE);
        ctx.rotate(aimAng);
        ctx.fillStyle = '#444';
        ctx.fillRect(0, -4, 15, 8); // Gun barrel
        ctx.fillStyle = '#0ff';
        ctx.fillRect(11, -2, 4, 4); // Glowing tip
        ctx.restore();
    }
}

class AuthenticGrunt extends Entity {
    constructor(x, y) {
        super(x, y, 8, '#f00');
        this.type = 'grunt';
        this.moveCount = Math.floor(Math.random() * 60);
        this.dx = 0; this.dy = 0;
        this.score = 100;
        this.frameTimer = 0;
    }
    getSpeed() { return 0.75 + (((state.wave - 1) % 5) * 0.07); }
    update() {
        if (state.warmup > 0) return;
        for (let e of enemies) {
            if (e.type === 'electrode' && !e.marked) {
                const dist = Math.hypot(this.x - e.x, this.y - e.y);
                const minDist = this.radius + e.radius;
                if (dist < minDist) {
                    const angle = Math.atan2(this.y - e.y, this.x - e.x);
                    const pushDist = minDist - dist + 2;
                    this.x += Math.cos(angle) * pushDist; this.y += Math.sin(angle) * pushDist;
                    this.clamp(); break;
                }
            }
        }
        let speed = this.getSpeed();
        if (this.moveCount > 30) speed *= (30 / this.moveCount);
        if (Math.floor(this.moveCount) === 1) {
            this.dx = Math.abs(player.x - this.x) < 4 ? 0 : (player.x > this.x ? 1 : -1);
            this.dy = Math.abs(player.y - this.y) < 4 ? 0 : (player.y > this.y ? 1 : -1);
        }
        const desiredX = this.x + (this.dx * speed), desiredY = this.y + (this.dy * speed);
        if (!this.checkCollision(desiredX, desiredY)) { this.x = desiredX; this.y = desiredY; }
        else {
            if (this.dx !== 0 && !this.checkCollision(desiredX, this.y)) this.x = desiredX;
            else if (this.dy !== 0 && !this.checkCollision(this.x, desiredY)) this.y = desiredY;
            else {
                let perpX = -this.dy * speed, perpY = this.dx * speed;
                if (perpX === 0) perpX = speed;
                if (perpY === 0) perpY = speed;
                if (!this.checkCollision(this.x + perpX, this.y + perpY)) { this.x += perpX; this.y += perpY; }
                else if (!this.checkCollision(this.x - perpX, this.y - perpY)) { this.x -= perpX; this.y -= perpY; }
            }
        }
        this.clamp();
        this.moveCount = (this.moveCount + 1) % 40;
        this.frameTimer++;

        for (let other of enemies) {
            if (other === this || other.type !== 'grunt' || other.marked) continue;
            const sx = this.x - other.x, sy = this.y - other.y, sd = Math.hypot(sx, sy);
            const minSep = this.radius + other.radius - 2;
            if (sd < minSep) {
                if (sd === 0) { this.x += (Math.random() - 0.5) * 2; this.y += (Math.random() - 0.5) * 2; }
                else { const push = (minSep - sd) * 0.25; this.x += (sx / sd) * push; this.y += (sy / sd) * push; }
            }
        }
        this.clamp();
    }
    draw() {
        if (ImageCache.draw(ctx, this.type, this.x, this.y, this.frameTimer, 0)) return;

        // Brightened Scrap Drone Redesign
        const hoverPhase = this.frameTimer * 0.1;
        const float = Math.sin(hoverPhase) * 0.1;
        const bob = float;

        // Much brighter, pop-out arcade colors
        const metal = '#aaccdd', darkMetal = '#667788', rust = '#ee6622', glow = '#ffaa00';

        // Shadow
        drawSpriteRect(this.x, this.y, 0, -.6, .7, .15, 'rgba(0,0,0,0.3)');

        // Hover exhaust plume
        const exhaustH = .3 + Math.random() * .2;
        drawSpriteRect(this.x, this.y, 0, -.4 + bob, .15, exhaustH, 'rgba(0, 255, 255, 0.6)');
        drawSpriteRect(this.x, this.y, 0, -.4 + bob, .08, exhaustH, '#fff');

        // Main Body (Round/Chunky shell)
        drawSpriteRect(this.x, this.y, 0, 0 + bob + float, .55, .55, darkMetal);
        drawSpriteRect(this.x, this.y, 0, 0 + bob + float, .45, .45, metal);

        // Rusty side thrusters / shoulder pads
        drawSpriteRect(this.x, this.y, -.3, .2 + bob + float, .15, .3, rust);
        drawSpriteRect(this.x, this.y, .3, .2 + bob + float, .15, .3, rust);

        // Central Eye / Scanner (Cylon style)
        const scannerX = Math.sin(this.frameTimer * 0.15) * 0.15;
        drawSpriteRect(this.x, this.y, 0, .1 + bob + float, .35, .15, '#400');
        drawSpriteRect(this.x, this.y, scannerX, .1 + bob + float, .12, .1, glow);

        // Spiky arms/antennae reaching forward
        drawSpriteRect(this.x, this.y, -.4, -.1 + bob + float, .08, .35, darkMetal);
        drawSpriteRect(this.x, this.y, .4, -.1 + bob + float, .08, .35, darkMetal);
    }
    hit() { this.marked = true; explode(this.x, this.y, '#ffaa00'); return true; }
}

class AuthenticHulk extends Entity {
    constructor(x, y) {
        super(x, y, 12, '#0f0');
        this.type = 'hulk';
        this.pauseCount = 0;
        this.frameTimer = 0;
        this.targetAngle = Math.random() * Math.PI * 2;
        this.spritesheetY = 0;
    }
    update() {
        if (state.warmup > 0) return;
        if (this.pauseCount > 0) { this.pauseCount--; return; }

        if (Math.random() < 0.02) this.targetAngle += (Math.random() - 0.5) * 2;

        const dx = Math.cos(this.targetAngle) * 0.9;
        const dy = Math.sin(this.targetAngle) * 0.9;
        this.x += dx; this.y += dy;

        if (Math.abs(dx) > Math.abs(dy)) {
            this.spritesheetY = dx > 0 ? 65 : 33;
        } else {
            this.spritesheetY = 0;
        }

        this.frameTimer++;
        if (this.x <= this.radius || this.x >= state.width - this.radius) this.targetAngle = Math.PI - this.targetAngle;
        if (this.y <= this.radius || this.y >= state.height - this.radius) this.targetAngle = -this.targetAngle;
        this.clamp();
        humans.forEach(h => {
            if (this.dist(h) < this.radius + h.radius - 2) {
                h.marked = true; explode(h.x, h.y, '#f8c');
                AudioSys.humanDie(); addFloat(h.x, h.y, 'CRUSHED', '#f00');
            }
        });
    }
    draw() {
        if (ImageCache.draw(ctx, this.type, this.x, this.y, this.frameTimer, this.spritesheetY)) return;

        const walkPhase = this.frameTimer * 0.15;
        const stride = Math.sin(walkPhase * Math.PI);
        const isLeft = stride > 0;
        const bodyBob = Math.abs(stride) * 0.06;

        const green = '#0f0', red = '#f00', darkRed = '#b00', black = '#000';

        // Shadow
        drawSpriteRect(this.x, this.y, 0, -.7, 1.1, .15, 'rgba(0,0,0,0.4)');

        // Stomping Legs (Red)
        const leftLegY = isLeft ? -.45 : -.55;
        const rightLegY = !isLeft ? -.45 : -.55;
        const leftFootX = isLeft ? -.35 : -.25;
        const rightFootX = !isLeft ? .35 : .25;

        // Left Leg & Foot
        drawSpriteRect(this.x, this.y, -.25, leftLegY, .2, .3, darkRed);
        drawSpriteRect(this.x, this.y, leftFootX, leftLegY - .15, .3, .15, red);

        // Right Leg & Foot
        drawSpriteRect(this.x, this.y, .25, rightLegY, .2, .3, darkRed);
        drawSpriteRect(this.x, this.y, rightFootX, rightLegY - .15, .3, .15, red);

        // Massive Body (Bright Green Block)
        drawSpriteRect(this.x, this.y, 0, -.05 + bodyBob, .9, .75, green);

        // Slight shoulder protrusions to break up the perfect square
        drawSpriteRect(this.x, this.y, -.45, -.05 + bodyBob, .1, .6, green);
        drawSpriteRect(this.x, this.y, .45, -.05 + bodyBob, .1, .6, green);

        // Head & Neck (Red)
        drawSpriteRect(this.x, this.y, 0, .35 + bodyBob, .2, .15, darkRed); // neck
        drawSpriteRect(this.x, this.y, 0, .48 + bodyBob, .35, .25, red); // head

        // Hollow/Dark Eye slits for a menacing look
        drawSpriteRect(this.x, this.y, -.08, .5 + bodyBob, .08, .1, black);
        drawSpriteRect(this.x, this.y, .08, .5 + bodyBob, .08, .1, black);
    }
    hit(by) {
        const push = 20, dist = this.dist(by);
        if (dist > 0) { this.x -= (by.x - this.x) / dist * push; this.y -= (by.y - this.y) / dist * push; }
        this.pauseCount = 4; this.clamp(); return false;
    }
}

class AuthenticBrain extends Entity {
    constructor(x, y) {
        super(x, y, 11, '#c0f');
        this.type = 'brain';
        this.moveCount = 0; this.shootTimer = 60;
        this.dir = 0; this.lastDir = -1; this.detourDir = -1;
        this.score = 500; this.frameTimer = 0;
    }
    update() {
        if (state.warmup > 0) return;
        enemies.forEach(e => {
            if (e.type === 'electrode' && !e.marked) {
                const dist = this.dist(e), minD = this.radius + e.radius;
                if (dist < minD && dist > 0) {
                    const angle = Math.atan2(this.y - e.y, this.x - e.x), pushDist = minD - dist + 1;
                    this.x += Math.cos(angle) * pushDist; this.y += Math.sin(angle) * pushDist;
                    this.clamp();
                }
            }
        });
        const dirs = [{x:0,y:-1}, {x:1,y:0}, {x:0,y:1}, {x:-1,y:0}];
        const speed = 1.4;
        if (this.moveCount > 0) {
            const d = dirs[this.dir], desiredX = this.x + d.x * speed, desiredY = this.y + d.y * speed;
            const preX = this.x, preY = this.y;
            if (!this.checkCollision(desiredX, desiredY)) {
                this.x = desiredX; this.y = desiredY; this.moveCount -= speed; this.clamp();
                if (this.x === preX && this.y === preY) this.moveCount = 0;
            } else this.moveCount = 0;
            this.frameTimer++;
        } else {
            this.moveCount = 14;
            let target = player;
            if (humans.length > 0) {
                let minDist = Infinity;
                humans.forEach(h => { let d = this.dist(h); if (d < minDist) { minDist = d; target = h; } });
            }
            const dx = target.x - this.x, dy = target.y - this.y;
            let primaryDir, secondaryDir;
            if (Math.abs(dx) > Math.abs(dy)) { primaryDir = dx > 0 ? 1 : 3; secondaryDir = dy > 0 ? 2 : 0; }
            else { primaryDir = dy > 0 ? 2 : 0; secondaryDir = dx > 0 ? 1 : 3; }
            const probeDir = (dirIndex) => {
                const d = dirs[dirIndex];
                if (d.x !== 0) { const wallX = this.x + d.x * 4; if (wallX <= this.radius || wallX >= state.width - this.radius) return 2; }
                if (d.y !== 0) { const wallY = this.y + d.y * 4; if (wallY <= this.radius || wallY >= state.height - this.radius) return 2; }
                let result = 0;
                for (let step = 4; step <= 28; step += 8) {
                    const testX = this.x + d.x * step, testY = this.y + d.y * step;
                    for (let e of enemies) {
                        if (e.type === 'electrode' && !e.marked) {
                            if (Math.hypot(testX - e.x, testY - e.y) < this.radius + e.radius + 1) {
                                if (step <= 12) return 2; result = 1;
                            }
                        }
                    }
                }
                return result;
            };
            const pPrimary = probeDir(primaryDir);
            if (pPrimary === 0) { this.dir = primaryDir; this.detourDir = -1; }
            else if (this.detourDir >= 0 && probeDir(this.detourDir) === 0) { this.dir = this.detourDir; }
            else {
                const reverseDir = this.lastDir >= 0 ? (this.lastDir + 2) % 4 : -1;
                const candidates = [secondaryDir, (secondaryDir + 2) % 4, (primaryDir + 2) % 4];
                let chosen = -1;
                for (const c of candidates) { if (c !== reverseDir && probeDir(c) === 0) { chosen = c; break; } }
                if (chosen < 0) { for (const c of candidates) { if (probeDir(c) === 0) { chosen = c; break; } } }
                if (chosen < 0 && pPrimary === 1) chosen = primaryDir;
                if (chosen < 0) { for (const c of candidates) { if (c !== reverseDir && probeDir(c) === 1) { chosen = c; break; } } }
                if (chosen < 0) { for (const c of candidates) { if (probeDir(c) === 1) { chosen = c; break; } } }
                if (chosen < 0) chosen = Math.floor(Math.random() * 4);
                this.dir = chosen; this.detourDir = chosen;
            }
            this.lastDir = this.dir;
        }
        humans.forEach(h => {
            if (this.dist(h) <= this.radius + h.radius - 2) {
                h.marked = true; explode(h.x, h.y, '#f0f');
                AudioSys.playTone(200, 'sawtooth', 0.3, 0.2); addFloat(h.x, h.y, 'CONVERTED', '#f0f');
                enemies.push(new AuthenticProg(h.x, h.y));
            }
        });
        if (this.shootTimer-- <= 0) {
            this.shootTimer = 100 + Math.random() * 40;
            const dx = player.x - this.x, dy = player.y - this.y, dist = Math.hypot(dx, dy);
            if (dist > 0 && dist < 300) {
                const b = new Bullet(this.x, this.y, dx/dist, dy/dist, true);
                b.speed = 3; bullets.push(b); AudioSys.playTone(300, 'sawtooth', 0.3, 0.1);
            }
        }
    }
    draw() {
        if (ImageCache.draw(ctx, this.type, this.x, this.y, this.frameTimer, 0)) return;

        const floatPhase = this.frameTimer * 0.08;
        const pulsePhase = this.frameTimer * 0.12;
        const bob = Math.sin(floatPhase) * 0.15; // Smooth hovering
        const pulse = 1 + Math.sin(pulsePhase) * 0.06; // Throbbing brain matter

        const blue = '#00f', purple = '#a2f', green = '#0f0', black = '#000';

        // Shadow (shrinks/grows as the brain bobs up and down)
        drawSpriteRect(this.x, this.y, 0, -.7, .7 * (1 - bob), .15, 'rgba(0,0,0,0.4)');

        // Base/Stem (Blue)
        drawSpriteRect(this.x, this.y, 0, -.2 + bob, .35, .3, blue);
        drawSpriteRect(this.x, this.y, 0, 0 + bob, .55, .2, blue);

        // Face Area (Blue base)
        drawSpriteRect(this.x, this.y, 0, .15 + bob, .65, .3, blue);

        // Glowing Green Eyes
        drawSpriteRect(this.x, this.y, -.18, .2 + bob, .15, .1, green);
        drawSpriteRect(this.x, this.y, .18, .2 + bob, .15, .1, green);

        // Glowing Green Mouth Slit
        drawSpriteRect(this.x, this.y, 0, 0 + bob, .3, .08, green);

        // Brain Matter (Pulsating Purple/Blue overlapping lobes)
        drawSpriteEllipse(this.x, this.y, -.25, .45 + bob, .4 * pulse, .3 * pulse, purple);
        drawSpriteEllipse(this.x, this.y, .25, .45 + bob, .4 * pulse, .3 * pulse, purple);
        drawSpriteEllipse(this.x, this.y, 0, .55 + bob, .45 * pulse, .25 * pulse, blue);
        drawSpriteEllipse(this.x, this.y, 0, .35 + bob, .35 * pulse, .2 * pulse, purple);

        // Dark Texture Nodes (The "dots" in the reference)
        drawSpriteRect(this.x, this.y, -.25, .45 + bob, .08 * pulse, .08 * pulse, black);
        drawSpriteRect(this.x, this.y, .25, .5 + bob, .08 * pulse, .08 * pulse, black);
        drawSpriteRect(this.x, this.y, 0, .4 + bob, .08 * pulse, .08 * pulse, black);
        drawSpriteRect(this.x, this.y, -.1, .6 + bob, .06 * pulse, .06 * pulse, black);
        drawSpriteRect(this.x, this.y, .15, .35 + bob, .08 * pulse, .08 * pulse, black);
        drawSpriteRect(this.x, this.y, -.35, .35 + bob, .06 * pulse, .06 * pulse, black);
    }
    hit() { this.marked = true; explode(this.x, this.y, '#c0f'); return true; }
}

class AuthenticProg extends Entity {
    constructor(x, y) {
        super(x, y, 7, '#d08');
        this.type = 'prog';
        this.score = 100;
        this.frameTimer = 0; this.eyePulse = 0; this.huePhase = 0;
    }
    update() {
        if (state.warmup > 0) return;
        const dx = player.x - this.x, dy = player.y - this.y, dist = Math.hypot(dx, dy);
        if (dist > 0) { this.x += (dx/dist) * 1.8; this.y += (dy/dist) * 1.8; }
        this.frameTimer++; this.eyePulse += 0.3; this.huePhase += 0.06;
        if (state.frames % 3 === 0) {
            const c = hsl((this.huePhase + Math.random()*0.2 - 0.1) % 1, 1, 0.65);
            particles.push(new Particle(this.x + (Math.random()-0.5)*10, this.y + (Math.random()-0.5)*10, c, 1));
        }
        this.clamp();
    }
    draw() {
        if (ImageCache.draw(ctx, this.type, this.x, this.y, this.frameTimer, 0)) return;
        const walkPhase = this.frameTimer * 0.2;
        const bob = Math.sin(walkPhase) * .12, armSwing = Math.sin(walkPhase * .8) * .18;
        const flicker = ((state.frames >> 2) & 1) === 0;
        const c = flicker ? rgb(1, 1, 1) : hsl(this.huePhase, 1, .65), dark = rgb(.55, .05, .45);
        const skin = flicker ? rgb(1, 1, 1) : hsl((this.huePhase + .15) % 1, .85, .55);
        const eyeGlow = (Math.sin(this.eyePulse) * .5 + .5) * .5 + .5;
        drawSpriteRect(this.x, this.y, 0, -.5, .5, .1, 'rgba(0,0,0,0.45)');
        drawSpriteRect(this.x, this.y, -.13, -.35 + bob, .15, .3, dark);
        drawSpriteRect(this.x, this.y, .13, -.35 - bob, .15, .3, dark);
        drawSpriteRect(this.x, this.y, 0, -.02, .46, .46, c);
        drawSpriteRect(this.x, this.y, -.38, .15 + armSwing*.3, .17, .4, c);
        drawSpriteRect(this.x, this.y, .38, .15 - armSwing*.3, .17, .4, c);
        drawSpriteEllipse(this.x, this.y, 0, .35, .17, .17, skin);
        drawSpriteRect(this.x, this.y, 0, .51, .36, .1, dark);
        drawSpriteRect(this.x, this.y, -.09, .36, .13, .14, rgb(0,0,0));
        drawSpriteRect(this.x, this.y, .09, .36, .13, .14, rgb(0,0,0));
        drawSpriteRect(this.x, this.y, -.09, .37, .1, .1, rgb(1, eyeGlow, .1));
        drawSpriteRect(this.x, this.y, .09, .37, .1, .1, rgb(1, eyeGlow, .1));
        drawSpriteRect(this.x, this.y, 0, .23, .2, .05, rgb(.4, 0, .25));
    }
    hit() { this.marked = true; explode(this.x, this.y, '#d08'); return true; }
}

class AuthenticTank extends Entity {
    constructor(x, y) {
        super(x, y, 14, '#d22');
        this.type = 'tank';
        this.score = 200;
        this.shootTimer = 120 + Math.random() * 120;
        this.targetAngle = Math.random() * Math.PI * 2;
        this.turretAngle = this.targetAngle;
        this.treadPhase = 0;
        this.muzzleFlash = 0;
        this.frameTimer = 0;
    }
    update() {
        if (state.warmup > 0) return;

        for (let e of enemies) {
            if (e.type === 'electrode' && !e.marked) {
                const dist = Math.hypot(this.x - e.x, this.y - e.y);
                const minDist = this.radius + e.radius;
                if (dist < minDist) {
                    const angle = Math.atan2(this.y - e.y, this.x - e.x);
                    const pushDist = minDist - dist + 1;
                    this.x += Math.cos(angle) * pushDist;
                    this.y += Math.sin(angle) * pushDist;
                    this.clamp();
                }
            }
        }

        const speed = 0.8;
        const desiredX = this.x + Math.cos(this.targetAngle) * speed;
        const desiredY = this.y + Math.sin(this.targetAngle) * speed;

        if (!this.checkCollision(desiredX, desiredY)) {
            this.x = desiredX;
            this.y = desiredY;
        } else {
            this.targetAngle += Math.PI / 2 + (Math.random() - 0.5);
        }

        if (Math.random() < 0.02) this.targetAngle += (Math.random() - 0.5);
        if (this.x <= this.radius || this.x >= state.width - this.radius) this.targetAngle = Math.PI - this.targetAngle;
        if (this.y <= this.radius || this.y >= state.height - this.radius) this.targetAngle = -this.targetAngle;
        this.clamp();
        this.frameTimer++;
        this.treadPhase += 0.6;
        this.shootTimer--;

        // The turret swivels to track the player independently of the hull's wandering heading
        const aimDx = player.x - this.x, aimDy = player.y - this.y;
        let turretDelta = Math.atan2(aimDy, aimDx) - this.turretAngle;
        while (turretDelta > Math.PI) turretDelta -= Math.PI * 2;
        while (turretDelta < -Math.PI) turretDelta += Math.PI * 2;
        this.turretAngle += turretDelta * 0.08;
        if (this.muzzleFlash > 0) this.muzzleFlash--;

        if (this.shootTimer <= 0) {
            this.shootTimer = 240 + Math.random() * 180;
            let activeBombs = bullets.filter(b => b.isBounceBomb).length;
            if (activeBombs < 8) {
                const dx = player.x - this.x, dy = player.y - this.y, dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    let b = new Bullet(this.x, this.y, dx/dist, dy/dist, true);
                    b.isBounceBomb = true;
                    b.speed = 2.5;
                    b.radius = 6;
                    b.life = 600;
                    bullets.push(b);
                    AudioSys.playTone(200, 'sawtooth', 0.1, 0.16);
                    this.muzzleFlash = 8;
                }
            }
        }
    }
    draw() {
        if (ImageCache.draw(ctx, this.type, this.x, this.y, this.frameTimer, 0)) return;
        const hullDark = '#5e0d0d', hull = '#a3201f', hullLight = '#e2503f';
        const tread = '#272727', treadLink = '#525252';
        const charging = this.shootTimer < 40;
        const chargeGlow = charging ? (0.45 + 0.55 * Math.abs(Math.sin(state.frames * 0.5))) : 0;

        drawSpriteRect(this.x, this.y, 0, -.66, 1.2, .16, 'rgba(0,0,0,0.4)');

        // Tracked treads with scrolling links so the hull visibly rolls as it patrols
        [-0.6, 0.6].forEach(side => {
            drawSpriteRect(this.x, this.y, side, -0.04, 0.26, 0.8, tread);
            for (let i = -2; i <= 2; i++) {
                const t = (((this.treadPhase * 0.04 + i * 0.27) % 0.8) + 0.8) % 0.8 - 0.4;
                drawSpriteRect(this.x, this.y, side, t, 0.22, 0.1, treadLink);
            }
        });

        // Hull
        drawSpriteRect(this.x, this.y, 0, -.04, 1.0, .58, hullDark);
        drawSpriteRect(this.x, this.y, 0, .06, .86, .42, hull);
        drawSpriteRect(this.x, this.y, 0, .24, .58, .08, hullLight);
        drawSpriteRect(this.x, this.y, -.3, -.2, .16, .12, hullDark);
        drawSpriteRect(this.x, this.y, .3, -.2, .16, .12, hullDark);

        // Turret dome, glowing hotter the closer it is to firing
        drawSpriteEllipse(this.x, this.y, 0, 0, .34, .32, hullDark);
        drawSpriteEllipse(this.x, this.y, 0, 0, .26, .24, hull);
        if (charging) drawSpriteEllipse(this.x, this.y, 0, 0, .13, .13, `rgba(255,170,40,${chargeGlow})`);

        // Cannon barrel tracks the player via turretAngle
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.turretAngle);
        ctx.fillStyle = '#777';
        ctx.fillRect(0, -3, 21, 6);
        ctx.fillStyle = '#999';
        ctx.fillRect(0, -1.5, 21, 3);
        if (this.muzzleFlash > 0) {
            ctx.fillStyle = `rgba(255,200,80,${this.muzzleFlash / 8})`;
            ctx.beginPath(); ctx.arc(23, 0, 5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    hit() { this.marked = true; explode(this.x, this.y, '#d22'); return true; }
}

class AuthenticHuman extends Entity {
    constructor(type) {
        const x = 50 + Math.random() * (state.width - 100), y = 50 + Math.random() * (state.height - 100);
        super(x, y, 6, '#f8c');
        this.type = type;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.targetAngle = this.wanderAngle;
        this.panic = 0; this.frameTimer = Math.floor(Math.random() * 60);
        this.spritesheetY = 0;
    }
    update() {
        enemies.forEach(e => {
            if (e.type === 'electrode' && !e.marked) {
                const d = this.dist(e), minD = this.radius + e.radius + 5;
                if (d < minD && d > 0) {
                    const avoidAngle = Math.atan2(this.y - e.y, this.x - e.x);
                    this.targetAngle = avoidAngle;
                    if (d < this.radius + e.radius) { this.x += Math.cos(avoidAngle) * 1; this.y += Math.sin(avoidAngle) * 1; }
                }
            }
        });
        let threat = null, minTD = Infinity;
        enemies.forEach(e => {
            if (e.type === 'hulk' || e.type === 'brain') {
                const d = this.dist(e); if (d < minTD) { minTD = d; threat = e; }
            }
        });
        if (threat && minTD < 100) {
            this.targetAngle = Math.atan2(this.y - threat.y, this.x - threat.x);
            this.panic = 10;
        }
        if (this.panic > 0) {
            this.vx = Math.cos(this.targetAngle) * 1.2; this.vy = Math.sin(this.targetAngle) * 1.2;
            this.wanderAngle = this.targetAngle; this.panic--;
        } else {
            if (Math.random() < 0.03) this.targetAngle += (Math.random() - 0.5) * 2.5;
            const edgeDist = 40;
            if (this.x < edgeDist) this.targetAngle = 0;
            if (this.x > state.width - edgeDist) this.targetAngle = Math.PI;
            if (this.y < edgeDist) this.targetAngle = Math.PI/2;
            if (this.y > state.height - edgeDist) this.targetAngle = -Math.PI/2;
            let diff = this.targetAngle - this.wanderAngle;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.wanderAngle += diff * 0.1;
            this.vx = Math.cos(this.wanderAngle) * 0.6; this.vy = Math.sin(this.wanderAngle) * 0.6;
        }
        this.x += this.vx; this.y += this.vy; this.clamp();
        this.frameTimer++;

        let yOffsets = { daddy: { u:28, d:0, l:56, r:82 }, mommy: { u:30, d:0, l:59, r:88 }, mikey: { u:24, d:0, l:48, r:70 } };
        let offset = yOffsets[this.type];
        if (Math.abs(this.vx) > Math.abs(this.vy)) {
            this.spritesheetY = this.vx > 0 ? offset.r : offset.l;
        } else {
            this.spritesheetY = this.vy < 0 ? offset.u : offset.d;
        }

        if (this.dist(player) < 20 && player.state === 'normal') {
            this.marked = true;
            state.score += state.rescueBonus;
            addFloat(this.x, this.y, `+${state.rescueBonus}`, '#0f0');
            checkExtraLife(state.rescueBonus);
            if (state.rescueBonus < 5000) state.rescueBonus += 1000;
            AudioSys.rescue();
        }
    }
    draw() {
        if (ImageCache.draw(ctx, this.type, this.x, this.y, this.frameTimer, this.spritesheetY)) return;
        const walkPhase = this.frameTimer * 0.15;
        const phase = Math.sin(walkPhase), bob = phase * .04, armSwing = phase * .07, legStretch = phase * .05;
        const typeIdx = ['daddy', 'mommy', 'mikey'].indexOf(this.type);
        const palettes = [
            { body: rgb(1, .45, .75), head: rgb(1, .85, .7), hair: rgb(.85, .55, .25) },
            { body: rgb(.3, .55, 1),  head: rgb(1, .85, .7), hair: rgb(.25, .15, .1)  },
            { body: rgb(1, .9, .25),  head: rgb(1, .85, .7), hair: rgb(.95, .65, .15) },
        ];
        const c = palettes[typeIdx];
        const flash = (this.panic > 0 && (this.panic & 4)) ? rgb(1,1,1) : c.body;
        const bodyCenterY = -.05 + bob, bodyBottomY = bodyCenterY - .21;
        drawSpriteRect(this.x, this.y, 0, -.45, .5, .1, 'rgba(0,0,0,0.35)');
        const baseLegH = .22, leftLegH = baseLegH + legStretch, rightLegH = baseLegH - legStretch;
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
    el.style.left=(rect.left+x)+'px'; el.style.top=(rect.top+y)+'px';
    el.style.color=col; ui.layer.appendChild(el);
    setTimeout(()=>el.remove(),1000);
}
function checkExtraLife(increment) {
    const every=25000;
    const current=Math.floor(state.score/every), prev=Math.floor((state.score-increment)/every);
    if(current>prev) {
        state.lives++; AudioSys.extraLife();
        addFloat(state.width/2,state.height/2,'EXTRA LIFE','#ff0');
    }
}
function spawnPos(minDist = 150) {
    let x, y, d; const margin = 25;
    do {
        x = margin + Math.random() * (state.width - margin * 2);
        y = margin + Math.random() * (state.height - margin * 2);
        d = Math.hypot(x - player.x, y - player.y);
    } while(d < minDist);
    return {x, y};
}
function spawnWave() {
    enemies = []; humans = []; bullets = []; particles = [];
    state.rescueBonus = 1000; state.warmup = 120;
    player.x = state.width/2; player.y = state.height/2;
    player.state = 'spawning'; player.spawnDelay = 45; player.stateCount = 0; player.invuln = 120;

    const waveCfg = getWaveConfig(state.wave);

    for (let i = 0; i < (waveCfg.Daddy || 0); i++) humans.push(new AuthenticHuman('daddy'));
    for (let i = 0; i < (waveCfg.Mommy || 0); i++) humans.push(new AuthenticHuman('mommy'));
    for (let i = 0; i < (waveCfg.Mikey || 0); i++) humans.push(new AuthenticHuman('mikey'));

    for (let i = 0; i < (waveCfg.Grunt || 0); i++) { const p = spawnPos(); enemies.push(new AuthenticGrunt(p.x, p.y)); }
    for (let i = 0; i < (waveCfg.Hulk || 0); i++) { const p = spawnPos(); enemies.push(new AuthenticHulk(p.x, p.y)); }
    for (let i = 0; i < (waveCfg.Brain || 0); i++) { const p = spawnPos(); enemies.push(new AuthenticBrain(p.x, p.y)); }
    for (let i = 0; i < (waveCfg.Tank || 0); i++) { const p = spawnPos(); enemies.push(new AuthenticTank(p.x, p.y)); }

    for (let i = 0; i < (waveCfg.Electrode || 0); i++) {
        const p = spawnPos(100);
        const e = new Entity(p.x, p.y, 9, '#ff0');
        e.type = 'electrode'; e.score = 0;
        e.draw = function() {
            if (this.shape === undefined) this.shape = Math.floor(Math.random()*2);
            const r = .55;
            const dark = '#a80', light = '#fd0';
            if (this.shape === 0) {
                drawSpriteRect(this.x, this.y, 0, 0, r*1.4, r*1.4, dark, Math.PI/4);
                drawSpriteRect(this.x, this.y, 0, 0, r*1.0, r*1.0, light, Math.PI/4);
            } else {
                ctx.save(); ctx.translate(this.x, this.y);
                const poly = (radius, color) => {
                    ctx.fillStyle = color; ctx.beginPath();
                    for (let i = 0; i < 3; i++) {
                        const a = Math.PI/2 + i * (2 * Math.PI / 3);
                        ctx.lineTo(Math.cos(a) * radius * SPRITE_SCALE, -Math.sin(a) * radius * SPRITE_SCALE);
                    }
                    ctx.closePath(); ctx.fill();
                };
                poly(r * 1.05, dark); poly(r * 0.7, light); ctx.restore();
            }
            drawSpriteRect(this.x, this.y, 0, 0, .22, .22, rgb(1,1,1));
        };
        enemies.push(e);
    }
    addFloat(state.width/2, state.height/3, `WAVE ${state.wave}`, '#0ff');
}
function killPlayer() {
    state.lives--; state.deathFlash = 18; player.state = 'dying'; state.rescueBonus = 1000;
    explode(player.x, player.y, '#0ff'); AudioSys.explosion(true); bullets = [];
    if(state.lives <= 0) {
        state.running = false;
        if(state.score > state.highScore) {
            state.highScore = state.score; localStorage.setItem('robotron_high', state.highScore);
            ui.high.textContent = state.highScore.toLocaleString();
        }
        ui.final.textContent = state.score.toLocaleString();
        ui.over.classList.remove('hidden');
        Diagnostics.exportLog();
    } else {
        setTimeout(() => {
            state.warmup = 150; player.x = state.width/2; player.y = state.height/2;
            player.state = 'spawning'; player.spawnDelay = 30; player.stateCount = 0; player.invuln = 120;
            const safeRadius = 250;
            enemies.forEach(e => {
                const dx = e.x - player.x, dy = e.y - player.y, dist = Math.hypot(dx, dy);
                if (dist < safeRadius) {
                    const angle = dist === 0 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx);
                    e.x = player.x + Math.cos(angle) * safeRadius; e.y = player.y + Math.sin(angle) * safeRadius; e.clamp();
                }
            });
            addFloat(state.width/2, state.height/2, 'RESURRECTION', '#0ff');
        }, 1000);
    }
}
function resolveCollision(circle1, circle2, push=true) {
    const dx = circle1.x - circle2.x, dy = circle1.y - circle2.y;
    const dist = Math.hypot(dx, dy), minDist = circle1.radius + circle2.radius;
    if (dist < minDist && dist > 0) {
        const overlap = minDist - dist, nx = dx / dist, ny = dy / dist;
        if (push) { circle1.x += nx * overlap; circle1.y += ny * overlap; }
        return true;
    }
    return false;
}
let lastFrameTime = 0;
function update() {
    if(!state.running) return;
    const now = performance.now();
    if (now - lastFrameTime < 16.67) { requestAnimationFrame(update); return; }
    lastFrameTime = now; state.frames++;
    if (state.frames % Diagnostics.intervalFrames === 0) Diagnostics.recordState();

    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, state.width, state.height);
    if (state.deathFlash > 0) { ctx.fillStyle = `rgba(255,0,0,${state.deathFlash / 18 * 0.45})`; ctx.fillRect(0, 0, state.width, state.height); state.deathFlash--; }

    if(state.warmup > 0) {
        state.warmup--;
        ctx.fillStyle = '#0ff'; ctx.font = 'bold 40px Courier New'; ctx.textAlign = 'center';
        ctx.shadowBlur = 15; ctx.shadowColor = '#0ff';
        ctx.fillText(state.warmup > 60 ? "GET READY" : "GO!", state.width/2, state.height/2);
        ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(0,255,255,0.2)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(state.width/2, state.height/2, 100, 0, Math.PI*2 * (state.warmup/120)); ctx.stroke();
    }

    player.update();
    enemies.forEach(e => { if (e.type === 'electrode' && !e.marked) resolveCollision(player, e, true); });
    player.clamp(); player.draw();

    bullets.forEach(b => b.update()); bullets = bullets.filter(b => !b.marked); bullets.forEach(b => b.draw());
    humans.forEach(h => h.update()); humans = humans.filter(h => !h.marked); humans.forEach(h => h.draw());
    enemies.forEach(e => { if (e.type !== 'electrode' && e.update) e.update(); });
    enemies = enemies.filter(e => !e.marked); enemies.forEach(e => e.draw());
    particles.forEach(p => p.update()); particles = particles.filter(p => p.life > 0.1); particles.forEach(p => p.draw());

    if (state.warmup <= 0 && player.state === 'normal') {
        bullets.forEach(b => {
            if(b.isEnemy) {
                if(player.dist(b) < player.radius + b.radius && player.invuln <= 0) { b.marked = true; killPlayer(); }
            } else {
                enemies.forEach(e => {
                    if(e.marked) return;
                    if(b.dist(e) < e.radius + b.radius) {
                        if(e.type === 'electrode') { b.marked = true; }
                        else {
                            b.marked = true;
                            if(e.hit && e.hit(b)) {
                                const pts = e.score || 100;
                                state.score += pts; addFloat(e.x, e.y, pts.toString(), '#fff'); checkExtraLife(pts);
                            }
                        }
                    }
                });
                // Player bullets destroying Bounce Bombs
                bullets.forEach(eb => {
                    if (eb.isEnemy && eb.isBounceBomb && !eb.marked && !b.marked) {
                        if (b.dist(eb) < eb.radius + b.radius) {
                            b.marked = true;
                            eb.marked = true;
                            state.score += 25;
                            addFloat(eb.x, eb.y, '25', '#fa4');
                            checkExtraLife(25);
                            explode(eb.x, eb.y, '#fa4');
                            AudioSys.playNoise(0.1, 0.1);
                        }
                    }
                });
            }
        });
        enemies.forEach(e => {
            if(e.type === 'electrode') return;
            if(player.dist(e) < e.radius + player.radius && player.invuln <= 0) killPlayer();
        });
    }

    const remaining = enemies.filter(e => ['grunt', 'brain', 'prog', 'tank'].includes(e.type)).length;
    if(remaining === 0 && state.running && state.warmup <= 0) {
        state.wave++; ui.wave.textContent = state.wave; spawnWave();
    }

    ui.score.textContent = state.score.toLocaleString();
    ui.lives.textContent = state.lives;
    requestAnimationFrame(update);
}
function startGame() {
    AudioSys.init(); ImageCache.load();
    for (const key in keys) keys[key] = false;
    document.querySelectorAll('.shoot-btn').forEach(b => b.classList.remove('active'));
    state.running = true; state.score = 0; state.lives = 3; state.wave = 1; state.frames = 0; state.rescueBonus = 1000;
    Diagnostics.clear();
    ui.score.textContent = '0'; ui.wave.textContent = '1'; ui.lives.textContent = '3';
    ui.start.classList.add('hidden'); ui.over.classList.add('hidden');
    player = new AuthenticPlayer(); spawnWave(); update();
}
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', startGame);
resize(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, state.width, state.height);
