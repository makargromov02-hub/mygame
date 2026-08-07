(function () {
  'use strict';

  const { NPC, WORLD } = window.GameConfig;
  const { clamp, randomRange, angleToTarget } = window.GameUtils;

  const BASES = [
    { id: 'north-yard', name: 'Северный двор', x: 860, z: 760, radius: 250, guards: 2, reward: 360, color: 0xff5d67 },
    { id: 'river-post', name: 'Речной пост', x: 1540, z: 1180, radius: 300, guards: 3, reward: 460, color: 0xff9f5a },
    { id: 'rail-depot', name: 'Железнодорожный склад', x: 2480, z: 860, radius: 330, guards: 2, reward: 420, color: 0xf7df72 },
    { id: 'market-block', name: 'Рыночный квартал', x: 3480, z: 1220, radius: 280, guards: 3, reward: 500, color: 0xff5d67 },
    { id: 'central-gate', name: 'Центральные ворота', x: 2500, z: 2380, radius: 350, guards: 3, reward: 560, color: 0xff9f5a },
    { id: 'west-block', name: 'Западный блокпост', x: 920, z: 2840, radius: 260, guards: 2, reward: 380, color: 0xf7df72 },
    { id: 'container-field', name: 'Контейнерная база', x: 3350, z: 3040, radius: 320, guards: 3, reward: 540, color: 0xff5d67 },
    { id: 'south-rooftops', name: 'Южные крыши', x: 1900, z: 3940, radius: 290, guards: 2, reward: 430, color: 0xff9f5a }
  ];

  const ALARM_TIME = 11500;
  const REINFORCEMENT_DELAY = 18000;
  const REINFORCEMENT_COOLDOWN = 26000;
  const REINFORCEMENT_LIMIT = 3;

  class BaseSystem {
    constructor(scene, world, player, npcs, loot, modeSystem, elements) {
      this.scene = scene;
      this.world = world;
      this.player = player;
      this.npcs = npcs;
      this.loot = loot;
      this.modeSystem = modeSystem;
      this.elements = elements || {};
      this.active = true;
      this.guardStartIndex = NPC.count;
      this.nextGuardSlot = 0;
      this.messageTimer = 0;
      this.currentBaseId = '';
      this.group = new THREE.Group();
      this.scene.add(this.group);
      this.materials = this.createMaterials();
      this.bases = BASES.map((definition) => this.createBaseState(definition));
      this.buildWorldLayer();
      this.reset();
    }

    createMaterials() {
      return {
        territory: new THREE.MeshBasicMaterial({ color: 0xff5d67, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
        capturedTerritory: new THREE.MeshBasicMaterial({ color: 0x42d59b, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
        pole: new THREE.MeshStandardMaterial({ color: 0x202832, roughness: 0.58, metalness: 0.42 }),
        flagEnemy: new THREE.MeshStandardMaterial({ color: 0xff5d67, roughness: 0.52, metalness: 0.04, emissive: 0x33070a, emissiveIntensity: 0.25 }),
        flagCaptured: new THREE.MeshStandardMaterial({ color: 0x42d59b, roughness: 0.52, metalness: 0.04, emissive: 0x06321f, emissiveIntensity: 0.25 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0x8c969d, roughness: 0.83, metalness: 0.02 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x465465, roughness: 0.58, metalness: 0.24 }),
        sandbag: new THREE.MeshStandardMaterial({ color: 0x8d8064, roughness: 0.9, metalness: 0.01 })
      };
    }

    createBaseState(definition) {
      return Object.assign({}, definition, {
        captured: false,
        alarmed: false,
        alarmUntil: 0,
        playerEnteredAt: 0,
        nextReinforcementAt: 0,
        reinforcements: 0,
        guardIds: [],
        meshes: {}
      });
    }

    buildWorldLayer() {
      for (const base of this.bases) {
        this.buildTerritory(base);
        this.buildFlag(base);
        this.buildCover(base);
      }

      if (this.world.optimizeStaticMeshes) {
        this.world.optimizeStaticMeshes();
      }

      if (this.world.registerRenderOptimizations) {
        this.world.registerRenderOptimizations();
      }

      if (this.world.buildSpatialIndex) {
        this.world.buildSpatialIndex();
      }
    }

    buildTerritory(base) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(base.radius - 4, base.radius, 96),
        this.materials.territory.clone()
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(base.x, this.world.getGroundHeightAt(base.x, base.z, 0) + 1.2, base.z);
      ring.receiveShadow = false;
      this.group.add(ring);
      base.meshes.territory = ring;
    }

    buildFlag(base) {
      const flagGroup = new THREE.Group();
      const groundY = this.world.getGroundHeightAt(base.x, base.z, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 132, 12), this.materials.pole);
      pole.position.set(0, 66, 0);
      pole.castShadow = true;
      flagGroup.add(pole);

      const flag = new THREE.Mesh(new THREE.BoxGeometry(54, 30, 4), this.materials.flagEnemy.clone());
      flag.position.set(29, 104, 0);
      flag.castShadow = true;
      flagGroup.add(flag);

      const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(18, 24, 8, 18), this.materials.concrete);
      basePlate.position.set(0, 4, 0);
      basePlate.receiveShadow = true;
      flagGroup.add(basePlate);

      flagGroup.position.set(base.x, groundY, base.z);
      this.group.add(flagGroup);
      base.meshes.flag = flag;
      base.meshes.flagGroup = flagGroup;
    }

    buildCover(base) {
      const count = clamp(Math.round(base.guards * 1.7), 3, 6);

      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + (base.guards % 2) * 0.22;
        const distance = base.radius * randomRange(0.38, 0.72);
        const w = i % 2 === 0 ? randomRange(64, 105) : randomRange(38, 62);
        const h = i % 2 === 0 ? randomRange(34, 52) : randomRange(72, 112);
        const x = clamp(base.x + Math.sin(angle) * distance - w / 2, 40, WORLD.width - 140);
        const z = clamp(base.z + Math.cos(angle) * distance - h / 2, 40, WORLD.height - 140);
        const height = i % 3 === 0 ? 48 : i % 3 === 1 ? 62 : 78;
        const material = i % 3 === 0 ? this.materials.sandbag : i % 3 === 1 ? this.materials.concrete : this.materials.metal;
        const object = {
          type: 'baseCover',
          shape: 'rect',
          baseId: base.id,
          x,
          y: z,
          w,
          h,
          height,
          solid: true,
          impactMaterial: material === this.materials.metal ? 'metal' : 'concrete',
          vaultable: height <= 62
        };

        object.mesh = this.world.addBoxAt(x + w / 2, z + h / 2, w, height, h, 0, material);
        object.mesh.rotation.y = angle + Math.PI / 2;
        this.world.objects.push(object);
      }
    }

    reset() {
      this.active = true;
      this.nextGuardSlot = 0;
      this.currentBaseId = '';
      this.messageTimer = 0;

      for (const base of this.bases) {
        base.captured = false;
        base.alarmed = false;
        base.alarmUntil = 0;
        base.playerEnteredAt = 0;
        base.nextReinforcementAt = 0;
        base.reinforcements = 0;
        base.guardIds.length = 0;
        this.updateBaseVisual(base);
      }

      this.assignInitialGuards();
      this.updateHud(performance.now());
    }

    setActive(active) {
      this.active = Boolean(active);
      if (!this.active) {
        this.hideHud();
      }
    }

    assignInitialGuards() {
      const totalGuards = this.bases.reduce((sum, base) => sum + base.guards, 0);
      this.npcs.ensureNpcCount(this.guardStartIndex + totalGuards);

      for (let i = this.guardStartIndex; i < this.npcs.npcs.length; i += 1) {
        const npc = this.npcs.npcs[i];
        if (!npc.isBaseGuard) continue;
        npc.alive = false;
        npc.group.visible = false;
        npc.respawnAt = Infinity;
      }

      for (const base of this.bases) {
        for (let i = 0; i < base.guards; i += 1) {
          const npc = this.npcs.npcs[this.guardStartIndex + this.nextGuardSlot];
          this.nextGuardSlot += 1;
          this.placeGuard(npc, base, false);
        }
      }
    }

    placeGuard(npc, base, reinforcement) {
      const angle = randomRange(0, Math.PI * 2);
      const distance = randomRange(56, base.radius * 0.72);
      const x = clamp(base.x + Math.sin(angle) * distance, NPC.radius, WORLD.width - NPC.radius);
      const z = clamp(base.z + Math.cos(angle) * distance, NPC.radius, WORLD.height - NPC.radius);

      this.npcs.activateNpcAt(npc, x, z, {
        angle: angle + Math.PI,
        maxHealth: NPC.maxHealth + (reinforcement ? 18 : 8),
        speed: NPC.speed * (reinforcement ? 1.08 : 1),
        bulletSpread: Math.max(0.018, NPC.bulletSpread - (reinforcement ? 0.004 : 0))
      });
      npc.isBaseGuard = true;
      npc.baseId = base.id;
      npc.baseReinforcement = Boolean(reinforcement);
      npc.respawnAt = Infinity;
      base.guardIds.push(npc.id);
    }

    update(dt, now) {
      if (!this.active || this.modeSystem.mode === 'survival') {
        this.hideHud();
        return;
      }

      let focusedBase = null;

      for (const base of this.bases) {
        if (base.captured) continue;

        const distance = Math.hypot(this.player.x - base.x, this.player.z - base.z);
        const inside = distance <= base.radius;
        if (inside) {
          focusedBase = base;
          if (!base.playerEnteredAt) {
            base.playerEnteredAt = now;
            base.nextReinforcementAt = now + REINFORCEMENT_DELAY;
          }
          if (base.alarmed && now >= base.nextReinforcementAt) {
            this.spawnReinforcements(base, now);
          }
        } else {
          base.playerEnteredAt = 0;
        }

        if (base.alarmed && now > base.alarmUntil && !inside) {
          base.alarmed = false;
        }
      }

      this.updateHud(now, focusedBase);
    }

    handleNpcDetected(sourceNpc, now) {
      if (!this.active || !sourceNpc || !sourceNpc.alive || this.modeSystem.mode === 'survival') return;
      const base = this.getNpcBase(sourceNpc) || this.getBaseAt(sourceNpc.x, sourceNpc.z) || this.getBaseAt(this.player.x, this.player.z);
      if (!base || base.captured) return;

      base.alarmed = true;
      base.alarmUntil = now + ALARM_TIME;
      if (!base.nextReinforcementAt) {
        base.nextReinforcementAt = now + REINFORCEMENT_DELAY;
      }

      this.alertBaseGuards(base, now);
      this.alertNearbyHelpers(base, now);
    }

    alertBaseGuards(base, now) {
      for (const npc of this.npcs.npcs) {
        if (!npc.alive || npc.baseId !== base.id) continue;
        npc.seesPlayer = npc.seesPlayer || this.npcs.canSeePlayer(npc, Math.hypot(this.player.x - npc.x, this.player.z - npc.z));
        npc.state = npc.seesPlayer ? 'chase' : 'search';
        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.searchUntil = now + NPC.searchTime;
        npc.alertedByAllyUntil = now + NPC.searchTime;
      }
    }

    alertNearbyHelpers(base, now) {
      const helpRadius = base.radius + 360;
      for (const npc of this.npcs.npcs) {
        if (!npc.alive || npc.baseId === base.id) continue;
        const distance = Math.hypot(npc.x - base.x, npc.z - base.z);
        if (distance > helpRadius) continue;
        npc.state = 'search';
        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.searchUntil = now + NPC.searchTime;
        npc.alertedByAllyUntil = now + NPC.searchTime;
      }
    }

    handleNpcKilled(npc) {
      if (!this.active || !npc || !npc.baseId) return;
      npc.respawnAt = Infinity;
      const base = this.bases.find((entry) => entry.id === npc.baseId);
      if (!base || base.captured) return;
      if (this.getRemainingEnemies(base) > 0) return;
      this.captureBase(base);
    }

    captureBase(base) {
      base.captured = true;
      base.alarmed = false;
      base.alarmUntil = 0;
      this.updateBaseVisual(base);

      const money = this.modeSystem.addMoney(base.reward);
      this.spawnCaptureRewards(base);
      this.showMessage('База захвачена: ' + base.name + '  +' + money);
      this.updateHud(performance.now(), base);
    }

    spawnCaptureRewards(base) {
      if (!this.loot) return;
      const rewards = ['health', 'armor', 'ammoPistol', 'ammoRifle'];
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        const distance = 34 + i * 8;
        this.loot.spawn(rewards[i % rewards.length], base.x + Math.sin(angle) * distance, base.z + Math.cos(angle) * distance);
      }
    }

    spawnReinforcements(base, now) {
      if (base.reinforcements >= REINFORCEMENT_LIMIT) return;
      base.reinforcements += 1;
      base.nextReinforcementAt = now + REINFORCEMENT_COOLDOWN;
      const count = base.reinforcements === REINFORCEMENT_LIMIT ? 1 : 2;

      this.npcs.ensureNpcCount(this.npcs.npcs.length + count);
      for (let i = 0; i < count; i += 1) {
        const npc = this.npcs.npcs[this.npcs.npcs.length - count + i];
        this.placeGuard(npc, base, true);
        npc.state = 'search';
        npc.lastKnownPlayerX = this.player.x;
        npc.lastKnownPlayerZ = this.player.z;
        npc.searchUntil = now + NPC.searchTime;
      }

      this.showMessage('Подкрепление прибыло: ' + base.name);
    }

    updateBaseVisual(base) {
      if (base.meshes.territory) {
        base.meshes.territory.material.color.setHex(base.captured ? 0x42d59b : base.color);
        base.meshes.territory.material.opacity = base.captured ? 0.16 : 0.11;
      }

      if (base.meshes.flag) {
        base.meshes.flag.material.color.setHex(base.captured ? 0x42d59b : base.color);
        base.meshes.flag.material.emissive.setHex(base.captured ? 0x06321f : 0x33070a);
      }
    }

    getNpcBase(npc) {
      if (!npc.baseId) return null;
      return this.bases.find((base) => base.id === npc.baseId) || null;
    }

    getBaseAt(x, z) {
      for (const base of this.bases) {
        if (Math.hypot(x - base.x, z - base.z) <= base.radius) return base;
      }
      return null;
    }

    getRemainingEnemies(base) {
      let count = 0;
      for (const npc of this.npcs.npcs) {
        if (npc.alive && npc.baseId === base.id) count += 1;
      }
      return count;
    }

    showMessage(text) {
      if (!this.elements.baseMessage) return;
      this.elements.baseMessage.textContent = text;
      this.elements.baseMessage.classList.remove('hidden');
      this.messageTimer = performance.now() + 2600;
    }

    updateHud(now, base) {
      if (this.elements.baseMessage && this.messageTimer && now > this.messageTimer) {
        this.elements.baseMessage.classList.add('hidden');
        this.messageTimer = 0;
      }

      const currentBase = base || this.getBaseAt(this.player.x, this.player.z);
      if (!currentBase) {
        this.hideHud();
        return;
      }

      if (this.elements.baseHud) this.elements.baseHud.classList.remove('hidden');
      if (this.elements.baseName) this.elements.baseName.textContent = currentBase.name;
      if (this.elements.baseEnemies) this.elements.baseEnemies.textContent = String(this.getRemainingEnemies(currentBase));
      if (this.elements.baseAlert) {
        this.elements.baseAlert.textContent = currentBase.captured ? 'ЗАХВАЧЕНА' : currentBase.alarmed ? 'ТРЕВОГА' : 'ТИХО';
        this.elements.baseAlert.classList.toggle('base-alert-danger', currentBase.alarmed && !currentBase.captured);
        this.elements.baseAlert.classList.toggle('base-alert-captured', currentBase.captured);
      }
    }

    hideHud() {
      if (this.elements.baseHud) this.elements.baseHud.classList.add('hidden');
    }
  }

  window.BaseSystem = BaseSystem;
})();
