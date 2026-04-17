/**
 * AI BREAKOUT+ — Accessible Edition
 * game.js  —  Complete rewrite for reliable head tracking & blink detection
 *
 * HEAD TRACKING:  nose tip absolute X position (not delta) mapped to paddle
 * BLINK DETECT:   EAR threshold on BOTH eyes simultaneously, with hysteresis
 * LEVEL:          Always starts at 1
 */

'use strict';

// ─── Canvas & resize ─────────────────────────────────────────────────────────
const gameCanvas  = document.getElementById('gameCanvas');
const ctx         = gameCanvas.getContext('2d');
const canvasWrap  = gameCanvas.parentElement;

function resizeCanvas() {
  const r = canvasWrap.getBoundingClientRect();
  gameCanvas.width  = r.width  || 800;
  gameCanvas.height = r.height || 500;
  if (gameState !== 'playing') drawFrame();
}
window.addEventListener('resize', resizeCanvas);
// Initial size after layout settles
setTimeout(resizeCanvas, 100);

// ─── Game constants ───────────────────────────────────────────────────────────
const BRICK_ROWS  = 6;
const BRICK_COLS  = 11;
const BRICK_GAP   = 4;
const BRICK_TOP   = 28;   // top offset for brick grid
const PADDLE_H    = 14;
const BALL_R      = 8;
const POWER_W     = 30;
const POWER_H     = 20;

const BRICK_ROW_VARS = ['--brick-1','--brick-2','--brick-3','--brick-4','--brick-5','--brick-6'];
const PU_COLOR_VAR   = { E:'--pu-E', S:'--pu-S', T:'--pu-T', SL:'--pu-SL', F:'--pu-F', L:'--pu-L' };

// ─── Difficulty ───────────────────────────────────────────────────────────────
const DIFFICULTIES = {
  easy:   { baseSpeed: 3.5, paddleW: 130 },
  medium: { baseSpeed: 5.0, paddleW: 100 },
  hard:   { baseSpeed: 7.0, paddleW:  70 }
};
let difficulty = 'hard';

// ─── Game state ───────────────────────────────────────────────────────────────
let gameState = 'ready';   // 'ready' | 'playing' | 'gameover' | 'win'
let score     = 0;
let lives     = 3;
let level     = 1;          // ← always starts at 1
let laserMode = false;
let laserTimer= 0;
let lasers    = [];
let powerUps  = [];
let bricks    = [];
let balls     = [];
let animId    = null;
let lastTs    = 0;

let paddle    = { x:0, y:0, w:100, h:PADDLE_H };

// ─── Keyboard input ───────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ') { e.preventDefault(); handleAction(); }
});
document.addEventListener('keyup',  e => { keys[e.key] = false; });

// ─── HUD elements ─────────────────────────────────────────────────────────────
const $score    = document.getElementById('scoreVal');
const $lives    = document.getElementById('livesVal');
const $level    = document.getElementById('levelVal');
const $overlay  = document.getElementById('overlay');
const $msg      = document.getElementById('overlayMsg');
const $sub      = document.getElementById('overlaySubMsg');
const $dotHead  = document.getElementById('dotHead');
const $dotEye   = document.getElementById('dotEye');
const $dotBlink = document.getElementById('dotBlink');
const $lblHead  = document.getElementById('lblHead');
const $lblEar   = document.getElementById('lblEar');
const $lblBlink = document.getElementById('lblBlink');
const $eyeL     = document.getElementById('eyeL');
const $eyeR     = document.getElementById('eyeR');

// ─── Difficulty buttons ───────────────────────────────────────────────────────
['easy','medium','hard'].forEach(d => {
  const id  = 'btn' + d[0].toUpperCase() + d.slice(1);
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener('click', () => {
    difficulty = d;
    ['easy','medium','hard'].forEach(x => {
      const b = document.getElementById('btn' + x[0].toUpperCase() + x.slice(1));
      if (b) b.setAttribute('aria-pressed', x === d ? 'true' : 'false');
    });
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    initGame();
  });
});

// ─── Colorblind buttons ───────────────────────────────────────────────────────
document.querySelectorAll('.cb-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cb-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed','false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed','true');
    const m = btn.dataset.mode;
    document.body.dataset.cbmode = (m === 'normal') ? '' : m;
    drawFrame();
  });
});

// ─── CSS variable reader ──────────────────────────────────────────────────────
function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || '#888';
}

