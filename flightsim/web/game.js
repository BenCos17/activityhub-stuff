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
const mapPanel = document.getElementById('map-panel');
const liveMap = document.getElementById('live-map');
const mapStatus = document.getElementById('map-status');
const imageryToggle = document.getElementById('imagery-toggle');
const mapAttribution = document.getElementById('map-attribution');
const selectedFlight = document.getElementById('selected-flight');
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
let selectedAircraft = null;
let mapCenter = { lat: 38.84916, lon: -77.04138 };
const mapZoom = 9;
let mapLayer = 'satellite';
let localBest = Number(localStorage.getItem('flightsim-best') || 0);
bestLabel.textContent = String(localBest).padStart(5, '0');

addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'A', 'D', 'W', 'S'].includes(event.key)) {
        event.preventDefault();
        keys.add(event.key.toLowerCase());
    }
});
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
document.getElementById('start').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', startGame);
document.getElementById('map-toggle').addEventListener('click', () => {
    mapPanel.classList.toggle('hidden');
    if (!mapPanel.classList.contains('hidden')) renderLiveMap();
});
document.getElementById('map-close').addEventListener('click', () => mapPanel.classList.add('hidden'));
imageryToggle.addEventListener('click', () => {
    mapLayer = mapLayer === 'satellite' ? 'street' : 'satellite';
    imageryToggle.textContent = mapLayer === 'satellite' ? 'SATELLITE' : 'STREET MAP';
    mapAttribution.textContent = mapLayer === 'satellite' ? '© ESRI WORLD IMAGERY / 40 NM AIRSPACE' : '© OPENSTREETMAP CONTRIBUTORS / 40 NM AIRSPACE';
    renderLiveMap();
});

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
    run = { started: performance.now(), lastCloud: 0, score: 0, fuel: 100, altitude: 800, speed: 120, heading: 90, pitch: 0, lat: mapCenter.lat, lon: mapCenter.lon, clouds: [] };
    phaseLabel.textContent = 'SANDBOX';
    statusLabel.textContent = 'Free flight ready. Throttle and pitch are yours.';
    cancelAnimationFrame(animationId);
    lastFrame = performance.now();
    refreshTraffic();
    renderLiveMap();
    animationId = requestAnimationFrame(frame);
}

