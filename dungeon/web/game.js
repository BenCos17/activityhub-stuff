import { backToMenu, connect } from 'activityhub';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startPanel = document.getElementById('start-panel');
const endPanel = document.getElementById('end-panel');
const statusLabel = document.getElementById('status');
const objectiveLabel = document.getElementById('objective');
const timerLabel = document.getElementById('timer');
const healthLabel = document.getElementById('health');
const healthMeter = document.getElementById('health-meter');
const shardsLabel = document.getElementById('shards');
const scoreLabel = document.getElementById('score');
const depthLabel = document.getElementById('depth');
const resultTitle = document.getElementById('result-title');
const resultCopy = document.getElementById('result-copy');
const resultKicker = document.getElementById('result-kicker');
const finalScore = document.getElementById('final-score');
const bestLabel = document.getElementById('best');

let hub;
try { hub = await connect(); } catch (error) { statusLabel.textContent = error.message; }
document.getElementById('back').addEventListener('click', backToMenu);

const map = [
    '################', '#..............#', '#.####.#####...#', '#.#..#.....#...#', '#.#..#.###.#.###', '#....#...#.#...#', '###.#####.#.##.#', '#...#.....#....#', '#.###.########.#', '#.....#........#', '#.#####.######.#', '#..............#', '################',
];
const keys = new Set();
const rays = [];
let run = null;
let animationId = 0;
let lastFrame = 0;
let mouseTurn = 0;
let localBest = Number(localStorage.getItem('dungeon-best') || 0);
bestLabel.textContent = String(localBest).padStart(5, '0');

addEventListener('keydown', (event) => { if (['w', 'a', 's', 'd', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); keys.add(event.key.toLowerCase()); } });
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('click', () => { if (run && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); else strike(); });
addEventListener('mousemove', (event) => { if (document.pointerLockElement === canvas) mouseTurn += event.movementX * .0025; });
document.getElementById('start').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', startGame);
addEventListener('resize', resize);
resize();

