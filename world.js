(function () {
  'use strict';

  const { WORLD, MAP_OBJECTS } = window.GameConfig;
  const { clamp, circleIntersectsRect, circleIntersectsCircle, randomRange } = window.GameUtils;
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const LIGHTING_QUALITY = {
    MOBILE: 'MOBILE',
    DESKTOP: 'DESKTOP'
  };

  class GameWorld {
    constructor(scene) {
      this.scene = scene;
      this.doors = [];
      this.interactables = [];
      this.interactionHandlers = {};
      this.physicsObjects = [];
      this.ragdolls = [];
      this.physicsFocus = null;
      this.ceilingColliders = [];
      this.fires = [];
      this.contactShadowData = [];
      this.renderOptimizedMeshes = [];
      this.renderOptimizeTimer = 0;
      this.performanceProfile = {
        renderCullDistance: 1900,
        renderCullRadiusMultiplier: 3,
        renderOptimizeInterval: 0.35,
        shadowCastDistance: 1350,
        shadowReceiveDistance: 2400,
        physicsActiveDistance: 1250,
        mobile: false
      };
      this.performanceStats = {
        losChecks: 0,
        collisionQueries: 0,
        physicsObjects: 0,
        physicsMs: 0,
        shadowCasters: 0
      };
      this.renderTempPosition = new THREE.Vector3();
      this.staticBatchGeometry = new THREE.BoxGeometry(1, 1, 1);
      this.decorBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
      this.decorPlaneGeometry = new THREE.PlaneGeometry(1, 1);
      this.staticBatchMatrix = new THREE.Matrix4();
      this.staticBatchScale = new THREE.Vector3();
      this.staticBatchPosition = new THREE.Vector3();
      this.staticBatchQuaternion = new THREE.Quaternion();
      this.staticBatchProtected = new Set();
      this.decorBatchMatrix = new THREE.Matrix4();
      this.decorBatchPosition = new THREE.Vector3();
      this.decorBatchQuaternion = new THREE.Quaternion();
      this.decorBatchScale = new THREE.Vector3();
      this.decorBatchEuler = new THREE.Euler();
      this.ragdollGeometries = [
        new THREE.BoxGeometry(26, 34, 14),
        new THREE.BoxGeometry(20, 20, 20),
        new THREE.BoxGeometry(9, 28, 9),
        new THREE.BoxGeometry(9, 28, 9),
        new THREE.BoxGeometry(10, 32, 10),
        new THREE.BoxGeometry(10, 32, 10)
      ];
      for (const geometry of this.ragdollGeometries) {
        geometry.userData.sharedRagdollResource = true;
      }
      this.bulletImpactPoint = new THREE.Vector3();
      this.bulletImpactNormal = new THREE.Vector3();
      this.bulletImpactTravel = new THREE.Vector3();
      this.interactionRayOrigin = new THREE.Vector3();
      this.interactionRayDirection = new THREE.Vector3();
      this.interactionTargetResult = { object: null, distance: 0 };
      this.interactionBoundsResult = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
      this.bulletImpactResult = {
        type: '',
        object: null,
        material: 'dirt',
        point: this.bulletImpactPoint,
        normal: this.bulletImpactNormal
      };
      this.weatherTargets = {
        trees: [],
        streetLights: [],
        buildingLights: [],
        ground: null,
        sky: null,
        skyHorizon: null,
        skyZenith: null,
        sunDisc: null,
        sunGlow: null,
        ambient: null,
        sun: null,
        sunTarget: null,
        fill: null,
        rim: null
      };
      this.lightingQuality = this.getInitialLightingQuality();
      this.desktopEnvironmentMap = null;
      this.desktopAtmosphereGroup = null;
      this.desktopWorldDetailGroup = null;
      this.desktopWorldDetailMaterials = null;
      this.desktopWorldDetailTextures = null;
      this.spatialCellSize = 220;
      this.spatialGrid = new Map();
      this.dynamicCollisionObjects = [];
      this.spatialQueryId = 0;
      this.objects = this.prepareObjects(MAP_OBJECTS);
      this.buildSpatialIndex();
      this.group = new THREE.Group();
      this.scene.add(this.group);
      this.textures = this.createTextures();

      this.buildSky();
      this.buildLighting();
      this.buildGround();
      this.buildObjects();
      this.buildVisualDetailLayer();
      this.optimizeStaticMeshes();
      this.flushContactShadows();
      this.applyLightingQuality();
      this.applyWorldDetailQuality();
      this.registerRenderOptimizations();
    }

    setPerformanceProfile(profile) {
      const previousMobile = this.performanceProfile.mobile;
      this.performanceProfile = Object.assign({}, this.performanceProfile, profile || {});
      const nextQuality = this.performanceProfile.mobile ? LIGHTING_QUALITY.MOBILE : LIGHTING_QUALITY.DESKTOP;
      if (this.lightingQuality !== nextQuality || previousMobile !== this.performanceProfile.mobile) {
        this.lightingQuality = nextQuality;
        this.applyLightingQuality();
        this.applyWorldDetailQuality();
        this.registerRenderOptimizations();
      }
    }

    getInitialLightingQuality() {
      try {
        const storedMode = localStorage.getItem('controlMode');
        if (storedMode === 'mobile') return LIGHTING_QUALITY.MOBILE;
        if (storedMode === 'desktop') return LIGHTING_QUALITY.DESKTOP;
        const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const compactViewport = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) < 820;
        return coarsePointer && compactViewport ? LIGHTING_QUALITY.MOBILE : LIGHTING_QUALITY.DESKTOP;
      } catch (error) {
        return LIGHTING_QUALITY.DESKTOP;
      }
    }

    isDesktopLighting() {
      return this.lightingQuality === LIGHTING_QUALITY.DESKTOP;
    }

    consumePerformanceStats() {
      const stats = Object.assign({}, this.performanceStats);
      this.performanceStats.losChecks = 0;
      this.performanceStats.collisionQueries = 0;
      this.performanceStats.physicsObjects = 0;
      this.performanceStats.physicsMs = 0;
      return stats;
    }

    prepareObjects(sourceObjects) {
      const objects = [];

      for (const object of sourceObjects) {
        if (object.type !== 'building') {
          objects.push(object);
          continue;
        }

        const building = Object.assign({}, object, {
          solid: false,
          detailed: true,
          buildingId: objects.length,
          height: (object.floors || 2) * 112
        });
        objects.push(building);
        this.addDetailedBuildingCollision(objects, building);
      }

      this.addDestructibleObjects(objects);
      this.addInteractiveObjects(objects);
      this.addPhysicsProps(objects);
      return objects;
    }

    addInteractiveObjects(objects) {
      const interactives = [
        { type: 'openCrate', shape: 'rect', x: 1320, y: 1660, w: 68, h: 68, height: 52, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'wood' },
        { type: 'openCrate', shape: 'rect', x: 3720, y: 2320, w: 72, h: 68, height: 54, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'wood' },
        { type: 'cabinet', shape: 'rect', x: 710, y: 720, w: 50, h: 82, height: 86, floorY: 0, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'wood' },
        { type: 'cabinet', shape: 'rect', x: 1400, y: 620, w: 56, h: 88, height: 88, floorY: 0, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'wood' },
        { type: 'containerDoor', shape: 'rect', x: 1820, y: 1260, w: 18, h: 90, height: 86, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'metal', hingeX: 1820, hingeZ: 1260, axis: 'z' },
        { type: 'containerDoor', shape: 'rect', x: 3350, y: 2830, w: 18, h: 95, height: 86, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'metal', hingeX: 3350, hingeZ: 2830, axis: 'z' },
        { type: 'lightSwitch', shape: 'rect', x: 948, y: 640, w: 12, h: 28, height: 42, interactionLabel: '[E] Взаимодействовать', solid: false, impactMaterial: 'metal', linkedLight: 'yard-a' },
        { type: 'lightSwitch', shape: 'rect', x: 3332, y: 650, w: 12, h: 28, height: 42, interactionLabel: '[E] Взаимодействовать', solid: false, impactMaterial: 'metal', linkedLight: 'yard-b' },
        { type: 'computer', shape: 'rect', x: 840, y: 705, w: 54, h: 34, height: 44, floorY: 0, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'metal' },
        { type: 'computer', shape: 'rect', x: 1540, y: 660, w: 54, h: 34, height: 44, floorY: 0, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'metal' },
        { type: 'redButton', shape: 'rect', x: 2380, y: 2320, w: 46, h: 46, height: 34, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'metal', linkedGate: 'central-gate' },
        { type: 'gate', shape: 'rect', x: 2468, y: 2280, w: 64, h: 200, height: 96, interactionLabel: '[E] Взаимодействовать', solid: true, impactMaterial: 'metal', gateId: 'central-gate' },
        { type: 'breakableLamp', shape: 'circle', x: 1020, y: 1260, r: 16, height: 118, destructible: true, health: 28, maxHealth: 28, lightId: 'yard-a', impactMaterial: 'glass' },
        { type: 'breakableLamp', shape: 'circle', x: 3540, y: 2970, r: 16, height: 118, destructible: true, health: 28, maxHealth: 28, lightId: 'yard-b', impactMaterial: 'glass' }
      ];

      for (const object of interactives) {
        object.interactive = object.type !== 'breakableLamp';
        object.currentAngle = 0;
        object.targetAngle = 0;
        object.openState = 0;
        if (object.shape === 'rect') {
          object.closedX = object.x;
          object.closedY = object.y;
          object.closedW = object.w;
          object.closedH = object.h;
        }
        objects.push(object);
        if (object.interactive) this.interactables.push(object);
      }
    }

    addDestructibleObjects(objects) {
      const destructibles = [
        { type: 'woodCrate', shape: 'rect', x: 980, y: 1510, w: 62, h: 62, height: 58, health: 70, impactMaterial: 'wood', vaultable: true, physics: true, mass: 1.1 },
        { type: 'woodCrate', shape: 'rect', x: 1058, y: 1518, w: 58, h: 58, height: 54, health: 70, impactMaterial: 'wood', vaultable: true, physics: true, mass: 1 },
        { type: 'woodCrate', shape: 'rect', x: 4010, y: 2250, w: 66, h: 62, height: 58, health: 75, impactMaterial: 'wood', vaultable: true, physics: true, mass: 1.15 },
        { type: 'woodObstacle', shape: 'rect', x: 2060, y: 2110, w: 145, h: 34, height: 48, health: 85, impactMaterial: 'wood', vaultable: true },
        { type: 'woodObstacle', shape: 'rect', x: 2820, y: 1880, w: 38, h: 142, height: 48, health: 85, impactMaterial: 'wood', vaultable: true },
        { type: 'woodFenceBreakable', shape: 'rect', x: 620, y: 1182, w: 180, h: 16, height: 52, health: 95, impactMaterial: 'wood' },
        { type: 'woodFenceBreakable', shape: 'rect', x: 3420, y: 1262, w: 190, h: 16, height: 52, health: 95, impactMaterial: 'wood' },
        { type: 'barrel', shape: 'circle', x: 1720, y: 1330, r: 28, height: 72, health: 150, impactMaterial: 'metal', explosive: true, physics: true, mass: 1.8 },
        { type: 'barrel', shape: 'circle', x: 3190, y: 2910, r: 28, height: 72, health: 150, impactMaterial: 'metal', explosive: true, physics: true, mass: 1.8 },
        { type: 'barrel', shape: 'circle', x: 3920, y: 2160, r: 28, height: 72, health: 150, impactMaterial: 'metal', explosive: true, physics: true, mass: 1.8 }
      ];

      for (const object of destructibles) {
        const prepared = Object.assign({ destructible: true, maxHealth: object.health }, object);
        objects.push(prepared);
        if (prepared.physics) this.physicsObjects.push(prepared);
      }
    }

    addPhysicsProps(objects) {
      const props = [
        { type: 'chair', shape: 'rect', x: 760, y: 760, w: 30, h: 34, height: 44, mass: 0.55, impactMaterial: 'wood' },
        { type: 'chair', shape: 'rect', x: 1510, y: 710, w: 30, h: 34, height: 44, mass: 0.55, impactMaterial: 'wood' },
        { type: 'table', shape: 'rect', x: 805, y: 752, w: 70, h: 46, height: 38, mass: 1.25, impactMaterial: 'wood' },
        { type: 'table', shape: 'rect', x: 1490, y: 745, w: 78, h: 48, height: 38, mass: 1.3, impactMaterial: 'wood' },
        { type: 'dumpster', shape: 'rect', x: 1160, y: 1210, w: 82, h: 52, height: 48, mass: 2.2, impactMaterial: 'metal' },
        { type: 'dumpster', shape: 'rect', x: 3650, y: 3400, w: 86, h: 54, height: 48, mass: 2.25, impactMaterial: 'metal' },
        { type: 'roadSign', shape: 'rect', x: 2320, y: 2460, w: 18, h: 18, height: 92, mass: 0.45, impactMaterial: 'metal' },
        { type: 'roadSign', shape: 'rect', x: 2630, y: 2460, w: 18, h: 18, height: 92, mass: 0.45, impactMaterial: 'metal' },
        { type: 'smallContainer', shape: 'rect', x: 1900, y: 1490, w: 94, h: 56, height: 58, mass: 2.6, impactMaterial: 'metal', vaultable: true },
        { type: 'smallContainer', shape: 'rect', x: 3290, y: 3030, w: 96, h: 58, height: 58, mass: 2.6, impactMaterial: 'metal', vaultable: true }
      ];

      for (const prop of props) {
        prop.physics = true;
        prop.velocityX = 0;
        prop.velocityZ = 0;
        prop.velocityY = 0;
        prop.angularVelocity = 0;
        prop.tiltX = 0;
        prop.tiltZ = 0;
        prop.solid = true;
        objects.push(prop);
        this.physicsObjects.push(prop);
      }
    }

    addDetailedBuildingCollision(objects, building) {
      const wall = 18;
      const doorWidth = Math.min(96, building.w * 0.24);
      const doorDepth = 20;
      const doorX = building.x + building.w * 0.5 - doorWidth * 0.5;
      const openWindowSize = 74;
      const windowZ = building.y + building.h * 0.62;
      const floorHeight = 112;

      this.addWallSegment(objects, building, building.x, building.y, building.w, wall, 'north-wall');
      this.addWallSegment(objects, building, building.x, building.y + building.h - wall, doorX - building.x, wall, 'south-wall-left');
      this.addWallSegment(objects, building, doorX + doorWidth, building.y + building.h - wall, building.x + building.w - doorX - doorWidth, wall, 'south-wall-right');
      this.addWallSegment(objects, building, building.x, building.y, wall, windowZ - building.y - openWindowSize * 0.5, 'west-wall-upper');
      this.addWallSegment(objects, building, building.x, windowZ + openWindowSize * 0.5, wall, building.y + building.h - windowZ - openWindowSize * 0.5, 'west-wall-lower');
      this.addWallSegment(objects, building, building.x + building.w - wall, building.y, wall, building.h, 'east-wall');
      objects.push({
        type: 'glassWindow',
        shape: 'rect',
        buildingId: building.buildingId,
        x: building.x,
        y: windowZ - openWindowSize * 0.5,
        w: wall,
        h: openWindowSize,
        floorY: 0,
        height: 74,
        health: 24,
        maxHealth: 24,
        destructible: true,
        impactMaterial: 'glass'
      });

      const door = {
        type: 'door',
        shape: 'rect',
        buildingId: building.buildingId,
        x: doorX,
        y: building.y + building.h - doorDepth,
        w: doorWidth,
        h: doorDepth,
        closedX: doorX,
        closedY: building.y + building.h - doorDepth,
        closedW: doorWidth,
        closedH: doorDepth,
        hingeX: doorX,
        hingeZ: building.y + building.h - doorDepth / 2,
        hingeSide: 'left',
        wallSide: 'south',
        openDirection: 1,
        currentAngle: 0,
        height: 92,
        openAmount: 0,
        targetOpenAngle: 0,
        solid: true,
        impactMaterial: 'wood'
      };
      objects.push(door);
      this.doors.push(door);

      const stairRun = Math.min(260, building.h - 92);
      const stairWidth = Math.min(118, Math.max(88, building.w * 0.24));
      const stairY = building.y + 40;
      const floors = building.floors || 2;
      const rightStairX = this.getBuildingStairX(building, stairWidth, 0);
      const leftStairX = this.getBuildingStairX(building, stairWidth, 1);
      const stairMinX = Math.min(leftStairX, rightStairX);
      const stairMaxX = Math.max(leftStairX + stairWidth, rightStairX + stairWidth);
      const stairOpening = {
        x: stairMinX - 18,
        y: stairY - 30,
        w: stairMaxX - stairMinX + 36,
        h: stairRun + 60
      };

      for (let floor = 0; floor < floors; floor += 1) {
        const flightX = this.getBuildingStairX(building, stairWidth, floor);
        objects.push({
          type: 'stairs',
          shape: 'rect',
          solid: false,
          buildingId: building.buildingId,
          x: flightX,
          y: stairY,
          w: stairWidth,
          h: stairRun,
          bottomLanding: 34,
          topLanding: 38,
          floorY: floor * floorHeight,
          height: floorHeight,
          stepHeight: 10,
          direction: floor % 2 === 0 ? 'south' : 'north'
        });
      }

      for (let floor = 0; floor < floors; floor += 1) {
        this.addCeilingCollider(building, floor * floorHeight + floorHeight - 20, 20, stairOpening);
      }
      this.addCeilingCollider(building, floors * floorHeight - 4, 22, stairOpening);

      // Интерьеры зданий намеренно пустые: оставляем только оболочку, двери,
      // окна, потолки и лестничную шахту.
    }

    addWallSegment(objects, building, x, y, w, h, name) {
      if (w <= 2 || h <= 2) return;
      objects.push({
        type: 'buildingWall',
        shape: 'rect',
        buildingId: building.buildingId,
        name,
        x,
        y,
        w,
        h,
        height: building.height,
        color: building.color,
        impactMaterial: 'concrete'
      });
    }

    addInteriorWall(objects, building, x, y, w, h, level) {
      objects.push({
        type: 'interiorWall',
        shape: 'rect',
        buildingId: building.buildingId,
        x,
        y,
        w,
        h,
        floorY: level,
        height: 92,
        impactMaterial: 'concrete'
      });
    }

    addCeilingCollider(building, baseY, thickness, opening) {
      const padding = 5;
      const slab = {
        x: building.x - padding,
        y: building.y - padding,
        w: building.w + padding * 2,
        h: building.h + padding * 2
      };
      const pieces = this.getSlabPieces(slab, opening);

      for (const piece of pieces) {
        this.ceilingColliders.push({
          type: 'ceiling',
          shape: 'rect',
          buildingId: building.buildingId,
          x: piece.x,
          y: piece.z,
          w: piece.w,
          h: piece.d,
          baseY,
          thickness,
          impactMaterial: 'concrete'
        });
      }
    }

    addFurnitureSet(objects, building, floor, level) {
      const baseX = building.x + 74 + (floor % 2) * 40;
      const baseZ = building.y + 72 + (floor % 2) * 34;
      const items = [
        { type: 'table', x: baseX, y: baseZ, w: 58, h: 42, height: 32, color: 0x6b513a },
        { type: 'cabinet', x: building.x + building.w - 86, y: building.y + building.h - 112, w: 46, h: 78, height: 78, color: 0x4a3d34 },
        { type: 'box', x: building.x + 112, y: building.y + building.h - 84, w: 44, h: 44, height: 38, color: 0x8a6844 },
        { type: 'bench', x: building.x + building.w * 0.45, y: building.y + 36, w: 92, h: 28, height: 28, color: 0x5f6f73 }
      ];

      for (const item of items) {
        objects.push(Object.assign({
          shape: 'rect',
          buildingId: building.buildingId,
          floorY: level,
          impactMaterial: item.type === 'box' ? 'wood' : 'wood'
        }, item));
      }
    }

    createTextures() {
      return {
        ground: this.createNoiseTexture(0x243326, 0x314632, 256, 1600),
        road: this.createRoadTexture(),
        sidewalk: this.createSidewalkTexture(),
        concrete: this.createNoiseTexture(0x5d6670, 0x434b54, 256, 900),
        roof: this.createNoiseTexture(0x303944, 0x49545f, 256, 720),
        crate: this.createStripedTexture(0x8a6844, 0x5b3b22, 128),
        containerBlue: this.createStripedTexture(0x31546d, 0x1e3446, 128),
        containerRed: this.createStripedTexture(0x74403c, 0x4b2828, 128)
      };
    }

    createNoiseTexture(colorA, colorB, size, count) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const a = new THREE.Color(colorA);
      const b = new THREE.Color(colorB);
      ctx.fillStyle = '#' + a.getHexString();
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < count; i += 1) {
        const mix = Math.random();
        const c = a.clone().lerp(b, mix);
        ctx.fillStyle = 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',0.32)';
        ctx.fillRect(Math.random() * size, Math.random() * size, randomRange(1, 4), randomRange(1, 4));
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    createSidewalkTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#5f6970';
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = 'rgba(36, 42, 48, 0.42)';
      ctx.lineWidth = 3;
      for (let x = 0; x <= 256; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }
      for (let y = 0; y <= 256; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }

      for (let i = 0; i < 520; i += 1) {
        const shade = Math.floor(randomRange(82, 125));
        ctx.fillStyle = 'rgba(' + shade + ',' + shade + ',' + shade + ',0.22)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, randomRange(1, 4), randomRange(1, 4));
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    createRoadTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#262d35';
      ctx.fillRect(0, 0, 256, 256);

      for (let i = 0; i < 900; i += 1) {
        const shade = Math.floor(randomRange(35, 66));
        ctx.fillStyle = 'rgba(' + shade + ',' + shade + ',' + shade + ',0.34)';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, randomRange(1, 4), randomRange(1, 4));
      }

      ctx.strokeStyle = 'rgba(14, 18, 22, 0.26)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 22; i += 1) {
        ctx.beginPath();
        const sx = randomRange(0, 256);
        const sy = randomRange(0, 256);
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(sx + randomRange(-30, 30), sy + randomRange(12, 44), sx + randomRange(-45, 45), sy + randomRange(46, 92), sx + randomRange(-20, 20), sy + randomRange(90, 150));
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(13, 16, 19, 0.18)';
      for (let i = 0; i < 24; i += 1) {
        ctx.fillRect(randomRange(0, 232), randomRange(0, 232), randomRange(10, 34), randomRange(6, 24));
      }

      ctx.strokeStyle = 'rgba(235, 214, 142, 0.55)';
      ctx.lineWidth = 8;
      ctx.setLineDash([32, 28]);
      ctx.beginPath();
      ctx.moveTo(128, 0);
      ctx.lineTo(128, 256);
      ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    createStripedTexture(colorA, colorB, size) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#' + new THREE.Color(colorA).getHexString();
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#' + new THREE.Color(colorB).getHexString();
      for (let x = 0; x < size; x += 18) {
        ctx.fillRect(x, 0, 5, size);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    buildSky() {
      const skyGeometry = new THREE.SphereGeometry(3600, 32, 16);
      const skyMaterial = new THREE.MeshBasicMaterial({
        color: this.isDesktopLighting() ? 0x9ccbf0 : 0x88bfe8,
        side: THREE.BackSide,
        fog: false
      });
      const sky = new THREE.Mesh(skyGeometry, skyMaterial);
      sky.position.set(WORLD.width / 2, 0, WORLD.height / 2);
      this.scene.add(sky);
      this.weatherTargets.sky = sky;
      if (this.isDesktopLighting()) this.createDesktopAtmosphereMeshes();

      const sunDisc = new THREE.Mesh(
        new THREE.SphereGeometry(95, 24, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff0a8 })
      );
      sunDisc.position.set(WORLD.width / 2 - 900, 1250, WORLD.height / 2 - 1200);
      this.scene.add(sunDisc);
      this.weatherTargets.sunDisc = sunDisc;

      const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(180, 24, 12),
        new THREE.MeshBasicMaterial({ color: 0xffc76a, transparent: true, opacity: 0.16, depthWrite: false })
      );
      sunGlow.position.copy(sunDisc.position);
      this.scene.add(sunGlow);
      this.weatherTargets.sunGlow = sunGlow;
    }

    buildLighting() {
      const ambient = new THREE.HemisphereLight(
        this.isDesktopLighting() ? 0xdcefff : 0xcdeeff,
        this.isDesktopLighting() ? 0x4c5c42 : 0x24341f,
        this.isDesktopLighting() ? 0.92 : 0.78
      );
      this.scene.add(ambient);
      this.weatherTargets.ambient = ambient;

      const sun = new THREE.DirectionalLight(this.isDesktopLighting() ? 0xffd49b : 0xffe4b8, this.isDesktopLighting() ? 2.42 : 2.15);
      sun.position.set(WORLD.width / 2 - 900, 1250, WORLD.height / 2 - 1200);
      sun.castShadow = true;
      const sunTarget = new THREE.Object3D();
      sunTarget.position.set(WORLD.width / 2, 0, WORLD.height / 2);
      this.scene.add(sunTarget);
      sun.target = sunTarget;
      this.weatherTargets.sunTarget = sunTarget;
      this.scene.add(sun);
      this.weatherTargets.sun = sun;

      const fill = new THREE.DirectionalLight(0x8fc4ff, this.isDesktopLighting() ? 0.34 : 0.28);
      fill.position.set(WORLD.width / 2 + 1200, 500, WORLD.height / 2 + 900);
      this.scene.add(fill);
      this.weatherTargets.fill = fill;

      if (this.isDesktopLighting()) {
        const rim = new THREE.DirectionalLight(0xb9d9ff, 0.16);
        rim.position.set(WORLD.width / 2 + 1500, 820, WORLD.height / 2 - 1450);
        rim.castShadow = false;
        rim.target = sunTarget;
        this.scene.add(rim);
        this.weatherTargets.rim = rim;
      }

      this.applyLightingQuality();
    }

    createDesktopAtmosphereMeshes() {
      if (this.desktopAtmosphereGroup) return;
      const group = new THREE.Group();
      group.position.set(WORLD.width / 2, 0, WORLD.height / 2);

      const horizon = new THREE.Mesh(
        new THREE.CylinderGeometry(3580, 3580, 620, 64, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffd8a8,
          transparent: true,
          opacity: 0.11,
          depthWrite: false,
          side: THREE.BackSide,
          fog: false
        })
      );
      horizon.position.y = 245;
      group.add(horizon);

      const zenith = new THREE.Mesh(
        new THREE.SphereGeometry(3550, 32, 12),
        new THREE.MeshBasicMaterial({
          color: 0x4f8fc9,
          transparent: true,
          opacity: 0.075,
          depthWrite: false,
          side: THREE.BackSide,
          fog: false
        })
      );
      zenith.position.y = 80;
      group.add(zenith);

      this.scene.add(group);
      this.desktopAtmosphereGroup = group;
      this.weatherTargets.skyHorizon = horizon;
      this.weatherTargets.skyZenith = zenith;
    }

    disposeDesktopAtmosphereMeshes() {
      if (!this.desktopAtmosphereGroup) return;
      this.desktopAtmosphereGroup.traverse((child) => {
        if (!child.isMesh) return;
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      if (this.desktopAtmosphereGroup.parent) this.desktopAtmosphereGroup.parent.remove(this.desktopAtmosphereGroup);
      this.desktopAtmosphereGroup = null;
      this.weatherTargets.skyHorizon = null;
      this.weatherTargets.skyZenith = null;
    }

    createDesktopEnvironmentMap() {
      if (this.desktopEnvironmentMap) return this.desktopEnvironmentMap;
      const colors = [0xbdddf4, 0xa5c7e5, 0xf1d7ad, 0x4b5c64, 0x95c9ef, 0xd7c3a1];
      const canvases = colors.map((color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 16);
        const base = new THREE.Color(color);
        const high = base.clone().lerp(new THREE.Color(0xffffff), 0.24);
        const low = base.clone().lerp(new THREE.Color(0x1f2933), 0.18);
        gradient.addColorStop(0, '#' + high.getHexString());
        gradient.addColorStop(1, '#' + low.getHexString());
        context.fillStyle = gradient;
        context.fillRect(0, 0, 16, 16);
        return canvas;
      });
      const texture = new THREE.CubeTexture(canvases);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.desktopEnvironmentMap = texture;
      return texture;
    }

    disposeDesktopEnvironmentMap() {
      if (!this.desktopEnvironmentMap) return;
      if (this.scene.environment === this.desktopEnvironmentMap) this.scene.environment = null;
      this.desktopEnvironmentMap.dispose();
      this.desktopEnvironmentMap = null;
    }

    applyLightingQuality() {
      const desktop = this.isDesktopLighting();
      if (desktop) {
        this.createDesktopAtmosphereMeshes();
        this.scene.environment = this.createDesktopEnvironmentMap();
      } else {
        this.disposeDesktopAtmosphereMeshes();
        this.disposeDesktopEnvironmentMap();
      }

      const targets = this.weatherTargets;
      if (targets.sky && targets.sky.material && targets.sky.material.color) {
        targets.sky.material.color.setHex(desktop ? 0x9ccbf0 : 0x88bfe8);
      }
      if (targets.ambient) {
        targets.ambient.color.setHex(desktop ? 0xdcefff : 0xcdeeff);
        targets.ambient.groundColor.setHex(desktop ? 0x4c5c42 : 0x24341f);
        targets.ambient.intensity = desktop ? 0.92 : 0.78;
      }
      if (targets.sun) {
        targets.sun.color.setHex(desktop ? 0xffd49b : 0xffe4b8);
        targets.sun.intensity = desktop ? 2.42 : 2.15;
        targets.sun.shadow.mapSize.set(desktop ? 3072 : 2048, desktop ? 3072 : 2048);
        targets.sun.shadow.radius = desktop ? 4 : 5;
        targets.sun.shadow.bias = desktop ? -0.00008 : 0;
        targets.sun.shadow.normalBias = desktop ? 1.65 : 0;
        targets.sun.shadow.camera.left = desktop ? -2350 : -2800;
        targets.sun.shadow.camera.right = desktop ? 2350 : 2800;
        targets.sun.shadow.camera.top = desktop ? 2350 : 2800;
        targets.sun.shadow.camera.bottom = desktop ? -2350 : -2800;
        targets.sun.shadow.camera.near = 80;
        targets.sun.shadow.camera.far = desktop ? 4300 : 3600;
        targets.sun.shadow.camera.updateProjectionMatrix();
        if (targets.sun.shadow.map) {
          targets.sun.shadow.map.dispose();
          targets.sun.shadow.map = null;
        }
      }
      if (targets.fill) {
        targets.fill.color.setHex(desktop ? 0x8fc4ff : 0x7eb7ff);
        targets.fill.intensity = desktop ? 0.34 : 0.28;
      }
      if (targets.rim) {
        targets.rim.visible = desktop;
        targets.rim.intensity = desktop ? 0.16 : 0;
      }
      if (this.contactShadowMesh && this.contactShadowMesh.material) {
        this.contactShadowMesh.material.opacity = desktop ? 0.22 : 0.17;
      }
    }

    buildGround() {
      const floorGeometry = new THREE.PlaneGeometry(WORLD.width, WORLD.height);
      this.textures.ground.repeat.set(WORLD.width / 480, WORLD.height / 480);
      const floorMaterial = new THREE.MeshStandardMaterial({
        map: this.textures.ground,
        color: 0xb7c9b4,
        roughness: 0.96
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(WORLD.width / 2, 0, WORLD.height / 2);
      floor.receiveShadow = true;
      this.group.add(floor);
      this.weatherTargets.ground = floor;

      const grid = new THREE.GridHelper(WORLD.width, WORLD.width / WORLD.grid, 0x6f7d8c, 0x36424d);
      grid.position.set(WORLD.width / 2, 0.35, WORLD.height / 2);
      grid.material.opacity = 0.07;
      grid.material.transparent = true;
      this.group.add(grid);

      const borderMaterial = new THREE.MeshStandardMaterial({ color: 0x52606d, roughness: 0.8 });
      this.addBox(WORLD.width / 2, -12, WORLD.width + 24, 80, 18, borderMaterial);
      this.addBox(WORLD.width / 2, WORLD.height + 12, WORLD.width + 24, 80, 18, borderMaterial);
      this.addBox(-12, WORLD.height / 2, 18, 80, WORLD.height + 24, borderMaterial);
      this.addBox(WORLD.width + 12, WORLD.height / 2, 18, 80, WORLD.height + 24, borderMaterial);
    }

    buildObjects() {
      for (const object of this.objects) {
        if (object.shape === 'rect') {
          this.buildRectObject(object);
        } else {
          this.buildCircleObject(object);
        }
      }
    }

    buildVisualDetailLayer() {
      const materials = {
        lanePaint: new THREE.MeshStandardMaterial({ color: 0xd8cf9a, roughness: 0.92, metalness: 0 }),
        crosswalk: new THREE.MeshStandardMaterial({ color: 0xd8dadd, roughness: 0.88, metalness: 0 }),
        curb: new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: 0.86, metalness: 0.02 }),
        sidewalk: new THREE.MeshStandardMaterial({ color: 0x7a858b, map: this.textures.sidewalk, roughness: 0.92, metalness: 0 }),
        grass: new THREE.MeshStandardMaterial({ color: 0x486f45, roughness: 0.96, metalness: 0 }),
        shrub: new THREE.MeshStandardMaterial({ color: 0x2f6741, roughness: 0.94, metalness: 0 }),
        facadeTrim: new THREE.MeshStandardMaterial({ color: 0x2f3942, roughness: 0.76, metalness: 0.05 }),
        awning: new THREE.MeshStandardMaterial({ color: 0x8f3f3a, roughness: 0.68, metalness: 0.08 }),
        roofMetal: new THREE.MeshStandardMaterial({ color: 0x51606b, roughness: 0.58, metalness: 0.28 }),
        trash: new THREE.MeshStandardMaterial({ color: 0x4d5559, roughness: 0.88, metalness: 0.06 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 0.92, metalness: 0.02 })
      };

      this.addRoadMarkDetails(materials);
      this.addSidewalkAndCurbDetails(materials);
      this.addBuildingVisualDetails(materials);
      this.addVegetationDetailClusters(materials);
      this.addSmallUrbanDetails(materials);
    }

    addRoadMarkDetails(materials) {
      const centerMarks = [];
      for (let z = 150; z < WORLD.height - 130; z += 230) {
        centerMarks.push({ x: 2500, y: 1.18, z, w: 10, h: 0.1, d: 86 });
      }
      for (let x = 150; x < WORLD.width - 130; x += 230) {
        centerMarks.push({ x, y: 1.2, z: 2520, w: 86, h: 0.1, d: 10 });
      }
      for (let x = 905; x < 2220; x += 210) {
        centerMarks.push({ x, y: 1.2, z: 820, w: 78, h: 0.1, d: 8 });
      }
      for (let x = 3270; x < 4420; x += 210) {
        centerMarks.push({ x, y: 1.2, z: 3410, w: 78, h: 0.1, d: 8 });
      }
      this.addInstancedGroundPlaneBatch(centerMarks, materials.lanePaint, { name: 'road-center-markings' });

      const crosswalks = [];
      this.addCrosswalkStripes(crosswalks, 2500, 2292, false);
      this.addCrosswalkStripes(crosswalks, 2500, 2748, false);
      this.addCrosswalkStripes(crosswalks, 2272, 2520, true);
      this.addCrosswalkStripes(crosswalks, 2728, 2520, true);
      this.addCrosswalkStripes(crosswalks, 2300, 820, true);
      this.addCrosswalkStripes(crosswalks, 3180, 3410, true);
      this.addInstancedGroundPlaneBatch(crosswalks, materials.crosswalk, { name: 'crosswalk-stripes' });
    }

    addCrosswalkStripes(entries, x, z, horizontal) {
      for (let i = -4; i <= 4; i += 1) {
        if (horizontal) {
          entries.push({ x: x + i * 17, y: 1.32, z, w: 9, h: 0.12, d: 96 });
        } else {
          entries.push({ x, y: 1.32, z: z + i * 17, w: 96, h: 0.12, d: 9 });
        }
      }
    }

    addSidewalkAndCurbDetails(materials) {
      const sidewalks = [
        { x: 2310, y: 0.64, z: 2500, w: 72, h: 1.2, d: 5000 },
        { x: 2690, y: 0.64, z: 2500, w: 72, h: 1.2, d: 5000 },
        { x: 2500, y: 0.66, z: 2350, w: 5000, h: 1.2, d: 68 },
        { x: 2500, y: 0.66, z: 2690, w: 5000, h: 1.2, d: 68 },
        { x: 1560, y: 0.66, z: 700, w: 1570, h: 1.2, d: 58 },
        { x: 1560, y: 0.66, z: 940, w: 1570, h: 1.2, d: 58 },
        { x: 3840, y: 0.66, z: 3290, w: 1370, h: 1.2, d: 58 },
        { x: 3840, y: 0.66, z: 3530, w: 1370, h: 1.2, d: 58 }
      ];
      this.addInstancedBoxBatch(sidewalks, materials.sidewalk, { name: 'sidewalk-slabs', receiveShadow: true });

      const curbs = [
        { x: 2412, y: 3.2, z: 2500, w: 9, h: 6, d: 5000 },
        { x: 2588, y: 3.2, z: 2500, w: 9, h: 6, d: 5000 },
        { x: 2500, y: 3.2, z: 2432, w: 5000, h: 6, d: 9 },
        { x: 2500, y: 3.2, z: 2608, w: 5000, h: 6, d: 9 },
        { x: 1560, y: 3.2, z: 752, w: 1500, h: 6, d: 8 },
        { x: 1560, y: 3.2, z: 888, w: 1500, h: 6, d: 8 },
        { x: 3180, y: 3.2, z: 3342, w: 1320, h: 6, d: 8 },
        { x: 3180, y: 3.2, z: 3478, w: 1320, h: 6, d: 8 }
      ];
      this.addInstancedBoxBatch(curbs, materials.curb, { name: 'street-curbs', receiveShadow: true });
    }

    addBuildingVisualDetails(materials) {
      const trim = [];
      const awnings = [];
      const vents = [];
      const roofUnits = [];

      for (const building of this.objects) {
        if (building.type !== 'building' || !building.detailed) continue;
        const floors = building.floors || 2;
        const topY = floors * 112 + 12;
        const cx = building.x + building.w / 2;
        const cz = building.y + building.h / 2;

        trim.push({ x: cx, y: 18, z: building.y - 1.6, w: building.w + 18, h: 9, d: 5 });
        trim.push({ x: cx, y: topY - 24, z: building.y - 1.8, w: building.w + 18, h: 10, d: 5 });
        trim.push({ x: building.x - 1.6, y: topY - 24, z: cz, w: 5, h: 10, d: building.h + 14 });
        trim.push({ x: building.x + building.w + 1.6, y: topY - 24, z: cz, w: 5, h: 10, d: building.h + 14 });

        awnings.push({ x: cx, y: 78, z: building.y + building.h + 8, w: Math.min(132, building.w * 0.34), h: 8, d: 34 });
        if (building.floors > 2) {
          awnings.push({ x: building.x + building.w * 0.26, y: 188, z: building.y - 7, w: 84, h: 7, d: 24 });
        }

        vents.push({ x: building.x + building.w * 0.28, y: topY + 10, z: building.y + building.h * 0.34, w: 52, h: 20, d: 32 });
        vents.push({ x: building.x + building.w * 0.68, y: topY + 8, z: building.y + building.h * 0.62, w: 34, h: 16, d: 48 });
        roofUnits.push({ x: building.x + building.w * 0.52, y: topY + 20, z: building.y + building.h * 0.26, w: 88, h: 38, d: 62 });
      }

      this.addInstancedBoxBatch(trim, materials.facadeTrim, { name: 'building-facade-trim', castShadow: false, receiveShadow: true });
      this.addInstancedBoxBatch(awnings, materials.awning, { name: 'building-awnings', castShadow: true, receiveShadow: true });
      this.addInstancedBoxBatch(vents, materials.roofMetal, { name: 'roof-vents', castShadow: false, receiveShadow: true });
      this.addInstancedBoxBatch(roofUnits, materials.roofMetal, { name: 'roof-mechanical-units', castShadow: true, receiveShadow: true });
    }

    addVegetationDetailClusters(materials) {
      const grass = [];
      const shrubs = [];
      const clusters = [
        [420, 2100, 14], [830, 2260, 12], [3880, 980, 14], [4400, 1120, 12],
        [3220, 4320, 16], [3650, 4380, 16], [1940, 3580, 12], [2160, 3720, 12],
        [620, 4500, 10], [4380, 4040, 10]
      ];

      for (const cluster of clusters) {
        const cx = cluster[0];
        const cz = cluster[1];
        const count = cluster[2];
        for (let i = 0; i < count; i += 1) {
          const angle = i * 2.399;
          const distance = randomRange(22, 118);
          const x = cx + Math.cos(angle) * distance;
          const z = cz + Math.sin(angle) * distance;
          grass.push({ x, y: 7, z, w: randomRange(5, 10), h: randomRange(11, 22), d: randomRange(5, 10), rotY: angle });
        }
        shrubs.push({ x: cx + randomRange(-70, 70), y: 15, z: cz + randomRange(-70, 70), w: randomRange(34, 56), h: randomRange(22, 34), d: randomRange(30, 52), rotY: randomRange(0, Math.PI) });
      }

      this.addInstancedBoxBatch(grass, materials.grass, { name: 'grass-tufts', castShadow: false, receiveShadow: true });
      this.addInstancedBoxBatch(shrubs, materials.shrub, { name: 'low-shrub-clumps', castShadow: false, receiveShadow: true });
    }

    addSmallUrbanDetails(materials) {
      const trash = [];
      const concrete = [];
      const bollards = [];

      const litterZones = [
        [1060, 1180], [1690, 1320], [3260, 2920], [3900, 3400],
        [2320, 2380], [2680, 2650], [820, 880], [4320, 2180]
      ];
      for (const zone of litterZones) {
        for (let i = 0; i < 8; i += 1) {
          trash.push({
            x: zone[0] + randomRange(-85, 85),
            y: 2.4,
            z: zone[1] + randomRange(-85, 85),
            w: randomRange(8, 22),
            h: randomRange(1.5, 4),
            d: randomRange(5, 16),
            rotY: randomRange(0, Math.PI)
          });
        }
      }

      const workSites = [
        [2040, 2260], [2840, 2700], [3120, 1800], [1450, 2220]
      ];
      for (const site of workSites) {
        concrete.push({ x: site[0], y: 15, z: site[1], w: 68, h: 30, d: 32, rotY: 0.25 });
        concrete.push({ x: site[0] + 58, y: 12, z: site[1] + 42, w: 44, h: 24, d: 28, rotY: -0.35 });
        concrete.push({ x: site[0] - 52, y: 11, z: site[1] - 30, w: 38, h: 22, d: 34, rotY: 0.7 });
      }

      for (let z = 2340; z <= 2680; z += 44) {
        bollards.push({ x: 2360, y: 13, z, w: 12, h: 26, d: 12 });
        bollards.push({ x: 2640, y: 13, z, w: 12, h: 26, d: 12 });
      }

      this.addInstancedBoxBatch(trash, materials.trash, { name: 'street-litter', castShadow: false, receiveShadow: true });
      this.addInstancedBoxBatch(concrete, materials.concrete, { name: 'visual-concrete-blocks', castShadow: true, receiveShadow: true });
      this.addInstancedBoxBatch(bollards, materials.facadeTrim, { name: 'intersection-bollards', castShadow: false, receiveShadow: true });
    }

    applyWorldDetailQuality() {
      if (this.isDesktopLighting()) {
        this.createDesktopWorldDetailLayer();
      } else {
        this.disposeDesktopWorldDetailLayer();
      }
    }

    createDesktopWorldDetailLayer() {
      if (this.desktopWorldDetailGroup) return;
      this.desktopWorldDetailGroup = new THREE.Group();
      this.desktopWorldDetailGroup.name = 'desktop-world-detail-layer';
      this.group.add(this.desktopWorldDetailGroup);
      const materials = this.getDesktopWorldDetailMaterials();

      this.addDesktopSurfaceVariation(materials);
      this.addDesktopBuildingDepthDetails(materials);
      this.addDesktopWindowDepthDetails(materials);
      this.addDesktopVegetationDetails(materials);
      this.addDesktopAmbientProps(materials);
      this.addDesktopDistantSkyline(materials);
    }

    disposeDesktopWorldDetailLayer() {
      if (!this.desktopWorldDetailGroup) return;
      this.desktopWorldDetailGroup.traverse((child) => {
        if (!child.isMesh && !child.isInstancedMesh) return;
        if (child.geometry && child.geometry !== this.decorBoxGeometry && child.geometry !== this.decorPlaneGeometry) {
          child.geometry.dispose();
        }
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (material && !material.userData.sharedDesktopWorldDetail) material.dispose();
        }
      });
      if (this.desktopWorldDetailGroup.parent) this.desktopWorldDetailGroup.parent.remove(this.desktopWorldDetailGroup);
      this.desktopWorldDetailGroup = null;

      if (this.desktopWorldDetailMaterials) {
        this.desktopWorldDetailMaterials.forEach((material) => material.dispose());
        this.desktopWorldDetailMaterials = null;
      }
      if (this.desktopWorldDetailTextures) {
        this.desktopWorldDetailTextures.forEach((texture) => texture.dispose());
        this.desktopWorldDetailTextures = null;
      }
    }

    getDesktopWorldDetailMaterials() {
      if (this.desktopWorldDetailMaterials) return this.desktopWorldDetailMaterials;
      const normalFine = this.createDesktopDetailNormalTexture('fine');
      const normalCracked = this.createDesktopDetailNormalTexture('cracked');
      const normalFabric = this.createDesktopDetailNormalTexture('leaf');
      const materials = new Map();
      const add = (key, material) => {
        material.userData.sharedDesktopWorldDetail = true;
        materials.set(key, material);
        return material;
      };

      add('roadPatch', new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.96, metalness: 0.01, normalMap: normalFine, normalScale: new THREE.Vector2(0.18, 0.18) }));
      add('dirtDecal', new THREE.MeshBasicMaterial({ color: 0x3d3226, transparent: true, opacity: 0.24, depthWrite: false }));
      add('crackDecal', new THREE.MeshBasicMaterial({ color: 0x080b0d, transparent: true, opacity: 0.34, depthWrite: false }));
      add('concreteDecal', new THREE.MeshBasicMaterial({ color: 0x1d2022, transparent: true, opacity: 0.18, depthWrite: false }));
      add('gravel', new THREE.MeshStandardMaterial({ color: 0x6a6b68, roughness: 0.98, metalness: 0, normalMap: normalCracked, normalScale: new THREE.Vector2(0.12, 0.12) }));
      add('weedA', new THREE.MeshStandardMaterial({ color: 0x315f36, roughness: 0.95, metalness: 0, normalMap: normalFabric, normalScale: new THREE.Vector2(0.08, 0.08) }));
      add('weedB', new THREE.MeshStandardMaterial({ color: 0x486d38, roughness: 0.96, metalness: 0, normalMap: normalFabric, normalScale: new THREE.Vector2(0.08, 0.08) }));
      add('windowGlass', new THREE.MeshStandardMaterial({ color: 0x8fc8ef, roughness: 0.18, metalness: 0.02, transparent: true, opacity: 0.42, envMapIntensity: 0.55, side: THREE.DoubleSide }));
      add('windowDark', new THREE.MeshBasicMaterial({ color: 0x071017, transparent: true, opacity: 0.58, side: THREE.DoubleSide }));
      add('windowFrame', new THREE.MeshStandardMaterial({ color: 0x1d252d, roughness: 0.62, metalness: 0.2 }));
      add('facadeGroove', new THREE.MeshBasicMaterial({ color: 0x10171d, transparent: true, opacity: 0.26 }));
      add('pipeMetal', new THREE.MeshStandardMaterial({ color: 0x38424a, roughness: 0.52, metalness: 0.5, normalMap: normalFine, normalScale: new THREE.Vector2(0.06, 0.06) }));
      add('roofDetail', new THREE.MeshStandardMaterial({ color: 0x29323b, roughness: 0.72, metalness: 0.22 }));
      add('crateDetail', new THREE.MeshStandardMaterial({ color: 0x7b5635, roughness: 0.86, metalness: 0.02, map: this.textures.crate }));
      add('trafficDetail', new THREE.MeshStandardMaterial({ color: 0xd4c06e, roughness: 0.58, metalness: 0.18 }));
      add('skyline', new THREE.MeshStandardMaterial({ color: 0x52606b, roughness: 0.92, metalness: 0.02, transparent: true, opacity: 0.46 }));
      this.desktopWorldDetailMaterials = materials;
      return materials;
    }

    createDesktopDetailNormalTexture(kind) {
      if (!this.desktopWorldDetailTextures) this.desktopWorldDetailTextures = new Map();
      const key = 'normal-' + kind;
      if (this.desktopWorldDetailTextures.has(key)) return this.desktopWorldDetailTextures.get(key);
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      const image = context.createImageData(64, 64);
      const seed = kind.length * 97;
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const i = (y * 64 + x) * 4;
          const wave = kind === 'cracked' ? Math.sin(x * 0.9 + y * 0.3) * 13 : kind === 'leaf' ? Math.sin(y * 1.2) * 10 : Math.sin((x + y) * 0.42) * 7;
          const grainSeed = Math.sin((x * 12.9898 + y * 78.233 + seed) * 0.18) * 43758.5453;
          const grain = (grainSeed - Math.floor(grainSeed) - 0.5) * 18;
          image.data[i] = clamp(128 + wave + grain, 88, 168);
          image.data[i + 1] = clamp(128 - wave * 0.42 + grain * 0.5, 88, 168);
          image.data[i + 2] = 226;
          image.data[i + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      this.desktopWorldDetailTextures.set(key, texture);
      return texture;
    }

    addDesktopSurfaceVariation(materials) {
      const parent = this.desktopWorldDetailGroup;
      const cracks = [];
      const stains = [];
      const concreteMarks = [];
      const roadPatches = [];
      const gravel = [];
      const roadZones = [
        [2500, 2520, 520, 5000], [2500, 2520, 5000, 520], [1560, 820, 1600, 300], [3820, 3410, 1450, 300]
      ];
      for (const zone of roadZones) {
        for (let i = 0; i < 18; i += 1) {
          roadPatches.push({ x: zone[0] + randomRange(-zone[2] * 0.45, zone[2] * 0.45), y: 1.48, z: zone[1] + randomRange(-zone[3] * 0.45, zone[3] * 0.45), w: randomRange(38, 112), h: 0.16, d: randomRange(14, 46), rotY: randomRange(0, Math.PI) });
          cracks.push({ x: zone[0] + randomRange(-zone[2] * 0.48, zone[2] * 0.48), y: 1.72, z: zone[1] + randomRange(-zone[3] * 0.48, zone[3] * 0.48), w: randomRange(70, 190), h: 0.08, d: randomRange(3, 7), rotY: randomRange(0, Math.PI) });
        }
      }

      const dirtZones = [[820, 2260], [3930, 1040], [3400, 4350], [2050, 3600], [1100, 1320], [3860, 2180]];
      for (const zone of dirtZones) {
        for (let i = 0; i < 16; i += 1) {
          stains.push({ x: zone[0] + randomRange(-180, 180), y: 1.52, z: zone[1] + randomRange(-150, 150), w: randomRange(44, 140), h: 0.1, d: randomRange(28, 118), rotY: randomRange(0, Math.PI) });
          gravel.push({ x: zone[0] + randomRange(-170, 170), y: 3.4, z: zone[1] + randomRange(-145, 145), w: randomRange(4, 10), h: randomRange(1.6, 4.6), d: randomRange(4, 12), rotY: randomRange(0, Math.PI) });
        }
      }

      for (const building of this.objects) {
        if (building.type !== 'building' || !building.detailed) continue;
        concreteMarks.push({ x: building.x + building.w * 0.5, y: 1.62, z: building.y + building.h + 22, w: Math.min(190, building.w * 0.52), h: 0.08, d: 28, rotY: 0 });
        concreteMarks.push({ x: building.x - 18, y: 1.62, z: building.y + building.h * 0.5, w: 24, h: 0.08, d: Math.min(170, building.h * 0.48), rotY: 0 });
      }

      this.addInstancedBoxBatch(roadPatches, materials.get('roadPatch'), { name: 'desktop-road-patches', castShadow: false, receiveShadow: true, parent });
      this.addInstancedGroundPlaneBatch(cracks, materials.get('crackDecal'), { name: 'desktop-road-cracks', parent });
      this.addInstancedGroundPlaneBatch(stains, materials.get('dirtDecal'), { name: 'desktop-dirt-stains', parent });
      this.addInstancedGroundPlaneBatch(concreteMarks, materials.get('concreteDecal'), { name: 'desktop-concrete-wear-decals', parent });
      this.addInstancedBoxBatch(gravel, materials.get('gravel'), { name: 'desktop-gravel-pebbles', castShadow: false, receiveShadow: true, parent });
    }

    addDesktopBuildingDepthDetails(materials) {
      const parent = this.desktopWorldDetailGroup;
      const frames = [];
      const grooves = [];
      const pipes = [];
      const roofEdges = [];
      const roofSmall = [];

      for (const building of this.objects) {
        if (building.type !== 'building' || !building.detailed) continue;
        const floors = building.floors || 2;
        const floorHeight = 112;
        const topY = floors * floorHeight + 10;
        const count = Math.max(2, Math.floor(building.w / 110));

        roofEdges.push({ x: building.x + building.w / 2, y: topY + 14, z: building.y - 12, w: building.w + 42, h: 10, d: 10 });
        roofEdges.push({ x: building.x + building.w / 2, y: topY + 14, z: building.y + building.h + 12, w: building.w + 42, h: 10, d: 10 });
        roofEdges.push({ x: building.x - 12, y: topY + 14, z: building.y + building.h / 2, w: 10, h: 10, d: building.h + 42 });
        roofEdges.push({ x: building.x + building.w + 12, y: topY + 14, z: building.y + building.h / 2, w: 10, h: 10, d: building.h + 42 });

        pipes.push({ x: building.x + building.w + 6, y: topY * 0.52, z: building.y + building.h * 0.24, w: 8, h: topY * 0.8, d: 8 });
        pipes.push({ x: building.x - 6, y: topY * 0.54, z: building.y + building.h * 0.76, w: 7, h: topY * 0.72, d: 7 });
        roofSmall.push({ x: building.x + building.w * 0.22, y: topY + 25, z: building.y + building.h * 0.72, w: 42, h: 28, d: 42, rotY: 0.4 });
        roofSmall.push({ x: building.x + building.w * 0.78, y: topY + 18, z: building.y + building.h * 0.28, w: 28, h: 22, d: 34, rotY: -0.2 });

        for (let floor = 0; floor < floors; floor += 1) {
          const y = floor * floorHeight + 58;
          grooves.push({ x: building.x + building.w / 2, y: y - 29, z: building.y - 2.8, w: building.w - 26, h: 4, d: 3 });
          grooves.push({ x: building.x + building.w / 2, y: y + 31, z: building.y + building.h + 2.8, w: building.w - 26, h: 4, d: 3 });
          for (let i = 0; i < count; i += 1) {
            const x = building.x + 58 + i * ((building.w - 116) / Math.max(1, count - 1));
            frames.push({ x, y: y + 18, z: building.y - 3.2, w: 46, h: 4, d: 5 });
            frames.push({ x, y: y - 18, z: building.y - 3.2, w: 46, h: 4, d: 5 });
            frames.push({ x: x - 23, y, z: building.y - 3.2, w: 4, h: 38, d: 5 });
            frames.push({ x: x + 23, y, z: building.y - 3.2, w: 4, h: 38, d: 5 });
            frames.push({ x, y: y + 18, z: building.y + building.h + 3.2, w: 46, h: 4, d: 5 });
            frames.push({ x, y: y - 18, z: building.y + building.h + 3.2, w: 46, h: 4, d: 5 });
          }
        }
      }

      this.addInstancedBoxBatch(frames, materials.get('windowFrame'), { name: 'desktop-window-frames', castShadow: false, receiveShadow: true, parent });
      this.addInstancedBoxBatch(grooves, materials.get('facadeGroove'), { name: 'desktop-facade-grooves', castShadow: false, receiveShadow: false, parent });
      this.addInstancedBoxBatch(pipes, materials.get('pipeMetal'), { name: 'desktop-building-pipes', castShadow: true, receiveShadow: true, parent });
      this.addInstancedBoxBatch(roofEdges, materials.get('roofDetail'), { name: 'desktop-roof-edge-details', castShadow: true, receiveShadow: true, parent });
      this.addInstancedBoxBatch(roofSmall, materials.get('roofDetail'), { name: 'desktop-roof-small-objects', castShadow: true, receiveShadow: true, parent });
    }

    addDesktopWindowDepthDetails(materials) {
      const parent = this.desktopWorldDetailGroup;
      const glass = [];
      const darkBacks = [];
      for (const building of this.objects) {
        if (building.type !== 'building' || !building.detailed) continue;
        const floors = building.floors || 2;
        const count = Math.max(2, Math.floor(building.w / 110));
        for (let floor = 0; floor < floors; floor += 1) {
          const y = floor * 112 + 58;
          for (let i = 0; i < count; i += 1) {
            const x = building.x + 58 + i * ((building.w - 116) / Math.max(1, count - 1));
            glass.push({ x, y, z: building.y - 1.9, w: 31, d: 23, rotY: 0 });
            darkBacks.push({ x, y, z: building.y - 2.6, w: 33, d: 25, rotY: 0 });
            glass.push({ x, y, z: building.y + building.h + 1.9, w: 31, d: 23, rotY: Math.PI });
            darkBacks.push({ x, y, z: building.y + building.h + 2.6, w: 33, d: 25, rotY: Math.PI });
          }
          glass.push({ x: building.x - 1.9, y, z: building.y + building.h * 0.62, w: 31, d: 23, rotY: Math.PI / 2 });
          darkBacks.push({ x: building.x - 2.6, y, z: building.y + building.h * 0.62, w: 33, d: 25, rotY: Math.PI / 2 });
          glass.push({ x: building.x + building.w + 1.9, y, z: building.y + building.h * 0.42, w: 31, d: 23, rotY: -Math.PI / 2 });
          darkBacks.push({ x: building.x + building.w + 2.6, y, z: building.y + building.h * 0.42, w: 33, d: 25, rotY: -Math.PI / 2 });
        }
      }
      this.addInstancedVerticalPlaneBatch(darkBacks, materials.get('windowDark'), { name: 'desktop-window-interior-depth', parent });
      this.addInstancedVerticalPlaneBatch(glass, materials.get('windowGlass'), { name: 'desktop-window-glass-sheen', parent });
    }

    addDesktopVegetationDetails(materials) {
      const parent = this.desktopWorldDetailGroup;
      const weedsA = [];
      const weedsB = [];
      const treeLowLeaves = [];
      const clusters = [[420, 2100], [780, 2350], [3860, 820], [4540, 1240], [3220, 4300], [3760, 4300], [1980, 3480], [2180, 3640]];
      for (const cluster of clusters) {
        for (let i = 0; i < 18; i += 1) {
          const angle = i * 2.399 + randomRange(-0.35, 0.35);
          const distance = randomRange(42, 170);
          const entry = { x: cluster[0] + Math.cos(angle) * distance, y: randomRange(8, 15), z: cluster[1] + Math.sin(angle) * distance, w: randomRange(6, 14), h: randomRange(14, 34), d: randomRange(5, 11), rotY: angle };
          (i % 2 ? weedsA : weedsB).push(entry);
        }
      }
      for (const tree of this.objects) {
        if (tree.type !== 'tree') continue;
        for (let i = 0; i < 3; i += 1) {
          const angle = i * 2.1 + randomRange(-0.25, 0.25);
          treeLowLeaves.push({ x: tree.x + Math.cos(angle) * tree.r * 0.34, y: 76 + i * 7, z: tree.y + Math.sin(angle) * tree.r * 0.34, w: tree.r * randomRange(0.52, 0.82), h: tree.r * randomRange(0.32, 0.48), d: tree.r * randomRange(0.5, 0.8), rotY: angle });
        }
      }
      this.addInstancedBoxBatch(weedsA, materials.get('weedA'), { name: 'desktop-weeds-a', castShadow: false, receiveShadow: true, parent });
      this.addInstancedBoxBatch(weedsB, materials.get('weedB'), { name: 'desktop-weeds-b', castShadow: false, receiveShadow: true, parent });
      this.addInstancedBoxBatch(treeLowLeaves, materials.get('weedA'), { name: 'desktop-tree-shape-variation', castShadow: false, receiveShadow: true, parent });
    }

    addDesktopAmbientProps(materials) {
      const parent = this.desktopWorldDetailGroup;
      const crates = [];
      const signs = [];
      const utility = [];
      const propZones = [[1180, 1260], [1820, 1420], [3260, 3020], [3920, 2160], [2360, 2380], [2680, 2640], [860, 860]];
      for (const zone of propZones) {
        crates.push({ x: zone[0] + randomRange(-34, 34), y: 13, z: zone[1] + randomRange(-34, 34), w: 30, h: 26, d: 28, rotY: randomRange(0, Math.PI) });
        crates.push({ x: zone[0] + randomRange(-58, 58), y: 8, z: zone[1] + randomRange(-58, 58), w: 22, h: 16, d: 24, rotY: randomRange(0, Math.PI) });
        utility.push({ x: zone[0] + randomRange(-75, 75), y: 22, z: zone[1] + randomRange(-75, 75), w: 18, h: 44, d: 16, rotY: randomRange(0, Math.PI) });
      }
      for (let z = 2200; z <= 2860; z += 130) {
        signs.push({ x: 2440, y: 36, z, w: 34, h: 46, d: 3, rotY: Math.PI * 0.5 });
        signs.push({ x: 2560, y: 36, z, w: 34, h: 46, d: 3, rotY: -Math.PI * 0.5 });
      }
      this.addInstancedBoxBatch(crates, materials.get('crateDetail'), { name: 'desktop-noncollision-crate-dressing', castShadow: false, receiveShadow: true, parent });
      this.addInstancedBoxBatch(signs, materials.get('trafficDetail'), { name: 'desktop-road-sign-panels', castShadow: false, receiveShadow: true, parent });
      this.addInstancedBoxBatch(utility, materials.get('pipeMetal'), { name: 'desktop-utility-boxes', castShadow: false, receiveShadow: true, parent });
    }

    addDesktopDistantSkyline(materials) {
      const parent = this.desktopWorldDetailGroup;
      const skyline = [];
      for (let i = 0; i < 34; i += 1) {
        const x = 120 + i * 145;
        const h = randomRange(130, 360);
        skyline.push({ x, y: h * 0.5, z: -420, w: randomRange(70, 130), h, d: randomRange(60, 130), rotY: randomRange(-0.05, 0.05) });
        skyline.push({ x, y: h * 0.45, z: WORLD.height + 420, w: randomRange(70, 140), h: h * randomRange(0.72, 1.1), d: randomRange(60, 130), rotY: randomRange(-0.05, 0.05) });
      }
      for (let i = 0; i < 24; i += 1) {
        const z = 150 + i * 195;
        skyline.push({ x: -420, y: randomRange(70, 180), z, w: randomRange(70, 130), h: randomRange(140, 320), d: randomRange(70, 140), rotY: randomRange(-0.05, 0.05) });
        skyline.push({ x: WORLD.width + 420, y: randomRange(70, 180), z, w: randomRange(70, 130), h: randomRange(140, 320), d: randomRange(70, 140), rotY: randomRange(-0.05, 0.05) });
      }
      this.addInstancedBoxBatch(skyline, materials.get('skyline'), { name: 'desktop-distant-skyline', castShadow: false, receiveShadow: false, parent });
    }

    addInstancedBoxBatch(entries, material, options) {
      if (!entries.length) return null;
      const mesh = new THREE.InstancedMesh(this.decorBoxGeometry, material, entries.length);
      mesh.name = options && options.name ? options.name : 'visual-detail-batch';
      mesh.castShadow = options && options.castShadow !== undefined ? options.castShadow : false;
      mesh.receiveShadow = options && options.receiveShadow !== undefined ? options.receiveShadow : true;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.visualDetail = true;

      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        this.decorBatchPosition.set(entry.x, entry.y, entry.z);
        this.decorBatchQuaternion.setFromAxisAngle(WORLD_UP, entry.rotY || 0);
        this.decorBatchScale.set(entry.w, entry.h, entry.d);
        this.decorBatchMatrix.compose(this.decorBatchPosition, this.decorBatchQuaternion, this.decorBatchScale);
        mesh.setMatrixAt(i, this.decorBatchMatrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.computeBoundingSphere) mesh.computeBoundingSphere();
      const parent = options && options.parent ? options.parent : this.group;
      parent.add(mesh);
      return mesh;
    }

    addInstancedGroundPlaneBatch(entries, material, options) {
      if (!entries.length) return null;
      const mesh = new THREE.InstancedMesh(this.decorPlaneGeometry, material, entries.length);
      mesh.name = options && options.name ? options.name : 'visual-ground-detail-batch';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.visualDetail = true;

      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        this.decorBatchPosition.set(entry.x, entry.y, entry.z);
        this.decorBatchEuler.set(-Math.PI / 2, 0, entry.rotY || 0);
        this.decorBatchQuaternion.setFromEuler(this.decorBatchEuler);
        this.decorBatchScale.set(entry.w, entry.d, 1);
        this.decorBatchMatrix.compose(this.decorBatchPosition, this.decorBatchQuaternion, this.decorBatchScale);
        mesh.setMatrixAt(i, this.decorBatchMatrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.computeBoundingSphere) mesh.computeBoundingSphere();
      const parent = options && options.parent ? options.parent : this.group;
      parent.add(mesh);
      return mesh;
    }

    addInstancedVerticalPlaneBatch(entries, material, options) {
      if (!entries.length) return null;
      const mesh = new THREE.InstancedMesh(this.decorPlaneGeometry, material, entries.length);
      mesh.name = options && options.name ? options.name : 'visual-vertical-plane-batch';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.visualDetail = true;

      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        this.decorBatchPosition.set(entry.x, entry.y, entry.z);
        this.decorBatchEuler.set(0, entry.rotY || 0, 0);
        this.decorBatchQuaternion.setFromEuler(this.decorBatchEuler);
        this.decorBatchScale.set(entry.w, entry.d, 1);
        this.decorBatchMatrix.compose(this.decorBatchPosition, this.decorBatchQuaternion, this.decorBatchScale);
        mesh.setMatrixAt(i, this.decorBatchMatrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.computeBoundingSphere) mesh.computeBoundingSphere();
      const parent = options && options.parent ? options.parent : this.group;
      parent.add(mesh);
      return mesh;
    }

    buildSpatialIndex() {
      this.spatialGrid.clear();
      this.dynamicCollisionObjects.length = 0;

      for (const object of this.objects) {
        if (object.physics || object.type === 'door' || object.type === 'gate' || object.type === 'containerDoor') {
          this.dynamicCollisionObjects.push(object);
          continue;
        }

        this.addObjectToSpatialIndex(object);
      }
    }

    addObjectToSpatialIndex(object) {
      const bounds = this.getObjectBounds2D(object, 12);
      const minCellX = Math.floor(bounds.minX / this.spatialCellSize);
      const maxCellX = Math.floor(bounds.maxX / this.spatialCellSize);
      const minCellZ = Math.floor(bounds.minZ / this.spatialCellSize);
      const maxCellZ = Math.floor(bounds.maxZ / this.spatialCellSize);

      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const key = cellX + ':' + cellZ;
          let bucket = this.spatialGrid.get(key);
          if (!bucket) {
            bucket = [];
            this.spatialGrid.set(key, bucket);
          }
          bucket.push(object);
        }
      }
    }

    getObjectBounds2D(object, padding) {
      const pad = padding || 0;
      if (object.shape === 'circle') {
        return {
          minX: object.x - object.r - pad,
          maxX: object.x + object.r + pad,
          minZ: object.y - object.r - pad,
          maxZ: object.y + object.r + pad
        };
      }

      return {
        minX: object.x - pad,
        maxX: object.x + object.w + pad,
        minZ: object.y - pad,
        maxZ: object.y + object.h + pad
      };
    }

    getSpatialCandidatesInBounds(minX, minZ, maxX, maxZ) {
      this.spatialQueryId += 1;
      const queryId = this.spatialQueryId;
      const candidates = [];
      const minCellX = Math.floor(minX / this.spatialCellSize);
      const maxCellX = Math.floor(maxX / this.spatialCellSize);
      const minCellZ = Math.floor(minZ / this.spatialCellSize);
      const maxCellZ = Math.floor(maxZ / this.spatialCellSize);

      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const bucket = this.spatialGrid.get(cellX + ':' + cellZ);
          if (!bucket) continue;

          for (const object of bucket) {
            if (object._spatialQueryId === queryId) continue;
            object._spatialQueryId = queryId;
            candidates.push(object);
          }
        }
      }

      for (const object of this.dynamicCollisionObjects) {
        if (object._spatialQueryId === queryId) continue;
        object._spatialQueryId = queryId;
        candidates.push(object);
      }

      return candidates;
    }

    getSpatialCandidates(x, z, radius) {
      return this.getSpatialCandidatesInBounds(x - radius, z - radius, x + radius, z + radius);
    }

    buildRectObject(object) {
      if (object.type === 'building' && object.detailed) {
        this.buildDetailedBuilding(object);
        return;
      }

      const settings = this.getObjectSettings(object);

      if (object.type === 'door') {
        this.buildDoorObject(object, settings);
        return;
      }

      if (this.buildInteractiveObject(object, settings)) {
        return;
      }

      const material = new THREE.MeshStandardMaterial({
        color: settings.color,
        map: settings.texture || null,
        roughness: settings.roughness,
        metalness: settings.metalness
      });
      const mesh = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2, object.w, settings.height, object.h, object.floorY || 0, material);
      mesh.castShadow = object.type !== 'road';
      mesh.receiveShadow = true;
      if (object.type === 'door' || object.physics) {
        object.mesh = mesh;
      }

      if (object.type !== 'road') {
        this.addContactShadow(object);
      }

      if (object.type === 'building') {
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(object.w + 16, 10, object.h + 16),
          new THREE.MeshStandardMaterial({ color: 0x394450, roughness: 0.85 })
        );
        roof.position.set(object.x + object.w / 2, settings.height + 5, object.y + object.h / 2);
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.group.add(roof);
        this.addRoofParapet(object, settings.height);
        this.addWindows(object, settings.height);
      }

      if (object.type === 'ladder') {
        this.addExteriorStairDetails(object);
      }

      if (object.type === 'stairs') {
        this.addStairsDetails(object);
      }

      if (object.destructible) {
        object.mesh = mesh;
        object.maxHealth = object.maxHealth || object.health || 60;
      }

      if (object.type === 'crate' || object.type === 'container') {
        const edge = new THREE.EdgesGeometry(mesh.geometry);
        const lines = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0xbd9668 }));
        lines.position.copy(mesh.position);
        this.group.add(lines);
      }

      if (object.type === 'fence') {
        this.addFencePosts(object, settings.height);
      }
    }

    getObjectSettings(object) {
      const settings = {
        road: { color: 0x2b323b, height: 1, roughness: 0.9, metalness: 0, texture: this.textures.road },
        wall: { color: 0x3b4652, height: 86, roughness: 0.75, metalness: 0.04 },
        fence: { color: 0x5d6975, height: 58, roughness: 0.65, metalness: 0.32 },
        building: { color: 0x777f88, height: object.height || 180, roughness: 0.66, metalness: 0.04, texture: this.textures.concrete },
        crate: { color: 0xc1905b, height: 62, roughness: 0.82, metalness: 0.03, texture: this.textures.crate },
        container: { color: object.x % 2 ? 0x4b7792 : 0x904c48, height: object.height || 86, roughness: 0.58, metalness: 0.35, texture: object.x % 2 ? this.textures.containerBlue : this.textures.containerRed },
        cover: { color: 0x656d76, height: 54, roughness: 0.78, metalness: 0.08 },
        ladder: { color: 0x27323d, height: 6, roughness: 0.72, metalness: 0.2 },
        stairs: { color: 0x46525f, height: 8, roughness: 0.78, metalness: 0.05 },
        door: { color: 0x60452f, height: object.height || 92, roughness: 0.78, metalness: 0.04 },
        glassWindow: { color: 0x9fd5ff, height: object.height || 74, roughness: 0.08, metalness: 0.02 },
        openCrate: { color: 0x9b7145, height: object.height || 52, roughness: 0.84, metalness: 0.02, texture: this.textures.crate },
        woodCrate: { color: 0x9b7145, height: object.height || 56, roughness: 0.84, metalness: 0.02, texture: this.textures.crate },
        woodObstacle: { color: 0x7b5534, height: object.height || 48, roughness: 0.86, metalness: 0.02, texture: this.textures.crate },
        woodFenceBreakable: { color: 0x6b4a2f, height: object.height || 52, roughness: 0.82, metalness: 0.02 },
        buildingWall: { color: object.color || 0x777f88, height: object.height || 180, roughness: 0.7, metalness: 0.02, texture: this.textures.concrete },
        interiorWall: { color: 0x6d747a, height: object.height || 92, roughness: 0.78, metalness: 0.02 },
        table: { color: object.color || 0x6b513a, height: object.height || 32, roughness: 0.8, metalness: 0.02 },
        cabinet: { color: object.color || 0x4a3d34, height: object.height || 78, roughness: 0.72, metalness: 0.04 },
        box: { color: object.color || 0x8a6844, height: object.height || 38, roughness: 0.82, metalness: 0.03, texture: this.textures.crate },
        bench: { color: object.color || 0x5f6f73, height: object.height || 28, roughness: 0.82, metalness: 0.08 },
        chair: { color: 0x6b513a, height: object.height || 44, roughness: 0.82, metalness: 0.02 },
        roadSign: { color: 0xe8e0ce, height: object.height || 92, roughness: 0.5, metalness: 0.35 },
        smallContainer: { color: 0x3c6178, height: object.height || 58, roughness: 0.58, metalness: 0.36, texture: this.textures.containerBlue },
        streetLamp: { color: 0x242b31, height: object.height || 82, roughness: 0.58, metalness: 0.35 },
        dumpster: { color: 0x2f5663, height: object.height || 46, roughness: 0.72, metalness: 0.25 },
        tree: { color: 0x2d5f45, height: Math.max(120, object.r * 2.4), roughness: 0.86, metalness: 0 },
        rock: { color: 0x5a5d65, height: object.r * 0.95, roughness: 0.96, metalness: 0 }
      }[object.type] || { color: 0x3b4652, height: object.height || 70, roughness: 0.78, metalness: 0 };

      return settings;
    }

    buildInteractiveObject(object, settings) {
      if (!object.interactive && object.type !== 'breakableLamp' && object.type !== 'gate') return false;

      if (object.type === 'openCrate') {
        const material = new THREE.MeshStandardMaterial({ color: settings.color, map: settings.texture, roughness: settings.roughness, metalness: settings.metalness });
        const base = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2, object.w, settings.height, object.h, object.floorY || 0, material);
        const lid = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2 - object.h / 2, object.w, 8, object.h, (object.floorY || 0) + settings.height, material.clone());
        lid.geometry.translate(0, 0, object.h / 2);
        lid.position.z = object.y;
        object.mesh = base;
        object.lidMesh = lid;
        this.addContactShadow(object);
        return true;
      }

      if (object.type === 'cabinet') {
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3d34, roughness: 0.72, metalness: 0.04 });
        const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x6b513a, roughness: 0.78, metalness: 0.04 });
        const body = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2, object.w, settings.height, object.h, object.floorY || 0, bodyMaterial);
        const door = this.addBoxAt(object.x + 3, object.y + object.h / 2, 6, settings.height * 0.9, object.h, (object.floorY || 0) + 3, doorMaterial);
        door.geometry.translate(0, 0, object.h / 2);
        door.position.z = object.y;
        object.mesh = body;
        object.doorMesh = door;
        return true;
      }

      if (object.type === 'containerDoor' || object.type === 'gate') {
        const material = new THREE.MeshStandardMaterial({ color: object.type === 'gate' ? 0x38454f : 0x243b4c, roughness: 0.58, metalness: 0.38 });
        const mesh = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2, object.w, settings.height, object.h, object.floorY || 0, material);
        mesh.geometry.translate(object.type === 'containerDoor' ? object.w / 2 : 0, 0, 0);
        if (object.type === 'containerDoor') mesh.position.x = object.x;
        object.mesh = mesh;
        this.addContactShadow(object);
        return true;
      }

      if (object.type === 'lightSwitch') {
        const material = new THREE.MeshStandardMaterial({ color: 0xe8e0ce, roughness: 0.6, metalness: 0.08 });
        object.mesh = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2, object.w, object.height, object.h, object.floorY || 0, material);
        return true;
      }

      if (object.type === 'computer') {
        const body = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2, object.w, object.height, object.h, object.floorY || 0, new THREE.MeshStandardMaterial({ color: 0x151b22, roughness: 0.5, metalness: 0.35 }));
        const screen = this.addBoxAt(object.x + object.w / 2, object.y + 1, object.w * 0.78, object.height * 0.58, 3, (object.floorY || 0) + object.height * 0.25, new THREE.MeshBasicMaterial({ color: 0x10384a }));
        object.mesh = body;
        object.screenMesh = screen;
        return true;
      }

      if (object.type === 'redButton') {
        const base = this.addBoxAt(object.x + object.w / 2, object.y + object.h / 2, object.w, 14, object.h, object.floorY || 0, new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.55, metalness: 0.35 }));
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(15, 17, 12, 18), new THREE.MeshStandardMaterial({ color: 0xcc1f2e, roughness: 0.45, metalness: 0.12, emissive: 0x420008, emissiveIntensity: 0.15 }));
        cap.position.set(object.x + object.w / 2, 22, object.y + object.h / 2);
        cap.castShadow = true;
        this.group.add(cap);
        object.mesh = base;
        object.capMesh = cap;
        return true;
      }

      return false;
    }

    buildCircleObject(object) {
      if (object.type === 'tree') {
        const lod = new THREE.LOD();
        lod.position.set(object.x, 0, object.y);

        const nearTree = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(object.r * 0.24, object.r * 0.32, 58, 10),
          new THREE.MeshStandardMaterial({ color: 0x6f4b2e, roughness: 0.9 })
        );
        trunk.position.set(0, 29, 0);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        nearTree.add(trunk);

        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(object.r, object.r * 2.1, 10),
          new THREE.MeshStandardMaterial({ color: 0x2d5f45, roughness: 0.8 })
        );
        crown.position.set(0, 90, 0);
        crown.castShadow = true;
        crown.receiveShadow = true;
        nearTree.add(crown);

        const farTree = new THREE.Mesh(
          new THREE.ConeGeometry(object.r * 0.92, object.r * 2.6, 6),
          new THREE.MeshStandardMaterial({ color: 0x2d5f45, roughness: 0.86 })
        );
        farTree.position.set(0, 72, 0);
        farTree.castShadow = false;
        farTree.receiveShadow = true;

        lod.addLevel(nearTree, 0);
        lod.addLevel(farTree, 950);
        lod.frustumCulled = true;
        this.group.add(lod);
        object.mesh = lod;
        object.crownMesh = crown;
        this.weatherTargets.trees.push(object);
        this.addContactShadow(object);
        return;
      }

      if (object.type === 'barrel') {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(object.r, object.r, object.height || 72, 18),
          new THREE.MeshStandardMaterial({ color: 0x8a2f2f, roughness: 0.54, metalness: 0.38 })
        );
        barrel.position.set(object.x, (object.height || 72) / 2, object.y);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        this.group.add(barrel);
        const bandMaterial = new THREE.MeshStandardMaterial({ color: 0x2b323b, roughness: 0.45, metalness: 0.55 });
        for (const y of [18, 54]) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(object.r * 1.02, 2.4, 6, 18), bandMaterial);
          band.rotation.x = Math.PI / 2;
          band.position.set(object.x, y, object.y);
          this.group.add(band);
        }
        object.mesh = barrel;
        object.velocityX = object.velocityX || 0;
        object.velocityZ = object.velocityZ || 0;
        object.velocityY = object.velocityY || 0;
        object.angularVelocity = object.angularVelocity || 0;
        object.maxHealth = object.maxHealth || object.health || 150;
        this.addContactShadow(object);
        return;
      }

      if (object.type === 'breakableLamp') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(4, 5, object.height || 118, 10),
          new THREE.MeshStandardMaterial({ color: 0x242b31, roughness: 0.58, metalness: 0.42 })
        );
        pole.position.set(object.x, (object.height || 118) / 2, object.y);
        pole.castShadow = true;
        pole.receiveShadow = true;
        this.group.add(pole);

        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(13, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0xffe3a8 })
        );
        bulb.position.set(object.x, (object.height || 118) + 8, object.y);
        this.group.add(bulb);

        const light = new THREE.PointLight(0xffd69a, 0, 420, 1.7);
        light.position.copy(bulb.position);
        light.visible = false;
        this.group.add(light);
        object.mesh = bulb;
        object.poleMesh = pole;
        object.light = light;
        object.baseLightIntensity = 0.85;
        object.bulbMaterial = bulb.material;
        this.weatherTargets.streetLights.push(object);
        object.maxHealth = object.maxHealth || object.health || 28;
        return;
      }

      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(object.r, 0),
        new THREE.MeshStandardMaterial({ color: 0x5a5d65, roughness: 0.96 })
      );
      rock.position.set(object.x, object.r * 0.55, object.y);
      rock.scale.y = 0.78;
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
      this.addContactShadow(object);
    }

    addWindows(object, height) {
      const material = new THREE.MeshBasicMaterial({ color: 0x9fd5ff, transparent: true, opacity: 0.46 });
      const rows = Math.max(1, Math.floor(height / 70));
      const cols = Math.max(2, Math.floor(object.w / 80));

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(28, 18), material);
          windowMesh.position.set(object.x + 40 + col * 70, 48 + row * 52, object.y - 0.4);
          windowMesh.rotation.y = Math.PI;
          this.group.add(windowMesh);
        }
      }
    }

    buildDetailedBuilding(object) {
      const floors = object.floors || 2;
      const floorHeight = 112;
      const wallColor = object.color || 0x777f88;
      const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5962, roughness: 0.88 });
      const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x505b64, roughness: 0.9 });
      const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x303944, map: this.textures.roof, roughness: 0.84 });
      const stairOpening = this.getBuildingStairOpening(object);

      for (let floor = 0; floor < floors; floor += 1) {
        const level = floor * floorHeight;
        this.addSlabWithOpening(object, object.w + 2, object.h + 2, 9, level, floorMaterial, floor > 0 ? stairOpening : null);
        this.addSlabWithOpening(object, object.w + 8, object.h + 8, 20, level + floorHeight - 20, ceilingMaterial, stairOpening);
      }

      this.addSlabWithOpening(object, object.w + 22, object.h + 22, 22, floors * floorHeight - 4, roofMaterial, stairOpening);
      this.addStairConnectorPlatforms(object, floorHeight, floors);
      this.addRoofParapet(object, floors * floorHeight);
      this.addBuildingWindows(object, wallColor);
      for (let floor = 0; floor < floors; floor += 1) {
        this.addInteriorLights(object, floor * floorHeight, floor);
      }
    }

    addStairConnectorPlatforms(object, floorHeight, floors) {
      const material = new THREE.MeshStandardMaterial({ color: 0x58636f, roughness: 0.84, metalness: 0.02 });
      const stairRun = Math.min(260, object.h - 92);
      const stairWidth = Math.min(118, Math.max(88, object.w * 0.24));
      const stairY = object.y + 40;
      const rightX = this.getBuildingStairX(object, stairWidth, 0);
      const leftX = this.getBuildingStairX(object, stairWidth, 1);
      const minX = Math.min(leftX, rightX);
      const maxX = Math.max(leftX + stairWidth, rightX + stairWidth);
      const centerX = (minX + maxX) / 2;
      const width = maxX - minX;

      for (let levelIndex = 1; levelIndex <= floors; levelIndex += 1) {
        const previousDirection = (levelIndex - 1) % 2 === 0 ? 'south' : 'north';
        const centerZ = previousDirection === 'south' ? stairY + stairRun : stairY;
        this.addBoxAt(centerX, centerZ, width, 9, 46, levelIndex * floorHeight, material);
      }
    }

    getBuildingStairOpening(object) {
      const stairRun = Math.min(260, object.h - 92);
      const stairWidth = Math.min(118, Math.max(88, object.w * 0.24));
      const marginX = 18;
      const marginZ = 30;
      const rightX = this.getBuildingStairX(object, stairWidth, 0);
      const leftX = this.getBuildingStairX(object, stairWidth, 1);
      const minX = Math.min(leftX, rightX);
      const maxX = Math.max(leftX + stairWidth, rightX + stairWidth);
      return {
        x: minX - marginX,
        y: object.y + 40 - marginZ,
        w: maxX - minX + marginX * 2,
        h: stairRun + marginZ * 2
      };
    }

    getBuildingStairX(building, stairWidth, floor) {
      const rightX = building.x + building.w - stairWidth - 34;
      const leftX = rightX - stairWidth - 24;
      return floor % 2 === 0 ? rightX : Math.max(building.x + 42, leftX);
    }

    addSlabWithOpening(building, width, depth, height, baseY, material, opening) {
      if (!opening) {
        this.addBoxAt(building.x + building.w / 2, building.y + building.h / 2, width, height, depth, baseY, material);
        return;
      }

      const slab = {
        x: building.x + building.w / 2 - width / 2,
        y: building.y + building.h / 2 - depth / 2,
        w: width,
        h: depth
      };
      const pieces = this.getSlabPieces(slab, opening);

      for (const piece of pieces) {
        if (piece.w <= 4 || piece.d <= 4) continue;
        this.addBoxAt(piece.x + piece.w / 2, piece.z + piece.d / 2, piece.w, height, piece.d, baseY, material);
      }
    }

    getSlabPieces(slab, opening) {
      const minX = slab.x;
      const maxX = slab.x + slab.w;
      const minZ = slab.y;
      const maxZ = slab.y + slab.h;
      const holeMinX = window.GameUtils.clamp(opening.x, minX, maxX);
      const holeMaxX = window.GameUtils.clamp(opening.x + opening.w, minX, maxX);
      const holeMinZ = window.GameUtils.clamp(opening.y, minZ, maxZ);
      const holeMaxZ = window.GameUtils.clamp(opening.y + opening.h, minZ, maxZ);
      const pieces = [
        { x: minX, z: minZ, w: holeMinX - minX, d: maxZ - minZ },
        { x: holeMaxX, z: minZ, w: maxX - holeMaxX, d: maxZ - minZ },
        { x: holeMinX, z: minZ, w: holeMaxX - holeMinX, d: holeMinZ - minZ },
        { x: holeMinX, z: holeMaxZ, w: holeMaxX - holeMinX, d: maxZ - holeMaxZ }
      ];

      return pieces.filter((piece) => piece.w > 4 && piece.d > 4);
    }

    addInteriorLights(object, level, floor) {
      const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf9a, transparent: true, opacity: 0.86 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(8, 10, 8), lightMaterial);
      lamp.position.set(object.x + object.w * 0.5, level + 92, object.y + object.h * 0.5);
      this.group.add(lamp);

      if (floor === 0) {
        const light = new THREE.PointLight(0xffd69a, 0, 360, 1.8);
        light.position.copy(lamp.position);
        light.castShadow = false;
        light.visible = false;
        this.group.add(light);
        this.weatherTargets.buildingLights.push({ light, lamp, baseIntensity: 0.55 });
      }
    }

    addBuildingWindows(object) {
      const glassClosed = new THREE.MeshBasicMaterial({ color: 0x9fd5ff, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
      const glassOpen = new THREE.MeshBasicMaterial({ color: 0x9fd5ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
      const floors = object.floors || 2;
      const floorHeight = 112;
      const count = Math.max(2, Math.floor(object.w / 110));

      for (let floor = 0; floor < floors; floor += 1) {
        const y = floor * floorHeight + 58;
        for (let i = 0; i < count; i += 1) {
          const x = object.x + 58 + i * ((object.w - 116) / Math.max(1, count - 1));
          this.addWindowPlane(x, y, object.y - 0.8, 0, i === 1 && floor === 0 ? glassOpen : glassClosed);
          this.addWindowPlane(x, y, object.y + object.h + 0.8, Math.PI, glassClosed);
        }

        this.addWindowPlane(object.x - 0.8, y, object.y + object.h * 0.62, Math.PI / 2, floor === 0 ? glassOpen : glassClosed);
        this.addWindowPlane(object.x + object.w + 0.8, y, object.y + object.h * 0.42, -Math.PI / 2, glassClosed);
      }
    }

    addWindowPlane(x, y, z, rotationY, material) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(38, 32), material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotationY;
      this.group.add(mesh);
    }

    buildDoorObject(object, settings) {
      const material = new THREE.MeshStandardMaterial({
        color: settings.color,
        roughness: settings.roughness,
        metalness: settings.metalness
      });
      const group = new THREE.Group();
      group.position.set(object.hingeX, 0, object.hingeZ);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(object.closedW, settings.height, object.closedH), material);
      panel.position.set(object.closedW / 2, settings.height / 2, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      group.add(panel);
      this.group.add(group);

      object.mesh = group;
      object.panelMesh = panel;
      this.updateDoorCollisionRect(object);
      this.addContactShadow(object);
    }

    addExteriorDecor(object) {
      const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0.75 });
      this.addBoxAt(object.x + 42, object.y + object.h + 54, 34, 12, 34, 74, glowMaterial);
    }

    addFencePosts(object, height) {
      const material = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.8, metalness: 0.25 });
      const horizontal = object.w >= object.h;
      const count = Math.max(2, Math.floor((horizontal ? object.w : object.h) / 90));

      for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const x = horizontal ? object.x + object.w * t : object.x + object.w / 2;
        const z = horizontal ? object.y + object.h / 2 : object.y + object.h * t;
        this.addBox(x, z, 12, height + 28, 12, material);
      }
    }

    addRoofParapet(object, height) {
      const material = new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: 0.82 });
      const y = height + 18;
      const north = this.addBox(object.x + object.w / 2, object.y - 4, object.w + 18, 18, 8, material);
      const south = this.addBox(object.x + object.w / 2, object.y + object.h + 4, object.w + 18, 18, 8, material);
      const west = this.addBox(object.x - 4, object.y + object.h / 2, 8, 18, object.h + 18, material);
      const east = this.addBox(object.x + object.w + 4, object.y + object.h / 2, 8, 18, object.h + 18, material);

      for (const mesh of [north, south, west, east]) {
        mesh.position.y = y;
      }
    }

    addLadderDetails(object, height) {
      const metal = new THREE.MeshStandardMaterial({ color: 0x1a222b, roughness: 0.55, metalness: 0.55 });
      const rungMaterial = new THREE.MeshStandardMaterial({ color: 0xd1b778, roughness: 0.45, metalness: 0.5 });
      const horizontal = object.direction === 'east' || object.direction === 'west';
      const centerX = object.x + object.w / 2;
      const centerZ = object.y + object.h / 2;
      const railOffset = 18;
      const railHeight = height + 18;

      if (horizontal) {
        this.addBox(centerX, centerZ - railOffset, object.w, railHeight, 5, metal).rotation.z = -0.12;
        this.addBox(centerX, centerZ + railOffset, object.w, railHeight, 5, metal).rotation.z = -0.12;
      } else {
        this.addBox(centerX - railOffset, centerZ, 5, railHeight, object.h, metal).rotation.x = 0.12;
        this.addBox(centerX + railOffset, centerZ, 5, railHeight, object.h, metal).rotation.x = 0.12;
      }

      const rungCount = Math.max(5, Math.floor(height / 24));
      for (let i = 0; i <= rungCount; i += 1) {
        const t = i / rungCount;
        const x = horizontal ? object.x + object.w * t : centerX;
        const z = horizontal ? centerZ : object.y + object.h * t;
        const rung = this.addBox(x, z, horizontal ? 10 : 52, 5, horizontal ? 52 : 10, rungMaterial);
        rung.position.y = 12 + height * t;
      }
    }

    addStairsDetails(object) {
      const material = new THREE.MeshStandardMaterial({ color: object.type === 'ladder' ? 0x4b5865 : 0x596673, roughness: 0.82, metalness: object.type === 'ladder' ? 0.12 : 0.02 });
      const steps = this.getStairStepCount(object);
      const baseY = object.floorY || 0;
      const topY = baseY + (object.height || 112);
      const runLength = this.getStairRunLength(object);
      const horizontal = object.direction === 'east' || object.direction === 'west';
      const crossSize = horizontal ? object.h : object.w;
      const bottomCenter = this.getStairCenterAtProgress(object, 0);
      const topCenter = this.getStairCenterAtProgress(object, 1);
      const landingLength = Math.max(26, Math.min(42, runLength * 0.18));

      this.addStairPlatform(bottomCenter.x, bottomCenter.z, horizontal, landingLength, crossSize, baseY, material);
      this.addStairPlatform(topCenter.x, topCenter.z, horizontal, landingLength, crossSize, topY, material);

      for (let i = 0; i < steps; i += 1) {
        const stepHeight = object.height / steps;
        const stepDepth = this.getStairStepDepth(object);
        const progress = this.getStairStepProgress(object, i);
        const center = this.getStairCenterAtProgress(object, progress);
        const y = baseY + stepHeight * i;
        this.addBoxAt(center.x, center.z, horizontal ? stepDepth + 1 : object.w, stepHeight, horizontal ? object.h : stepDepth + 1, y, material);
      }

      this.addStairRails(object, baseY, topY);
    }

    addStairPlatform(x, z, horizontal, length, crossSize, baseY, material) {
      this.addBoxAt(x, z, horizontal ? length : crossSize, 8, horizontal ? crossSize : length, baseY, material);
    }

    getStepAxisPosition(start, length, direction, progress, isExterior) {
      const positiveDirection = direction === 'south' || direction === 'east';
      const climbsPositive = isExterior ? !positiveDirection : positiveDirection;
      return climbsPositive
        ? start + length * progress
        : start + length * (1 - progress);
    }

    getStairCenterAtProgress(object, progress) {
      const horizontal = object.direction === 'east' || object.direction === 'west';
      const isExterior = object.type === 'ladder';
      return {
        x: horizontal ? this.getStepAxisPosition(object.x, object.w, object.direction, progress, isExterior) : object.x + object.w / 2,
        z: horizontal ? object.y + object.h / 2 : this.getStepAxisPosition(object.y, object.h, object.direction, progress, isExterior)
      };
    }

    getStairRunLength(object) {
      return object.direction === 'east' || object.direction === 'west' ? object.w : object.h;
    }

    getStairStepDepth(object) {
      const landings = (object.bottomLanding || 0) + (object.topLanding || 0);
      return Math.max(8, (this.getStairRunLength(object) - landings) / this.getStairStepCount(object));
    }

    getStairStepProgress(object, index) {
      const runLength = this.getStairRunLength(object);
      const bottomLanding = object.bottomLanding || 0;
      const stepDepth = this.getStairStepDepth(object);
      return clamp((bottomLanding + stepDepth * (index + 0.5)) / runLength, 0, 1);
    }

    addStairRails(object, baseY, topY) {
      const railMaterial = new THREE.MeshStandardMaterial({ color: 0x1a222b, roughness: 0.55, metalness: 0.45 });
      const horizontal = object.direction === 'east' || object.direction === 'west';
      const center = {
        x: object.x + object.w / 2,
        z: object.y + object.h / 2
      };
      const railHeight = Math.max(46, (topY - baseY) + 46);
      const sideOffset = horizontal ? object.h / 2 + 5 : object.w / 2 + 5;

      if (horizontal) {
        this.addBoxAt(center.x, center.z - sideOffset, object.w, railHeight, 5, baseY, railMaterial);
        this.addBoxAt(center.x, center.z + sideOffset, object.w, railHeight, 5, baseY, railMaterial);
        this.addBoxAt(center.x, center.z - sideOffset, object.w, 5, 5, topY + 38, railMaterial);
        this.addBoxAt(center.x, center.z + sideOffset, object.w, 5, 5, topY + 38, railMaterial);
      } else {
        this.addBoxAt(center.x - sideOffset, center.z, 5, railHeight, object.h, baseY, railMaterial);
        this.addBoxAt(center.x + sideOffset, center.z, 5, railHeight, object.h, baseY, railMaterial);
        this.addBoxAt(center.x - sideOffset, center.z, 5, 5, object.h, topY + 38, railMaterial);
        this.addBoxAt(center.x + sideOffset, center.z, 5, 5, object.h, topY + 38, railMaterial);
      }
    }

    addExteriorStairDetails(object) {
      this.addStairsDetails(object);
    }

    addContactShadow(object) {
      const center = object.shape === 'rect'
        ? { x: object.x + object.w / 2, z: object.y + object.h / 2, w: object.w, d: object.h }
        : { x: object.x, z: object.y, w: object.r * 2.4, d: object.r * 2.4 };
      this.contactShadowData.push({
        x: center.x,
        z: center.z,
        w: center.w * 1.18,
        d: center.d * 1.18
      });
    }

    flushContactShadows() {
      if (!this.contactShadowData.length) return;

      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.17,
        depthWrite: false
      });
      const shadows = new THREE.InstancedMesh(geometry, material, this.contactShadowData.length);
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      const scale = new THREE.Vector3();

      this.contactShadowData.forEach((shadow, index) => {
        scale.set(shadow.w, shadow.d, 1);
        matrix.compose(new THREE.Vector3(shadow.x, 0.42, shadow.z), quaternion, scale);
        shadows.setMatrixAt(index, matrix);
      });

      shadows.instanceMatrix.needsUpdate = true;
      shadows.castShadow = false;
      shadows.receiveShadow = false;
      shadows.frustumCulled = true;
      this.group.add(shadows);
      this.contactShadowMesh = shadows;
    }

    registerRenderOptimizations() {
      this.renderOptimizedMeshes.length = 0;
      const tempBox = new THREE.Box3();
      const tempCenter = new THREE.Vector3();

      this.group.traverse((child) => {
        if (!child.isMesh && !child.isInstancedMesh) return;
        child.frustumCulled = true;

        if (child.geometry && !child.geometry.boundingSphere) {
          child.geometry.computeBoundingSphere();
        }

        if (child.isInstancedMesh && child.computeBoundingSphere && !child.boundingSphere) {
          child.computeBoundingSphere();
        }

        let center = null;
        let radius = child.geometry && child.geometry.boundingSphere ? child.geometry.boundingSphere.radius : 64;
        if (child.isInstancedMesh && child.boundingSphere) {
          radius = child.boundingSphere.radius;
          center = tempCenter.copy(child.boundingSphere.center).applyMatrix4(child.matrixWorld).clone();
        }
        radius *= Math.max(child.scale.x || 1, child.scale.y || 1, child.scale.z || 1);

        if (!Number.isFinite(radius) || radius <= 0) {
          tempBox.setFromObject(child);
          radius = tempBox.getSize(new THREE.Vector3()).length() * 0.5;
        }

        const smallDecor = radius < 24 || child.material && child.material.isMeshBasicMaterial;
        if (smallDecor) {
          child.castShadow = false;
        }

        this.renderOptimizedMeshes.push({
          mesh: child,
          center,
          radius,
          baseCastShadow: child.castShadow,
          baseReceiveShadow: child.receiveShadow,
          canDistanceCull: smallDecor && child !== this.contactShadowMesh
        });
      });
    }

    optimizeStaticMeshes() {
      const protectedMeshes = this.collectStaticBatchProtectedMeshes();
      const batches = new Map();

      this.group.traverse((child) => {
        if (!child.isMesh || child.isInstancedMesh || child.userData.staticBatched) return;
        if (child.parent !== this.group) return;
        if (protectedMeshes.has(child)) return;
        if (!child.geometry || child.geometry.type !== 'BoxGeometry' || !child.geometry.parameters) return;
        if (!child.material || child.material.transparent || child.material.isMeshBasicMaterial) return;

        const key = this.getStaticBatchMaterialKey(child.material);
        let batch = batches.get(key);
        if (!batch) {
          batch = { material: child.material, meshes: [] };
          batches.set(key, batch);
        }
        batch.meshes.push(child);
      });

      for (const batch of batches.values()) {
        if (batch.meshes.length < 2) continue;

        const instanced = new THREE.InstancedMesh(this.staticBatchGeometry, batch.material, batch.meshes.length);
        instanced.castShadow = batch.meshes.some((mesh) => mesh.castShadow);
        instanced.receiveShadow = batch.meshes.some((mesh) => mesh.receiveShadow);
        instanced.frustumCulled = true;
        instanced.matrixAutoUpdate = false;
        instanced.userData.staticBatch = true;

        batch.meshes.forEach((mesh, index) => {
          const parameters = mesh.geometry.parameters;
          this.staticBatchPosition.copy(mesh.position);
          this.staticBatchQuaternion.copy(mesh.quaternion);
          this.staticBatchScale.set(
            (parameters.width || 1) * mesh.scale.x,
            (parameters.height || 1) * mesh.scale.y,
            (parameters.depth || 1) * mesh.scale.z
          );
          this.staticBatchMatrix.compose(this.staticBatchPosition, this.staticBatchQuaternion, this.staticBatchScale);
          instanced.setMatrixAt(index, this.staticBatchMatrix);
          mesh.parent.remove(mesh);
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material !== batch.material && mesh.material) mesh.material.dispose();
        });

        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.computeBoundingSphere) instanced.computeBoundingSphere();
        this.group.add(instanced);
      }
    }

    collectStaticBatchProtectedMeshes() {
      this.staticBatchProtected.clear();

      for (const object of this.objects) {
        if (!object) continue;
        const canBatchObjectMesh = object.type === 'baseCover';
        if (object.mesh && !canBatchObjectMesh) this.staticBatchProtected.add(object.mesh);
        if (object.lidMesh) this.staticBatchProtected.add(object.lidMesh);
        if (object.doorMesh) this.staticBatchProtected.add(object.doorMesh);
        if (object.capMesh) this.staticBatchProtected.add(object.capMesh);
        if (object.poleMesh) this.staticBatchProtected.add(object.poleMesh);
        if (object.screenMesh) this.staticBatchProtected.add(object.screenMesh);
      }

      return this.staticBatchProtected;
    }

    getStaticBatchMaterialKey(material) {
      const color = material.color ? material.color.getHexString() : 'none';
      const emissive = material.emissive ? material.emissive.getHexString() : 'none';
      const map = material.map ? material.map.uuid : 'none';
      return [
        material.type,
        color,
        emissive,
        material.roughness === undefined ? 'r' : material.roughness.toFixed(3),
        material.metalness === undefined ? 'm' : material.metalness.toFixed(3),
        material.opacity === undefined ? 'o' : material.opacity.toFixed(3),
        material.side,
        map
      ].join('|');
    }

    addBox(x, z, w, h, d, material) {
      return this.addBoxAt(x, z, w, h, d, 0, material);
    }

    addBoxAt(x, z, w, h, d, baseY, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, baseY + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    }

    update(dt) {
      this.updateRenderOptimizations(dt);

      for (const door of this.doors) {
        if (!door.mesh) continue;

        const target = door.targetOpenAngle || 0;
        door.currentAngle += (target - door.currentAngle) * (1 - Math.exp(-8 * dt));
        door.openAmount = Math.abs(door.currentAngle) / (Math.PI * 0.5);
        door.mesh.rotation.y = door.currentAngle;
        this.updateDoorCollisionRect(door);
      }

      this.updateInteractiveObjects(dt);
      this.updatePhysicsObjects(dt);
      this.updateRagdolls(dt);
      this.updateFires(dt);
    }

    updateRenderOptimizations(dt) {
      this.renderOptimizeTimer -= dt;
      if (this.renderOptimizeTimer > 0 || !this.physicsFocus) return;
      const profile = this.performanceProfile;
      this.renderOptimizeTimer = profile.renderOptimizeInterval || 0.35;

      const focusX = this.physicsFocus.x || 0;
      const focusZ = this.physicsFocus.z || 0;
      let shadowCasters = 0;

      for (const entry of this.renderOptimizedMeshes) {
        const mesh = entry.mesh;
        if (!mesh.parent) continue;
        if (!mesh.visible && !mesh.userData.optimizedHidden) continue;

        if (entry.center) {
          this.renderTempPosition.copy(entry.center);
        } else {
          mesh.getWorldPosition(this.renderTempPosition);
        }
        const dx = this.renderTempPosition.x - focusX;
        const dz = this.renderTempPosition.z - focusZ;
        const distance = Math.hypot(dx, dz);

        if (entry.canDistanceCull) {
          const shouldHide = distance > (profile.renderCullDistance || 1900) + entry.radius * (profile.renderCullRadiusMultiplier || 3);
          if (shouldHide && mesh.visible) {
            mesh.userData.optimizedHidden = true;
            mesh.visible = false;
          } else if (!shouldHide && mesh.userData.optimizedHidden) {
            mesh.visible = true;
            mesh.userData.optimizedHidden = false;
          }
        }

        mesh.castShadow = entry.baseCastShadow && distance < (profile.shadowCastDistance || 1350) && entry.radius > 18;
        mesh.receiveShadow = entry.baseReceiveShadow && (distance < (profile.shadowReceiveDistance || 2400) || entry.radius > 90);
        if (mesh.castShadow) shadowCasters += 1;
      }
      this.performanceStats.shadowCasters = shadowCasters;
    }

    setPhysicsFocus(entity) {
      this.physicsFocus = entity;
    }

    updatePhysicsObjects(dt) {
      const focus = this.physicsFocus;
      const physicsStart = performance.now();
      const activeDistance = this.performanceProfile.physicsActiveDistance || 1250;
      let activePhysics = 0;

      for (const object of this.physicsObjects) {
        if (!object || object.destroyed || !object.mesh) continue;
        this.ensurePhysicsState(object);
        if (object.sleeping
          && Math.hypot(object.velocityX || 0, object.velocityZ || 0) < 0.1
          && Math.abs(object.velocityY || 0) < 0.1
          && Math.abs(object.angularVelocity || 0) < 0.01) {
          continue;
        }

        const centerX = object.shape === 'circle' ? object.x : object.x + object.w / 2;
        const centerZ = object.shape === 'circle' ? object.y : object.y + object.h / 2;
        const support = this.getPhysicsSupportHeight(object, centerX, centerZ, object.baseY || 0);
        const airborne = (object.baseY || 0) > support + 0.5 || Math.abs(object.velocityY || 0) > 0.5;

        if (focus && Math.hypot(centerX - focus.x, centerZ - focus.z) > activeDistance && !airborne) {
          object.velocityX = 0;
          object.velocityZ = 0;
          object.velocityY = 0;
          object.sleeping = true;
          this.snapPhysicsObjectToSupport(object, support);
          continue;
        }

        object.sleeping = false;
        activePhysics += 1;
        object.velocityX = (object.velocityX || 0) * Math.exp(-2.6 * dt);
        object.velocityZ = (object.velocityZ || 0) * Math.exp(-2.6 * dt);
        object.velocityY = Math.max(-360, (object.velocityY || 0) - 900 * dt);
        object.angularVelocity = (object.angularVelocity || 0) * Math.exp(-2.2 * dt);

        if (Math.hypot(object.velocityX, object.velocityZ) < 1 && Math.abs(object.velocityY) < 4 && Math.abs(object.angularVelocity || 0) < 0.03) {
          object.velocityX = 0;
          object.velocityZ = 0;
          object.velocityY = 0;
          object.angularVelocity = 0;
        }

        this.movePhysicsObject(object, dt);
        if (object.velocityX === 0 && object.velocityZ === 0 && object.velocityY === 0 && object.angularVelocity === 0) {
          object.sleeping = true;
        }
      }
      this.performanceStats.physicsObjects = activePhysics;
      this.performanceStats.physicsMs = performance.now() - physicsStart;
    }

    ensurePhysicsState(object) {
      if (object.baseY === undefined) {
        object.baseY = object.mesh ? object.mesh.position.y - this.getObjectHeight(object) / 2 : (object.floorY || 0);
      }
      object.velocityX = object.velocityX || 0;
      object.velocityZ = object.velocityZ || 0;
      object.velocityY = object.velocityY || 0;
      object.angularVelocity = object.angularVelocity || 0;
    }

    movePhysicsObject(object, dt) {
      const previousX = object.x;
      const previousZ = object.y;
      const previousBaseY = object.baseY || 0;
      const dx = (object.velocityX || 0) * dt;
      const dz = (object.velocityZ || 0) * dt;
      object.x = clamp(object.x + dx, 8, WORLD.width - (object.w || object.r || 8));
      object.y = clamp(object.y + dz, 8, WORLD.height - (object.h || object.r || 8));

      const radius = object.shape === 'circle' ? object.r : Math.max(object.w, object.h) * 0.45;
      const centerX = object.shape === 'circle' ? object.x : object.x + object.w / 2;
      const centerZ = object.shape === 'circle' ? object.y : object.y + object.h / 2;
      for (const blocker of this.objects) {
        if (blocker === object || blocker.destroyed || blocker.physics || blocker.solid === false) continue;
        if (!this.isObjectBlockingAtHeight(blocker, object.baseY || object.floorY || 0)) continue;
        const hit = blocker.shape === 'rect'
          ? circleIntersectsRect(centerX, centerZ, radius, blocker)
          : circleIntersectsCircle(centerX, centerZ, radius, blocker);
        if (!hit) continue;
        object.x = previousX;
        object.y = previousZ;
        object.velocityX *= -0.24;
        object.velocityZ *= -0.24;
        break;
      }

      const support = this.getPhysicsSupportHeight(object, centerX, centerZ, previousBaseY);
      object.baseY = previousBaseY + (object.velocityY || 0) * dt;
      if (object.baseY <= support) {
        const impactSpeed = Math.abs(object.velocityY || 0);
        object.baseY = support;
        const bounce = this.getPhysicsBounce(object);
        object.velocityY = impactSpeed > 80 && bounce > 0 ? impactSpeed * bounce : 0;
        object.velocityX *= impactSpeed > 80 ? 0.82 : 0.62;
        object.velocityZ *= impactSpeed > 80 ? 0.82 : 0.62;
      } else {
        const ceiling = this.getCeilingHeightAt(centerX, centerZ, previousBaseY, this.getObjectHeight(object));
        if (ceiling !== null && object.baseY + this.getObjectHeight(object) > ceiling - 2) {
          object.baseY = Math.max(support, ceiling - this.getObjectHeight(object) - 2);
          object.velocityY = Math.min(0, object.velocityY || 0);
        }
      }

      object.tiltX = clamp((object.tiltX || 0) + (object.velocityZ || 0) * dt * 0.012, -1.2, 1.2);
      object.tiltZ = clamp((object.tiltZ || 0) - (object.velocityX || 0) * dt * 0.012, -1.2, 1.2);
      object.tiltX *= Math.exp(-0.85 * dt);
      object.tiltZ *= Math.exp(-0.85 * dt);

      const meshX = object.shape === 'circle' ? object.x : object.x + object.w / 2;
      const meshZ = object.shape === 'circle' ? object.y : object.y + object.h / 2;
      const height = this.getObjectHeight(object);
      object.mesh.position.set(meshX, (object.baseY || 0) + height / 2, meshZ);
      object.mesh.rotation.y += (object.angularVelocity || 0) * dt;
      object.mesh.rotation.x = object.tiltX || 0;
      object.mesh.rotation.z = object.tiltZ || 0;
    }

    getPhysicsSupportHeight(object, centerX, centerZ, currentY) {
      let support = this.getGroundHeightAt(centerX, centerZ, currentY || 0);
      const radius = object.shape === 'circle' ? object.r : Math.max(object.w, object.h) * 0.45;

      for (const candidate of this.getSpatialCandidates(centerX, centerZ, radius + 28)) {
        if (candidate === object || candidate.destroyed || candidate.solid === false) continue;
        if (candidate.type === 'buildingWall' || candidate.type === 'interiorWall' || candidate.type === 'door' || candidate.type === 'gate') continue;
        const top = (candidate.floorY || 0) + this.getObjectHeight(candidate);
        if ((currentY || 0) < top - 28) continue;
        const overlaps = candidate.shape === 'rect'
          ? circleIntersectsRect(centerX, centerZ, radius, candidate)
          : circleIntersectsCircle(centerX, centerZ, radius, candidate);
        if (overlaps) support = Math.max(support, top);
      }

      return support;
    }

    getPhysicsBounce(object) {
      const mass = object.mass || 1;
      if (object.type === 'barrel' || object.type === 'smallContainer' || object.type === 'dumpster') return 0.12;
      if (mass < 0.7) return 0.34;
      if (mass < 1.5) return 0.24;
      return 0.16;
    }

    snapPhysicsObjectToSupport(object, support) {
      object.baseY = support;
      const meshX = object.shape === 'circle' ? object.x : object.x + object.w / 2;
      const meshZ = object.shape === 'circle' ? object.y : object.y + object.h / 2;
      object.mesh.position.set(meshX, support + this.getObjectHeight(object) / 2, meshZ);
    }

    applyImpulseToObject(object, directionX, directionZ, force, lift) {
      if (!object || !object.physics || object.destroyed) return false;
      const mass = Math.max(0.35, object.mass || 1);
      const length = Math.hypot(directionX, directionZ) || 1;
      object.velocityX = (object.velocityX || 0) + (directionX / length) * force / mass;
      object.velocityZ = (object.velocityZ || 0) + (directionZ / length) * force / mass;
      object.velocityY = Math.max(object.velocityY || 0, (lift || 0) / mass);
      object.angularVelocity = (object.angularVelocity || 0) + randomRange(-3.4, 3.4) * Math.min(1.6, force / 260);
      object.sleeping = false;
      return true;
    }

    applyImpulseAt(position, direction, force) {
      const object = position && this.getCollisionObject(position.x, position.z, 6, position.y || 0);
      if (!object || !object.physics) return false;
      return this.applyImpulseToObject(object, direction.x, direction.z, force, force * 0.18);
    }

    applyExplosionImpulse(x, z, radius, force) {
      for (const object of this.physicsObjects) {
        if (!object || object.destroyed) continue;
        const centerX = object.shape === 'circle' ? object.x : object.x + object.w / 2;
        const centerZ = object.shape === 'circle' ? object.y : object.y + object.h / 2;
        const distance = Math.hypot(centerX - x, centerZ - z);
        if (distance > radius) continue;
        const power = (1 - distance / radius) * force;
        this.applyImpulseToObject(object, centerX - x, centerZ - z, power, power * 0.55);
      }

      for (const ragdoll of this.ragdolls) {
        const distance = Math.hypot(ragdoll.x - x, ragdoll.z - z);
        if (distance > radius) continue;
        const power = (1 - distance / radius) * force;
        this.applyImpulseToRagdoll(ragdoll, ragdoll.x - x, ragdoll.z - z, power);
      }
    }

    createRagdollFromNpc(npc) {
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4351, roughness: 0.78, metalness: 0.04 });
      const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x2e3944, roughness: 0.82, metalness: 0.06 });
      const parts = [
        new THREE.Mesh(this.ragdollGeometries[0], bodyMaterial),
        new THREE.Mesh(this.ragdollGeometries[1], bodyMaterial),
        new THREE.Mesh(this.ragdollGeometries[2], limbMaterial),
        new THREE.Mesh(this.ragdollGeometries[3], limbMaterial),
        new THREE.Mesh(this.ragdollGeometries[4], limbMaterial),
        new THREE.Mesh(this.ragdollGeometries[5], limbMaterial)
      ];
      const offsets = [
        [0, 36, 0],
        [0, 63, 0],
        [-20, 37, 0],
        [20, 37, 0],
        [-9, 9, 0],
        [9, 9, 0]
      ];
      parts.forEach((part, index) => {
        part.position.set(offsets[index][0], offsets[index][1], offsets[index][2]);
        part.castShadow = true;
        part.receiveShadow = true;
        group.add(part);
      });
      group.position.set(npc.x, npc.y || 0, npc.z);
      group.rotation.y = npc.angle || 0;
      this.group.add(group);
      const ragdoll = {
        group,
        parts,
        x: npc.x,
        z: npc.z,
        y: npc.y || 0,
        velocityX: Math.sin(npc.angle || 0) * 45,
        velocityZ: Math.cos(npc.angle || 0) * 45,
        velocityY: 90,
        angularVelocity: randomRange(-2.2, 2.2),
        life: 8,
        maxLife: 8
      };
      this.ragdolls.push(ragdoll);
      return ragdoll;
    }

    applyImpulseToRagdoll(ragdoll, directionX, directionZ, force) {
      const length = Math.hypot(directionX, directionZ) || 1;
      ragdoll.velocityX += (directionX / length) * force * 0.9;
      ragdoll.velocityZ += (directionZ / length) * force * 0.9;
      ragdoll.velocityY = Math.max(ragdoll.velocityY, force * 0.35);
      ragdoll.angularVelocity += randomRange(-4, 4);
    }

    updateRagdolls(dt) {
      for (let i = this.ragdolls.length - 1; i >= 0; i -= 1) {
        const ragdoll = this.ragdolls[i];
        ragdoll.life -= dt;
        ragdoll.velocityY -= 900 * dt;
        ragdoll.velocityX *= Math.exp(-1.15 * dt);
        ragdoll.velocityZ *= Math.exp(-1.15 * dt);
        ragdoll.angularVelocity *= Math.exp(-0.75 * dt);
        const previousX = ragdoll.x;
        const previousZ = ragdoll.z;
        ragdoll.x += ragdoll.velocityX * dt;
        ragdoll.z += ragdoll.velocityZ * dt;
        ragdoll.y += ragdoll.velocityY * dt;

        const collision = this.getCollisionObject(ragdoll.x, ragdoll.z, 18, ragdoll.y || 0);
        if (collision) {
          if (collision.physics) {
            this.applyImpulseToObject(collision, ragdoll.velocityX, ragdoll.velocityZ, 70, 12);
          }
          ragdoll.x = previousX;
          ragdoll.z = previousZ;
          ragdoll.velocityX *= -0.18;
          ragdoll.velocityZ *= -0.18;
        }

        const ground = this.getGroundHeightAt(ragdoll.x, ragdoll.z, ragdoll.y);
        if (ragdoll.y <= ground) {
          ragdoll.y = ground;
          ragdoll.velocityY = Math.max(0, ragdoll.velocityY) * 0.18;
        }

        ragdoll.group.position.set(ragdoll.x, ragdoll.y, ragdoll.z);
        ragdoll.group.rotation.z += ragdoll.angularVelocity * dt;
        ragdoll.group.rotation.x = Math.min(Math.PI * 0.5, ragdoll.group.rotation.x + dt * 2.4);

        const opacity = clamp(ragdoll.life / ragdoll.maxLife, 0, 1);
        for (const part of ragdoll.parts) {
          part.rotation.x += randomRange(-0.8, 0.8) * dt;
          part.rotation.z += randomRange(-0.8, 0.8) * dt;
          if (ragdoll.life < 1.5 && part.material) {
            part.material.transparent = true;
            part.material.opacity = opacity / 1.5;
          }
        }

        if (ragdoll.life <= 0) {
          this.group.remove(ragdoll.group);
          const disposedMaterials = new Set();
          ragdoll.group.traverse((child) => {
            if (child.geometry && !child.geometry.userData.sharedRagdollResource) child.geometry.dispose();
            if (child.material && !disposedMaterials.has(child.material)) {
              disposedMaterials.add(child.material);
              child.material.dispose();
            }
          });
          this.ragdolls.splice(i, 1);
        }
      }
    }

    updateInteractiveObjects(dt) {
      for (const object of this.interactables) {
        if (!object.mesh && !object.lidMesh && !object.doorMesh && !object.capMesh) continue;
        const target = object.targetAngle || 0;
        object.currentAngle += (target - object.currentAngle) * (1 - Math.exp(-7.5 * dt));

        if (object.type === 'openCrate' && object.lidMesh) {
          object.lidMesh.rotation.x = -object.currentAngle;
        } else if (object.type === 'cabinet' && object.doorMesh) {
          object.doorMesh.rotation.y = object.currentAngle;
        } else if (object.type === 'containerDoor' && object.mesh) {
          object.mesh.rotation.y = object.currentAngle;
          this.updateContainerDoorCollision(object);
        } else if (object.type === 'gate' && object.mesh) {
          object.slideAmount = (object.slideAmount || 0) + ((object.gateOpen ? 1 : 0) - (object.slideAmount || 0)) * (1 - Math.exp(-4.8 * dt));
          object.mesh.position.y = (object.height || 96) / 2 + object.slideAmount * ((object.height || 96) + 24);
          object.solid = object.slideAmount < 0.82;
        } else if (object.type === 'redButton' && object.capMesh) {
          const pressed = object.pressTime && performance.now() < object.pressTime;
          object.capMesh.position.y += (((pressed ? 16 : 22) - object.capMesh.position.y) * (1 - Math.exp(-12 * dt)));
        }
      }
    }

    updateFires(dt) {
      for (let i = this.fires.length - 1; i >= 0; i -= 1) {
        const fire = this.fires[i];
        fire.life -= dt;
        if (fire.mesh) {
          fire.mesh.scale.setScalar(0.85 + Math.sin(performance.now() * 0.012 + i) * 0.08);
          fire.mesh.material.opacity = Math.max(0, fire.life / fire.maxLife) * 0.55;
        }

        if (fire.life <= 0) {
          if (fire.mesh) {
            this.scene.remove(fire.mesh);
            fire.mesh.geometry.dispose();
            fire.mesh.material.dispose();
          }
          this.fires.splice(i, 1);
        }
      }
    }

    damageDestructible(object, damage) {
      if (!object || !object.destructible || object.destroyed) return false;

      object.health = Math.max(0, (object.health || object.maxHealth || 50) - damage);
      if (object.mesh && object.mesh.material && object.maxHealth) {
        object.mesh.material.opacity = Math.max(0.28, 0.45 + object.health / object.maxHealth * 0.55);
        object.mesh.material.transparent = true;
      }

      return object.health <= 0;
    }

    destroyObject(object) {
      if (!object || object.destroyed) return;

      object.destroyed = true;
      object.solid = false;
      if (object.type === 'breakableLamp' && object.light) {
        object.light.visible = false;
      }
      if (object.mesh) {
        this.group.remove(object.mesh);
        object.mesh.geometry.dispose();
        object.mesh.material.dispose();
        object.mesh = null;
      }
      if (object.poleMesh) {
        this.group.remove(object.poleMesh);
        object.poleMesh.geometry.dispose();
        object.poleMesh.material.dispose();
        object.poleMesh = null;
      }
    }

    addFire(x, z, radius, life) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 0.32, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff7b2d, transparent: true, opacity: 0.55, depthWrite: false })
      );
      mesh.position.set(x, 24, z);
      this.scene.add(mesh);
      this.fires.push({ x, z, radius, life, maxLife: life, mesh });
    }

    isDangerousAt(x, z) {
      for (const fire of this.fires) {
        if (Math.hypot(x - fire.x, z - fire.z) < fire.radius) return true;
      }

      for (const object of this.objects) {
        if (!object.explosive || object.destroyed) continue;
        const center = object.shape === 'circle'
          ? { x: object.x, z: object.y }
          : { x: object.x + object.w / 2, z: object.y + object.h / 2 };
        if (Math.hypot(x - center.x, z - center.z) < 95) return true;
      }

      return false;
    }

    toggleNearestDoor(x, z, y) {
      const door = this.getNearestDoor(x, z, y);
      if (!door) return false;

      this.toggleDoor(door, x, z);
      return true;
    }

    setInteractionHandlers(handlers) {
      this.interactionHandlers = handlers || {};
    }

    interactWithLook(player) {
      const target = this.getLookInteractionTarget(player);
      if (!target) return false;
      return this.interactWithObject(target.object, player);
    }

    updateInteractionPrompt(player, element) {
      if (!element) return;
      const target = this.getLookInteractionTarget(player);
      if (!target) {
        element.classList.add('hidden');
        return;
      }

      element.textContent = target.object.interactionLabel || '[E] Взаимодействовать';
      element.classList.remove('hidden');
    }

    getLookInteractionTarget(player) {
      if (!player || !player.getShootDirection) return null;
      const origin = player.getShootOriginTo
        ? player.getShootOriginTo(this.interactionRayOrigin)
        : this.interactionRayOrigin.copy(player.getShootOrigin());
      const direction = player.getShootDirectionTo
        ? player.getShootDirectionTo(this.interactionRayDirection)
        : this.interactionRayDirection.copy(player.getShootDirection());
      const maxDistance = 190;
      const best = this.interactionTargetResult;
      best.object = null;
      best.distance = maxDistance;

      this.findLookInteractionCandidate(this.interactables, origin, direction, player, best);
      this.findLookInteractionCandidate(this.doors, origin, direction, player, best);

      return best.object ? best : null;
    }

    findLookInteractionCandidate(candidates, origin, direction, player, best) {
      for (const object of candidates) {
        if (!object || object.destroyed || object.disabled) continue;
        if (object.type === 'gate' && object.gateOpen) continue;
        if (!this.isObjectBlockingAtHeight(object, player.y || 0)) continue;
        const distance = this.rayIntersectsObject(origin, direction, object, best.distance);
        if (distance === null) continue;
        best.object = object;
        best.distance = distance;
      }
    }

    rayIntersectsObject(origin, direction, object, maxDistance) {
      const bounds = this.getInteractionBounds(object);
      const invX = Math.abs(direction.x) < 0.0001 ? 1e9 : 1 / direction.x;
      const invY = Math.abs(direction.y) < 0.0001 ? 1e9 : 1 / direction.y;
      const invZ = Math.abs(direction.z) < 0.0001 ? 1e9 : 1 / direction.z;
      const tx1 = (bounds.minX - origin.x) * invX;
      const tx2 = (bounds.maxX - origin.x) * invX;
      const ty1 = (bounds.minY - origin.y) * invY;
      const ty2 = (bounds.maxY - origin.y) * invY;
      const tz1 = (bounds.minZ - origin.z) * invZ;
      const tz2 = (bounds.maxZ - origin.z) * invZ;
      const tMin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2), Math.min(tz1, tz2));
      const tMax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2), Math.max(tz1, tz2));
      if (tMax < 0 || tMin > tMax || tMin > maxDistance) return null;
      return Math.max(0, tMin);
    }

    getInteractionBounds(object) {
      const height = this.getObjectHeight(object);
      const baseY = object.floorY || 0;
      const bounds = this.interactionBoundsResult;
      if (object.shape === 'circle') {
        bounds.minX = object.x - object.r;
        bounds.maxX = object.x + object.r;
        bounds.minZ = object.y - object.r;
        bounds.maxZ = object.y + object.r;
        bounds.minY = baseY;
        bounds.maxY = baseY + height + 24;
        return bounds;
      }

      bounds.minX = object.x;
      bounds.maxX = object.x + object.w;
      bounds.minZ = object.y;
      bounds.maxZ = object.y + object.h;
      bounds.minY = baseY;
      bounds.maxY = baseY + height;
      return bounds;
    }

    interactWithObject(object, player) {
      if (!object || object.destroyed) return false;
      if (object.type === 'door') return this.toggleDoor(object, player.x, player.z);
      if (object.type === 'openCrate') return this.toggleLootContainer(object, 0.72);
      if (object.type === 'cabinet') return this.toggleLootContainer(object, 0.5);
      if (object.type === 'containerDoor') return this.toggleContainerDoor(object);
      if (object.type === 'lightSwitch') return this.toggleLinkedLights(object.linkedLight);
      if (object.type === 'computer') return this.cycleComputer(object);
      if (object.type === 'redButton') return this.pressRedButton(object);
      if (object.type === 'gate') return this.toggleGate(object);
      return false;
    }

    toggleDoor(door, x, z) {
      const opening = Math.abs(door.targetOpenAngle || 0);
      if (opening < 0.05) {
        door.openDirection = this.getDoorOpenDirection(door, x, z);
        door.targetOpenAngle = door.openDirection * Math.PI * 0.22;
      } else if (opening < Math.PI * 0.35) {
        door.targetOpenAngle = (door.openDirection || 1) * Math.PI * 0.52;
      } else {
        door.targetOpenAngle = 0;
      }
      return true;
    }

    toggleLootContainer(object, chance) {
      if (!object.opened) {
        object.opened = true;
        object.targetAngle = Math.PI * 0.62;
        this.dropContainerLoot(object, chance);
      } else {
        object.opened = false;
        object.targetAngle = 0;
      }
      return true;
    }

    toggleContainerDoor(object) {
      object.opened = !object.opened;
      object.targetAngle = object.opened ? Math.PI * 0.58 : 0;
      if (object.opened && !object.revealed) {
        object.revealed = true;
        const releasedNpc = Math.random() < 0.28
          && this.interactionHandlers.releaseNpc
          && this.interactionHandlers.releaseNpc(object.closedX + object.closedW / 2, object.closedY + object.closedH / 2);
        if (!releasedNpc) this.dropContainerLoot(object, 0.75);
      }
      return true;
    }

    toggleLinkedLights(lightId) {
      let switched = false;
      for (const object of this.objects) {
        if (object.lightId !== lightId || !object.light) continue;
        object.lightOn = object.lightOn === false;
        object.light.visible = object.lightOn;
        if (object.mesh && object.mesh.material) {
          object.mesh.material.color.setHex(object.lightOn ? 0xffe3a8 : 0x343434);
        }
        switched = true;
      }
      return switched;
    }

    cycleComputer(object) {
      const messages = ['ACCESS OK', 'WAVE DATA', 'CITY GRID', 'LOCKED', 'HELLO'];
      object.screenIndex = ((object.screenIndex || 0) + 1) % messages.length;
      if (object.screenMesh && object.screenMesh.material) {
        const colors = [0x43d7ff, 0x42d59b, 0xffd37a, 0xff5d67, 0xffffff];
        object.screenMesh.material.color.setHex(colors[object.screenIndex]);
      }
      object.interactionLabel = '[E] ' + messages[object.screenIndex];
      return true;
    }

    pressRedButton(object) {
      object.pressTime = performance.now() + 260;
      if (object.linkedGate) {
        for (const target of this.interactables) {
          if (target.gateId === object.linkedGate) {
            this.toggleGate(target);
          }
        }
      }
      this.toggleLinkedLights(object.linkedLight || 'yard-a');
      return true;
    }

    toggleGate(object) {
      object.gateOpen = !object.gateOpen;
      return true;
    }

    dropContainerLoot(object, chance) {
      if (Math.random() > chance) return;
      const center = object.shape === 'rect'
        ? { x: object.x + object.w / 2, z: object.y + object.h / 2 }
        : { x: object.x, z: object.y };
      const roll = Math.random();
      if (roll < 0.22 && this.interactionHandlers.addMoney) {
        this.interactionHandlers.addMoney(Math.floor(randomRange(45, 130)));
        return;
      }
      if (this.interactionHandlers.spawnLoot) {
        const types = ['health', 'armor', 'ammoPistol', 'ammoRifle'];
        this.interactionHandlers.spawnLoot(types[Math.floor(Math.random() * types.length)], center.x + randomRange(-24, 24), center.z + randomRange(-24, 24));
      }
    }

    openDoor(door, opener) {
      if (!door || door.type !== 'door') return;
      if (Math.abs(door.targetOpenAngle || 0) < 0.01) {
        door.openDirection = opener ? this.getDoorOpenDirection(door, opener.x, opener.z) : door.openDirection || 1;
        door.targetOpenAngle = door.openDirection * Math.PI * 0.52;
      }
    }

    getDoorOpenDirection(door, x, z) {
      if (door.wallSide === 'south') {
        return z >= door.closedY + door.closedH / 2 ? -1 : 1;
      }

      return 1;
    }

    updateDoorCollisionRect(door) {
      const angle = door.currentAngle || 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const local = [
        { x: 0, z: -door.closedH / 2 },
        { x: door.closedW, z: -door.closedH / 2 },
        { x: door.closedW, z: door.closedH / 2 },
        { x: 0, z: door.closedH / 2 }
      ];
      const world = local.map((point) => ({
        x: door.hingeX + point.x * cos + point.z * sin,
        z: door.hingeZ - point.x * sin + point.z * cos
      }));
      const minX = Math.min(...world.map((point) => point.x));
      const maxX = Math.max(...world.map((point) => point.x));
      const minZ = Math.min(...world.map((point) => point.z));
      const maxZ = Math.max(...world.map((point) => point.z));

      door.x = minX;
      door.y = minZ;
      door.w = Math.max(door.closedH, maxX - minX);
      door.h = Math.max(door.closedH, maxZ - minZ);
    }

    updateContainerDoorCollision(object) {
      const angle = object.currentAngle || 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const width = object.closedW || object.w;
      const depth = object.closedH || object.h;
      const local = [
        { x: 0, z: 0 },
        { x: width, z: 0 },
        { x: width, z: depth },
        { x: 0, z: depth }
      ];
      const world = local.map((point) => ({
        x: object.hingeX + point.x * cos + point.z * sin,
        z: object.hingeZ - point.x * sin + point.z * cos
      }));
      const minX = Math.min(...world.map((point) => point.x));
      const maxX = Math.max(...world.map((point) => point.x));
      const minZ = Math.min(...world.map((point) => point.z));
      const maxZ = Math.max(...world.map((point) => point.z));
      object.x = minX;
      object.y = minZ;
      object.w = Math.max(8, maxX - minX);
      object.h = Math.max(8, maxZ - minZ);
    }

    getNearestDoor(x, z, y) {
      let nearest = null;
      let nearestDistance = Infinity;

      for (const door of this.doors) {
        const centerX = door.closedX + door.closedW / 2;
        const centerZ = door.closedY + door.closedH / 2;
        const distance = Math.hypot(centerX - x, centerZ - z);
        const floorY = door.floorY || 0;
        if (Math.abs((y || 0) - floorY) > 70 || distance > 115) continue;

        if (distance < nearestDistance) {
          nearest = door;
          nearestDistance = distance;
        }
      }

      return nearest;
    }

    collides(x, z, radius, entityY) {
      return Boolean(this.getCollisionObject(x, z, radius, entityY));
    }

    getVaultCandidate(x, z, entityY, directionX, directionZ, radius) {
      const maxDistance = window.GameConfig.PLAYER.vaultDistance;
      const step = 12;

      for (let distance = radius + 8; distance <= maxDistance; distance += step) {
        const testX = x + directionX * distance;
        const testZ = z + directionZ * distance;
        const object = this.getCollisionObject(testX, testZ, radius * 0.72, entityY || 0);

        if (!object || !object.vaultable) continue;
        if (this.getObjectHeight(object) > window.GameConfig.PLAYER.vaultMaxHeight) return null;
        if (!this.isFacingObject(x, z, directionX, directionZ, object)) return null;

        return object;
      }

      return null;
    }

    isFacingObject(x, z, directionX, directionZ, object) {
      const center = object.shape === 'rect'
        ? { x: object.x + object.w / 2, z: object.y + object.h / 2 }
        : { x: object.x, z: object.y };
      const toCenterX = center.x - x;
      const toCenterZ = center.z - z;
      const length = Math.hypot(toCenterX, toCenterZ) || 1;
      const dot = (toCenterX / length) * directionX + (toCenterZ / length) * directionZ;

      return dot > 0.68;
    }

    hasVaultClearance(x, z, feetY, height) {
      const headY = feetY + height;
      const ceilingHeight = this.getCeilingHeightAt(x, z, feetY, height);

      if (ceilingHeight !== null && headY >= ceilingHeight - 3) {
        return false;
      }

      for (const object of this.getSpatialCandidates(x, z, window.GameConfig.PLAYER.radius + 12)) {
        if (object.destroyed) continue;
        if (object.solid === false) continue;
        if (!this.isObjectBlockingAtHeight(object, headY)) continue;

        if (object.shape === 'rect' && circleIntersectsRect(x, z, window.GameConfig.PLAYER.radius, object)) {
          return false;
        }

        if (object.shape === 'circle' && circleIntersectsCircle(x, z, window.GameConfig.PLAYER.radius, object)) {
          return false;
        }
      }

      return true;
    }

    getCeilingHeightAt(x, z, feetY, playerHeight) {
      const headY = feetY + (playerHeight || window.GameConfig.PLAYER.height);
      let nearest = null;

      for (const ceiling of this.ceilingColliders) {
        if (!this.pointInsideRect(x, z, ceiling)) continue;

        const underside = ceiling.baseY;
        const top = ceiling.baseY + ceiling.thickness;
        if (headY <= top + 8 && feetY < top) {
          nearest = nearest === null ? underside : Math.min(nearest, underside);
        }
      }

      return nearest;
    }

    getCollisionObject(x, z, radius, entityY) {
      this.performanceStats.collisionQueries += 1;
      for (const object of this.getSpatialCandidates(x, z, radius + 8)) {
        if (object.solid === false) continue;
        if (object.type === 'building' && this.getLadderHeightAt(x, z, entityY || 0) !== null) continue;
        if (!this.isObjectBlockingAtHeight(object, entityY || 0)) continue;

        if (object.shape === 'rect' && circleIntersectsRect(x, z, radius, object)) {
          return object;
        }

        if (object.shape === 'circle' && circleIntersectsCircle(x, z, radius, object)) {
          return object;
        }
      }

      return null;
    }

    isObjectBlockingAtHeight(object, entityY) {
      const height = this.getObjectHeight(object);
      const baseY = object.floorY || 0;

      if (object.floorY !== undefined) {
        return entityY >= baseY - 26 && entityY < baseY + height - 4;
      }

      if (object.type === 'building' && object.roofAccessible && entityY >= height - window.GameConfig.PLAYER.roofSnapTolerance) {
        return false;
      }

      return entityY < height - 4;
    }

    getObjectHeight(object) {
      return this.getObjectSettings(object).height;
    }

    getObjectImpactMaterial(object) {
      if (!object) return 'dirt';
      if (object.impactMaterial) return object.impactMaterial;
      if (object.type === 'container' || object.type === 'fence' || object.type === 'ladder' || object.type === 'streetLamp' || object.type === 'dumpster') return 'metal';
      if (object.type === 'building' || object.type === 'buildingWall' || object.type === 'interiorWall' || object.type === 'cover' || object.type === 'wall' || object.type === 'rock') return 'concrete';
      if (object.type === 'crate' || object.type === 'tree' || object.type === 'door' || object.type === 'table' || object.type === 'cabinet' || object.type === 'box' || object.type === 'bench' || object.type === 'woodCrate' || object.type === 'woodObstacle' || object.type === 'woodFenceBreakable') return 'wood';
      return 'dirt';
    }

    getBulletImpact(previousPosition, nextPosition, radius) {
      const groundHeight = this.getGroundHeightAt(nextPosition.x, nextPosition.z, nextPosition.y);
      if (nextPosition.y <= groundHeight + radius) {
        this.bulletImpactResult.type = 'ground';
        this.bulletImpactResult.object = null;
        this.bulletImpactResult.material = 'dirt';
        this.bulletImpactPoint.set(nextPosition.x, groundHeight + 0.9, nextPosition.z);
        this.bulletImpactNormal.set(0, 1, 0);
        return this.bulletImpactResult;
      }

      const object = this.getCollisionObject(nextPosition.x, nextPosition.z, radius, 0);
      if (!object) return null;

      const height = this.getObjectHeight(object);
      if (nextPosition.y < 0 || nextPosition.y > height + radius) return null;

      this.bulletImpactResult.type = object.type;
      this.bulletImpactResult.object = object;
      this.bulletImpactResult.material = this.getObjectImpactMaterial(object);
      this.bulletImpactPoint.copy(nextPosition);
      this.getImpactNormal(previousPosition, nextPosition, object, this.bulletImpactNormal);
      return this.bulletImpactResult;
    }

    getImpactNormal(previousPosition, nextPosition, object, target) {
      if (object.shape === 'circle') {
        return target.set(nextPosition.x - object.x, 0, nextPosition.z - object.y).normalize();
      }

      const west = Math.abs(nextPosition.x - object.x);
      const east = Math.abs(nextPosition.x - (object.x + object.w));
      const north = Math.abs(nextPosition.z - object.y);
      const south = Math.abs(nextPosition.z - (object.y + object.h));
      let min = west;
      target.set(-1, 0, 0);
      if (east < min) {
        min = east;
        target.set(1, 0, 0);
      }
      if (north < min) {
        min = north;
        target.set(0, 0, -1);
      }
      if (south < min) {
        target.set(0, 0, 1);
      }

      this.bulletImpactTravel.copy(nextPosition).sub(previousPosition).normalize();
      if (target.dot(this.bulletImpactTravel) > 0) {
        target.multiplyScalar(-1);
      }

      return target;
    }

    hasLineOfSight(fromX, fromZ, toX, toZ) {
      this.performanceStats.losChecks += 1;
      const dx = toX - fromX;
      const dz = toZ - fromZ;
      const distance = Math.hypot(dx, dz);
      const padding = 3;
      const candidates = this.getSpatialCandidatesInBounds(
        Math.min(fromX, toX) - padding,
        Math.min(fromZ, toZ) - padding,
        Math.max(fromX, toX) + padding,
        Math.max(fromZ, toZ) + padding
      );

      for (const object of candidates) {
        if (object.solid === false || object.destroyed) continue;
        if (!this.isObjectBlockingAtHeight(object, 0)) continue;
        if (this.segmentIntersectsObject(fromX, fromZ, toX, toZ, object, padding, distance)) {
          return false;
        }
      }

      return true;
    }

    segmentIntersectsObject(fromX, fromZ, toX, toZ, object, padding, distance) {
      if (object.shape === 'circle') {
        return this.distanceToSegment(object.x, object.y, fromX, fromZ, toX, toZ, distance) <= object.r + padding;
      }

      return this.segmentIntersectsRect(fromX, fromZ, toX, toZ, object, padding);
    }

    distanceToSegment(px, pz, ax, az, bx, bz, length) {
      const dx = bx - ax;
      const dz = bz - az;
      const lengthSq = Math.max(1, length * length);
      const t = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1);
      const x = ax + dx * t;
      const z = az + dz * t;
      return Math.hypot(px - x, pz - z);
    }

    segmentIntersectsRect(fromX, fromZ, toX, toZ, object, padding) {
      const minX = object.x - padding;
      const maxX = object.x + object.w + padding;
      const minZ = object.y - padding;
      const maxZ = object.y + object.h + padding;
      let tMin = 0;
      let tMax = 1;
      const dx = toX - fromX;
      const dz = toZ - fromZ;

      if (Math.abs(dx) < 0.0001) {
        if (fromX < minX || fromX > maxX) return false;
      } else {
        const inv = 1 / dx;
        let t1 = (minX - fromX) * inv;
        let t2 = (maxX - fromX) * inv;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return false;
      }

      if (Math.abs(dz) < 0.0001) {
        return fromZ >= minZ && fromZ <= maxZ;
      }

      const inv = 1 / dz;
      let t1 = (minZ - fromZ) * inv;
      let t2 = (maxZ - fromZ) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      return tMin <= tMax;
    }

    moveCircle(entity, radius, nextX, nextZ) {
      const clampedX = clamp(nextX, radius, WORLD.width - radius);
      const clampedZ = clamp(nextZ, radius, WORLD.height - radius);
      const result = {
        blockedX: clampedX !== nextX,
        blockedZ: clampedZ !== nextZ
      };

      const hitX = this.getCollisionObject(clampedX, entity.z, radius, entity.y || 0);
      if (!hitX) {
        entity.x = clampedX;
      } else {
        if (hitX.physics) {
          this.applyImpulseToObject(hitX, clampedX - entity.x, 0, entity === this.physicsFocus ? 95 : 42, 12);
        }
        result.blockedX = true;
        result.objectX = hitX;
      }

      const hitZ = this.getCollisionObject(entity.x, clampedZ, radius, entity.y || 0);
      if (!hitZ) {
        entity.z = clampedZ;
      } else {
        if (hitZ.physics) {
          this.applyImpulseToObject(hitZ, 0, clampedZ - entity.z, entity === this.physicsFocus ? 95 : 42, 12);
        }
        result.blockedZ = true;
        result.objectZ = hitZ;
      }

      return result;
    }

    getGroundHeightAt(x, z, currentY) {
      const stairHeight = this.getStairHeightAt(x, z, currentY || 0);
      if (stairHeight !== null) {
        return stairHeight;
      }

      const ladderHeight = this.getLadderHeightAt(x, z, currentY || 0);
      if (ladderHeight !== null) {
        return ladderHeight;
      }

      let height = 0;
      for (const object of this.objects) {
        if (object.type !== 'building' || !object.roofAccessible) continue;
        if (!this.pointInsideRect(x, z, object)) continue;

        const roofHeight = this.getObjectHeight(object);
        const floorHeight = 112;
        const floors = object.floors || Math.max(1, Math.round(roofHeight / floorHeight));
        for (let floor = 0; floor < floors; floor += 1) {
          const floorY = floor * floorHeight;
          if (currentY >= floorY - 8 && currentY < floorY + floorHeight - 18) {
            height = Math.max(height, floorY);
          }
        }

        if (currentY >= roofHeight - window.GameConfig.PLAYER.roofSnapTolerance) {
          height = Math.max(height, roofHeight);
        }
      }

      return height;
    }

    getLadderHeightAt(x, z, currentY) {
      return this.getSteppedHeightAt(x, z, currentY || 0, 'ladder');
    }

    getStairHeightAt(x, z, currentY) {
      return this.getSteppedHeightAt(x, z, currentY || 0, 'stairs');
    }

    getSteppedHeightAt(x, z, currentY, type) {
      let bestHeight = null;
      let bestDistance = Infinity;

      for (const object of this.objects) {
        if (object.type !== type || !this.pointInsideRect(x, z, object)) continue;

        const baseY = object.floorY || 0;
        const targetY = baseY + (object.height || 112);
        if (currentY < baseY - 34 || currentY > targetY + 34) continue;

        const height = this.getHeightOnStairObject(object, x, z);
        const distance = Math.abs(height - currentY);

        if (distance < bestDistance) {
          bestHeight = height;
          bestDistance = distance;
        }
      }

      return bestHeight;
    }

    getHeightOnStairObject(object, x, z) {
      const baseY = object.floorY || 0;
      const height = object.height || 112;
      const runLength = this.getStairRunLength(object);
      const bottomLanding = object.bottomLanding || 0;
      const topLanding = object.topLanding || 0;
      const progressDistance = clamp(this.getStepProgress(object, x, z), 0, 1) * runLength;

      if (progressDistance <= bottomLanding) return baseY;
      if (progressDistance >= runLength - topLanding) return baseY + height;

      const steps = this.getStairStepCount(object);
      const stepHeight = height / steps;
      const stepDepth = this.getStairStepDepth(object);
      const stairDistance = progressDistance - bottomLanding;
      const index = clamp(Math.floor(stairDistance / stepDepth), 0, steps - 1);

      return baseY + (index + 1) * stepHeight;
    }

    getStepProgress(object, x, z) {
      const isExterior = object.type === 'ladder';
      const positiveDirection = object.direction === 'south' || object.direction === 'east';
      const axisProgress = object.direction === 'east' || object.direction === 'west'
        ? (x - object.x) / object.w
        : (z - object.y) / object.h;
      const climbsPositive = isExterior ? !positiveDirection : positiveDirection;

      return climbsPositive ? axisProgress : 1 - axisProgress;
    }

    getStairStepCount(object) {
      const desiredStepHeight = object.stepHeight || 16;
      return Math.max(8, Math.ceil((object.height || 224) / desiredStepHeight));
    }

    pointInsideRect(x, z, object) {
      return x >= object.x && x <= object.x + object.w && z >= object.y && z <= object.y + object.h;
    }

    findFreePosition(radius, awayFrom) {
      for (let attempt = 0; attempt < 250; attempt += 1) {
        const point = {
          x: randomRange(radius, WORLD.width - radius),
          z: randomRange(radius, WORLD.height - radius)
        };
        const farEnough = !awayFrom || Math.hypot(point.x - awayFrom.x, point.z - awayFrom.z) > 180;

        if (farEnough && !this.collides(point.x, point.z, radius)) {
          return point;
        }
      }

      return { x: WORLD.width / 2 + 120, z: WORLD.height / 2 };
    }
  }

  window.GameWorld = GameWorld;
})();
