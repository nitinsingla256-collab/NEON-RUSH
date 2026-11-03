(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const screens = [...document.querySelectorAll('.screen')];
  const ui = {
    coinCount: document.getElementById('coinCount'), menuBest: document.getElementById('menuBest'),
    liveScore: document.getElementById('liveScore'), runCoins: document.getElementById('runCoins'),
    runMode: document.getElementById('runMode'), multiplier: document.getElementById('multiplier'),
    distanceLabel: document.getElementById('distanceLabel'), speedLabel: document.getElementById('speedLabel'),
    distanceFill: document.getElementById('distanceFill'), toast: document.getElementById('toast')
  };
  const SAVE_KEY = 'neonRush.save.v1';
  const cars = [
    { id: 'vanta', name: 'VANTA GT', description: 'A midnight-built all-rounder. Fast off the line, steady through the turns.', color: '#45d9f1', accent: '#187eab', speed: 72, handling: 84, cost: 0, body: 'sport' },
    { id: 'solace', name: 'SOLACE R', description: 'A sharp, light-footed coupe made for threading the gaps.', color: '#b09aff', accent: '#6246ae', speed: 80, handling: 93, cost: 90, body: 'coupe' },
    { id: 'ember', name: 'EMBER 8', description: 'Big torque, broad shoulders. Once it moves, it really moves.', color: '#ff795e', accent: '#a63634', speed: 94, handling: 68, cost: 210, body: 'muscle' },
    { id: 'ghost', name: 'GHOSTLINE', description: 'A rare prototype with a quiet silhouette and a wild top end.', color: '#dce7ee', accent: '#718da2', speed: 88, handling: 86, cost: 400, body: 'prototype' }
  ];
  const achievements = [
    { id: 'first_run', title: 'After Hours', detail: 'Complete your first run', test: s => s.runs >= 1 },
    { id: 'five_hundred', title: 'No Brakes', detail: 'Score 500 points in one run', test: s => s.best >= 500 },
    { id: 'one_k', title: 'Night Owl', detail: 'Score 1,000 points in one run', test: s => s.best >= 1000 },
    { id: 'collector', title: 'Loose Change', detail: 'Bank 25 coins total', test: s => s.coins >= 25 }
  ];
  const defaults = { best: 0, coins: 0, totalDistance: 0, longestDistance: 0, runs: 0, unlocked: ['vanta'], selectedCar: 'vanta', difficulty: 'normal', effects: true, music: true, sound: true, achievements: [] };
  let save = loadSave();
  let width = 0, height = 0, dpr = 1, lastTime = 0, screenName = 'menuScreen';
  let previewIndex = Math.max(0, cars.findIndex(car => car.id === save.selectedCar));
  let audio = null, engineNodes = null, musicNodes = null, toastTimer = 0;
  let game = freshGame();
  let scenery = [];

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      return { ...defaults, ...parsed, unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : ['vanta'], achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [] };
    } catch (_) { return { ...defaults }; }
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { showToast('Local save unavailable in this browser.'); } }
  function freshGame() {
    return { running: false, paused: false, over: false, lane: 1, laneVisual: 1, score: 0, distance: 0, coins: 0, elapsed: 0, speed: 0, spawnTimer: 0, coinTimer: 1.6, cleanTime: 0, objects: [], particles: [], shake: 0, hitFlash: 0, boostTimer: 0, lastMilestone: 0 };
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    width = rect.width; height = rect.height; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); createScenery();
  }
  function createScenery() {
    scenery = [];
    for (let i = 0; i < 34; i++) {
      const side = Math.random() < .5 ? -1 : 1;
      scenery.push({ side, depth: Math.random(), height: 14 + Math.random() * 82, width: 8 + Math.random() * 35, tint: Math.random() < .5 ? '#152438' : '#171b31', light: Math.random() < .25 ? (Math.random() < .5 ? '#337da0' : '#8156a8') : null });
    }
  }
  function showScreen(id) {
    screenName = id;
    screens.forEach(screen => screen.classList.toggle('active', screen.id === id));
    if (id === 'menuScreen') { updateMenu(); stopEngine(); }
    if (id === 'garageScreen') renderGarage();
    if (id === 'scoresScreen') renderRecords();
    if (id === 'settingsScreen') syncSettings();
    if (id === 'gameScreen') startEngine(); else stopEngine();
    updateSoundIcon();
  }
  function updateMenu() { ui.menuBest.textContent = formatScore(save.best); ui.coinCount.textContent = save.coins; document.getElementById('menuDifficulty').value = save.difficulty; }
  function formatScore(score) { return Math.floor(score).toString().padStart(6, '0'); }
  function setDifficulty(value) { save.difficulty = ['easy', 'normal', 'hard'].includes(value) ? value : 'normal'; document.getElementById('menuDifficulty').value = save.difficulty; document.getElementById('settingsDifficulty').value = save.difficulty; persist(); }
  function syncSettings() {
    document.getElementById('effectsToggle').classList.toggle('on', save.effects);
    document.getElementById('effectsToggle').setAttribute('aria-pressed', String(save.effects));
    document.getElementById('musicToggle').classList.toggle('on', save.music);
    document.getElementById('musicToggle').setAttribute('aria-pressed', String(save.music));
    document.getElementById('settingsDifficulty').value = save.difficulty;
  }
  function renderRecords() {
    document.getElementById('recordBest').textContent = formatScore(save.best);
    document.getElementById('recordDistance').textContent = `${save.longestDistance.toFixed(1)} km`;
    document.getElementById('recordCoins').textContent = save.coins;
    document.getElementById('achievementList').innerHTML = achievements.map(a => {
      const unlocked = save.achievements.includes(a.id);
      return `<div class="achievement ${unlocked ? 'unlocked' : ''}"><i>${unlocked ? '✦' : '·'}</i><span>${a.title} <small>${unlocked ? 'UNLOCKED' : 'LOCKED'}</small></span></div>`;
    }).join('');
  }
  function svgCar(car, extraClass = '') {
    const color = car.color, accent = car.accent;
    const roofs = { sport: 'M72 111 L88 64 Q96 48 118 45 L181 45 Q201 48 211 66 L228 111 Z', coupe: 'M66 111 L91 67 Q103 48 130 48 L181 49 Q202 51 218 77 L232 111 Z', muscle: 'M59 111 L75 62 Q82 51 107 49 L190 50 Q211 54 224 76 L240 111 Z', prototype: 'M70 111 L88 61 Q99 43 130 42 L177 46 Q201 50 219 75 L232 111 Z' };
    const roof = roofs[car.body] || roofs.sport;
    return `<svg class="${extraClass}" viewBox="0 0 300 210" role="img" aria-label="${car.name}"><defs><linearGradient id="body-${car.id}" x1="0" x2="0.85" y1="0" y2="1"><stop stop-color="${color}"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="#101924"/></linearGradient><linearGradient id="glass-${car.id}" x1="0" x2="0" y2="1"><stop stop-color="#416b82"/><stop offset="1" stop-color="#111d2a"/></linearGradient></defs><ellipse cx="150" cy="162" rx="112" ry="15" fill="#03070b" opacity=".7"/><path d="M42 119 Q45 105 65 101 L87 94 Q101 78 115 74 L190 74 Q208 80 223 101 L250 108 Q260 112 261 126 L254 148 Q248 157 228 160 L70 160 Q48 157 42 145Z" fill="url(#body-${car.id})" stroke="${color}" stroke-opacity=".76" stroke-width="2"/><path d="${roof}" fill="${accent}" stroke="${color}" stroke-opacity=".6" stroke-width="2"/><path d="M97 101 L109 68 Q114 58 127 57 L149 57 L149 101Z" fill="url(#glass-${car.id})" stroke="#8ee7f2" stroke-opacity=".46"/><path d="M155 57 L179 59 Q194 61 202 74 L216 101 L155 101Z" fill="url(#glass-${car.id})" stroke="#8ee7f2" stroke-opacity=".46"/><path d="M53 125 L84 119 L80 136 L51 139Z" fill="#ff536d"/><path d="M223 117 L251 121 L254 136 L225 135Z" fill="#ff536d"/><path d="M54 127 L77 124" stroke="#ffbbc3" stroke-width="2"/><path d="M230 121 L250 124" stroke="#ffbbc3" stroke-width="2"/><path d="M48 146 L252 146" stroke="${color}" stroke-opacity=".6"/><path d="M116 155 L186 155" stroke="#071018" stroke-width="5"/><path d="M82 108 L73 113 M213 108 L226 113" stroke="#dafaff" stroke-width="4" stroke-linecap="round"/><path d="M47 140 L41 151 M255 140 L261 151" stroke="#0a1017" stroke-width="7"/><circle cx="77" cy="151" r="13" fill="#090e14" stroke="#8494a5" stroke-width="3"/><circle cx="77" cy="151" r="4" fill="#54dcf4"/><circle cx="227" cy="151" r="13" fill="#090e14" stroke="#8494a5" stroke-width="3"/><circle cx="227" cy="151" r="4" fill="#54dcf4"/><path d="M61 166 L239 166" stroke="${color}" stroke-opacity=".65" stroke-width="2"/><path d="M99 83 L202 83" stroke="#e9faff" stroke-opacity=".15"/></svg>`;
  }
  function renderGarage() {
    const car = cars[previewIndex], owned = save.unlocked.includes(car.id), selected = save.selectedCar === car.id;
    document.getElementById('largeCarPreview').innerHTML = svgCar(car);
    document.getElementById('previewName').textContent = car.name;
    document.getElementById('carName').textContent = car.name;
    document.getElementById('carDescription').textContent = car.description;
    document.getElementById('carIndex').textContent = `${String(previewIndex + 1).padStart(2, '0')} / ${String(cars.length).padStart(2, '0')}`;
    document.getElementById('speedStat').style.width = `${car.speed}%`; document.getElementById('handlingStat').style.width = `${car.handling}%`;
    document.getElementById('speedValue').textContent = car.speed; document.getElementById('handlingValue').textContent = car.handling;
    const button = document.getElementById('selectCarButton');
    button.innerHTML = !owned ? `UNLOCK <i class="coin-icon"></i> ${car.cost}` : selected ? 'SELECTED ✓' : 'SELECT CAR';
    button.disabled = owned && selected; button.style.opacity = button.disabled ? '.65' : '1';
    document.getElementById('garageNotice').textContent = !owned ? `You have ${save.coins} coins. Find more on the highway.` : selected ? 'This machine is ready for your next run.' : 'Select this car for your next run.';
    document.getElementById('carDots').innerHTML = cars.map((_, i) => `<button class="${i === previewIndex ? 'selected' : ''}" data-car-index="${i}" aria-label="View car ${i + 1}"></button>`).join('');
    ui.coinCount.textContent = save.coins;
  }
  function movePreview(amount) { previewIndex = (previewIndex + amount + cars.length) % cars.length; renderGarage(); }
  function selectOrUnlockCar() {
    const car = cars[previewIndex];
    if (!save.unlocked.includes(car.id)) {
      if (save.coins < car.cost) { showToast(`You need ${car.cost - save.coins} more coins to unlock ${car.name}.`); return; }
      save.coins -= car.cost; save.unlocked.push(car.id); showToast(`${car.name} unlocked. Make it yours.`); sound('unlock');
    }
    save.selectedCar = car.id; persist(); renderGarage(); updateMenu(); sound('click');
  }
  function showToast(message) {
    const toast = ui.toast; toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function beginRun() {
    game = freshGame(); game.running = true; game.speed = baseSpeed(); game.spawnTimer = .45;
    ui.runMode.textContent = `${save.difficulty.toUpperCase()} RUN`; showScreen('gameScreen'); updateHud(); sound('click');
  }
  function baseSpeed() {
    const car = cars.find(candidate => candidate.id === save.selectedCar) || cars[0];
    return ({ easy: 264, normal: 320, hard: 375 })[save.difficulty] * (.9 + car.speed / 720);
  }
  function pauseRun() {
    if (!game.running || game.over) return;
    game.paused = !game.paused; showScreen(game.paused ? 'pauseScreen' : 'gameScreen'); sound('click');
    if (game.paused) stopEngine(); else startEngine();
  }
  function update(dt) {
    if (screenName !== 'gameScreen' || !game.running || game.paused || game.over) return;
    const difficultyFactor = ({ easy: .82, normal: 1, hard: 1.22 })[save.difficulty];
    game.elapsed += dt; game.cleanTime += dt;
    game.speed = Math.min(baseSpeed() + game.elapsed * (save.difficulty === 'hard' ? 5.8 : 4.4), baseSpeed() + 190);
    const car = cars.find(c => c.id === save.selectedCar) || cars[0];
    const handling = .12 * (100 / car.handling);
    game.laneVisual += (game.lane - game.laneVisual) * Math.min(1, dt / handling);
    game.distance += game.speed * dt / 1000 * .11;
    const multiplier = game.cleanTime >= 45 ? 3 : game.cleanTime >= 20 ? 2 : 1;
    game.score += game.speed * dt * .014 * multiplier * difficultyFactor;
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) { spawnTraffic(); game.spawnTimer = Math.max(.52, 1.12 - game.elapsed * .006) * (save.difficulty === 'hard' ? .82 : save.difficulty === 'easy' ? 1.18 : 1) * (.82 + Math.random() * .4); }
    game.coinTimer -= dt;
    if (game.coinTimer <= 0) { spawnCoin(); game.coinTimer = 2.8 + Math.random() * 3.8; }
    const roadBottom = height * .84;
    for (let i = game.objects.length - 1; i >= 0; i--) {
      const object = game.objects[i]; object.y += game.speed * dt * (object.type === 'coin' ? 1 : object.speedFactor);
      if (object.type === 'coin' && !object.collected && object.y > roadBottom - 67 && object.y < roadBottom + 16 && Math.abs(object.lane - game.laneVisual) < .47) collectCoin(object);
      if (object.type === 'traffic' && object.y > roadBottom - 72 && object.y < roadBottom + 25 && Math.abs(object.lane - game.laneVisual) < .45) { crash(); break; }
      if (object.y > height + 100) game.objects.splice(i, 1);
    }
    for (let i = game.particles.length - 1; i >= 0; i--) { const p = game.particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) game.particles.splice(i, 1); }
    game.hitFlash = Math.max(0, game.hitFlash - dt * 2); game.shake = Math.max(0, game.shake - dt * 25);
    updateHud(); checkAchievements();
  }
  function spawnTraffic() {
    const lane = Math.floor(Math.random() * 3);
    if (game.objects.some(o => o.type === 'traffic' && o.lane === lane && o.y < height * .51)) return;
    const types = ['sedan', 'van', 'sports', 'truck'];
    game.objects.push({ type: 'traffic', lane, y: height * .22 - 70, vehicle: types[Math.floor(Math.random() * types.length)], speedFactor: .88 + Math.random() * .2, tint: ['#a94356', '#4b85a3', '#ba8e50', '#687ba0'][Math.floor(Math.random() * 4)] });
  }
  function spawnCoin() {
    const lane = Math.floor(Math.random() * 3), count = Math.random() < .22 ? 4 : 1;
    for (let i = 0; i < count; i++) game.objects.push({ type: 'coin', lane, y: height * .22 - 45 - i * 43, collected: false, phase: Math.random() * Math.PI * 2 });
  }
  function collectCoin(object) {
    object.collected = true; game.coins++; save.coins++; persist(); game.score += 50 * (game.cleanTime >= 45 ? 3 : game.cleanTime >= 20 ? 2 : 1);
    spawnParticles(laneX(object.lane, object.y), object.y, '#f5c66b', 9); sound('coin');
    if (game.coins % 5 === 0) showToast('Coin streak. Keep it clean.');
  }
  function crash() {
    if (game.over) return;
    game.over = true; game.running = false; game.shake = 14; game.hitFlash = .75; game.cleanTime = 0;
    sound('crash'); spawnParticles(laneX(game.laneVisual, height * .84), height * .82, '#ff6278', 28);
    const score = Math.floor(game.score), distance = game.distance;
    save.runs++; save.totalDistance += distance; save.longestDistance = Math.max(save.longestDistance, distance);
    const newBest = score > save.best; if (newBest) save.best = score; persist(); checkAchievements();
    document.getElementById('finalScore').textContent = formatScore(score);
    document.getElementById('finalDistance').textContent = `${distance.toFixed(1)} km`;
    document.getElementById('finalCoins').textContent = game.coins;
    document.getElementById('finalBest').textContent = formatScore(save.best);
    document.getElementById('newBestBadge').style.visibility = newBest ? 'visible' : 'hidden';
    document.getElementById('gameOverEyebrow').textContent = newBest ? 'A NEW NIGHT-TIME RECORD' : 'THAT WAS A CLOSE ONE';
    setTimeout(() => { if (game.over) showScreen('gameOverScreen'); }, 380);
  }
  function checkAchievements() {
    const before = save.achievements.length;
    for (const achievement of achievements) if (!save.achievements.includes(achievement.id) && achievement.test(save)) save.achievements.push(achievement.id);
    if (save.achievements.length !== before) { const recent = achievements.find(a => save.achievements.includes(a.id) && !save._seenAchievement); if (recent) { save._seenAchievement = true; showToast(`Milestone reached: ${recent.title}`); } persist(); }
  }
  function updateHud() {
    ui.liveScore.textContent = formatScore(game.score); ui.runCoins.textContent = game.coins;
    const mult = game.cleanTime >= 45 ? 3 : game.cleanTime >= 20 ? 2 : 1;
    ui.multiplier.textContent = `×${mult}${mult > 1 ? ' CLEAN RUN' : ''}`;
    ui.distanceLabel.textContent = `${game.distance.toFixed(1)} KM`;
    ui.speedLabel.textContent = `${Math.round(game.speed * .44)} KM/H`;
    ui.distanceFill.style.width = `${Math.min(100, game.distance / 2 * 100)}%`;
    ui.coinCount.textContent = save.coins;
  }
  function changeLane(direction) {
    if (screenName !== 'gameScreen' || !game.running || game.paused || game.over) return;
    const next = Math.max(0, Math.min(2, game.lane + direction));
    if (next !== game.lane) { game.lane = next; sound('move'); }
  }

  function roadGeometry(y) {
    const horizon = height * .22, t = Math.max(0, Math.min(1, (y - horizon) / (height - horizon)));
    const center = width * .53 + Math.sin(game.elapsed * .13) * width * .012 * t;
    const topWidth = width * .19, bottomWidth = Math.min(width * .72, height * .92);
    return { t, center, half: (topWidth + (bottomWidth - topWidth) * Math.pow(t, .86)) / 2 };
  }
  function laneX(lane, y) { const road = roadGeometry(y); return road.center + (lane - 1) * road.half * .58; }
  function render(now) {
    const dt = Math.min(.04, lastTime ? (now - lastTime) / 1000 : .016); lastTime = now;
    if (screenName !== 'gameScreen' || game.paused) game.elapsed += dt;
    update(dt); draw(dt); requestAnimationFrame(render);
  }
  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shakeX = game.shake ? (Math.random() - .5) * game.shake : 0;
    const shakeY = game.shake ? (Math.random() - .5) * game.shake : 0;
    ctx.save(); ctx.translate(shakeX, shakeY);
    const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, '#080d17'); sky.addColorStop(.42, '#101724'); sky.addColorStop(1, '#090d12');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, width + 40, height + 40);
    drawSkyline(); drawRoad();
    for (const object of game.objects) if (object.type === 'coin' && !object.collected) drawCoin(object);
    for (const object of game.objects) if (object.type === 'traffic') drawTraffic(object);
    drawPlayer(); drawParticles();
    if (game.hitFlash > 0) { ctx.fillStyle = `rgba(255,60,88,${game.hitFlash * .2})`; ctx.fillRect(0, 0, width, height); }
    ctx.restore();
  }
  function drawSkyline() {
    const horizon = height * .22;
    const glow = ctx.createRadialGradient(width * .55, horizon, 3, width * .55, horizon, width * .58);
    glow.addColorStop(0, 'rgba(43,112,153,.2)'); glow.addColorStop(.55, 'rgba(25,52,78,.1)'); glow.addColorStop(1, 'rgba(5,8,14,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height * .57);
    ctx.fillStyle = '#0a111c';
    const blocks = Math.ceil(width / 34);
    for (let i = 0; i < blocks; i++) {
      const seed = Math.sin(i * 17.43) * 10000, random = seed - Math.floor(seed);
      const x = i * 34, bh = 28 + random * height * .19, y = horizon - bh;
      ctx.fillRect(x, y, 24 + random * 15, bh);
      ctx.fillStyle = '#26334a';
      for (let wy = y + 9; wy < horizon - 7; wy += 12) for (let wx = x + 5; wx < x + 25; wx += 9) {
        const light = Math.sin(wx * 8 + wy * 3) > .38;
        if (light) { ctx.globalAlpha = .15 + .14 * (1 - Math.max(0, wy / horizon)); ctx.fillStyle = Math.sin(wx + wy) > 0 ? '#65b9de' : '#b18bfa'; ctx.fillRect(wx, wy, 2, 3); }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = '#0a111c';
    }
    ctx.fillStyle = '#172337'; ctx.fillRect(0, horizon - 2, width, 3);
    // A few distant, soft signs bring depth without clutter.
    const signY = horizon - 23, signX = width * .83;
    ctx.fillStyle = '#152433'; ctx.fillRect(signX, signY, 37, 13); ctx.fillStyle = 'rgba(84,220,244,.55)'; ctx.fillRect(signX + 5, signY + 5, 24, 1);
  }
  function drawRoad() {
    const horizon = height * .22, bottom = height + 30, top = roadGeometry(horizon), low = roadGeometry(bottom);
    ctx.beginPath(); ctx.moveTo(top.center - top.half, horizon); ctx.lineTo(top.center + top.half, horizon); ctx.lineTo(low.center + low.half, bottom); ctx.lineTo(low.center - low.half, bottom); ctx.closePath();
    const asphalt = ctx.createLinearGradient(0, horizon, 0, bottom); asphalt.addColorStop(0, '#171e29'); asphalt.addColorStop(.55, '#161d26'); asphalt.addColorStop(1, '#111820'); ctx.fillStyle = asphalt; ctx.fill();
    // Outer shoulder glow and fine road edges.
    for (const side of [-1, 1]) {
      const glow = ctx.createLinearGradient(0, 0, width, 0); glow.addColorStop(0, 'rgba(0,0,0,0)'); glow.addColorStop(.5, side < 0 ? 'rgba(84,220,244,.4)' : 'rgba(143,105,247,.34)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = glow; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(top.center + side * (top.half - 1), horizon); ctx.lineTo(low.center + side * (low.half - 1), bottom); ctx.stroke();
      ctx.strokeStyle = side < 0 ? 'rgba(119,190,215,.18)' : 'rgba(170,135,226,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(top.center + side * top.half, horizon); ctx.lineTo(low.center + side * low.half, bottom); ctx.stroke();
    }
    const phase = (game.elapsed * (game.speed || 185) * .003) % 1;
    for (let lane = 1; lane <= 2; lane++) {
      for (let i = 0; i < 10; i++) {
        const t = (i / 10 + phase) % 1, y = horizon + Math.pow(t, 1.45) * (height - horizon + 20), road = roadGeometry(y);
        const dashHeight = 2 + t * 30, x = road.center + (lane - 1.5) * road.half * .58;
        ctx.fillStyle = `rgba(177,201,218,${.1 + t * .42})`; ctx.fillRect(x - 1, y, 2 + t, dashHeight);
      }
    }
    // Short, subtle pools of reflected light along the shoulder.
    for (let i = 0; i < 6; i++) {
      const t = ((i / 6) + phase * .22) % 1, y = horizon + Math.pow(t, 1.5) * (height - horizon), road = roadGeometry(y);
      ctx.globalAlpha = .045 + t * .055; ctx.fillStyle = i % 2 ? '#855ce2' : '#36b9dc';
      ctx.fillRect(road.center - road.half - 25 * t, y, 9 * t + 2, 2 * t + 1); ctx.fillRect(road.center + road.half + 12 * t, y, 12 * t + 2, 2 * t + 1);
    }
    ctx.globalAlpha = 1;
    // Roadside lamps and parallax architecture.
    scenery.forEach(item => {
      const t = (item.depth + game.elapsed * (game.speed || 190) * .00024) % 1;
      const y = horizon + Math.pow(t, 1.55) * (height - horizon), road = roadGeometry(y), x = road.center + item.side * (road.half + 17 + t * 44);
      if (item.light && t > .14) { ctx.globalAlpha = t * .32; ctx.fillStyle = item.light; ctx.fillRect(x, y - item.height * t * .45, item.width * t, 2 + t); }
      if (item.depth < .14) return;
      if (item.width > 30 && item.height > 60) {
        const buildingH = item.height * t * 1.5, buildingW = item.width * t;
        ctx.fillStyle = item.tint; ctx.fillRect(x, y - buildingH, buildingW * item.side, buildingH);
      } else {
        const poleH = (28 + item.height * .3) * t, poleX = x;
        ctx.fillStyle = '#283848'; ctx.fillRect(poleX, y - poleH, Math.max(1, t * 2), poleH);
        const lamp = ctx.createRadialGradient(poleX, y - poleH, 0, poleX, y - poleH, 14 * t + 1);
        lamp.addColorStop(0, 'rgba(112,203,229,.55)'); lamp.addColorStop(1, 'rgba(112,203,229,0)'); ctx.fillStyle = lamp; ctx.fillRect(poleX - 15 * t, y - poleH - 14 * t, 30 * t, 28 * t);
      }
    });
    ctx.globalAlpha = 1;
  }
  function drawCoin(object) {
    const x = laneX(object.lane, object.y), scale = Math.max(.28, Math.min(1.25, (object.y - height * .22) / (height * .62)));
    const r = 8 * scale, wobble = Math.abs(Math.cos(game.elapsed * 5 + object.phase)) * .65 + .25;
    ctx.save(); ctx.translate(x, object.y); ctx.scale(wobble, 1);
    ctx.shadowColor = '#f5c66b'; ctx.shadowBlur = 8 * scale; ctx.fillStyle = '#c78f36'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ffe4a2'; ctx.lineWidth = 1.3 * scale; ctx.beginPath(); ctx.ellipse(0, 0, r * .58, r * .8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  function drawTraffic(object) {
    const x = laneX(object.lane, object.y), t = Math.max(.26, (object.y - height * .22) / (height * .62)), scale = .35 + t * .68;
    const w = (object.vehicle === 'truck' ? 58 : 48) * scale, h = (object.vehicle === 'truck' ? 86 : 72) * scale;
    ctx.save(); ctx.translate(x, object.y); ctx.scale(scale, scale);
    ctx.fillStyle = '#080c11'; ctx.beginPath(); ctx.ellipse(0, 5, 37, 48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = object.tint; ctx.beginPath();
    if (object.vehicle === 'truck' || object.vehicle === 'van') { ctx.roundRect(-28, -43, 56, 87, 8); } else { ctx.moveTo(-27, 42); ctx.lineTo(-30, 15); ctx.lineTo(-23, -25); ctx.quadraticCurveTo(-19, -40, -10, -43); ctx.lineTo(12, -43); ctx.quadraticCurveTo(23, -39, 27, -24); ctx.lineTo(31, 15); ctx.lineTo(27, 42); ctx.closePath(); }
    ctx.fill(); ctx.strokeStyle = '#d3e4f2'; ctx.globalAlpha = .24; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#172b39'; ctx.beginPath(); ctx.roundRect(-18, -27, 36, 20, 5); ctx.fill(); ctx.fillStyle = '#17212c'; ctx.beginPath(); ctx.roundRect(-20, 4, 40, 17, 4); ctx.fill();
    ctx.fillStyle = '#fa556a'; ctx.shadowColor = '#ff405a'; ctx.shadowBlur = 9; ctx.fillRect(-27, 28, 9, 5); ctx.fillRect(18, 28, 9, 5); ctx.shadowBlur = 0;
    ctx.fillStyle = '#090c10'; ctx.fillRect(-31, -26, 5, 15); ctx.fillRect(26, -26, 5, 15); ctx.fillRect(-31, 20, 5, 16); ctx.fillRect(26, 20, 5, 16);
    if (object.vehicle === 'truck') { ctx.fillStyle = '#d5e0e6'; ctx.fillRect(-22, -39, 44, 4); }
    ctx.restore();
  }
  function drawPlayer() {
    if (screenName === 'gameScreen' || screenName === 'pauseScreen' || screenName === 'gameOverScreen') {
      const x = laneX(game.laneVisual, height * .83), y = height * .83;
      const car = cars.find(c => c.id === save.selectedCar) || cars[0], scale = Math.max(.66, Math.min(1.05, width / 850));
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      const beam = ctx.createRadialGradient(0, -48, 4, 0, -80, 180); beam.addColorStop(0, `${car.color}20`); beam.addColorStop(1, `${car.color}00`); ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(-17, -42); ctx.lineTo(-150, -195); ctx.lineTo(150, -195); ctx.lineTo(17, -42); ctx.fill();
      ctx.fillStyle = '#05080c'; ctx.beginPath(); ctx.ellipse(0, 18, 37, 51, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-28, 40); ctx.lineTo(-31, 11); ctx.lineTo(-24, -28); ctx.quadraticCurveTo(-19, -44, -11, -46); ctx.lineTo(11, -46); ctx.quadraticCurveTo(21, -42, 25, -26); ctx.lineTo(31, 12); ctx.lineTo(27, 40); ctx.quadraticCurveTo(0, 48, -28, 40); ctx.closePath();
      const body = ctx.createLinearGradient(-30, 0, 30, 0); body.addColorStop(0, car.accent); body.addColorStop(.47, car.color); body.addColorStop(1, car.accent); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = '#c9f8ff'; ctx.globalAlpha = .6; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#13202c'; ctx.beginPath(); ctx.moveTo(-18, -27); ctx.quadraticCurveTo(-14, -37, -7, -38); ctx.lineTo(7, -38); ctx.quadraticCurveTo(16, -35, 18, -25); ctx.lineTo(21, -7); ctx.lineTo(-21, -7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0d1822'; ctx.beginPath(); ctx.moveTo(-21, 0); ctx.lineTo(21, 0); ctx.lineTo(23, 15); ctx.lineTo(-23, 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f8fbff'; ctx.shadowColor = '#d8faff'; ctx.shadowBlur = 13; ctx.fillRect(-26, 27, 10, 4); ctx.fillRect(16, 27, 10, 4); ctx.shadowBlur = 0;
      ctx.fillStyle = '#081017'; ctx.fillRect(-32, -22, 5, 15); ctx.fillRect(27, -22, 5, 15); ctx.fillRect(-31, 24, 5, 13); ctx.fillRect(26, 24, 5, 13);
      ctx.fillStyle = car.color; ctx.fillRect(-9, 37, 18, 2); ctx.restore();
    } else if (screenName === 'menuScreen') {
      const car = cars.find(c => c.id === save.selectedCar) || cars[0];
      ctx.save(); ctx.translate(width * .75 + Math.sin(game.elapsed * .4) * 14, height * .68 + Math.sin(game.elapsed * 1.7) * 3); ctx.rotate(-.035); ctx.globalAlpha = .78;
      // Distant, cinematic profile in the menu.
      ctx.fillStyle = '#05080d'; ctx.beginPath(); ctx.ellipse(0, 40, 180, 25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = car.accent; ctx.beginPath(); ctx.moveTo(-176, 14); ctx.lineTo(-146, -10); ctx.lineTo(-88, -18); ctx.lineTo(-55, -49); ctx.lineTo(70, -49); ctx.lineTo(119, -16); ctx.lineTo(167, -4); ctx.lineTo(181, 17); ctx.lineTo(168, 27); ctx.lineTo(-169, 27); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#192b38'; ctx.beginPath(); ctx.moveTo(-45, -43); ctx.lineTo(-25, -64); ctx.lineTo(62, -64); ctx.lineTo(103, -22); ctx.lineTo(-62, -22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = car.color; ctx.fillRect(-149, 13, 27, 5); ctx.fillRect(146, 12, 24, 5); ctx.fillStyle = '#090e15'; ctx.beginPath(); ctx.arc(-104, 26, 24, 0, Math.PI * 2); ctx.arc(116, 26, 24, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#8996a2'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(-104, 26, 16, 0, Math.PI * 2); ctx.arc(116, 26, 16, 0, Math.PI * 2); ctx.stroke();
      const beam = ctx.createLinearGradient(170, 10, width * .8, 120); beam.addColorStop(0, `${car.color}36`); beam.addColorStop(1, `${car.color}00`); ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(166, 10); ctx.lineTo(width, -80); ctx.lineTo(width, 180); ctx.lineTo(166, 22); ctx.fill(); ctx.restore();
    }
  }
  function spawnParticles(x, y, color, count) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 150; game.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .25 + Math.random() * .48, maxLife: .73, color, size: 1 + Math.random() * 3 }); } }
  function drawParticles() { for (const p of game.particles) { ctx.globalAlpha = Math.max(0, p.life / p.maxLife); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }

  function ensureAudio() {
    if (!audio) { const AudioContext = window.AudioContext || window.webkitAudioContext; if (AudioContext) audio = new AudioContext(); }
    if (audio && audio.state === 'suspended') audio.resume();
    if (audio && save.music) startMusic();
    if (audio && screenName === 'gameScreen' && !game.paused) startEngine();
  }
  function sound(type) {
    if (!save.effects) return; ensureAudio(); if (!audio) return;
    const now = audio.currentTime, oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination);
    if (type === 'coin') { oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(770, now); oscillator.frequency.exponentialRampToValueAtTime(1180, now + .12); gain.gain.setValueAtTime(.075, now); gain.gain.exponentialRampToValueAtTime(.001, now + .21); oscillator.start(now); oscillator.stop(now + .22); }
    else if (type === 'crash') { oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(115, now); oscillator.frequency.exponentialRampToValueAtTime(38, now + .38); gain.gain.setValueAtTime(.13, now); gain.gain.exponentialRampToValueAtTime(.001, now + .42); oscillator.start(now); oscillator.stop(now + .44); }
    else if (type === 'unlock') { oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(440, now); oscillator.frequency.setValueAtTime(660, now + .08); oscillator.frequency.setValueAtTime(880, now + .16); gain.gain.setValueAtTime(.06, now); gain.gain.exponentialRampToValueAtTime(.001, now + .35); oscillator.start(now); oscillator.stop(now + .36); }
    else { oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(type === 'move' ? 280 : 360, now); oscillator.frequency.exponentialRampToValueAtTime(type === 'move' ? 190 : 520, now + .06); gain.gain.setValueAtTime(type === 'move' ? .025 : .035, now); gain.gain.exponentialRampToValueAtTime(.001, now + .09); oscillator.start(now); oscillator.stop(now + .1); }
  }
  function startEngine() {
    if (!save.effects || !audio || engineNodes || screenName !== 'gameScreen' || game.paused) return;
    const osc = audio.createOscillator(), gain = audio.createGain(), filter = audio.createBiquadFilter(); osc.type = 'sawtooth'; osc.frequency.value = 48; filter.type = 'lowpass'; filter.frequency.value = 115; gain.gain.value = .012; osc.connect(filter); filter.connect(gain); gain.connect(audio.destination); osc.start(); engineNodes = { osc, gain, filter };
  }
  function stopEngine() { if (engineNodes) { try { engineNodes.osc.stop(); } catch (_) {} engineNodes = null; } }
  function startMusic() {
    if (!save.music || !audio || musicNodes) return;
    const now = audio.currentTime, master = audio.createGain(); master.gain.value = .012; master.connect(audio.destination);
    const notes = [55, 82.41, 110];
    const oscillators = notes.map((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = index === 0 ? 'triangle' : 'sine'; oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? .42 : .2; oscillator.connect(gain); gain.connect(master); oscillator.start(now); return oscillator;
    });
    musicNodes = { oscillators, master };
  }
  function stopMusic() {
    if (!musicNodes) return;
    musicNodes.master.gain.setTargetAtTime(0, audio.currentTime, .04);
    musicNodes.oscillators.forEach(oscillator => { try { oscillator.stop(audio.currentTime + .18); } catch (_) {} });
    musicNodes = null;
  }
  function updateSoundIcon() { const icon = document.getElementById('soundIcon'); icon.textContent = save.sound ? '♪' : '♫̸'; document.getElementById('soundToggle').style.color = save.sound ? 'var(--cyan)' : ''; }
  function toggleSound() { save.sound = !save.sound; save.effects = save.sound; save.music = save.sound; persist(); syncSettings(); updateSoundIcon(); if (!save.sound) { stopEngine(); stopMusic(); } else { ensureAudio(); startEngine(); sound('click'); } }

  document.getElementById('playButton').addEventListener('click', beginRun);
  document.getElementById('garageButton').addEventListener('click', () => { sound('click'); showScreen('garageScreen'); });
  document.getElementById('settingsButton').addEventListener('click', () => { sound('click'); showScreen('settingsScreen'); });
  document.getElementById('scoresButton').addEventListener('click', () => { sound('click'); showScreen('scoresScreen'); });
  document.getElementById('soundToggle').addEventListener('click', toggleSound);
  document.getElementById('menuDifficulty').addEventListener('change', e => setDifficulty(e.target.value));
  document.getElementById('settingsDifficulty').addEventListener('change', e => setDifficulty(e.target.value));
  document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => { sound('click'); showScreen(button.dataset.back); }));
  document.getElementById('prevCar').addEventListener('click', () => { sound('click'); movePreview(-1); });
  document.getElementById('nextCar').addEventListener('click', () => { sound('click'); movePreview(1); });
  document.getElementById('carDots').addEventListener('click', e => { const button = e.target.closest('[data-car-index]'); if (button) { sound('click'); previewIndex = Number(button.dataset.carIndex); renderGarage(); } });
  document.getElementById('selectCarButton').addEventListener('click', selectOrUnlockCar);
  document.getElementById('effectsToggle').addEventListener('click', () => { save.effects = !save.effects; save.sound = save.effects || save.music; persist(); syncSettings(); if (!save.effects) stopEngine(); else { ensureAudio(); sound('click'); startEngine(); } updateSoundIcon(); });
  document.getElementById('musicToggle').addEventListener('click', () => { save.music = !save.music; save.sound = save.effects || save.music; persist(); syncSettings(); if (save.music) { ensureAudio(); sound('click'); } else stopMusic(); updateSoundIcon(); });
  document.getElementById('pauseButton').addEventListener('click', pauseRun);
  document.getElementById('resumeButton').addEventListener('click', pauseRun);
  document.getElementById('quitButton').addEventListener('click', () => {
    game.running = false; game.paused = false; game.over = true;
    const score = Math.floor(game.score), newBest = score > save.best;
    save.runs++; save.totalDistance += game.distance; save.longestDistance = Math.max(save.longestDistance, game.distance);
    if (newBest) save.best = score;
    persist(); checkAchievements();
    showScreen('gameOverScreen');
    document.getElementById('finalScore').textContent = formatScore(score);
    document.getElementById('finalDistance').textContent = `${game.distance.toFixed(1)} km`;
    document.getElementById('finalCoins').textContent = game.coins;
    document.getElementById('finalBest').textContent = formatScore(save.best);
    document.getElementById('newBestBadge').style.visibility = newBest ? 'visible' : 'hidden';
    document.getElementById('gameOverEyebrow').textContent = newBest ? 'A NEW NIGHT-TIME RECORD' : 'RUN CALLED EARLY';
  });
  document.getElementById('restartButton').addEventListener('click', beginRun);
  document.getElementById('gameOverMenu').addEventListener('click', () => showScreen('menuScreen'));
  document.getElementById('resetData').addEventListener('click', () => { if (confirm('Reset all Neon Rush progress on this device? This cannot be undone.')) { localStorage.removeItem(SAVE_KEY); save = { ...defaults, unlocked: ['vanta'], achievements: [] }; previewIndex = 0; persist(); renderRecords(); updateMenu(); showToast('Local save reset. The night is yours again.'); } });
  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'A', 'd', 'D'].includes(e.key)) e.preventDefault();
    if (e.repeat && e.key === ' ') return;
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') changeLane(-1);
    else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') changeLane(1);
    else if (e.code === 'Space' && (screenName === 'gameScreen' || screenName === 'pauseScreen')) pauseRun();
    else if (e.key === 'Escape') { if (screenName === 'gameScreen') pauseRun(); else if (screenName !== 'menuScreen') showScreen('menuScreen'); }
  });
  function bindTouchControl(id, direction) {
    const button = document.getElementById(id); let held = false, interval = 0;
    const stop = () => { held = false; clearInterval(interval); };
    button.addEventListener('pointerdown', e => { e.preventDefault(); if (held) return; held = true; changeLane(direction); interval = setInterval(() => { if (held) changeLane(direction); }, 240); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(name => button.addEventListener(name, stop));
  }
  bindTouchControl('leftControl', -1); bindTouchControl('rightControl', 1);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && screenName === 'gameScreen') pauseRun(); });

  resize(); updateMenu(); syncSettings(); showScreen('menuScreen');
  // A small clock gives menu lighting and its car a living idle before the first run.
  requestAnimationFrame(render);
})();
