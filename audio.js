(function () {
  'use strict';

  class AudioSystem {
    constructor() {
      this.context = null;
      this.masterGain = null;
      this.weaponGain = null;
      this.effectsGain = null;
      this.ambientGain = null;
      this.ambientNodes = [];
      this.ambientStarted = false;
      this.stepTimer = 0;
      this.volumes = {
        master: 0.78,
        weapons: 0.82,
        effects: 0.72,
        ambient: 0.42
      };
      this.bindControls();
    }

    bindControls() {
      for (const key of Object.keys(this.volumes)) {
        const input = document.getElementById('volume-' + key);
        const value = document.getElementById('volume-' + key + '-value');
        if (!input) continue;

        input.value = String(Math.round(this.volumes[key] * 100));
        if (value) value.textContent = input.value + '%';

        input.addEventListener('input', () => {
          this.volumes[key] = Number(input.value) / 100;
          if (value) value.textContent = input.value + '%';
          this.applyVolumes();
        });
      }
    }

    ensureContext() {
      if (this.context) return;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.weaponGain = this.context.createGain();
      this.effectsGain = this.context.createGain();
      this.ambientGain = this.context.createGain();

      this.weaponGain.connect(this.masterGain);
      this.effectsGain.connect(this.masterGain);
      this.ambientGain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.applyVolumes();
    }

    resume() {
      this.ensureContext();
      if (!this.context) return;
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
      this.startAtmosphere();
    }

    applyVolumes() {
      if (!this.context) return;

      const now = this.context.currentTime;
      this.masterGain.gain.setTargetAtTime(this.volumes.master, now, 0.025);
      this.weaponGain.gain.setTargetAtTime(this.volumes.weapons, now, 0.025);
      this.effectsGain.gain.setTargetAtTime(this.volumes.effects, now, 0.025);
      this.ambientGain.gain.setTargetAtTime(this.volumes.ambient, now, 0.08);
    }

    update(dt, player) {
      if (!this.context || !player) return;

      if (player.isMoving) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.playFootstep();
          this.stepTimer = 0.38;
        }
      } else {
        this.stepTimer = Math.min(this.stepTimer, 0.08);
      }
    }

    startAtmosphere() {
      if (!this.context || this.ambientStarted) return;

      const wind = this.createNoiseSource(2.8);
      const windFilter = this.context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 220;
      windFilter.Q.value = 0.55;
      const windGain = this.context.createGain();
      windGain.gain.value = 0.09;
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.ambientGain);
      wind.start();

      const hum = this.context.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 54;
      const humGain = this.context.createGain();
      humGain.gain.value = 0.035;
      hum.connect(humGain);
      humGain.connect(this.ambientGain);
      hum.start();

      const distant = this.context.createOscillator();
      distant.type = 'triangle';
      distant.frequency.value = 91;
      const distantGain = this.context.createGain();
      distantGain.gain.value = 0.018;
      distant.connect(distantGain);
      distantGain.connect(this.ambientGain);
      distant.start();

      this.ambientNodes.push(wind, hum, distant);
      this.ambientStarted = true;
    }

    playFootstep() {
      if (!this.context) return;
      const now = this.context.currentTime;
      this.playNoiseBurst(this.effectsGain, now, 0.045, 0.12, 125, 0.85);
      this.playTone(this.effectsGain, now, 72 + Math.random() * 18, 0.055, 0.045, 'sine');
    }

    playWeaponShot(type) {
      if (!this.context) return;
      const now = this.context.currentTime;

      if (type === 'rifle') {
        this.playNoiseBurst(this.weaponGain, now, 0.18, 0.115, 1900, 3.8);
        this.playTone(this.weaponGain, now, 115, 0.09, 0.12, 'square');
        this.playTone(this.weaponGain, now + 0.018, 72, 0.12, 0.06, 'sine');
      } else {
        this.playNoiseBurst(this.weaponGain, now, 0.16, 0.16, 1050, 2.6);
        this.playTone(this.weaponGain, now, 150, 0.13, 0.16, 'square');
        this.playTone(this.weaponGain, now + 0.03, 84, 0.17, 0.055, 'sine');
      }
    }

    playNpcShot() {
      if (!this.context) return;
      const now = this.context.currentTime;
      this.playNoiseBurst(this.weaponGain, now, 0.075, 0.105, 1450, 2.4);
      this.playTone(this.weaponGain, now, 105, 0.08, 0.045, 'square');
    }

    playReload(type) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const spacing = type === 'rifle' ? 0.16 : 0.13;

      this.playTone(this.effectsGain, now, 330, 0.045, 0.07, 'triangle');
      this.playNoiseBurst(this.effectsGain, now + spacing, 0.05, 0.07, 650, 1.8);
      this.playTone(this.effectsGain, now + spacing * 2, 220, 0.06, 0.085, 'triangle');
      this.playNoiseBurst(this.effectsGain, now + spacing * 3, 0.04, 0.065, 900, 2.2);
    }

    playImpact(material) {
      if (!this.context) return;
      const now = this.context.currentTime;

      if (material === 'metal') {
        this.playNoiseBurst(this.effectsGain, now, 0.08, 0.08, 3200, 7.5);
        this.playTone(this.effectsGain, now, 980 + Math.random() * 260, 0.075, 0.05, 'triangle');
        return;
      }

      if (material === 'dirt') {
        this.playNoiseBurst(this.effectsGain, now, 0.07, 0.15, 520, 1.2);
        this.playTone(this.effectsGain, now, 120 + Math.random() * 60, 0.055, 0.03, 'sine');
        return;
      }

      if (material === 'concrete') {
        this.playNoiseBurst(this.effectsGain, now, 0.095, 0.13, 1450, 3.5);
        this.playTone(this.effectsGain, now, 180 + Math.random() * 90, 0.065, 0.04, 'triangle');
        return;
      }

      this.playNoiseBurst(this.effectsGain, now, 0.085, 0.105, 1850, 5.2);
      this.playTone(this.effectsGain, now, 260 + Math.random() * 140, 0.05, 0.045, 'triangle');
    }

    playBodyHit(part) {
      if (!this.context) return;
      const now = this.context.currentTime;

      if (part === 'head') {
        this.playNoiseBurst(this.effectsGain, now, 0.082, 0.105, 720, 2.2);
        this.playTone(this.effectsGain, now, 190, 0.09, 0.078, 'triangle');
        this.playTone(this.effectsGain, now + 0.026, 410, 0.05, 0.035, 'sine');
        return;
      }

      if (part === 'leftArm' || part === 'rightArm') {
        this.playNoiseBurst(this.effectsGain, now, 0.055, 0.105, 520, 1.55);
        this.playTone(this.effectsGain, now, 112, 0.1, 0.052, 'sine');
        return;
      }

      if (part === 'leftLeg' || part === 'rightLeg') {
        this.playNoiseBurst(this.effectsGain, now, 0.064, 0.16, 330, 1.05);
        this.playTone(this.effectsGain, now, 76, 0.15, 0.064, 'sine');
        return;
      }

      this.playNoiseBurst(this.effectsGain, now, 0.07, 0.14, 420, 1.3);
      this.playTone(this.effectsGain, now, 92, 0.12, 0.07, 'sine');
    }

    playNpcDeath() {
      if (!this.context) return;
      const now = this.context.currentTime;
      this.playNoiseBurst(this.effectsGain, now, 0.1, 0.32, 300, 0.75);
      this.playToneSweep(this.effectsGain, now, 140, 48, 0.5, 0.12, 'sawtooth');
    }

    playPlayerHit() {
      if (!this.context) return;
      const now = this.context.currentTime;
      this.playNoiseBurst(this.effectsGain, now, 0.09, 0.16, 260, 0.9);
      this.playTone(this.effectsGain, now, 70, 0.16, 0.08, 'sine');
    }

    playPickup(type) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const base = type === 'health' ? 520 : type === 'armor' ? 390 : 680;
      this.playTone(this.effectsGain, now, base, 0.08, 0.055, 'triangle');
      this.playTone(this.effectsGain, now + 0.055, base * 1.42, 0.1, 0.04, 'sine');
      this.playNoiseBurst(this.effectsGain, now + 0.02, 0.025, 0.08, 1400, 2.4);
    }

    playThunder() {
      if (!this.context) return;
      const now = this.context.currentTime;
      this.playNoiseBurst(this.ambientGain, now + 0.18 + Math.random() * 0.35, 0.22, 0.9, 82, 0.5);
      this.playNoiseBurst(this.ambientGain, now + 0.42 + Math.random() * 0.35, 0.14, 1.25, 140, 0.65);
      this.playToneSweep(this.ambientGain, now + 0.2, 72, 32, 1.4, 0.08, 'sine');
    }

    playTone(destination, start, frequency, duration, volume, type) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    playToneSweep(destination, start, from, to, duration, volume, type) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    playNoiseBurst(destination, start, volume, duration, frequency, q) {
      const source = this.createNoiseSource(duration);
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(frequency, start);
      filter.Q.value = q;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      source.start(start);
      source.stop(start + duration + 0.02);
    }

    createNoiseSource(duration) {
      const sampleRate = this.context.sampleRate;
      const buffer = this.context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = this.context.createBufferSource();
      source.buffer = buffer;
      if (duration > 1) source.loop = true;
      return source;
    }
  }

  window.AudioSystem = AudioSystem;
})();
