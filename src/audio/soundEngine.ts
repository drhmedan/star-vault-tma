// ============================================================
// Star Vault — Web Audio synthesis engine. 100% procedural,
// zero external assets. Every combat sound is layered for punch:
// transient + body + tail, routed through a master compressor.
// ============================================================

type Surface = 'grass' | 'concrete' | 'metal' | 'dirt' | 'road';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private echoSend: GainNode | null = null;
  public muted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (!this.ctx) return null;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 24;
      this.comp.ratio.value = 7;
      this.comp.attack.value = 0.002;
      this.comp.release.value = 0.18;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
      // Simple feedback echo bus for gunshot tails.
      this.echoSend = this.ctx.createGain();
      this.echoSend.gain.value = 0.5;
      const delay = this.ctx.createDelay(1.0);
      delay.delayTime.value = 0.16;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.28;
      const damp = this.ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 1600;
      this.echoSend.connect(delay);
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      damp.connect(this.master);
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  // ---- low-level helpers ----
  private noise(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(
    ctx: AudioContext, type: OscillatorType, freq: number, endFreq: number,
    t0: number, dur: number, peak: number, dest?: AudioNode
  ) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest ?? this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private burst(
    ctx: AudioContext, t0: number, dur: number, peak: number,
    filterType: BiquadFilterType, f0: number, f1: number, dest?: AudioNode
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, dur + 0.02);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest ?? this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  private tick(ctx: AudioContext, t0: number, freq: number, dur: number, peak: number, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private echo(ctx: AudioContext, t0: number, peak: number) {
    if (!this.echoSend) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    src.connect(g);
    g.connect(this.echoSend);
    src.start(t0);
    src.stop(t0 + 0.08);
  }

  // ============================================================
  // UI / meta sounds
  // ============================================================
  public playTick() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', 1200 + Math.random() * 200, 300, t, 0.035, 0.07);
  }

  public playVaultOpen() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 95, 28, t, 0.28, 0.3);
    this.burst(ctx, t, 0.16, 0.1, 'bandpass', 2200, 900);
  }

  public playReveal(rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic') {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const high = rarity === 'legendary' || rarity === 'mythic';
    const chords = high ? [523.25, 659.25, 783.99, 1046.5] : rarity === 'epic' ? [440, 554.37, 659.25] : [392, 493.88];
    chords.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = high ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(high ? 0.11 : 0.08, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.6);
      osc.connect(g); g.connect(this.master!);
      osc.start(t + i * 0.07); osc.stop(t + 0.9);
    });
  }

  public playStarCoin() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.setValueAtTime(3300, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g); g.connect(this.master!);
    osc.start(t); osc.stop(t + 0.25);
  }

  public playClick() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    this.tone(ctx, 'sine', 800, 400, ctx.currentTime, 0.03, 0.05);
  }

  public playLaserShot() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    this.tone(ctx, 'sawtooth', 900, 110, ctx.currentTime, 0.12, 0.1);
  }

  public playShield() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    this.tone(ctx, 'sine', 580, 1200, ctx.currentTime, 0.2, 0.13);
  }

  public playLevelUp() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((f, i) => {
      this.tone(ctx, 'triangle', f, f, t + i * 0.06, 0.24, 0.1);
    });
  }

  public playEmp() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(450, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g); g.connect(this.master!);
    osc.start(t); osc.stop(t + 0.32);
  }

  // ============================================================
  // Weapon fire
  // ============================================================
  public playGunshot(weapon: string = 'ak47') {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const w = weapon.toLowerCase();

    if (w === 'rpg' || w === 'bazooka') {
      this.tone(ctx, 'sawtooth', 90, 360, t, 0.16, 0.3);
      this.tone(ctx, 'sawtooth', 360, 70, t + 0.16, 0.3, 0.16);
      this.burst(ctx, t, 0.4, 0.18, 'bandpass', 500, 220);
      return;
    }
    if (w === 'awm' || w === 'sniper') {
      this.tone(ctx, 'sawtooth', 340, 35, t, 0.4, 0.34);
      this.tone(ctx, 'sine', 90, 30, t, 0.5, 0.4);
      this.burst(ctx, t, 0.3, 0.26, 'lowpass', 2600, 220);
      this.echo(ctx, t, 0.16);
      return;
    }
    if (w === 'shotgun') {
      this.tone(ctx, 'square', 190, 30, t, 0.24, 0.26);
      this.tone(ctx, 'sine', 85, 28, t, 0.3, 0.34);
      this.burst(ctx, t, 0.22, 0.24, 'lowpass', 1900, 150);
      for (let i = 0; i < 3; i++) this.tick(ctx, t + 0.01 + i * 0.012, 1200 + Math.random() * 400, 0.02, 0.06, 'square');
      return;
    }
    if (w === 'mp5' || w === 'smg') {
      this.tone(ctx, 'triangle', 320 + Math.random() * 40, 55, t, 0.09, 0.2);
      this.burst(ctx, t, 0.06, 0.12, 'highpass', 900, 600);
      return;
    }
    if (w === 'pistol') {
      this.tone(ctx, 'triangle', 420, 70, t, 0.09, 0.2);
      this.burst(ctx, t, 0.05, 0.12, 'bandpass', 1600, 900);
      return;
    }
    if (w === 'autocannon' || w === 'turret') {
      this.tone(ctx, 'sawtooth', 170, 28, t, 0.14, 0.34);
      this.burst(ctx, t, 0.12, 0.2, 'lowpass', 1200, 200);
      return;
    }
    // AK-47 default — sharp crack + low thump + echo tail
    this.tone(ctx, 'triangle', 250 + Math.random() * 40, 45, t, 0.12, 0.24);
    this.tone(ctx, 'sine', 110, 40, t, 0.12, 0.2);
    this.burst(ctx, t, 0.08, 0.15, 'bandpass', 1500, 500);
    this.echo(ctx, t, 0.07);
  }

  // Distance-attenuated + stereo-panned enemy fire (spatial audio).
  public playSpatialShot(weapon: string, distance: number, pan: number) {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const vol = Math.max(0.04, Math.min(1, 1 - distance / 170));
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(400, 4000 - distance * 22);
    const g = ctx.createGain();
    g.gain.value = vol * 0.8;
    const panNode = ctx.createStereoPanner();
    panNode.pan.value = Math.max(-1, Math.min(1, pan));
    filter.connect(g);
    g.connect(panNode);
    panNode.connect(this.master!);

    const w = weapon.toLowerCase();
    if (w === 'awm' || w === 'sniper') {
      this.tone(ctx, 'sawtooth', 300, 40, t, 0.4, 0.3, filter);
      this.tone(ctx, 'sine', 80, 30, t, 0.5, 0.34, filter);
      this.burst(ctx, t, 0.3, 0.22, 'lowpass', 2200, 200, filter);
    } else {
      this.tone(ctx, 'triangle', 220 + Math.random() * 40, 45, t, 0.12, 0.2, filter);
      this.burst(ctx, t, 0.08, 0.13, 'bandpass', 1300, 500, filter);
    }
  }

  public playReload() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tick(ctx, t, 900, 0.04, 0.09);                       // mag release click
    this.tick(ctx, t + 0.22, 500, 0.05, 0.08);                // mag drop thud
    this.tick(ctx, t + 0.5, 1200, 0.04, 0.09);                // mag insert
    this.tick(ctx, t + 0.68, 1600, 0.03, 0.1);                // slide/bolt catch
    this.tone(ctx, 'square', 320, 180, t + 0.7, 0.05, 0.06);  // bolt release clack
  }

  public playPickup() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 520, 880, t, 0.07, 0.09);
    this.tone(ctx, 'sine', 880, 1300, t + 0.06, 0.06, 0.07);
  }

  public playHurt() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sawtooth', 160, 50, t, 0.1, 0.2);
    this.burst(ctx, t, 0.06, 0.14, 'bandpass', 700, 300);
  }

  // ============================================================
  // Explosions & grenades
  // ============================================================
  public playExplosion() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    // Initial crack
    this.burst(ctx, t, 0.12, 0.34, 'highpass', 1800, 800);
    // Bass boom
    this.tone(ctx, 'sawtooth', 150, 20, t, 0.6, 0.4);
    this.tone(ctx, 'sine', 60, 22, t, 0.7, 0.42);
    // Debris rattle tail
    this.burst(ctx, t + 0.05, 0.5, 0.16, 'bandpass', 2400, 500);
    // Distant echo
    this.echo(ctx, t, 0.2);
  }

  public playGrenadeBounce() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    this.tick(ctx, ctx.currentTime, 2100 + Math.random() * 300, 0.05, 0.07, 'square');
  }

  public playGrenadePin() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    this.tick(ctx, ctx.currentTime, 2600, 0.03, 0.08, 'square');
  }

  public playSmokePop() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    this.burst(ctx, ctx.currentTime, 0.35, 0.14, 'lowpass', 800, 200);
  }

  public playFlashbang() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(g); g.connect(this.master!);
    osc.start(t); osc.stop(t + 0.85);
  }

  // ============================================================
  // Impacts & movement
  // ============================================================
  public playImpact(surface: Surface | 'flesh') {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    if (surface === 'metal') {
      this.tick(ctx, t, 2400, 0.06, 0.09, 'square');
      this.tick(ctx, t, 1800, 0.08, 0.06, 'sine');
    } else if (surface === 'concrete' || surface === 'road') {
      this.burst(ctx, t, 0.05, 0.12, 'highpass', 1400, 800);
    } else if (surface === 'flesh') {
      this.tone(ctx, 'sine', 130, 60, t, 0.08, 0.18);
      this.burst(ctx, t, 0.04, 0.1, 'bandpass', 500, 250);
    } else {
      this.burst(ctx, t, 0.05, 0.1, 'lowpass', 700, 300);
    }
  }

  public playFootstep(surface: Surface, sprint: boolean) {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const peak = sprint ? 0.12 : 0.07;
    if (surface === 'metal') {
      this.tick(ctx, t, 900, 0.05, peak, 'square');
      this.tick(ctx, t + 0.01, 1300, 0.04, peak * 0.6, 'sine');
    } else if (surface === 'concrete' || surface === 'road') {
      this.tone(ctx, 'sine', 160, 70, t, 0.05, peak);
      this.burst(ctx, t, 0.03, peak * 0.7, 'highpass', 1200, 700);
    } else {
      this.burst(ctx, t, 0.05, peak, 'lowpass', 600, 250);
    }
  }

  public playJump() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 280, 540, t, 0.1, 0.06);
    this.burst(ctx, t, 0.06, 0.05, 'bandpass', 900, 500);
  }

  public playLand(surface: Surface, hard: boolean) {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const peak = hard ? 0.17 : 0.08;
    if (surface === 'metal') {
      this.tick(ctx, t, 300, 0.07, peak, 'square');
      this.tick(ctx, t + 0.012, 720, 0.06, peak * 0.6, 'sine');
    } else if (surface === 'concrete' || surface === 'road') {
      this.tone(ctx, 'sine', 140, 55, t, 0.07, peak);
      this.burst(ctx, t, 0.04, peak * 0.7, 'highpass', 1000, 500);
    } else {
      this.burst(ctx, t, 0.06, peak, 'lowpass', 500, 200);
    }
  }

  public playWhiz() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f0 = 1400 + Math.random() * 900;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    osc.connect(g); g.connect(pan); pan.connect(this.master!);
    osc.start(t); osc.stop(t + 0.16);
  }

  public playHeartbeat() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 70, 40, t, 0.12, 0.3);
    this.tone(ctx, 'sine', 55, 35, t + 0.16, 0.1, 0.2);
  }

  // ============================================================
  // Match flow
  // ============================================================
  public playKillConfirm() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tick(ctx, t, 1180, 0.05, 0.12, 'square');
    this.tick(ctx, t + 0.06, 1760, 0.09, 0.12, 'square');
  }

  public playHitmarker() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    this.tick(ctx, ctx.currentTime, 1250, 0.03, 0.07, 'square');
  }

  public playHeadshot() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    this.tick(ctx, t, 1560, 0.05, 0.12, 'square');
    this.tick(ctx, t + 0.05, 2090, 0.08, 0.12, 'square');
    this.tone(ctx, 'sine', 900, 500, t, 0.2, 0.08);
  }

  public playCountdown(step: 1 | 2 | 3 | 'go') {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    if (step === 'go') {
      this.tone(ctx, 'square', 880, 880, t, 0.22, 0.16);
      this.tone(ctx, 'square', 1320, 1320, t + 0.02, 0.28, 0.1);
    } else {
      const f = 520 + (3 - step) * 120;
      this.tone(ctx, 'square', f, f, t, 0.14, 0.13);
    }
  }

  public playVictory() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    const chords: [number, number][] = [[523.25, 659.25], [659.25, 783.99], [783.99, 1046.5]];
    chords.forEach(([a, b], i) => {
      this.tone(ctx, 'triangle', a, a, t + i * 0.13, 0.4, 0.11);
      this.tone(ctx, 'triangle', b, b, t + i * 0.13, 0.4, 0.09);
    });
    this.tone(ctx, 'triangle', 1318.5, 1318.5, t + 0.42, 0.7, 0.12);
  }

  public playDefeat() {
    if (this.muted) return;
    const ctx = this.getContext(); if (!ctx) return;
    const t = ctx.currentTime;
    [392, 349.23, 293.66].forEach((f, i) => {
      this.tone(ctx, 'sawtooth', f, f * 0.98, t + i * 0.22, 0.5, 0.1);
    });
  }
}

export const sound = new SoundEngine();