// ─── Brick grid ───────────────────────────────────────────────────────────────
function initBricks() {
  bricks = [];
  const W  = gameCanvas.width;
  const bW = Math.floor((W - BRICK_GAP * (BRICK_COLS + 1)) / BRICK_COLS);
  const bH = 26;
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const hp = r < 2 ? 2 : 1;
      bricks.push({
        x: BRICK_GAP + c * (bW + BRICK_GAP),
        y: BRICK_TOP + r * (bH + BRICK_GAP),
        w: bW, h: bH,
        row: r, hp, maxHp: hp, alive: true
      });
    }
  }
}

// ─── Ball factory ─────────────────────────────────────────────────────────────
function makeBall(angleRad) {
  const cfg = DIFFICULTIES[difficulty];
  const spd = cfg.baseSpeed * (1 + (level - 1) * 0.12);
  const a   = angleRad ?? ((Math.random() * 50 - 25) * Math.PI / 180);
  return {
    x: paddle.x + paddle.w / 2,
    y: paddle.y - BALL_R - 2,
    vx: spd * Math.sin(a),
    vy: -spd * Math.cos(a),
    trail: []
  };
}

// ─── Init / reset ─────────────────────────────────────────────────────────────
function initGame() {
  const cfg = DIFFICULTIES[difficulty];
  const W   = gameCanvas.width || 800;
  const H   = gameCanvas.height || 500;

  paddle = {
    x: W / 2 - cfg.paddleW / 2,
    y: H - 38,
    w: cfg.paddleW,
    h: PADDLE_H
  };

  balls     = [];
  lasers    = [];
  powerUps  = [];
  laserMode = false;
  laserTimer= 0;
  score     = 0;
  lives     = 3;
  level     = 1;          // ← starts at 1
  gameState = 'ready';

  initBricks();
  updateHUD();
  showOverlay('BLINK OR [SPACE] TO LAUNCH', 'Difficulty: ' + difficulty.toUpperCase());
  drawFrame();
}

// ─── Action (blink / space) ───────────────────────────────────────────────────
function handleAction() {
  if (gameState === 'ready') {
    balls = [makeBall()];
    gameState = 'playing';
    hideOverlay();
    if (!animId) { lastTs = performance.now(); animId = requestAnimationFrame(loop); }
    return;
  }
  if (gameState === 'playing') {
    if (laserMode) fireLaser();
    return;
  }
  if (gameState === 'gameover' || gameState === 'win') {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    initGame();
  }
}

