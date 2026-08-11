(function () {
  'use strict';

  const STORAGE_KEY = 'canvasArena3d.records';
  const MONEY_PER_KILL = 85;
  const MAX_SURVIVAL_NPCS = 28;

  const WAVE_EVENTS = [
    {
      id: 'patrol',
      title: 'Патруль',
      short: 'ПАТРУЛЬ',
      description: 'Сбалансированная группа противников.',
      roles: { assault: 1, rifleman: 3, sniper: 0, heavy: 0, commander: 0 },
      countBonus: 0,
      health: 1,
      speed: 1,
      accuracy: 1,
      reaction: 1,
      reward: 1
    },
    {
      id: 'rush',
      title: 'Штурмовая волна',
      short: 'ШТУРМ',
      description: 'Больше быстрых штурмовиков, меньше времени на прицеливание.',
      roles: { assault: 4, rifleman: 2, sniper: 0, heavy: 0, commander: 0 },
      countBonus: 1,
      health: 0.94,
      speed: 1.12,
      accuracy: 1.04,
      reaction: 0.88,
      reward: 1.08
    },
    {
      id: 'marksmen',
      title: 'Дальняя дуэль',
      short: 'СТРЕЛКИ',
      description: 'Стрелки и снайперы держат дистанцию и стреляют точнее.',
      roles: { assault: 0, rifleman: 4, sniper: 2, heavy: 0, commander: 0 },
      countBonus: -1,
      health: 0.98,
      speed: 0.96,
      accuracy: 0.78,
      reaction: 0.96,
      reward: 1.16
    },
    {
      id: 'heavy',
      title: 'Тяжёлая группа',
      short: 'ТЯЖЁЛЫЕ',
      description: 'Меньше противников, но больше подавляющего огня.',
      roles: { assault: 1, rifleman: 2, sniper: 0, heavy: 2, commander: 0 },
      countBonus: -1,
      health: 1.13,
      speed: 0.94,
      accuracy: 0.94,
      reaction: 1.04,
      reward: 1.18
    },
    {
      id: 'command',
      title: 'Командная группа',
      short: 'КОМАНДИР',
      description: 'Командир координирует союзников, волна лучше держит позиции.',
      roles: { assault: 2, rifleman: 3, sniper: 1, heavy: 1, commander: 1 },
      countBonus: 0,
      health: 1.06,
      speed: 1.02,
      accuracy: 0.88,
      reaction: 0.9,
      reward: 1.24
    }
  ];

  const SHOP_ITEMS = [
    { id: 'health', title: 'Аптечка', price: 105, description: '+45 здоровья' },
    { id: 'armor', title: 'Броня', price: 125, description: '+45 брони' },
    { id: 'ammo', title: 'Боекомплект', price: 105, description: '+30 пистолет / +90 автомат' },
    { id: 'fullAmmo', title: 'Полный боезапас', price: 240, description: 'Пополнить оба оружия до максимума' },
    { id: 'pistol', title: 'Пистолет', price: 160, description: 'Полный магазин и запас' },
    { id: 'rifle', title: 'Автомат', price: 280, description: 'Полный магазин и запас' },
    { id: 'shotgun', title: 'Дробовик', price: 420, description: 'Куплен для арсенала режима' },
    { id: 'sniper', title: 'Снайперская винтовка', price: 520, description: 'Куплена для арсенала режима' },
    { id: 'grenades', title: 'Гранаты', price: 260, description: '+2 гранаты в инвентарь режима' },
    { id: 'maxHealth', title: '+20 здоровья', price: 220, description: 'Увеличить максимум здоровья', max: 5 },
    { id: 'maxArmor', title: '+20 брони', price: 220, description: 'Увеличить максимум брони', max: 5 },
    { id: 'sprint', title: 'Более быстрый бег', price: 260, description: '+8% к бегу', max: 4 },
    { id: 'reload', title: 'Более быстрая перезарядка', price: 300, description: '-10% ко времени перезарядки', max: 4 },
    { id: 'spread', title: 'Меньший разброс', price: 320, description: '-10% к разбросу', max: 4 },
    { id: 'magazine', title: 'Увеличенный магазин', price: 360, description: '+4 пистолет / +8 автомат', max: 4 }
  ];

  class GameModeSystem {
    constructor(scene, player, weapons, npcs, world, elements) {
      this.scene = scene;
      this.player = player;
      this.weapons = weapons;
      this.npcs = npcs;
      this.world = world;
      this.elements = elements;
      this.mode = 'free';
      this.paused = false;
      this.defeated = false;
      this.wave = 1;
      this.waveInProgress = false;
      this.shopOpen = false;
      this.money = 0;
      this.earnedMoney = 0;
      this.nextWaveAt = 0;
      this.survivalStartAt = 0;
      this.lastKillCount = 0;
      this.currentStreak = 0;
      this.bestStreak = 0;
      this.currentWavePlan = null;
      this.currentKillReward = MONEY_PER_KILL;
      this.lastWaveReward = 0;
      this.pickups = [];
      this.lootSystem = null;
      this.baseSystem = null;
      this.inventory = { shotgun: false, sniper: false, grenades: 0 };
      this.upgrades = { maxHealth: 0, maxArmor: 0, sprint: 0, reload: 0, spread: 0, magazine: 0 };
      this.baseStats = this.captureBaseStats();
      this.records = this.loadRecords();
      this.bindUi();
      this.renderShop();
      this.updateSurvivalHud(performance.now());
      this.hideSurvivalHud();
    }

    setLootSystem(lootSystem) {
      this.lootSystem = lootSystem;
    }

    setBaseSystem(baseSystem) {
      this.baseSystem = baseSystem;
    }

    captureBaseStats() {
      return {
        playerMaxHealth: this.player.maxHealth,
        playerMaxArmor: this.player.maxArmor,
        sprintMultiplier: window.GameConfig.PLAYER.sprintMultiplier,
        pistolReload: window.GameConfig.WEAPONS.pistol.reloadTime,
        rifleReload: window.GameConfig.WEAPONS.rifle.reloadTime,
        pistolSpread: window.GameConfig.WEAPONS.pistol.spread,
        rifleSpread: window.GameConfig.WEAPONS.rifle.spread,
        pistolMagazine: window.GameConfig.WEAPONS.pistol.magazineSize,
        rifleMagazine: window.GameConfig.WEAPONS.rifle.magazineSize
      };
    }

    bindUi() {
      this.elements.modeButton.addEventListener('click', () => this.showModeDialog());
      this.elements.freeModeButton.addEventListener('click', () => this.startFreePlay());
      this.elements.survivalModeButton.addEventListener('click', () => this.startSurvival());
      this.elements.retryButton.addEventListener('click', () => this.startSurvival());
      this.elements.mainMenuButton.addEventListener('click', () => this.showMainMenu());

      if (this.elements.nextWaveButton) {
        this.elements.nextWaveButton.addEventListener('click', () => this.startNextWaveFromShop());
      }

      if (this.elements.shopItems) {
        this.elements.shopItems.addEventListener('click', (event) => {
          const button = event.target.closest('[data-shop-item]');
          if (!button) return;
          this.buyItem(button.dataset.shopItem);
        });
      }
    }

    togglePause() {
      if (this.defeated || this.shopOpen) return;
      this.paused = !this.paused;
      this.elements.tabMenu.classList.toggle('hidden', !this.paused);
      this.elements.modeDialog.classList.add('hidden');

      if (this.paused && document.pointerLockElement) {
        document.exitPointerLock();
      }
    }

    showModeDialog() {
      this.elements.modeDialog.classList.remove('hidden');
    }

    closeMenus() {
      this.paused = false;
      this.elements.tabMenu.classList.add('hidden');
      this.elements.modeDialog.classList.add('hidden');
      this.hideShop();
    }

    startFreePlay() {
      this.mode = 'free';
      this.defeated = false;
      this.waveInProgress = false;
      this.money = 0;
      this.earnedMoney = 0;
      this.currentWavePlan = null;
      this.currentKillReward = MONEY_PER_KILL;
      this.lastWaveReward = 0;
      this.restoreBaseProgression();
      this.closeMenus();
      this.hideDefeat();
      this.hideSurvivalHud();
      this.clearPickups();
      this.resetPlayerAndWeapons();
      if (this.lootSystem) this.lootSystem.reset();
      this.npcs.kills = 0;
      this.lastKillCount = 0;
      this.npcs.resetFreePlay();
      if (this.baseSystem) this.baseSystem.reset();
      this.updateMoneyHud();
    }

    startSurvival() {
      this.mode = 'survival';
      this.defeated = false;
      this.waveInProgress = false;
      this.money = 0;
      this.earnedMoney = 0;
      this.lastKillCount = 0;
      this.currentStreak = 0;
      this.bestStreak = 0;
      this.wave = 1;
      this.survivalStartAt = performance.now();
      this.currentWavePlan = null;
      this.currentKillReward = MONEY_PER_KILL;
      this.lastWaveReward = 0;
      this.restoreBaseProgression();
      this.closeMenus();
      this.hideDefeat();
      this.clearPickups();
      this.resetPlayerAndWeapons();
      if (this.lootSystem) this.lootSystem.reset();
      this.npcs.kills = 0;
      if (this.baseSystem) this.baseSystem.setActive(false);
      this.showSurvivalHud();
      this.updateMoneyHud();
      this.spawnWave();
    }

    resetPlayerAndWeapons() {
      this.player.reset();
      this.applyUpgradeStats();
      this.weapons.reset();
      this.applyUpgradeStats();
    }

    restoreBaseProgression() {
      this.inventory = { shotgun: false, sniper: false, grenades: 0 };
      this.upgrades = { maxHealth: 0, maxArmor: 0, sprint: 0, reload: 0, spread: 0, magazine: 0 };
      this.applyUpgradeStats();
    }

    applyUpgradeStats() {
      const weaponConfig = window.GameConfig.WEAPONS;
      const playerConfig = window.GameConfig.PLAYER;
      const reloadMultiplier = Math.pow(0.9, this.upgrades.reload);
      const spreadMultiplier = Math.pow(0.9, this.upgrades.spread);

      this.player.maxHealth = this.baseStats.playerMaxHealth + this.upgrades.maxHealth * 20;
      this.player.maxArmor = this.baseStats.playerMaxArmor + this.upgrades.maxArmor * 20;
      this.player.health = Math.min(this.player.health, this.player.maxHealth);
      this.player.armor = Math.min(this.player.armor, this.player.maxArmor);
      playerConfig.sprintMultiplier = this.baseStats.sprintMultiplier + this.upgrades.sprint * 0.08;
      weaponConfig.pistol.reloadTime = Math.max(420, this.baseStats.pistolReload * reloadMultiplier);
      weaponConfig.rifle.reloadTime = Math.max(620, this.baseStats.rifleReload * reloadMultiplier);
      weaponConfig.pistol.spread = Math.max(0.004, this.baseStats.pistolSpread * spreadMultiplier);
      weaponConfig.rifle.spread = Math.max(0.012, this.baseStats.rifleSpread * spreadMultiplier);
      weaponConfig.pistol.magazineSize = this.baseStats.pistolMagazine + this.upgrades.magazine * 4;
      weaponConfig.rifle.magazineSize = this.baseStats.rifleMagazine + this.upgrades.magazine * 8;

      if (this.weapons && this.weapons.ammo) {
        this.weapons.ammo.pistol.magazine = Math.min(this.weapons.ammo.pistol.magazine, weaponConfig.pistol.magazineSize);
        this.weapons.ammo.rifle.magazine = Math.min(this.weapons.ammo.rifle.magazine, weaponConfig.rifle.magazineSize);
        this.weapons.updateHud(performance.now());
      }
    }

    update(dt, now) {
      if (this.defeated) return;
      this.updateKillStreak();
      this.updatePickups(dt);

      if (this.mode !== 'survival') return;

      this.updateSurvivalHud(now);

      if (this.player.health <= 0) {
        this.handleDefeat(now);
        return;
      }

      if (this.waveInProgress && this.npcs.aliveCount() === 0) {
        this.completeWave();
      }
    }

    updateKillStreak() {
      const kills = this.npcs.kills;
      if (kills <= this.lastKillCount) return;

      const gained = kills - this.lastKillCount;
      this.currentStreak += gained;
      this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
      this.lastKillCount = kills;

      if (this.mode === 'survival') {
        const reward = gained * (this.currentKillReward || MONEY_PER_KILL);
        this.money += reward;
        this.earnedMoney += reward;
        this.updateMoneyHud();
      }
    }

    spawnWave() {
      this.paused = false;
      this.shopOpen = false;
      this.waveInProgress = true;
      this.nextWaveAt = 0;
      this.currentStreak = 0;
      this.hideShop();
      this.currentWavePlan = this.createWavePlan(this.wave);
      this.currentKillReward = this.currentWavePlan.killReward;
      this.showWaveBanner();

      this.npcs.spawnWave(this.currentWavePlan.count, this.currentWavePlan.stats);
      this.updateSurvivalHud(performance.now());
    }

    createWavePlan(wave) {
      const tier = Math.floor((wave - 1) / 3);
      const event = this.getWaveEvent(wave);
      const baseCount = 5 + Math.floor((wave - 1) * 1.55) + event.countBonus;
      const count = Math.max(4, Math.min(MAX_SURVIVAL_NPCS, baseCount));
      const pressure = Math.min(1, (wave - 1) / 16);
      const healthScale = event.health * (1 + tier * 0.08 + (wave - 1) * 0.025);
      const speedScale = event.speed * (1 + pressure * 0.22);
      const accuracyScale = event.accuracy * Math.max(0.58, 1 - (wave - 1) * 0.028);
      const reactionScale = event.reaction * Math.max(0.58, 1 - (wave - 1) * 0.026);
      const roles = this.buildWaveRoles(count, event, wave);
      const killReward = Math.round((MONEY_PER_KILL + wave * 7) * event.reward);
      const completionReward = Math.round((180 + wave * 52 + count * 12) * event.reward);

      return {
        wave,
        event,
        count,
        roles,
        killReward,
        completionReward,
        stats: {
          maxHealth: window.GameConfig.NPC.maxHealth * healthScale,
          speed: window.GameConfig.NPC.speed * speedScale,
          bulletSpread: Math.max(0.013, window.GameConfig.NPC.bulletSpread * accuracyScale),
          visionRange: window.GameConfig.NPC.visionRange * (1 + Math.min(0.22, wave * 0.012)),
          reactionMultiplier: reactionScale,
          roleKeys: roles
        }
      };
    }

    getWaveEvent(wave) {
      if (wave <= 2) return WAVE_EVENTS[0];
      if (wave % 7 === 0) return WAVE_EVENTS[4];
      if (wave % 5 === 0) return WAVE_EVENTS[3];
      if (wave % 4 === 0) return WAVE_EVENTS[2];
      if (wave % 3 === 0) return WAVE_EVENTS[1];
      return WAVE_EVENTS[0];
    }

    buildWaveRoles(count, event, wave) {
      const weights = Object.assign({}, event.roles);
      if (wave >= 6) weights.heavy += 0.6;
      if (wave >= 8) weights.sniper += 0.55;
      if (wave >= 10) weights.commander += 0.35;
      const entries = Object.keys(weights).filter((key) => weights[key] > 0);
      const roles = [];

      if (event.id === 'command' && count > 0) roles.push('commander');
      if (event.id === 'heavy' && count > 1) roles.push('heavy');
      if (event.id === 'marksmen' && count > 1) roles.push('sniper');

      while (roles.length < count) {
        roles.push(this.pickWeightedRole(entries, weights, wave + roles.length * 17));
      }

      return roles.slice(0, count);
    }

    pickWeightedRole(entries, weights, salt) {
      let total = 0;
      for (const key of entries) total += weights[key];
      let roll = ((Math.sin(salt * 12.9898) * 43758.5453) % 1 + 1) % 1 * total;
      for (const key of entries) {
        roll -= weights[key];
        if (roll <= 0) return key;
      }
      return entries[0] || 'rifleman';
    }

    completeWave() {
      this.waveInProgress = false;
      const reward = this.currentWavePlan ? this.currentWavePlan.completionReward : 180 + this.wave * 45;
      const flawlessBonus = this.player.health >= this.player.maxHealth * 0.82 ? Math.round(reward * 0.2) : 0;
      this.lastWaveReward = reward + flawlessBonus;
      this.money += this.lastWaveReward;
      this.earnedMoney += this.lastWaveReward;
      this.updateMoneyHud();
      this.spawnRewards();
      this.openShop('Волна ' + this.wave + ' завершена. Награда: +' + this.lastWaveReward + (flawlessBonus ? ' (бонус за здоровье)' : ''));
    }

    openShop(message) {
      this.paused = true;
      this.shopOpen = true;
      if (document.pointerLockElement) document.exitPointerLock();
      if (this.elements.shopScreen) this.elements.shopScreen.classList.remove('hidden');
      if (this.elements.shopMessage) this.elements.shopMessage.textContent = this.buildShopMessage(message);
      this.renderShop();
      this.updateSurvivalHud(performance.now());
    }

    buildShopMessage(message) {
      const nextPlan = this.createWavePlan(this.wave + 1);
      const prefix = message ? message + '  ' : '';
      return prefix + 'Следующая: ' + nextPlan.event.title + ', врагов: ' + nextPlan.count + ', награда за убийство: +' + nextPlan.killReward + '.';
    }

    hideShop() {
      this.shopOpen = false;
      if (this.elements.shopScreen) this.elements.shopScreen.classList.add('hidden');
      if (this.elements.shopMessage) this.elements.shopMessage.textContent = '';
      this.updateSurvivalHud(performance.now());
    }

    startNextWaveFromShop() {
      if (this.mode !== 'survival' || this.defeated) return;
      this.wave += 1;
      this.spawnWave();
    }

    showWaveBanner() {
      if (!this.elements.waveBanner) return;
      const label = this.currentWavePlan ? ' · ' + this.currentWavePlan.event.short : '';
      this.elements.waveBanner.textContent = 'ВОЛНА ' + this.wave + label;
      this.elements.waveBanner.classList.remove('hidden');
      this.elements.waveBanner.style.animation = 'none';
      this.elements.waveBanner.offsetHeight;
      this.elements.waveBanner.style.animation = '';
      window.setTimeout(() => {
        if (this.elements.waveBanner) this.elements.waveBanner.classList.add('hidden');
      }, 1800);
    }

    renderShop() {
      if (!this.elements.shopItems) return;
      if (this.elements.shopMoney) this.elements.shopMoney.textContent = '💵 ' + this.money;

      this.elements.shopItems.innerHTML = SHOP_ITEMS.map((item) => {
        const owned = this.isOwned(item.id);
        const price = this.getShopItemPrice(item);
        const level = this.getUpgradeLevel(item.id);
        const levelText = item.max ? ' · ур. ' + level + '/' + item.max : '';
        const disabled = owned || this.money < price;
        const buttonText = owned ? (item.max ? 'Максимум' : 'Куплено') : 'Купить за ' + price;
        return '<article class="shop-item">'
          + '<strong>' + item.title + '</strong>'
          + '<small>' + item.description + levelText + '</small>'
          + '<button type="button" data-shop-item="' + item.id + '"' + (disabled ? ' disabled' : '') + '>' + buttonText + '</button>'
          + '</article>';
      }).join('');
    }

    getUpgradeLevel(id) {
      return this.upgrades[id] || 0;
    }

    getShopItemPrice(item) {
      const level = this.getUpgradeLevel(item.id);
      if (!item.max) return item.price;
      return Math.round(item.price * Math.pow(1.32, level));
    }

    isOwned(id) {
      const item = SHOP_ITEMS.find((entry) => entry.id === id);
      if (item && item.max) return this.getUpgradeLevel(id) >= item.max;
      return (id === 'shotgun' && this.inventory.shotgun)
        || (id === 'sniper' && this.inventory.sniper);
    }

    buyItem(id) {
      const item = SHOP_ITEMS.find((entry) => entry.id === id);
      if (!item || this.isOwned(id)) return;
      const price = this.getShopItemPrice(item);
      if (this.money < price) return;

      this.money -= price;
      this.applyPurchase(id);
      this.updateMoneyHud();
      this.renderShop();
      if (this.elements.shopMessage) this.elements.shopMessage.textContent = item.title + ' куплено. ' + this.buildShopMessage('');
    }

    applyPurchase(id) {
      if (id === 'health') {
        this.player.addHealth(45);
      } else if (id === 'armor') {
        this.player.addArmor(45);
      } else if (id === 'ammo') {
        this.weapons.addAmmoFor('pistol', 30);
        this.weapons.addAmmoFor('rifle', 90);
      } else if (id === 'fullAmmo') {
        this.weapons.ammo.pistol.reserve = Math.max(this.weapons.ammo.pistol.reserve, window.GameConfig.WEAPONS.pistol.reserveAmmo);
        this.weapons.ammo.rifle.reserve = Math.max(this.weapons.ammo.rifle.reserve, window.GameConfig.WEAPONS.rifle.reserveAmmo);
        this.weapons.ammo.pistol.magazine = window.GameConfig.WEAPONS.pistol.magazineSize;
        this.weapons.ammo.rifle.magazine = window.GameConfig.WEAPONS.rifle.magazineSize;
      } else if (id === 'pistol') {
        this.weapons.addAmmoFor('pistol', 90);
        this.weapons.ammo.pistol.magazine = window.GameConfig.WEAPONS.pistol.magazineSize;
        this.weapons.switchWeapon('pistol');
      } else if (id === 'rifle') {
        this.weapons.addAmmoFor('rifle', 180);
        this.weapons.ammo.rifle.magazine = window.GameConfig.WEAPONS.rifle.magazineSize;
        this.weapons.switchWeapon('rifle');
      } else if (id === 'shotgun') {
        this.inventory.shotgun = true;
      } else if (id === 'sniper') {
        this.inventory.sniper = true;
      } else if (id === 'grenades') {
        this.inventory.grenades += 2;
      } else if (id === 'maxHealth') {
        this.upgrades.maxHealth += 1;
        this.player.maxHealth += 20;
        this.player.addHealth(20);
      } else if (id === 'maxArmor') {
        this.upgrades.maxArmor += 1;
        this.player.maxArmor += 20;
        this.player.addArmor(20);
      } else if (id === 'sprint') {
        this.upgrades.sprint += 1;
      } else if (id === 'reload') {
        this.upgrades.reload += 1;
      } else if (id === 'spread') {
        this.upgrades.spread += 1;
      } else if (id === 'magazine') {
        this.upgrades.magazine += 1;
        this.weapons.ammo.pistol.magazine += 4;
        this.weapons.ammo.rifle.magazine += 8;
      }

      this.applyUpgradeStats();
      if (this.weapons.updateHud) this.weapons.updateHud(performance.now());
    }

    spawnRewards() {
      const count = 3 + Math.min(4, Math.floor(this.wave / 2));

      if (this.lootSystem) {
        this.lootSystem.spawnWaveRewards(count);
        return;
      }

      const rewardTypes = ['health', 'armor', 'ammo'];

      for (let i = 0; i < count; i += 1) {
        const type = rewardTypes[Math.floor(Math.random() * rewardTypes.length)];
        const point = this.world.findFreePosition(18, this.player);
        this.addPickup(type, point.x, point.z);
      }
    }

    addPickup(type, x, z) {
      const color = type === 'health' ? 0xff5d67 : type === 'armor' ? 0x65b7ff : 0xffd37a;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(26, 18, 26),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.08, emissive: color, emissiveIntensity: 0.08 })
      );
      mesh.position.set(x, this.world.getGroundHeightAt(x, z, 0) + 12, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.pickups.push({ type, mesh, spin: Math.random() * Math.PI * 2 });
    }

    updatePickups(dt) {
      for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
        const pickup = this.pickups[i];
        pickup.spin += dt * 3.4;
        pickup.mesh.rotation.y = pickup.spin;
        pickup.mesh.position.y += Math.sin(pickup.spin * 1.8) * dt * 5;

        if (Math.hypot(pickup.mesh.position.x - this.player.x, pickup.mesh.position.z - this.player.z) < 42
          && Math.abs(pickup.mesh.position.y - this.player.y) < 80) {
          this.collectPickup(pickup);
          this.scene.remove(pickup.mesh);
          pickup.mesh.geometry.dispose();
          pickup.mesh.material.dispose();
          this.pickups.splice(i, 1);
        }
      }
    }

    collectPickup(pickup) {
      if (pickup.type === 'health') this.player.addHealth(35);
      if (pickup.type === 'armor') this.player.addArmor(30);
      if (pickup.type === 'ammo') this.weapons.addAmmo(70);
    }

    clearPickups() {
      for (const pickup of this.pickups) {
        this.scene.remove(pickup.mesh);
        pickup.mesh.geometry.dispose();
        pickup.mesh.material.dispose();
      }
      this.pickups.length = 0;
    }

    updateSurvivalHud(now) {
      if (this.elements.moneyValue) this.elements.moneyValue.textContent = String(this.money);
      if (!this.elements.survivalHud) return;
      const plan = this.currentWavePlan;
      const alive = this.mode === 'survival' ? this.npcs.aliveCount() : '—';
      this.elements.waveNumber.textContent = String(this.mode === 'survival' ? this.wave : '—');
      this.elements.waveEnemies.textContent = this.mode === 'survival' && plan ? alive + '/' + plan.count : String(alive);
      this.elements.waveTimer.textContent = this.shopOpen ? 'ПОДГОТОВКА' : this.waveInProgress && plan ? plan.event.short : '—';
    }

    updateMoneyHud() {
      if (this.elements.moneyValue) this.elements.moneyValue.textContent = String(this.money);
      if (this.elements.shopMoney) this.elements.shopMoney.textContent = '💵 ' + this.money;
    }

    addMoney(amount) {
      const value = Math.max(0, Math.floor(amount || 0));
      this.money += value;
      this.earnedMoney += value;
      this.updateMoneyHud();
      return value;
    }

    showSurvivalHud() {
      this.elements.survivalHud.classList.remove('hidden');
    }

    hideSurvivalHud() {
      this.elements.survivalHud.classList.add('hidden');
    }

    handleDefeat(now) {
      this.defeated = true;
      this.paused = true;
      this.shopOpen = false;
      if (document.pointerLockElement) document.exitPointerLock();

      const survivedMs = now - this.survivalStartAt;
      this.records.maxWave = Math.max(this.records.maxWave, this.wave);
      this.records.bestKills = Math.max(this.records.bestKills, this.npcs.kills);
      this.records.bestTime = Math.max(this.records.bestTime || 0, survivedMs);
      this.records.bestScore = Math.max(this.records.bestScore || 0, this.calculateScore(survivedMs));
      this.saveRecords();
      this.hideShop();
      this.showDefeat(survivedMs);
    }

    calculateScore(survivedMs) {
      return Math.round(this.npcs.kills * 100 + this.wave * 250 + survivedMs / 1000 + this.earnedMoney);
    }

    showDefeat(survivedMs) {
      this.elements.defeatWave.textContent = String(this.wave);
      this.elements.defeatKills.textContent = String(this.npcs.kills);
      this.elements.defeatTime.textContent = this.formatTime(survivedMs);
      this.elements.defeatStreak.textContent = String(this.bestStreak);
      if (this.elements.defeatMoney) this.elements.defeatMoney.textContent = String(this.earnedMoney);
      this.elements.bestScore.textContent = this.formatTime(this.records.bestTime || 0);
      this.elements.bestWave.textContent = String(this.records.maxWave);
      this.elements.bestKills.textContent = String(this.records.bestKills);
      this.elements.defeatScreen.classList.remove('hidden');
    }

    hideDefeat() {
      this.elements.defeatScreen.classList.add('hidden');
    }

    showMainMenu() {
      this.mode = 'free';
      this.defeated = false;
      this.paused = true;
      this.shopOpen = false;
      this.hideShop();
      this.hideDefeat();
      this.hideSurvivalHud();
      this.elements.tabMenu.classList.remove('hidden');
    }

    formatTime(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const minutes = String(Math.floor(total / 60)).padStart(2, '0');
      const seconds = String(total % 60).padStart(2, '0');
      return minutes + ':' + seconds;
    }

    loadRecords() {
      try {
        return Object.assign(
          { bestScore: 0, maxWave: 0, bestKills: 0, bestTime: 0 },
          JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        );
      } catch (error) {
        return { bestScore: 0, maxWave: 0, bestKills: 0, bestTime: 0 };
      }
    }

    saveRecords() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    }
  }

  window.GameModeSystem = GameModeSystem;
})();
