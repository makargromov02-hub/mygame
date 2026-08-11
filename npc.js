(function () {
  'use strict';

  const { NPC } = window.GameConfig;
  const { randomRange, angleToTarget, applyYawSpreadTo, clamp } = window.GameUtils;
  const VISION_ANGLE = Math.PI * 2 / 3;
  const AWARENESS_RADIUS = NPC.visionRange * 0.72;
  const ALERT_RADIUS = NPC.visionRange * 0.85;
  const SEARCH_LOOK_TIME = 2600;
  const PATROL_PAUSE_CHANCE = 0.22;
  const MAGAZINE_SIZE = 18;
  const RELOAD_TIME = 1450;
  const BURST_MIN = 2;
  const BURST_MAX = 4;
  const BURST_SHOT_DELAY = 150;
  const COVER_PEEK_TIME = 780;
  const COVER_HIDE_TIME = 950;
  const FAR_AI_DISTANCE = NPC.visionRange * 1.45;
  const FAR_AI_INTERVAL = 650;
  const COVER_SCAN_RADIUS = NPC.visionRange * 1.05;
  const COVER_CACHE_INTERVAL = 720;
  const COMBAT_SLOT_RADIUS = NPC.radius * 4.4;
  const ROLE_SEQUENCE = ['assault', 'rifleman', 'sniper', 'heavy', 'commander'];
  const NPC_ROLES = {
    assault: {
      label: 'Штурмовик',
      health: 0.95,
      speed: 1.32,
      spread: 1.08,
      desiredDistance: 165,
      minDistance: 92,
      strafe: 1.36,
      coverChance: 0.32,
      repositionMin: 950,
      repositionMax: 2100,
      burstMin: 3,
      burstMax: 5,
      shotDelay: 125,
      burstPauseMin: 420,
      burstPauseMax: 880,
      grenadeChance: 0.28,
      color: 0xdf6f58
    },
    rifleman: {
      label: 'Стрелок',
      health: 1,
      speed: 1,
      spread: 1,
      desiredDistance: 270,
      minDistance: 160,
      strafe: 0.72,
      coverChance: 0.68,
      repositionMin: 3200,
      repositionMax: 6200,
      burstMin: 2,
      burstMax: 4,
      shotDelay: 155,
      burstPauseMin: 760,
      burstPauseMax: 1550,
      grenadeChance: 0.18,
      color: NPC.color
    },
    sniper: {
      label: 'Снайпер',
      health: 0.82,
      speed: 0.72,
      spread: 0.42,
      desiredDistance: 520,
      minDistance: 360,
      strafe: 0.28,
      coverChance: 0.74,
      repositionMin: 5600,
      repositionMax: 9800,
      burstMin: 1,
      burstMax: 1,
      shotDelay: 520,
      burstPauseMin: 1450,
      burstPauseMax: 2800,
      grenadeChance: 0.06,
      color: 0x7fb4d8
    },
    heavy: {
      label: 'Тяжёлый',
      health: 1.75,
      speed: 0.68,
      spread: 1.28,
      desiredDistance: 235,
      minDistance: 130,
      strafe: 0.38,
      coverChance: 0.36,
      repositionMin: 3600,
      repositionMax: 6800,
      burstMin: 6,
      burstMax: 10,
      shotDelay: 92,
      burstPauseMin: 520,
      burstPauseMax: 1050,
      magazine: 1.65,
      reload: 1.25,
      grenadeChance: 0.22,
      color: 0xb75f62
    },
    commander: {
      label: 'Командир',
      health: 1.18,
      speed: 0.92,
      spread: 0.84,
      desiredDistance: 330,
      minDistance: 220,
      strafe: 0.55,
      coverChance: 0.62,
      repositionMin: 3000,
      repositionMax: 5800,
      burstMin: 2,
      burstMax: 3,
      shotDelay: 175,
      burstPauseMin: 820,
      burstPauseMax: 1600,
      grenadeChance: 0.2,
      color: 0xd4a64d,
      commands: true
    }
  };
  const SEARCH_PATTERNS = ['left', 'right', 'cover', 'forward'];
  const MOVE_OFFSETS = [0, 0.55, -0.55, 1.05, -1.05, 1.65, -1.65];
  const GRENADE_POOL_SIZE = 8;
  const GRENADE_FUSE = 1.05;
  const HITBOXES = [
    { part: 'head', label: 'Голова', multiplier: 2.5, kind: 'sphere', x: 0, y: 76, z: 0, radius: 14 },
    { part: 'leftArm', label: 'Левая рука', multiplier: 0.75, kind: 'box', x: -19, y: 43, z: 1, hx: 8, hy: 20, hz: 8 },
    { part: 'rightArm', label: 'Правая рука', multiplier: 0.75, kind: 'box', x: 19, y: 43, z: 1, hx: 8, hy: 20, hz: 8 },
    { part: 'leftLeg', label: 'Левая нога', multiplier: 0.6, kind: 'box', x: -8, y: 13, z: 0, hx: 8, hy: 19, hz: 8 },
    { part: 'rightLeg', label: 'Правая нога', multiplier: 0.6, kind: 'box', x: 8, y: 13, z: 0, hx: 8, hy: 19, hz: 8 },
    { part: 'torso', label: 'Торс', multiplier: 1, kind: 'box', x: 0, y: 43, z: 1, hx: 17, hy: 24, hz: 12 }
  ];
  const LEG_INJURY_TIME = 2800;
  const ARM_INJURY_TIME = 3000;

  class NpcManager {
    constructor(scene, world, player, weapons, audio) {
      this.scene = scene;
      this.world = world;
      this.player = player;
      this.weapons = weapons;
      this.audio = audio;
      this.npcs = [];
      this.kills = 0;
      this.respawnEnabled = true;
      this.lootSystem = null;
      this.baseSystem = null;
      this.grenades = [];
      this.grenadePool = [];
      this.squadThinkAt = 0;
      this.playerStillSince = performance.now();
      this.playerShootingSince = 0;
      this.squadDisruptedUntil = 0;
      this.lastPlayerX = player.x;
      this.lastPlayerZ = player.z;
      this.lastPlayerMoveX = 0;
      this.lastPlayerMoveZ = 1;
      this.lastPlayerShotX = player.x;
      this.lastPlayerShotZ = player.z;
      this.lastPlayerShotAt = 0;
      this.lastShotAlertAt = 0;
      this.tempShotOrigin = new THREE.Vector3();
      this.tempShotTarget = new THREE.Vector3();
      this.tempShotDirection = new THREE.Vector3();
      this.tempSpreadDirection = new THREE.Vector3();
      this.geometryCache = {
        boxes: new Map(),
        cylinders: new Map(),
        head: new THREE.SphereGeometry(12, 18, 14),
        limb: new THREE.CylinderGeometry(4.5, 5.5, 30, 12)
      };
      this.sharedMaterials = {
        suit: new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.82 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.74 }),
        boot: new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: 0.86 }),
        healthBack: new THREE.MeshBasicMaterial({ color: 0x11161c })
      };
      this.grenadeGeometry = new THREE.SphereGeometry(6, 10, 8);
      this.grenadeMaterial = new THREE.MeshStandardMaterial({ color: 0x27313a, roughness: 0.72, metalness: 0.25 });
      this.stats = {
        maxHealth: NPC.maxHealth,
        speed: NPC.speed,
        bulletSpread: NPC.bulletSpread
      };
      this.createGrenadePool();

      for (let i = 0; i < NPC.count; i += 1) {
        this.npcs.push(this.createNpc(i));
      }
    }

    setLootSystem(lootSystem) {
      this.lootSystem = lootSystem;
    }

    setBaseSystem(baseSystem) {
      this.baseSystem = baseSystem;
    }

    ensureNpcCount(count) {
      while (this.npcs.length < count) {
        this.npcs.push(this.createNpc(this.npcs.length));
      }
    }

    getRoleKey(id) {
      return ROLE_SEQUENCE[id % ROLE_SEQUENCE.length];
    }

    assignRole(npc, roleKey) {
      const key = roleKey && NPC_ROLES[roleKey] ? roleKey : this.getRoleKey(npc.id || 0);
      npc.roleKey = key;
      npc.role = NPC_ROLES[key];
      if (npc.group && npc.group.userData.bodyMaterial) {
        npc.group.userData.bodyMaterial.color.setHex(npc.role.color || NPC.color);
      }
    }

    applyRoleStats(npc, overrides) {
      const role = npc.role || NPC_ROLES.rifleman;
      const settings = overrides || {};
      npc.maxHealth = (settings.maxHealth || this.stats.maxHealth) * (role.health || 1);
      npc.speed = (settings.speed || this.stats.speed) * (role.speed || 1);
      npc.bulletSpread = (settings.bulletSpread || this.stats.bulletSpread) * (role.spread || 1);
      npc.magazineSize = Math.max(1, Math.round(MAGAZINE_SIZE * (role.magazine || 1)));
      npc.reloadTime = RELOAD_TIME * (role.reload || 1);
      npc.visionRange = (settings.visionRange || this.stats.visionRange || NPC.visionRange) * (role.vision || 1) * (npc.personality ? npc.personality.perception : 1);
      npc.reactionDelay = (npc.personality ? npc.personality.reactionDelay : 260) * (settings.reactionMultiplier || this.stats.reactionMultiplier || 1);
      npc.accuracyBias = npc.personality ? npc.personality.accuracy : 1;
      npc.aggression = npc.personality ? npc.personality.aggression : 1;
      npc.caution = npc.personality ? npc.personality.caution : 1;
    }

    createPersonality(id) {
      const seed = (id * 9301 + 49297) % 233280;
      const n = (offset) => {
        const value = Math.sin(seed + offset * 12.9898) * 43758.5453;
        return value - Math.floor(value);
      };

      return {
        reactionDelay: 150 + n(1) * 360,
        accuracy: 0.86 + n(2) * 0.32,
        aggression: 0.72 + n(3) * 0.62,
        caution: 0.74 + n(4) * 0.56,
        perception: 0.92 + n(5) * 0.18,
        teamwork: 0.72 + n(6) * 0.5,
        flankPreference: n(7) < 0.5 ? -1 : 1,
        burstDiscipline: 0.82 + n(8) * 0.36,
        aimWaver: 0.75 + n(9) * 0.55,
        searchPatience: 0.82 + n(10) * 0.45
      };
    }

    createGrenadePool() {
      for (let i = 0; i < GRENADE_POOL_SIZE; i += 1) {
        const mesh = new THREE.Mesh(this.grenadeGeometry, this.grenadeMaterial);
        mesh.visible = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.grenadePool.push({
          mesh,
          active: false,
          x: 0,
          y: 0,
          z: 0,
          startX: 0,
          startY: 0,
          startZ: 0,
          targetX: 0,
          targetZ: 0,
          elapsed: 0,
          fuse: GRENADE_FUSE,
          ownerId: -1
        });
      }
    }

    createNpc(id) {
      const point = this.world.findFreePosition(NPC.radius, this.player);
      const npc = {
        id,
        x: point.x,
        y: this.world.getGroundHeightAt(point.x, point.z, 0),
        z: point.z,
        renderX: point.x,
        renderY: this.world.getGroundHeightAt(point.x, point.z, 0),
        renderZ: point.z,
        renderAngle: 0,
        angle: randomRange(0, Math.PI * 2),
        changeDirectionIn: randomRange(NPC.turnEveryMin, NPC.turnEveryMax),
        walkTime: randomRange(0, Math.PI * 2),
        hitFlash: 0,
        hurtTime: 0,
        hurtAngle: 0,
        hurtPoseSign: 1,
        fallStartY: 0,
        knockbackX: 0,
        knockbackZ: 0,
        balanceTime: 0,
        isMoving: false,
        seesPlayer: false,
        state: 'patrol',
        roleKey: this.getRoleKey(id),
        role: NPC_ROLES[this.getRoleKey(id)],
        personality: this.createPersonality(id),
        targetX: point.x,
        targetZ: point.z,
        lastKnownPlayerX: point.x,
        lastKnownPlayerZ: point.z,
        searchUntil: 0,
        coverUntil: 0,
        nextRepositionAt: performance.now() + randomRange(NPC.repositionMin, NPC.repositionMax),
        nextShotAt: performance.now() + randomRange(300, 1200),
        patrolPauseUntil: 0,
        searchArrivedAt: 0,
        searchLookAngle: 0,
        strafeDirection: Math.random() < 0.5 ? -1 : 1,
        strafeUntil: performance.now() + randomRange(900, 1800),
        ammo: MAGAZINE_SIZE,
        reloadUntil: 0,
        burstShotsRemaining: 0,
        nextBurstAt: performance.now() + randomRange(500, 1300),
        coverPeekUntil: 0,
        coverHideUntil: 0,
        isPeeking: true,
        isShooting: false,
        aimKick: 0,
        lastCombatActionAt: 0,
        lastShotAt: 0,
        playerSpottedAt: 0,
        readyToFireAt: 0,
        nextFarThinkAt: 0,
        nextVisionAt: 0,
        nextDoorCheckAt: 0,
        headYaw: 0,
        torsoYaw: 0,
        tacticalOrder: 'hold',
        searchPattern: SEARCH_PATTERNS[id % SEARCH_PATTERNS.length],
        lastKnownPlayerDx: 0,
        lastKnownPlayerDz: 1,
        lastShotX: point.x,
        lastShotZ: point.z,
        lastShotMemoryAt: 0,
        suppressedUntil: 0,
        exposedUntil: 0,
        coverSide: Math.random() < 0.5 ? -1 : 1,
        commandGestureUntil: 0,
        cautiousUntil: 0,
        dodgeUntil: 0,
        grenadeCooldownUntil: performance.now() + randomRange(3500, 8000),
        coverCacheAt: 0,
        coverCandidates: null,
        lastDecisionAt: 0,
        maxHealth: this.stats.maxHealth,
        speed: this.stats.speed,
        bulletSpread: this.stats.bulletSpread,
        health: this.stats.maxHealth,
        alive: true,
        deadAt: 0,
        respawnAt: 0,
        group: this.buildNpcMesh()
      };

      this.initializeAiState(npc, performance.now());
      this.assignRole(npc, npc.roleKey);
      this.applyRoleStats(npc);
      npc.ammo = npc.magazineSize || MAGAZINE_SIZE;
      npc.health = npc.maxHealth;
      this.resetRenderState(npc);
      this.scene.add(npc.group);
      this.syncMesh(npc, 0, true);
      return npc;
    }

    initializeAiState(npc, now) {
      npc.state = 'patrol';
      npc.seesPlayer = false;
      npc.isMoving = false;
      npc.targetX = npc.x;
      npc.targetZ = npc.z;
      npc.lastKnownPlayerX = npc.x;
      npc.lastKnownPlayerZ = npc.z;
      npc.searchUntil = 0;
      npc.coverUntil = 0;
      npc.patrolPauseUntil = 0;
      npc.searchArrivedAt = 0;
      npc.searchLookAngle = npc.angle;
      npc.searchTargetUntil = 0;
      npc.changeDirectionIn = randomRange(NPC.turnEveryMin, NPC.turnEveryMax);
      npc.nextRepositionAt = now + randomRange(NPC.repositionMin, NPC.repositionMax);
      npc.nextShotAt = now + randomRange(220, 750);
      npc.strafeDirection = Math.random() < 0.5 ? -1 : 1;
      npc.strafeUntil = now + randomRange(900, 1800);
      npc.ammo = MAGAZINE_SIZE;
      npc.reloadUntil = 0;
      npc.burstShotsRemaining = 0;
      npc.nextBurstAt = now + randomRange(260, 900);
      npc.coverPeekUntil = 0;
      npc.coverHideUntil = 0;
      npc.isPeeking = true;
      npc.isShooting = false;
      npc.aimKick = 0;
      npc.lastCombatActionAt = now;
      npc.lastShotAt = 0;
      npc.playerSpottedAt = 0;
      npc.readyToFireAt = 0;
      npc.nextFarThinkAt = now + randomRange(0, FAR_AI_INTERVAL);
      npc.nextVisionAt = now + randomRange(0, 120);
      npc.nextDoorCheckAt = now + randomRange(0, 260);
      npc.headYaw = 0;
      npc.torsoYaw = 0;
      npc.tacticalOrder = 'hold';
      npc.searchPattern = SEARCH_PATTERNS[npc.id % SEARCH_PATTERNS.length];
      npc.lastKnownPlayerDx = 0;
      npc.lastKnownPlayerDz = 1;
      npc.lastShotX = npc.x;
      npc.lastShotZ = npc.z;
      npc.lastShotMemoryAt = 0;
      npc.suppressedUntil = 0;
      npc.exposedUntil = 0;
      npc.coverSide = Math.random() < 0.5 ? -1 : 1;
      npc.aimReadyAt = 0;
      npc.patrolTargetX = npc.x;
      npc.patrolTargetZ = npc.z;
      npc.patrolTargetUntil = 0;
      npc.commandGestureUntil = 0;
      npc.cautiousUntil = 0;
      npc.dodgeUntil = 0;
      npc.grenadeCooldownUntil = now + randomRange(3500, 8000);
      npc.alertedByAllyUntil = 0;
      npc.coverCacheAt = 0;
      npc.coverCandidates = null;
      npc.lastDecisionAt = now;
      npc.hurtPart = 'torso';
      npc.hurtStrength = 1;
      npc.hurtPoseSign = 1;
      npc.limpUntil = 0;
      npc.limpSide = '';
      npc.armInjuryUntil = 0;
      npc.armInjurySide = '';
    }

    configureForMode(options) {
      this.respawnEnabled = options.respawnEnabled !== false;
      this.stats = {
        maxHealth: options.maxHealth || NPC.maxHealth,
        speed: options.speed || NPC.speed,
        bulletSpread: options.bulletSpread || NPC.bulletSpread,
        visionRange: options.visionRange || NPC.visionRange,
        reactionMultiplier: options.reactionMultiplier || 1
      };
    }

    spawnWave(count, stats) {
      this.configureForMode(Object.assign({ respawnEnabled: false }, stats || {}));
      const roleKeys = stats && stats.roleKeys ? stats.roleKeys : null;

      while (this.npcs.length < count) {
        this.npcs.push(this.createNpc(this.npcs.length));
      }

      for (let i = 0; i < this.npcs.length; i += 1) {
        const npc = this.npcs[i];
        if (i < count) {
          if (roleKeys && roleKeys[i]) npc.roleKey = roleKeys[i];
          this.resetNpc(npc);
        } else {
          npc.alive = false;
          npc.group.visible = false;
          npc.respawnAt = Infinity;
        }
      }
    }

    resetFreePlay() {
      this.configureForMode({ respawnEnabled: true });

      while (this.npcs.length < NPC.count) {
        this.npcs.push(this.createNpc(this.npcs.length));
      }

      for (let i = 0; i < this.npcs.length; i += 1) {
        const npc = this.npcs[i];
        if (i < NPC.count) {
          this.resetNpc(npc);
        } else {
          npc.alive = false;
          npc.group.visible = false;
          npc.respawnAt = Infinity;
        }
      }
    }

    aliveCount() {
      return this.npcs.filter((npc) => npc.alive).length;
    }

    buildNpcMesh() {
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: NPC.color, roughness: 0.78 });
      const headMaterial = new THREE.MeshStandardMaterial({ color: 0xd8a27d, roughness: 0.68 });
      const suitMaterial = this.sharedMaterials.suit;
      const darkMaterial = this.sharedMaterials.dark;
      const bootMaterial = this.sharedMaterials.boot;

      const torso = this.addBox(group, 'torso', { x: 24, y: 34, z: 14 }, { x: 0, y: 42, z: 0 }, bodyMaterial);
      this.addBox(group, 'vest', { x: 27, y: 20, z: 16 }, { x: 0, y: 38, z: 2 }, suitMaterial);

      const neck = this.addCylinder(group, 'neck', 4, 4, 8, { x: 0, y: 63, z: 0 }, headMaterial);
      const head = new THREE.Mesh(this.geometryCache.head, headMaterial);
      head.position.set(0, 76, 0);
      head.castShadow = true;
      head.receiveShadow = true;
      group.add(head);
      group.userData.head = head;
      group.userData.neck = neck;
      group.userData.torso = torso;

      const visor = this.addBox(group, 'visor', { x: 16, y: 5, z: 5 }, { x: 0, y: 78, z: 10 }, darkMaterial);
      this.addBox(group, 'belt', { x: 28, y: 5, z: 17 }, { x: 0, y: 25, z: 0 }, darkMaterial);

      const leftArm = this.addLimb(group, 'leftArm', { x: -18, y: 43, z: 1 }, bodyMaterial);
      const rightArm = this.addLimb(group, 'rightArm', { x: 18, y: 43, z: 1 }, bodyMaterial);
      const leftLeg = this.addLimb(group, 'leftLeg', { x: -8, y: 13, z: 0 }, bootMaterial);
      const rightLeg = this.addLimb(group, 'rightLeg', { x: 8, y: 13, z: 0 }, bootMaterial);

      leftArm.rotation.z = 0.22;
      rightArm.rotation.z = -0.22;

      const npcWeapon = this.addBox(group, 'weapon', { x: 7, y: 7, z: 26 }, { x: 0, y: 43, z: 18 }, darkMaterial);
      const barrel = this.addCylinder(group, 'barrel', 2, 2, 24, { x: 0, y: 43, z: 34 }, darkMaterial);
      barrel.rotation.x = Math.PI / 2;
      group.userData.weapon = npcWeapon;
      group.userData.barrel = barrel;

      const healthBack = this.addBox(group, 'healthBack', { x: 48, y: 5, z: 3 }, { x: 0, y: 96, z: 0 }, this.sharedMaterials.healthBack);
      const healthFill = this.addBox(group, 'healthFill', { x: 46, y: 4, z: 3.2 }, { x: 0, y: 96, z: -0.2 }, new THREE.MeshBasicMaterial({ color: 0x42d59b }));
      group.userData.healthBack = healthBack;
      group.userData.healthFill = healthFill;
      group.userData.leftArm = leftArm;
      group.userData.rightArm = rightArm;
      group.userData.leftLeg = leftLeg;
      group.userData.rightLeg = rightLeg;
      group.userData.visor = visor;
      group.userData.bodyMaterial = bodyMaterial;
      group.userData.headMaterial = headMaterial;

      return group;
    }

    addBox(parent, name, size, position, material) {
      const mesh = new THREE.Mesh(this.getBoxGeometry(size), material);
      mesh.name = name;
      mesh.position.set(position.x, position.y, position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    addCylinder(parent, name, radiusTop, radiusBottom, height, position, material) {
      const mesh = new THREE.Mesh(this.getCylinderGeometry(radiusTop, radiusBottom, height, 14), material);
      mesh.name = name;
      mesh.position.set(position.x, position.y, position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    addLimb(parent, name, position, material) {
      const limb = new THREE.Mesh(this.geometryCache.limb, material);
      limb.name = name;
      limb.position.set(position.x, position.y, position.z);
      limb.castShadow = true;
      limb.receiveShadow = true;
      parent.add(limb);
      return limb;
    }

    getBoxGeometry(size) {
      const key = size.x + 'x' + size.y + 'x' + size.z;
      let geometry = this.geometryCache.boxes.get(key);
      if (!geometry) {
        geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        this.geometryCache.boxes.set(key, geometry);
      }
      return geometry;
    }

    getCylinderGeometry(radiusTop, radiusBottom, height, segments) {
      const key = radiusTop + 'x' + radiusBottom + 'x' + height + 'x' + segments;
      let geometry = this.geometryCache.cylinders.get(key);
      if (!geometry) {
        geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
        this.geometryCache.cylinders.set(key, geometry);
      }
      return geometry;
    }

    resetNpc(npc) {
      const point = this.world.findFreePosition(NPC.radius, this.player);
      npc.x = point.x;
      npc.y = this.world.getGroundHeightAt(point.x, point.z, 0);
      npc.z = point.z;
      npc.angle = randomRange(0, Math.PI * 2);
      npc.changeDirectionIn = randomRange(NPC.turnEveryMin, NPC.turnEveryMax);
      npc.walkTime = randomRange(0, Math.PI * 2);
      npc.hitFlash = 0;
      npc.hurtTime = 0;
      npc.hurtAngle = 0;
      npc.hurtPoseSign = 1;
      npc.fallStartY = npc.y;
      npc.knockbackX = 0;
      npc.knockbackZ = 0;
      npc.balanceTime = 0;
      this.initializeAiState(npc, performance.now());
      this.assignRole(npc, npc.roleKey);
      this.applyRoleStats(npc);
      npc.ammo = npc.magazineSize || MAGAZINE_SIZE;
      npc.isBaseGuard = false;
      npc.baseId = '';
      npc.baseReinforcement = false;
      npc.health = npc.maxHealth;
      npc.alive = true;
      npc.deadAt = 0;
      npc.respawnAt = 0;
      npc.group.visible = true;
      npc.group.position.y = 0;
      npc.group.rotation.x = 0;
      npc.group.rotation.z = 0;
      this.resetRenderState(npc);
      this.syncMesh(npc, 0, true);
    }

    activateNpcAt(npc, x, z, options) {
      const settings = options || {};
      npc.x = clamp(x, NPC.radius, window.GameConfig.WORLD.width - NPC.radius);
      npc.z = clamp(z, NPC.radius, window.GameConfig.WORLD.height - NPC.radius);
      npc.y = this.world.getGroundHeightAt(npc.x, npc.z, 0);
      npc.angle = settings.angle !== undefined ? settings.angle : randomRange(0, Math.PI * 2);
      npc.walkTime = randomRange(0, Math.PI * 2);
      npc.hitFlash = 0;
      npc.hurtTime = 0;
      npc.hurtAngle = 0;
      npc.hurtPoseSign = 1;
      npc.fallStartY = npc.y;
      npc.knockbackX = 0;
      npc.knockbackZ = 0;
      npc.balanceTime = 0;
      this.initializeAiState(npc, performance.now());
      this.assignRole(npc, settings.roleKey || npc.roleKey);
      this.applyRoleStats(npc, settings);
      npc.ammo = npc.magazineSize || MAGAZINE_SIZE;
      npc.health = npc.maxHealth;
      npc.alive = true;
      npc.deadAt = 0;
      npc.respawnAt = settings.respawnAt === undefined ? 0 : settings.respawnAt;
      npc.group.visible = true;
      npc.group.position.y = 0;
      npc.group.rotation.x = 0;
      npc.group.rotation.z = 0;
      this.resetRenderState(npc);
      this.syncMesh(npc, 0, true);
    }

    update(dt, now) {
      this.updateGroupContext(now);
      this.updateGrenades(dt, now);

      for (const npc of this.npcs) {
        if (!npc.alive) {
          if (this.respawnEnabled && now >= npc.respawnAt) {
            this.resetNpc(npc);
          } else {
            this.updateDeathAnimation(npc, now);
          }
          continue;
        }

        npc.hitFlash = Math.max(0, npc.hitFlash - dt);
        npc.hurtTime = Math.max(0, npc.hurtTime - dt);
        npc.isMoving = false;

        const distanceToPlayer = Math.hypot(this.player.x - npc.x, this.player.z - npc.z);
        if (this.shouldUseFarAi(npc, distanceToPlayer, now)) {
          this.updateFarNpc(npc, dt, now);
          continue;
        }

        this.setNpcLowDetail(npc, false);
        const hadVision = Boolean(npc.seesPlayer);
        npc.seesPlayer = this.updateNpcVision(npc, distanceToPlayer, now);
        if (npc.seesPlayer) {
          this.markPlayerDetected(npc, now, hadVision);
          this.alertNearbyNpcs(npc, now);
          if (this.baseSystem) {
            this.baseSystem.handleNpcDetected(npc, now);
          }
        }
        npc.isShooting = false;
        npc.aimKick = Math.max(0, npc.aimKick - dt * 7);

        this.updateBehavior(npc, distanceToPlayer, dt, now);
        this.applyGroupSpacing(npc, dt);
        this.updateKnockback(npc, dt);
        this.updateVerticalPosition(npc, dt);
        if (now >= (npc.nextDoorCheckAt || 0)) {
          this.openNearbyDoor(npc);
          npc.nextDoorCheckAt = now + 220 + randomRange(0, 140);
        }

        if (npc.isMoving) {
          npc.walkTime += dt * 8.5;
        } else {
          npc.walkTime += dt * 2.5;
        }

        this.syncMesh(npc, dt);
      }
    }

    shouldUseFarAi(npc, distanceToPlayer, now) {
      return distanceToPlayer > FAR_AI_DISTANCE
        && !npc.seesPlayer
        && now >= (npc.searchUntil || 0)
        && now >= (npc.alertedByAllyUntil || 0)
        && Math.hypot(npc.knockbackX || 0, npc.knockbackZ || 0) < 1;
    }

    updateFarNpc(npc, dt, now) {
      npc.seesPlayer = false;
      npc.isShooting = false;
      npc.aimKick = 0;
      this.setNpcLowDetail(npc, true);

      if (now < (npc.nextFarThinkAt || 0)) {
        npc.isMoving = this.hasPendingRenderMovement(npc);
        npc.walkTime += npc.isMoving ? dt * 8.5 : dt * 2.5;
        this.syncDistantMesh(npc, dt);
        return;
      }

      npc.nextFarThinkAt = now + FAR_AI_INTERVAL + randomRange(-120, 180);
      this.updateWander(npc, Math.max(dt, FAR_AI_INTERVAL / 1000), now);
      this.updateVerticalPosition(npc, dt);
      npc.isMoving = npc.isMoving || this.hasPendingRenderMovement(npc);
      npc.walkTime += npc.isMoving ? dt * 8.5 : dt * 2.5;
      this.syncDistantMesh(npc, dt);
    }

    updateGroupContext(now) {
      const playerMoved = Math.hypot(this.player.x - this.lastPlayerX, this.player.z - this.lastPlayerZ);
      if (playerMoved > 28) {
        this.playerStillSince = now;
        this.lastPlayerMoveX = (this.player.x - this.lastPlayerX) / playerMoved;
        this.lastPlayerMoveZ = (this.player.z - this.lastPlayerZ) / playerMoved;
        this.lastPlayerX = this.player.x;
        this.lastPlayerZ = this.player.z;
      }

      if (now < this.squadThinkAt) return;
      this.squadThinkAt = now + 460;
      this.updatePlayerShotMemory(now);
      this.alertNpcsByGunfire(now);
      this.updateSuppression(now);

      let commander = null;
      for (const npc of this.npcs) {
        if (npc.alive && npc.roleKey === 'commander' && (npc.seesPlayer || now < (npc.searchUntil || 0))) {
          commander = npc;
          break;
        }
      }

      if (!commander || now < this.squadDisruptedUntil) {
        this.updateUncoordinatedSquad(now);
        return;
      }

      commander.commandGestureUntil = now + 520;
      let flankIndex = 0;
      let searchIndex = 0;
      for (const npc of this.npcs) {
        if (!npc.alive || npc === commander) continue;
        const distance = Math.hypot(npc.x - commander.x, npc.z - commander.z);
        if (distance > ALERT_RADIUS * 1.15) continue;

        if (npc.seesPlayer) {
          npc.tacticalOrder = npc.roleKey === 'sniper' ? 'hold'
            : npc.roleKey === 'heavy' ? 'suppress'
              : flankIndex % 2 === 0 ? 'flankLeft' : 'flankRight';
          flankIndex += 1;
          npc.nextRepositionAt = Math.min(npc.nextRepositionAt || now, now + randomRange(320, 900));
        } else if (now < (npc.searchUntil || 0)) {
          npc.searchPattern = SEARCH_PATTERNS[searchIndex % SEARCH_PATTERNS.length];
          npc.tacticalOrder = npc.searchPattern === 'cover' ? 'hold' : 'sweep';
          searchIndex += 1;
        }
      }
    }

    updatePlayerShotMemory(now) {
      let playerBulletSeen = false;
      if (this.weapons && this.weapons.bullets) {
        for (const bullet of this.weapons.bullets) {
          if (!bullet || bullet.owner !== 'player' || !bullet.mesh || !bullet.mesh.visible) continue;
          playerBulletSeen = true;
          this.lastPlayerShotX = bullet.mesh.position.x;
          this.lastPlayerShotZ = bullet.mesh.position.z;
          break;
        }
      }

      if (playerBulletSeen || (this.weapons && this.weapons.mouseDown)) {
        if (!this.playerShootingSince) this.playerShootingSince = now;
        this.lastPlayerShotAt = now;
        if (!playerBulletSeen) {
          this.lastPlayerShotX = this.player.x;
          this.lastPlayerShotZ = this.player.z;
        }
      } else if (now - this.lastPlayerShotAt > 900) {
        this.playerShootingSince = 0;
      }
    }

    alertNpcsByGunfire(now) {
      if (!this.lastPlayerShotAt || now - this.lastPlayerShotAt > 650) return;
      if (now - (this.lastShotAlertAt || 0) < 520) return;
      this.lastShotAlertAt = now;

      for (const npc of this.npcs) {
        if (!npc.alive || npc.seesPlayer) continue;
        const dx = npc.x - this.lastPlayerShotX;
        const dz = npc.z - this.lastPlayerShotZ;
        const distance = Math.hypot(dx, dz);
        const hearingRadius = NPC.visionRange * (0.55 + ((npc.personality && npc.personality.perception) || 1) * 0.28);
        if (distance > hearingRadius) continue;

        npc.lastShotX = this.lastPlayerShotX;
        npc.lastShotZ = this.lastPlayerShotZ;
        npc.lastShotMemoryAt = now;
        npc.lastKnownPlayerX = this.lastPlayerShotX;
        npc.lastKnownPlayerZ = this.lastPlayerShotZ;
        npc.searchUntil = Math.max(npc.searchUntil || 0, now + NPC.searchTime * ((npc.personality && npc.personality.searchPatience) || 1));
        npc.alertedByAllyUntil = now + NPC.searchTime * 0.55;
        npc.searchArrivedAt = 0;
        npc.searchPattern = SEARCH_PATTERNS[(npc.id + Math.floor(now / 500)) % SEARCH_PATTERNS.length];
        npc.state = 'search';
        npc.searchTargetUntil = 0;
        npc.nextVisionAt = Math.min(npc.nextVisionAt || now, now + randomRange(90, 180));
      }
    }

    updateSuppression(now) {
      const playerIsSuppressing = this.playerShootingSince && now - this.playerShootingSince > 950;
      if (!playerIsSuppressing) return;

      for (const npc of this.npcs) {
        if (!npc.alive || npc.roleKey === 'heavy') continue;
        const distance = Math.hypot(npc.x - this.lastPlayerShotX, npc.z - this.lastPlayerShotZ);
        if (distance > NPC.visionRange * 0.85) continue;
        if (Math.random() < (npc.roleKey === 'assault' ? 0.28 : 0.52)) {
          npc.suppressedUntil = now + randomRange(850, 1800);
          npc.tacticalOrder = 'hold';
          if (npc.state !== 'cover') this.assignCover(npc, now);
        }
      }
    }

    updateUncoordinatedSquad(now) {
      let index = 0;
      for (const npc of this.npcs) {
        if (!npc.alive) continue;
        if (npc.seesPlayer) {
          const preference = (npc.personality && npc.personality.flankPreference) || 1;
          const aggression = (npc.personality && npc.personality.aggression) || 1;
          npc.tacticalOrder = npc.roleKey === 'heavy' ? 'suppress'
            : npc.roleKey === 'sniper' ? 'hold'
              : Math.random() < 0.38 / aggression ? 'hold' : (preference < 0 ? 'flankLeft' : 'flankRight');
        } else if (now < (npc.searchUntil || 0)) {
          npc.searchPattern = SEARCH_PATTERNS[(npc.id + index) % SEARCH_PATTERNS.length];
          npc.tacticalOrder = 'sweep';
        }
        index += 1;
      }
    }

    updateBehavior(npc, distanceToPlayer, dt, now) {
      if (npc.seesPlayer) {
        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.lastKnownPlayerDx = this.lastPlayerMoveX;
        npc.lastKnownPlayerDz = this.lastPlayerMoveZ;
        npc.searchUntil = now + NPC.searchTime * ((npc.personality && npc.personality.searchPatience) || 1);
        npc.searchArrivedAt = 0;

        if (this.shouldSeekCover(npc, now)) {
          this.assignCover(npc, now);
        }

        this.maybeThrowGrenade(npc, distanceToPlayer, now);
        this.updateCombat(npc, distanceToPlayer, dt, now);
        return;
      }

      if (now < npc.searchUntil) {
        this.maybeThrowGrenade(npc, distanceToPlayer, now);
        if (now < (npc.suppressedUntil || 0)) {
          this.updateSuppressed(npc, dt, now);
          return;
        }
        this.updateSearch(npc, dt, now);
        return;
      }

      npc.state = 'patrol';
      this.updateWander(npc, dt, now);
    }

    canSeePlayer(npc, distanceToPlayer) {
      const visionRange = npc.visionRange || NPC.visionRange;
      if (distanceToPlayer > visionRange) return false;

      if (distanceToPlayer > AWARENESS_RADIUS) {
        const toPlayer = angleToTarget(npc.x, npc.z, this.player.x, this.player.z);
        const difference = Math.abs(this.angleDifference(toPlayer, npc.angle));
        if (difference > VISION_ANGLE / 2) return false;
      }

      if (!this.world.hasLineOfSight(npc.x, npc.z, this.player.x, this.player.z)) return false;

      return true;
    }

    updateNpcVision(npc, distanceToPlayer, now) {
      if (now < (npc.nextVisionAt || 0)) {
        return Boolean(npc.seesPlayer);
      }

      const seesPlayer = this.canSeePlayer(npc, distanceToPlayer);
      const personality = npc.personality || {};
      const baseInterval = seesPlayer ? 90 : 165;
      npc.nextVisionAt = now + baseInterval * (1.06 - Math.min(0.22, (personality.perception || 1) - 0.92)) + randomRange(0, 75);
      return seesPlayer;
    }

    markPlayerDetected(npc, now, hadVision) {
      if (!hadVision || !npc.playerSpottedAt) {
        npc.playerSpottedAt = now;
        npc.readyToFireAt = now + (npc.reactionDelay || 260) + randomRange(40, 190);
      }
      npc.lastKnownPlayerX = this.player.x;
      npc.lastKnownPlayerZ = this.player.z;
      npc.lastKnownPlayerDx = this.lastPlayerMoveX;
      npc.lastKnownPlayerDz = this.lastPlayerMoveZ;
      npc.lastShotX = this.lastPlayerShotX;
      npc.lastShotZ = this.lastPlayerShotZ;
      npc.lastShotMemoryAt = this.lastPlayerShotAt;
      npc.searchUntil = now + NPC.searchTime * ((npc.personality && npc.personality.searchPatience) || 1);
      npc.searchArrivedAt = 0;
      npc.nextVisionAt = now + 80;
      npc.patrolPauseUntil = 0;
      npc.state = npc.state === 'cover' ? npc.state : 'chase';
      npc.isPeeking = true;
      npc.coverHideUntil = 0;
      npc.nextBurstAt = Math.min(npc.nextBurstAt || now, now + randomRange(160, 420));
      if (npc.roleKey === 'sniper' && (!npc.aimReadyAt || now > npc.aimReadyAt + 1800)) {
        npc.aimReadyAt = now + randomRange(650, 1150);
      }
      npc.angle = this.turnToward(npc.angle, angleToTarget(npc.x, npc.z, this.player.x, this.player.z), 0.45);
    }

    alertNearbyNpcs(sourceNpc, now) {
      for (const npc of this.npcs) {
        if (!npc.alive || npc === sourceNpc) continue;

        const distance = Math.hypot(npc.x - sourceNpc.x, npc.z - sourceNpc.z);
        if (distance > ALERT_RADIUS) continue;

        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.lastKnownPlayerDx = this.lastPlayerMoveX;
        npc.lastKnownPlayerDz = this.lastPlayerMoveZ;
        npc.lastShotX = this.lastPlayerShotX;
        npc.lastShotZ = this.lastPlayerShotZ;
        npc.lastShotMemoryAt = this.lastPlayerShotAt;
        npc.searchUntil = Math.max(npc.searchUntil || 0, now + NPC.searchTime * 0.82);
        npc.searchArrivedAt = 0;
        npc.patrolPauseUntil = 0;
        npc.alertedByAllyUntil = now + NPC.searchTime;
        npc.nextVisionAt = Math.min(npc.nextVisionAt || now, now + 90);
        npc.searchPattern = SEARCH_PATTERNS[(npc.id + sourceNpc.id) % SEARCH_PATTERNS.length];
        if (!npc.seesPlayer) {
          npc.state = 'search';
          npc.searchTargetUntil = 0;
          this.updateSearchTarget(npc, now);
          npc.angle = this.turnToward(npc.angle, angleToTarget(npc.x, npc.z, this.player.x, this.player.z), 0.28);
        }
      }
    }

    angleDifference(a, b) {
      return Math.atan2(Math.sin(a - b), Math.cos(a - b));
    }

    turnToward(current, target, amount) {
      return current + this.angleDifference(target, current) * clamp(amount, 0, 1);
    }

    updateCoverCombat(npc, distanceToPlayer, dt, now) {
      if (Math.hypot(npc.targetX - npc.x, npc.targetZ - npc.z) > 24) {
        npc.isPeeking = false;
        npc.isMoving = this.moveTowardPoint(npc, npc.targetX, npc.targetZ, dt);
        return;
      }

      npc.isMoving = false;
      if (!npc.coverHideUntil && !npc.coverPeekUntil) {
        npc.coverHideUntil = now + randomRange(COVER_HIDE_TIME * 0.7, COVER_HIDE_TIME * 1.25);
        npc.isPeeking = false;
      }

      if (npc.coverHideUntil && now >= npc.coverHideUntil) {
        npc.coverHideUntil = 0;
        npc.coverPeekUntil = now + randomRange(COVER_PEEK_TIME * 0.75, COVER_PEEK_TIME * 1.35);
        npc.isPeeking = true;
        npc.exposedUntil = npc.coverPeekUntil;
        npc.coverSide = Math.random() < 0.45 ? -(npc.coverSide || 1) : (npc.coverSide || 1);
      }

      if (npc.coverPeekUntil && now >= npc.coverPeekUntil) {
        npc.coverPeekUntil = 0;
        npc.coverHideUntil = now + randomRange(COVER_HIDE_TIME * 0.75, COVER_HIDE_TIME * 1.4);
        npc.isPeeking = false;
      }

      if (npc.isPeeking) {
        npc.strafeDirection = npc.coverSide || npc.strafeDirection || 1;
        npc.isMoving = this.strafeAroundPlayer(npc, dt * 0.55 * ((npc.role && npc.role.strafe) || 1), now);
      }
    }

    moveAwayFromPoint(npc, targetX, targetZ, dt) {
      const awayAngle = angleToTarget(targetX, targetZ, npc.x, npc.z);
      return this.moveNpc(npc, awayAngle, dt);
    }

    strafeAroundPlayer(npc, dt, now) {
      if (now >= npc.strafeUntil) {
        npc.strafeDirection *= -1;
        npc.strafeUntil = now + randomRange(850, 1800);
      }

      const toPlayer = angleToTarget(npc.x, npc.z, this.player.x, this.player.z);
      const orderBias = npc.tacticalOrder === 'flankLeft' ? -0.42 : npc.tacticalOrder === 'flankRight' ? 0.42 : 0;
      const strafeAngle = toPlayer + npc.strafeDirection * Math.PI / 2 + orderBias + randomRange(-0.18, 0.18);
      return this.moveNpc(npc, strafeAngle, dt * 0.72);
    }

    updateCombat(npc, distanceToPlayer, dt, now) {
      const role = npc.role || NPC_ROLES.rifleman;
      const personality = npc.personality || {};
      const aggression = personality.aggression || 1;
      const caution = personality.caution || 1;
      const desiredDistance = (role.desiredDistance || NPC.stopDistance) * (1.08 - Math.min(0.24, (aggression - 0.72) * 0.28)) * (0.96 + (caution - 0.74) * 0.16);
      const minDistance = (role.minDistance || NPC.stopDistance * 0.62) * (0.94 + (caution - 0.74) * 0.18);
      const playerAngle = angleToTarget(npc.x, npc.z, this.player.x, this.player.z);
      npc.angle = this.turnToward(npc.angle, playerAngle, dt * 6);
      npc.changeDirectionIn = randomRange(NPC.turnEveryMin, NPC.turnEveryMax);

      if (now < (npc.suppressedUntil || 0) && npc.roleKey !== 'heavy') {
        this.updateSuppressed(npc, dt, now);
      } else if (npc.roleKey === 'sniper' && now >= npc.nextRepositionAt) {
        this.assignSniperPosition(npc, now);
        npc.isMoving = Math.hypot(npc.targetX - npc.x, npc.targetZ - npc.z) > 32
          ? this.moveTowardPoint(npc, npc.targetX, npc.targetZ, dt)
          : false;
      } else if (npc.state === 'cover' && now < npc.coverUntil) {
        this.updateCoverCombat(npc, distanceToPlayer, dt, now);
      } else if (distanceToPlayer > desiredDistance + 38 && npc.roleKey !== 'sniper') {
        npc.state = 'chase';
        const lead = aggression > 1.08 ? 38 : 18;
        npc.isMoving = this.moveTowardPoint(
          npc,
          this.player.x + (this.lastPlayerMoveX || 0) * lead,
          this.player.z + (this.lastPlayerMoveZ || 0) * lead,
          dt
        );
      } else if (distanceToPlayer < minDistance) {
        npc.state = 'fallback';
        npc.isMoving = this.moveAwayFromPoint(npc, this.player.x, this.player.z, dt);
      } else if (now >= npc.nextRepositionAt) {
        npc.state = 'reposition';
        this.assignReposition(npc, now);
        npc.isMoving = this.moveTowardPoint(npc, npc.targetX, npc.targetZ, dt);
      } else if (npc.tacticalOrder === 'suppress' || npc.roleKey === 'sniper') {
        npc.state = npc.tacticalOrder === 'suppress' ? 'suppress' : 'overwatch';
        npc.isMoving = npc.roleKey === 'sniper' ? false : this.strafeAroundPlayer(npc, dt * 0.35, now);
      } else {
        npc.state = 'attack';
        npc.isMoving = this.strafeAroundPlayer(npc, dt * (role.strafe || 1) * (0.86 + aggression * 0.16), now);
      }

      if (npc.isMoving) {
        npc.lastCombatActionAt = now;
      }

      const suppressedAndHiding = now < (npc.suppressedUntil || 0) && npc.roleKey !== 'heavy';
      if (npc.seesPlayer && !suppressedAndHiding) {
        this.shoot(npc, now, distanceToPlayer);
        this.recoverStalledCombat(npc, distanceToPlayer, now);
      }
    }

    updateSuppressed(npc, dt, now) {
      npc.state = 'suppressed';
      npc.isPeeking = false;
      npc.coverPeekUntil = 0;
      npc.coverHideUntil = Math.max(npc.coverHideUntil || 0, now + 420);
      npc.angle = this.turnToward(npc.angle, angleToTarget(npc.x, npc.z, this.lastPlayerShotX, this.lastPlayerShotZ), dt * 2.2);
      if (npc.state !== 'cover' && now >= (npc.nextRepositionAt || 0)) {
        this.assignCover(npc, now);
      }
      npc.isMoving = Math.hypot(npc.targetX - npc.x, npc.targetZ - npc.z) > 28
        ? this.moveTowardPoint(npc, npc.targetX, npc.targetZ, dt)
        : false;
    }

    recoverStalledCombat(npc, distanceToPlayer, now) {
      const hasRecentShot = now - (npc.lastShotAt || 0) < 2200;
      const isReloading = npc.reloadUntil && now < npc.reloadUntil;
      const canShoot = distanceToPlayer <= NPC.visionRange && npc.seesPlayer;

      if (!canShoot || isReloading || hasRecentShot) return;

      const desired = ((npc.role && npc.role.desiredDistance) || NPC.stopDistance);
      npc.state = distanceToPlayer > desired ? 'chase' : 'attack';
      npc.isPeeking = true;
      npc.coverHideUntil = 0;
      npc.coverPeekUntil = 0;
      npc.burstShotsRemaining = Math.max(1, npc.burstShotsRemaining || 0);
      npc.nextBurstAt = now;
      npc.nextShotAt = now;
      npc.lastCombatActionAt = now;
    }

    updateSearch(npc, dt, now) {
      npc.state = 'search';
      this.updateSearchTarget(npc, now);

      if (Math.hypot(npc.targetX - npc.x, npc.targetZ - npc.z) < 35) {
        if (!npc.searchArrivedAt) {
          npc.searchArrivedAt = now;
          npc.searchLookAngle = npc.angle + randomRange(-1.4, 1.4);
        }

        npc.angle = this.turnToward(npc.angle, npc.searchLookAngle, dt * 2.4);
        if (now - npc.searchArrivedAt > SEARCH_LOOK_TIME) {
          npc.searchLookAngle = npc.angle + randomRange(-Math.PI, Math.PI);
          npc.searchArrivedAt = now;
        }
        return;
      }

      npc.isMoving = this.moveTowardPoint(npc, npc.targetX, npc.targetZ, dt);
    }

    updateSearchTarget(npc, now) {
      if (npc.searchTargetUntil && now < npc.searchTargetUntil) return;

      const pattern = npc.searchPattern || SEARCH_PATTERNS[npc.id % SEARCH_PATTERNS.length];
      const baseAngle = angleToTarget(npc.x, npc.z, npc.lastKnownPlayerX, npc.lastKnownPlayerZ);
      const side = pattern === 'left' ? -1 : pattern === 'right' ? 1 : 0;
      const recentShot = npc.lastShotMemoryAt && now - npc.lastShotMemoryAt < NPC.searchTime;
      const memoryX = recentShot && pattern === 'forward' ? npc.lastShotX : npc.lastKnownPlayerX;
      const memoryZ = recentShot && pattern === 'forward' ? npc.lastShotZ : npc.lastKnownPlayerZ;
      const personality = npc.personality || {};
      const patience = personality.searchPatience || 1;
      const forward = (pattern === 'forward' ? 145 : pattern === 'cover' ? -55 : 55) * patience;
      const lateral = side * randomRange(110, 245) * (0.88 + ((personality.teamwork || 1) * 0.18));
      const forwardAngle = baseAngle;
      const lateralAngle = baseAngle + Math.PI / 2;
      const predictX = (npc.lastKnownPlayerDx || 0) * (pattern === 'forward' ? 135 : 60);
      const predictZ = (npc.lastKnownPlayerDz || 0) * (pattern === 'forward' ? 135 : 60);
      const targetX = memoryX + predictX
        + Math.sin(forwardAngle) * forward
        + Math.sin(lateralAngle) * lateral;
      const targetZ = memoryZ + predictZ
        + Math.cos(forwardAngle) * forward
        + Math.cos(lateralAngle) * lateral;

      npc.targetX = clamp(targetX, NPC.radius, window.GameConfig.WORLD.width - NPC.radius);
      npc.targetZ = clamp(targetZ, NPC.radius, window.GameConfig.WORLD.height - NPC.radius);
      if (!this.canMoveTo(npc.targetX, npc.targetZ)) {
        npc.targetX = npc.lastKnownPlayerX;
        npc.targetZ = npc.lastKnownPlayerZ;
      }
      npc.searchTargetUntil = now + randomRange(900, 1750) * patience;
    }

    updateWander(npc, dt, now) {
      if (now < npc.patrolPauseUntil) {
        const scan = Math.sin((now + npc.id * 311) * 0.0024) * 0.72;
        npc.angle = this.turnToward(npc.angle, (npc.searchLookAngle || npc.angle) + scan, dt * 1.8);
        npc.isMoving = false;
        return;
      }

      if (npc.patrolTargetUntil && now < npc.patrolTargetUntil) {
        if (this.moveTowardPoint(npc, npc.patrolTargetX, npc.patrolTargetZ, dt)) {
          npc.isMoving = true;
          return;
        }
        npc.patrolTargetUntil = 0;
      }

      npc.changeDirectionIn -= dt;
      if (npc.changeDirectionIn <= 0) {
        if (Math.random() < PATROL_PAUSE_CHANCE) {
          npc.patrolPauseUntil = now + randomRange(700, 1800);
          npc.searchLookAngle = npc.angle + randomRange(-1.6, 1.6);
        } else if (Math.random() < 0.45) {
          const routeAngle = npc.angle + randomRange(-1.2, 1.2);
          const routeDistance = randomRange(120, 320);
          npc.patrolTargetX = clamp(npc.x + Math.sin(routeAngle) * routeDistance, NPC.radius, window.GameConfig.WORLD.width - NPC.radius);
          npc.patrolTargetZ = clamp(npc.z + Math.cos(routeAngle) * routeDistance, NPC.radius, window.GameConfig.WORLD.height - NPC.radius);
          npc.patrolTargetUntil = now + randomRange(1800, 4200);
        } else {
          npc.angle = randomRange(0, Math.PI * 2);
        }
        npc.changeDirectionIn = randomRange(NPC.turnEveryMin, NPC.turnEveryMax);
      }

      npc.isMoving = this.moveNpc(npc, npc.angle, dt);
    }

    moveNpc(npc, angle, dt) {
      const beforeX = npc.x;
      const beforeZ = npc.z;
      const speed = this.getNpcMoveSpeed(npc);
      const nextX = npc.x + Math.sin(angle) * speed * dt;
      const nextZ = npc.z + Math.cos(angle) * speed * dt;
      const collision = this.world.moveCircle(npc, NPC.radius, nextX, nextZ);

      if (collision.blockedX || collision.blockedZ) {
        this.tryOpenBlockingDoor(collision, npc);
        npc.angle = randomRange(0, Math.PI * 2);
        npc.changeDirectionIn = randomRange(NPC.turnEveryMin, NPC.turnEveryMax);
      }

      return Math.hypot(npc.x - beforeX, npc.z - beforeZ) > 0.05;
    }

    moveTowardPoint(npc, targetX, targetZ, dt) {
      if (Math.hypot(targetX - npc.x, targetZ - npc.z) < 18) {
        return false;
      }

      const directAngle = angleToTarget(npc.x, npc.z, targetX, targetZ);

      for (const offset of MOVE_OFFSETS) {
        const angle = directAngle + offset;
        const speed = this.getNpcMoveSpeed(npc);
        const nextX = npc.x + Math.sin(angle) * speed * dt;
        const nextZ = npc.z + Math.cos(angle) * speed * dt;

        if (this.canMoveTo(nextX, nextZ)) {
          npc.angle = angle;
          this.world.moveCircle(npc, NPC.radius, nextX, nextZ);
          return true;
        }

        const collision = this.world.getCollisionObject(nextX, nextZ, NPC.radius, npc.y || 0);
        if (collision && collision.type === 'door') {
          this.world.openDoor(collision, npc);
        }
      }

      npc.angle = directAngle + randomRange(-1.2, 1.2);
      return false;
    }

    canMoveTo(x, z) {
      const insideWorld = x >= NPC.radius
        && x <= window.GameConfig.WORLD.width - NPC.radius
        && z >= NPC.radius
        && z <= window.GameConfig.WORLD.height - NPC.radius;

      return insideWorld
        && !this.world.collides(x, z, NPC.radius, 0)
        && !(this.world.isDangerousAt && this.world.isDangerousAt(x, z));
    }

    getNpcMoveSpeed(npc) {
      const speed = npc.speed || NPC.speed;
      if (npc.limpUntil && performance.now() < npc.limpUntil) {
        return speed * 0.58;
      }

      if (npc.cautiousUntil && performance.now() < npc.cautiousUntil) {
        return speed * 0.86;
      }

      return speed;
    }

    applyGroupSpacing(npc, dt) {
      let pushX = 0;
      let pushZ = 0;

      for (const ally of this.npcs) {
        if (!ally.alive || ally === npc) continue;
        const dx = npc.x - ally.x;
        const dz = npc.z - ally.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= 0.01 || distance > NPC.radius * 3.2) continue;
        const strength = (NPC.radius * 3.2 - distance) / (NPC.radius * 3.2);
        pushX += (dx / distance) * strength;
        pushZ += (dz / distance) * strength;
      }

      if (Math.hypot(pushX, pushZ) < 0.01) return;
      const speed = (npc.speed || NPC.speed) * 0.55 * dt;
      this.world.moveCircle(npc, NPC.radius, npc.x + pushX * speed, npc.z + pushZ * speed);
    }

    tryOpenBlockingDoor(collision, npc) {
      const object = collision.objectX || collision.objectZ;
      if (object && object.type === 'door') {
        this.world.openDoor(object, npc);
      }
    }

    openNearbyDoor(npc) {
      const door = this.world.getNearestDoor(npc.x, npc.z, npc.y || 0);
      if (door) {
        this.world.openDoor(door, npc);
      }
    }

    updateVerticalPosition(npc, dt) {
      const targetY = this.world.getGroundHeightAt(npc.x, npc.z, npc.y || 0);
      if ((npc.y || 0) > targetY + 28) {
        npc.fallStartY = Math.max(npc.fallStartY || npc.y || 0, npc.y || 0);
      }
      npc.y += (targetY - (npc.y || 0)) * (1 - Math.exp(-9 * dt));
      if (Math.abs((npc.y || 0) - targetY) < 4 && (npc.fallStartY || targetY) - targetY > 120) {
        const fallDistance = (npc.fallStartY || targetY) - targetY;
        npc.health = Math.max(0, npc.health - (fallDistance - 120) * 0.45);
        npc.hurtTime = 0.25;
        if (npc.health <= 0) {
          this.kills += 1;
          this.killNpc(npc);
        }
        npc.fallStartY = targetY;
      }
    }

    updateKnockback(npc, dt) {
      if (Math.hypot(npc.knockbackX || 0, npc.knockbackZ || 0) < 1) {
        npc.knockbackX = 0;
        npc.knockbackZ = 0;
        npc.balanceTime = Math.max(0, (npc.balanceTime || 0) - dt);
        return;
      }

      this.world.moveCircle(npc, NPC.radius, npc.x + npc.knockbackX * dt, npc.z + npc.knockbackZ * dt);
      npc.knockbackX *= Math.exp(-3.4 * dt);
      npc.knockbackZ *= Math.exp(-3.4 * dt);
      npc.balanceTime = Math.max(0, (npc.balanceTime || 0) - dt);
    }

    shouldSeekCover(npc, now) {
      if (npc.state === 'cover' && now < npc.coverUntil) return false;
      if (npc.health <= NPC.coverHealthThreshold) return true;
      const role = npc.role || NPC_ROLES.rifleman;
      const cautiousBonus = now < (npc.cautiousUntil || 0) ? 0.18 : 0;
      return now >= npc.nextRepositionAt && Math.random() < clamp((role.coverChance || 0.55) + cautiousBonus, 0, 0.92);
    }

    assignCover(npc, now) {
      const cover = this.findCoverPoint(npc);

      if (cover) {
        npc.state = 'cover';
        npc.targetX = cover.x;
        npc.targetZ = cover.z;
        npc.coverUntil = now + randomRange(NPC.coverTimeMin, NPC.coverTimeMax);
        npc.coverHideUntil = now + randomRange(450, 900);
        npc.coverPeekUntil = 0;
        npc.isPeeking = false;
        npc.nextRepositionAt = now + randomRange(NPC.repositionMin, NPC.repositionMax);
      } else {
        this.assignReposition(npc, now);
      }
    }

    assignReposition(npc, now) {
      const role = npc.role || NPC_ROLES.rifleman;
      const flank = npc.tacticalOrder === 'flankLeft' ? -0.95 : npc.tacticalOrder === 'flankRight' ? 0.95 : 0;
      const personality = npc.personality || {};
      const personalFlank = (personality.flankPreference || 1) * 0.28;
      const baseAngle = angleToTarget(this.player.x, this.player.z, npc.x, npc.z) + flank + personalFlank;
      const desired = role.desiredDistance || NPC.stopDistance;
      let best = null;
      let bestScore = Infinity;

      for (let i = 0; i < 5; i += 1) {
        const angle = baseAngle + randomRange(-0.9, 0.9);
        const distance = randomRange(desired * 0.78, desired * (1.18 + ((personality.aggression || 1) < 0.9 ? 0.22 : 0)));
        const targetX = clamp(this.player.x + Math.sin(angle) * distance, NPC.radius, window.GameConfig.WORLD.width - NPC.radius);
        const targetZ = clamp(this.player.z + Math.cos(angle) * distance, NPC.radius, window.GameConfig.WORLD.height - NPC.radius);
        if (!this.canMoveTo(targetX, targetZ)) continue;

        const crowdPenalty = this.getCrowdPenalty(targetX, targetZ, npc);
        const travel = Math.hypot(targetX - npc.x, targetZ - npc.z);
        const distanceToPlayer = Math.hypot(targetX - this.player.x, targetZ - this.player.z);
        const score = travel * 0.42 + Math.abs(distanceToPlayer - desired) * 0.58 + crowdPenalty;
        if (score < bestScore) {
          best = { x: targetX, z: targetZ };
          bestScore = score;
        }
      }

      if (best) {
        npc.targetX = best.x;
        npc.targetZ = best.z;
      }

      npc.nextRepositionAt = now + randomRange(role.repositionMin || NPC.repositionMin, role.repositionMax || NPC.repositionMax) * (1.18 - Math.min(0.42, (personality.aggression || 1) * 0.28));
      if (npc.roleKey === 'assault' && Math.random() < 0.35 * ((personality.aggression || 1))) {
        npc.dodgeUntil = now + 420;
      }
    }

    getCrowdPenalty(x, z, self) {
      let penalty = 0;
      for (const ally of this.npcs) {
        if (!ally.alive || ally === self) continue;
        const allyX = ally.targetX !== undefined ? ally.targetX : ally.x;
        const allyZ = ally.targetZ !== undefined ? ally.targetZ : ally.z;
        const distance = Math.hypot(allyX - x, allyZ - z);
        if (distance > COMBAT_SLOT_RADIUS) continue;
        penalty += (COMBAT_SLOT_RADIUS - distance) * 3.2;
      }
      return penalty;
    }

    assignSniperPosition(npc, now) {
      let best = null;
      let bestScore = Infinity;

      const candidates = this.getNearbyTacticalObjects(npc, now, COVER_SCAN_RADIUS * 1.2);
      for (const object of candidates) {
        if (!object || object.destroyed || object.solid === false) continue;
        const center = this.getObjectCenter(object);
        const awayX = center.x - this.player.x;
        const awayZ = center.z - this.player.z;
        const awayLength = Math.hypot(awayX, awayZ) || 1;
        const distanceBehind = this.getObjectCoverRadius(object) + NPC.radius + 38;
        const candidateX = center.x + (awayX / awayLength) * distanceBehind;
        const candidateZ = center.z + (awayZ / awayLength) * distanceBehind;
        const playerDistance = Math.hypot(candidateX - this.player.x, candidateZ - this.player.z);
        if (playerDistance < 360 || playerDistance > NPC.visionRange * 1.18) continue;

        const height = this.world.getGroundHeightAt(candidateX, candidateZ, 0);
        const npcDistance = Math.hypot(candidateX - npc.x, candidateZ - npc.z);
        const lineClear = this.world.hasLineOfSight(candidateX, candidateZ, this.player.x, this.player.z);
        const score = npcDistance - height * 1.8 + Math.abs(playerDistance - 520) * 0.35 + (lineClear ? -90 : 80);
        if (score < bestScore && this.canMoveTo(candidateX, candidateZ)) {
          best = { x: candidateX, z: candidateZ };
          bestScore = score;
        }
      }

      if (best) {
        npc.targetX = best.x;
        npc.targetZ = best.z;
        npc.nextRepositionAt = now + randomRange(7600, 12400);
        return;
      }

      this.assignCover(npc, now);
    }

    findCoverPoint(npc) {
      let best = null;
      let bestScore = Infinity;

      const candidates = this.getNearbyTacticalObjects(npc, performance.now(), COVER_SCAN_RADIUS);
      for (const object of candidates) {
        if (object.destroyed || object.solid === false) continue;

        const center = this.getObjectCenter(object);
        const awayX = center.x - this.player.x;
        const awayZ = center.z - this.player.z;
        const awayLength = Math.hypot(awayX, awayZ) || 1;
        const distanceBehind = this.getObjectCoverRadius(object) + NPC.radius + 26;
        const candidate = {
          x: center.x + (awayX / awayLength) * distanceBehind,
          z: center.z + (awayZ / awayLength) * distanceBehind
        };

        if (!this.canMoveTo(candidate.x, candidate.z)) continue;
        if (!this.world.hasLineOfSight(this.player.x, this.player.z, candidate.x, candidate.z)) {
          const npcDistance = Math.hypot(candidate.x - npc.x, candidate.z - npc.z);
          const playerDistance = Math.hypot(candidate.x - this.player.x, candidate.z - this.player.z);
          const desired = ((npc.role && npc.role.desiredDistance) || NPC.stopDistance);
          const score = npcDistance + Math.abs(playerDistance - desired) * 0.45;

          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }

      return best;
    }

    getNearbyTacticalObjects(npc, now, radius) {
      if (npc.coverCandidates && now - (npc.coverCacheAt || 0) < COVER_CACHE_INTERVAL) {
        return npc.coverCandidates;
      }

      const candidates = [];
      const queryId = now + npc.id * 0.001;
      const addObjects = (objects) => {
        for (const object of objects) {
          if (!object || object._npcTacticalQueryId === queryId) continue;
          object._npcTacticalQueryId = queryId;
          candidates.push(object);
        }
      };

      if (this.world.getSpatialCandidates) {
        addObjects(this.world.getSpatialCandidates(npc.x, npc.z, radius));
        addObjects(this.world.getSpatialCandidates(this.player.x, this.player.z, radius * 0.72));
      } else {
        addObjects(this.world.objects || []);
      }

      npc.coverCandidates = candidates;
      npc.coverCacheAt = now;
      return candidates;
    }

    getObjectCenter(object) {
      if (object.shape === 'rect') {
        return { x: object.x + object.w / 2, z: object.y + object.h / 2 };
      }

      return { x: object.x, z: object.y };
    }

    getObjectCoverRadius(object) {
      if (object.shape === 'rect') {
        return Math.hypot(object.w, object.h) / 2;
      }

      return object.r;
    }

    shoot(npc, now, distanceToPlayer) {
      if (now < npc.nextShotAt) return;
      if (now < (npc.readyToFireAt || 0)) {
        npc.lastCombatActionAt = now;
        return;
      }
      if (npc.reloadUntil && now < npc.reloadUntil) return;
      if (npc.roleKey === 'sniper' && now < (npc.aimReadyAt || 0)) {
        npc.isShooting = false;
        npc.lastCombatActionAt = now;
        return;
      }
      if (this.hasFriendlyFireRisk(npc)) {
        npc.nextShotAt = now + randomRange(90, 180);
        npc.lastCombatActionAt = now;
        return;
      }

      if (npc.reloadUntil && now >= npc.reloadUntil) {
        npc.reloadUntil = 0;
        npc.ammo = npc.magazineSize || MAGAZINE_SIZE;
        npc.burstShotsRemaining = 0;
        npc.nextBurstAt = now;
        npc.nextShotAt = now;
      }

      if (npc.ammo <= 0) {
        npc.reloadUntil = now + (npc.reloadTime || RELOAD_TIME) + randomRange(-180, 260);
        npc.burstShotsRemaining = 0;
        npc.nextShotAt = npc.reloadUntil;
        npc.lastCombatActionAt = now;
        return;
      }

      if (npc.burstShotsRemaining <= 0) {
        if (now < npc.nextBurstAt) {
          if (now - (npc.lastShotAt || 0) > 1800) {
            npc.nextBurstAt = now;
          } else {
            return;
          }
        }
        const role = npc.role || NPC_ROLES.rifleman;
        const discipline = (npc.personality && npc.personality.burstDiscipline) || 1;
        const burstMin = Math.max(1, Math.round((role.burstMin || BURST_MIN) * discipline));
        const burstMax = Math.max(burstMin, Math.round((role.burstMax || BURST_MAX) * discipline));
        npc.burstShotsRemaining = Math.floor(randomRange(burstMin, burstMax + 1));
        npc.readyToFireAt = now + randomRange(35, 130) + (npc.isMoving ? randomRange(70, 160) : 0);
        if (now < npc.readyToFireAt) return;
      }

      const origin = this.tempShotOrigin.set(npc.x, (npc.y || 0) + NPC.height * 0.62, npc.z);
      const direction = this.tempShotDirection
        .copy(this.tempShotTarget.set(this.player.x, this.player.y + this.player.getEyeHeight(), this.player.z))
        .sub(origin)
        .normalize();
      const visionRange = npc.visionRange || NPC.visionRange;
      const playerSpeedFactor = clamp(Math.hypot(this.lastPlayerMoveX || 0, this.lastPlayerMoveZ || 0), 0, 1);
      const personality = npc.personality || {};
      const accuracyBias = npc.accuracyBias || 1;
      const distanceSpread = clamp((distanceToPlayer || 0) / visionRange, 0, 1) * 0.085;
      const movementSpread = npc.isMoving ? 0.022 : 0;
      const playerMovementSpread = playerSpeedFactor * (distanceToPlayer > 180 ? 0.018 : 0.009);
      const aimWaver = ((personality.aimWaver || 1) - 0.75) * 0.022;
      const mistakeChance = clamp((npc.roleKey === 'sniper' ? 0.08 : 0.18) + (1.08 - accuracyBias) * 0.24, 0.04, 0.34);
      const mistakeSpread = Math.random() < mistakeChance ? randomRange(0.028, 0.095) : 0;
      const armInjurySpread = npc.armInjuryUntil && now < npc.armInjuryUntil ? 0.06 : 0;
      const suppressSpread = npc.tacticalOrder === 'suppress' ? 0.022 : 0;
      const cautiousSpread = now < (npc.cautiousUntil || 0) ? -0.012 : 0;
      const suppressedSpread = now < (npc.suppressedUntil || 0) ? 0.045 : 0;
      const exposedSpread = now < (npc.exposedUntil || 0) ? 0.018 : 0;
      const spread = Math.max(0.006, (npc.bulletSpread || NPC.bulletSpread)
        + distanceSpread
        + movementSpread
        + playerMovementSpread
        + aimWaver
        + mistakeSpread
        + armInjurySpread
        + cautiousSpread
        + suppressedSpread
        + exposedSpread);

      this.weapons.spawnNpcBullet(origin, applyYawSpreadTo(this.tempSpreadDirection, direction, spread + suppressSpread));
      npc.isShooting = true;
      npc.aimKick = 1;
      npc.ammo -= 1;
      npc.lastShotAt = now;
      npc.lastCombatActionAt = now;
      npc.burstShotsRemaining -= 1;
      const role = npc.role || NPC_ROLES.rifleman;
      npc.nextShotAt = now + (role.shotDelay || BURST_SHOT_DELAY) + randomRange(-35, 60);

      if (npc.burstShotsRemaining <= 0) {
        npc.nextBurstAt = now + randomRange(role.burstPauseMin || 650, role.burstPauseMax || 1450);
        if (npc.roleKey === 'sniper') {
          npc.aimReadyAt = now + randomRange(900, 1800);
        }
      }

      if (npc.ammo <= 0) {
        npc.reloadUntil = npc.nextShotAt + (npc.reloadTime || RELOAD_TIME);
        npc.burstShotsRemaining = 0;
        npc.nextShotAt = npc.reloadUntil;
      }
    }

    hasFriendlyFireRisk(npc) {
      const lineX = this.player.x - npc.x;
      const lineZ = this.player.z - npc.z;
      const lineLengthSq = lineX * lineX + lineZ * lineZ;
      if (lineLengthSq <= 1) return false;
      const maxRiskDistanceSq = Math.min(lineLengthSq, NPC.visionRange * NPC.visionRange);

      for (const ally of this.npcs) {
        if (!ally.alive || ally === npc) continue;
        const allyX = ally.x - npc.x;
        const allyZ = ally.z - npc.z;
        if (allyX * allyX + allyZ * allyZ > maxRiskDistanceSq) continue;
        const t = (allyX * lineX + allyZ * lineZ) / lineLengthSq;
        if (t <= 0.08 || t >= 0.92) continue;
        const closestX = npc.x + lineX * t;
        const closestZ = npc.z + lineZ * t;
        if (Math.hypot(ally.x - closestX, ally.z - closestZ) < NPC.radius * 1.7) {
          return true;
        }
      }

      return false;
    }

    maybeThrowGrenade(npc, distanceToPlayer, now) {
      const role = npc.role || NPC_ROLES.rifleman;
      if (!role.grenadeChance || now < (npc.grenadeCooldownUntil || 0)) return;
      if (distanceToPlayer < 145 || distanceToPlayer > 560) return;
      if (now - this.playerStillSince < 2300) return;
      if (Math.random() > role.grenadeChance) {
        npc.grenadeCooldownUntil = now + randomRange(900, 1700);
        return;
      }

      const playerVisible = this.world.hasLineOfSight(npc.x, npc.z, this.player.x, this.player.z);
      const playerBehindCover = !playerVisible || npc.state === 'cover' || npc.state === 'search';
      if (!playerBehindCover) return;

      this.throwGrenade(npc, this.player.x + randomRange(-34, 34), this.player.z + randomRange(-34, 34), now);
      npc.grenadeCooldownUntil = now + randomRange(7800, 13500);
      npc.commandGestureUntil = now + 420;
      npc.lastCombatActionAt = now;
      npc.nextRepositionAt = now;
      this.assignReposition(npc, now);
    }

    throwGrenade(npc, targetX, targetZ, now) {
      if (this.grenadePool.length === 0) return false;
      const grenade = this.grenadePool.pop();
      grenade.active = true;
      grenade.ownerId = npc.id;
      grenade.elapsed = 0;
      grenade.fuse = GRENADE_FUSE;
      grenade.startX = npc.x;
      grenade.startY = (npc.y || 0) + 52;
      grenade.startZ = npc.z;
      grenade.targetX = clamp(targetX, NPC.radius, window.GameConfig.WORLD.width - NPC.radius);
      grenade.targetZ = clamp(targetZ, NPC.radius, window.GameConfig.WORLD.height - NPC.radius);
      grenade.x = grenade.startX;
      grenade.y = grenade.startY;
      grenade.z = grenade.startZ;
      grenade.mesh.position.set(grenade.x, grenade.y, grenade.z);
      grenade.mesh.visible = true;
      this.grenades.push(grenade);
      return true;
    }

    updateGrenades(dt, now) {
      for (let i = this.grenades.length - 1; i >= 0; i -= 1) {
        const grenade = this.grenades[i];
        grenade.elapsed += dt;
        const t = clamp(grenade.elapsed / grenade.fuse, 0, 1);
        const smooth = t * t * (3 - 2 * t);
        grenade.x = grenade.startX + (grenade.targetX - grenade.startX) * smooth;
        grenade.z = grenade.startZ + (grenade.targetZ - grenade.startZ) * smooth;
        const groundY = this.world.getGroundHeightAt(grenade.x, grenade.z, grenade.y);
        grenade.y = groundY + Math.sin(t * Math.PI) * 120 + 7;
        grenade.mesh.position.set(grenade.x, grenade.y, grenade.z);
        grenade.mesh.rotation.x += dt * 8;
        grenade.mesh.rotation.z += dt * 6;

        if (grenade.elapsed < grenade.fuse) continue;
        this.explodeGrenade(grenade, now);
        this.releaseGrenade(grenade);
        this.grenades.splice(i, 1);
      }
    }

    explodeGrenade(grenade, now) {
      const radius = 150;
      const damage = 48;
      if (this.world.addFire) {
        this.world.addFire(grenade.x, grenade.z, 92, 3.2);
      }
      if (this.world.applyExplosionImpulse) {
        this.world.applyExplosionImpulse(grenade.x, grenade.z, 230, 320);
      }
      this.applyExplosionDamage(grenade.x, grenade.z, radius, damage);

      const playerDistance = Math.hypot(this.player.x - grenade.x, this.player.z - grenade.z);
      if (playerDistance < radius && this.player.markHit) {
        this.player.markHit(damage * (1 - playerDistance / radius));
      }

      for (const npc of this.npcs) {
        if (!npc.alive || npc.id === grenade.ownerId) continue;
        if (Math.hypot(npc.x - grenade.x, npc.z - grenade.z) < radius * 1.45) {
          npc.cautiousUntil = now + randomRange(1800, 3600);
          this.assignCover(npc, now);
        }
      }
    }

    releaseGrenade(grenade) {
      grenade.active = false;
      grenade.mesh.visible = false;
      this.grenadePool.push(grenade);
    }

    hitNpcWithBullet(x, z, y, radius, damage) {
      for (const npc of this.npcs) {
        if (!npc.alive) continue;

        const distance = Math.hypot(x - npc.x, z - npc.z);
        if (distance > radius + 32) continue;
        if (y < (npc.y || 0) - radius || y > (npc.y || 0) + NPC.height + radius + 8) continue;

        const hitbox = this.getNpcBodyPartHit(npc, x, z, y, radius);
        if (!hitbox) continue;

        const now = performance.now();
        const dealt = damage * hitbox.multiplier;
        const instantHeadshot = hitbox.part === 'head' && Math.random() < 0.32 && npc.health <= npc.maxHealth * 0.9;
        npc.health = instantHeadshot ? 0 : Math.max(0, npc.health - dealt);
        this.applyBodyPartReaction(npc, hitbox, x, z, now);
        npc.seesPlayer = true;
        npc.angle = angleToTarget(npc.x, npc.z, this.player.x, this.player.z);
        npc.state = 'search';
        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.lastKnownPlayerDx = this.lastPlayerMoveX;
        npc.lastKnownPlayerDz = this.lastPlayerMoveZ;
        npc.lastShotX = this.player.x;
        npc.lastShotZ = this.player.z;
        npc.lastShotMemoryAt = now;
        this.lastPlayerShotX = this.player.x;
        this.lastPlayerShotZ = this.player.z;
        this.lastPlayerShotAt = now;
        npc.searchUntil = now + NPC.searchTime;
        npc.nextVisionAt = 0;

        const killed = npc.health <= 0;
        if (npc.health <= 0) {
          this.kills += 1;
          this.killNpc(npc);
        }

        this.syncMesh(npc);
        return {
          hit: true,
          killed,
          damage: dealt,
          baseDamage: damage,
          part: hitbox.part,
          partLabel: hitbox.label,
          headshot: hitbox.part === 'head',
          instantHeadshot,
          npc
        };
      }

      return null;
    }

    getNpcBodyPartHit(npc, worldX, worldZ, worldY, radius) {
      const dx = worldX - npc.x;
      const dz = worldZ - npc.z;
      const cos = Math.cos(npc.angle || 0);
      const sin = Math.sin(npc.angle || 0);
      const localX = cos * dx - sin * dz;
      const localZ = sin * dx + cos * dz;
      const localY = worldY - (npc.y || 0);

      for (const hitbox of HITBOXES) {
        if (hitbox.kind === 'sphere') {
          const sx = localX - hitbox.x;
          const sy = localY - hitbox.y;
          const sz = localZ - hitbox.z;
          const totalRadius = hitbox.radius + radius;
          if (sx * sx + sy * sy + sz * sz <= totalRadius * totalRadius) {
            return hitbox;
          }
          continue;
        }

        if (Math.abs(localX - hitbox.x) <= hitbox.hx + radius
          && Math.abs(localY - hitbox.y) <= hitbox.hy + radius
          && Math.abs(localZ - hitbox.z) <= hitbox.hz + radius) {
          return hitbox;
        }
      }

      return null;
    }

    applyBodyPartReaction(npc, hitbox, hitX, hitZ, now) {
      const part = hitbox.part;
      const isHead = part === 'head';
      const isArm = part === 'leftArm' || part === 'rightArm';
      const isLeg = part === 'leftLeg' || part === 'rightLeg';

      npc.hitFlash = isHead ? 0.22 : 0.16;
      npc.hurtTime = isHead ? 0.38 : isArm ? 0.28 : isLeg ? 0.32 : 0.24;
      npc.hurtPart = part;
      npc.hurtStrength = isHead ? 1.65 : isLeg ? 0.85 : isArm ? 0.78 : 1;
      npc.hurtPoseSign = Math.random() < 0.5 ? -1 : 1;
      npc.hurtAngle = Math.atan2(npc.x - hitX, npc.z - hitZ) * (isHead ? 0.18 : 0.12);

      if (isHead) {
        npc.balanceTime = Math.max(npc.balanceTime || 0, 0.85);
      } else if (isLeg) {
        npc.limpUntil = Math.max(npc.limpUntil || 0, now + LEG_INJURY_TIME);
        npc.limpSide = part;
      } else if (isArm) {
        npc.armInjuryUntil = Math.max(npc.armInjuryUntil || 0, now + ARM_INJURY_TIME);
        npc.armInjurySide = part;
      }
    }

    applyExplosionDamage(x, z, radius, damage) {
      for (const npc of this.npcs) {
        if (!npc.alive) continue;

        const distance = Math.hypot(npc.x - x, npc.z - z);
        if (distance > radius) continue;

        const dealt = damage * (1 - distance / radius);
        npc.health = Math.max(0, npc.health - dealt);
        npc.hitFlash = 0.2;
        npc.hurtTime = 0.26;
        const power = 1 - distance / radius;
        const length = Math.hypot(npc.x - x, npc.z - z) || 1;
        npc.knockbackX = (npc.knockbackX || 0) + ((npc.x - x) / length) * 180 * power;
        npc.knockbackZ = (npc.knockbackZ || 0) + ((npc.z - z) / length) * 180 * power;
        if (power > 0.55) npc.balanceTime = 1.2;
        npc.state = 'search';
        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.searchUntil = performance.now() + NPC.searchTime;
        npc.nextVisionAt = 0;

        if (npc.health <= 0) {
          this.kills += 1;
          this.killNpc(npc);
        } else {
          this.syncMesh(npc);
        }
      }
    }

    killNpc(npc) {
      npc.alive = false;
      npc.isMoving = false;
      npc.seesPlayer = false;
      npc.deadAt = performance.now();
      npc.respawnAt = npc.deadAt + NPC.respawnDelay;
      npc.group.visible = false;
      this.reactToAllyDeath(npc, npc.deadAt);
      if (this.world && this.world.createRagdollFromNpc) {
        this.world.createRagdollFromNpc(npc);
      }
      this.audio.playNpcDeath();
      if (this.lootSystem) {
        this.lootSystem.spawnFromNpc(npc);
      }
      if (this.baseSystem) {
        this.baseSystem.handleNpcKilled(npc);
      }
    }

    reactToAllyDeath(deadNpc, now) {
      if (deadNpc.roleKey === 'commander') {
        this.squadDisruptedUntil = now + 5200;
      }

      for (const npc of this.npcs) {
        if (!npc.alive || npc === deadNpc) continue;
        const distance = Math.hypot(npc.x - deadNpc.x, npc.z - deadNpc.z);
        if (distance > 520) continue;

        npc.cautiousUntil = now + randomRange(2200, 5200);
        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.searchUntil = Math.max(npc.searchUntil || 0, now + NPC.searchTime);
        npc.alertedByAllyUntil = now + NPC.searchTime;
        npc.searchPattern = SEARCH_PATTERNS[(npc.id + deadNpc.id) % SEARCH_PATTERNS.length];
        if (deadNpc.roleKey === 'commander') {
          npc.tacticalOrder = Math.random() < 0.5 ? 'hold' : 'sweep';
          npc.suppressedUntil = Math.max(npc.suppressedUntil || 0, now + randomRange(650, 1500));
        }

        if (distance < 190 && Math.random() < 0.55) {
          npc.state = 'fallback';
          npc.targetX = deadNpc.x;
          npc.targetZ = deadNpc.z;
          npc.nextRepositionAt = now;
        } else if (Math.random() < 0.5) {
          this.assignCover(npc, now);
        }
      }
    }

    updateDeathAnimation(npc, now) {
      if (!npc.group.visible) return;
      const progress = clamp((now - npc.deadAt) / 650, 0, 1);
      npc.group.visible = true;
      npc.group.rotation.z = progress * Math.PI / 2;
      npc.group.rotation.x = -progress * 0.35;
      npc.group.position.y = (npc.y || 0) - progress * 9;
      npc.group.position.x = npc.x + Math.sin(npc.angle) * progress * 18;
      npc.group.position.z = npc.z + Math.cos(npc.angle) * progress * 18;
    }

    setNpcLowDetail(npc, enabled) {
      if (npc.lowDetail === enabled) return;
      npc.lowDetail = enabled;

      npc.group.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = !enabled;
        if (child === npc.group.userData.healthBack || child === npc.group.userData.healthFill) {
          child.visible = !enabled;
        }
      });
    }

    resetRenderState(npc) {
      npc.renderX = npc.x;
      npc.renderY = npc.y || 0;
      npc.renderZ = npc.z;
      npc.renderAngle = npc.angle || 0;
    }

    hasPendingRenderMovement(npc) {
      return Math.hypot((npc.x || 0) - (npc.renderX || 0), (npc.z || 0) - (npc.renderZ || 0)) > 1.5
        || Math.abs(this.angleDifference(npc.angle || 0, npc.renderAngle || 0)) > 0.025;
    }

    updateRenderState(npc, dt, immediate, positionSpeed, rotationSpeed) {
      if (immediate || dt <= 0 || npc.renderX === undefined) {
        this.resetRenderState(npc);
        return;
      }

      const positionEase = 1 - Math.exp(-(positionSpeed || 9) * dt);
      const rotationEase = 1 - Math.exp(-(rotationSpeed || 10) * dt);
      npc.renderX += ((npc.x || 0) - npc.renderX) * positionEase;
      npc.renderY += ((npc.y || 0) - npc.renderY) * positionEase;
      npc.renderZ += ((npc.z || 0) - npc.renderZ) * positionEase;
      npc.renderAngle += this.angleDifference(npc.angle || 0, npc.renderAngle || 0) * rotationEase;
    }

    applyRenderTransform(npc) {
      npc.group.position.set(npc.renderX || npc.x, npc.renderY || npc.y || 0, npc.renderZ || npc.z);
      npc.group.rotation.y = npc.renderAngle || npc.angle;
      npc.group.rotation.x = 0;
      npc.group.rotation.z = 0;
    }

    syncDistantMesh(npc, dt) {
      this.updateRenderState(npc, dt, false, 4.6, 5.4);
      this.applyRenderTransform(npc);
    }

    syncMesh(npc, dt, immediate) {
      this.updateRenderState(npc, dt || 0, Boolean(immediate), 13, 15);
      npc.group.position.set(npc.renderX || npc.x, npc.renderY || npc.y || 0, npc.renderZ || npc.z);
      npc.group.rotation.y = npc.renderAngle || npc.angle;
      const hurtDuration = npc.hurtPart === 'head' ? 0.38 : npc.hurtPart === 'leftLeg' || npc.hurtPart === 'rightLeg' ? 0.32 : npc.hurtPart === 'leftArm' || npc.hurtPart === 'rightArm' ? 0.28 : 0.24;
      npc.group.rotation.x = npc.hurtTime > 0 ? Math.sin(clamp(npc.hurtTime / hurtDuration, 0, 1) * Math.PI) * npc.hurtAngle : 0;
      npc.group.rotation.z = 0;

      const bodyColor = npc.hitFlash > 0 ? 0xffffff : (npc.seesPlayer ? NPC.alertColor : ((npc.role && npc.role.color) || NPC.color));
      const headColor = npc.hitFlash > 0 ? 0xffffff : 0xd8a27d;
      npc.group.userData.bodyMaterial.color.setHex(bodyColor);
      npc.group.userData.headMaterial.color.setHex(headColor);

      this.updateLookPose(npc);
      this.animateBody(npc);
      this.updateHealthBar(npc);
    }

    updateLookPose(npc) {
      let lookAngle = npc.angle;
      if (npc.seesPlayer || npc.state === 'attack' || npc.state === 'cover' || npc.state === 'chase') {
        lookAngle = angleToTarget(npc.x, npc.z, this.player.x, this.player.z);
      } else if (npc.state === 'search') {
        lookAngle = npc.searchLookAngle || npc.angle;
      } else if (npc.tacticalOrder === 'hold') {
        lookAngle = npc.angle + Math.sin(npc.walkTime * 0.55) * 0.45;
      } else if (npc.patrolPauseUntil) {
        lookAngle = npc.searchLookAngle || npc.angle;
      }

      const localYaw = clamp(this.angleDifference(lookAngle, npc.angle), -0.82, 0.82);
      npc.headYaw += (localYaw - (npc.headYaw || 0)) * 0.24;
      npc.torsoYaw += (localYaw * 0.45 - (npc.torsoYaw || 0)) * 0.18;
    }

    animateBody(npc) {
      const phase = npc.walkTime;
      const swing = npc.isMoving ? Math.sin(phase) * 0.58 : Math.sin(phase) * 0.08;
      const idle = npc.isMoving ? Math.abs(Math.sin(phase)) * 2.2 : Math.sin(phase * 0.8) * 0.7;
      const parts = npc.group.userData;
      const hurtDuration = npc.hurtPart === 'head' ? 0.38 : npc.hurtPart === 'leftLeg' || npc.hurtPart === 'rightLeg' ? 0.32 : npc.hurtPart === 'leftArm' || npc.hurtPart === 'rightArm' ? 0.28 : 0.24;
      const hurt = npc.hurtTime > 0 ? Math.sin(clamp(npc.hurtTime / hurtDuration, 0, 1) * Math.PI) * (npc.hurtStrength || 1) : 0;
      const balance = npc.balanceTime > 0 ? Math.sin(npc.balanceTime * 18) * 0.24 : 0;
      const limping = npc.limpUntil && performance.now() < npc.limpUntil;
      const now = performance.now();
      const gesturing = npc.commandGestureUntil && now < npc.commandGestureUntil;
      const dodging = npc.dodgeUntil && now < npc.dodgeUntil;

      parts.torso.position.y = 42 + idle;
      parts.torso.rotation.x = -hurt * 0.22;
      parts.torso.rotation.y = npc.torsoYaw || 0;
      parts.torso.rotation.z = balance;
      parts.head.position.y = 76 + idle + hurt * 2.5;
      parts.head.rotation.x = hurt * 0.18;
      parts.head.rotation.y = npc.headYaw || 0;
      parts.neck.position.y = 63 + idle;
      parts.visor.position.y = 78 + idle;
      parts.visor.rotation.x = hurt * 0.18;
      parts.visor.rotation.y = npc.headYaw || 0;

      parts.leftLeg.rotation.x = swing;
      parts.rightLeg.rotation.x = -swing;
      parts.leftLeg.position.y = 13 + Math.max(0, -swing) * 2;
      parts.rightLeg.position.y = 13 + Math.max(0, swing) * 2;

      if (limping && npc.isMoving) {
        const injuredLeft = npc.limpSide === 'leftLeg';
        parts.leftLeg.rotation.x *= injuredLeft ? 0.36 : 0.82;
        parts.rightLeg.rotation.x *= injuredLeft ? 0.82 : 0.36;
        parts.torso.rotation.z += Math.sin(phase * 0.5) * 0.08;
      }

      if (npc.seesPlayer) {
        const recoil = (npc.aimKick || 0) * 0.32;
        parts.leftArm.rotation.x = -0.72 - recoil;
        parts.rightArm.rotation.x = -0.72 - recoil;
        parts.leftArm.rotation.z = 0.38;
        parts.rightArm.rotation.z = -0.38;
        parts.weapon.visible = true;
        parts.barrel.visible = true;
      } else if (npc.state === 'search') {
        const scan = Math.sin(phase * 0.72) * 0.18;
        parts.leftArm.rotation.x = -0.18 + scan;
        parts.rightArm.rotation.x = 0.18 - scan;
        parts.leftArm.rotation.z = 0.34;
        parts.rightArm.rotation.z = -0.34;
        parts.weapon.visible = true;
        parts.barrel.visible = true;
      } else {
        parts.leftArm.rotation.x = -swing * 0.45;
        parts.rightArm.rotation.x = swing * 0.45;
        parts.leftArm.rotation.z = 0.22;
        parts.rightArm.rotation.z = -0.22;
        parts.weapon.visible = true;
        parts.barrel.visible = true;
      }

      parts.leftArm.position.y = 43 + idle;
      parts.rightArm.position.y = 43 + idle;
      parts.leftArm.rotation.y = hurt * 0.28;
      parts.rightArm.rotation.y = -hurt * 0.28;

      if (gesturing) {
        const wave = Math.sin((npc.commandGestureUntil - now) * 0.028) * 0.28;
        parts.leftArm.rotation.x = -1.25 + wave;
        parts.leftArm.rotation.z = 0.95;
        parts.head.rotation.y += 0.18;
      }

      if (dodging) {
        const dodge = Math.sin(clamp((npc.dodgeUntil - now) / 420, 0, 1) * Math.PI);
        parts.torso.rotation.z += dodge * npc.strafeDirection * 0.28;
        parts.leftLeg.rotation.x += dodge * 0.5;
        parts.rightLeg.rotation.x -= dodge * 0.5;
      }

      if (npc.hurtTime > 0) {
        this.applyHurtPose(npc, parts, hurt);
      }

      parts.weapon.position.y = 43 + idle;
      parts.weapon.position.z = 18 - (npc.aimKick || 0) * 4;
      parts.weapon.rotation.x = -(npc.aimKick || 0) * 0.12;
      parts.barrel.position.y = 43 + idle;
      parts.barrel.position.z = 34 - (npc.aimKick || 0) * 5;
    }

    applyHurtPose(npc, parts, hurt) {
      if (npc.hurtPart === 'head') {
        parts.head.rotation.x += hurt * 0.28;
        parts.head.rotation.z = hurt * (npc.hurtPoseSign || 1) * 0.16;
        parts.torso.rotation.x -= hurt * 0.18;
        return;
      }

      if (npc.hurtPart === 'leftArm') {
        parts.leftArm.rotation.x += hurt * 0.72;
        parts.leftArm.rotation.z += hurt * 0.32;
        parts.torso.rotation.z -= hurt * 0.08;
        return;
      }

      if (npc.hurtPart === 'rightArm') {
        parts.rightArm.rotation.x += hurt * 0.72;
        parts.rightArm.rotation.z -= hurt * 0.32;
        parts.torso.rotation.z += hurt * 0.08;
        return;
      }

      if (npc.hurtPart === 'leftLeg') {
        parts.leftLeg.rotation.x -= hurt * 0.52;
        parts.leftLeg.position.y -= hurt * 1.8;
        parts.torso.rotation.z -= hurt * 0.1;
        return;
      }

      if (npc.hurtPart === 'rightLeg') {
        parts.rightLeg.rotation.x -= hurt * 0.52;
        parts.rightLeg.position.y -= hurt * 1.8;
        parts.torso.rotation.z += hurt * 0.1;
        return;
      }

      parts.torso.rotation.x -= hurt * 0.18;
    }

    updateHealthBar(npc) {
      const ratio = clamp(npc.health / (npc.maxHealth || NPC.maxHealth), 0, 1);
      const fill = npc.group.userData.healthFill;

      fill.scale.x = ratio;
      fill.position.x = -23 * (1 - ratio);
      fill.material.color.setHex(ratio > 0.45 ? 0x42d59b : 0xf05e5e);
    }
  }

  window.NpcManager = NpcManager;
})();
