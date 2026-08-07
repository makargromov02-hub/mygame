(function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function circleIntersectsRect(cx, cz, radius, rect) {
    const closestX = clamp(cx, rect.x, rect.x + rect.w);
    const closestZ = clamp(cz, rect.y, rect.y + rect.h);
    return Math.hypot(cx - closestX, cz - closestZ) < radius;
  }

  function circleIntersectsCircle(ax, az, ar, circle) {
    return Math.hypot(ax - circle.x, az - circle.y) < ar + circle.r;
  }

  function angleToTarget(fromX, fromZ, toX, toZ) {
    return Math.atan2(toX - fromX, toZ - fromZ);
  }

  function applyYawSpread(direction, spread) {
    return applyYawSpreadTo(new THREE.Vector3(), direction, spread);
  }

  function applyYawSpreadTo(target, direction, spread) {
    const angle = (Math.random() - 0.5) * spread;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return target.set(
      direction.x * cos - direction.z * sin,
      direction.y,
      direction.x * sin + direction.z * cos
    ).normalize();
  }

  window.GameUtils = {
    clamp,
    randomRange,
    circleIntersectsRect,
    circleIntersectsCircle,
    angleToTarget,
    applyYawSpread,
    applyYawSpreadTo
  };
})();