async function refreshTraffic() {
    if (!hub || hub.offline) {
        trafficCount.textContent = 'PREVIEW';
        statusLabel.textContent = 'Live traffic is available inside Discord.';
        return;
    }
    try {
        const result = await hub.api('get_traffic', { lat: mapCenter.lat, lon: mapCenter.lon, radius: 40 });
        liveTraffic = result.aircraft || [];
        trafficCount.textContent = result.configured ? `${String(liveTraffic.length).padStart(2, '0')} AC` : 'OFFLINE';
        updateTrafficDetail();
        renderLiveMap();
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

function projectMap(latitude, longitude) {
    const scale = 256 * 2 ** mapZoom;
    const x = (longitude + 180) / 360 * scale;
    const sinLatitude = Math.sin(latitude * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale;
    return { x, y };
}

function renderLiveMap() {
    if (!liveMap) return;
    liveMap.replaceChildren();
    const center = projectMap(mapCenter.lat, mapCenter.lon);
    const tileSize = 256;
    const width = liveMap.clientWidth || 720;
    const height = liveMap.clientHeight || 420;
    const startX = Math.floor((center.x - width / 2) / tileSize);
    const startY = Math.floor((center.y - height / 2) / tileSize);
    const columns = Math.ceil(width / tileSize) + 2;
    const rows = Math.ceil(height / tileSize) + 2;
    const maxTile = 2 ** mapZoom;
    for (let row = startY; row < startY + rows; row += 1) {
        for (let column = startX; column < startX + columns; column += 1) {
            const image = document.createElement('img');
            image.className = 'map-tile';
            image.alt = '';
            image.loading = 'lazy';
            const tileX = ((column % maxTile) + maxTile) % maxTile;
            const tileY = Math.max(0, Math.min(maxTile - 1, row));
            image.src = mapLayer === 'satellite'
                ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${mapZoom}/${tileY}/${tileX}`
                : `https://tile.openstreetmap.org/${mapZoom}/${tileX}/${tileY}.png`;
            image.style.left = `${column * tileSize - center.x + width / 2}px`;
            image.style.top = `${row * tileSize - center.y + height / 2}px`;
            liveMap.append(image);
        }
    }
    const centerMarker = document.createElement('div');
    centerMarker.className = 'map-center';
    liveMap.append(centerMarker);
    if (run) {
        const playerPoint = projectMap(run.lat, run.lon);
        const playerMarker = document.createElement('div');
        playerMarker.className = 'map-player';
        playerMarker.title = 'Your aircraft';
        playerMarker.style.left = `${playerPoint.x - center.x + width / 2}px`;
        playerMarker.style.top = `${playerPoint.y - center.y + height / 2}px`;
        liveMap.append(playerMarker);
    }
    liveTraffic.forEach((aircraft, index) => {
        const point = projectMap(aircraft.lat, aircraft.lon);
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = `map-marker${selectedAircraft === aircraft ? ' selected' : ''}`;
        marker.style.left = `${point.x - center.x + width / 2}px`;
        marker.style.top = `${point.y - center.y + height / 2}px`;
        marker.title = aircraft.callsign || aircraft.registration || `Aircraft ${index + 1}`;
        const label = document.createElement('span');
        label.textContent = aircraft.callsign || aircraft.registration || aircraft.type;
        marker.append(label);
        marker.addEventListener('click', () => selectAircraft(aircraft));
        liveMap.append(marker);
    });
    mapStatus.textContent = `${liveTraffic.length} CONTACTS / 15S CACHE`;
}

function selectAircraft(aircraft) {
    selectedAircraft = aircraft;
    const name = aircraft.callsign || aircraft.registration || 'UNKNOWN';
    selectedFlight.textContent = `${name} / ${aircraft.type} / ${aircraft.altitude || 'GND'} FT / ${aircraft.speed ? Math.round(aircraft.speed) : '?'} KT`;
    updateTrafficDetail();
    renderLiveMap();
}

setInterval(refreshTraffic, 15000);
setInterval(() => {
    if (run) {
        mapCenter = { lat: run.lat, lon: run.lon };
        if (!mapPanel.classList.contains('hidden')) renderLiveMap();
    }
}, 2000);

function frame(now) {
    if (!run) return;
    const delta = Math.min((now - lastFrame) / 1000, .04);
    lastFrame = now;
    const elapsed = (now - run.started) / 1000;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const steering = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    const throttle = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const pitchInput = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
    run.heading = (run.heading + steering * 75 * delta + 360) % 360;
    run.pitch += (pitchInput * 32 - run.pitch * 2.8) * delta;
    run.pitch = Math.max(-18, Math.min(18, run.pitch));
    run.speed = Math.max(45, Math.min(520, run.speed + throttle * 150 * delta - (run.speed - 180) * .035 * delta));
    const verticalSpeed = run.pitch * 55;
    run.altitude = Math.max(0, Math.min(20000, run.altitude + verticalSpeed * delta));
    run.fuel = Math.max(0, run.fuel - (.08 + run.speed / 9000) * delta);
    const distanceNm = run.speed * delta / 3600;
    const headingRadians = run.heading * Math.PI / 180;
    run.lat += Math.cos(headingRadians) * distanceNm / 60;
    run.lon += Math.sin(headingRadians) * distanceNm / (60 * Math.max(.2, Math.cos(run.lat * Math.PI / 180)));
    if (now - run.lastCloud > 900) {
        run.lastCloud = now;
        run.clouds.push({ x: Math.random() * width, y: -30, size: 12 + Math.random() * 18, speed: 30 + Math.random() * 25 });
    }
    run.clouds.forEach((cloud) => cloud.y += cloud.speed * delta);
    run.clouds = run.clouds.filter((cloud) => cloud.y < height + 40);
    run.score = Math.floor(elapsed * 120 + run.altitude * .05 + run.speed * .2);
    draw(width, height, elapsed);
    updateInstruments(elapsed);
    if (run.fuel <= 0) return finishRun('Fuel exhausted.');
    animationId = requestAnimationFrame(frame);
}

function updateInstruments(elapsed) {
    const altitude = Math.round(run.altitude);
    altitudeLabel.textContent = String(altitude).padStart(4, '0');
    speedLabel.textContent = String(Math.round(run.speed)).padStart(3, '0');
    fuelLabel.textContent = String(Math.round(run.fuel)).padStart(3, '0');
    headingLabel.textContent = `${String(Math.round(run.heading)).padStart(3, '0')}°`;
    scoreLabel.textContent = String(run.score).padStart(5, '0');
    timerLabel.textContent = `FLIGHT ${elapsed.toFixed(1)}`;
    if (altitudeMeter) altitudeMeter.style.width = `${Math.min(100, run.altitude / 12)}%`;
    if (speedMeter) speedMeter.style.width = `${Math.min(100, run.speed / 5)}%`;
    if (fuelMeter) fuelMeter.style.height = `${run.fuel}%`;
    if (engineValue) engineValue.textContent = String(Math.round(Math.min(100, run.speed / 4.6)));
    if (engineMeter) engineMeter.style.height = `${Math.min(100, run.speed / 4.6)}%`;
    if (verticalValue) verticalValue.textContent = String(Math.round(run.pitch * 55)).padStart(3, '0');
    phaseLabel.textContent = 'SANDBOX';
    statusLabel.textContent = run.fuel < 20 ? 'LOW FUEL. Find a runway.' : `Free flight / ${run.pitch > 2 ? 'climbing' : run.pitch < -2 ? 'descending' : 'level flight'}.`;
}

function draw(width, height, elapsed) {
    ctx.clearRect(0, 0, width, height);
    drawTopDown(width, height, elapsed);
}

function drawTopDown(width, height, elapsed) {
    const centerX = width / 2;
    const centerY = height / 2;
    const pixelsPerDegree = Math.min(width, height) * .72;
    ctx.fillStyle = '#214c45';
    ctx.fillRect(0, 0, width, height);

    const fieldSize = 130;
    for (let y = -fieldSize; y < height + fieldSize; y += fieldSize) {
        for (let x = -fieldSize; x < width + fieldSize; x += fieldSize) {
            const index = Math.abs(Math.floor(x / fieldSize) * 7 + Math.floor(y / fieldSize) * 3) % 5;
            ctx.fillStyle = ['#315e4b', '#3b684e', '#496b4a', '#6a7649', '#28584b'][index];
            ctx.fillRect(x + ((y / fieldSize) % 2) * 28, y, fieldSize - 4, fieldSize - 4);
        }
    }

    ctx.strokeStyle = 'rgba(224, 228, 174, .35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, height * .82); ctx.bezierCurveTo(width * .22, height * .58, width * .58, height * .9, width + 20, height * .24);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(53, 78, 60, .8)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-20, height * .22); ctx.bezierCurveTo(width * .3, height * .48, width * .58, height * .2, width + 20, height * .7);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(185, 237, 120, .28)';
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring += 1) {
        ctx.beginPath(); ctx.arc(centerX, centerY, ring * 90, 0, Math.PI * 2); ctx.stroke();
    }
    for (let x = centerX % 90; x < width; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = centerY % 90; y < height; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(run.heading * Math.PI / 180);
    ctx.fillStyle = '#293438';
    ctx.fillRect(-width * .22, -3, width * .44, 6);
    ctx.fillStyle = '#ffdc65';
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(8, 13); ctx.lineTo(0, 8); ctx.lineTo(-8, 13); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'white'; ctx.stroke();
    ctx.restore();

    liveTraffic.forEach((aircraft) => {
        const x = centerX + (aircraft.lon - run.lon) * pixelsPerDegree;
        const y = centerY - (aircraft.lat - run.lat) * pixelsPerDegree;
        if (x < -20 || x > width + 20 || y < -20 || y > height + 20) return;
        ctx.fillStyle = '#72e4ee';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(7, 35, 43, .8)';
        ctx.font = '10px Consolas';
        ctx.fillText(aircraft.callsign || aircraft.registration || aircraft.type, x + 8, y + 3);
    });

    ctx.fillStyle = 'rgba(245, 248, 243, .75)';
    ctx.font = '10px Consolas';
    ctx.fillText('2D AIRSPACE / 40 NM', 18, 24);
    ctx.fillText(`${run.lat.toFixed(3)}° ${run.lon.toFixed(3)}°`, 18, 40);
    ctx.fillText(`T+${elapsed.toFixed(0)} SEC`, width - 95, 24);
}

function drawTerrain(width, height, horizon, elapsed) {
    const ground = ctx.createLinearGradient(0, horizon, 0, height);
    ground.addColorStop(0, '#6d9590');
    ground.addColorStop(.2, '#527d69');
    ground.addColorStop(1, '#1d382f');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, width, height - horizon);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, width, height - horizon);
    ctx.clip();

    const drift = (elapsed * 7) % 150;
    const fields = [
        ['#507c5c', -180, 72, 310, 120, -0.08], ['#668a56', 150, 70, 270, 145, 0.12],
        ['#8e955d', 420, 66, 260, 125, -0.04], ['#3e725f', -280, 205, 410, 170, 0.08],
        ['#8a8752', 210, 220, 330, 190, -0.12], ['#4d7956', 610, 185, 340, 210, 0.05],
        ['#6f8750', -120, 385, 360, 230, -0.1], ['#a18f57', 260, 405, 420, 250, 0.09],
        ['#3e684e', 650, 390, 410, 260, -0.06]
    ];
    fields.forEach(([color, x, y, fieldWidth, fieldHeight, angle]) => {
        ctx.save();
        ctx.translate(x + width / 2 - 440, horizon + y - drift * .16);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.fillRect(-fieldWidth / 2, -fieldHeight / 2, fieldWidth, fieldHeight);
        ctx.strokeStyle = 'rgba(230, 215, 145, .14)';
        ctx.lineWidth = 2;
        for (let row = -fieldHeight / 2; row < fieldHeight / 2; row += 12) {
            ctx.beginPath(); ctx.moveTo(-fieldWidth / 2, row); ctx.lineTo(fieldWidth / 2, row); ctx.stroke();
        }
        ctx.restore();
    });

    ctx.strokeStyle = 'rgba(232, 230, 192, .62)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, height * .93); ctx.bezierCurveTo(width * .2, height * .64, width * .56, height * .86, width + 35, horizon + 55);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 248, 202, .2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width * .04, height); ctx.bezierCurveTo(width * .27, height * .72, width * .59, height * .91, width * .96, horizon + 35);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(48, 68, 54, .85)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-40, horizon + 80); ctx.bezierCurveTo(width * .28, horizon + 125, width * .63, horizon + 42, width + 30, horizon + 105);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(184, 198, 157, .5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let x = -30; x < width + 40; x += 24) {
        const treeY = horizon + 86 + Math.sin(x * .04) * 14;
        ctx.fillStyle = '#214b42';
        ctx.beginPath(); ctx.arc(x, treeY, 8, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = 'rgba(237, 244, 226, .18)';
    ctx.fillRect(0, horizon, width, 18);
    ctx.restore();
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
