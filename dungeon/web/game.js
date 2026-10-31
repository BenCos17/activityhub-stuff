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
const weaponLabel = document.getElementById('weapon');
const shardsLabel = document.getElementById('shards');
const scoreLabel = document.getElementById('score');
const depthLabel = document.getElementById('depth');
const resultTitle = document.getElementById('result-title');
const resultCopy = document.getElementById('result-copy');
const resultKicker = document.getElementById('result-kicker');
const finalScore = document.getElementById('final-score');
const bestLabel = document.getElementById('best');
const bossHud = document.getElementById('boss-hud');
const bossNameLabel = document.getElementById('boss-name');
const bossHealthLabel = document.getElementById('boss-health-label');
const bossMeter = document.getElementById('boss-meter');

let hub;
try { hub = await connect(); } catch (error) { statusLabel.textContent = error.message; }
document.getElementById('back').addEventListener('click', backToMenu);

const map = [
    '################', '#..............#', '#.####.#####...#', '#.#..#.....#...#', '#.#..#.###.#.###', '#....#...#.#...#', '###.#####.#.##.#', '#...#.....#....#', '#.###.########.#', '#.....#........#', '#.#####.######.#', '#..............#', '################',
];
const arenaMap = [
    '#################', '#.......#.......#', '#...............#', '#.......#.......#', '#...............#', '#.......#.......#', '#...............#', '#.......#.......#', '#...............#', '#.......#.......#', '#...............#', '#...............#', '#################',
];
const keys = new Set();
const rays = [];
let run = null;
let animationId = 0;
let lastFrame = 0;
let mouseTurn = 0;
let audioContext = null;
let localBest = Number(localStorage.getItem('dungeon-best') || 0);
bestLabel.textContent = String(localBest).padStart(5, '0');

function playSound(frequency, duration = .12, type = 'sine', volume = .035, slide = 0) {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.linearRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
}

addEventListener('keydown', (event) => { if (['w', 'a', 's', 'd', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); keys.add(event.key.toLowerCase()); } });
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('click', () => { if (run && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); else strike(); });
addEventListener('mousemove', (event) => { if (document.pointerLockElement === canvas) mouseTurn += event.movementX * .0025; });
document.getElementById('start').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', startGame);
addEventListener('resize', resize);
resize();