// ─── Laser ────────────────────────────────────────────────────────────────────
function fireLaser() {
  const lc = cssVar('--accent2');
  lasers.push(
    { x: paddle.x + 6,             y: paddle.y, vy: -16, w: 4, h: 14, col: lc },
    { x: paddle.x + paddle.w - 10, y: paddle.y, vy: -16, w: 4, h: 14, col: lc }
  );
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD() {
  $score.textContent = score;
  $lives.textContent = '♥'.repeat(Math.max(0, lives));
  $level.textContent = level;
}

function showOverlay(msg, sub) {
  $msg.textContent = msg;
  $sub.textContent = sub ?? '';
  $overlay.classList.remove('hidden');
}
function hideOverlay() { $overlay.classList.add('hidden'); }

// ─── Main loop ────────────────────────────────────────────────────────────────
function loop(ts) {
  const dt = Math.min((ts - lastTs) / 16.667, 3.0);
  lastTs = ts;
  update(dt);
  drawFrame();
  if (gameState === 'playing') animId = requestAnimationFrame(loop);
  else animId = null;
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update(dt) {
  const W   = gameCanvas.width;
  const H   = gameCanvas.height;
  const cfg = DIFFICULTIES[difficulty];

  // ── Paddle movement ──────────────────────────────────────────────────────
  // Head tracking drives paddle directly via absolute nose position
  if (headActive && noseXNorm !== null) {
    // noseXNorm = 0 (left of frame) .. 1 (right) — already inverted for mirror
    const targetX = noseXNorm * W - paddle.w / 2;
    // Smooth towards target
    paddle.x += (targetX - paddle.x) * 0.22;
  }

  // Keyboard override / supplement
  const kSpd = 9;
  if (keys['ArrowLeft']  || keys['a']) paddle.x -= kSpd * dt;
  if (keys['ArrowRight'] || keys['d']) paddle.x += kSpd * dt;
  paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

  // ── Laser timer ──────────────────────────────────────────────────────────
  if (laserMode) {
    laserTimer -= dt * 16.667;
    if (laserTimer <= 0) laserMode = false;
  }

  // ── Power-ups falling ────────────────────────────────────────────────────
  powerUps = powerUps.filter(p => {
    p.y += 2.2 * dt;
    // Collect
    if (p.y + POWER_H > paddle.y && p.y < paddle.y + paddle.h &&
        p.x + POWER_W > paddle.x && p.x < paddle.x + paddle.w) {
      applyPowerUp(p.type);
      return false;
    }
    return p.y < H;
  });

  // ── Lasers ───────────────────────────────────────────────────────────────
  lasers = lasers.filter(l => {
    l.y += l.vy * dt;
    if (l.y + l.h < 0) return false;
    for (const b of bricks) {
      if (!b.alive) continue;
      if (l.x + l.w > b.x && l.x < b.x + b.w &&
          l.y < b.y + b.h && l.y + l.h > b.y) {
        hitBrick(b); return false;
      }
    }
    return true;
  });

  // ── Balls ────────────────────────────────────────────────────────────────
  for (const ball of balls) {
    // Trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 9) ball.trail.shift();

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Wall bounces
    if (ball.x - BALL_R < 0)  { ball.x = BALL_R;     ball.vx =  Math.abs(ball.vx); }
    if (ball.x + BALL_R > W)  { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - BALL_R < 0)  { ball.y = BALL_R;     ball.vy =  Math.abs(ball.vy); }

    // Paddle
    if (ball.vy > 0 &&
        ball.y + BALL_R > paddle.y &&
        ball.y - BALL_R < paddle.y + paddle.h &&
        ball.x         > paddle.x &&
        ball.x         < paddle.x + paddle.w) {
      const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const spd = Math.hypot(ball.vx, ball.vy);
      const ang = rel * (Math.PI / 3);
      ball.vx = spd * Math.sin(ang);
      ball.vy = -Math.abs(spd * Math.cos(ang));
      ball.y  = paddle.y - BALL_R - 1;
    }

    // Bricks
    for (const b of bricks) {
      if (!b.alive) continue;
      const side = circRectCollide(ball, b);
      if (!side) continue;
      hitBrick(b);
      if (side === 'tb') ball.vy *= -1; else ball.vx *= -1;
    }

    // Out of bounds (bottom)
    if (ball.y - BALL_R > H) ball.dead = true;
  }

  balls = balls.filter(b => !b.dead);

  // ── Ball gone ────────────────────────────────────────────────────────────
  if (balls.length === 0) {
    lives--;
    updateHUD();
    if (lives <= 0) {
      gameState = 'gameover';
      showOverlay('GAME OVER', 'Score: ' + score + '   —   Blink or [Space] to restart');
      drawFrame();
      return;
    }
    gameState = 'ready';
    showOverlay('BLINK OR [SPACE] TO LAUNCH', 'Lives remaining: ' + lives);
    return;
  }

  // ── All bricks cleared ───────────────────────────────────────────────────
  if (bricks.every(b => !b.alive)) {
    level++;
    initBricks();
    balls = [];
    gameState = 'ready';
    showOverlay('LEVEL ' + level + '!', 'Blink to continue');
  }

  updateHUD();
}

// ─── Circle-rect collision ────────────────────────────────────────────────────
function circRectCollide(ball, r) {
  const cx = Math.max(r.x, Math.min(ball.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(ball.y, r.y + r.h));
  const dx = ball.x - cx, dy = ball.y - cy;
  if (dx*dx + dy*dy >= BALL_R*BALL_R) return null;
  return Math.abs(dy) >= Math.abs(dx) ? 'tb' : 'lr';
}

// ─── Hit brick ────────────────────────────────────────────────────────────────
function hitBrick(b) {
  b.hp--;
  if (b.hp <= 0) {
    b.alive = false;
    score += 10 * level;
    if (Math.random() < 0.18) {
      const t = ['E','S','T','SL','F','L'];
      powerUps.push({
        x: b.x + b.w/2 - POWER_W/2,
        y: b.y,
        type: t[Math.floor(Math.random()*t.length)]
      });
    }
  }
}

// ─── Power-up effects ─────────────────────────────────────────────────────────
function applyPowerUp(type) {
  const cfg = DIFFICULTIES[difficulty];
  const spd = cfg.baseSpeed * (1 + (level-1)*0.12);
  switch(type) {
    case 'E': paddle.w = Math.min(paddle.w*1.4, gameCanvas.width*0.5); break;
    case 'S': paddle.w = Math.max(paddle.w*0.65, 38); break;
    case 'T':
      if (balls.length > 0) {
        const b = balls[0];
        const a = Math.atan2(b.vx, -b.vy);
        balls.push({...makeBall(a+0.45), x:b.x, y:b.y, trail:[]});
        balls.push({...makeBall(a-0.45), x:b.x, y:b.y, trail:[]});
      }
      break;
    case 'SL':
      balls.forEach(b => {
        const a = Math.atan2(b.vx,-b.vy);
        const s = spd*0.6;
        b.vx = s*Math.sin(a); b.vy = -s*Math.cos(a);
      }); break;
    case 'F':
      balls.forEach(b => {
        const a = Math.atan2(b.vx,-b.vy);
        const s = spd*1.5;
        b.vx = s*Math.sin(a); b.vy = -s*Math.cos(a);
      }); break;
    case 'L':
      laserMode = true;
      laserTimer = 8000;
      break;
  }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function drawFrame() {
  const W = gameCanvas.width, H = gameCanvas.height;
  if (!W || !H) return;

  // Background
  ctx.fillStyle = '#020e1c';
  ctx.fillRect(0, 0, W, H);

  // Grid overlay
  ctx.strokeStyle = 'rgba(0,90,140,0.07)';
  ctx.lineWidth = 1;
  for (let x=0; x<W; x+=28) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y=0; y<H; y+=28) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  drawBricks();
  drawPowerUps();
  drawLasers();
  drawBalls();
  drawPaddle();
}

function drawBricks() {
  for (const b of bricks) {
    if (!b.alive) continue;
    const col  = cssVar(BRICK_ROW_VARS[b.row]);
    const frac = b.hp / b.maxHp;

    ctx.shadowColor = col;
    ctx.shadowBlur  = 8 * frac;
    ctx.globalAlpha = 0.22 + 0.78 * frac;
    ctx.fillStyle   = col;
    rrect(b.x, b.y, b.w, b.h, 4); ctx.fill();

    ctx.globalAlpha = 0.55 + 0.45 * frac;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5;
    rrect(b.x, b.y, b.w, b.h, 4); ctx.stroke();

    // Crack for damaged bricks
    if (b.maxHp > 1 && b.hp < b.maxHp) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth   = 1.1;
      const cx = b.x+b.w/2, cy = b.y+b.h/2;
      ctx.beginPath();
      ctx.moveTo(cx-7,cy-5); ctx.lineTo(cx+4,cy+7);
      ctx.moveTo(cx+5,cy-4); ctx.lineTo(cx-2,cy+6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

function drawPaddle() {
  const {x,y,w,h} = paddle;
  const col = laserMode ? cssVar('--accent2') : cssVar('--accent');
  ctx.shadowColor = col; ctx.shadowBlur = 20;
  const g = ctx.createLinearGradient(x,y,x,y+h);
  g.addColorStop(0, lighten(col,0.55));
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  rrect(x,y,w,h,h/2); ctx.fill();
  // highlight strip
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#ffffff';
  rrect(x+4, y+2, w-8, h*0.35, 3); ctx.fill();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawBalls() {
  for (const ball of balls) {
    // Trail
    ball.trail.forEach((t,i) => {
      const a = (i / ball.trail.length) * 0.32;
      const r = BALL_R * (i / ball.trail.length) * 0.65;
      ctx.fillStyle = `rgba(0,229,255,${a})`;
      ctx.beginPath(); ctx.arc(t.x,t.y,r,0,Math.PI*2); ctx.fill();
    });
    ctx.shadowColor = cssVar('--accent'); ctx.shadowBlur = 22;
    const g = ctx.createRadialGradient(ball.x-2,ball.y-2,1,ball.x,ball.y,BALL_R);
    g.addColorStop(0,'#ffffff');
    g.addColorStop(0.4,cssVar('--accent'));
    g.addColorStop(1,'rgba(0,140,190,0.25)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ball.x,ball.y,BALL_R,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawPowerUps() {
  for (const p of powerUps) {
    const col = cssVar(PU_COLOR_VAR[p.type]);
    ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.fillStyle   = col + 'cc';
    capsule(p.x, p.y, POWER_W, POWER_H); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 10px Orbitron,monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.type, p.x + POWER_W/2, p.y + POWER_H/2);
    ctx.shadowBlur = 0;
  }
}

function drawLasers() {
  const col = cssVar('--accent2');
  ctx.shadowColor = col; ctx.shadowBlur = 12;
  ctx.fillStyle   = col;
  for (const l of lasers) { rrect(l.x,l.y,l.w,l.h,2); ctx.fill(); }
  ctx.shadowBlur = 0;
}

// ─── Shape helpers ────────────────────────────────────────────────────────────
function rrect(x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
function capsule(x,y,w,h) { rrect(x,y,w,h,h/2); }
function lighten(hex,a) {
  try {
    const c=parseInt(hex.replace('#',''),16);
    const r=Math.min(255,((c>>16)&255)+a*255)|0;
    const g=Math.min(255,((c>>8)&255)+a*255)|0;
    const b=Math.min(255,(c&255)+a*255)|0;
    return `rgb(${r},${g},${b})`;
  } catch { return hex; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEAD & EYE TRACKING  —  MediaPipe FaceMesh
// ═══════════════════════════════════════════════════════════════════════════════

const inputVideo    = document.getElementById('inputVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const ovCtx         = overlayCanvas.getContext('2d');

// ── State shared with update() ───────────────────────────────────────────────
let headActive   = false;   // face visible?
let noseXNorm    = null;    // 0..1, corrected for mirror (0=game-left)

// ── Blink state machine ──────────────────────────────────────────────────────
// We use hysteresis: blink fires on RISING edge (eyes RE-OPEN after being closed)
const EAR_CLOSE_THRESH  = 0.20;  // below → eyes considered closed
const EAR_OPEN_THRESH   = 0.24;  // above → eyes considered open (hysteresis gap)
const BLINK_COOLDOWN_MS = 700;

let eyesWereClosed  = false;
let blinkCooldownTs = 0;

// MediaPipe eye landmark indices (canonical face)
// 6 points per eye following Soukupová & Čech EAR definition
const IDX_LEFT_EYE  = [362, 385, 387, 263, 373, 380];
const IDX_RIGHT_EYE = [33,  160, 158, 133, 153, 144];
const IDX_NOSE_TIP  = 1;

function ear(lm, idx) {
  // EAR = (||p1-p5|| + ||p2-p4||) / (2 × ||p0-p3||)
  const p = idx.map(i => lm[i]);
  const A = dist2(p[1],p[5]);
  const B = dist2(p[2],p[4]);
  const C = dist2(p[0],p[3]);
  if (C < 1e-6) return 0.3;
  return (A+B) / (2*C);
}
function dist2(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

// ── FaceMesh result handler ───────────────────────────────────────────────────
function onResults(results) {
  // Sync overlay canvas to video element size
  overlayCanvas.width  = inputVideo.videoWidth  || 240;
  overlayCanvas.height = inputVideo.videoHeight || 180;
  ovCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    headActive = false;
    updateTrackingHUD(false, 0, false);
    return;
  }

  const lm   = results.multiFaceLandmarks[0];
  const nose = lm[IDX_NOSE_TIP];

  // ── Nose X → paddle position ─────────────────────────────────────────────
  // MediaPipe: nose.x = 0 at camera-right, 1 at camera-left
  // After CSS mirror (scaleX(-1)) the visual left is where nose.x=1
  // So game-left = nose.x=1, game-right = nose.x=0  → invert
  noseXNorm  = 1.0 - nose.x;    // 0 = game-left, 1 = game-right
  headActive = true;

  // ── EAR blink detection ───────────────────────────────────────────────────
  const earL   = ear(lm, IDX_LEFT_EYE);
  const earR   = ear(lm, IDX_RIGHT_EYE);
  const earAvg = (earL + earR) / 2;
  const now    = performance.now();

  let blinkFired = false;

  if (earAvg < EAR_CLOSE_THRESH) {
    // Eyes are closed
    if (!eyesWereClosed) eyesWereClosed = true;
  } else if (earAvg > EAR_OPEN_THRESH) {
    // Eyes are open — fire on rising edge
    if (eyesWereClosed && now > blinkCooldownTs) {
      eyesWereClosed = false;
      blinkCooldownTs = now + BLINK_COOLDOWN_MS;
      blinkFired = true;
      handleAction();
    } else {
      eyesWereClosed = false;
    }
  }

  // ── Overlay drawing ───────────────────────────────────────────────────────
  const ow = overlayCanvas.width;
  const oh = overlayCanvas.height;

  // Nose dot (mapped to mirrored canvas)
  const nx = (1 - nose.x) * ow;
  const ny = nose.y * oh;
  ovCtx.beginPath();
  ovCtx.arc(nx, ny, 6, 0, Math.PI*2);
  ovCtx.fillStyle   = '#00e5ff';
  ovCtx.shadowColor = '#00e5ff';
  ovCtx.shadowBlur  = 10;
  ovCtx.fill();
  ovCtx.shadowBlur  = 0;

  // Eye contours
  const eyeClosed = earAvg < EAR_CLOSE_THRESH;
  [IDX_LEFT_EYE, IDX_RIGHT_EYE].forEach(arr => {
    ovCtx.beginPath();
    arr.forEach((idx, j) => {
      const p  = lm[idx];
      const px = (1-p.x)*ow;
      const py = p.y*oh;
      j===0 ? ovCtx.moveTo(px,py) : ovCtx.lineTo(px,py);
    });
    ovCtx.closePath();
    ovCtx.strokeStyle = eyeClosed ? '#ff1744' : '#00e676';
    ovCtx.lineWidth   = 1.5;
    ovCtx.stroke();
  });

  updateTrackingHUD(true, earAvg, blinkFired, eyeClosed);
}

// ── HUD update ────────────────────────────────────────────────────────────────
function updateTrackingHUD(active, earAvg, blinkFired, eyeClosed) {
  if (active) {
    $dotHead.className   = 'dot on';
    $lblHead.textContent = 'ACTIVE';
    $lblHead.className   = 'val val--on';
    $dotEye.className    = 'dot on';
    $lblEar.textContent  = earAvg.toFixed(3);
    $lblEar.className    = eyeClosed ? 'val val--warn' : 'val val--on';
  } else {
    $dotHead.className   = 'dot off';
    $lblHead.textContent = 'NO FACE';
    $lblHead.className   = 'val val--off';
    $dotEye.className    = 'dot off';
    $lblEar.textContent  = '---';
    $lblEar.className    = 'val val--off';
  }

  if (blinkFired) {
    $dotBlink.className  = 'dot on';
    $lblBlink.textContent = 'BLINK!';
    $lblBlink.className  = 'val val--ready';
    $eyeL.classList.add('blink');
    $eyeR.classList.add('blink');
    setTimeout(() => {
      $eyeL.classList.remove('blink');
      $eyeR.classList.remove('blink');
      $lblBlink.textContent = active ? 'READY' : 'WAITING';
    }, 500);
  } else if (active) {
    $dotBlink.className  = 'dot on';
    $lblBlink.textContent = eyeClosed ? 'CLOSED...' : 'READY';
    $lblBlink.className  = eyeClosed ? 'val val--warn' : 'val val--ready';
  }
}

// ── Start MediaPipe ───────────────────────────────────────────────────────────
async function startTracking() {
  let faceModel;
  try {
    faceModel = new FaceMesh({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
    });
  } catch(e) {
    console.warn('FaceMesh not available:', e);
    $lblHead.textContent = 'NOT LOADED';
    $lblHead.className   = 'val val--warn';
    return;
  }

  faceModel.setOptions({
    maxNumFaces:            1,
    refineLandmarks:        true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence:  0.6
  });

  faceModel.onResults(onResults);

  let cam;
  try {
    cam = new Camera(inputVideo, {
      onFrame: async () => {
        if (inputVideo.readyState >= 2) {
          await faceModel.send({ image: inputVideo });
        }
      },
      width:  320,
      height: 240
    });
    await cam.start();
    $dotHead.className   = 'dot on';
    $lblHead.textContent = 'SEARCHING…';
    $lblHead.className   = 'val val--warn';
  } catch(err) {
    console.warn('Camera error:', err);
    $dotHead.className   = 'dot off';
    $lblHead.textContent = 'NO CAMERA';
    $lblHead.className   = 'val val--warn';
    $lblBlink.textContent = 'USE KEYBOARD';
    $lblBlink.className   = 'val val--warn';
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Wait for DOM layout to finalise before sizing
window.addEventListener('load', () => {
  resizeCanvas();
  initGame();
  startTracking();
});
