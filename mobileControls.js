(function () {
  'use strict';

  const STORAGE_KEY = 'controlMode';
  const SENSITIVITY_KEY = 'mobileSensitivity';
  const LAYOUT_KEY = 'mobileControlsLayoutV1';
  const LEGACY_LAYOUT_KEY = 'mobileControlLayout';
  const MODES = { desktop: 'desktop', mobile: 'mobile' };
  const DEFAULT_LAYOUT = {
    version: 1,
    scale: 1,
    opacity: 1,
    positions: {
      joystick: { x: 0.18, y: 0.82 },
      fire: { x: 0.88, y: 0.78 },
      jump: { x: 0.72, y: 0.78 },
      reload: { x: 0.78, y: 0.91 },
      interact: { x: 0.88, y: 0.64 },
      pistol: { x: 0.60, y: 0.91 },
      rifle: { x: 0.46, y: 0.91 },
      menu: { x: 0.92, y: 0.07 }
    },
    elementScale: {
      joystick: 1,
      fire: 1,
      jump: 1,
      reload: 1,
      interact: 1,
      pistol: 1,
      rifle: 1,
      menu: 1
    }
  };
  const CONTROL_LABELS = {
    joystick: 'Джойстик',
    fire: 'Огонь',
    jump: 'Прыжок',
    reload: 'Перезарядка',
    interact: 'Взаимодействие',
    pistol: 'Пистолет',
    rifle: 'Автомат',
    menu: 'Меню'
  };
  const MIN_ELEMENT_SCALE = 0.7;
  const MAX_ELEMENT_SCALE = 1.5;
  const SAFE_MARGIN = 12;

  class DeviceModeSystem {
    constructor(elements, callbacks) {
      this.elements = elements;
      this.callbacks = callbacks || {};
      this.mode = localStorage.getItem(STORAGE_KEY) || '';
      this.bindUi();
      this.applyMode(this.mode || MODES.desktop, false);
      if (!this.mode) this.showChooser();
    }

    bindUi() {
      if (this.elements.desktopDeviceButton) {
        this.elements.desktopDeviceButton.addEventListener('click', () => this.choose(MODES.desktop));
      }
      if (this.elements.mobileDeviceButton) {
        this.elements.mobileDeviceButton.addEventListener('click', () => this.choose(MODES.mobile));
      }
      if (this.elements.changeDeviceButton) {
        this.elements.changeDeviceButton.addEventListener('click', () => this.showChooser());
      }
    }

    choose(mode) {
      this.mode = mode === MODES.mobile ? MODES.mobile : MODES.desktop;
      localStorage.setItem(STORAGE_KEY, this.mode);
      this.hideChooser();
      this.applyMode(this.mode, true);
    }

    showChooser() {
      if (this.elements.deviceScreen) this.elements.deviceScreen.classList.remove('hidden');
      if (this.callbacks.onChooserOpen) this.callbacks.onChooserOpen();
    }

    hideChooser() {
      if (this.elements.deviceScreen) this.elements.deviceScreen.classList.add('hidden');
    }

    applyMode(mode, notify) {
      const nextMode = mode === MODES.mobile ? MODES.mobile : MODES.desktop;
      document.body.classList.toggle('control-mobile', nextMode === MODES.mobile);
      document.body.classList.toggle('control-desktop', nextMode === MODES.desktop);
      if (notify && this.callbacks.onModeChange) this.callbacks.onModeChange(nextMode);
    }

    isMobile() {
      return this.mode === MODES.mobile;
    }
  }

  class MobileControls {
    constructor(elements, handlers) {
      this.elements = elements;
      this.handlers = handlers || {};
      this.enabled = false;
      this.visible = false;
      this.joystickPointerId = null;
      this.lookPointerId = null;
      this.firePointerIds = new Set();
      this.joystickCenter = { x: 0, y: 0 };
      this.joystickRadius = 58;
      this.joystickInputRadius = 74;
      this.joystickDeadZone = 0.13;
      this.lastLook = { x: 0, y: 0 };
      this.pendingLook = { x: 0, y: 0 };
      this.lookSensitivity = this.loadSensitivity();
      this.currentWeapon = 'pistol';
      this.layout = this.loadLayout();
      this.editMode = false;
      this.editSnapshot = null;
      this.selectedEditKey = null;
      this.dragState = null;
      this.editableControls = {};
      this.preventTouchDefault = (event) => {
        if (this.enabled) event.preventDefault();
      };
      document.addEventListener('touchmove', this.preventTouchDefault, { passive: false });
      document.addEventListener('gesturestart', this.preventTouchDefault, { passive: false });
      window.addEventListener('resize', () => this.applyLayout());
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => this.applyLayout());
        window.visualViewport.addEventListener('scroll', () => this.applyLayout());
      }
      this.bindUi();
      this.setEnabled(false);
    }

    bindUi() {
      const root = this.elements.mobileControls;
      if (root) {
        root.addEventListener('pointerdown', (event) => this.handleEditPointerDown(event), true);
        root.addEventListener('pointermove', (event) => this.handleEditPointerMove(event), true);
        root.addEventListener('pointerup', (event) => this.handleEditPointerUp(event), true);
        root.addEventListener('pointercancel', (event) => this.handleEditPointerUp(event), true);
        root.addEventListener('lostpointercapture', (event) => this.handleEditPointerLost(event), true);
        root.addEventListener('pointercancel', (event) => this.releasePointer(event));
        root.addEventListener('lostpointercapture', (event) => this.releasePointer(event));
      }

      this.registerEditableControls();
      this.bindJoystick();
      this.bindLook();
      this.bindHoldButton(this.elements.mobileFireButton, (pressed) => this.handleFire(pressed));
      this.bindTapButton(this.elements.mobileJumpButton, () => this.handlers.jump && this.handlers.jump());
      this.bindTapButton(this.elements.mobileReloadButton, () => this.handlers.reload && this.handlers.reload());
      this.bindTapButton(this.elements.mobileInteractButton, () => this.handlers.interact && this.handlers.interact());
      this.bindTapButton(this.elements.mobilePistolButton, () => this.selectWeapon('pistol'));
      this.bindTapButton(this.elements.mobileRifleButton, () => this.selectWeapon('rifle'));
      this.bindTapButton(this.elements.mobileWeaponButton, () => this.switchWeapon());
      this.bindTapButton(this.elements.mobileMenuButton, () => this.handlers.menu && this.handlers.menu());
      this.bindSensitivitySetting();
      this.bindLayoutSettings();
      this.bindEditToolbar();
      this.applyLayout();
      this.updateWeaponButtons();
    }

    registerEditableControls() {
      const pairs = [
        ['joystick', this.elements.mobileJoystick],
        ['fire', this.elements.mobileFireButton],
        ['jump', this.elements.mobileJumpButton],
        ['reload', this.elements.mobileReloadButton],
        ['interact', this.elements.mobileInteractButton],
        ['pistol', this.elements.mobilePistolButton],
        ['rifle', this.elements.mobileRifleButton],
        ['menu', this.elements.mobileMenuButton]
      ];

      for (const [key, element] of pairs) {
        if (!element) continue;
        element.dataset.mobileControl = key;
        this.editableControls[key] = element;
      }
    }

    loadLayout() {
      const fallback = this.cloneLayout(DEFAULT_LAYOUT);
      try {
        const raw = localStorage.getItem(LAYOUT_KEY) || localStorage.getItem(LEGACY_LAYOUT_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (parsed.version && parsed.version !== 1) return fallback;
        const next = this.cloneLayout(DEFAULT_LAYOUT);
        if (Number.isFinite(parsed.scale)) next.scale = this.clamp(parsed.scale, 0.8, 1.35);
        if (Number.isFinite(parsed.opacity)) next.opacity = this.clamp(parsed.opacity, 0.3, 1);
        if (parsed.positions && typeof parsed.positions === 'object') {
          for (const key of Object.keys(next.positions)) {
            const position = parsed.positions[key];
            if (!position) continue;
            if (Number.isFinite(position.x)) next.positions[key].x = this.clamp(position.x, 0, 1);
            if (Number.isFinite(position.y)) next.positions[key].y = this.clamp(position.y, 0, 1);
          }
        }
        if (parsed.elementScale && typeof parsed.elementScale === 'object') {
          for (const key of Object.keys(next.elementScale)) {
            const value = parsed.elementScale[key];
            if (Number.isFinite(value)) next.elementScale[key] = this.clamp(value, MIN_ELEMENT_SCALE, MAX_ELEMENT_SCALE);
          }
        }
        return next;
      } catch (error) {
        return fallback;
      }
    }

    cloneLayout(layout) {
      return JSON.parse(JSON.stringify(layout));
    }

    saveLayout() {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout));
    }

    resetLayout(save) {
      this.layout = this.cloneLayout(DEFAULT_LAYOUT);
      this.applyLayout();
      this.updateLayoutSettings();
      if (save) this.saveLayout();
    }

    clamp(value, min, max) {
      if (window.GameUtils && window.GameUtils.clamp) return window.GameUtils.clamp(value, min, max);
      return Math.min(max, Math.max(min, value));
    }

    getSafeInsets() {
      const styles = getComputedStyle(document.documentElement);
      return {
        top: parseFloat(styles.getPropertyValue('--safe-top')) || 0,
        right: parseFloat(styles.getPropertyValue('--safe-right')) || 0,
        bottom: parseFloat(styles.getPropertyValue('--safe-bottom')) || 0,
        left: parseFloat(styles.getPropertyValue('--safe-left')) || 0
      };
    }

    getSafeRect() {
      const viewport = this.getViewportSize();
      const safe = this.getSafeInsets();
      const left = safe.left + SAFE_MARGIN;
      const top = safe.top + SAFE_MARGIN;
      return {
        left,
        top,
        width: Math.max(1, viewport.width - safe.left - safe.right - SAFE_MARGIN * 2),
        height: Math.max(1, viewport.height - safe.top - safe.bottom - SAFE_MARGIN * 2)
      };
    }

    getViewportSize() {
      const viewport = window.visualViewport;
      return {
        width: viewport ? viewport.width : window.innerWidth,
        height: viewport ? viewport.height : window.innerHeight
      };
    }

    applyLayout() {
      const root = this.elements.mobileControls;
      if (!root) return;

      root.style.setProperty('--mobile-control-scale', this.layout.scale.toFixed(3));
      root.style.setProperty('--mobile-control-opacity', this.layout.opacity.toFixed(3));
      for (const key of Object.keys(this.editableControls)) {
        this.applyControlPosition(key);
      }
      this.updateSelectedScaleControl();
    }

    applyControlPosition(key) {
      const element = this.editableControls[key];
      const position = this.layout.positions[key];
      if (!element || !position) return;

      const safeRect = this.getSafeRect();
      const baseWidth = element.offsetWidth || element.getBoundingClientRect().width || 56;
      const baseHeight = element.offsetHeight || element.getBoundingClientRect().height || 56;
      const scale = this.getControlScale(key);
      const halfWidth = (baseWidth * scale) / 2;
      const halfHeight = (baseHeight * scale) / 2;
      const minX = safeRect.left + halfWidth;
      const maxX = safeRect.left + safeRect.width - halfWidth;
      const minY = safeRect.top + halfHeight;
      const maxY = safeRect.top + safeRect.height - halfHeight;
      const x = this.clamp(safeRect.left + position.x * safeRect.width, minX, Math.max(minX, maxX));
      const y = this.clamp(safeRect.top + position.y * safeRect.height, minY, Math.max(minY, maxY));

      element.style.left = x.toFixed(1) + 'px';
      element.style.top = y.toFixed(1) + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      element.style.transformOrigin = 'center';
      element.style.transform = 'translate(-50%, -50%) scale(' + scale.toFixed(3) + ')';
    }

    getControlScale(key) {
      const globalScale = Number.isFinite(this.layout.scale) ? this.layout.scale : 1;
      const elementScale = this.layout.elementScale && Number.isFinite(this.layout.elementScale[key])
        ? this.layout.elementScale[key]
        : 1;
      return this.clamp(globalScale * elementScale, 0.55, 2.05);
    }

    bindJoystick() {
      const joystick = this.elements.mobileJoystick;
      if (!joystick) return;

      joystick.addEventListener('pointerdown', (event) => {
        if (!this.enabled || this.joystickPointerId !== null) return;
        event.preventDefault();
        this.joystickPointerId = event.pointerId;
        this.safeSetPointerCapture(joystick, event.pointerId);
        const rect = joystick.getBoundingClientRect();
        this.joystickCenter.x = rect.left + rect.width / 2;
        this.joystickCenter.y = rect.top + rect.height / 2;
        this.joystickRadius = Math.max(42, rect.width * 0.38);
        this.joystickInputRadius = Math.max(this.joystickRadius + 18, rect.width * 0.56);
        joystick.classList.add('mobile-joystick-active');
        this.updateJoystick(event.clientX, event.clientY);
      });

      joystick.addEventListener('pointermove', (event) => {
        if (event.pointerId !== this.joystickPointerId) return;
        event.preventDefault();
        this.updateJoystick(event.clientX, event.clientY);
      });

      joystick.addEventListener('pointerup', (event) => this.releaseJoystick(event));
      joystick.addEventListener('pointercancel', (event) => this.releaseJoystick(event));
    }

    bindLook() {
      const lookZone = this.elements.mobileLookZone;
      if (!lookZone) return;

      lookZone.addEventListener('pointerdown', (event) => {
        if (!this.enabled || this.lookPointerId !== null) return;
        event.preventDefault();
        this.lookPointerId = event.pointerId;
        this.lastLook.x = event.clientX;
        this.lastLook.y = event.clientY;
        this.pendingLook.x = 0;
        this.pendingLook.y = 0;
        this.safeSetPointerCapture(lookZone, event.pointerId);
      });

      lookZone.addEventListener('pointermove', (event) => {
        if (event.pointerId !== this.lookPointerId) return;
        event.preventDefault();
        const dx = event.clientX - this.lastLook.x;
        const dy = event.clientY - this.lastLook.y;
        this.lastLook.x = event.clientX;
        this.lastLook.y = event.clientY;
        this.pendingLook.x += dx;
        this.pendingLook.y += dy;
      });

      lookZone.addEventListener('pointerup', (event) => this.releaseLook(event));
      lookZone.addEventListener('pointercancel', (event) => this.releaseLook(event));
    }

    bindHoldButton(button, callback) {
      if (!button) return;
      button.addEventListener('pointerdown', (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        this.safeSetPointerCapture(button, event.pointerId);
        this.firePointerIds.add(event.pointerId);
        button.classList.add('mobile-control-active');
        callback(true);
      });
      button.addEventListener('pointerup', (event) => {
        if (!this.firePointerIds.has(event.pointerId)) return;
        event.preventDefault();
        this.firePointerIds.delete(event.pointerId);
        button.classList.toggle('mobile-control-active', this.firePointerIds.size > 0);
        callback(this.firePointerIds.size > 0);
      });
      button.addEventListener('pointercancel', (event) => {
        if (!this.firePointerIds.has(event.pointerId)) return;
        this.firePointerIds.delete(event.pointerId);
        button.classList.toggle('mobile-control-active', this.firePointerIds.size > 0);
        callback(this.firePointerIds.size > 0);
      });
    }

    bindTapButton(button, callback) {
      if (!button) return;
      button.addEventListener('pointerdown', (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        this.safeSetPointerCapture(button, event.pointerId);
        button.classList.add('mobile-control-active');
        callback();
      });
      button.addEventListener('pointerup', () => button.classList.remove('mobile-control-active'));
      button.addEventListener('pointercancel', () => button.classList.remove('mobile-control-active'));
    }

    safeSetPointerCapture(element, pointerId) {
      if (!element || !element.setPointerCapture) return;
      try {
        element.setPointerCapture(pointerId);
      } catch (error) {
        // Orientation changes can invalidate active mobile pointers between events.
      }
    }

    updateJoystick(clientX, clientY) {
      const dx = clientX - this.joystickCenter.x;
      const dy = clientY - this.joystickCenter.y;
      const distance = Math.hypot(dx, dy);
      const scale = distance > this.joystickRadius ? this.joystickRadius / distance : 1;
      const knobX = dx * scale;
      const knobY = dy * scale;

      if (this.elements.mobileJoystickKnob) {
        this.elements.mobileJoystickKnob.style.transform = 'translate(' + knobX.toFixed(1) + 'px, ' + knobY.toFixed(1) + 'px)';
      }

      if (this.handlers.move) {
        if (distance < 0.001) {
          this.handlers.move(0, 0);
          return;
        }

        const rawAmount = Math.min(1, distance / this.joystickInputRadius);
        if (rawAmount <= this.joystickDeadZone) {
          this.handlers.move(0, 0);
          return;
        }

        const amount = (rawAmount - this.joystickDeadZone) / (1 - this.joystickDeadZone);
        this.handlers.move((dx / distance) * amount, (dy / distance) * amount);
      }
    }

    releaseJoystick(event) {
      if (event.pointerId !== this.joystickPointerId) return;
      event.preventDefault();
      this.joystickPointerId = null;
      if (this.elements.mobileJoystick) this.elements.mobileJoystick.classList.remove('mobile-joystick-active');
      if (this.elements.mobileJoystickKnob) this.elements.mobileJoystickKnob.style.transform = 'translate(0, 0)';
      if (this.handlers.move) this.handlers.move(0, 0);
    }

    releaseLook(event) {
      if (event.pointerId !== this.lookPointerId) return;
      event.preventDefault();
      this.lookPointerId = null;
      this.pendingLook.x = 0;
      this.pendingLook.y = 0;
    }

    releasePointer(event) {
      if (event.pointerId === this.joystickPointerId) this.releaseJoystick(event);
      if (event.pointerId === this.lookPointerId) this.releaseLook(event);
    }

    handleFire(pressed) {
      if (this.handlers.fire) this.handlers.fire(pressed);
    }

    switchWeapon() {
      this.selectWeapon(this.currentWeapon === 'pistol' ? 'rifle' : 'pistol');
    }

    selectWeapon(type) {
      this.currentWeapon = type === 'rifle' ? 'rifle' : 'pistol';
      this.updateWeaponButtons();
      if (this.handlers.switchWeapon) this.handlers.switchWeapon(this.currentWeapon);
    }

    updateWeaponButtons() {
      if (this.elements.mobilePistolButton) {
        this.elements.mobilePistolButton.classList.toggle('mobile-weapon-selected', this.currentWeapon === 'pistol');
      }
      if (this.elements.mobileRifleButton) {
        this.elements.mobileRifleButton.classList.toggle('mobile-weapon-selected', this.currentWeapon === 'rifle');
      }
    }

    loadSensitivity() {
      const raw = localStorage.getItem(SENSITIVITY_KEY);
      if (raw === null) return 1;
      const saved = Number(raw);
      if (Number.isFinite(saved)) return window.GameUtils ? window.GameUtils.clamp(saved, 0.5, 1.8) : Math.min(1.8, Math.max(0.5, saved));
      return 1;
    }

    setSensitivity(value) {
      const next = Number(value);
      this.lookSensitivity = window.GameUtils
        ? window.GameUtils.clamp(next || 1, 0.5, 1.8)
        : Math.min(1.8, Math.max(0.5, next || 1));
      localStorage.setItem(SENSITIVITY_KEY, String(this.lookSensitivity));
      if (this.elements.mobileSensitivity) this.elements.mobileSensitivity.value = Math.round(this.lookSensitivity * 100);
      if (this.elements.mobileSensitivityValue) this.elements.mobileSensitivityValue.textContent = Math.round(this.lookSensitivity * 100) + '%';
      if (this.elements.mobileMenuSensitivity) this.elements.mobileMenuSensitivity.value = Math.round(this.lookSensitivity * 100);
      if (this.elements.mobileMenuSensitivityValue) this.elements.mobileMenuSensitivityValue.textContent = Math.round(this.lookSensitivity * 100) + '%';
    }

    bindSensitivitySetting() {
      const input = this.elements.mobileSensitivity;
      this.setSensitivity(this.lookSensitivity);
      if (input) input.addEventListener('input', () => this.setSensitivity(Number(input.value) / 100));
      if (this.elements.mobileMenuSensitivity) {
        this.elements.mobileMenuSensitivity.addEventListener('input', () => this.setSensitivity(Number(this.elements.mobileMenuSensitivity.value) / 100));
      }
    }

    bindLayoutSettings() {
      const scale = this.elements.mobileControlScale;
      const opacity = this.elements.mobileControlOpacity;
      const reset = this.elements.mobileResetControlsButton;
      const edit = this.elements.mobileEditLayoutButton;

      if (scale) {
        scale.addEventListener('input', () => {
          this.layout.scale = this.clamp(Number(scale.value) / 100, 0.8, 1.35);
          this.applyLayout();
          this.updateLayoutSettings();
          this.saveLayout();
        });
      }
      if (opacity) {
        opacity.addEventListener('input', () => {
          this.layout.opacity = this.clamp(Number(opacity.value) / 100, 0.3, 1);
          this.applyLayout();
          this.updateLayoutSettings();
          this.saveLayout();
        });
      }
      if (reset) reset.addEventListener('click', () => this.resetLayout(true));
      if (edit) edit.addEventListener('click', () => this.enterEditMode());
      this.updateLayoutSettings();
    }

    bindEditToolbar() {
      const save = this.elements.mobileEditSaveButton;
      const cancel = this.elements.mobileEditCancelButton;
      const reset = this.elements.mobileEditResetButton;
      const selectedScale = this.elements.mobileSelectedScale;
      if (save) save.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.saveEditMode();
      });
      if (cancel) cancel.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.cancelEditMode();
      });
      if (reset) reset.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (!window.confirm || window.confirm('Сбросить расположение сенсорного управления?')) {
          this.resetLayout(false);
          this.selectEditControl('joystick');
        }
      });
      if (selectedScale) {
        selectedScale.addEventListener('input', () => {
          if (!this.selectedEditKey) return;
          this.setElementScale(this.selectedEditKey, Number(selectedScale.value) / 100);
        });
        selectedScale.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          event.stopImmediatePropagation();
        });
        selectedScale.addEventListener('pointermove', (event) => {
          event.stopPropagation();
        });
        selectedScale.addEventListener('pointerup', (event) => {
          event.stopPropagation();
        });
        selectedScale.addEventListener('pointercancel', (event) => {
          event.stopPropagation();
        });
      }
    }

    setElementScale(key, value) {
      if (!this.layout.elementScale || !this.editableControls[key]) return;
      this.layout.elementScale[key] = this.clamp(Number(value) || 1, MIN_ELEMENT_SCALE, MAX_ELEMENT_SCALE);
      this.applyControlPosition(key);
      this.updateSelectedScaleControl();
    }

    updateSelectedScaleControl() {
      const input = this.elements.mobileSelectedScale;
      const value = this.elements.mobileSelectedScaleValue;
      if (!input || !value) return;
      const key = this.selectedEditKey;
      const scale = key && this.layout.elementScale && Number.isFinite(this.layout.elementScale[key])
        ? this.layout.elementScale[key]
        : 1;
      const percent = Math.round(scale * 100);
      input.value = percent;
      value.textContent = percent + '%';
      input.disabled = !key;
      input.closest('label')?.classList.toggle('mobile-edit-disabled', !key);
    }

    updateLayoutSettings() {
      const scalePercent = Math.round((this.layout.scale || 1) * 100);
      const opacityPercent = Math.round((this.layout.opacity || 1) * 100);
      if (this.elements.mobileControlScale) this.elements.mobileControlScale.value = scalePercent;
      if (this.elements.mobileControlScaleValue) this.elements.mobileControlScaleValue.textContent = scalePercent + '%';
      if (this.elements.mobileControlOpacity) this.elements.mobileControlOpacity.value = opacityPercent;
      if (this.elements.mobileControlOpacityValue) this.elements.mobileControlOpacityValue.textContent = opacityPercent + '%';
      if (this.elements.mobileMenuSensitivity) this.elements.mobileMenuSensitivity.value = Math.round(this.lookSensitivity * 100);
      if (this.elements.mobileMenuSensitivityValue) this.elements.mobileMenuSensitivityValue.textContent = Math.round(this.lookSensitivity * 100) + '%';
    }

    enterEditMode() {
      if (!this.enabled) return;
      this.editSnapshot = this.cloneLayout(this.layout);
      this.editMode = true;
      this.selectedEditKey = null;
      if (this.handlers.beginEdit) this.handlers.beginEdit();
      if (this.elements.mobileControls) this.elements.mobileControls.classList.add('mobile-editing');
      if (this.elements.mobileEditToolbar) this.elements.mobileEditToolbar.classList.remove('hidden');
      this.setVisible(true);
      this.clearEditSelection();
      this.selectEditControl('joystick');
    }

    exitEditMode() {
      this.editMode = false;
      this.dragState = null;
      this.selectedEditKey = null;
      if (this.elements.mobileControls) this.elements.mobileControls.classList.remove('mobile-editing');
      if (this.elements.mobileEditToolbar) this.elements.mobileEditToolbar.classList.add('hidden');
      this.clearEditSelection();
      if (this.handlers.endEdit) this.handlers.endEdit();
      this.updateVisibility();
    }

    saveEditMode() {
      if (!this.editMode) return;
      this.saveLayout();
      this.updateLayoutSettings();
      this.exitEditMode();
    }

    cancelEditMode() {
      if (!this.editMode) return;
      if (this.editSnapshot) this.layout = this.cloneLayout(this.editSnapshot);
      this.applyLayout();
      this.updateLayoutSettings();
      this.exitEditMode();
    }

    clearEditSelection() {
      for (const element of Object.values(this.editableControls)) {
        element.classList.remove('mobile-edit-selected');
      }
      this.updateSelectedScaleControl();
    }

    selectEditControl(key) {
      this.selectedEditKey = key;
      this.clearEditSelection();
      const element = this.editableControls[key];
      if (element) element.classList.add('mobile-edit-selected');
      if (this.elements.mobileEditHint) {
        const label = CONTROL_LABELS[key] || (element ? (element.getAttribute('aria-label') || key) : key);
        this.elements.mobileEditHint.textContent = 'Выбрано: ' + label;
      }
      this.updateSelectedScaleControl();
    }

    update(dt) {
      if (!this.enabled || !this.handlers.look) return;
      const absX = Math.abs(this.pendingLook.x);
      const absY = Math.abs(this.pendingLook.y);
      if (absX + absY < 0.001) return;

      const smoothing = 1 - Math.exp(-30 * Math.min(dt || 0.016, 0.05));
      const consumeX = this.pendingLook.x * smoothing;
      const consumeY = this.pendingLook.y * smoothing;
      this.pendingLook.x -= consumeX;
      this.pendingLook.y -= consumeY;
      this.handlers.look(consumeX * this.lookSensitivity * 1.22, consumeY * this.lookSensitivity * 1.22);
    }

    handleEditPointerDown(event) {
      if (!this.editMode) return;
      if (this.isEditToolbarEvent(event)) {
        this.dragState = null;
        return;
      }
      const target = event.target.closest ? event.target.closest('[data-mobile-control]') : null;
      if (!target || !this.elements.mobileControls.contains(target)) return;
      const key = target.dataset.mobileControl;
      if (!this.editableControls[key]) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.selectEditControl(key);
      this.dragState = { pointerId: event.pointerId, key };
      this.safeSetPointerCapture(target, event.pointerId);
      this.moveEditedControl(key, event.clientX, event.clientY);
    }

    handleEditPointerMove(event) {
      if (!this.editMode || !this.dragState || event.pointerId !== this.dragState.pointerId) return;
      if (this.isEditToolbarEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.moveEditedControl(this.dragState.key, event.clientX, event.clientY);
    }

    handleEditPointerUp(event) {
      if (!this.editMode || !this.dragState || event.pointerId !== this.dragState.pointerId) return;
      if (this.isEditToolbarEvent(event)) {
        this.dragState = null;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.moveEditedControl(this.dragState.key, event.clientX, event.clientY);
      this.dragState = null;
    }

    handleEditPointerLost(event) {
      if (!this.editMode || !this.dragState || event.pointerId !== this.dragState.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.dragState = null;
    }

    isEditToolbarEvent(event) {
      return Boolean(this.elements.mobileEditToolbar && this.elements.mobileEditToolbar.contains(event.target));
    }

    moveEditedControl(key, clientX, clientY) {
      const safeRect = this.getSafeRect();
      if (!safeRect.width || !safeRect.height || !this.layout.positions[key]) return;
      const element = this.editableControls[key];
      const rect = element ? element.getBoundingClientRect() : { width: 56, height: 56 };
      const halfWidth = Math.max(20, rect.width / 2);
      const halfHeight = Math.max(20, rect.height / 2);
      const minX = safeRect.left + halfWidth;
      const maxX = safeRect.left + safeRect.width - halfWidth;
      const minY = safeRect.top + halfHeight;
      const maxY = safeRect.top + safeRect.height - halfHeight;
      const x = this.clamp(clientX, minX, Math.max(minX, maxX));
      const y = this.clamp(clientY, minY, Math.max(minY, maxY));
      this.layout.positions[key].x = this.clamp((x - safeRect.left) / safeRect.width, 0, 1);
      this.layout.positions[key].y = this.clamp((y - safeRect.top) / safeRect.height, 0, 1);
      this.applyControlPosition(key);
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      if (!this.enabled) {
        if (this.editMode) this.cancelEditMode();
        this.resetActivePointers();
      }
      this.updateVisibility();
    }

    handleViewportChange() {
      this.resetActivePointers();
      this.applyLayout();
    }

    resetActivePointers() {
      this.joystickPointerId = null;
      this.lookPointerId = null;
      this.firePointerIds.clear();
      this.pendingLook.x = 0;
      this.pendingLook.y = 0;
      if (this.handlers.move) this.handlers.move(0, 0);
      if (this.handlers.fire) this.handlers.fire(false);
      if (this.elements.mobileJoystick) this.elements.mobileJoystick.classList.remove('mobile-joystick-active');
      if (this.elements.mobileJoystickKnob) this.elements.mobileJoystickKnob.style.transform = 'translate(0, 0)';
      for (const element of Object.values(this.editableControls)) {
        element.classList.remove('mobile-control-active');
      }
    }

    setVisible(visible) {
      this.visible = Boolean(visible);
      this.updateVisibility();
    }

    updateVisibility() {
      if (!this.elements.mobileControls) return;
      this.elements.mobileControls.classList.toggle('hidden', !(this.enabled && (this.visible || this.editMode)));
    }
  }

  window.DeviceModeSystem = DeviceModeSystem;
  window.MobileControls = MobileControls;
})();