function resize() { const ratio = Math.min(devicePixelRatio || 1, 2); canvas.width = canvas.clientWidth * ratio; canvas.height = canvas.clientHeight * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
function activeMap() { return run?.level > 1 ? arenaMap : map; }
function isWall(x, y) { return activeMap()[Math.floor(y)]?.[Math.floor(x)] === '#'; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function randomPotions(level, occupied, gate) {
    const available = [];
    const levelMap = activeMap();
    for (let y = 1; y < levelMap.length - 1; y += 1) {
        for (let x = 1; x < levelMap[y].length - 1; x += 1) {
            const position = { x: x + .5, y: y + .5 };
            if (!isWall(position.x, position.y) && distance(position, { x: 1.7, y: 1.7 }) > 2.2 && distance(position, gate) > 1.2 && !occupied.some((item) => distance(position, item) < 1.1)) available.push(position);
        }
    }
    const count = Math.min(4, 1 + Math.floor(level / 2));
    for (let index = available.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(Math.random() * (index + 1));[available[index], available[swapIndex]] = [available[swapIndex], available[index]]; }
    return available.slice(0, count).map((position) => ({ ...position, type: 'potion', taken: false }));
}
function levelSetup(level) {
    const enemies = level === 1
        ? [{ x: 5.3, y: 3.5, health: 2, maxHealth: 2, alive: true }, { x: 11.5, y: 7.3, health: 2, maxHealth: 2, alive: true }, { x: 7.5, y: 10.8, health: 3, maxHealth: 3, alive: true }]
        : [{ x: 3.5, y: 2.5, health: 2, maxHealth: 2, alive: true }, { x: 13.5, y: 10.5, health: 3, maxHealth: 3, alive: true }, { x: 8.5, y: 6.5, health: 8 + level * 2, maxHealth: 8 + level * 2, alive: true, boss: true, name: level % 2 ? 'KEEP LORD' : 'IRON WARDEN' }];
    const extraPositions = [{ x: 3.5, y: 1.7 }, { x: 7.5, y: 7.5 }, { x: 13.5, y: 7.5 }, { x: 4.5, y: 11.5 }, { x: 12.5, y: 11.5 }];
    extraPositions.slice(0, Math.min(5, Math.floor((level - 1) / 2))).forEach((position) => enemies.push({ ...position, health: 2 + Math.floor(level / 3), maxHealth: 2 + Math.floor(level / 3), alive: true }));
    const gate = { x: 14.3, y: 11.5 };
    const shards = level === 1 ? [{ x: 13.4, y: 1.7, type: 'shard', taken: false }, { x: 2.5, y: 9.8, type: 'shard', taken: false }, { x: 10.5, y: 5.5, type: 'shard', taken: false }] : [];
    return { enemies, items: [...shards, ...randomPotions(level, [...shards, ...enemies], gate)], gate };
}
function startGame() {
    startPanel.classList.add('hidden'); endPanel.classList.add('hidden');
    const level = levelSetup(1);
    run = { x: 1.7, y: 1.7, angle: 0, health: 100, shards: 0, kills: 0, weaponDamage: 1, weaponName: 'RUSTED BLADE', level: 1, started: performance.now(), score: 0, enemies: level.enemies, items: level.items, gate: level.gate, gateOpenProgress: 0, gateSoundPlayed: false, lastStrike: 0, hurtAt: 0 };
    weaponLabel.textContent = run.weaponName;
    playSound(180, .28, 'triangle', .04, 90); statusLabel.textContent = 'The gate is sealed. Find the three relic shards.'; objectiveLabel.textContent = 'FIND THE RELIC'; depthLabel.textContent = '01'; bossHud.classList.add('hidden'); lastFrame = performance.now(); cancelAnimationFrame(animationId); animationId = requestAnimationFrame(frame);
}
function advanceLevel() {
    run.level += 1;
    const level = levelSetup(run.level);
    run.x = run.level > 1 ? 8.5 : 1.7; run.y = run.level > 1 ? 10.5 : 1.7; run.angle = run.level > 1 ? -Math.PI / 2 : 0; run.health = Math.min(100, run.health + 25); run.enemies = level.enemies; run.items = level.items; run.gate = level.gate; run.gateOpenProgress = 0; run.gateSoundPlayed = false; run.lastStrike = 0; run.hurtAt = 0;
    playSound(260 + run.level * 18, .3, 'triangle', .04, 100);
    depthLabel.textContent = String(run.level).padStart(2, '0');
    objectiveLabel.textContent = `DEFEAT THE ${level.enemies.find((enemy) => enemy.boss).name}`;
    statusLabel.textContent = `Level ${run.level}: the ${level.enemies.find((enemy) => enemy.boss).name} waits below.`;
    bossHud.classList.remove('hidden');
}
function move(delta) {
    const turn = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0) + mouseTurn / Math.max(delta, .001); run.angle += turn * delta * 2.4; mouseTurn = 0;
    const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0); const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0); const speed = 2.35; const dx = (Math.cos(run.angle) * forward - Math.sin(run.angle) * side) * speed * delta; const dy = (Math.sin(run.angle) * forward + Math.cos(run.angle) * side) * speed * delta;
    if (!isWall(run.x + dx + Math.sign(dx) * .18, run.y)) run.x += dx; if (!isWall(run.x, run.y + dy + Math.sign(dy) * .18)) run.y += dy;
}
function strike() {
    if (!run || performance.now() - run.lastStrike < 420) return; run.lastStrike = performance.now();
    playSound(120, .08, 'sawtooth', .025, 70);
    const target = run.enemies.filter((enemy) => enemy.alive && distance(run, enemy) < 2.25).sort((a, b) => distance(run, a) - distance(run, b))[0];
    if (!target) { statusLabel.textContent = 'Your blade cuts only dust.'; return; }
    const relative = Math.atan2(target.y - run.y, target.x - run.x); const angle = Math.atan2(Math.sin(relative - run.angle), Math.cos(relative - run.angle));
    if (Math.abs(angle) < .42) { target.health -= run.weaponDamage + (target.boss ? 1 : 0); target.alive = target.health > 0; if (!target.alive) { run.kills += 1; run.score += target.boss ? 3000 : 500; if (Math.random() < (target.boss ? .65 : .12)) { const weapon = target.boss ? { name: 'WARDEN\'S MAUL', damage: 3 } : { name: 'RUNE BLADE', damage: 2 }; run.items.push({ x: target.x, y: target.y, type: 'weapon', taken: false, ...weapon }); target.dropName = weapon.name; } } statusLabel.textContent = target.health ? (target.boss ? 'The boss staggers. Keep firing.' : 'A hit. The guardian recoils.') : target.dropName ? `${target.name || 'Guardian'} dropped a ${target.dropName}.` : (target.boss ? `${target.name} falls. Find the gate.` : 'The guardian falls into the dark.'); }
}
function updateEnemies(delta, now) {
    run.enemies.forEach((enemy) => { if (!enemy.alive) return; const gap = distance(run, enemy); if (gap < 5 && gap > .7) { const chaseSpeed = enemy.boss ? .25 : .42; const dx = (run.x - enemy.x) / gap * delta * chaseSpeed; const dy = (run.y - enemy.y) / gap * delta * chaseSpeed; if (!isWall(enemy.x + dx, enemy.y)) enemy.x += dx; if (!isWall(enemy.x, enemy.y + dy)) enemy.y += dy; } if (gap < .82 && now - run.hurtAt > 800) { run.health -= enemy.boss ? 20 : 12; run.hurtAt = now; playSound(70, .16, 'square', .035, -25); statusLabel.textContent = enemy.boss ? `${enemy.name} crushes you.` : 'The guardian strikes you.'; } });
}
function checkGoals(now) {
    run.items.forEach((item) => {
        if (item.taken || distance(run, item) >= .65) return;
        item.taken = true;
        if (item.type === 'shard') {
            run.shards += 1;
            run.health = Math.min(100, run.health + 15);
            run.score += 1000;
            playSound(620, .16, 'sine', .04, 260);
            statusLabel.textContent = `Relic shard recovered. Vitality restored by 15. ${3 - run.shards} remain.`;
        } else if (item.type === 'weapon') {
            if (item.damage > run.weaponDamage) {
                run.weaponDamage = item.damage;
                run.weaponName = item.name;
                weaponLabel.textContent = run.weaponName;
                run.score += 750;
                playSound(420, .3, 'triangle', .045, 360);
                statusLabel.textContent = `${item.name} equipped. Strike damage increased.`;
            } else {
                statusLabel.textContent = `${item.name} found, but your weapon is stronger.`;
            }
        } else {
            run.health = Math.min(100, run.health + 30);
            run.score += 250;
            playSound(520, .2, 'sine', .04, 180);
            statusLabel.textContent = 'Health potion consumed. Vitality restored by 30.';
        }
    });
    const bossAlive = run.enemies.some((enemy) => enemy.boss && enemy.alive);
    if (run.level === 1 && run.shards === 3) { objectiveLabel.textContent = 'REACH THE IRON GATE'; statusLabel.textContent = 'The gate can hear the relic. Find your way out.'; }
    if (run.level > 1 && !bossAlive && distance(run, run.gate) >= .8) { objectiveLabel.textContent = 'REACH THE IRON GATE'; statusLabel.textContent = 'The boss is dead. Find your way out.'; }
    if (((run.level === 1 && run.shards === 3) || (run.level > 1 && !bossAlive)) && distance(run, run.gate) < .8) advanceLevel();
    if (run.health <= 0) finish(false, 'The dark takes you.');
}
function finish(escaped, message = '') {
    if (!run) return; cancelAnimationFrame(animationId); const elapsed = (performance.now() - run.started) / 1000; run.score += escaped ? Math.max(100, Math.floor(run.level * 1500 - elapsed * 20 + run.health * 12)) : run.health * 2; playSound(escaped ? 420 : 80, .4, escaped ? 'triangle' : 'sawtooth', .05, escaped ? 300 : -45); const score = Math.max(0, run.score); localBest = Math.max(localBest, score); localStorage.setItem('dungeon-best', localBest); finalScore.textContent = String(score).padStart(5, '0'); bestLabel.textContent = String(localBest).padStart(5, '0'); resultKicker.textContent = escaped ? 'THE KEEP REMEMBERS' : 'THE DESCENT ENDS'; resultTitle.textContent = escaped ? 'ESCAPED.' : 'LOST.'; resultCopy.textContent = message || `You survived ${run.level} levels in ${elapsed.toFixed(1)} seconds.`; endPanel.classList.remove('hidden'); bossHud.classList.add('hidden'); submitScore(score); run = null;
}
async function submitScore(score) { if (!hub || hub.offline) return; try { const result = await hub.api('submit_score', { score }); if (result?.best_score) bestLabel.textContent = String(result.best_score).padStart(5, '0'); } catch (error) { statusLabel.textContent = `Score sync unavailable: ${error.message}`; } }
function frame(now) { if (!run) return; const delta = Math.min((now - lastFrame) / 1000, .05); lastFrame = now; move(delta); updateEnemies(delta, now); checkGoals(now); if (!run) return; updateHud(now); draw(); animationId = requestAnimationFrame(frame); }
function updateHud(now) { const elapsed = (now - run.started) / 1000; timerLabel.textContent = Math.floor(elapsed).toString().padStart(3, '0'); healthLabel.textContent = Math.max(0, run.health); healthMeter.style.width = `${Math.max(0, run.health)}%`; shardsLabel.textContent = run.level === 1 ? `${run.shards} / 3` : `LEVEL ${run.level}`; scoreLabel.textContent = String(run.score).padStart(5, '0'); const boss = run.enemies.find((enemy) => enemy.boss && enemy.alive); if (boss) { bossHud.classList.remove('hidden'); bossNameLabel.textContent = boss.name; bossHealthLabel.textContent = `${Math.ceil(boss.health / boss.maxHealth * 100)}%`; bossMeter.style.width = `${Math.max(0, boss.health / boss.maxHealth * 100)}%`; } else if (run.level > 1) { bossHud.classList.remove('hidden'); bossNameLabel.textContent = 'GATE OPEN'; bossHealthLabel.textContent = 'DEFEATED'; bossMeter.style.width = '0%'; } }
function cast(angle) { let distanceToWall = 0; const step = .025; while (distanceToWall < 20) { distanceToWall += step; if (isWall(run.x + Math.cos(angle) * distanceToWall, run.y + Math.sin(angle) * distanceToWall)) break; } return distanceToWall; }
function draw() {
    const width = canvas.clientWidth; const height = canvas.clientHeight; const horizon = height * .48; ctx.clearRect(0, 0, width, height); const sky = ctx.createLinearGradient(0, 0, 0, horizon); sky.addColorStop(0, '#101a2b'); sky.addColorStop(1, '#49303f'); ctx.fillStyle = sky; ctx.fillRect(0, 0, width, horizon); const floor = ctx.createLinearGradient(0, horizon, 0, height); floor.addColorStop(0, '#293b43'); floor.addColorStop(1, '#0a121b'); ctx.fillStyle = floor; ctx.fillRect(0, horizon, width, height - horizon); drawCellarFloor(width, height, horizon); const fov = Math.PI / 3; const columnWidth = Math.max(2, width / 360); rays.length = 0;
    for (let x = 0; x < width; x += columnWidth) { const rayAngle = run.angle - fov / 2 + (x / width) * fov; const raw = cast(rayAngle); const corrected = raw * Math.cos(rayAngle - run.angle); const wallHitX = Math.floor(run.x + Math.cos(rayAngle) * raw); const wallHitY = Math.floor(run.y + Math.sin(rayAngle) * raw); const wallHeight = Math.min(height * 1.5, height * .78 / Math.max(.08, corrected)); const light = Math.max(.3, 1 - corrected / 14); const variation = ((wallHitX * 13 + wallHitY * 5) % 7) - 3; const stone = [78 + variation, 86 + variation, 82 + variation]; const wallColor = `rgb(${Math.round(stone[0] * light + 6)}, ${Math.round(stone[1] * light + 7)}, ${Math.round(stone[2] * light + 7)})`; ctx.fillStyle = wallColor; ctx.fillRect(x, horizon - wallHeight / 2, columnWidth + 1, wallHeight); rays.push({ x, distance: corrected }); }
    const sprites = [...run.items.filter((item) => !item.taken), ...run.enemies.filter((enemy) => enemy.alive).map((enemy) => ({ ...enemy, type: 'enemy' })), { ...run.gate, type: 'gate' }].map((sprite) => { const dx = sprite.x - run.x; const dy = sprite.y - run.y; const relative = Math.atan2(Math.sin(Math.atan2(dy, dx) - run.angle), Math.cos(Math.atan2(dy, dx) - run.angle)); return { sprite, relative, distance: Math.hypot(dx, dy), depth: Math.cos(relative) * Math.hypot(dx, dy) }; }).filter((item) => Math.abs(item.relative) < fov * .65 && item.depth > .15).sort((a, b) => b.depth - a.depth);
    sprites.forEach(({ sprite, relative, depth }) => { const screenX = width / 2 + Math.tan(relative) / Math.tan(fov / 2) * width / 2; const size = Math.min(height * 1.1, height * .7 / depth); const centerY = horizon + Math.sin((performance.now() / 400) + sprite.x) * 3; const visibleWall = rays[Math.min(rays.length - 1, Math.max(0, Math.floor(screenX / width * rays.length)))]; if (!visibleWall || depth > visibleWall.distance + .2) return; if (sprite.type === 'enemy') { if (sprite.boss) drawBoss(screenX, centerY, size); else drawEnemy(screenX, centerY, size); } else if (sprite.type === 'shard') drawShard(screenX, centerY, size); else if (sprite.type === 'potion') drawPotion(screenX, centerY, size); else if (sprite.type === 'weapon') drawWeapon(screenX, centerY, size); else drawGate(screenX, centerY, size); });
}
function drawEnemy(x, y, size) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, size * .38, size * .25, size * .08, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#211d2b'; ctx.beginPath(); ctx.arc(0, -size * .14, size * .18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8f3034'; ctx.fillRect(-size * .14, -size * .2, size * .07, size * .04); ctx.fillRect(size * .07, -size * .2, size * .07, size * .04); ctx.fillStyle = '#4d3441'; ctx.beginPath(); ctx.moveTo(-size * .18, size * .3); ctx.lineTo(-size * .1, -size * .03); ctx.lineTo(size * .1, -size * .03); ctx.lineTo(size * .18, size * .3); ctx.closePath(); ctx.fill(); ctx.restore(); }
function drawBoss(x, y, size) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.ellipse(0, size * .42, size * .38, size * .1, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 18; ctx.shadowColor = '#e76742'; ctx.fillStyle = '#3a1720'; ctx.beginPath(); ctx.arc(0, -size * .18, size * .27, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e76742'; ctx.fillRect(-size * .18, -size * .25, size * .1, size * .06); ctx.fillRect(size * .08, -size * .25, size * .1, size * .06); ctx.shadowBlur = 0; ctx.fillStyle = '#6e2730'; ctx.beginPath(); ctx.moveTo(-size * .3, size * .36); ctx.lineTo(-size * .2, -size * .03); ctx.lineTo(size * .2, -size * .03); ctx.lineTo(size * .3, size * .36); ctx.closePath(); ctx.fill(); ctx.restore(); }
function drawShard(x, y, size) { ctx.save(); ctx.translate(x, y - size * .1); ctx.rotate(performance.now() / 800); ctx.shadowBlur = 22; ctx.shadowColor = '#e5b95c'; ctx.fillStyle = '#e5b95c'; ctx.beginPath(); ctx.moveTo(0, -size * .3); ctx.lineTo(size * .1, 0); ctx.lineTo(0, size * .3); ctx.lineTo(-size * .1, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
function drawPotion(x, y, size) { ctx.save(); ctx.translate(x, y); ctx.shadowBlur = 16; ctx.shadowColor = '#64d8cf'; ctx.fillStyle = '#64d8cf'; ctx.beginPath(); ctx.arc(0, size * .08, size * .13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d7ad58'; ctx.fillRect(-size * .07, -size * .12, size * .14, size * .08); ctx.restore(); }
function drawWeapon(x, y, size) { ctx.save(); ctx.translate(x, y); ctx.rotate(-.35); ctx.shadowBlur = 18; ctx.shadowColor = '#8ed6d3'; ctx.fillStyle = '#d2e0df'; ctx.fillRect(-size * .035, -size * .3, size * .07, size * .55); ctx.fillStyle = '#d7ad58'; ctx.fillRect(-size * .15, size * .2, size * .3, size * .05); ctx.fillStyle = '#6b4537'; ctx.fillRect(-size * .035, size * .25, size * .07, size * .16); ctx.restore(); }
function drawCellarFloor(width, height, horizon) { ctx.save(); ctx.lineWidth = 1; for (let row = 1; row < 8; row += 1) { const y = horizon + (height - horizon) * (row / 8) ** 1.65; ctx.strokeStyle = `rgba(118, 151, 153, ${.12 - row * .008})`; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y + Math.sin(row * 2.4) * 3); ctx.stroke(); } for (let column = -7; column <= 7; column += 1) { const x = width / 2 + column * width * .09; ctx.strokeStyle = 'rgba(25, 38, 45, .35)'; ctx.beginPath(); ctx.moveTo(width / 2 + column * 2, horizon); ctx.lineTo(x, height); ctx.stroke(); } ctx.restore(); }
function drawGate(x, y, size, gate) { const unlocked = run.level === 1 ? run.shards === 3 : !run.enemies.some((enemy) => enemy.boss && enemy.alive); const nearby = distance(run, gate) < 2.4; const targetProgress = unlocked && nearby ? 1 : 0; run.gateOpenProgress += (targetProgress - run.gateOpenProgress) * .1; const progress = run.gateOpenProgress; ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#3f474c'; ctx.fillRect(-size * .62, -size * .78, size * 1.24, size * 1.2); ctx.fillStyle = '#69747a'; ctx.fillRect(-size * .72, -size * .78, size * .12, size * 1.2); ctx.fillRect(size * .6, -size * .78, size * .12, size * 1.2); ctx.fillStyle = '#59636a'; for (let block = -2; block <= 2; block += 1) { const blockY = block * size * .22 - size * .32; ctx.fillRect(-size * .82, blockY, size * .16, size * .14); ctx.fillRect(size * .66, blockY, size * .16, size * .14); } ctx.fillStyle = '#151b20'; ctx.beginPath(); ctx.moveTo(-size * .5, size * .42); ctx.lineTo(-size * .5, -size * .46); ctx.quadraticCurveTo(0, -size * .9, size * .5, -size * .46); ctx.lineTo(size * .5, size * .42); ctx.closePath(); ctx.fill(); ctx.fillStyle = `rgba(150, 210, 220, ${.08 + progress * .2})`; ctx.fillRect(-size * .42, -size * .42, size * .84, size * .84); ctx.shadowBlur = progress * 18; ctx.shadowColor = '#8ed6d3'; ctx.strokeStyle = '#a4adb1'; ctx.lineWidth = Math.max(2, size * .025); ctx.beginPath(); ctx.moveTo(-size * .48, size * .43); ctx.lineTo(-size * .48, -size * .45); ctx.quadraticCurveTo(0, -size * .88, size * .48, -size * .45); ctx.lineTo(size * .48, size * .43); ctx.stroke(); ctx.fillStyle = '#657078'; ctx.fillRect(-size * .52, size * .38, size * 1.04, size * .08); for (let index = -2; index <= 2; index += 1) { const barX = index * size * .16 + (index < 0 ? -progress * size * .23 : progress * size * .23); ctx.fillStyle = index === 0 ? '#b7c1c5' : '#89949a'; ctx.fillRect(barX - size * .025, -size * .38, size * .05, size * .73); } ctx.fillStyle = progress > .8 ? '#b7eee8' : '#596269'; ctx.beginPath(); ctx.arc(0, size * .02, size * .035, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawGate(x, y, size) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#715b43'; ctx.fillRect(-size * .3, -size * .45, size * .6, size * .8); ctx.strokeStyle = '#c49b58'; ctx.lineWidth = Math.max(2, size * .025); for (let i = -.2; i <= .2; i += .13) ctx.strokeRect(size * i, -size * .4, size * .05, size * .7); ctx.restore(); }
