(function () {
  'use strict';

  const { WORLD, PLAYER } = window.GameConfig;

  class Player {
    constructor(camera, world) {
      this.camera = camera;
      this.world = world;
      this.x = WORLD.width / 2;
      this.z = WORLD.height / 2;
      this.y = 0;
      this.yaw = 0;
      this.pitch = 0;
      this.hitFlash = 0;
      this.isMoving = false;
      this.isSprinting = false;
      this.isCrouching = false;
      this.isGrounded = true;
      this.verticalVelocity = 0;
      this.fallStartY = 0;
      this.vault = null;
      this.cameraShake = 0;
      this.cameraShakeTime = 0;
      this.knockbackX = 0;
      this.knockbackZ = 0;
      this.currentHeight = PLAYER.height;
      this.currentEyeHeight = PLAYER.eyeHeight;
      this.maxHealth = 100;
      this.health = this.maxHealth;
      this.maxArmor = 100;
      this.armor = this.maxArmor;
      this.aimSlowMultiplier = 1;
      this.keys = new Set();

      this.updateCamera();
    }

    setKey(code, pressed) {
      if (pressed) {
        this.keys.add(code);
      } else {
        this.keys.delete(code);
      }
    }

    reset() {
      this.x = WORLD.width / 2;
      this.z = WORLD.height / 2;
      this.y = this.world.getGroundHeightAt(this.x, this.z, 0);
      this.yaw = 0;
      this.pitch = 0;
      this.hitFlash = 0;
      this.isMoving = false;
      this.isSprinting = false;
      this.isCrouching = false;
      this.isGrounded = true;
      this.verticalVelocity = 0;
      this.fallStartY = this.y;
      this.vault = null;
      this.cameraShake = 0;
      this.knockbackX = 0;
      this.knockbackZ = 0;
      this.currentHeight = PLAYER.height;
      this.currentEyeHeight = PLAYER.eyeHeight;
      this.health = this.maxHealth;
      this.armor = this.maxArmor;
      this.aimSlowMultiplier = 1;
      this.keys.clear();
      this.updateCamera();
    }

    addHealth(amount) {
      this.health = window.GameUtils.clamp(this.health + amount, 0, this.maxHealth);
    }

    addArmor(amount) {
      this.armor = window.GameUtils.clamp(this.armor + amount, 0, this.maxArmor);
    }

    jump() {
      if (!this.isGrounded || this.isCrouching) return;

      this.verticalVelocity = PLAYER.jumpVelocity;
      this.isGrounded = false;
    }

    rotate(deltaX, deltaY) {
      this.yaw -= deltaX * 0.0024;
      this.pitch -= deltaY * 0.002;
      this.pitch = window.GameUtils.clamp(this.pitch, -1.25, 1.25);
      this.updateCamera();
    }

    update(dt) {
      if (this.vault) {
        this.updateVault(dt);
        this.updateStance(dt);
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        this.cameraShakeTime += dt * 58;
        this.cameraShake = Math.max(0, this.cameraShake - dt * 6.5);
        this.updateCamera();
        return;
      }

      let moveX = 0;
      let moveZ = 0;

      if (this.keys.has('KeyW')) moveZ -= 1;
      if (this.keys.has('KeyS')) moveZ += 1;
      if (this.keys.has('KeyA')) moveX -= 1;
      if (this.keys.has('KeyD')) moveX += 1;

      this.isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.isCrouching = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
      this.isMoving = moveX !== 0 || moveZ !== 0;
      this.updateStance(dt);

      if (this.isMoving) {
        const length = Math.hypot(moveX, moveZ);
        moveX /= length;
        moveZ /= length;

        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const worldX = moveX * cos + moveZ * sin;
        const worldZ = -moveX * sin + moveZ * cos;
        const speed = this.getMoveSpeed();
        const nextX = this.x + worldX * speed * dt;
        const nextZ = this.z + worldZ * speed * dt;

        const moveResult = this.world.moveCircle(
          this,
          PLAYER.radius,
          nextX,
          nextZ
        );

        if (moveResult.blockedX || moveResult.blockedZ) {
          this.isMoving = false;
        }
      }

      this.applyExternalMotion(dt);

      this.updateVerticalMotion(dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.cameraShakeTime += dt * 58;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 6.5);
      this.updateCamera();
    }

    getMoveSpeed() {
      let speed = PLAYER.speed;

      if (this.isCrouching) {
        speed *= PLAYER.crouchSpeedMultiplier;
      } else if (this.isSprinting) {
        speed *= PLAYER.sprintMultiplier;
      }

      return speed * this.aimSlowMultiplier;
    }

    updateVerticalMotion(dt) {
      const groundHeight = this.world.getGroundHeightAt(this.x, this.z, this.y);
      const ceilingHeight = this.world.getCeilingHeightAt(this.x, this.z, this.y, this.currentHeight);
      const maxFeetY = ceilingHeight === null ? Infinity : ceilingHeight - this.currentHeight - 2;

      if (this.isGrounded && this.y > groundHeight + 2) {
        this.isGrounded = false;
        this.fallStartY = this.y;
      }

      if (!this.isGrounded) {
        this.verticalVelocity -= PLAYER.gravity * dt;
        this.y += this.verticalVelocity * dt;

        if (this.y > maxFeetY) {
          this.y = maxFeetY;
          this.verticalVelocity = Math.min(0, this.verticalVelocity);
        }

        if (this.y <= groundHeight) {
          this.y = groundHeight;
          this.verticalVelocity = 0;
          this.isGrounded = true;
          this.applyFallDamage(this.fallStartY - groundHeight);
          this.fallStartY = groundHeight;
        }
      } else if (this.y < groundHeight) {
        this.y = groundHeight;
        this.fallStartY = groundHeight;
      } else if (this.y > maxFeetY) {
        this.y = maxFeetY;
        this.verticalVelocity = 0;
      }
    }

    applyFallDamage(fallDistance) {
      if (fallDistance <= PLAYER.fallSafeHeight) return;

      const damage = (fallDistance - PLAYER.fallSafeHeight) * PLAYER.fallDamagePerMeter;
      this.health = Math.max(0, this.health - damage);
      this.hitFlash = 0.12;
    }

    updateStance(dt) {
      const targetHeight = this.isCrouching ? PLAYER.crouchHeight : PLAYER.height;
      const targetEyeHeight = this.isCrouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
      const smoothing = 1 - Math.exp(-PLAYER.crouchSmoothness * dt);

      this.currentHeight += (targetHeight - this.currentHeight) * smoothing;
      this.currentEyeHeight += (targetEyeHeight - this.currentEyeHeight) * smoothing;
    }

    updateCamera() {
      const shakeX = Math.sin(this.cameraShakeTime * 1.7) * this.cameraShake * 1.9;
      const shakeY = Math.cos(this.cameraShakeTime * 1.15) * this.cameraShake * 1.35;

      this.camera.position.set(this.x + shakeX, this.y + this.currentEyeHeight + shakeY, this.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch - this.cameraShake * 0.004;
    }

    getShootOrigin() {
      return this.camera.position.clone();
    }

    getShootOriginTo(target) {
      return target.copy(this.camera.position);
    }

    getShootDirection() {
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(this.camera.quaternion);
      return direction.normalize();
    }

    getShootDirectionTo(target) {
      return target.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    }

    getEyeHeight() {
      return this.currentEyeHeight;
    }

    addCameraShake(amount) {
      this.cameraShake = Math.min(1.2, this.cameraShake + amount);
    }

    applyKnockback(directionX, directionZ, force, vertical) {
      const length = Math.hypot(directionX, directionZ) || 1;
      this.knockbackX += (directionX / length) * force;
      this.knockbackZ += (directionZ / length) * force;
      if (vertical && this.isGrounded) {
        this.verticalVelocity = Math.max(this.verticalVelocity, vertical);
        this.isGrounded = false;
      }
    }

    applyExternalMotion(dt) {
      if (Math.hypot(this.knockbackX, this.knockbackZ) < 1) {
        this.knockbackX = 0;
        this.knockbackZ = 0;
        return;
      }

      this.world.moveCircle(this, PLAYER.radius, this.x + this.knockbackX * dt, this.z + this.knockbackZ * dt);
      this.knockbackX *= Math.exp(-4.5 * dt);
      this.knockbackZ *= Math.exp(-4.5 * dt);
    }

    tryVault() {
      if (this.vault || this.isCrouching || !this.isGrounded) return false;

      const directionX = -Math.sin(this.yaw);
      const directionZ = -Math.cos(this.yaw);
      const object = this.world.getVaultCandidate(
        this.x,
        this.z,
        this.y,
        directionX,
        directionZ,
        PLAYER.radius
      );

      return this.tryStartVault(directionX, directionZ, object);
    }

    tryStartVault(directionX, directionZ, object) {
      if (!object || !object.vaultable || this.isCrouching || !this.isGrounded) return false;

      const objectHeight = this.world.getObjectHeight(object);
      if (objectHeight > PLAYER.vaultMaxHeight || objectHeight <= 10) return false;

      const exitPoint = this.getVaultExitPoint(directionX, directionZ, object);
      const endX = exitPoint.x;
      const endZ = exitPoint.z;
      const endY = this.world.getGroundHeightAt(endX, endZ, this.y);

      if (Math.abs(endY - this.y) > 18) {
        return false;
      }

      if (this.world.collides(endX, endZ, PLAYER.radius, this.y)) {
        return false;
      }

      if (!this.world.hasVaultClearance(endX, endZ, this.y, PLAYER.height)) {
        return false;
      }

      this.vault = {
        elapsed: 0,
        duration: PLAYER.vaultDuration,
        startX: this.x,
        startZ: this.z,
        startY: this.y,
        endX,
        endZ,
        endY,
        obstacleHeight: objectHeight
      };
      this.verticalVelocity = 0;
      this.isGrounded = true;
      return true;
    }

    getVaultExitPoint(directionX, directionZ, object) {
      if (object.shape !== 'rect') {
        return {
          x: object.x + directionX * (object.r + PLAYER.radius + 14),
          z: object.y + directionZ * (object.r + PLAYER.radius + 14)
        };
      }

      const end = { x: this.x + directionX * PLAYER.vaultDistance, z: this.z + directionZ * PLAYER.vaultDistance };
      const padding = PLAYER.radius + 14;

      if (Math.abs(directionX) > Math.abs(directionZ)) {
        end.x = directionX > 0 ? object.x + object.w + padding : object.x - padding;
        end.z = window.GameUtils.clamp(end.z, object.y - padding, object.y + object.h + padding);
      } else {
        end.z = directionZ > 0 ? object.y + object.h + padding : object.y - padding;
        end.x = window.GameUtils.clamp(end.x, object.x - padding, object.x + object.w + padding);
      }

      return end;
    }

    updateVault(dt) {
      this.vault.elapsed += dt;
      const rawT = Math.min(1, this.vault.elapsed / this.vault.duration);
      const smoothT = rawT * rawT * (3 - rawT * 2);
      const arc = Math.sin(rawT * Math.PI) * Math.max(PLAYER.vaultArcHeight, this.vault.obstacleHeight * 0.72);

      this.x = this.vault.startX + (this.vault.endX - this.vault.startX) * smoothT;
      this.z = this.vault.startZ + (this.vault.endZ - this.vault.startZ) * smoothT;
      this.y = this.vault.startY + (this.vault.endY - this.vault.startY) * smoothT + arc;
      this.isMoving = true;

      if (rawT >= 1) {
        this.x = this.vault.endX;
        this.z = this.vault.endZ;
        this.y = this.vault.endY;
        this.fallStartY = this.y;
        this.vault = null;
      }
    }

    markHit(damage) {
      const incomingDamage = Math.max(0, damage || 0);
      const absorbed = Math.min(this.armor, incomingDamage);
      this.armor = Math.max(0, this.armor - absorbed);
      this.health = Math.max(0, this.health - (incomingDamage - absorbed));
      this.hitFlash = 0.12;
    }
  }

  window.Player = Player;
})();
