(function () {
  'use strict';

  const STORAGE_PROFILE = 'mobilePerformanceProfile';
  const STORAGE_TARGET = 'mobileFpsTarget';
  const AUTO = 'AUTO';

  const PROFILE_SETTINGS = {
    LOW: {
      label: 'LOW',
      baseScale: 0.82,
      minScale: 0.62,
      maxScale: 0.95,
      maxDpr: 1,
      shadowMapSize: 512,
      shadowCastDistance: 620,
      shadowReceiveDistance: 1050,
      renderCullDistance: 1120,
      renderCullRadiusMultiplier: 2.15,
      renderOptimizeInterval: 0.52,
      physicsActiveDistance: 850,
      effectBudget: 72,
      effectDensity: 0.46,
      decalLifeScale: 0.58,
      farAiDistance: 460,
      farAiInterval: 980,
      visionIntervalScale: 1.75
    },
    MEDIUM: {
      label: 'MEDIUM',
      baseScale: 0.95,
      minScale: 0.72,
      maxScale: 1.08,
      maxDpr: 1.1,
      shadowMapSize: 768,
      shadowCastDistance: 860,
      shadowReceiveDistance: 1500,
      renderCullDistance: 1450,
      renderCullRadiusMultiplier: 2.45,
      renderOptimizeInterval: 0.44,
      physicsActiveDistance: 1050,
      effectBudget: 104,
      effectDensity: 0.66,
      decalLifeScale: 0.74,
      farAiDistance: 560,
      farAiInterval: 820,
      visionIntervalScale: 1.35
    },
    HIGH: {
      label: 'HIGH',
      baseScale: 1,
      minScale: 0.82,
      maxScale: 1.22,
      maxDpr: 1.28,
      shadowMapSize: 1024,
      shadowCastDistance: 1120,
      shadowReceiveDistance: 2050,
      renderCullDistance: 1740,
      renderCullRadiusMultiplier: 2.8,
      renderOptimizeInterval: 0.38,
      physicsActiveDistance: 1250,
      effectBudget: 132,
      effectDensity: 0.86,
      decalLifeScale: 0.9,
      farAiDistance: 660,
      farAiInterval: 720,
      visionIntervalScale: 1.12
    },
    ULTRA: {
      label: 'ULTRA',
      baseScale: 1,
      minScale: 0.92,
      maxScale: 1.45,
      maxDpr: 1.5,
      shadowMapSize: 1536,
      shadowCastDistance: 1350,
      shadowReceiveDistance: 2400,
      renderCullDistance: 1900,
      renderCullRadiusMultiplier: 3,
      renderOptimizeInterval: 0.35,
      physicsActiveDistance: 1250,
      effectBudget: 150,
      effectDensity: 1,
      decalLifeScale: 1,
      farAiDistance: 720,
      farAiInterval: 650,
      visionIntervalScale: 1
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function readStorage(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Storage may be unavailable in private mode; keep runtime settings only.
    }
  }

  class MobilePerformanceManager {
    constructor(options) {
      this.renderer = options.renderer;
      this.scene = options.scene;
      this.world = options.world;
      this.weapons = options.weapons;
      this.npcs = options.npcs;
      this.weather = options.weather || null;
      this.getIsMobile = options.getIsMobile || (() => false);
      this.selectedProfile = readStorage(STORAGE_PROFILE, AUTO);
      this.targetMode = readStorage(STORAGE_TARGET, 'AUTO');
      this.targetFps = 60;
      this.mobile = false;
      this.dynamicScale = 0;
      this.frameAverage = 16.67;
      this.frameWorst = 16.67;
      this.cooldown = 0;
      this.adaptiveStage = 0;
      this.lowTime = 0;
      this.highTime = 0;
      this.lastAppliedPixelRatio = 0;
      this.stats = {
        profile: 'DESKTOP',
        selectedProfile: this.selectedProfile,
        renderScale: 1,
        targetFps: 60,
        adaptiveStage: 0,
        raycasts: 0,
        losChecks: 0,
        collisionQueries: 0,
        npcAiMs: 0,
        worldMs: 0,
        weaponsMs: 0,
        physicsMs: 0,
        shadowCasters: 0,
        textures: 0
      };
      this.sectionTimes = Object.create(null);
      this.apply();
    }

    setMobileMode(isMobile) {
      this.mobile = Boolean(isMobile);
      this.apply();
    }

    setProfile(profile) {
      this.selectedProfile = PROFILE_SETTINGS[profile] ? profile : AUTO;
      writeStorage(STORAGE_PROFILE, this.selectedProfile);
      this.apply();
    }

    setTargetMode(mode) {
      this.targetMode = mode === '30' || mode === '60' ? mode : 'AUTO';
      writeStorage(STORAGE_TARGET, this.targetMode);
      this.apply();
    }

    getResolvedProfileName() {
      if (!this.mobile) return 'DESKTOP';
      if (PROFILE_SETTINGS[this.selectedProfile]) return this.selectedProfile;
      return this.benchmarkDevice();
    }

    benchmarkDevice() {
      const dpr = window.devicePixelRatio || 1;
      const cores = navigator.hardwareConcurrency || 4;
      const memory = navigator.deviceMemory || 4;
      const pixels = window.innerWidth * window.innerHeight * dpr * dpr;
      let score = 0;
      score += cores >= 8 ? 2 : cores >= 6 ? 1 : 0;
      score += memory >= 8 ? 2 : memory >= 4 ? 1 : 0;
      score += pixels < 600000 ? 2 : pixels < 1100000 ? 1 : pixels > 2200000 ? -1 : 0;
      score += dpr <= 2 ? 1 : -1;
      if (score >= 6 && pixels < 1050000 && dpr <= 2) return 'ULTRA';
      if (score >= 3) return 'HIGH';
      if (score >= 1) return 'MEDIUM';
      return 'LOW';
    }

    getCurrentProfile() {
      return PROFILE_SETTINGS[this.getResolvedProfileName()] || PROFILE_SETTINGS.ULTRA;
    }

    apply() {
      this.mobile = Boolean(this.getIsMobile());
      const profileName = this.getResolvedProfileName();
      const profile = this.getCurrentProfile();
      this.targetFps = this.resolveTargetFps(profileName);
      this.dynamicScale = clamp(this.dynamicScale || profile.baseScale, profile.minScale, profile.maxScale);
      if (!this.mobile) {
        this.dynamicScale = 1;
        this.applyDesktop();
      } else {
        this.applyMobileProfile(profile);
      }
      const size = this.getViewportSize();
      this.resize(size.width, size.height);
      this.updateStats(profileName);
    }

    getViewportSize() {
      const viewport = this.mobile ? window.visualViewport : null;
      return {
        width: Math.max(1, Math.round(viewport && viewport.width ? viewport.width : window.innerWidth)),
        height: Math.max(1, Math.round(viewport && viewport.height ? viewport.height : window.innerHeight))
      };
    }

    resolveTargetFps(profileName) {
      if (this.targetMode === '30') return 30;
      if (this.targetMode === '60') return 60;
      return profileName === 'LOW' ? 30 : 60;
    }

    applyDesktop() {
      const desktopProfile = PROFILE_SETTINGS.ULTRA;
      if (this.world && this.world.setPerformanceProfile) {
        this.world.setPerformanceProfile(Object.assign({}, desktopProfile, { mobile: false }));
      }
      if (this.weapons && this.weapons.setPerformanceProfile) {
        this.weapons.setPerformanceProfile(Object.assign({}, desktopProfile, { mobile: false }));
      }
      if (this.npcs && this.npcs.setPerformanceProfile) {
        this.npcs.setPerformanceProfile(Object.assign({}, desktopProfile, { mobile: false }));
      }
      if (this.renderer && this.renderer.shadowMap) {
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
    }

    applyMobileProfile(profile) {
      const stage = this.adaptiveStage;
      const effectiveProfile = Object.assign({}, profile, {
        shadowCastDistance: profile.shadowCastDistance * (stage >= 3 ? 0.72 : stage >= 2 ? 0.86 : 1),
        shadowReceiveDistance: profile.shadowReceiveDistance * (stage >= 3 ? 0.78 : stage >= 2 ? 0.9 : 1),
        renderCullDistance: profile.renderCullDistance * (stage >= 4 ? 0.76 : stage >= 2 ? 0.88 : 1),
        effectBudget: Math.max(36, Math.round(profile.effectBudget * (stage >= 2 ? 0.64 : stage >= 1 ? 0.82 : 1))),
        effectDensity: profile.effectDensity * (stage >= 2 ? 0.68 : stage >= 1 ? 0.84 : 1),
        farAiInterval: profile.farAiInterval * (stage >= 5 ? 1.35 : stage >= 2 ? 1.16 : 1),
        visionIntervalScale: profile.visionIntervalScale * (stage >= 5 ? 1.24 : 1),
        mobile: true
      });
      if (this.world && this.world.setPerformanceProfile) this.world.setPerformanceProfile(effectiveProfile);
      if (this.weapons && this.weapons.setPerformanceProfile) this.weapons.setPerformanceProfile(effectiveProfile);
      if (this.npcs && this.npcs.setPerformanceProfile) this.npcs.setPerformanceProfile(effectiveProfile);
      if (this.renderer && this.renderer.shadowMap) {
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
      }
      this.applyShadowMapSize(profile.shadowMapSize);
    }

    applyShadowMapSize(size) {
      if (!this.scene) return;
      this.scene.traverse((object) => {
        if (!object.isLight || !object.shadow || !object.shadow.mapSize) return;
        if (object.shadow.mapSize.width === size && object.shadow.mapSize.height === size) return;
        object.shadow.mapSize.set(size, size);
        if (object.shadow.map) {
          object.shadow.map.dispose();
          object.shadow.map = null;
        }
      });
    }

    resize(width, height) {
      if (!this.renderer) return;
      const dpr = window.devicePixelRatio || 1;
      let pixelRatio = Math.min(dpr, 2);
      if (this.mobile) {
        const profile = this.getCurrentProfile();
        pixelRatio = clamp(Math.min(dpr, profile.maxDpr) * this.dynamicScale, 0.55, profile.maxDpr);
      }
      if (Math.abs(pixelRatio - this.lastAppliedPixelRatio) > 0.01) {
        this.renderer.setPixelRatio(pixelRatio);
        this.lastAppliedPixelRatio = pixelRatio;
      }
      this.renderer.setSize(width, height);
      this.updateStats(this.getResolvedProfileName());
    }

    beginFrame() {
      this.sectionTimes.player = 0;
      this.sectionTimes.npc = 0;
      this.sectionTimes.world = 0;
      this.sectionTimes.weapons = 0;
      this.sectionTimes.physics = 0;
    }

    recordSection(name, ms) {
      this.sectionTimes[name] = (this.sectionTimes[name] || 0) + ms;
    }

    update(dt, frameStats) {
      if (!this.mobile) {
        this.updateStats('DESKTOP', frameStats);
        return;
      }
      const frameMs = dt * 1000;
      this.frameAverage += (frameMs - this.frameAverage) * 0.06;
      this.frameWorst += (Math.max(frameMs, this.frameAverage) - this.frameWorst) * 0.025;
      this.cooldown = Math.max(0, this.cooldown - dt);

      const targetMs = 1000 / this.targetFps;
      if (this.frameAverage > targetMs * 1.18) {
        this.lowTime += dt;
        this.highTime = 0;
      } else if (this.frameAverage < targetMs * 0.76 && this.frameWorst < targetMs * 1.1) {
        this.highTime += dt;
        this.lowTime = 0;
      } else {
        this.lowTime = Math.max(0, this.lowTime - dt * 0.5);
        this.highTime = Math.max(0, this.highTime - dt * 0.4);
      }

      const profile = this.getCurrentProfile();
      let changed = false;
      if (this.cooldown <= 0 && this.lowTime > 1.7) {
        if (this.dynamicScale > profile.minScale + 0.02) {
          this.dynamicScale = Math.max(profile.minScale, this.dynamicScale - 0.055);
        } else if (this.adaptiveStage < 6) {
          this.adaptiveStage += 1;
          this.applyMobileProfile(profile);
        }
        this.cooldown = 2.6;
        this.lowTime = 0;
        changed = true;
      } else if (this.cooldown <= 0 && this.highTime > 6.5) {
        if (this.adaptiveStage > 0) {
          this.adaptiveStage -= 1;
          this.applyMobileProfile(profile);
        } else if (this.dynamicScale < profile.maxScale - 0.02) {
          this.dynamicScale = Math.min(profile.maxScale, this.dynamicScale + 0.025);
        }
        this.cooldown = 4.2;
        this.highTime = 0;
        changed = true;
      }

      if (changed) {
        const size = this.getViewportSize();
        this.resize(size.width, size.height);
      }
      this.updateStats(this.getResolvedProfileName(), frameStats);
    }

    collectWorldStats() {
      if (this.world && this.world.consumePerformanceStats) {
        return this.world.consumePerformanceStats();
      }
      return { losChecks: 0, collisionQueries: 0, physicsObjects: 0 };
    }

    updateStats(profileName, frameStats) {
      const worldStats = this.collectWorldStats();
      const memoryInfo = this.renderer && this.renderer.info ? this.renderer.info.memory : {};
      this.stats.profile = profileName;
      this.stats.selectedProfile = this.selectedProfile;
      this.stats.renderScale = this.lastAppliedPixelRatio || 1;
      this.stats.targetFps = this.targetFps;
      this.stats.adaptiveStage = this.adaptiveStage;
      this.stats.raycasts = worldStats.raycasts || 0;
      this.stats.losChecks = worldStats.losChecks || 0;
      this.stats.collisionQueries = worldStats.collisionQueries || 0;
      this.stats.npcAiMs = this.sectionTimes.npc || 0;
      this.stats.worldMs = this.sectionTimes.world || 0;
      this.stats.weaponsMs = this.sectionTimes.weapons || 0;
      this.stats.physicsMs = worldStats.physicsMs || 0;
      this.stats.shadowCasters = worldStats.shadowCasters || 0;
      this.stats.textures = memoryInfo.textures || 0;
      this.stats.geometries = memoryInfo.geometries || 0;
      this.stats.cpuMs = frameStats ? frameStats.cpuMs : 0;
      this.stats.renderMs = frameStats ? frameStats.renderMs : 0;
    }

    getDebugStats() {
      return this.stats;
    }
  }

  window.MobilePerformanceManager = MobilePerformanceManager;
})();
