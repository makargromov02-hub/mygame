(function () {
  'use strict';

  window.GameConfig = {
    WORLD: {
      width: 5000,
      height: 5000,
      grid: 250
    },

    PLAYER: {
      radius: 18,
      height: 56,
      eyeHeight: 44,
      speed: 280,
      sprintMultiplier: 1.8,
      crouchHeight: 34,
      crouchEyeHeight: 27,
      crouchSpeedMultiplier: 0.58,
      crouchSmoothness: 12,
      gravity: 1450,
      jumpVelocity: 520,
      fallSafeHeight: 150,
      fallDamagePerMeter: 0.38,
      vaultMaxHeight: 92,
      vaultDistance: 76,
      vaultDuration: 0.58,
      vaultArcHeight: 58,
      roofSnapTolerance: 54,
      color: 0x42d59b,
      hitColor: 0xff5d67
    },

    WEAPONS: {
      pistol: {
        name: 'Пистолет',
        damage: 34,
        magazineSize: 12,
        reserveAmmo: 60,
        fireDelay: 310,
        reloadTime: 950,
        spread: 0.012,
        bulletSpeed: 900,
        bulletLife: 0.95,
        bulletRadius: 4,
        bulletColor: 0xf7df72,
        recoilKick: 0.17,
        recoilLift: 0.035,
        bobAmount: 0.018,
        bobSpeed: 8.5
      },
      rifle: {
        name: 'Автомат',
        damage: 19,
        magazineSize: 30,
        reserveAmmo: 120,
        fireDelay: 78,
        reloadTime: 1450,
        spread: 0.034,
        bulletSpeed: 1040,
        bulletLife: 0.75,
        bulletRadius: 3,
        bulletColor: 0xff9f5a,
        recoilKick: 0.09,
        recoilLift: 0.018,
        bobAmount: 0.026,
        bobSpeed: 10.5
      }
    },

    NPC: {
      count: 5,
      radius: 18,
      height: 76,
      maxHealth: 100,
      speed: 95,
      visionRange: 620,
      stopDistance: 240,
      searchTime: 4200,
      coverTimeMin: 1400,
      coverTimeMax: 2800,
      repositionMin: 2600,
      repositionMax: 5600,
      coverHealthThreshold: 55,
      fireDelay: 780,
      bulletDamage: 8,
      bulletSpeed: 650,
      bulletLife: 1.05,
      bulletRadius: 3,
      bulletSpread: 0.05,
      turnEveryMin: 0.8,
      turnEveryMax: 2.4,
      respawnDelay: 3500,
      color: 0xd66b7a,
      alertColor: 0xf08b4f
    },

    MAP_OBJECTS: [
      { type: 'road', shape: 'rect', solid: false, x: 2420, y: 0, w: 160, h: 5000 },
      { type: 'road', shape: 'rect', solid: false, x: 0, y: 2440, w: 5000, h: 160 },
      { type: 'road', shape: 'rect', solid: false, x: 810, y: 760, w: 1500, h: 120 },
      { type: 'road', shape: 'rect', solid: false, x: 3180, y: 3350, w: 1320, h: 120 },

      { type: 'building', shape: 'rect', roofAccessible: true, floors: 2, variant: 'compact-office', color: 0x7b8790, x: 520, y: 520, w: 420, h: 310 },
      { type: 'building', shape: 'rect', roofAccessible: true, floors: 3, variant: 'corner-store', color: 0x8c7460, x: 1250, y: 430, w: 520, h: 390 },
      { type: 'building', shape: 'rect', roofAccessible: true, floors: 2, variant: 'warehouse', color: 0x6f7c89, x: 3350, y: 520, w: 620, h: 420 },
      { type: 'building', shape: 'rect', roofAccessible: true, floors: 3, variant: 'apartments', color: 0x826d82, x: 690, y: 3340, w: 560, h: 520 },
      { type: 'building', shape: 'rect', roofAccessible: true, floors: 2, variant: 'clinic', color: 0x7e8f84, x: 3630, y: 3680, w: 520, h: 420 },
      { type: 'building', shape: 'rect', roofAccessible: true, floors: 2, variant: 'workshop', color: 0x8a7c65, x: 1460, y: 3820, w: 420, h: 300 },
      { type: 'building', shape: 'rect', roofAccessible: true, floors: 2, variant: 'l-shape', color: 0x6e8490, x: 2860, y: 3580, w: 470, h: 360 },
      { type: 'building', shape: 'rect', roofAccessible: true, floors: 3, variant: 'tall-house', color: 0x93756f, x: 4270, y: 2020, w: 360, h: 470 },

      { type: 'fence', shape: 'rect', x: 310, y: 1180, w: 820, h: 18 },
      { type: 'fence', shape: 'rect', x: 310, y: 1180, w: 18, h: 620 },
      { type: 'fence', shape: 'rect', x: 3220, y: 1260, w: 920, h: 18 },
      { type: 'fence', shape: 'rect', x: 4122, y: 1260, w: 18, h: 650 },
      { type: 'fence', shape: 'rect', x: 850, y: 4240, w: 900, h: 18 },
      { type: 'fence', shape: 'rect', x: 850, y: 4240, w: 18, h: 430 },

      { type: 'container', shape: 'rect', vaultable: true, x: 1560, y: 1260, w: 260, h: 90 },
      { type: 'container', shape: 'rect', vaultable: true, x: 1860, y: 1260, w: 260, h: 90 },
      { type: 'container', shape: 'rect', vaultable: true, x: 1560, y: 1400, w: 90, h: 260 },
      { type: 'container', shape: 'rect', vaultable: true, x: 3070, y: 2830, w: 280, h: 95 },
      { type: 'container', shape: 'rect', vaultable: true, x: 3400, y: 2830, w: 280, h: 95 },
      { type: 'container', shape: 'rect', vaultable: true, x: 3900, y: 3050, w: 95, h: 280 },

      { type: 'cover', shape: 'rect', vaultable: true, x: 2130, y: 2190, w: 140, h: 52 },
      { type: 'cover', shape: 'rect', vaultable: true, x: 2730, y: 2750, w: 140, h: 52 },
      { type: 'cover', shape: 'rect', vaultable: true, x: 2180, y: 2940, w: 52, h: 150 },
      { type: 'cover', shape: 'rect', vaultable: true, x: 2880, y: 1980, w: 52, h: 150 },
      { type: 'crate', shape: 'rect', vaultable: true, x: 1120, y: 1560, w: 76, h: 76 },
      { type: 'crate', shape: 'rect', vaultable: true, x: 1220, y: 1560, w: 76, h: 76 },
      { type: 'crate', shape: 'rect', vaultable: true, x: 3980, y: 2160, w: 88, h: 72 },
      { type: 'crate', shape: 'rect', vaultable: true, x: 4080, y: 2160, w: 88, h: 72 },
      { type: 'crate', shape: 'rect', vaultable: true, x: 2720, y: 980, w: 90, h: 70 },
      { type: 'crate', shape: 'rect', vaultable: true, x: 2860, y: 980, w: 90, h: 70 },

      { type: 'ladder', shape: 'rect', solid: false, x: 690, y: 438, w: 70, h: 110, height: 180, direction: 'north' },
      { type: 'ladder', shape: 'rect', solid: false, x: 1475, y: 790, w: 80, h: 120, height: 180, direction: 'south' },
      { type: 'ladder', shape: 'rect', solid: false, x: 3965, y: 685, w: 120, h: 80, height: 180, direction: 'east' },
      { type: 'ladder', shape: 'rect', solid: false, x: 3820, y: 3600, w: 80, h: 120, height: 180, direction: 'north' },

      { type: 'tree', shape: 'circle', x: 410, y: 2260, r: 44 },
      { type: 'tree', shape: 'circle', x: 620, y: 2100, r: 36 },
      { type: 'tree', shape: 'circle', x: 780, y: 2350, r: 42 },
      { type: 'tree', shape: 'circle', x: 1120, y: 2320, r: 38 },
      { type: 'tree', shape: 'circle', x: 3860, y: 820, r: 46 },
      { type: 'tree', shape: 'circle', x: 4210, y: 910, r: 38 },
      { type: 'tree', shape: 'circle', x: 4540, y: 1240, r: 44 },
      { type: 'tree', shape: 'circle', x: 3220, y: 4300, r: 46 },
      { type: 'tree', shape: 'circle', x: 3480, y: 4460, r: 40 },
      { type: 'tree', shape: 'circle', x: 3760, y: 4300, r: 42 },
      { type: 'tree', shape: 'circle', x: 1980, y: 3480, r: 35 },
      { type: 'tree', shape: 'circle', x: 2180, y: 3640, r: 38 },

      { type: 'rock', shape: 'circle', x: 1460, y: 2220, r: 48 },
      { type: 'rock', shape: 'circle', x: 1730, y: 2260, r: 36 },
      { type: 'rock', shape: 'circle', x: 3100, y: 1780, r: 52 },
      { type: 'rock', shape: 'circle', x: 3420, y: 2040, r: 42 },
      { type: 'rock', shape: 'circle', x: 760, y: 4480, r: 46 },
      { type: 'rock', shape: 'circle', x: 4380, y: 4100, r: 50 }
    ]
  };
})();
