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
const simWindow = document.querySelector('.sim-window');
const viewToggle = document.getElementById('view-toggle');
const hudToggle = document.getElementById('hud-toggle');

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
let mapZoom = 9;
let mapLayer = 'satellite';
const terrainZoom = 12;
const streetTileCache = new Map();
let mapScene = null;
let playerMarkerEl = null;
let viewMode = 'cockpit';
let localBest = Number(localStorage.getItem('flightsim-best') || 0);
bestLabel.textContent = String(localBest).padStart(5, '0');

function getMapTileUrls(zoom, tileX, tileY) {
    const directUrl = mapLayer === 'street'
        ? `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`
        : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`;
    const proxyUrl = mapLayer === 'street'
        ? `/.proxy/osm/${zoom}/${tileX}/${tileY}.png`
        : `/.proxy/esri/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`;
    try {
        return window.self !== window.top ? [proxyUrl, directUrl] : [directUrl];
    } catch {
        return [proxyUrl, directUrl];
    }
}

function loadMapTile(image, zoom, tileX, tileY) {
    const urls = getMapTileUrls(zoom, tileX, tileY);
    let attempt = 0;
    image.addEventListener('error', () => {
        attempt += 1;
        if (attempt < urls.length) image.src = urls[attempt];
    });
    image.src = urls[attempt];
}

addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's', 'A', 'D', 'W', 'S'].includes(event.key)) {
        event.preventDefault();
        keys.add(event.key.toLowerCase());
    }
});
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
document.getElementById('start').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', startGame);
viewToggle.addEventListener('click', () => {
    viewMode = viewMode === 'cockpit' ? 'exterior' : 'cockpit';
    simWindow.classList.toggle('exterior-view', viewMode === 'exterior');
    viewToggle.innerHTML = viewMode === 'cockpit' ? '▣<small>COCKPIT</small>' : '◇<small>EXTERIOR</small>';
    viewToggle.classList.add('active');
    if (run) draw(canvas.clientWidth, canvas.clientHeight, (performance.now() - run.started) / 1000);
});
hudToggle.addEventListener('click', () => {
    simWindow.classList.toggle('hud-hidden');
    hudToggle.classList.toggle('active');
});
document.getElementById('map-toggle').addEventListener('click', () => {
    const isOpening = mapPanel.classList.contains('hidden');
    mapPanel.classList.toggle('hidden', !isOpening);
    simWindow.classList.toggle('map-view', isOpening);
    document.getElementById('map-toggle').classList.toggle('active', isOpening);
    if (isOpening) renderLiveMap();
});
document.getElementById('map-close').addEventListener('click', () => {
    mapPanel.classList.add('hidden');
    simWindow.classList.remove('map-view');
    document.getElementById('map-toggle').classList.remove('active');
});
imageryToggle.addEventListener('click', () => {
    mapLayer = mapLayer === 'street' ? 'satellite' : 'street';
    imageryToggle.textContent = mapLayer === 'street' ? 'STREET' : 'SATELLITE';
    mapAttribution.textContent = mapLayer === 'street'
        ? '© OpenStreetMap contributors / 40 NM AIRSPACE'
        : '© Esri, Maxar, Earthstar Geographics / 40 NM AIRSPACE';
    renderLiveMap();
});
document.getElementById('zoom-in').addEventListener('click', () => {
    mapZoom = Math.min(13, mapZoom + 1);
    renderLiveMap();
});
document.getElementById('zoom-out').addEventListener('click', () => {
    mapZoom = Math.max(5, mapZoom - 1);
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
    run = { started: performance.now(), lastCloud: 0, score: 0, fuel: 100, altitude: 0, speed: 0, heading: 90, pitch: 0, lat: mapCenter.lat, lon: mapCenter.lon, distance: 0, clouds: [], phase: 'TAKEOFF', runway: 0 };
    phaseLabel.textContent = 'TAKEOFF';
    statusLabel.textContent = 'Advance throttle to begin the takeoff roll.';
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
    playerMarkerEl = null;
    mapScene = document.createElement('div');
    mapScene.className = 'map-scene';
    liveMap.append(mapScene);
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
            loadMapTile(image, mapZoom, tileX, tileY);
            image.referrerPolicy = 'no-referrer-when-downgrade';
            image.style.left = `${column * tileSize - center.x + width / 2}px`;
            image.style.top = `${row * tileSize - center.y + height / 2}px`;
            mapScene.append(image);
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
        playerMarkerEl = playerMarker;
        playerMarker.style.left = `${playerPoint.x - center.x + width / 2}px`;
        playerMarker.style.top = `${playerPoint.y - center.y + height / 2}px`;
        playerMarker.style.transform = `translate(-50%, -50%) rotate(${run.heading}deg)`;
        mapScene.append(playerMarker);
    }
    liveTraffic.forEach((aircraft, index) => {
        const point = projectMap(aircraft.lat, aircraft.lon);
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = `map-marker${selectedAircraft === aircraft ? ' selected' : ''}`;
        marker.style.left = `${point.x - center.x + width / 2}px`;
        marker.style.top = `${point.y - center.y + height / 2}px`;
        marker.title = aircraft.callsign || aircraft.registration || `Aircraft ${index + 1}`;
        const icon = document.createElement('i');
        icon.style.transform = `rotate(${Number(aircraft.heading) || 0}deg)`;
        marker.append(icon);
        const label = document.createElement('span');
        label.textContent = aircraft.callsign || aircraft.registration || aircraft.type;
        marker.append(label);
        marker.addEventListener('click', () => selectAircraft(aircraft));
        mapScene.append(marker);
    });
    updateMapOrientation();
    mapStatus.textContent = `${mapLayer === 'street' ? 'OPENSTREETMAP' : 'ESRI SATELLITE'} / ${liveTraffic.length} CONTACTS`;
}

function updateMapOrientation() {
    if (mapScene) {
        mapScene.style.transform = run ? `rotate(${-run.heading}deg)` : 'none';
    }
    if (playerMarkerEl && run) {
        playerMarkerEl.style.transform = `translate(-50%, -50%) rotate(${run.heading}deg)`;
    }
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
        updateMapOrientation();
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
    const throttle = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const pitchInput = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
    run.heading = (run.heading + steering * (run.phase === 'LANDING' ? 42 : 75) * delta + 360) % 360;
    run.pitch += (pitchInput * 32 - run.pitch * 2.8) * delta;
    run.pitch = Math.max(-18, Math.min(18, run.pitch));
    run.speed = Math.max(0, Math.min(520, run.speed + throttle * 150 * delta - (run.speed - 180) * .035 * delta));
    const verticalSpeed = run.speed < 70 ? 0 : run.pitch * 55;
    run.altitude = Math.max(0, Math.min(20000, run.altitude + verticalSpeed * delta));
    run.fuel = Math.max(0, run.fuel - (.08 + run.speed / 9000) * delta);
    const distanceNm = run.speed * delta / 3600;
    const headingRadians = run.heading * Math.PI / 180;
    run.lat += Math.cos(headingRadians) * distanceNm / 60;
    run.lon += Math.sin(headingRadians) * distanceNm / (60 * Math.max(.2, Math.cos(run.lat * Math.PI / 180)));
    run.distance += distanceNm;
    if (now - run.lastCloud > 900) {
        run.lastCloud = now;
        run.clouds.push({ x: Math.random() * width, y: -30, size: 12 + Math.random() * 18, speed: 30 + Math.random() * 25 });
    }
    run.clouds.forEach((cloud) => cloud.y += cloud.speed * delta);
    run.clouds = run.clouds.filter((cloud) => cloud.y < height + 40);
    run.score = Math.floor(elapsed * 120 + run.altitude * .05 + run.speed * .2);
    if (run.phase === 'TAKEOFF' && run.speed >= 95) run.phase = 'CLIMB';
    if (run.phase === 'CLIMB' && run.altitude >= 2500) run.phase = 'CRUISE';
    if (run.phase === 'CRUISE' && elapsed >= 35) run.phase = 'LANDING';
    if (run.phase === 'LANDING') {
        run.runway = Math.min(100, run.runway + delta * 5);
        if (run.runway >= 100 && run.altitude < 90 && run.speed >= 65 && run.speed <= 155 && Math.abs(run.pitch) < 5) {
            return finishRun('Landing complete.');
        }
    }
    draw(width, height, elapsed);
    updateInstruments(elapsed);
    updateMapOrientation();
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
    timerLabel.textContent = elapsed.toFixed(1);
    if (altitudeMeter) altitudeMeter.style.width = `${Math.min(100, run.altitude / 12)}%`;
    if (speedMeter) speedMeter.style.width = `${Math.min(100, run.speed / 5)}%`;
    if (fuelMeter) fuelMeter.style.height = `${run.fuel}%`;
    if (engineValue) engineValue.textContent = String(Math.round(Math.min(100, run.speed / 4.6)));
    if (engineMeter) engineMeter.style.height = `${Math.min(100, run.speed / 4.6)}%`;
    if (verticalValue) verticalValue.textContent = String(Math.round(run.pitch * 55)).padStart(3, '0');
    phaseLabel.textContent = run.phase;
    const attitude = run.pitch > 2 ? 'climbing' : run.pitch < -2 ? 'descending' : 'level flight';
    statusLabel.textContent = run.fuel < 20 ? 'LOW FUEL. Land immediately.' : run.phase === 'LANDING'
        ? `Runway approach ${Math.round(run.runway)}% / ${attitude}.`
        : `${run.phase.toLowerCase()} / ${attitude}.`;
}

function draw(width, height, elapsed) {
    ctx.clearRect(0, 0, width, height);
    if (viewMode === 'exterior') drawExterior(width, height, elapsed);
    else drawCockpit(width, height, elapsed);
    drawLiveTraffic(width, height);
}

function drawCockpit(width, height, elapsed) {
    const horizon = height * .42 + run.pitch * 3;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#173d52');
    sky.addColorStop(1, '#79b5bf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);
    drawTerrain(width, height, horizon, elapsed);

    ctx.save();
    ctx.translate(width / 2, horizon);
    ctx.strokeStyle = 'rgba(246, 245, 208, .6)';
    ctx.lineWidth = 2;
    for (let index = -3; index <= 3; index += 1) {
        const offset = index * 36 + run.pitch * 4;
        ctx.beginPath();
        ctx.moveTo(-Math.max(14, 90 - Math.abs(index) * 12), offset);
        ctx.lineTo(Math.max(14, 90 - Math.abs(index) * 12), offset);
        ctx.stroke();
    }
    ctx.restore();

    const centerX = width / 2;
    const centerY = height * .48;
    ctx.strokeStyle = 'rgba(255, 255, 255, .72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 40, centerY); ctx.lineTo(centerX - 12, centerY);
    ctx.moveTo(centerX + 12, centerY); ctx.lineTo(centerX + 40, centerY);
    ctx.moveTo(centerX, centerY - 14); ctx.lineTo(centerX, centerY + 14);
    ctx.stroke();
    ctx.fillStyle = 'rgba(8, 28, 37, .68)';
    ctx.fillRect(18, 18, 190, 53);
    ctx.fillStyle = '#e8f4dc';
    ctx.font = '10px Consolas, monospace';
    ctx.fillText('FORWARD VIEW / ' + run.phase, 30, 38);
    ctx.fillStyle = '#b9ed78';
    ctx.fillText(`${run.lat.toFixed(3)}  ${run.lon.toFixed(3)}  /  ${run.distance.toFixed(1)} NM`, 30, 56);
    drawCockpitFrame(width, height);
}

function drawCockpitFrame(width, height) {
    const bottom = height * .78;
    const frame = ctx.createLinearGradient(0, bottom, 0, height);
    frame.addColorStop(0, 'rgba(8, 24, 31, .12)');
    frame.addColorStop(1, 'rgba(5, 15, 20, .92)');
    ctx.fillStyle = frame;
    ctx.fillRect(0, bottom, width, height - bottom);
    ctx.strokeStyle = 'rgba(18, 30, 34, .9)';
    ctx.lineWidth = Math.max(12, width * .018);
    ctx.beginPath();
    ctx.moveTo(0, bottom + 12); ctx.lineTo(width * .18, bottom - 30);
    ctx.moveTo(width, bottom + 12); ctx.lineTo(width * .82, bottom - 30);
    ctx.stroke();
    ctx.fillStyle = '#17272c';
    ctx.beginPath();
    ctx.moveTo(0, height); ctx.lineTo(width * .18, bottom + 12); ctx.lineTo(width * .37, bottom + 6);
    ctx.lineTo(width * .63, bottom + 6); ctx.lineTo(width * .82, bottom + 12); ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(114, 228, 238, .12)';
    ctx.fillRect(width * .08, bottom + 26, width * .84, 2);
    ctx.fillStyle = '#263d40';
    ctx.fillRect(width * .44, bottom + 10, width * .12, 12);
}

function drawExterior(width, height, elapsed) {
    const horizon = height * .46 + run.pitch * 2;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#142f4b');
    sky.addColorStop(1, '#a3d0cf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);
    drawTerrain(width, height, horizon, elapsed);
    const centerX = width / 2;
    const centerY = height * .67;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = 'rgba(9, 25, 32, .78)';
    ctx.beginPath();
    ctx.moveTo(-width * .34, 20); ctx.lineTo(-width * .08, -8); ctx.lineTo(-20, -13);
    ctx.lineTo(0, -42); ctx.lineTo(20, -13); ctx.lineTo(width * .08, -8); ctx.lineTo(width * .34, 20);
    ctx.lineTo(width * .07, 15); ctx.lineTo(0, 30); ctx.lineTo(-width * .07, 15); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#314b50';
    ctx.beginPath(); ctx.ellipse(-width * .18, 19, 25, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(width * .18, 19, 25, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#72e4ee';
    ctx.beginPath(); ctx.ellipse(0, -22, 12, 27, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffdc65';
    ctx.fillRect(-width * .27, 18, 12, 3); ctx.fillRect(width * .27 - 12, 18, 12, 3);
    ctx.restore();
    ctx.fillStyle = 'rgba(8, 28, 37, .68)';
    ctx.fillRect(18, 18, 170, 35);
    ctx.fillStyle = '#e8f4dc';
    ctx.font = '10px Consolas, monospace';
    ctx.fillText('EXTERNAL CAMERA / ' + run.phase, 30, 40);
}

function projectAtZoom(latitude, longitude, zoom) {
    const scale = 256 * 2 ** zoom;
    const x = (longitude + 180) / 360 * scale;
    const sine = Math.sin(latitude * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale;
    return { x, y };
}

function getTerrainTile(column, row) {
    const maxTile = 2 ** terrainZoom;
    const tileX = ((column % maxTile) + maxTile) % maxTile;
    const tileY = Math.max(0, Math.min(maxTile - 1, row));
    const key = `${mapLayer}/${terrainZoom}/${tileX}/${tileY}`;
    if (streetTileCache.has(key)) return streetTileCache.get(key);
    const image = new Image();
    loadMapTile(image, terrainZoom, tileX, tileY);
    streetTileCache.set(key, image);
    return image;
}

function drawStreetMapGround(width, height, horizon) {
    const fallback = ctx.createLinearGradient(0, horizon, 0, height);
    fallback.addColorStop(0, '#6d9590');
    fallback.addColorStop(1, '#1d382f');
    ctx.fillStyle = fallback;
    ctx.fillRect(0, horizon, width, height - horizon);

    const center = projectAtZoom(run.lat, run.lon, terrainZoom);
    const startColumn = Math.floor((center.x - width) / 256);
    const endColumn = Math.ceil((center.x + width) / 256);
    const startRow = Math.floor((center.y - height) / 256);
    const endRow = Math.ceil((center.y + height) / 256);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, width, height - horizon);
    ctx.clip();
    ctx.translate(width / 2, horizon);
    ctx.rotate(-run.heading * Math.PI / 180);
    ctx.scale(1.0, 0.4);
    ctx.translate(-center.x, -center.y);
    for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) {
            const image = getTerrainTile(column, row);
            if (image.complete && image.naturalWidth > 0) {
                ctx.drawImage(image, column * 256, row * 256, 256, 256);
            }
        }
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(25, 67, 63, .28)';
    ctx.fillRect(0, horizon, width, height - horizon);
}

function drawTopDown(width, height, elapsed) {
    const centerX = width / 2;
    const centerY = height / 2;
    const pixelsPerDegree = Math.min(width, height) * .72;
    ctx.fillStyle = '#214c45';
    ctx.fillRect(0, 0, width, height);

    const travelPixels = (run.distance * 180) % 260;
    const travelAngle = run.heading * Math.PI / 180;
    ctx.save();
    ctx.translate(Math.sin(travelAngle) * travelPixels, -Math.cos(travelAngle) * travelPixels);
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
    ctx.restore();

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
    ctx.fillText(`GROUND ${Math.round(run.speed)} KT / DIST ${run.distance.toFixed(1)} NM`, 18, 56);
    ctx.fillText(`T+${elapsed.toFixed(0)} SEC`, width - 95, 24);
}

function drawTerrain(width, height, horizon, elapsed) {
    drawStreetMapGround(width, height, horizon);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, width, height - horizon);
    ctx.clip();

    ctx.fillStyle = 'rgba(255, 255, 255, .08)';
    ctx.fillRect(0, horizon, width, 18);

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
