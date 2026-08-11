(function () {
  'use strict';

  if (!window.THREE) {
    throw new Error('Three.js не загружен');
  }

  const mount = document.getElementById('gameMount');
  const startScreen = document.getElementById('startScreen');
  const playButton = document.getElementById('playButton');
  const audioToggle = document.getElementById('audioToggle');
  const audioMenu = document.getElementById('audioMenu');
  const hud = {
    fps: document.getElementById('fps'),
    kills: document.getElementById('kills'),
    moneyValue: document.getElementById('moneyValue'),
    healthValue: document.getElementById('healthValue'),
    healthBar: document.getElementById('healthBar'),
    armorValue: document.getElementById('armorValue'),
    armorBar: document.getElementById('armorBar'),
    weapon: document.getElementById('weapon'),
    ammo: document.getElementById('ammo'),
    ammoCurrent: document.getElementById('ammoCurrent'),
    ammoMagazine: document.getElementById('ammoMagazine'),
    ammoReserve: document.getElementById('ammoReserve'),
    minimap: document.getElementById('minimap'),
    hitMarker: document.getElementById('hitMarker'),
    damageFlash: document.getElementById('damageFlash'),
    debugOverlay: document.getElementById('debugOverlay'),
    debugFps: document.getElementById('debugFps'),
    debugFrameTime: document.getElementById('debugFrameTime'),
    debugCpuTime: document.getElementById('debugCpuTime'),
    debugGpuTime: document.getElementById('debugGpuTime'),
    debugDrawCalls: document.getElementById('debugDrawCalls'),
    debugTriangles: document.getElementById('debugTriangles'),
    debugVertices: document.getElementById('debugVertices'),
    debugSceneObjects: document.getElementById('debugSceneObjects'),
    debugMeshCount: document.getElementById('debugMeshCount'),
    debugLights: document.getElementById('debugLights'),
    debugMaterials: document.getElementById('debugMaterials'),
    debugActiveNpc: document.getElementById('debugActiveNpc'),
    debugPhysicsObjects: document.getElementById('debugPhysicsObjects'),
    debugMemory: document.getElementById('debugMemory'),
    debugGarbageCollections: document.getElementById('debugGarbageCollections'),
    debugParticles: document.getElementById('debugParticles'),
    interactionPrompt: document.getElementById('interactionPrompt'),
    killFeed: document.getElementById('killFeed'),
    baseHud: document.getElementById('baseHud'),
    baseName: document.getElementById('baseName'),
    baseEnemies: document.getElementById('baseEnemies'),
    baseAlert: document.getElementById('baseAlert'),
    baseMessage: document.getElementById('baseMessage'),
    survivalHud: document.getElementById('survivalHud'),
    waveNumber: document.getElementById('waveNumber'),
    waveEnemies: document.getElementById('waveEnemies'),
    waveTimer: document.getElementById('waveTimer'),
    tabMenu: document.getElementById('tabMenu'),
    modeDialog: document.getElementById('modeDialog'),
    modeButton: document.getElementById('modeButton'),
    mapButton: document.getElementById('mapButton'),
    freeModeButton: document.getElementById('freeModeButton'),
    survivalModeButton: document.getElementById('survivalModeButton'),
    mapDialog: document.getElementById('mapDialog'),
    mapItems: document.getElementById('mapItems'),
    mapMessage: document.getElementById('mapMessage'),
    startMapButton: document.getElementById('startMapButton'),
    defeatScreen: document.getElementById('defeatScreen'),
    defeatWave: document.getElementById('defeatWave'),
    defeatKills: document.getElementById('defeatKills'),
    defeatTime: document.getElementById('defeatTime'),
    defeatStreak: document.getElementById('defeatStreak'),
    bestScore: document.getElementById('bestScore'),
    bestWave: document.getElementById('bestWave'),
    bestKills: document.getElementById('bestKills'),
    retryButton: document.getElementById('retryButton'),
    mainMenuButton: document.getElementById('mainMenuButton'),
    pickupPrompt: document.getElementById('pickupPrompt'),
    waveBanner: document.getElementById('waveBanner'),
    shopScreen: document.getElementById('shopScreen'),
    shopItems: document.getElementById('shopItems'),
    shopMoney: document.getElementById('shopMoney'),
    shopMessage: document.getElementById('shopMessage'),
    nextWaveButton: document.getElementById('nextWaveButton'),
    defeatMoney: document.getElementById('defeatMoney')
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x87bfe8, 900, 4300);

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 1, 6500);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const world = new window.GameWorld(scene);
  const player = new window.Player(camera, world);
  world.setPhysicsFocus(player);
  const audio = new window.AudioSystem();
  const weapons = new window.WeaponSystem(scene, player, world, hud, audio);
  const npcs = new window.NpcManager(scene, world, player, weapons, audio);
  const hudSystem = new window.HudSystem(player, weapons, npcs, world, hud);
  weapons.setCombatHud(hudSystem);
  const loot = new window.LootSystem(scene, world, player, weapons, audio, hud);
  weapons.setLootSystem(loot);
  npcs.setLootSystem(loot);
  const modeSystem = new window.GameModeSystem(scene, player, weapons, npcs, world, hud);
  modeSystem.setLootSystem(loot);
  const baseSystem = new window.BaseSystem(scene, world, player, npcs, loot, modeSystem, hud);
  npcs.setBaseSystem(baseSystem);
  modeSystem.setBaseSystem(baseSystem);
  const weatherSystem = new window.WeatherSystem(scene, world, player, renderer, audio);
  world.setInteractionHandlers({
    spawnLoot(type, x, z) {
      loot.spawn(type, x, z);
    },
    addMoney(amount) {
      modeSystem.addMoney(amount);
    },
    releaseNpc(x, z) {
      const npc = npcs.npcs.find((entry) => !entry.alive);
      if (!npc) return false;
      npcs.resetNpc(npc);
      npc.x = x;
      npc.z = z + 48;
      npc.y = world.getGroundHeightAt(npc.x, npc.z, 0);
      npc.seesPlayer = true;
      npc.state = 'search';
      npc.lastKnownPlayerX = player.x;
      npc.lastKnownPlayerZ = player.z;
      npcs.syncMesh(npc);
      return true;
    }
  });
  const mapSystem = new window.MapSelectionSystem(hud, {
    onOpen() {
      if (running) {
        modeSystem.paused = true;
        hud.tabMenu.classList.add('hidden');
        hud.modeDialog.classList.add('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
      }
    },
    onSelectImplemented() {
      hud.tabMenu.classList.add('hidden');
      hud.modeDialog.classList.add('hidden');
      if (!running) {
        startGame();
        return;
      }
      modeSystem.paused = false;
      requestPointerLockSafely();
    }
  });

  let running = false;
  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTime = performance.now();
  let debugVisible = false;
  let smoothedFps = 0;
  let smoothedFrameTime = 0;
  let sceneObjectCount = 0;
  let meshCount = 0;
  let lightCount = 0;
  let materialCount = 0;
  let vertexCount = 0;
  let sceneCountFrame = 0;
  let lastCpuTime = 0;
  let lastRenderTime = 0;
  let smoothedCpuTime = 0;
  let smoothedRenderTime = 0;
  let lastHeapSize = 0;
  let garbageCollections = 0;
  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'];

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function updateFps(now) {
    frameCount += 1;

    if (now - fpsTime >= 500) {
      const fps = Math.round((frameCount * 1000) / (now - fpsTime));
      hud.fps.textContent = String(fps);
      frameCount = 0;
      fpsTime = now;
    }
  }

  function toggleDebugOverlay() {
    debugVisible = !debugVisible;
    if (hud.debugOverlay) {
      hud.debugOverlay.classList.toggle('hidden', !debugVisible);
    }
  }

  function updateDebugOverlay(dt) {
    if (!debugVisible || !hud.debugOverlay) return;

    const frameMs = dt * 1000;
    const instantFps = dt > 0 ? 1 / dt : 0;
    const smoothing = 0.18;
    smoothedFrameTime = smoothedFrameTime ? smoothedFrameTime + (frameMs - smoothedFrameTime) * smoothing : frameMs;
    smoothedFps = smoothedFps ? smoothedFps + (instantFps - smoothedFps) * smoothing : instantFps;

    sceneCountFrame += 1;
    if (sceneCountFrame % 10 === 1) {
      sceneObjectCount = 0;
      meshCount = 0;
      lightCount = 0;
      vertexCount = 0;
      const materials = new Set();
      scene.traverse((object) => {
        if (!object.visible) return;
        sceneObjectCount += 1;
        if (object.isMesh || object.isInstancedMesh || object.isPoints) {
          meshCount += 1;
          const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of objectMaterials) {
            if (material) materials.add(material.uuid);
          }
          const geometry = object.geometry;
          const position = geometry && geometry.attributes ? geometry.attributes.position : null;
          if (position) vertexCount += position.count * (object.isInstancedMesh ? object.count : 1);
        }
        if (object.isLight) lightCount += 1;
      });
      materialCount = materials.size;
    }

    const renderInfo = renderer.info.render;
    let activeNpc = 0;
    for (const npc of npcs.npcs) {
      if (npc.alive) activeNpc += 1;
    }
    let activePhysics = 0;
    for (const object of world.physicsObjects) {
      if (object && !object.destroyed && object.mesh && !object.sleeping) activePhysics += 1;
    }
    let activeParticles = 0;
    for (const effect of weapons.effects) {
      if (effect.kind === 'particle' && !effect.inPool) activeParticles += 1;
    }
    let memory = 'n/a';
    if (performance && performance.memory) {
      const usedHeap = performance.memory.usedJSHeapSize;
      if (lastHeapSize > 0 && usedHeap < lastHeapSize - 1048576) garbageCollections += 1;
      lastHeapSize = usedHeap;
      memory = formatMemory(usedHeap) + ' / ' + formatMemory(performance.memory.jsHeapSizeLimit);
    }
    smoothedCpuTime = smoothedCpuTime ? smoothedCpuTime + (lastCpuTime - smoothedCpuTime) * smoothing : lastCpuTime;
    smoothedRenderTime = smoothedRenderTime ? smoothedRenderTime + (lastRenderTime - smoothedRenderTime) * smoothing : lastRenderTime;

    hud.debugFps.textContent = smoothedFps.toFixed(1);
    hud.debugFrameTime.textContent = smoothedFrameTime.toFixed(2) + ' ms';
    if (hud.debugCpuTime) hud.debugCpuTime.textContent = smoothedCpuTime.toFixed(2) + ' ms';
    if (hud.debugGpuTime) hud.debugGpuTime.textContent = smoothedRenderTime.toFixed(2) + ' ms';
    hud.debugDrawCalls.textContent = String(renderInfo.calls || 0);
    hud.debugTriangles.textContent = formatNumber(renderInfo.triangles || 0);
    if (hud.debugVertices) hud.debugVertices.textContent = formatNumber(vertexCount);
    hud.debugSceneObjects.textContent = formatNumber(sceneObjectCount);
    hud.debugMeshCount.textContent = formatNumber(meshCount);
    if (hud.debugLights) hud.debugLights.textContent = String(lightCount);
    if (hud.debugMaterials) hud.debugMaterials.textContent = formatNumber(materialCount);
    hud.debugActiveNpc.textContent = String(activeNpc);
    hud.debugPhysicsObjects.textContent = String(activePhysics) + ' / ' + world.physicsObjects.length;
    hud.debugMemory.textContent = memory;
    if (hud.debugGarbageCollections) hud.debugGarbageCollections.textContent = String(garbageCollections);
    hud.debugParticles.textContent = String(activeParticles) + ' / ' + weapons.effects.length;
  }

  function formatNumber(value) {
    return Math.round(value).toLocaleString('ru-RU');
  }

  function formatMemory(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'n/a';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function drawHitFlash() {
    if (hud.damageFlash) {
      hud.damageFlash.style.opacity = player.hitFlash > 0 ? '1' : '0';
    }
  }

  function gameLoop(now) {
    if (!running) return;

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const cpuStart = performance.now();

    if (!modeSystem.paused) {
      player.update(dt);
      npcs.update(dt, now);
      world.update(dt);
      weapons.update(dt, now, npcs);
      loot.update(dt, now);
      baseSystem.update(dt, now);
      weatherSystem.update(dt);
      world.updateInteractionPrompt(player, hud.interactionPrompt);
      audio.update(dt, player);
      modeSystem.update(dt, now);
    } else if (hud.interactionPrompt) {
      hud.interactionPrompt.classList.add('hidden');
    }

    hudSystem.update(now);
    drawHitFlash();
    const renderStart = performance.now();
    lastCpuTime = renderStart - cpuStart;
    renderer.render(scene, camera);
    lastRenderTime = performance.now() - renderStart;
    updateDebugOverlay(dt);
    updateFps(now);

    requestAnimationFrame(gameLoop);
  }

  function startGame() {
    if (running) {
      startScreen.classList.add('hidden');
      requestPointerLockSafely();
      return;
    }

    running = true;
    startScreen.classList.add('hidden');
    audio.resume();
    requestPointerLockSafely();
    lastTime = performance.now();
    fpsTime = lastTime;
    frameCount = 0;
    requestAnimationFrame(gameLoop);
  }

  function requestPointerLockSafely() {
    const lockRequest = renderer.domElement.requestPointerLock();

    if (lockRequest && typeof lockRequest.catch === 'function') {
      lockRequest.catch(() => {});
    }
  }

  window.addEventListener('resize', resize);

  window.addEventListener('keydown', (event) => {
    const gameKeys = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ShiftLeft',
      'ShiftRight',
      'ControlLeft',
      'ControlRight',
      'Space',
      'KeyV',
      'KeyE',
      'F3',
      'Tab',
      'Digit1',
      'Digit2',
      'KeyR'
    ];

    if (gameKeys.includes(event.code)) {
      event.preventDefault();
    }

    if (event.code === 'F3' && !event.repeat) {
      toggleDebugOverlay();
      return;
    }

    if (event.code === 'Tab' && !event.repeat) {
      if (hud.mapDialog && !hud.mapDialog.classList.contains('hidden')) {
        mapSystem.close();
        if (running) {
          modeSystem.paused = false;
          requestPointerLockSafely();
        }
        return;
      }

      modeSystem.togglePause();
      return;
    }

    if (modeSystem.paused) {
      return;
    }

    if (movementKeys.includes(event.code)) {
      player.setKey(event.code, true);
    }

    if (event.code === 'Space' && !event.repeat) {
      player.jump();
    }

    if (event.code === 'KeyV' && !event.repeat) {
      player.tryVault();
    }

    if (event.code === 'KeyE' && !event.repeat) {
      if (world.interactWithLook(player)) {
        return;
      }

      if (!loot.tryCollectNearest()) {
        world.toggleNearestDoor(player.x, player.z, player.y);
      }
    }

    if (event.code === 'Digit1') {
      weapons.switchWeapon('pistol');
    }

    if (event.code === 'Digit2') {
      weapons.switchWeapon('rifle');
    }

    if (event.code === 'KeyR') {
      weapons.startReload(performance.now());
    }
  });

  window.addEventListener('keyup', (event) => {
    if (movementKeys.includes(event.code)) {
      player.setKey(event.code, false);
    }

    if (modeSystem.paused) return;
  });

  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === renderer.domElement) {
      player.rotate(event.movementX, event.movementY);
    }
  });

  window.addEventListener('mousedown', (event) => {
    if (event.target.closest && event.target.closest('.audio-panel, .tab-menu, .mode-dialog, .map-dialog, .shop-screen, .defeat-screen')) return;
    if (modeSystem.paused) return;

    if (event.button === 0) {
      if (document.pointerLockElement !== renderer.domElement) {
        requestPointerLockSafely();
      }
      weapons.setMouseDown(true);
      weapons.tryShoot(performance.now());
    } else if (event.button === 2) {
      if (document.pointerLockElement !== renderer.domElement) {
        requestPointerLockSafely();
      }
      weapons.setAiming(true);
    }
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      weapons.setMouseDown(false);
    } else if (event.button === 2) {
      weapons.setAiming(false);
    }
  });

  renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  playButton.addEventListener('click', startGame);

  audioToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const expanded = audioToggle.getAttribute('aria-expanded') === 'true';
    audioToggle.setAttribute('aria-expanded', String(!expanded));
    audioMenu.classList.toggle('hidden', expanded);
    audio.resume();
  });

  audioToggle.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  audioMenu.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  audioMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  resize();
  renderer.render(scene, camera);
})();
