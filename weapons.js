(function () {
  'use strict';

  const { WEAPONS, PLAYER } = window.GameConfig;
  const { applyYawSpreadTo, clamp } = window.GameUtils;

  const VIEWMODEL = {
    baseFov: 74,
    adsFov: 63,
    aimSpeed: 13,
    swapDuration: 0.54
  };

  const POOL_LIMITS = {
    bullets: 96,
    particles: 260,
    marks: 90,
    debris: 90,
    rings: 12
  };

  function randomSigned(amount) {
    return (Math.random() - 0.5) * amount * 2;
  }

  class WeaponSystem {
    constructor(scene, player, world, hud, audio) {
      this.scene = scene;
      this.player = player;
      this.world = world;
      this.hud = hud;
      this.audio = audio;
      this.current = 'pistol';
      this.previousWeapon = null;
      this.mouseDown = false;
      this.isAiming = false;
      this.aimAmount = 0;
      this.crosshairKick = 0;
      this.nextShotAt = 0;
      this.reloadEndsAt = 0;
      this.reloadStartedAt = 0;
      this.drawTime = 0.45;
      this.swapTime = 0;
      this.combatHud = null;
      this.lootSystem = null;
      this.crosshairElement = document.querySelector('.crosshair');
      this.lastHudValues = {
        weapon: '',
        ammo: '',
        current: '',
        magazine: '',
        reserve: ''
      };
      this.bobTime = 0;
      this.breathTime = 0;
      this.recoil = 0;
      this.recoilLift = 0;
      this.recoilYaw = 0;
      this.shotHeat = 0;
      this.lastShotTime = 0;
      this.muzzleFlashPower = 0;
      this.muzzleFlashTime = 0;
      this.bullets = [];
      this.effects = [];
      this.effectPool = {};
      this.sharedGeometries = {};
      this.tempShootOrigin = new THREE.Vector3();
      this.tempShootDirection = new THREE.Vector3();
      this.tempBaseDirection = new THREE.Vector3();
      this.tempBulletOffset = new THREE.Vector3();
      this.tempEffectDirection = new THREE.Vector3();
      this.tempEffectPosition = new THREE.Vector3();
      this.tempEffectVelocity = new THREE.Vector3();
      this.tempEffectNormal = new THREE.Vector3();
      this.tempEffectScale = new THREE.Vector3();
      this.tempEffectQuaternion = new THREE.Quaternion();
      this.tempEffectMatrix = new THREE.Matrix4();
      this.tempEffectColor = new THREE.Color();
      this.tempViewPosition = new THREE.Vector3();
      this.tempViewRotation = new THREE.Euler();
      this.tempMarkForward = new THREE.Vector3(0, 0, 1);
      this.tempMuzzlePoint = new THREE.Vector3();
      this.ammo = {
        pistol: { magazine: WEAPONS.pistol.magazineSize, reserve: WEAPONS.pistol.reserveAmmo },
        rifle: { magazine: WEAPONS.rifle.magazineSize, reserve: WEAPONS.rifle.reserveAmmo }
      };
      this.createRuntimePools();
      this.viewModel = this.createViewModel();
      this.player.camera.add(this.viewModel.root);
      this.updateHud(performance.now());
      this.updateWeaponModelVisibility();
    }

    createRuntimePools() {
      this.sharedGeometries = {
        bullet: new THREE.SphereGeometry(1, 8, 8),
        particle: new THREE.SphereGeometry(1, 6, 6),
        mark: new THREE.CircleGeometry(1, 12),
        debris: new THREE.BoxGeometry(1, 1, 1),
        ring: new THREE.RingGeometry(18, 22, 36)
      };
      this.bulletPool = [];
      this.effectPool = {
        particle: [],
        mark: [],
        debris: [],
        ring: []
      };
      this.particleMesh = null;

      for (let i = 0; i < POOL_LIMITS.bullets; i += 1) {
        const mesh = new THREE.Mesh(
          this.sharedGeometries.bullet,
          new THREE.MeshBasicMaterial({ color: 0xf7df72, transparent: true, opacity: 1, depthWrite: false })
        );
        mesh.visible = false;
        mesh.frustumCulled = true;
        this.scene.add(mesh);
        this.bulletPool.push({
          mesh,
          previousPosition: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          inPool: true
        });
      }

      this.createParticleInstancePool(POOL_LIMITS.particles);
      this.createEffectPool('mark', POOL_LIMITS.marks, () => new THREE.Mesh(
        this.sharedGeometries.mark,
        new THREE.MeshBasicMaterial({ color: 0x121212, transparent: true, opacity: 0, depthWrite: false })
      ));
      this.createEffectPool('debris', POOL_LIMITS.debris, () => new THREE.Mesh(
        this.sharedGeometries.debris,
        new THREE.MeshStandardMaterial({ color: 0x7b4b27, roughness: 0.82, metalness: 0.02, transparent: true, opacity: 0 })
      ));
      this.createEffectPool('ring', POOL_LIMITS.rings, () => new THREE.Mesh(
        this.sharedGeometries.ring,
        new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
      ));
    }

    createParticleInstancePool(count) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.InstancedMesh(this.sharedGeometries.particle, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.scene.add(mesh);
      this.particleMesh = mesh;

      const hiddenScale = this.tempEffectScale.set(0, 0, 0);
      for (let i = 0; i < count; i += 1) {
        this.tempEffectMatrix.compose(this.tempEffectPosition.set(0, -10000, 0), this.tempEffectQuaternion, hiddenScale);
        mesh.setMatrixAt(i, this.tempEffectMatrix);
        mesh.setColorAt(i, this.tempEffectColor.setHex(0xffffff));
        this.effectPool.particle.push({
          kind: 'particle',
          instanceIndex: i,
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          life: 0,
          maxLife: 1,
          gravity: 0,
          fade: true,
          size: 1,
          inPool: true
        });
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    createEffectPool(kind, count, factory) {
      for (let i = 0; i < count; i += 1) {
        const mesh = factory();
        mesh.visible = false;
        mesh.frustumCulled = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.scene.add(mesh);
        this.effectPool[kind].push({
          kind,
          mesh,
          velocity: new THREE.Vector3(),
          life: 0,
          maxLife: 1,
          gravity: 0,
          fade: true,
          inPool: true
        });
      }
    }

    acquireBullet() {
      if (this.bulletPool.length === 0 && this.bullets.length > 0) {
        const recycled = this.bullets.shift();
        this.releaseBullet(recycled);
      }

      const bullet = this.bulletPool.pop();
      bullet.inPool = false;
      return bullet;
    }

    releaseBullet(bullet) {
      if (!bullet || bullet.inPool) return;
      bullet.mesh.visible = false;
      bullet.mesh.material.opacity = 1;
      bullet.velocity.set(0, 0, 0);
      bullet.life = 0;
      bullet.inPool = true;
      this.bulletPool.push(bullet);
    }

    acquireEffect(kind) {
      if (this.effectPool[kind].length === 0) {
        const index = this.effects.findIndex((effect) => effect.kind === kind);
        if (index >= 0) {
          const recycled = this.effects.splice(index, 1)[0];
          this.releaseEffect(recycled);
        }
      }

      const effect = this.effectPool[kind].pop();
      effect.inPool = false;
      if (kind === 'particle') {
        return effect;
      }
      effect.mesh.visible = true;
      effect.mesh.scale.set(1, 1, 1);
      effect.mesh.rotation.set(0, 0, 0);
      effect.mesh.material.opacity = 1;
      return effect;
    }

    activateEffect(effect, velocity, life, gravity, fade) {
      effect.velocity.copy(velocity);
      effect.life = life;
      effect.maxLife = life;
      effect.gravity = gravity;
      effect.fade = fade;
      this.effects.push(effect);
    }

    releaseEffect(effect) {
      if (!effect || effect.inPool) return;
      if (effect.kind === 'particle') {
        effect.position.set(0, -10000, 0);
        effect.velocity.set(0, 0, 0);
        effect.life = 0;
        effect.gravity = 0;
        effect.size = 0;
        effect.inPool = true;
        this.updateParticleInstance(effect, 0);
        if (this.particleMesh) this.particleMesh.instanceMatrix.needsUpdate = true;
        this.effectPool.particle.push(effect);
        return;
      }
      effect.mesh.visible = false;
      effect.velocity.set(0, 0, 0);
      effect.life = 0;
      effect.gravity = 0;
      effect.inPool = true;
      this.effectPool[effect.kind].push(effect);
    }

    setCombatHud(hudSystem) {
      this.combatHud = hudSystem;
    }

    setLootSystem(lootSystem) {
      this.lootSystem = lootSystem;
    }

    reset() {
      this.current = 'pistol';
      this.previousWeapon = null;
      this.mouseDown = false;
      this.isAiming = false;
      this.aimAmount = 0;
      this.crosshairKick = 0;
      this.nextShotAt = 0;
      this.reloadEndsAt = 0;
      this.reloadStartedAt = 0;
      this.drawTime = 0.45;
      this.swapTime = 0;
      this.recoil = 0;
      this.recoilLift = 0;
      this.recoilYaw = 0;
      this.shotHeat = 0;
      this.lastShotTime = 0;
      this.muzzleFlashPower = 0;
      this.muzzleFlashTime = 0;
      this.player.aimSlowMultiplier = 1;
      this.player.camera.fov = VIEWMODEL.baseFov;
      this.player.camera.updateProjectionMatrix();
      this.ammo = {
        pistol: { magazine: WEAPONS.pistol.magazineSize, reserve: WEAPONS.pistol.reserveAmmo },
        rifle: { magazine: WEAPONS.rifle.magazineSize, reserve: WEAPONS.rifle.reserveAmmo }
      };
      this.clearBullets();
      this.clearEffects();
      this.updateWeaponModelVisibility();
      this.updateHud(performance.now());
    }

    addAmmo(amount) {
      this.ammo.pistol.reserve += Math.ceil(amount * 0.45);
      this.ammo.rifle.reserve += amount;
      this.updateHud(performance.now());
    }

    addAmmoFor(type, amount) {
      if (!this.ammo[type]) return false;
      this.ammo[type].reserve += Math.max(0, Math.floor(amount || 0));
      this.updateHud(performance.now());
      return true;
    }

    clearBullets() {
      for (const bullet of this.bullets) {
        this.releaseBullet(bullet);
      }
      this.bullets.length = 0;
    }

    clearEffects() {
      for (const effect of this.effects) {
        this.releaseEffect(effect);
      }
      this.effects.length = 0;
    }

    get weapon() {
      return WEAPONS[this.current];
    }

    get currentAmmo() {
      return this.ammo[this.current];
    }

    switchWeapon(type) {
      if (!WEAPONS[type] || type === this.current) return;
      this.previousWeapon = this.current;
      this.current = type;
      this.reloadEndsAt = 0;
      this.reloadStartedAt = 0;
      this.drawTime = VIEWMODEL.swapDuration;
      this.swapTime = VIEWMODEL.swapDuration;
      this.recoil = 0;
      this.recoilLift = 0;
      this.recoilYaw = 0;
      this.shotHeat = 0;
      this.muzzleFlashPower = 0;
      this.muzzleFlashTime = 0;
      this.isAiming = false;
      this.updateHud(performance.now());
    }

    setMouseDown(value) {
      this.mouseDown = value;
    }

    setAiming(value) {
      this.isAiming = Boolean(value);
    }

    startReload(now) {
      const weapon = this.weapon;
      const ammo = this.currentAmmo;

      if (this.reloadEndsAt > now) return;
      if (ammo.magazine >= weapon.magazineSize || ammo.reserve <= 0) return;

      this.reloadEndsAt = now + weapon.reloadTime;
      this.reloadStartedAt = now;
      this.audio.playReload(this.current);
      this.updateHud(now);
    }

    finishReloadIfReady(now) {
      if (this.reloadEndsAt === 0 || now < this.reloadEndsAt) return;

      const weapon = this.weapon;
      const ammo = this.currentAmmo;
      const needed = weapon.magazineSize - ammo.magazine;
      const loaded = Math.min(needed, ammo.reserve);

      ammo.magazine += loaded;
      ammo.reserve -= loaded;
      this.reloadEndsAt = 0;
      this.reloadStartedAt = 0;
      this.updateHud(now);
    }

    tryShoot(now) {
      const weapon = this.weapon;
      const ammo = this.currentAmmo;

      if (!this.mouseDown || this.reloadEndsAt > now) return;
      if (now < this.nextShotAt) return;

      if (ammo.magazine <= 0) {
        this.startReload(now);
        this.nextShotAt = now + weapon.fireDelay;
        return;
      }

      const origin = this.player.getShootOriginTo
        ? this.player.getShootOriginTo(this.tempShootOrigin)
        : this.tempShootOrigin.copy(this.player.getShootOrigin());
      const baseDirection = this.player.getShootDirectionTo
        ? this.player.getShootDirectionTo(this.tempBaseDirection)
        : this.tempBaseDirection.copy(this.player.getShootDirection());
      const direction = applyYawSpreadTo(this.tempShootDirection, baseDirection, this.getShotSpread(weapon, now));
      this.spawnBullet('player', origin, direction, weapon);
      this.spawnMuzzleSmoke(origin, direction, weapon);
      this.kickWeapon();
      this.audio.playWeaponShot(this.current);

      ammo.magazine -= 1;
      this.nextShotAt = now + weapon.fireDelay;
      this.updateHud(now);
    }

    getShotSpread(weapon, now) {
      const timeSinceShot = this.lastShotTime ? now - this.lastShotTime : 9999;
      const cooldown = this.current === 'rifle' ? 0.78 : 1.28;
      this.shotHeat = Math.max(0, this.shotHeat - timeSinceShot / 1000 * cooldown);
      const heatGain = this.current === 'rifle' ? 0.105 : 0.18;
      this.shotHeat = Math.min(1.35, this.shotHeat + heatGain * (this.aimAmount > 0.7 ? 0.68 : 1));
      this.lastShotTime = now;

      const heatSpread = this.current === 'rifle'
        ? this.shotHeat * 0.012
        : Math.max(0, this.shotHeat - 0.22) * 0.0045;
      return weapon.spread * this.getSpreadMultiplier() + heatSpread;
    }

    spawnNpcBullet(origin, direction) {
      const settings = {
        damage: window.GameConfig.NPC.bulletDamage || 8,
        bulletSpeed: window.GameConfig.NPC.bulletSpeed,
        bulletLife: window.GameConfig.NPC.bulletLife,
        bulletRadius: window.GameConfig.NPC.bulletRadius,
        bulletColor: 0xff5d67
      };
      this.spawnBullet('npc', origin, direction, settings);
      this.audio.playNpcShot();
    }

    spawnBullet(owner, origin, direction, settings) {
      const bullet = this.acquireBullet();
      const mesh = bullet.mesh;
      mesh.position.copy(origin).add(this.tempBulletOffset.copy(direction).multiplyScalar(owner === 'player' ? 24 : 18));
      mesh.scale.setScalar(settings.bulletRadius);
      mesh.material.color.setHex(settings.bulletColor);
      mesh.material.opacity = 1;
      mesh.visible = true;

      bullet.owner = owner;
      bullet.previousPosition.copy(mesh.position);
      bullet.velocity.copy(direction).multiplyScalar(settings.bulletSpeed);
      bullet.life = settings.bulletLife;
      bullet.maxLife = settings.bulletLife;
      bullet.radius = settings.bulletRadius;
      bullet.damage = settings.damage || 0;
      this.bullets.push(bullet);
    }

    update(dt, now, npcManager) {
      this.finishReloadIfReady(now);
      this.tryShoot(now);
      this.updateViewModel(dt);

      for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
        const bullet = this.bullets[i];
        bullet.previousPosition.copy(bullet.mesh.position);
        bullet.mesh.position.addScaledVector(bullet.velocity, dt);
        bullet.life -= dt;
        bullet.mesh.material.opacity = Math.max(0.15, bullet.life / bullet.maxLife);
        bullet.mesh.material.transparent = true;

        const x = bullet.mesh.position.x;
        const z = bullet.mesh.position.z;
        const outsideWorld = x < 0 || x > window.GameConfig.WORLD.width || z < 0 || z > window.GameConfig.WORLD.height;
        const mapImpact = this.world.getBulletImpact(bullet.previousPosition, bullet.mesh.position, bullet.radius);
        const hitCharacter = bullet.owner === 'player'
          ? npcManager.hitNpcWithBullet(x, z, bullet.mesh.position.y, bullet.radius, bullet.damage)
          : this.hitPlayerWithBullet(x, z, bullet.mesh.position.y, bullet.radius, bullet.damage);

        if (bullet.life <= 0 || outsideWorld || mapImpact || hitCharacter) {
          if (mapImpact) {
            this.spawnImpactEffects(mapImpact, bullet.velocity, bullet.owner === 'player' ? 0xf7df72 : 0xff5d67);
            if (mapImpact.object && mapImpact.object.physics) {
              this.tempEffectDirection.copy(bullet.velocity).normalize();
              this.world.applyImpulseToObject(mapImpact.object, this.tempEffectDirection.x, this.tempEffectDirection.z, bullet.owner === 'player' ? 145 : 80, 24);
            }
            if (mapImpact.object && mapImpact.object.destructible) {
              this.handleDestructibleHit(mapImpact, bullet, npcManager);
            }
            this.audio.playImpact(mapImpact.material);
          }

          if (hitCharacter && bullet.owner === 'player') {
            this.spawnBloodEffects(bullet.mesh.position, hitCharacter.part);
            this.audio.playBodyHit(hitCharacter.part);
            if (this.combatHud) {
              this.combatHud.showHitMarker(hitCharacter.killed, hitCharacter.headshot);
              if (hitCharacter.killed) {
                const hitLabel = hitCharacter.headshot ? 'Хедшот' : hitCharacter.partLabel || 'Попадание';
                this.combatHud.showKill(hitLabel + ': NPC уничтожен  +' + Math.round(hitCharacter.damage));
              }
            }
          }

          this.releaseBullet(bullet);
          this.bullets.splice(i, 1);
        }
      }

      this.updateEffects(dt);
    }

    hitPlayerWithBullet(x, z, y, radius, damage) {
      const distance = Math.hypot(x - this.player.x, z - this.player.z);
      const verticalHit = y >= this.player.y - radius && y <= this.player.y + this.player.currentHeight + radius;

      if (distance > radius + PLAYER.radius || !verticalHit) {
        return false;
      }

      this.player.markHit(damage);
      this.audio.playPlayerHit();
      return true;
    }

    handleDestructibleHit(impact, bullet, npcManager) {
      const object = impact.object;
      const destroyed = this.world.damageDestructible(object, bullet.damage || 20);

      if (object.impactMaterial === 'glass') {
        this.spawnGlassEffects(impact.point);
      } else if (object.impactMaterial === 'wood') {
        this.spawnWoodEffects(impact.point);
      }

      if (!destroyed) return;

      if (object.explosive) {
        this.explodeBarrel(object, impact.point, npcManager);
      } else {
        this.spawnDebrisForObject(object, impact.point);
        if (this.lootSystem && object.impactMaterial === 'wood') {
          this.lootSystem.spawnFromCrate(object);
        }
        this.world.destroyObject(object);
      }
    }

    explodeBarrel(object, point, npcManager) {
      const center = this.tempEffectPosition.set(object.x, 28, object.y);
      this.spawnExplosionEffects(center);
      this.world.addFire(object.x, object.y, 115, 5.5);
      if (this.world.applyExplosionImpulse) {
        this.world.applyExplosionImpulse(object.x, object.y, 260, 420);
      }
      this.applyExplosionDamage(object.x, object.y, 165, 62, npcManager);
      this.world.destroyObject(object);
    }

    applyExplosionDamage(x, z, radius, damage, npcManager) {
      const playerDistance = Math.hypot(this.player.x - x, this.player.z - z);
      if (playerDistance < radius) {
        this.player.markHit(damage * (1 - playerDistance / radius));
        if (this.player.applyKnockback) {
          this.player.applyKnockback(this.player.x - x, this.player.z - z, 260 * (1 - playerDistance / radius), 170 * (1 - playerDistance / radius));
        }
      }

      if (npcManager && typeof npcManager.applyExplosionDamage === 'function') {
        npcManager.applyExplosionDamage(x, z, radius, damage);
      }
    }

    updateHud(now) {
      const weapon = this.weapon;
      const ammo = this.currentAmmo;
      const isReloading = this.reloadEndsAt > now;

      const weaponLabel = isReloading ? weapon.name + '...' : weapon.name;

      if (this.hud.weapon && this.lastHudValues.weapon !== weaponLabel) {
        this.hud.weapon.textContent = weaponLabel;
        this.lastHudValues.weapon = weaponLabel;
      }

      const ammoLabel = ammo.magazine + '/' + weapon.magazineSize + ' | ' + ammo.reserve;
      if (this.hud.ammo && this.lastHudValues.ammo !== ammoLabel) {
        this.hud.ammo.textContent = ammoLabel;
        this.lastHudValues.ammo = ammoLabel;
      }

      const currentLabel = String(ammo.magazine);
      if (this.hud.ammoCurrent && this.lastHudValues.current !== currentLabel) {
        this.hud.ammoCurrent.textContent = currentLabel;
        this.lastHudValues.current = currentLabel;
      }

      const magazineLabel = '/' + weapon.magazineSize;
      if (this.hud.ammoMagazine && this.lastHudValues.magazine !== magazineLabel) {
        this.hud.ammoMagazine.textContent = magazineLabel;
        this.lastHudValues.magazine = magazineLabel;
      }

      const reserveLabel = String(ammo.reserve);
      if (this.hud.ammoReserve && this.lastHudValues.reserve !== reserveLabel) {
        this.hud.ammoReserve.textContent = reserveLabel;
        this.lastHudValues.reserve = reserveLabel;
      }
    }

    spawnImpactEffects(impact, velocity, color) {
      const hitPosition = this.tempEffectPosition.copy(impact.point);
      hitPosition.y = Math.max(2, hitPosition.y);
      this.addBulletMark(hitPosition, impact.normal, impact.material);

      const particleCount = impact.material === 'metal' ? 14
        : impact.material === 'concrete' ? 11
          : impact.material === 'wood' ? 9
            : impact.material === 'dirt' ? 5
              : 7;
      for (let i = 0; i < particleCount; i += 1) {
        const dir = this.tempEffectDirection.copy(velocity).normalize().multiplyScalar(-1);
        const materialScatter = impact.material === 'metal' ? 1.75 : impact.material === 'wood' ? 1.25 : 1.05;
        dir.x += randomSigned(materialScatter);
        dir.y += randomSigned(0.75) + (impact.material === 'metal' ? 0.55 : 0.72);
        dir.z += randomSigned(materialScatter);
        const particleColor = this.getImpactParticleColor(impact.material, color);
        const speed = impact.material === 'metal' ? 260 + Math.random() * 330
          : impact.material === 'wood' ? 115 + Math.random() * 190
            : 90 + Math.random() * 170;
        const size = impact.material === 'metal' ? 1.9 : impact.material === 'concrete' ? 3.2 : impact.material === 'wood' ? 3.6 : 2.4;
        this.addParticle(hitPosition, this.tempEffectVelocity.copy(dir).normalize().multiplyScalar(speed), particleColor, size, impact.material === 'metal' ? 0.24 : 0.34, true);
      }

      const smokeCount = impact.material === 'dirt' ? 11 : impact.material === 'concrete' ? 6 : impact.material === 'wood' ? 4 : 3;
      for (let i = 0; i < smokeCount; i += 1) {
        const dir = this.tempEffectDirection.set(randomSigned(0.55), 0.35 + Math.random() * 0.5, randomSigned(0.55)).normalize();
        const dustColor = impact.material === 'dirt' ? 0x8f8064 : impact.material === 'wood' ? 0x7d5a37 : 0x9fa8ad;
        this.addParticle(hitPosition, this.tempEffectVelocity.copy(dir).multiplyScalar(30 + Math.random() * 48), dustColor, impact.material === 'dirt' ? 12 : 8, impact.material === 'dirt' ? 0.9 : 0.72, false);
      }

      if (impact.material === 'concrete') {
        for (let i = 0; i < 5; i += 1) {
          const dir = this.tempEffectDirection.set(randomSigned(0.7), 0.2 + Math.random() * 0.65, randomSigned(0.7)).normalize();
          this.addParticle(hitPosition, this.tempEffectVelocity.copy(dir).multiplyScalar(70 + Math.random() * 90), 0xc8c0b5, 4.5, 0.55, true);
        }
      }
    }

    spawnWoodEffects(position) {
      for (let i = 0; i < 12; i += 1) {
        const dir = this.tempEffectDirection.set(randomSigned(0.9), 0.35 + Math.random() * 0.75, randomSigned(0.9)).normalize();
        this.addParticle(position, this.tempEffectVelocity.copy(dir).multiplyScalar(85 + Math.random() * 160), Math.random() > 0.45 ? 0x9a6538 : 0x5b351d, 3.5, 0.65, true);
      }
    }

    spawnGlassEffects(position) {
      for (let i = 0; i < 18; i += 1) {
        const dir = this.tempEffectDirection.set(randomSigned(1), randomSigned(0.7) + 0.45, randomSigned(1)).normalize();
        this.addParticle(position, this.tempEffectVelocity.copy(dir).multiplyScalar(75 + Math.random() * 190), 0xaee8ff, 2.2, 0.72, true);
      }
    }

    spawnDebrisForObject(object, position) {
      const color = object.impactMaterial === 'glass' ? 0x9fd5ff : 0x7b4b27;
      const count = object.impactMaterial === 'glass' ? 10 : 8;

      for (let i = 0; i < count; i += 1) {
        const size = object.impactMaterial === 'glass' ? randomSigned(2) + 5 : randomSigned(4) + 9;
        const effect = this.acquireEffect('debris');
        const mesh = effect.mesh;
        mesh.material.color.setHex(color);
        mesh.material.metalness = object.impactMaterial === 'glass' ? 0.05 : 0.02;
        mesh.material.opacity = 0.88;
        mesh.scale.set(Math.max(2, size), Math.max(2, size * 0.45), Math.max(2, size * 0.8));
        mesh.position.copy(position);
        const groundY = this.world.getGroundHeightAt(position.x, position.z, position.y || 0);
        mesh.position.y = Math.max(groundY + 18, position.y + 16 + Math.random() * 24);
        mesh.rotation.set(randomSigned(Math.PI), randomSigned(Math.PI), randomSigned(Math.PI));
        this.activateEffect(effect, this.tempEffectVelocity.set(randomSigned(110), 90 + Math.random() * 120, randomSigned(110)), 5.5, 340, true);
      }

      this.trimEffects();
    }

    spawnExplosionEffects(position) {
      for (let i = 0; i < 28; i += 1) {
        const dir = this.tempEffectDirection.set(randomSigned(1), randomSigned(0.6) + 0.45, randomSigned(1)).normalize();
        this.addParticle(position, this.tempEffectVelocity.copy(dir).multiplyScalar(180 + Math.random() * 360), Math.random() > 0.45 ? 0xffb13b : 0xff4a24, 7.5, 0.75, true);
      }

      for (let i = 0; i < 18; i += 1) {
        const dir = this.tempEffectDirection.set(randomSigned(0.8), 0.25 + Math.random() * 0.8, randomSigned(0.8)).normalize();
        this.addParticle(position, this.tempEffectVelocity.copy(dir).multiplyScalar(65 + Math.random() * 130), 0x5f6064, 14, 1.35, false);
      }

      const ring = this.acquireEffect('ring');
      ring.mesh.material.opacity = 0.65;
      ring.mesh.scale.set(1, 1, 1);
      ring.mesh.position.copy(position);
      ring.mesh.position.y = 2;
      ring.mesh.rotation.x = -Math.PI / 2;
      this.activateEffect(ring, this.tempEffectVelocity.set(0, 0, 0), 0.42, 0, true);
      this.trimEffects();
    }

    getImpactParticleColor(material, fallback) {
      if (material === 'metal') return Math.random() > 0.35 ? 0xffc75e : 0xffffff;
      if (material === 'concrete') return 0xb8b0a6;
      if (material === 'wood') return 0x8b5a32;
      if (material === 'dirt') return 0x9a8058;
      if (material === 'glass') return 0xaee8ff;
      return fallback;
    }

    spawnBloodEffects(position, part) {
      const origin = this.tempEffectPosition.copy(position);
      origin.y = Math.max(28, origin.y);
      const isHeadshot = part === 'head';
      const isLimb = part === 'leftArm' || part === 'rightArm' || part === 'leftLeg' || part === 'rightLeg';
      const particleCount = isHeadshot ? 16 : isLimb ? 7 : 10;
      const particleSize = isHeadshot ? 3.7 : isLimb ? 2.7 : 3.2;
      const speedBonus = isHeadshot ? 55 : isLimb ? -10 : 0;

      for (let i = 0; i < particleCount; i += 1) {
        const dir = this.tempEffectDirection.set(randomSigned(0.8), randomSigned(0.55) + 0.3, randomSigned(0.8)).normalize();
        this.addParticle(origin, this.tempEffectVelocity.copy(dir).multiplyScalar(45 + speedBonus + Math.random() * 110), isHeadshot ? 0xba101e : 0x8b111d, particleSize, 0.55, true);
      }
    }

    spawnMuzzleSmoke(origin, direction, weapon) {
      const muzzle = this.tempEffectPosition.copy(origin).add(this.tempEffectDirection.copy(direction).multiplyScalar(this.current === 'rifle' ? 82 : 58));
      this.tempMuzzlePoint.copy(muzzle);

      for (let i = 0; i < (this.current === 'rifle' ? 5 : 3); i += 1) {
        const drift = this.tempEffectDirection.copy(direction).multiplyScalar(18 + Math.random() * 25);
        drift.x += randomSigned(20);
        drift.y += 14 + Math.random() * 18;
        drift.z += randomSigned(20);
        this.addParticle(muzzle, this.tempEffectVelocity.copy(drift), 0x9fa8ad, this.current === 'rifle' ? 6.5 : 5.2, 0.55 + Math.random() * 0.25, false);
      }

      const sparkCount = this.current === 'rifle' ? 3 : 2;
      for (let i = 0; i < sparkCount; i += 1) {
        const spark = this.tempEffectDirection.copy(direction);
        spark.x += randomSigned(0.22);
        spark.y += randomSigned(0.18);
        spark.z += randomSigned(0.22);
        this.addParticle(muzzle, this.tempEffectVelocity.copy(spark).normalize().multiplyScalar(160 + Math.random() * 120), this.current === 'rifle' ? 0xff9f5a : 0xffd36b, this.current === 'rifle' ? 2.2 : 2.6, 0.16, false);
      }
    }

    addBulletMark(position, normal, material) {
      const effect = this.acquireEffect('mark');
      const mark = effect.mesh;
      const surfaceNormal = normal && normal.lengthSq() > 0 ? this.tempEffectNormal.copy(normal).normalize() : this.tempEffectNormal.set(0, 1, 0);
      mark.quaternion.setFromUnitVectors(this.tempMarkForward, surfaceNormal);
      mark.position.copy(position).add(surfaceNormal.multiplyScalar(0.9));
      mark.scale.setScalar(8 + Math.random() * 5);
      mark.material.color.setHex(material === 'wood' ? 0x241409 : 0x121212);
      mark.material.opacity = 0.5;
      this.activateEffect(effect, this.tempEffectVelocity.set(0, 0, 0), 8, 0, true);
      this.trimEffects();
    }

    addParticle(position, velocity, color, size, life, gravity) {
      const effect = this.acquireEffect('particle');
      effect.position.copy(position);
      effect.size = size;
      if (this.particleMesh) {
        this.particleMesh.setColorAt(effect.instanceIndex, this.tempEffectColor.setHex(color));
        if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
      }
      this.activateEffect(effect, velocity, life, gravity ? 260 : -6, true);
      this.updateParticleInstance(effect, 1);
      if (this.particleMesh) this.particleMesh.instanceMatrix.needsUpdate = true;
      this.trimEffects();
    }

    updateEffects(dt) {
      let particleMatrixDirty = false;
      for (let i = this.effects.length - 1; i >= 0; i -= 1) {
        const effect = this.effects[i];
        effect.life -= dt;
        effect.velocity.y -= effect.gravity * dt;
        if (effect.kind === 'particle') {
          effect.position.addScaledVector(effect.velocity, dt);
        } else {
          effect.mesh.position.addScaledVector(effect.velocity, dt);
        }

        const groundY = effect.gravity > 0 ? this.getEffectGroundY(effect) : null;
        const effectY = effect.kind === 'particle' ? effect.position.y : effect.mesh.position.y;
        if (groundY !== null && effectY <= groundY) {
          if (effect.kind === 'particle') {
            effect.position.y = groundY;
          } else {
            effect.mesh.position.y = groundY;
          }
          if (Math.abs(effect.velocity.y) > 55) {
            effect.velocity.y = Math.abs(effect.velocity.y) * 0.24;
            effect.velocity.x *= 0.58;
            effect.velocity.z *= 0.58;
          } else {
            effect.velocity.y = 0;
            effect.velocity.x *= 0.42;
            effect.velocity.z *= 0.42;
            effect.gravity = 0;
          }
        }

        if (effect.kind === 'particle') {
          this.updateParticleInstance(effect, effect.fade ? Math.max(0, effect.life / effect.maxLife) : 1);
          particleMatrixDirty = true;
        } else if (effect.fade) {
          effect.mesh.material.opacity = Math.max(0, effect.life / effect.maxLife);
        }

        if (effect.kind === 'ring') {
          const scale = 1 + (1 - effect.life / effect.maxLife) * 8;
          effect.mesh.scale.set(scale, scale, scale);
        }

        if (effect.life <= 0) {
          this.releaseEffect(effect);
          this.effects.splice(i, 1);
        }
      }

      if (particleMatrixDirty && this.particleMesh) {
        this.particleMesh.instanceMatrix.needsUpdate = true;
      }
    }

    updateParticleInstance(effect, lifeScale) {
      if (!this.particleMesh) return;
      const scale = Math.max(0, effect.size * lifeScale);
      this.tempEffectScale.set(scale, scale, scale);
      this.tempEffectMatrix.compose(effect.position, this.tempEffectQuaternion, this.tempEffectScale);
      this.particleMesh.setMatrixAt(effect.instanceIndex, this.tempEffectMatrix);
    }

    getEffectGroundY(effect) {
      if (effect.kind === 'particle') {
        return this.world.getGroundHeightAt(effect.position.x, effect.position.z, effect.position.y) + effect.size * 0.35;
      }

      const mesh = effect.mesh;
      const radius = mesh.geometry && mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.radius : 2;
      if (mesh.geometry && !mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      const safeRadius = mesh.geometry && mesh.geometry.boundingSphere ? mesh.geometry.boundingSphere.radius : radius;
      const scale = Math.max(mesh.scale.x || 1, mesh.scale.y || 1, mesh.scale.z || 1);
      return this.world.getGroundHeightAt(mesh.position.x, mesh.position.z, mesh.position.y) + safeRadius * scale * 0.35;
    }

    trimEffects() {
      while (this.effects.length > 150) {
        const effect = this.effects.shift();
        this.releaseEffect(effect);
      }
    }

    createViewModel() {
      const root = new THREE.Group();
      root.position.set(18, -18, -38);
      root.rotation.set(-0.04, -0.05, 0);
      root.scale.set(92, 92, 92);

      const pistol = this.createPistolModel();
      const rifle = this.createRifleModel();
      const hands = this.createHandsModel();
      root.add(hands.left.group);
      root.add(hands.right.group);
      root.add(pistol.group);
      root.add(rifle.group);

      return { root, pistol, rifle, hands };
    }

    createMaterial(color, roughness, metalness) {
      return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness
      });
    }

    addBox(parent, size, position, material, rotation) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
      mesh.position.set(position.x, position.y, position.z);
      if (rotation) {
        mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    addCylinder(parent, radiusTop, radiusBottom, height, position, material, rotation, segments) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments || 16),
        material
      );
      mesh.position.set(position.x, position.y, position.z);
      if (rotation) {
        mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    createHandsModel() {
      const skin = this.createMaterial(0xb87b5c, 0.66, 0.04);
      const glove = this.createMaterial(0x14191f, 0.72, 0.12);
      const sleeve = this.createMaterial(0x24313c, 0.78, 0.08);

      const left = { group: new THREE.Group() };
      const right = { group: new THREE.Group() };
      left.group.position.set(-0.18, -0.25, -0.28);
      left.group.rotation.set(-0.28, -0.18, 0.18);
      right.group.position.set(0.17, -0.25, -0.08);
      right.group.rotation.set(-0.2, 0.14, -0.16);

      this.addCylinder(left.group, 0.045, 0.052, 0.34, { x: 0, y: 0, z: 0 }, sleeve, { x: Math.PI / 2 }, 14);
      this.addCylinder(left.group, 0.038, 0.042, 0.18, { x: 0.02, y: 0.015, z: -0.2 }, skin, { x: Math.PI / 2 }, 14);
      this.addBox(left.group, { x: 0.08, y: 0.055, z: 0.08 }, { x: 0.03, y: 0.01, z: -0.31 }, glove, { y: 0.08 });

      this.addCylinder(right.group, 0.045, 0.052, 0.32, { x: 0, y: 0, z: 0 }, sleeve, { x: Math.PI / 2 }, 14);
      this.addCylinder(right.group, 0.038, 0.042, 0.16, { x: -0.01, y: 0.016, z: -0.18 }, skin, { x: Math.PI / 2 }, 14);
      this.addBox(right.group, { x: 0.085, y: 0.06, z: 0.085 }, { x: -0.02, y: 0.005, z: -0.28 }, glove, { y: -0.1 });

      left.basePosition = left.group.position.clone();
      right.basePosition = right.group.position.clone();
      left.baseRotation = left.group.rotation.clone();
      right.baseRotation = right.group.rotation.clone();
      return { left, right };
    }

    createPistolModel() {
      const group = new THREE.Group();
      const steel = this.createMaterial(0x171d24, 0.34, 0.55);
      const darkSteel = this.createMaterial(0x0c1117, 0.42, 0.65);
      const grip = this.createMaterial(0x2f211a, 0.78, 0.08);
      const sight = this.createMaterial(0xe8f0f4, 0.42, 0.15);
      const accent = this.createMaterial(0x4c5964, 0.5, 0.35);

      this.addBox(group, { x: 0.13, y: 0.09, z: 0.34 }, { x: 0, y: 0.03, z: -0.21 }, steel);
      this.addBox(group, { x: 0.105, y: 0.018, z: 0.26 }, { x: 0, y: 0.083, z: -0.2 }, accent);
      this.addBox(group, { x: 0.115, y: 0.045, z: 0.22 }, { x: 0, y: -0.025, z: -0.17 }, darkSteel);
      this.addBox(group, { x: 0.105, y: 0.16, z: 0.085 }, { x: 0, y: -0.13, z: -0.065 }, grip, { x: -0.32 });
      this.addBox(group, { x: 0.14, y: 0.03, z: 0.08 }, { x: 0, y: -0.07, z: -0.055 }, accent);
      this.addBox(group, { x: 0.075, y: 0.018, z: 0.09 }, { x: 0, y: -0.043, z: -0.29 }, darkSteel, { x: -0.25 });
      this.addCylinder(group, 0.016, 0.016, 0.08, { x: 0, y: -0.058, z: -0.265 }, darkSteel, { z: Math.PI / 2 }, 12);
      this.addCylinder(group, 0.024, 0.024, 0.28, { x: 0, y: 0.02, z: -0.42 }, darkSteel, { x: Math.PI / 2 }, 18);
      this.addCylinder(group, 0.014, 0.014, 0.3, { x: 0, y: 0.021, z: -0.425 }, this.createMaterial(0x050709, 0.3, 0.75), { x: Math.PI / 2 }, 14);
      this.addBox(group, { x: 0.035, y: 0.018, z: 0.018 }, { x: 0, y: 0.091, z: -0.34 }, sight);
      this.addBox(group, { x: 0.075, y: 0.018, z: 0.018 }, { x: 0, y: 0.092, z: -0.085 }, sight);

      const flash = this.createMuzzleFlash(0.085);
      flash.position.set(0, 0.02, -0.58);
      group.add(flash);
      group.position.set(0.08, -0.02, 0);
      return {
        group,
        flash,
        basePosition: group.position.clone(),
        baseRotation: group.rotation.clone(),
        adsPosition: new THREE.Vector3(0, 0.01, -0.21),
        adsRotation: new THREE.Euler(-0.015, 0, 0)
      };
    }

    createRifleModel() {
      const group = new THREE.Group();
      const receiver = this.createMaterial(0x202a33, 0.45, 0.45);
      const black = this.createMaterial(0x090d12, 0.5, 0.55);
      const rail = this.createMaterial(0x4b5660, 0.42, 0.35);
      const magazine = this.createMaterial(0x151b22, 0.64, 0.32);
      const grip = this.createMaterial(0x2c343c, 0.72, 0.18);
      const glass = this.createMaterial(0x79d1ff, 0.12, 0.05);

      this.addBox(group, { x: 0.16, y: 0.105, z: 0.42 }, { x: 0, y: 0.02, z: -0.25 }, receiver);
      this.addBox(group, { x: 0.12, y: 0.035, z: 0.42 }, { x: 0, y: 0.095, z: -0.25 }, rail);
      this.addBox(group, { x: 0.18, y: 0.024, z: 0.52 }, { x: 0, y: 0.135, z: -0.28 }, black);
      this.addBox(group, { x: 0.12, y: 0.04, z: 0.18 }, { x: 0, y: 0.13, z: -0.58 }, rail);
      this.addCylinder(group, 0.026, 0.026, 0.5, { x: 0, y: 0.025, z: -0.72 }, black, { x: Math.PI / 2 }, 18);
      this.addCylinder(group, 0.039, 0.033, 0.14, { x: 0, y: 0.025, z: -0.49 }, rail, { x: Math.PI / 2 }, 16);
      this.addBox(group, { x: 0.09, y: 0.22, z: 0.11 }, { x: 0, y: -0.13, z: -0.21 }, magazine, { x: -0.18 });
      this.addBox(group, { x: 0.08, y: 0.16, z: 0.08 }, { x: 0, y: -0.12, z: -0.02 }, grip, { x: -0.36 });
      this.addBox(group, { x: 0.18, y: 0.075, z: 0.28 }, { x: 0, y: -0.015, z: 0.08 }, black);
      this.addBox(group, { x: 0.19, y: 0.1, z: 0.15 }, { x: 0, y: 0, z: 0.3 }, black);
      this.addCylinder(group, 0.055, 0.055, 0.13, { x: 0, y: 0.17, z: -0.31 }, black, { z: Math.PI / 2 }, 22);
      this.addCylinder(group, 0.035, 0.035, 0.14, { x: 0, y: 0.17, z: -0.31 }, glass, { z: Math.PI / 2 }, 22);
      this.addBox(group, { x: 0.018, y: 0.055, z: 0.018 }, { x: 0, y: 0.118, z: -0.68 }, rail);

      const flash = this.createMuzzleFlash(0.115);
      flash.position.set(0, 0.025, -1.0);
      group.add(flash);
      group.position.set(0.06, -0.015, 0.12);
      return {
        group,
        flash,
        basePosition: group.position.clone(),
        baseRotation: group.rotation.clone(),
        adsPosition: new THREE.Vector3(0, 0.018, -0.26),
        adsRotation: new THREE.Euler(-0.008, 0, 0)
      };
    }

    createMuzzleFlash(size) {
      const group = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd36b,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });

      const flame = new THREE.Mesh(new THREE.ConeGeometry(size, size * 1.8, 8), material);
      flame.rotation.x = -Math.PI / 2;
      group.add(flame);

      const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.42, 8, 8), material.clone());
      group.add(core);
      group.visible = false;
      return group;
    }

    updateWeaponModelVisibility() {
      this.viewModel.pistol.group.visible = this.current === 'pistol' || this.previousWeapon === 'pistol';
      this.viewModel.rifle.group.visible = this.current === 'rifle' || this.previousWeapon === 'rifle';

      const crosshair = this.crosshairElement;
      if (crosshair) {
        crosshair.classList.toggle('crosshair-rifle', this.current === 'rifle');
        crosshair.classList.toggle('crosshair-pistol', this.current === 'pistol');
        crosshair.classList.toggle('crosshair-ads', this.aimAmount > 0.5);
      }
    }

    kickWeapon() {
      const adsScale = this.aimAmount > 0.7 ? 0.72 : 1;
      const rifle = this.current === 'rifle';
      const heatScale = 1 + Math.min(0.35, this.shotHeat * (rifle ? 0.16 : 0.08));
      this.recoil = Math.min(1, this.recoil + this.weapon.recoilKick * adsScale * heatScale);
      this.recoilLift = Math.min(1, this.recoilLift + this.weapon.recoilLift * (rifle ? 7.8 : 8.9) * adsScale);
      this.recoilYaw = clamp(this.recoilYaw + randomSigned(rifle ? 0.16 : 0.24) + (rifle ? this.shotHeat * 0.025 : 0), -0.8, 0.8);
      this.crosshairKick = Math.min(32, this.crosshairKick + (rifle ? 4.7 + this.shotHeat * 2.2 : 9.5));
      this.muzzleFlashTime = rifle ? 0.045 : 0.062;
      this.muzzleFlashPower = rifle ? 0.95 + Math.random() * 0.42 : 1.2 + Math.random() * 0.55;
      this.activeWeaponView.flash.visible = true;
      this.activeWeaponView.flash.rotation.z = Math.random() * Math.PI;
      this.player.addCameraShake(rifle ? 0.105 + this.shotHeat * 0.025 : 0.19);
      this.player.pitch = clamp(this.player.pitch + this.weapon.recoilLift * (this.aimAmount > 0.7 ? 0.46 : 0.74) * (rifle ? 0.85 + this.shotHeat * 0.18 : 1.18), -1.25, 1.25);
      this.player.yaw += randomSigned(rifle ? 0.0014 : 0.0026) * (this.aimAmount > 0.7 ? 0.55 : 1);
      this.player.updateCamera();
    }

    get activeWeaponView() {
      return this.current === 'pistol' ? this.viewModel.pistol : this.viewModel.rifle;
    }

    updateViewModel(dt) {
      const weapon = this.weapon;
      const active = this.activeWeaponView;
      const aimTarget = this.isAiming && this.reloadEndsAt === 0 ? 1 : 0;
      const aimEase = 1 - Math.exp(-VIEWMODEL.aimSpeed * dt);
      this.aimAmount += (aimTarget - this.aimAmount) * aimEase;
      this.player.aimSlowMultiplier = 1 - this.aimAmount * 0.28;
      this.updateCameraFov(dt);

      this.bobTime += this.player.isMoving ? dt * weapon.bobSpeed * (this.player.isSprinting ? 1.24 : 1) : dt * 3;
      this.breathTime += dt * 1.55;
      this.recoil = Math.max(0, this.recoil - dt * 6.8);
      this.recoilLift = Math.max(0, this.recoilLift - dt * 5.4);
      this.recoilYaw += (0 - this.recoilYaw) * (1 - Math.exp(-7.5 * dt));
      this.shotHeat = Math.max(0, this.shotHeat - dt * (this.current === 'rifle' ? 0.72 : 1.1));
      this.crosshairKick = Math.max(0, this.crosshairKick - dt * 32);
      this.muzzleFlashTime = Math.max(0, this.muzzleFlashTime - dt);
      this.drawTime = Math.max(0, this.drawTime - dt);
      this.swapTime = Math.max(0, this.swapTime - dt);

      const sprintBoost = this.player.isSprinting ? 1.72 : 1;
      const airborneBoost = this.player.isGrounded ? 1 : 1.35;
      const bobStrength = this.player.isMoving
        ? weapon.bobAmount * sprintBoost * airborneBoost * (1 - this.aimAmount * 0.72)
        : weapon.bobAmount * 0.12 * (1 - this.aimAmount * 0.45);
      const breath = this.player.isMoving ? 0 : Math.sin(this.breathTime) * 0.008 * (1 - this.aimAmount * 0.55);
      const bobX = Math.sin(this.bobTime) * bobStrength;
      const bobY = Math.abs(Math.cos(this.bobTime * 0.5)) * bobStrength + breath;
      const recoilBack = this.recoil * (this.current === 'rifle' ? 0.24 : 0.28);
      const recoilUp = this.recoil * weapon.recoilLift;
      const drawProgress = this.drawTime > 0 ? this.drawTime / VIEWMODEL.swapDuration : 0;
      const reloadProgress = this.reloadEndsAt > 0
        ? 1 - Math.max(0, (this.reloadEndsAt - performance.now()) / Math.max(1, weapon.reloadTime))
        : 0;
      const reloadDip = this.reloadEndsAt > 0 ? Math.sin(reloadProgress * Math.PI) * 0.22 : 0;
      const reloadRoll = this.reloadEndsAt > 0 ? Math.sin(reloadProgress * Math.PI * 2) * 0.28 : 0;
      const reloadSide = this.reloadEndsAt > 0 ? Math.sin(reloadProgress * Math.PI) * (this.current === 'rifle' ? -0.12 : -0.07) : 0;
      const drawDip = drawProgress * drawProgress * 0.36;
      const targetPosition = this.tempViewPosition.copy(active.basePosition).lerp(active.adsPosition, this.aimAmount);
      const targetRotation = this.tempViewRotation.set(
        active.baseRotation.x + (active.adsRotation.x - active.baseRotation.x) * this.aimAmount,
        active.baseRotation.y + (active.adsRotation.y - active.baseRotation.y) * this.aimAmount,
        active.baseRotation.z + (active.adsRotation.z - active.baseRotation.z) * this.aimAmount
      );

      active.group.position.set(
        targetPosition.x + bobX + reloadSide,
        targetPosition.y + bobY - recoilUp - reloadDip - drawDip,
        targetPosition.z + recoilBack + drawDip * 0.65
      );
      active.group.rotation.set(
        targetRotation.x - this.recoil * 0.28 - this.recoilLift * 0.08 - drawProgress * 0.42,
        targetRotation.y + bobX * 0.55 + this.recoilYaw * 0.05,
        targetRotation.z + Math.sin(this.bobTime * 0.5) * bobStrength * 0.7 + reloadRoll
      );

      this.updateHands(bobX, bobY, reloadDip, reloadRoll, recoilBack);
      this.updateSwapVisibility(drawProgress);
      this.updateDynamicCrosshair();

      active.flash.visible = this.muzzleFlashTime > 0;
      if (active.flash.visible) {
        const flashScale = (0.72 + Math.random() * 0.42) * (this.muzzleFlashPower || 1);
        active.flash.scale.set(flashScale, flashScale, flashScale);
      }
    }

    updateCameraFov(dt) {
      const targetFov = VIEWMODEL.baseFov + (VIEWMODEL.adsFov - VIEWMODEL.baseFov) * this.aimAmount;
      this.player.camera.fov += (targetFov - this.player.camera.fov) * (1 - Math.exp(-10 * dt));
      this.player.camera.updateProjectionMatrix();
    }

    updateHands(bobX, bobY, reloadDip, reloadRoll, recoilBack) {
      const { left, right } = this.viewModel.hands;
      const aimTuck = this.aimAmount * 0.09;
      left.group.position.set(left.basePosition.x - aimTuck * 0.35 + bobX * 0.5, left.basePosition.y + bobY * 0.6 - reloadDip * 0.45, left.basePosition.z - aimTuck + recoilBack * 0.52);
      right.group.position.set(right.basePosition.x + aimTuck * 0.18 + bobX * 0.45, right.basePosition.y + bobY * 0.45 - reloadDip * 0.25, right.basePosition.z - aimTuck * 0.5 + recoilBack * 0.7);
      left.group.rotation.set(left.baseRotation.x - reloadDip * 1.1, left.baseRotation.y - this.aimAmount * 0.12, left.baseRotation.z + reloadRoll * 0.42);
      right.group.rotation.set(right.baseRotation.x - this.recoil * 0.18, right.baseRotation.y + this.aimAmount * 0.08, right.baseRotation.z - reloadRoll * 0.28);
    }

    updateSwapVisibility(drawProgress) {
      if (!this.previousWeapon || this.swapTime <= 0) {
        this.previousWeapon = null;
        this.updateWeaponModelVisibility();
        return;
      }

      const previous = this.previousWeapon === 'pistol' ? this.viewModel.pistol : this.viewModel.rifle;
      const previousProgress = 1 - this.swapTime / VIEWMODEL.swapDuration;
      previous.group.visible = true;
      previous.group.position.y = previous.basePosition.y - previousProgress * previousProgress * 0.42;
      previous.group.rotation.x = previous.baseRotation.x - previousProgress * 0.55;
      this.updateWeaponModelVisibility();
    }

    updateDynamicCrosshair() {
      const crosshair = this.crosshairElement;
      if (!crosshair) return;

      const movement = this.player.isMoving ? (this.player.isSprinting ? 13 : 6) : 0;
      const airborne = this.player.isGrounded ? 0 : 12;
      const shotKick = this.crosshairKick * (this.aimAmount > 0.55 ? 0.62 : 1);
      const heat = this.current === 'rifle' ? this.shotHeat * 0.1 : this.shotHeat * 0.035;
      const scale = clamp(1 + (movement + airborne + shotKick) * 0.018 + heat - this.aimAmount * 0.12, 0.82, 1.72).toFixed(3);
      crosshair.style.setProperty('--crosshair-scale', scale);
      crosshair.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
      crosshair.classList.toggle('crosshair-ads', this.aimAmount > 0.5);
    }

    getSpreadMultiplier() {
      let multiplier = 1;
      if (this.player.isMoving) multiplier *= this.player.isSprinting ? 1.55 : 1.16;
      if (!this.player.isGrounded) multiplier *= 1.45;
      if (this.player.isCrouching) multiplier *= 0.86;
      multiplier *= 1 - this.aimAmount * 0.58;
      multiplier += this.crosshairKick * 0.012;
      multiplier += this.current === 'rifle' ? this.shotHeat * 0.16 : this.shotHeat * 0.035;
      return Math.max(0.28, multiplier);
    }
  }

  window.WeaponSystem = WeaponSystem;
})();
