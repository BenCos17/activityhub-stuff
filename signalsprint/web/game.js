import { backToMenu, connect } from 'activityhub';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreLabel = document.getElementById('score');
const bestLabel = document.getElementById('best');
const timeLabel = document.getElementById('time');
const statusLabel = document.getElementById('status');
const startPanel = document.getElementById('start-panel');
const endPanel = document.getElementById('end-panel');
const resultTitle = document.getElementById('result-title');
const resultCopy = document.getElementById('result-copy');

let hub;
try {
    hub = await connect();
} catch (error) {
    statusLabel.textContent = error.message;
}

document.getElementById('back').addEventListener('click', backToMenu);

const keys = new Set();
let animationId;
let lastFrame = 0;
let run = null;
let localBest = Number(localStorage.getItem('signalsprint-best') || 0);
bestLabel.textContent = String(localBest).padStart(4, '0');

addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(event.key)) {
        event.preventDefault();
        keys.add(event.key.toLowerCase());
    }
});
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

document.getElementById('start').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', startGame);

function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
addEventListener('resize', resize);
resize();

function startGame() {
    startPanel.classList.add('hidden');
    endPanel.classList.add('hidden');
    run = { started: performance.now(), lastSpawn: 0, score: 0, obstacles: [], player: { x: canvas.clientWidth / 2, y: canvas.clientHeight - 48 } };
    statusLabel.textContent = 'Find the gap. Keep moving.';
    cancelAnimationFrame(animationId);
    lastFrame = performance.now();
    animationId = requestAnimationFrame(frame);
}

function frame(now) {
    if (!run) return;
    const delta = Math.min((now - lastFrame) / 1000, .04);
    lastFrame = now;
    const elapsed = (now - run.started) / 1000;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const player = run.player;
    player.y = height - 48;
    if (keys.has('arrowleft') || keys.has('a')) player.x -= 330 * delta;
    if (keys.has('arrowright') || keys.has('d')) player.x += 330 * delta;
    player.x = Math.max(18, Math.min(width - 18, player.x));

    if (now - run.lastSpawn > Math.max(360, 760 - elapsed * 10)) {
        run.lastSpawn = now;
        const size = 14 + Math.random() * 15;
        run.obstacles.push({ x: 20 + Math.random() * (width - 40), y: -30, size, speed: 130 + elapsed * 4 });
    }
    run.obstacles.forEach((obstacle) => { obstacle.y += obstacle.speed * delta; });
    run.obstacles = run.obstacles.filter((obstacle) => obstacle.y < height + 40);
    const hit = run.obstacles.some((obstacle) => Math.abs(obstacle.x - player.x) < obstacle.size + 12 && Math.abs(obstacle.y - player.y) < obstacle.size + 14);
    run.score = Math.floor(elapsed * 100);
    draw(width, height, elapsed);
    scoreLabel.textContent = String(run.score).padStart(4, '0');
    timeLabel.textContent = Math.max(0, 30 - elapsed).toFixed(1);
    if (hit || elapsed >= 30) return finishRun(hit ? 'Signal interrupted.' : 'Clean signal.');
    animationId = requestAnimationFrame(frame);
}

function draw(width, height, elapsed) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0c1618';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(94, 230, 208, .09)';
    ctx.lineWidth = 1;
    for (let x = 24; x < width; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 24; y < height; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(216, 255, 98, .18)';
    ctx.beginPath(); ctx.moveTo(0, height - 48); ctx.lineTo(width, height - 48); ctx.stroke();
    run.obstacles.forEach((obstacle) => {
        ctx.fillStyle = '#ff806f';
        ctx.shadowColor = '#ff806f';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(obstacle.x, obstacle.y - obstacle.size);
        ctx.lineTo(obstacle.x + obstacle.size, obstacle.y);
        ctx.lineTo(obstacle.x, obstacle.y + obstacle.size);
        ctx.lineTo(obstacle.x - obstacle.size, obstacle.y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    });
    const pulse = 1 + Math.sin(elapsed * 8) * .08;
    ctx.fillStyle = '#d8ff62';
    ctx.shadowColor = '#d8ff62';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(run.player.x, run.player.y, 12 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

async function finishRun(message) {
    cancelAnimationFrame(animationId);
    const finalScore = run.score;
    const previousBest = localBest;
    if (finalScore > localBest) {
        localBest = finalScore;
        localStorage.setItem('signalsprint-best', String(localBest));
    }
    bestLabel.textContent = String(localBest).padStart(4, '0');
    resultTitle.textContent = message;
    resultCopy.textContent = finalScore > previousBest ? `New local best: ${finalScore}. Transmit your result to save it.` : `You scored ${finalScore}. Beat ${localBest} next run.`;
    endPanel.classList.remove('hidden');
    statusLabel.textContent = 'Run complete.';
    if (hub && !hub.offline) {
        try {
            const result = await hub.api('submit_score', { score: finalScore });
            resultCopy.textContent = result.is_new_best ? `New server best: ${result.best_score}.` : `Score transmitted. Server best: ${result.best_score}.`;
        } catch (error) {
            statusLabel.textContent = error.message;
        }
    }
    run = null;
}
