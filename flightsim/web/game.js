import { backToMenu, connect } from 'activityhub';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreLabel = document.getElementById('score');
const bestLabel = document.getElementById('best');
const phaseLabel = document.getElementById('phase');
const altitudeLabel = document.getElementById('altitude');
const speedLabel = document.getElementById('speed');
const fuelLabel = document.getElementById('fuel');
const headingLabel = document.getElementById('heading');
const timerLabel = document.getElementById('timer');
const statusLabel = document.getElementById('status');
const altitudeMeter = document.getElementById('altitude-meter');
const speedMeter = document.getElementById('speed-meter');
const fuelMeter = document.getElementById('fuel-meter');
const engineValue = document.getElementById('engine-value');
const engineMeter = document.getElementById('engine-meter');
const verticalValue = document.getElementById('vertical-value');
const trafficCount = document.getElementById('traffic-count');
const radar = document.getElementById('radar');
const radarContext = radar.getContext('2d');
const trafficDetail = document.getElementById('traffic-detail');
const startPanel = document.getElementById('start-panel');
const endPanel = document.getElementById('end-panel');
const resultTitle = document.getElementById('result-title');
const resultCopy = document.getElementById('result-copy');

let hub;
try { hub = await connect(); } catch (error) { statusLabel.textContent = error.message; }
document.getElementById('back').addEventListener('click', backToMenu);

const keys = new Set();
let animationId;
let lastFrame = 0;
let run = null;
let liveTraffic = [];
let localBest = Number(localStorage.getItem('flightsim-best') || 0);
bestLabel.textContent = String(localBest).padStart(5, '0');

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
    run = { started: performance.now(), lastCloud: 0, score: 0, fuel: 100, altitude: 0, speed: 0, heading: 90, target: 50, clouds: [] };
    statusLabel.textContent = 'Throttle up. Rotate at 120 knots.';
    cancelAnimationFrame(animationId);
    lastFrame = performance.now();
    refreshTraffic();
    animationId = requestAnimationFrame(frame);
}

async function refreshTraffic() {
    if (!hub || hub.offline) {
        trafficCount.textContent = 'PREVIEW';
        statusLabel.textContent = 'Live traffic is available inside Discord.';
        return;
    }
    try {
        const result = await hub.api('get_traffic', {});
        liveTraffic = result.aircraft || [];
        trafficCount.textContent = result.configured ? `${String(liveTraffic.length).padStart(2, '0')} AC` : 'OFFLINE';
        updateTrafficDetail();
        if (result.error) {
            trafficCount.textContent = 'ERROR';
            statusLabel.textContent = result.error;
        } else if (!result.configured) {
            statusLabel.textContent = 'Owner has not configured Airplanes.Live.';
        } else {
            statusLabel.textContent = liveTraffic.length ? 'Traffic feed current.' : 'No aircraft in the 40 NM area.';
        }
    } catch (error) {
        trafficCount.textContent = 'ERROR';
        statusLabel.textContent = `Traffic service error: ${error.message || 'ActivityHub request failed.'}`;
        trafficDetail.textContent = 'CHECK BOT CONSOLE / API KEY';
    }
}

function updateTrafficDetail() {
    const aircraft = liveTraffic[0];
    if (!aircraft) {
        trafficDetail.textContent = 'NO CONTACT SELECTED';
        return;
    }
    const name = aircraft.callsign || aircraft.registration || 'UNKNOWN CONTACT';
    const altitude = aircraft.altitude === 'ground' ? 'GND' : `${aircraft.altitude || '?'} FT`;
    const speed = aircraft.speed ? `${Math.round(aircraft.speed)} KT` : 'SPEED ?';
    const heading = aircraft.heading ? `HDG ${Math.round(aircraft.heading)}°` : 'HDG ?';
    trafficDetail.textContent = `${name} / ${aircraft.type} / ${altitude}\n${speed} / ${heading} / SQK ${aircraft.squawk || '----'}`;
}

setInterval(refreshTraffic, 15000);

function frame(now) {
    if (!run) return;
    const delta = Math.min((now - lastFrame) / 1000, .04);
    lastFrame = now;
    const elapsed = (now - run.started) / 1000;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const steering = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    run.heading += steering * 62 * delta;
    run.heading = Math.max(8, Math.min(172, run.heading));
    run.speed = Math.min(460, run.speed + (elapsed < 8 ? 30 : 2) * delta);
    if (elapsed > 7) run.speed -= 5 * delta;
    run.speed = Math.max(0, run.speed);
    const climb = elapsed < 14 ? 560 : elapsed < 43 ? 16 : -470;
    run.altitude = Math.max(0, run.altitude + climb * delta + steering * 22 * delta);
    run.fuel = Math.max(0, 100 - elapsed * 1.25);
    run.target = elapsed < 14 ? 50 : elapsed < 43 ? 50 + Math.sin(elapsed * .35) * 14 : 50;
    if (now - run.lastCloud > 900) {
        run.lastCloud = now;
        run.clouds.push({ x: Math.random() * width, y: -30, size: 12 + Math.random() * 18, speed: 30 + Math.random() * 25 });
    }
    run.clouds.forEach((cloud) => cloud.y += cloud.speed * delta);
    run.clouds = run.clouds.filter((cloud) => cloud.y < height + 40);
    run.score = Math.floor(elapsed * 120 + Math.max(0, 100 - Math.abs(run.altitude / 100 - run.target)) * elapsed * 2);
    draw(width, height, elapsed);
    updateInstruments(elapsed);
    if (run.fuel <= 0) return finishRun('Fuel exhausted.');
    if (elapsed >= 60) return finishRun(Math.abs(run.altitude) < 120 ? 'Landed safely.' : 'Hard landing.');
    animationId = requestAnimationFrame(frame);
}

