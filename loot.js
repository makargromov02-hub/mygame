(function () {
  'use strict';

  const LOOT = {
    pickupRadius: 54,
    maxItems: 38,
    autoPickup: false,
    health: { amount: 35, color: 0xff5d67 },
    armor: { amount: 35, color: 0x65b7ff },
    ammoPistol: { amount: 24, color: 0xf7df72 },
    ammoRifle: { amount: 60, color: 0xff9f5a }
  };

  class LootSystem {
    constructor(scene, world, player, weapons, audio, elements) {
      this.scene = scene;
      this.world = world;
      this.player = player;
      this.weapons = weapons;
      this.audio = audio;
      this.elements = elements || {};
      this.items = [];
      this.nextId = 1;
      this.autoPickup = LOOT.autoPickup;
      this.sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
      this.sharedGeometry.userData.sharedLootResource = true;
      this.sharedMaterials = {
        health: this.createSharedMaterial(LOOT.health.color),
        armor: this.createSharedMaterial(LOOT.armor.color),
        ammoPistol: this.createSharedMaterial(LOOT.ammoPistol.color),
        ammoRifle: this.createSharedMaterial(LOOT.ammoRifle.color),
        band: new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.7 })
      };
      this.sharedMaterials.band.userData.sharedLootResource = true;
      this.spawnInitialLoot();
    }

    createSharedMaterial(color) {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.42,
        metalness: 0.08,
        emissive: color,
        emissiveIntensity: 0.16
      });
      material.userData.sharedLootResource = true;
      return material;
    }

    spawnInitialLoot() {
      const types = ['health', 'armor', 'ammoPistol', 'ammoRifle'];
      for (let i = 0; i < 16; i += 1) {
        const point = this.world.findFreePosition(24, this.player);
        this.spawn(types[i % types.length], point.x, point.z);
      }
    }

    reset() {
      this.clear();
      this.spawnInitialLoot();
    }

    spawnRandomNear(x, z, chance) {
      if (Math.random() > chance) return;
      const types = ['health', 'armor', 'ammoPistol', 'ammoRifle'];
      const type = types[Math.floor(Math.random() * types.length)];
      this.spawn(type, x + (Math.random() - 0.5) * 36, z + (Math.random() - 0.5) * 36);
    }

    spawnFromNpc(npc) {
      if (!npc || Math.random() > 0.45) return;
      this.spawnRandomNear(npc.x, npc.z, 1);
    }

    spawnFromCrate(object) {
      if (!object || Math.random() > 0.55) return;
      const x = object.shape === 'rect' ? object.x + object.w / 2 : object.x;
      const z = object.shape === 'rect' ? object.y + object.h / 2 : object.y;
      this.spawnRandomNear(x, z, 1);
    }

    spawnWaveRewards(count) {
      const types = ['health', 'armor', 'ammoPistol', 'ammoRifle'];
      for (let i = 0; i < count; i += 1) {
        const point = this.world.findFreePosition(24, this.player);
        this.spawn(types[Math.floor(Math.random() * types.length)], point.x, point.z);
      }
    }

    spawn(type, x, z) {
      const config = LOOT[type];
      if (!config) return null;

      const mesh = this.createMesh(type, config.color);
      mesh.position.set(x, this.world.getGroundHeightAt(x, z, 0) + 22, z);
      this.scene.add(mesh);

      const item = {
        id: this.nextId,
        type,
        mesh,
        spawnY: mesh.position.y,
        spin: Math.random() * Math.PI * 2,
        collectTime: 0
      };
      this.nextId += 1;
      this.items.push(item);
      this.trimItems();
      return item;
    }

    createMesh(type, color) {
      const group = new THREE.Group();
      const material = this.sharedMaterials[type] || this.createSharedMaterial(color);

      if (type === 'health') {
        group.add(this.box({ x: 30, y: 12, z: 20 }, material));
        group.add(this.box({ x: 12, y: 12, z: 32 }, material));
      } else if (type === 'armor') {
        const vest = this.box({ x: 28, y: 30, z: 12 }, material);
        vest.scale.set(1, 1, 0.8);
        group.add(vest);
      } else {
        group.add(this.box({ x: 30, y: 18, z: 24 }, material));
        const band = this.box({ x: 34, y: 4, z: 28 }, this.sharedMaterials.band);
        band.position.y = 4;
        group.add(band);
      }

      const glow = new THREE.PointLight(color, 0.45, 120, 2);
      glow.position.set(0, 18, 0);
      group.add(glow);
      return group;
    }

    box(size, material) {
      const mesh = new THREE.Mesh(this.sharedGeometry, material);
      mesh.scale.set(size.x, size.y, size.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    update(dt, now) {
      let nearest = null;
      let nearestDistance = Infinity;

      // Предметы проверяют только игрока: NPC лут не подбирают и не блокируются им.
      for (let i = this.items.length - 1; i >= 0; i -= 1) {
        const item = this.items[i];
        item.spin += dt * 3;
        item.mesh.rotation.y = item.spin;
        item.mesh.position.y = item.spawnY + Math.sin(item.spin * 1.8) * 5;

        if (item.collectTime > 0) {
          this.updateCollectAnimation(item, dt, i);
          continue;
        }

        const distance = Math.hypot(item.mesh.position.x - this.player.x, item.mesh.position.z - this.player.z);
        const vertical = Math.abs(item.mesh.position.y - this.player.y) < 95;
        if (distance < nearestDistance && vertical && this.canCollect(item)) {
          nearest = item;
          nearestDistance = distance;
        }
      }

      if (nearest && nearestDistance <= LOOT.pickupRadius && this.autoPickup) {
        this.collect(nearest);
      }

      this.updatePrompt(nearest && nearestDistance <= LOOT.pickupRadius ? nearest : null);
    }

    updateCollectAnimation(item, dt, index) {
      item.collectTime -= dt;
      item.mesh.scale.multiplyScalar(0.88);
      item.mesh.position.y += dt * 55;

      if (item.collectTime <= 0) {
        this.disposeItem(index);
      }
    }

    tryCollectNearest() {
      let nearest = null;
      let nearestDistance = Infinity;

      for (const item of this.items) {
        if (item.collectTime > 0 || !this.canCollect(item)) continue;
        const distance = Math.hypot(item.mesh.position.x - this.player.x, item.mesh.position.z - this.player.z);
        const vertical = Math.abs(item.mesh.position.y - this.player.y) < 95;
        if (!vertical) continue;
        if (distance < nearestDistance) {
          nearest = item;
          nearestDistance = distance;
        }
      }

      if (!nearest || nearestDistance > LOOT.pickupRadius) return false;
      return this.collect(nearest);
    }

    canCollect(item) {
      if (item.type === 'health') return this.player.health < this.player.maxHealth;
      if (item.type === 'armor') return this.player.armor < this.player.maxArmor;
      return true;
    }

    collect(item) {
      if (!item || item.collectTime > 0 || !this.canCollect(item)) return false;

      // Патроны разделены по оружию, поэтому коробки пополняют только свой тип боезапаса.
      if (item.type === 'health') this.player.addHealth(LOOT.health.amount);
      if (item.type === 'armor') this.player.addArmor(LOOT.armor.amount);
      if (item.type === 'ammoPistol') this.weapons.addAmmoFor('pistol', LOOT.ammoPistol.amount);
      if (item.type === 'ammoRifle') this.weapons.addAmmoFor('rifle', LOOT.ammoRifle.amount);

      item.collectTime = 0.18;
      if (this.audio && this.audio.playPickup) this.audio.playPickup(item.type);
      this.updatePrompt(null);
      return true;
    }

    updatePrompt(item) {
      if (!this.elements.pickupPrompt) return;
      if (!item || this.autoPickup) {
        this.elements.pickupPrompt.classList.add('hidden');
        return;
      }

      this.elements.pickupPrompt.textContent = 'Нажмите E чтобы подобрать';
      this.elements.pickupPrompt.classList.remove('hidden');
    }

    clear() {
      for (let i = this.items.length - 1; i >= 0; i -= 1) {
        this.disposeItem(i);
      }
      this.updatePrompt(null);
    }

    disposeItem(index) {
      const item = this.items[index];
      if (!item) return;
      this.scene.remove(item.mesh);
      item.mesh.traverse((child) => {
        if (child.geometry && !child.geometry.userData.sharedLootResource) child.geometry.dispose();
        if (child.material && !child.material.userData.sharedLootResource) child.material.dispose();
      });
      this.items.splice(index, 1);
    }

    trimItems() {
      while (this.items.length > LOOT.maxItems) {
        this.disposeItem(0);
      }
    }
  }

  window.LootSystem = LootSystem;
})();
