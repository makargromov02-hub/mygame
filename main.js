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
    debugPerfProfile: document.getElementById('debugPerfProfile'),
    debugRenderScale: document.getElementById('debugRenderScale'),
    debugRaycasts: document.getElementById('debugRaycasts'),
    debugLosChecks: document.getElementById('debugLosChecks'),
    debugCollisionQueries: document.getElementById('debugCollisionQueries'),
    debugNpcAiTime: document.getElementById('debugNpcAiTime'),
    debugWorldTime: document.getElementById('debugWorldTime'),
    debugWeaponsTime: document.getElementById('debugWeaponsTime'),
    debugPhysicsTime: document.getElementById('debugPhysicsTime'),
    debugShadowCasters: document.getElementById('debugShadowCasters'),
    debugTextures: document.getElementById('debugTextures'),
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
    resumeButton: document.getElementById('resumeButton'),
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
    defeatMoney: document.getElementById('defeatMoney'),
    deviceScreen: document.getElementById('deviceScreen'),
    desktopDeviceButton: document.getElementById('desktopDeviceButton'),
    mobileDeviceButton: document.getElementById('mobileDeviceButton'),
    changeDeviceButton: document.getElementById('changeDeviceButton'),
    mobileControls: document.getElementById('mobileControls'),
    mobileLookZone: document.getElementById('mobileLookZone'),
    mobileJoystick: document.getElementById('mobileJoystick'),
    mobileJoystickKnob: document.getElementById('mobileJoystickKnob'),
    mobileFireButton: document.getElementById('mobileFireButton'),
    mobileJumpButton: document.getElementById('mobileJumpButton'),
    mobileReloadButton: document.getElementById('mobileReloadButton'),
    mobileInteractButton: document.getElementById('mobileInteractButton'),
    mobileWeaponButton: document.getElementById('mobileWeaponButton'),
    mobilePistolButton: document.getElementById('mobilePistolButton'),
    mobileRifleButton: document.getElementById('mobileRifleButton'),
    mobileMenuButton: document.getElementById('mobileMenuButton'),
    mobileSensitivity: document.getElementById('mobile-sensitivity'),
    mobileSensitivityValue: document.getElementById('mobile-sensitivity-value'),
    mobileMenuSensitivity: document.getElementById('mobile-menu-sensitivity'),
    mobileMenuSensitivityValue: document.getElementById('mobile-menu-sensitivity-value'),
    mobilePerformanceProfile: document.getElementById('mobile-performance-profile'),
    mobileFpsTarget: document.getElementById('mobile-fps-target'),
    mobileFullscreenButton: document.getElementById('mobileFullscreenButton'),
    mobileControlScale: document.getElementById('mobile-control-scale'),
    mobileControlScaleValue: document.getElementById('mobile-control-scale-value'),
    mobileControlOpacity: document.getElementById('mobile-control-opacity'),
    mobileControlOpacityValue: document.getElementById('mobile-control-opacity-value'),
    mobileEditLayoutButton: document.getElementById('mobileEditLayoutButton'),
    mobileResetControlsButton: document.getElementById('mobileResetControlsButton'),
    mobileEditToolbar: document.getElementById('mobileEditToolbar'),
    mobileEditHint: document.getElementById('mobileEditHint'),
    mobileEditSaveButton: document.getElementById('mobileEditSaveButton'),
    mobileEditCancelButton: document.getElementById('mobileEditCancelButton'),
    mobileEditResetButton: document.getElementById('mobileEditResetButton'),
    mobileRotateOverlay: document.getElementById('mobileRotateOverlay')
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
  let debugDomNextAt = 0;
  let mobileEditReturnPaused = false;
  let mobileEditReturnTabOpen = false;
  let mobileViewportRaf = 0;
  let mobileViewportTimer = 0;
  let mobileViewportLastWidth = 0;
  let mobileViewportLastHeight = 0;
  let mobilePortraitPauseActive = false;
  let mobilePortraitPreviousPaused = false;
  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'];

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
  const mobileControls = new window.MobileControls(hud, {
    move(x, z) {
      player.setAnalogMove(x, z);
    },
    look(dx, dy) {
      if (!modeSystem.paused) player.rotate(dx, dy);
    },
    fire(pressed) {
      weapons.setMouseDown(pressed);
      if (pressed && !modeSystem.paused) weapons.tryShoot(performance.now());
    },
    jump() {
      if (!modeSystem.paused) player.jump();
    },
    reload() {
      if (!modeSystem.paused) weapons.startReload(performance.now());
    },
    interact() {
      if (modeSystem.paused) return;
      handleInteraction();
    },
    switchWeapon(type) {
      if (!modeSystem.paused) weapons.switchWeapon(type);
    },
    menu() {
      modeSystem.togglePause();
      updateMobileControlVisibility();
    },
    beginEdit() {
      mobileEditReturnPaused = modeSystem.paused;
      mobileEditReturnTabOpen = hud.tabMenu && !hud.tabMenu.classList.contains('hidden');
      modeSystem.paused = true;
      if (hud.tabMenu) hud.tabMenu.classList.add('hidden');
      if (hud.modeDialog) hud.modeDialog.classList.add('hidden');
      if (hud.mapDialog) hud.mapDialog.classList.add('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
      updateMobileControlVisibility();
    },
    endEdit() {
      modeSystem.paused = mobileEditReturnPaused;
      if (hud.tabMenu) hud.tabMenu.classList.toggle('hidden', !mobileEditReturnTabOpen);
      updateMobileControlVisibility();
      if (running && !modeSystem.paused) requestPointerLockSafely();
    }
  });
  const deviceMode = new window.DeviceModeSystem(hud, {
    onChooserOpen() {
      if (running) {
        modeSystem.paused = true;
        hud.tabMenu.classList.add('hidden');
        hud.modeDialog.classList.add('hidden');
        if (hud.mapDialog) hud.mapDialog.classList.add('hidden');
        if (document.pointerLockElement) document.exitPointerLock();
      }
    },
    onModeChange() {
      if (running) {
        modeSystem.paused = false;
        hud.tabMenu.classList.add('hidden');
        hud.modeDialog.classList.add('hidden');
        if (hud.mapDialog) hud.mapDialog.classList.add('hidden');
      }
      updateMobileMode();
      performanceManager.setMobileMode(deviceMode.isMobile());
      if (running && !modeSystem.paused) requestPointerLockSafely();
    }
  });
  const performanceManager = new window.MobilePerformanceManager({
    renderer,
    scene,
    world,
    weapons,
    npcs,
    weather: weatherSystem,
    getIsMobile() {
      return deviceMode.isMobile();
    }
  });
  bindPerformanceSettings();
  bindMobileViewportEvents();
  updateMobileMode();
  performanceManager.setMobileMode(deviceMode.isMobile());
  updateMobileViewport('initial');

  function bindPerformanceSettings() {
    if (hud.mobilePerformanceProfile) {
      hud.mobilePerformanceProfile.value = performanceManager.selectedProfile || 'AUTO';
      hud.mobilePerformanceProfile.addEventListener('change', () => {
        performanceManager.setProfile(hud.mobilePerformanceProfile.value);
        scheduleMobileViewportUpdate('profile');
      });
    }
    if (hud.mobileFpsTarget) {
      hud.mobileFpsTarget.value = performanceManager.targetMode || 'AUTO';
      hud.mobileFpsTarget.addEventListener('change', () => {
        performanceManager.setTargetMode(hud.mobileFpsTarget.value);
        scheduleMobileViewportUpdate('fpsTarget');
      });
    }
    if (hud.mobileFullscreenButton) {
      hud.mobileFullscreenButton.addEventListener('click', () => requestMobileFullscreen());
    }
  }

  function getViewportSize() {
    const viewport = window.visualViewport;
    const useVisualViewport = deviceMode && deviceMode.isMobile() && viewport && viewport.width > 0 && viewport.height > 0;
    return {
      width: Math.max(1, Math.round(useVisualViewport ? viewport.width : window.innerWidth)),
      height: Math.max(1, Math.round(useVisualViewport ? viewport.height : window.innerHeight))
    };
  }

  function resize() {
    updateMobileViewport('resize');
  }

  function updateMobileViewport(reason) {
    const size = getViewportSize();
    mobileViewportLastWidth = size.width;
    mobileViewportLastHeight = size.height;
    document.documentElement.style.setProperty('--app-width', size.width + 'px');
    document.documentElement.style.setProperty('--app-height', size.height + 'px');

    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    performanceManager.resize(size.width, size.height);
    if (deviceMode && deviceMode.isMobile() && mobileControls && mobileControls.handleViewportChange) {
      mobileControls.handleViewportChange();
    }
    updateMobileOrientationState(reason);
    updateMobileControlVisibility();
  }

  function scheduleMobileViewportUpdate(reason) {
    if (mobileViewportRaf) cancelAnimationFrame(mobileViewportRaf);
    if (mobileViewportTimer) clearTimeout(mobileViewportTimer);
    if (deviceMode && deviceMode.isMobile() && shouldResetMobilePointers(reason, getViewportSize()) && mobileControls && mobileControls.resetActivePointers) {
      mobileControls.resetActivePointers();
    }
    mobileViewportRaf = requestAnimationFrame(() => {
      mobileViewportRaf = 0;
      updateMobileViewport(reason);
      mobileViewportTimer = setTimeout(() => {
        mobileViewportTimer = 0;
        updateMobileViewport(reason + ':settled');
      }, 180);
    });
  }

  function bindMobileViewportEvents() {
    window.addEventListener('resize', () => scheduleMobileViewportUpdate('resize'), { passive: true });
    window.addEventListener('orientationchange', () => scheduleMobileViewportUpdate('orientationchange'), { passive: true });
    window.addEventListener('fullscreenchange', () => scheduleMobileViewportUpdate('fullscreen'), { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => scheduleMobileViewportUpdate('visualViewport'), { passive: true });
      window.visualViewport.addEventListener('scroll', () => scheduleMobileViewportUpdate('visualViewportScroll'), { passive: true });
    }
    if (screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', () => scheduleMobileViewportUpdate('screenOrientation'));
    }
  }

  function shouldResetMobilePointers(reason, nextSize) {
    const hadSize = mobileViewportLastWidth > 0 && mobileViewportLastHeight > 0;
    const orientationChanged = hadSize
      && nextSize
      && (mobileViewportLastHeight > mobileViewportLastWidth) !== (nextSize.height > nextSize.width);
    return reason === 'resize'
      || reason === 'orientationchange'
      || reason === 'screenOrientation'
      || reason === 'fullscreen'
      || reason === 'fullscreenRequest'
      || reason === 'mode'
      || reason === 'start'
      || orientationChanged;
  }

  function isMobilePortraitGameplay() {
    if (!deviceMode || !deviceMode.isMobile() || !running) return false;
    if (isModalOpen()) return false;
    if (modeSystem.paused && !mobilePortraitPauseActive) return false;
    const size = getViewportSize();
    return size.height > size.width;
  }

  function updateMobileOrientationState() {
    const shouldBlock = isMobilePortraitGameplay();
    document.body.classList.toggle('mobile-portrait-gameplay', shouldBlock);
    if (hud.mobileRotateOverlay) {
      hud.mobileRotateOverlay.classList.toggle('hidden', !shouldBlock);
    }
    if (shouldBlock && !mobilePortraitPauseActive) {
      mobilePortraitPauseActive = true;
      mobilePortraitPreviousPaused = modeSystem.paused;
      modeSystem.paused = true;
      if (mobileControls && mobileControls.resetActivePointers) mobileControls.resetActivePointers();
    } else if (!shouldBlock && mobilePortraitPauseActive) {
      mobilePortraitPauseActive = false;
      modeSystem.paused = mobilePortraitPreviousPaused;
      mobilePortraitPreviousPaused = false;
      if (mobileControls && mobileControls.handleViewportChange) mobileControls.handleViewportChange();
    }
  }

  function requestMobileFullscreen() {
    if (!deviceMode || !deviceMode.isMobile()) return;
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (request) {
      let fullscreenPromise;
      try {
        fullscreenPromise = request.call(root);
      } catch (error) {
        scheduleMobileViewportUpdate('fullscreenRejected');
        return;
      }
      Promise.resolve(fullscreenPromise)
        .then(() => {
          if (screen.orientation && screen.orientation.lock) {
            return screen.orientation.lock('landscape').catch(() => {});
          }
          return null;
        })
        .finally(() => scheduleMobileViewportUpdate('fullscreenRequest'));
    } else {
      scheduleMobileViewportUpdate('fullscreenUnavailable');
    }
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
    const perfStats = performanceManager.getDebugStats ? performanceManager.getDebugStats() : {};
    const debugNow = performance.now();
    if (debugNow < debugDomNextAt) return;
    debugDomNextAt = debugNow + 250;

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
    if (hud.debugPerfProfile) hud.debugPerfProfile.textContent = (perfStats.profile || 'DESKTOP') + (perfStats.adaptiveStage ? ' +' + perfStats.adaptiveStage : '');
    if (hud.debugRenderScale) hud.debugRenderScale.textContent = Number(perfStats.renderScale || 1).toFixed(2) + 'x / ' + (perfStats.targetFps || 60);
    if (hud.debugRaycasts) hud.debugRaycasts.textContent = String(perfStats.raycasts || 0);
    if (hud.debugLosChecks) hud.debugLosChecks.textContent = String(perfStats.losChecks || 0);
    if (hud.debugCollisionQueries) hud.debugCollisionQueries.textContent = String(perfStats.collisionQueries || 0);
    if (hud.debugNpcAiTime) hud.debugNpcAiTime.textContent = Number(perfStats.npcAiMs || 0).toFixed(2) + ' ms';
    if (hud.debugWorldTime) hud.debugWorldTime.textContent = Number(perfStats.worldMs || 0).toFixed(2) + ' ms';
    if (hud.debugWeaponsTime) hud.debugWeaponsTime.textContent = Number(perfStats.weaponsMs || 0).toFixed(2) + ' ms';
    if (hud.debugPhysicsTime) hud.debugPhysicsTime.textContent = Number(perfStats.physicsMs || 0).toFixed(2) + ' ms';
    if (hud.debugShadowCasters) hud.debugShadowCasters.textContent = String(perfStats.shadowCasters || 0);
    if (hud.debugTextures) hud.debugTextures.textContent = String(perfStats.textures || 0) + ' / ' + String(perfStats.geometries || 0);
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

  function handleInteraction() {
    if (world.interactWithLook(player)) {
      return;
    }

    if (!loot.tryCollectNearest()) {
      world.toggleNearestDoor(player.x, player.z, player.y);
    }
  }

  function isModalOpen() {
    return (hud.deviceScreen && !hud.deviceScreen.classList.contains('hidden'))
      || (hud.modeDialog && !hud.modeDialog.classList.contains('hidden'))
      || (hud.mapDialog && !hud.mapDialog.classList.contains('hidden'))
      || (hud.shopScreen && !hud.shopScreen.classList.contains('hidden'))
      || (hud.defeatScreen && !hud.defeatScreen.classList.contains('hidden'));
  }

  function updateMobileMode() {
    releasePointerLockForMobile();
    mobileControls.setEnabled(deviceMode.isMobile());
    scheduleMobileViewportUpdate('mode');
    updateMobileControlVisibility();
  }

  function releasePointerLockForMobile() {
    if (deviceMode && deviceMode.isMobile() && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  function updateMobileControlVisibility() {
    mobileControls.setVisible(deviceMode.isMobile() && running && !modeSystem.paused && !isModalOpen());
  }

  function gameLoop(now) {
    if (!running) return;

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const cpuStart = performance.now();
    performanceManager.beginFrame();

    if (!modeSystem.paused) {
      let sectionStart = performance.now();
      updateMobileControlVisibility();
      mobileControls.update(dt);
      player.update(dt);
      performanceManager.recordSection('player', performance.now() - sectionStart);
      sectionStart = performance.now();
      npcs.update(dt, now);
      const npcStats = npcs.consumePerformanceStats ? npcs.consumePerformanceStats() : null;
      performanceManager.recordSection('npc', npcStats ? npcStats.activeAiMs : performance.now() - sectionStart);
      sectionStart = performance.now();
      world.update(dt);
      performanceManager.recordSection('world', performance.now() - sectionStart);
      sectionStart = performance.now();
      weapons.update(dt, now, npcs);
      performanceManager.recordSection('weapons', performance.now() - sectionStart);
      sectionStart = performance.now();
      loot.update(dt, now);
      baseSystem.update(dt, now);
      weatherSystem.update(dt);
      world.updateInteractionPrompt(player, hud.interactionPrompt);
      audio.update(dt, player);
      modeSystem.update(dt, now);
      performanceManager.recordSection('systems', performance.now() - sectionStart);
    } else if (hud.interactionPrompt) {
      hud.interactionPrompt.classList.add('hidden');
      updateMobileControlVisibility();
    }

    hudSystem.update(now);
    drawHitFlash();
    const renderStart = performance.now();
    lastCpuTime = renderStart - cpuStart;
    renderer.render(scene, camera);
    lastRenderTime = performance.now() - renderStart;
    performanceManager.update(dt, { cpuMs: lastCpuTime, renderMs: lastRenderTime });
    updateDebugOverlay(dt);
    updateFps(now);

    requestAnimationFrame(gameLoop);
  }

  function startGame() {
    if (running) {
      startScreen.classList.add('hidden');
      requestPointerLockSafely();
      updateMobileControlVisibility();
      return;
    }

    running = true;
    startScreen.classList.add('hidden');
    audio.resume();
    requestPointerLockSafely();
    releasePointerLockForMobile();
    updateMobileControlVisibility();
    lastTime = performance.now();
    fpsTime = lastTime;
    frameCount = 0;
    updateMobileViewport('start');
    requestAnimationFrame(gameLoop);
  }

  function requestPointerLockSafely() {
    if (deviceMode && deviceMode.isMobile()) {
      releasePointerLockForMobile();
      return;
    }
    const lockRequest = renderer.domElement.requestPointerLock();

    if (lockRequest && typeof lockRequest.catch === 'function') {
      lockRequest.catch(() => {});
    }
  }

  document.addEventListener('pointerlockchange', releasePointerLockForMobile);

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
          updateMobileControlVisibility();
        }
        return;
      }

      modeSystem.togglePause();
      updateMobileControlVisibility();
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
      handleInteraction();
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
    if (event.target.closest && event.target.closest('.audio-panel, .tab-menu, .mode-dialog, .map-dialog, .shop-screen, .defeat-screen, .device-screen, .start-screen, .mobile-controls')) return;
    if (modeSystem.paused) return;

    if (event.button === 0) {
      if (!deviceMode.isMobile() && document.pointerLockElement !== renderer.domElement) {
        requestPointerLockSafely();
      }
      weapons.setMouseDown(true);
      weapons.tryShoot(performance.now());
    } else if (event.button === 2) {
      if (!deviceMode.isMobile() && document.pointerLockElement !== renderer.domElement) {
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

  if (hud.resumeButton) {
    hud.resumeButton.addEventListener('click', () => {
      if (!running) return;
      modeSystem.paused = false;
      hud.tabMenu.classList.add('hidden');
      updateMobileControlVisibility();
      requestPointerLockSafely();
    });
  }

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