function updateInstruments(elapsed) {
    const altitude = Math.round(run.altitude);
    altitudeLabel.textContent = String(altitude).padStart(4, '0');
    speedLabel.textContent = String(Math.round(run.speed)).padStart(3, '0');
    fuelLabel.textContent = String(Math.round(run.fuel)).padStart(3, '0');
    headingLabel.textContent = `${String(Math.round(run.heading)).padStart(3, '0')}°`;
    scoreLabel.textContent = String(run.score).padStart(5, '0');
    timerLabel.textContent = `SORTIE ${Math.max(0, 60 - elapsed).toFixed(1)}`;
    if (altitudeMeter) altitudeMeter.style.width = `${Math.min(100, run.altitude / 12)}%`;
    if (speedMeter) speedMeter.style.width = `${Math.min(100, run.speed / 5)}%`;
    if (fuelMeter) fuelMeter.style.height = `${run.fuel}%`;
    if (engineValue) engineValue.textContent = String(Math.round(Math.min(100, run.speed / 4.6)));
    if (engineMeter) engineMeter.style.height = `${Math.min(100, run.speed / 4.6)}%`;
    if (verticalValue) verticalValue.textContent = String(Math.round(elapsed < 14 ? 560 : elapsed < 43 ? 16 : -470)).padStart(3, '0');
    phaseLabel.textContent = elapsed < 8 ? 'TAKEOFF' : elapsed < 43 ? 'CRUISE' : 'APPROACH';
    statusLabel.textContent = elapsed < 8 ? 'Rotate. Positive climb confirmed.' : elapsed < 43 ? 'Maintain heading. Watch your altitude.' : 'Approach runway 27. Bring it home.';
}

function draw(width, height, elapsed) {
    ctx.clearRect(0, 0, width, height);
    const horizon = height * (.42 + (50 - Math.min(100, run.altitude / 12)) * .001);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#193e57'); sky.addColorStop(.62, '#6a9b9d'); sky.addColorStop(.63, '#293b38'); sky.addColorStop(1, '#111e20');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(224, 243, 235, .2)'; ctx.lineWidth = 1;
    for (let y = horizon + 30; y < height; y += 34 + (y - horizon) * .1) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    for (let x = -width; x < width * 2; x += 90) { ctx.beginPath(); ctx.moveTo(width / 2 + (x - width / 2) * .08, horizon); ctx.lineTo(x, height); ctx.stroke(); }
    ctx.fillStyle = 'rgba(236, 247, 240, .33)';
    run.clouds.forEach((cloud) => { ctx.beginPath(); ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2); ctx.fill(); });
    const runwayWidth = Math.max(30, width * (.06 + (1 - run.altitude / 12000) * .7));
    ctx.fillStyle = '#202c2e'; ctx.beginPath(); ctx.moveTo(width / 2 - runwayWidth, height); ctx.lineTo(width / 2 + runwayWidth, height); ctx.lineTo(width / 2 + 4, horizon + 25); ctx.lineTo(width / 2 - 4, horizon + 25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f3ca62'; ctx.setLineDash([18, 14]); ctx.beginPath(); ctx.moveTo(width / 2, horizon + 28); ctx.lineTo(width / 2, height); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(107, 213, 210, .75)'; ctx.beginPath(); ctx.moveTo(width / 2 - 20, height - 44); ctx.lineTo(width / 2 + 20, height - 44); ctx.moveTo(width / 2, height - 54); ctx.lineTo(width / 2, height - 34); ctx.stroke();
    drawLiveTraffic(width, height);
}

function drawLiveTraffic(width, height) {
    liveTraffic.forEach((aircraft) => {
        const x = width / 2 + (aircraft.lon + 77.04138) * 220;
        const y = height * .35 - (aircraft.lat - 38.84916) * 220;
        if (x < 10 || x > width - 10 || y < 10 || y > height * .72) return;
        ctx.fillStyle = '#6bd5d2';
        ctx.shadowColor = '#6bd5d2';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x, y + 2); ctx.lineTo(x - 4, y + 4); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
    });
    radarContext.clearRect(0, 0, radar.width, radar.height);
    radarContext.strokeStyle = 'rgba(107, 213, 210, .2)';
    radarContext.beginPath(); radarContext.moveTo(60, 0); radarContext.lineTo(60, 78); radarContext.moveTo(0, 39); radarContext.lineTo(120, 39); radarContext.stroke();
    radarContext.fillStyle = '#6bd5d2';
    liveTraffic.slice(0, 40).forEach((aircraft) => {
        const x = 60 + (aircraft.lon + 77.04138) * 5.1;
        const y = 39 - (aircraft.lat - 38.84916) * 5.1;
        if (x >= 2 && x <= 118 && y >= 2 && y <= 76) radarContext.fillRect(x - 1, y - 1, 3, 3);
    });
}

async function finishRun(message) {
    cancelAnimationFrame(animationId);
    const finalScore = run.score;
    const previousBest = localBest;
    if (finalScore > localBest) { localBest = finalScore; localStorage.setItem('flightsim-best', String(localBest)); }
    bestLabel.textContent = String(localBest).padStart(5, '0');
    resultTitle.textContent = message;
    resultCopy.textContent = finalScore > previousBest ? `New local best: ${finalScore}.` : `You scored ${finalScore}. Best flight: ${localBest}.`;
    endPanel.classList.remove('hidden');
    statusLabel.textContent = 'Flight report ready.';
    if (hub && !hub.offline) {
        try {
            const result = await hub.api('submit_score', { score: finalScore });
            resultCopy.textContent = result.is_new_best ? `New server best: ${result.best_score}.` : `Score transmitted. Server best: ${result.best_score}.`;
        } catch (error) { statusLabel.textContent = error.message; }
    }
    run = null;
}
