(function () {
  'use strict';

  const { WORLD } = window.GameConfig;
  const { clamp } = window.GameUtils;

  class HudSystem {
    constructor(player, weapons, npcManager, world, elements) {
      this.player = player;
      this.weapons = weapons;
      this.npcManager = npcManager;
      this.world = world;
      this.elements = elements;
      this.minimapContext = elements.minimap ? elements.minimap.getContext('2d') : null;
      this.minimapRange = 900;
      this.nextMinimapDrawAt = 0;
      this.hitMarkerTimer = 0;
      this.hitMarkerKill = false;
      this.hitMarkerHeadshot = false;
      this.hitMarkerVisible = false;
      this.lastValues = {
        health: '',
        armor: '',
        healthWidth: '',
        armorWidth: '',
        kills: ''
      };

      this.update(performance.now());
    }

    update(now) {
      this.updateVitals();
      this.updateKills();
      this.updateHitMarker(now);
      this.weapons.updateHud(now);

      // Мини-карта рисуется реже основного кадра, чтобы HUD не съедал FPS.
      if (this.minimapContext && now >= this.nextMinimapDrawAt) {
        this.drawMinimap();
        this.nextMinimapDrawAt = now + 90;
      }
    }

    showHitMarker(killed, headshot) {
      if (!this.elements.hitMarker) return;

      this.hitMarkerTimer = performance.now() + (killed ? 190 : headshot ? 150 : 110);
      this.hitMarkerKill = Boolean(killed);
      this.hitMarkerHeadshot = Boolean(headshot);
      this.elements.hitMarker.classList.toggle('hit-marker-kill', this.hitMarkerKill);
      this.elements.hitMarker.classList.toggle('hit-marker-headshot', this.hitMarkerHeadshot);
      this.elements.hitMarker.classList.add('hit-marker-visible');
      this.hitMarkerVisible = true;
    }

    updateHitMarker(now) {
      if (!this.elements.hitMarker) return;
      if (this.hitMarkerTimer > now) return;
      if (!this.hitMarkerVisible) return;

      this.elements.hitMarker.classList.remove('hit-marker-visible', 'hit-marker-kill', 'hit-marker-headshot');
      this.hitMarkerVisible = false;
    }

    showKill(message) {
      if (!this.elements.killFeed) return;

      const item = document.createElement('div');
      item.className = 'kill-feed-item';
      item.textContent = message || 'NPC уничтожен';
      this.elements.killFeed.prepend(item);

      while (this.elements.killFeed.children.length > 3) {
        this.elements.killFeed.lastElementChild.remove();
      }

      setTimeout(() => {
        if (item.parentNode) item.remove();
      }, 2600);
    }

    updateVitals() {
      const healthRatio = clamp(this.player.health / this.player.maxHealth, 0, 1);
      const armorRatio = clamp(this.player.armor / this.player.maxArmor, 0, 1);

      const healthLabel = String(Math.ceil(this.player.health));
      if (this.elements.healthValue && this.lastValues.health !== healthLabel) {
        this.elements.healthValue.textContent = healthLabel;
        this.lastValues.health = healthLabel;
      }

      const armorLabel = String(Math.ceil(this.player.armor));
      if (this.elements.armorValue && this.lastValues.armor !== armorLabel) {
        this.elements.armorValue.textContent = armorLabel;
        this.lastValues.armor = armorLabel;
      }

      const healthWidth = (healthRatio * 100).toFixed(1) + '%';
      if (this.elements.healthBar && this.lastValues.healthWidth !== healthWidth) {
        this.elements.healthBar.style.width = healthWidth;
        this.lastValues.healthWidth = healthWidth;
      }

      const armorWidth = (armorRatio * 100).toFixed(1) + '%';
      if (this.elements.armorBar && this.lastValues.armorWidth !== armorWidth) {
        this.elements.armorBar.style.width = armorWidth;
        this.lastValues.armorWidth = armorWidth;
      }
    }

    updateKills() {
      const killsLabel = String(this.npcManager.kills);
      if (this.elements.kills && this.lastValues.kills !== killsLabel) {
        this.elements.kills.textContent = killsLabel;
        this.lastValues.kills = killsLabel;
      }
    }

    drawMinimap() {
      const canvas = this.elements.minimap;
      const ctx = this.minimapContext;
      const size = canvas.width;
      const center = size / 2;
      const scale = size / (this.minimapRange * 2);
      const minX = this.player.x - this.minimapRange;
      const minZ = this.player.z - this.minimapRange;

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(9, 13, 18, 0.92)';
      ctx.fillRect(0, 0, size, size);

      this.drawMinimapGrid(ctx, size, scale, minX, minZ);
      this.drawMinimapObjects(ctx, scale, minX, minZ);
      this.drawMinimapNpcs(ctx, scale, minX, minZ);
      this.drawPlayerMarker(ctx, center);
      this.drawMinimapFrame(ctx, size);
    }

    drawMinimapGrid(ctx, size, scale, minX, minZ) {
      ctx.strokeStyle = 'rgba(237, 243, 247, 0.055)';
      ctx.lineWidth = 1;

      for (let x = 0; x <= WORLD.width; x += WORLD.grid) {
        const screenX = (x - minX) * scale;
        if (screenX < -1 || screenX > size + 1) continue;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, size);
        ctx.stroke();
      }

      for (let z = 0; z <= WORLD.height; z += WORLD.grid) {
        const screenY = (z - minZ) * scale;
        if (screenY < -1 || screenY > size + 1) continue;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(size, screenY);
        ctx.stroke();
      }
    }

    drawMinimapObjects(ctx, scale, minX, minZ) {
      for (const object of this.world.objects) {
        if (!this.isObjectNear(object)) continue;

        ctx.fillStyle = this.getObjectColor(object);

        if (object.shape === 'rect') {
          ctx.fillRect(
            (object.x - minX) * scale,
            (object.y - minZ) * scale,
            Math.max(1, object.w * scale),
            Math.max(1, object.h * scale)
          );
        } else {
          ctx.beginPath();
          ctx.arc((object.x - minX) * scale, (object.y - minZ) * scale, Math.max(2, object.r * scale), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    isObjectNear(object) {
      const centerX = object.shape === 'rect' ? object.x + object.w / 2 : object.x;
      const centerZ = object.shape === 'rect' ? object.y + object.h / 2 : object.y;
      const range = this.minimapRange + 260;
      return Math.abs(centerX - this.player.x) < range && Math.abs(centerZ - this.player.z) < range;
    }

    getObjectColor(object) {
      const colors = {
        road: 'rgba(126, 137, 148, 0.34)',
        building: 'rgba(218, 226, 233, 0.38)',
        fence: 'rgba(184, 195, 205, 0.42)',
        container: 'rgba(83, 153, 193, 0.48)',
        crate: 'rgba(211, 151, 83, 0.5)',
        cover: 'rgba(206, 217, 224, 0.46)',
        tree: 'rgba(66, 213, 155, 0.5)',
        rock: 'rgba(168, 176, 184, 0.5)'
      };

      return colors[object.type] || 'rgba(237, 243, 247, 0.38)';
    }

    drawMinimapNpcs(ctx, scale, minX, minZ) {
      for (const npc of this.npcManager.npcs) {
        if (!npc.alive) continue;

        const x = (npc.x - minX) * scale;
        const y = (npc.z - minZ) * scale;
        if (x < -8 || x > this.elements.minimap.width + 8 || y < -8 || y > this.elements.minimap.height + 8) continue;

        ctx.fillStyle = npc.seesPlayer ? '#ff9f5a' : '#ff5d67';
        ctx.beginPath();
        ctx.arc(x, y, npc.seesPlayer ? 4.4 : 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawPlayerMarker(ctx, center) {
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(-this.player.yaw);

      ctx.fillStyle = 'rgba(66, 213, 155, 0.18)';
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(20, 20);
      ctx.lineTo(-20, 20);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#42d59b';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(7, 8);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawMinimapFrame(ctx, size) {
      ctx.strokeStyle = 'rgba(237, 243, 247, 0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size - 2, size - 2);

      ctx.fillStyle = 'rgba(237, 243, 247, 0.45)';
      ctx.fillRect(size / 2 - 7, size / 2, 14, 1);
      ctx.fillRect(size / 2, size / 2 - 7, 1, 14);
    }
  }

  window.HudSystem = HudSystem;
})();
