// 音：Web Audio API で全部生成する。位置のある音は HRTF の PannerNode で立体化。
import * as THREE from "three";
import type { Floor } from "../core/types";

type V3 = { x: number; y: number; z: number };

export interface Loop { stop(): void; gain(v: number): void; }

/** 部屋の空気の音。gain は旧版の半分 */
const TONES: Record<string, { drone: number; noise: number; cutoff: number; gain: number }> = {
  hotel:    { drone: 50, noise: 0.03,  cutoff: 260, gain: 0.25 },
  office:   { drone: 60, noise: 0.05,  cutoff: 700, gain: 0.22 },
  hospital: { drone: 50, noise: 0.035, cutoff: 520, gain: 0.2 },
  washitsu: { drone: 40, noise: 0.025, cutoff: 420, gain: 0.16 },
  basement: { drone: 33, noise: 0.045, cutoff: 180, gain: 0.32 },
};

export interface Volumes { amb: number; sfx: number }
const VOL_KEY = "tobira3d:volume";
const CTX_KEY = "__tobira3dAudioCtx";

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambBus!: GainNode;      // 環境音（部屋の空気・蛍光灯のうなり等）
  private sfxBus!: GainNode;      // 効果音（足音・扉・ベル・チャイム等）
  private sfxDry!: GainNode;
  private verb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private tone: { o1: OscillatorNode; o2: OscillatorNode; o1g: GainNode; o2g: GainNode; ng: GainNode; lp: BiquadFilterNode; g: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;
  private tonePreset = TONES.hotel;
  private driftTimer = 0;
  private driftN = 0;
  muted: boolean;
  volumes: Volumes = { amb: 1, sfx: 1 };   // 1 = 標準（環境音の標準は旧版の半分の大きさ）
  /** 環境音を鳴らしてよいか（ゲーム中だけ true） */
  private ambActive = false;
  /** ゲーム中で一時停止していないか（タブ復帰時に再開してよいか） */
  wantRunning = false;
  private stepN = 0;
  private onVis = () => this.syncVisibility();

  constructor() {
    let m = false; try { m = localStorage.getItem("tobira3d:mute") === "1"; } catch { /* */ }
    this.muted = m;
    try { Object.assign(this.volumes, JSON.parse(localStorage.getItem(VOL_KEY) || "{}")); } catch { /* */ }
    document.addEventListener("visibilitychange", this.onVis);
  }

  init() {
    if (this.ctx) { this.syncVisibility(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    // ホットリロード等で前の AudioContext が残っていたら閉じる（二重に鳴らさない）
    const prev = (globalThis as any)[CTX_KEY] as AudioContext | undefined;
    if (prev && prev.state !== "closed") void prev.close();
    const x = (this.ctx = new AC());
    (globalThis as any)[CTX_KEY] = x;
    this.master = x.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(x.destination);
    const comp = x.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
    this.ambBus = x.createGain(); this.ambBus.gain.value = 0; this.ambBus.connect(comp);
    this.sfxBus = x.createGain(); this.sfxBus.gain.value = this.volumes.sfx; this.sfxBus.connect(comp);
    this.sfxDry = x.createGain(); this.sfxDry.connect(this.sfxBus);
    this.verb = x.createConvolver(); const wet = x.createGain(); wet.gain.value = 0.32;
    this.verb.connect(wet); wet.connect(this.sfxBus);
    const len = x.sampleRate * 2, buf = x.createBuffer(1, len, x.sampleRate), d = buf.getChannelData(0);
    let seed = 99; for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) >>> 0; d[i] = seed / 2147483648 - 1; }
    this.noiseBuf = buf;
    this.setReverb(0.8);
    this.syncVisibility();
  }

  /** 全部を止めて捨てる（ホットリロード・ページ破棄用） */
  dispose() {
    document.removeEventListener("visibilitychange", this.onVis);
    clearInterval(this.driftTimer); this.driftTimer = 0;
    this.tone?.nodes.forEach(n => { try { n.stop(); } catch { /* */ } });
    this.tone = null;
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
    if ((globalThis as any)[CTX_KEY] === this.ctx) delete (globalThis as any)[CTX_KEY];
    this.ctx = null;
  }

  /** タブが隠れたら止める。戻ったらゲーム中のときだけ再開 */
  private syncVisibility() {
    if (!this.ctx || this.ctx.state === "closed") return;
    if (document.hidden || !this.wantRunning) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** ゲーム中かどうか（タイトル・一時停止・タブ非表示では鳴らさない） */
  setRunning(on: boolean) { this.wantRunning = on; this.syncVisibility(); }

  /** 環境音を鳴らす／止める（ゆっくりフェード） */
  setAmbient(on: boolean) {
    this.ambActive = on;
    if (!this.ctx) return;
    if (on) this.ensureTone();
    this.ambBus.gain.setTargetAtTime(on ? this.volumes.amb : 0, this.ctx.currentTime, on ? 1.2 : 0.15);
  }

  setVolumes(v: Partial<Volumes>) {
    Object.assign(this.volumes, v);
    try { localStorage.setItem(VOL_KEY, JSON.stringify(this.volumes)); } catch { /* */ }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambBus.gain.setTargetAtTime(this.ambActive ? this.volumes.amb : 0, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem("tobira3d:mute", m ? "1" : "0"); } catch { /* */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  /** 部屋の広さに合わせた残響（ノイズを減衰させたインパルス応答） */
  setReverb(seconds: number) {
    if (!this.ctx) return;
    const x = this.ctx, len = Math.floor(x.sampleRate * seconds), ir = x.createBuffer(2, len, x.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let seed = 3 + ch * 17;
      for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) >>> 0; d[i] = (seed / 2147483648 - 1) * Math.pow(1 - i / len, 3.2); }
    }
    this.verb.buffer = ir;
  }

  /** 部屋の空気の音の種類を切り替える */
  setTone(name: string) {
    this.tonePreset = TONES[name] ?? TONES.hotel;
    if (this.ctx && this.tone) this.drift(true);
  }

  /**
   * 環境音：低い唸り2本（わずかにずらしてうねらせる）＋風のようなノイズ。
   * 数秒ごとに、音量・こもり具合・音程の目標値を少しずつ動かし、単調な持続音にしない。
   */
  private ensureTone() {
    if (this.tone || !this.ctx) return;
    const x = this.ctx;
    const g = x.createGain(); g.gain.value = 0; g.connect(this.ambBus);
    const o1 = x.createOscillator(); o1.type = "sine"; const o1g = x.createGain(); o1g.gain.value = 0.025; o1.connect(o1g); o1g.connect(g);
    const o2 = x.createOscillator(); o2.type = "triangle"; const o2g = x.createGain(); o2g.gain.value = 0.008;
    const o2f = x.createBiquadFilter(); o2f.type = "lowpass"; o2f.frequency.value = 300; o2.connect(o2f); o2f.connect(o2g); o2g.connect(g);
    const n = x.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const lp = x.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.9; const ng = x.createGain(); ng.gain.value = 0;
    n.connect(lp); lp.connect(ng); ng.connect(g);
    // ごくゆっくりした揺れ（20〜40秒周期）を重ねる
    const lfo = (freq: number, depth: number, target: AudioParam) => { const o = x.createOscillator(); o.frequency.value = freq; const d = x.createGain(); d.gain.value = depth; o.connect(d); d.connect(target); o.start(); return o; };
    const l1 = lfo(0.031, 0.08, g.gain);           // 全体の息づかい（±30%ほど）
    const l2 = lfo(0.047, 120, lp.frequency);       // 風のこもり具合
    const l3 = lfo(0.023, 0.6, o2.detune);          // 2本目の音程のずれ → うねり
    o1.start(); o2.start(); n.start();
    this.tone = { o1, o2, o1g, o2g, ng, lp, g, nodes: [o1, o2, n, l1, l2, l3] };
    this.drift(true);
    clearInterval(this.driftTimer);
    this.driftTimer = window.setInterval(() => this.drift(false), 3500);
  }

  /** 次の目標値へゆっくり動かす（決まった数列なので毎回同じ動き方） */
  private drift(immediate: boolean) {
    if (!this.ctx || !this.tone) return;
    const p = this.tonePreset, t = this.tone, now = this.ctx.currentTime, n = this.driftN++;
    const r = (k: number) => { const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    const tc = immediate ? 0.8 : 3.0;              // 時定数（秒）：ゆっくり
    const swell = r(1) < 0.18 ? 1.6 : 0.6 + r(2) * 0.6; // ときどき少し膨らむ
    t.o1.frequency.setTargetAtTime(p.drone * (0.98 + r(3) * 0.04), now, tc);
    t.o2.frequency.setTargetAtTime(p.drone * 1.5 * (0.99 + r(4) * 0.02), now, tc);
    t.o1g.gain.setTargetAtTime(0.05 * swell, now, tc);
    t.o2g.gain.setTargetAtTime(0.006 * (0.4 + r(5)), now, tc);
    t.ng.gain.setTargetAtTime(p.noise * (0.5 + r(6) * 0.8), now, tc);
    t.lp.frequency.setTargetAtTime(p.cutoff * (0.6 + r(7) * 0.9), now, tc);
    t.g.gain.setTargetAtTime(p.gain * (0.85 + r(8) * 0.3), now, tc * 1.5);
  }

  /** 耳の位置と向き（カメラ） */
  listen(cam: THREE.Camera) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const L = this.ctx.listener, p = cam.getWorldPosition(_v), t = this.ctx.currentTime;
    const f = _f.set(0, 0, -1).applyQuaternion(cam.quaternion), u = _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.setTargetAtTime(u.x, t, 0.02); L.upY.setTargetAtTime(u.y, t, 0.02); L.upZ.setTargetAtTime(u.z, t, 0.02);
    } else { (L as any).setPosition(p.x, p.y, p.z); (L as any).setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
  }

  /** 出力先：位置があれば立体化。効果音は残響にも送る。環境音は環境音バスへ */
  private out(pos: V3 | null, send = 0.6, bus: "sfx" | "amb" = "sfx"): AudioNode {
    const x = this.ctx!;
    const g = x.createGain();
    const dest = bus === "amb" ? this.ambBus : this.sfxDry;
    let src: AudioNode = g;
    if (pos) {
      const p = x.createPanner(); p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = 1; p.rolloffFactor = 1.3; p.maxDistance = 40;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p); src = p;
    }
    src.connect(dest);
    if (bus === "sfx" && send > 0) { const s = x.createGain(); s.gain.value = pos ? send : send * 0.5; src.connect(s); s.connect(this.verb); }
    return g;
  }

  private osc(dest: AudioNode, freq: number, dur: number, o: { type?: OscillatorType; to?: number; gain?: number; attack?: number; when?: number } = {}) {
    const x = this.ctx!, t = x.currentTime + (o.when ?? 0), osc = x.createOscillator(), g = x.createGain();
    osc.type = o.type ?? "sine"; osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + dur + 0.05);
  }

  private noise(dest: AudioNode, dur: number, o: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; attack?: number; when?: number; offset?: number } = {}) {
    const x = this.ctx!, t = x.currentTime + (o.when ?? 0), s = x.createBufferSource(); s.buffer = this.noiseBuf;
    const f = x.createBiquadFilter(); f.type = o.type ?? "bandpass"; f.frequency.setValueAtTime(o.freq ?? 1000, t); f.Q.value = o.q ?? 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = x.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, o.offset ?? 0); s.stop(t + dur + 0.05);
  }

  /** 足音（床の素材で変わる）。足元の少し下・左右交互に鳴らす */
  footstep(kind: Floor, pos: V3, run: boolean) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const n = this.stepN++, v = 0.85 + ((n * 7919) % 13) / 60, o = this.out({ x: pos.x, y: pos.y, z: pos.z }, 0.35);
    const k = run ? 1.35 : 1, off = (n * 0.37) % 1.5;
    switch (kind) {
      case "carpet": this.noise(o, 0.12, { type: "lowpass", freq: 520 * v, gain: 0.32 * k, attack: 0.012, offset: off }); this.osc(o, 70 * v, 0.08, { gain: 0.12 * k }); break;
      case "tile": this.noise(o, 0.06, { freq: 3200 * v, q: 1.2, gain: 0.25 * k, offset: off }); this.osc(o, 190 * v, 0.06, { type: "triangle", gain: 0.12 * k }); this.noise(o, 0.1, { type: "lowpass", freq: 700, gain: 0.12 * k, offset: off }); break;
      case "linoleum": this.noise(o, 0.07, { freq: 1900 * v, q: 0.9, gain: 0.22 * k, offset: off }); this.osc(o, 120 * v, 0.07, { gain: 0.14 * k }); if (n % 3 === 0) this.osc(o, 2400, 0.04, { gain: 0.03, when: 0.03 }); break;
      case "tatami": this.noise(o, 0.16, { freq: 1500 * v, q: 0.5, gain: 0.13 * k, attack: 0.03, offset: off }); this.noise(o, 0.09, { type: "lowpass", freq: 300, gain: 0.12 * k, offset: off }); break;
      case "concrete": this.noise(o, 0.09, { freq: 2400 * v, q: 0.7, gain: 0.26 * k, offset: off }); this.noise(o, 0.05, { type: "highpass", freq: 5000, gain: 0.08 * k, when: 0.01, offset: off }); this.osc(o, 85 * v, 0.1, { gain: 0.18 * k }); break;
      case "wood": this.osc(o, 160 * v, 0.12, { type: "triangle", gain: 0.2 * k }); this.noise(o, 0.07, { freq: 1100 * v, q: 2, gain: 0.16 * k, offset: off }); if (n % 4 === 1) this.osc(o, 420, 0.25, { type: "sawtooth", to: 380, gain: 0.015, when: 0.05 }); break;
    }
  }

  /** 一度だけ鳴る音 */
  play(name: string, pos: V3 | null = null) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const o = this.out(pos);
    switch (name) {
      // 扉の音：どの扉でも完全に同じ
      case "door-open":
        this.osc(o, 1800, 0.03, { type: "square", gain: 0.06 });                                     // ノブ
        this.noise(o, 0.05, { freq: 2600, q: 3, gain: 0.12, when: 0.02 });                           // ラッチ
        this.noise(o, 0.7, { freq: 700, to: 1100, q: 14, gain: 0.07, attack: 0.15, when: 0.12, offset: 0.4 }); // 軋み
        this.osc(o, 62, 0.75, { type: "sawtooth", to: 88, gain: 0.025, attack: 0.2, when: 0.12 });
        this.noise(o, 0.8, { type: "lowpass", freq: 300, to: 900, gain: 0.08, attack: 0.3, when: 0.2 }); // 空気が動く
        break;
      case "door-close":
        this.noise(o, 0.25, { freq: 500, q: 8, gain: 0.05, attack: 0.08 });
        this.osc(o, 90, 0.5, { to: 38, gain: 0.6, when: 0.18 });
        this.noise(o, 0.2, { type: "lowpass", freq: 240, gain: 0.45, when: 0.18 });
        this.noise(o, 0.04, { freq: 3000, q: 2, gain: 0.1, when: 0.2 });
        break;
      case "slide-open": this.noise(o, 0.55, { freq: 900, q: 0.8, gain: 0.12, attack: 0.08 }); this.osc(o, 1400, 0.04, { gain: 0.03, when: 0.5 }); break;
      case "slide-close": this.noise(o, 0.4, { freq: 800, q: 0.8, gain: 0.1, attack: 0.05 }); this.osc(o, 140, 0.18, { type: "triangle", gain: 0.25, when: 0.36 }); break;
      case "ring":    // 電話のベル（2回）
        for (const w of [0, 0.42]) { this.osc(o, 1250, 0.34, { type: "square", gain: 0.035, when: w }); this.osc(o, 1310, 0.34, { type: "square", gain: 0.03, when: w }); }
        break;
      case "chime":   // 病院の呼び出し音
        this.osc(o, 659, 1.3, { gain: 0.22, attack: 0.01 }); this.osc(o, 1318, 0.6, { gain: 0.04 });
        this.osc(o, 523, 1.6, { gain: 0.22, attack: 0.01, when: 0.55 }); this.osc(o, 1046, 0.6, { gain: 0.04, when: 0.55 });
        break;
      case "buzz": this.osc(o, 120, 0.12, { type: "sawtooth", gain: 0.05 }); this.noise(o, 0.08, { freq: 4000, q: 1, gain: 0.05 }); break;
      case "pop": this.noise(o, 0.08, { type: "highpass", freq: 3000, gain: 0.3 }); this.osc(o, 300, 0.25, { to: 60, gain: 0.15 }); break;
      case "flicker-on": for (let i = 0; i < 4; i++) { this.noise(o, 0.05, { freq: 3500, q: 1, gain: 0.08, when: i * 0.09 }); this.osc(o, 120, 0.06, { type: "sawtooth", gain: 0.05, when: i * 0.09 }); } break;
      case "drag": this.noise(o, 1.1, { freq: 380, to: 260, q: 4, gain: 0.22, attack: 0.15 }); this.noise(o, 0.9, { freq: 1600, q: 2, gain: 0.05, attack: 0.2, when: 0.1 }); break;
      case "drip": this.osc(o, 1600, 0.12, { to: 900, gain: 0.08 }); break;
      case "tick": this.noise(o, 0.025, { type: "highpass", freq: 3500, gain: 0.12 }); break;
      case "cricket": for (let i = 0; i < 3; i++) this.osc(o, 4300, 0.05, { gain: 0.025, when: i * 0.07 }); break;
      case "fail": [98, 104, 139].forEach(f => this.osc(o, f, 1.6, { type: "triangle", gain: 0.1, attack: 0.02 })); break;
    }
  }

  /** 鳴り続ける音（蛍光灯のうなりなど） */
  loop(name: string, pos: V3): Loop {
    if (!this.ctx || this.ctx.state === "closed") return { stop() {}, gain() {} };
    const x = this.ctx, g = x.createGain(); g.gain.value = 0; g.connect(this.out(pos, 0, "amb"));
    const nodes: AudioScheduledSourceNode[] = [];
    if (name === "hum") {
      const o = x.createOscillator(); o.type = "sawtooth"; o.frequency.value = 120;
      const f = x.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 240; f.Q.value = 3;
      const og = x.createGain(); og.gain.value = 0.025; o.connect(f); f.connect(og); og.connect(g); nodes.push(o);
      // うなりの強さもゆっくり揺らす
      const l = x.createOscillator(); l.frequency.value = 0.07 + (Math.abs(pos.x * 7 + pos.z * 3) % 1) * 0.05; const ld = x.createGain(); ld.gain.value = 0.01; l.connect(ld); ld.connect(og.gain); nodes.push(l);
    } else if (name === "fridge") {
      const o = x.createOscillator(); o.type = "triangle"; o.frequency.value = 55; const og = x.createGain(); og.gain.value = 0.04; o.connect(og); og.connect(g); nodes.push(o);
    } else if (name === "screen") {
      const o = x.createOscillator(); o.type = "sine"; o.frequency.value = 15600; const og = x.createGain(); og.gain.value = 0.002; o.connect(og); og.connect(g); nodes.push(o);
    }
    nodes.forEach(n => n.start());
    g.gain.setTargetAtTime(1, x.currentTime, 0.3);
    return {
      stop: () => { if (x.state === "closed") return; g.gain.setTargetAtTime(0, x.currentTime, 0.05); nodes.forEach(n => { try { n.stop(x.currentTime + 0.3); } catch { /* */ } }); },
      gain: (v: number) => g.gain.setTargetAtTime(v, x.currentTime, 0.03),
    };
  }
}

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();
