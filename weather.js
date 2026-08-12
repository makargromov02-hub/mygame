(function () {
  'use strict';

  const { WORLD } = window.GameConfig;
  const { clamp, randomRange } = window.GameUtils;

  const DAY_LENGTH = 240;
  const WEATHER_LENGTH = 92;
  const RAIN_COUNT = 900;
  const WEATHER_SEQUENCE = ['clear', 'cloudy', 'rain', 'thunder', 'fog'];

  const TIME_PHASES = [
    { name: 'Утро', at: 0, sky: 0x8fc7ee, fog: 0x9fcde6, sun: 0xffd19a, sunPower: 1.55, ambient: 0.62, fill: 0.24, exposure: 1.15, fogNear: 760, fogFar: 3900 },
    { name: 'День', at: 0.28, sky: 0x87bfe8, fog: 0x9fc6dd, sun: 0xffe4b8, sunPower: 2.15, ambient: 0.78, fill: 0.28, exposure: 1.25, fogNear: 900, fogFar: 4300 },
    { name: 'Закат', at: 0.58, sky: 0xf09b67, fog: 0xb98268, sun: 0xff8d4a, sunPower: 1.25, ambient: 0.48, fill: 0.2, exposure: 1.08, fogNear: 650, fogFar: 3300 },
    { name: 'Ночь', at: 0.76, sky: 0x111827, fog: 0x172033, sun: 0x9db8ff, sunPower: 0.22, ambient: 0.2, fill: 0.08, exposure: 0.78, fogNear: 520, fogFar: 2500 },
    { name: 'Утро', at: 1, sky: 0x8fc7ee, fog: 0x9fcde6, sun: 0xffd19a, sunPower: 1.55, ambient: 0.62, fill: 0.24, exposure: 1.15, fogNear: 760, fogFar: 3900 }
  ];

  const WEATHER_SETTINGS = {
    clear: { name: 'Ясно', cloud: 0.06, rain: 0, fog: 0, wind: 0.25, darken: 0 },
    cloudy: { name: 'Облачно', cloud: 0.62, rain: 0, fog: 0.1, wind: 0.42, darken: 0.08 },
    rain: { name: 'Дождь', cloud: 0.82, rain: 0.78, fog: 0.26, wind: 0.66, darken: 0.2 },
    thunder: { name: 'Гроза', cloud: 0.95, rain: 1, fog: 0.34, wind: 0.95, darken: 0.32 },
    fog: { name: 'Туман', cloud: 0.48, rain: 0, fog: 0.72, wind: 0.22, darken: 0.12 }
  };

  class WeatherSystem {
    constructor(scene, world, player, renderer, audio) {
      this.scene = scene;
      this.world = world;
      this.player = player;
      this.renderer = renderer;
      this.audio = audio;
      this.elapsed = 0;
      this.weatherElapsed = 0;
      this.currentWeatherIndex = 0;
      this.weatherBlend = 0;
      this.rainVelocity = 720;
      this.windPhase = Math.random() * Math.PI * 2;
      this.nextLightningAt = 18;
      this.lightningPower = 0;
      this.tempColorA = new THREE.Color();
      this.tempColorB = new THREE.Color();
      this.tempColorC = new THREE.Color();
      this.cloudSkyColor = new THREE.Color(0x6f7f8b);
      this.fogBlendColor = new THREE.Color(0x77818a);
      this.lightningSkyColor = new THREE.Color(0xddefff);
      this.lightningFogColor = new THREE.Color(0xe0f2ff);
      this.dryGroundColor = new THREE.Color(0xb7c9b4);
      this.wetGroundColor = new THREE.Color(0x667766);
      this.rainData = this.createRain();
      this.clouds = this.createClouds();
      this.bushes = this.createBushes();
      this.lightning = this.createLightningLight();
      this.applyAtmosphere(0);
      this.updateNightLights(false);
    }

    createRain() {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(RAIN_COUNT * 3);
      const speeds = new Float32Array(RAIN_COUNT);

      for (let i = 0; i < RAIN_COUNT; i += 1) {
        positions[i * 3] = randomRange(-700, 700);
        positions[i * 3 + 1] = randomRange(80, 620);
        positions[i * 3 + 2] = randomRange(-700, 700);
        speeds[i] = randomRange(0.72, 1.3);
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0xbfdcff,
        size: 3.2,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      this.scene.add(points);
      return { points, positions, speeds };
    }

    createClouds() {
      const group = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({ color: 0xd9e4eb, transparent: true, opacity: 0.18, depthWrite: false });
      const clouds = [];

      for (let i = 0; i < 14; i += 1) {
        const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material.clone());
        cloud.scale.set(randomRange(280, 520), randomRange(22, 46), randomRange(110, 230));
        cloud.position.set(randomRange(200, WORLD.width - 200), randomRange(760, 980), randomRange(200, WORLD.height - 200));
        cloud.rotation.y = randomRange(0, Math.PI);
        group.add(cloud);
        clouds.push(cloud);
      }

      this.scene.add(group);
      return clouds;
    }

    createBushes() {
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: 0x315c3f, roughness: 0.88, metalness: 0 });
      const bushes = [];
      const points = [
        [500, 2180], [705, 2245], [1030, 2385], [3860, 960], [4360, 1125], [3260, 4380],
        [3650, 4420], [2050, 3570], [2240, 3710], [920, 4200], [3560, 3450], [2920, 3220]
      ];

      for (const point of points) {
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(randomRange(18, 30), 0), material);
        bush.position.set(point[0], randomRange(14, 22), point[1]);
        bush.scale.y = randomRange(0.45, 0.7);
        bush.castShadow = true;
        bush.receiveShadow = true;
        group.add(bush);
        bushes.push({ mesh: bush, phase: Math.random() * Math.PI * 2 });
      }

      this.scene.add(group);
      return bushes;
    }

    createLightningLight() {
      const light = new THREE.PointLight(0xcfe6ff, 0, 5200, 1.1);
      light.position.set(WORLD.width * 0.52, 1200, WORLD.height * 0.48);
      light.visible = false;
      this.scene.add(light);
      return light;
    }

    update(dt) {
      this.elapsed += dt;
      this.weatherElapsed += dt;

      if (this.weatherElapsed >= WEATHER_LENGTH) {
        this.weatherElapsed = 0;
        this.currentWeatherIndex = (this.currentWeatherIndex + 1) % WEATHER_SEQUENCE.length;
      }

      this.weatherBlend = clamp(this.weatherElapsed / 12, 0, 1);
      const weather = this.getWeatherState();
      this.updateLightning(dt, weather);
      this.applyAtmosphere(dt, weather);
      this.updateRain(dt, weather);
      this.updateWind(dt, weather);
      this.updateNightLights(this.getTimeState().night);
    }

    getTimeState() {
      const progress = (this.elapsed % DAY_LENGTH) / DAY_LENGTH;
      let previous = TIME_PHASES[0];
      let next = TIME_PHASES[1];

      for (let i = 0; i < TIME_PHASES.length - 1; i += 1) {
        if (progress >= TIME_PHASES[i].at && progress <= TIME_PHASES[i + 1].at) {
          previous = TIME_PHASES[i];
          next = TIME_PHASES[i + 1];
          break;
        }
      }

      const span = next.at - previous.at || 1;
      const local = clamp((progress - previous.at) / span, 0, 1);
      const smooth = local * local * (3 - 2 * local);
      return {
        name: previous.name,
        night: progress >= 0.72 && progress < 0.96,
        sky: this.tempColorA.setHex(previous.sky).lerp(this.tempColorB.setHex(next.sky), smooth).getHex(),
        fog: this.tempColorA.setHex(previous.fog).lerp(this.tempColorB.setHex(next.fog), smooth).getHex(),
        sun: this.tempColorA.setHex(previous.sun).lerp(this.tempColorB.setHex(next.sun), smooth).getHex(),
        sunPower: THREE.MathUtils.lerp(previous.sunPower, next.sunPower, smooth),
        ambient: THREE.MathUtils.lerp(previous.ambient, next.ambient, smooth),
        fill: THREE.MathUtils.lerp(previous.fill, next.fill, smooth),
        exposure: THREE.MathUtils.lerp(previous.exposure, next.exposure, smooth),
        fogNear: THREE.MathUtils.lerp(previous.fogNear, next.fogNear, smooth),
        fogFar: THREE.MathUtils.lerp(previous.fogFar, next.fogFar, smooth),
        sunAngle: progress * Math.PI * 2
      };
    }

    getWeatherState() {
      const current = WEATHER_SETTINGS[WEATHER_SEQUENCE[this.currentWeatherIndex]];
      const previousIndex = (this.currentWeatherIndex + WEATHER_SEQUENCE.length - 1) % WEATHER_SEQUENCE.length;
      const previous = WEATHER_SETTINGS[WEATHER_SEQUENCE[previousIndex]];
      const blend = this.weatherBlend * this.weatherBlend * (3 - 2 * this.weatherBlend);

      return {
        key: WEATHER_SEQUENCE[this.currentWeatherIndex],
        name: blend < 0.5 ? previous.name : current.name,
        cloud: THREE.MathUtils.lerp(previous.cloud, current.cloud, blend),
        rain: THREE.MathUtils.lerp(previous.rain, current.rain, blend),
        fog: THREE.MathUtils.lerp(previous.fog, current.fog, blend),
        wind: THREE.MathUtils.lerp(previous.wind, current.wind, blend),
        darken: THREE.MathUtils.lerp(previous.darken, current.darken, blend)
      };
    }

    applyAtmosphere(dt, weatherState) {
      const weather = weatherState || this.getWeatherState();
      const time = this.getTimeState();
      const targets = this.world.weatherTargets || {};
      const lightning = this.lightningPower;
      const skyColor = this.tempColorA.setHex(time.sky).lerp(this.cloudSkyColor, weather.cloud * 0.42 + weather.darken * 0.22);
      if (lightning > 0) skyColor.lerp(this.lightningSkyColor, lightning * 0.78);

      this.scene.background.copy(skyColor);
      if (targets.sky && targets.sky.material) {
        targets.sky.material.color.copy(skyColor);
      }
      if (targets.skyHorizon && targets.skyHorizon.material) {
        targets.skyHorizon.material.color.copy(this.tempColorB.setHex(time.sun).lerp(skyColor, 0.42));
        targets.skyHorizon.material.opacity = clamp((1 - weather.cloud * 0.35) * (0.08 + time.sunPower * 0.055) + lightning * 0.08, 0.035, 0.19);
      }
      if (targets.skyZenith && targets.skyZenith.material) {
        targets.skyZenith.material.color.copy(this.tempColorC.copy(skyColor).lerp(new THREE.Color(0x244a72), 0.2));
        targets.skyZenith.material.opacity = clamp(0.045 + (1 - weather.darken) * 0.04 - weather.cloud * 0.02, 0.025, 0.09);
      }

      if (this.scene.fog) {
        const fogColor = this.tempColorB.setHex(time.fog).lerp(this.fogBlendColor, weather.fog * 0.55 + weather.darken * 0.28);
        if (lightning > 0) fogColor.lerp(this.lightningFogColor, lightning * 0.45);
        this.scene.fog.color.copy(fogColor);
        this.scene.fog.near = Math.max(120, time.fogNear - weather.fog * 430 - weather.rain * 180);
        this.scene.fog.far = Math.max(900, time.fogFar - weather.fog * 1850 - weather.rain * 720);
      }

      if (targets.ambient) targets.ambient.intensity = time.ambient * (1 - weather.darken * 0.45) + lightning * 0.5;
      if (targets.sun) {
        targets.sun.intensity = time.sunPower * (1 - weather.cloud * 0.48 - weather.darken * 0.42) + lightning * 1.3;
        targets.sun.color.setHex(time.sun);
        targets.sun.position.set(
          WORLD.width / 2 + Math.cos(time.sunAngle - 0.9) * 1550,
          360 + Math.max(0.08, Math.sin(time.sunAngle)) * 1450,
          WORLD.height / 2 + Math.sin(time.sunAngle - 0.9) * 1550
        );
      }
      if (targets.fill) targets.fill.intensity = time.fill * (1 - weather.darken * 0.35);
      if (targets.rim) targets.rim.intensity = time.fill * 0.46 * (1 - weather.darken * 0.35);
      if (targets.sunDisc) {
        targets.sunDisc.position.copy(targets.sun.position);
        targets.sunDisc.visible = weather.cloud < 0.78 || time.sunPower > 0.8;
        targets.sunDisc.material.color.setHex(time.sun);
      }
      if (targets.sunGlow) {
        targets.sunGlow.position.copy(targets.sun.position);
        targets.sunGlow.material.opacity = clamp((1 - weather.cloud) * 0.18 + lightning * 0.16, 0, 0.32);
      }
      if (targets.ground && targets.ground.material) {
        targets.ground.material.color.copy(this.tempColorC.copy(this.dryGroundColor).lerp(this.wetGroundColor, weather.darken + weather.rain * 0.28));
        targets.ground.material.roughness = 0.96 - weather.rain * 0.18;
      }
      if (this.renderer) {
        this.renderer.toneMappingExposure += (time.exposure - weather.darken * 0.18 + lightning * 0.18 - this.renderer.toneMappingExposure) * (1 - Math.exp(-2.5 * (dt || 0.016)));
      }

      for (const cloud of this.clouds) {
        cloud.material.opacity = clamp(0.04 + weather.cloud * 0.35, 0, 0.42);
        cloud.material.color.setHex(weather.key === 'thunder' ? 0x6f7780 : 0xd9e4eb);
      }
    }

    updateRain(dt, weather) {
      const data = this.rainData;
      data.points.visible = weather.rain > 0.03;
      data.points.material.opacity = clamp(weather.rain * 0.64, 0, 0.68);
      if (!data.points.visible) return;

      data.points.position.set(this.player.x, this.player.y + 40, this.player.z);
      const windX = Math.sin(this.windPhase) * weather.wind * 70;
      const windZ = Math.cos(this.windPhase * 0.7) * weather.wind * 42;

      for (let i = 0; i < RAIN_COUNT; i += 1) {
        const index = i * 3;
        data.positions[index] += windX * dt * 0.16;
        data.positions[index + 1] -= this.rainVelocity * data.speeds[i] * dt;
        data.positions[index + 2] += windZ * dt * 0.16;

        if (data.positions[index + 1] < -30) {
          data.positions[index] = randomRange(-720, 720);
          data.positions[index + 1] = randomRange(330, 680);
          data.positions[index + 2] = randomRange(-720, 720);
        }
      }

      data.points.geometry.attributes.position.needsUpdate = true;
    }

    updateWind(dt, weather) {
      this.windPhase += dt * (0.45 + weather.wind * 1.35);
      const sway = weather.wind * 0.055;

      const targets = this.world.weatherTargets || {};
      for (let i = 0; i < targets.trees.length; i += 1) {
        const tree = targets.trees[i];
        if (!tree.mesh) continue;
        const phase = this.windPhase + i * 0.67;
        tree.mesh.rotation.x = Math.sin(phase) * sway;
        tree.mesh.rotation.z = Math.cos(phase * 0.8) * sway * 0.72;
        if (tree.crownMesh) tree.crownMesh.rotation.z = Math.sin(phase * 1.35) * sway * 1.6;
      }

      for (const bush of this.bushes) {
        bush.mesh.rotation.x = Math.sin(this.windPhase * 1.7 + bush.phase) * weather.wind * 0.09;
        bush.mesh.rotation.z = Math.cos(this.windPhase * 1.45 + bush.phase) * weather.wind * 0.075;
      }

      for (const cloud of this.clouds) {
        cloud.position.x += dt * (8 + weather.wind * 24);
        if (cloud.position.x > WORLD.width + 520) cloud.position.x = -520;
      }
    }

    updateNightLights(night) {
      const targets = this.world.weatherTargets || {};
      const nightAmount = night ? 1 : 0;
      for (const object of targets.streetLights) {
        if (!object.light || object.destroyed || object.health <= 0) continue;
        const targetIntensity = (object.baseLightIntensity || 0.85) * nightAmount;
        object.light.visible = targetIntensity > 0.02 || object.light.intensity > 0.02;
        object.light.intensity += (targetIntensity - object.light.intensity) * 0.08;
        if (object.light.intensity <= 0.02 && targetIntensity <= 0.02) object.light.visible = false;
        if (object.bulbMaterial) {
          object.bulbMaterial.color.setHex(night ? 0xffe3a8 : 0x6a6254);
        }
      }

      for (const entry of targets.buildingLights) {
        const targetIntensity = (entry.baseIntensity || 0.55) * nightAmount;
        entry.light.visible = targetIntensity > 0.02 || entry.light.intensity > 0.02;
        entry.light.intensity += (targetIntensity - entry.light.intensity) * 0.08;
        if (entry.light.intensity <= 0.02 && targetIntensity <= 0.02) entry.light.visible = false;
        if (entry.lamp && entry.lamp.material) {
          entry.lamp.material.opacity = night ? 0.86 : 0.22;
        }
      }
    }

    updateLightning(dt, weather) {
      this.lightningPower = Math.max(0, this.lightningPower - dt * 4.6);
      this.lightning.intensity = this.lightningPower * 5.8;
      this.lightning.visible = this.lightningPower > 0.01;
      if (weather.key !== 'thunder' || weather.rain < 0.5) return;

      this.nextLightningAt -= dt;
      if (this.nextLightningAt > 0) return;

      this.lightningPower = 1;
      this.lightning.visible = true;
      this.nextLightningAt = randomRange(5.5, 13.5);
      this.lightning.position.set(
        clamp(this.player.x + randomRange(-950, 950), 200, WORLD.width - 200),
        randomRange(700, 1300),
        clamp(this.player.z + randomRange(-950, 950), 200, WORLD.height - 200)
      );
      if (this.audio && this.audio.playThunder) {
        this.audio.playThunder();
      }
      this.lightning.intensity = this.lightningPower * 5.8;
    }
  }

  window.WeatherSystem = WeatherSystem;
})();