function resize() { const ratio = Math.min(devicePixelRatio || 1, 2); canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
function isWall(x, y) { return map[Math.floor(y)]?.[Math.floor(x)] === '#'; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function startGame() {
    startPanel.classList.add('hidden'); endPanel.classList.add('hidden');
    run = { x: 1.7, y: 1.7, angle: 0, health: 100, shards: 0, started: performance.now(), score: 0, enemies: [{ x: 5.3, y: 3.5, health: 2, alive: true }, { x: 11.5, y: 7.3, health: 2, alive: true }, { x: 7.5, y: 10.8, health: 3, alive: true }], items: [{ x: 13.4, y: 1.7, taken: false }, { x: 2.5, y: 9.8, taken: false }, { x: 10.5, y: 5.5, taken: false }], gate: { x: 14.3, y: 11.5 }, lastStrike: 0, hurtAt: 0 };
    statusLabel.textContent = 'The gate is sealed. Find the three relic shards.'; objectiveLabel.textContent = 'FIND THE RELIC'; depthLabel.textContent = '01'; lastFrame = performance.now(); cancelAnimationFrame(animationId); animationId = requestAnimationFrame(frame);
}
function move(delta) {
    const turn = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0) + mouseTurn / Math.max(delta, .001); run.angle += turn * delta * 2.4; mouseTurn = 0;
    const forward = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0); const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0); const speed = 2.35; const dx = (Math.cos(run.angle) * forward - Math.sin(run.angle) * side) * speed * delta; const dy = (Math.sin(run.angle) * forward + Math.cos(run.angle) * side) * speed * delta;
    if (!isWall(run.x + dx + Math.sign(dx) * .18, run.y)) run.x += dx; if (!isWall(run.x, run.y + dy + Math.sign(dy) * .18)) run.y += dy;
}
function strike() {
    if (!run || performance.now() - run.lastStrike < 420) return; run.lastStrike = performance.now();
    const target = run.enemies.filter((enemy) => enemy.alive && distance(run, enemy) < 2.25).sort((a, b) => distance(run, a) - distance(run, b))[0];
    if (!target) { statusLabel.textContent = 'Your blade cuts only dust.'; return; }
    const relative = Math.atan2(target.y - run.y, target.x - run.x); const angle = Math.atan2(Math.sin(relative - run.angle), Math.cos(relative - run.angle));
    if (Math.abs(angle) < .42) { target.health -= 1; statusLabel.textContent = target.health ? 'A hit. The guardian recoils.' : 'The guardian falls into the dark.'; target.alive = target.health > 0; }
}
function updateEnemies(delta, now) {
    run.enemies.forEach((enemy) => { if (!enemy.alive) return; const gap = distance(run, enemy); if (gap < 5 && gap > .7) { const dx = (run.x - enemy.x) / gap * delta * .42; const dy = (run.y - enemy.y) / gap * delta * .42; if (!isWall(enemy.x + dx, enemy.y)) enemy.x += dx; if (!isWall(enemy.x, enemy.y + dy)) enemy.y += dy; } if (gap < .82 && now - run.hurtAt > 800) { run.health -= 12; run.hurtAt = now; statusLabel.textContent = 'The guardian strikes you.'; } });
}
function checkGoals(now) {
    run.items.forEach((item) => { if (!item.taken && distance(run, item) < .65) { item.taken = true; run.shards += 1; statusLabel.textContent = `Relic shard recovered. ${3 - run.shards} remain.`; } });
    if (run.shards === 3) { objectiveLabel.textContent = 'REACH THE IRON GATE'; statusLabel.textContent = 'The gate can hear the relic. Find your way out.'; }
    if (run.shards === 3 && distance(run, run.gate) < .8) finish(true);
    if (run.health <= 0) finish(false, 'The dark takes you.');
    if ((now - run.started) / 1000 >= 90) finish(false, 'The bell tolls. The keep closes around you.');
}
function finish(escaped, message = '') {
    if (!run) return; cancelAnimationFrame(animationId); const elapsed = (performance.now() - run.started) / 1000; run.score = escaped ? Math.max(100, Math.floor(10000 + run.shards * 900 - elapsed * 70 + run.health * 12)) : Math.floor(run.shards * 500 + run.health * 2); const score = Math.max(0, run.score); localBest = Math.max(localBest, score); localStorage.setItem('dungeon-best', localBest); finalScore.textContent = String(score).padStart(5, '0'); bestLabel.textContent = String(localBest).padStart(5, '0'); resultKicker.textContent = escaped ? 'THE KEEP REMEMBERS' : 'THE DESCENT ENDS'; resultTitle.textContent = escaped ? 'ESCAPED.' : 'LOST.'; resultCopy.textContent = message || `You escaped in ${elapsed.toFixed(1)} seconds with the relic.`; endPanel.classList.remove('hidden'); submitScore(score); run = null;
}
async function submitScore(score) { if (!hub || hub.offline) return; try { const result = await hub.api('submit_score', { score }); if (result?.best_score) bestLabel.textContent = String(result.best_score).padStart(5, '0'); } catch (error) { statusLabel.textContent = `Score sync unavailable: ${error.message}`; } }
function frame(now) { if (!run) return; const delta = Math.min((now - lastFrame) / 1000, .05); lastFrame = now; move(delta); updateEnemies(delta, now); checkGoals(now); if (!run) return; updateHud(now); draw(); animationId = requestAnimationFrame(frame); }
function updateHud(now) { const elapsed = (now - run.started) / 1000; timerLabel.textContent = Math.max(0, Math.ceil(90 - elapsed)); healthLabel.textContent = Math.max(0, run.health); healthMeter.style.width = `${Math.max(0, run.health)}%`; shardsLabel.textContent = `${run.shards} / 3`; run.score = Math.floor(run.shards * 300 + elapsed * 2); scoreLabel.textContent = String(run.score).padStart(5, '0'); }
function cast(angle) { let distanceToWall = 0; const step = .025; while (distanceToWall < 20) { distanceToWall += step; if (isWall(run.x + Math.cos(angle) * distanceToWall, run.y + Math.sin(angle) * distanceToWall)) break; } return distanceToWall; }
function draw() {
    const width = canvas.clientWidth; const height = canvas.clientHeight; const horizon = height * .48; ctx.clearRect(0, 0, width, height); const sky = ctx.createLinearGradient(0, 0, 0, horizon); sky.addColorStop(0, '#111525'); sky.addColorStop(1, '#382b2d'); ctx.fillStyle = sky; ctx.fillRect(0, 0, width, horizon); const floor = ctx.createLinearGradient(0, horizon, 0, height); floor.addColorStop(0, '#271d20'); floor.addColorStop(1, '#090a0d'); ctx.fillStyle = floor; ctx.fillRect(0, horizon, width, height - horizon); const fov = Math.PI / 3; const columnWidth = Math.max(2, width / 360); rays.length = 0;
    for (let x = 0; x < width; x += columnWidth) { const rayAngle = run.angle - fov / 2 + (x / width) * fov; const raw = cast(rayAngle); const corrected = raw * Math.cos(rayAngle - run.angle); const wallHeight = Math.min(height * 1.5, height * .78 / Math.max(.08, corrected)); const shade = Math.max(24, 132 - corrected * 10); ctx.fillStyle = `rgb(${shade + 17}, ${shade + 10}, ${shade})`; ctx.fillRect(x, horizon - wallHeight / 2, columnWidth + 1, wallHeight); rays.push({ x, distance: corrected }); }
    const sprites = [...run.items.filter((item) => !item.taken).map((item) => ({ ...item, type: 'shard' })), ...run.enemies.filter((enemy) => enemy.alive).map((enemy) => ({ ...enemy, type: 'enemy' })), { ...run.gate, type: 'gate' }].map((sprite) => { const dx = sprite.x - run.x; const dy = sprite.y - run.y; const relative = Math.atan2(Math.sin(Math.atan2(dy, dx) - run.angle), Math.cos(Math.atan2(dy, dx) - run.angle)); return { sprite, relative, distance: Math.hypot(dx, dy), depth: Math.cos(relative) * Math.hypot(dx, dy) }; }).filter((item) => Math.abs(item.relative) < fov * .65 && item.depth > .15).sort((a, b) => b.depth - a.depth);
    sprites.forEach(({ sprite, relative, depth }) => { const screenX = width / 2 + Math.tan(relative) / Math.tan(fov / 2) * width / 2; const size = Math.min(height * 1.1, height * .7 / depth); const centerY = horizon + Math.sin((performance.now() / 400) + sprite.x) * 3; const visibleWall = rays[Math.min(rays.length - 1, Math.max(0, Math.floor(screenX / width * rays.length)))]; if (!visibleWall || depth > visibleWall.distance + .2) return; if (sprite.type === 'enemy') drawEnemy(screenX, centerY, size); else if (sprite.type === 'shard') drawShard(screenX, centerY, size); else drawGate(screenX, centerY, size); });
}
function drawEnemy(x, y, size) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, size * .38, size * .25, size * .08, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#211d2b'; ctx.beginPath(); ctx.arc(0, -size * .14, size * .18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8f3034'; ctx.fillRect(-size * .14, -size * .2, size * .07, size * .04); ctx.fillRect(size * .07, -size * .2, size * .07, size * .04); ctx.fillStyle = '#4d3441'; ctx.beginPath(); ctx.moveTo(-size * .18, size * .3); ctx.lineTo(-size * .1, -size * .03); ctx.lineTo(size * .1, -size * .03); ctx.lineTo(size * .18, size * .3); ctx.closePath(); ctx.fill(); ctx.restore(); }
function drawShard(x, y, size) { ctx.save(); ctx.translate(x, y - size * .1); ctx.rotate(performance.now() / 800); ctx.shadowBlur = 22; ctx.shadowColor = '#e5b95c'; ctx.fillStyle = '#e5b95c'; ctx.beginPath(); ctx.moveTo(0, -size * .3); ctx.lineTo(size * .1, 0); ctx.lineTo(0, size * .3); ctx.lineTo(-size * .1, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
function drawGate(x, y, size) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#715b43'; ctx.fillRect(-size * .3, -size * .45, size * .6, size * .8); ctx.strokeStyle = '#c49b58'; ctx.lineWidth = Math.max(2, size * .025); for (let i = -.2; i <= .2; i += .13) ctx.strokeRect(size * i, -size * .4, size * .05, size * .7); ctx.restore(); }
