// エンジン本体：固定ステップのループ、部屋の読み込みと破棄、扉を通る演出、調べる、HUD。
import * as THREE from "three";
import { Game, HZ, PASS, ENTER, BLACKOUT, type GameOpts, type RunMode } from "../core/game";
import { loadRecords, saveRecords, type Records } from "../core/records";
import { ITEM_NAME, spawnOf, type Floor, type RoomDef, type RoomGen } from "../core/types";
import { Extras } from "./extras";
import { View } from "./view";
import { Materials } from "./materials";
import { AudioEngine } from "./audio";
import { Input } from "./input";
import { Player } from "./player";
import { Kit, EYE, PASSAGE_L, type DoorObj, type Quality } from "./kit";
import { inBox } from "./collision";

const STEP = 1 / HZ;
const smooth = (a: number) => { const x = Math.min(1, Math.max(0, a)); return x * x * (3 - 2 * x); };
const span = (k: number, a: number, b: number) => smooth((k - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angLerp = (a: number, b: number, t: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export interface UI {
  crosshair: HTMLElement; roomTag: HTMLElement; failLine: HTMLElement; timer: HTMLElement; toast: HTMLElement;
  held: HTMLElement; hint: HTMLElement;
  onClear(ms: number): void; onOver(room: number): void; onPauseChange(paused: boolean): void;
}

export type QualitySetting = Quality | "auto";

export class App {
  readonly view: View;
  readonly mats: Materials;
  readonly audio = new AudioEngine();
  readonly input: Input;
  readonly player = new Player();
  readonly rec: Records = loadRecords();
  game: Game;
  kit: Kit | null = null;
  extras: Extras | null = null;
  paused = false;
  running = false;
  qualitySetting: QualitySetting = "auto";
  private acc = 0;
  private last = performance.now();
  private time = 0;               // 実時間（ちらつき等の演出用）
  private roomTime = 0;
  private fromPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private fromBlack = false;
  private entryCloseK = -1;
  private ray = new THREE.Raycaster();
  private hover: { id: string; dist: number } | null = null;
  private fps = { frames: 0, t: 0, low: 0 };
  private tagTimer = 0;
  private failTimer = 0;
  private passDoor: DoorObj | null = null;
  private showcaseOn = false;
  private toastTimer = 0;

  constructor(canvas: HTMLCanvasElement, private ui: UI, readonly gen: RoomGen, readonly opts: GameOpts, stick: HTMLElement, knob: HTMLElement) {
    this.view = new View(canvas);
    this.mats = new Materials(this.view.renderer);
    this.input = new Input(canvas, stick, knob);
    this.game = new Game(gen, opts, this.rec, saveRecords);
    this.player.onStep = run => this.footstep(run);
    this.applyQuality();
    this.raf = requestAnimationFrame(this.frame);
  }

  private raf = 0;
  private quietTimer = 0;

  /** 全部を片付ける（ホットリロード時に二重のループ・音・GPU資源を残さない） */
  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.quietTimer); clearTimeout(this.toastTimer);
    this.running = false;
    this.kit?.dispose(); this.kit = null; this.mats.disposeOwned();
    this.input.dispose();
    this.audio.dispose();
    this.view.dispose();
  }

  /* ---------------- 画質 ---------------- */
  autoQuality(): Quality { return this.input.touch ? "medium" : "high"; }
  setQualitySetting(q: QualitySetting) { this.qualitySetting = q; this.applyQuality(); }
  private applyQuality(q: Quality = this.qualitySetting === "auto" ? this.autoQuality() : this.qualitySetting) {
    const shadowsBefore = this.view.renderer.shadowMap.enabled;
    this.view.setQuality(q);
    if (shadowsBefore !== this.view.renderer.shadowMap.enabled)
      this.view.scene.traverse(o => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true)); });
  }

  /* ---------------- 進行 ---------------- */
  start(seed: number, run: RunMode = "normal") {
    this.audio.init();
    clearTimeout(this.quietTimer);
    this.audio.setRunning(true);
    this.audio.setAmbient(true);   // 環境音はゲームを始めてから
    this.running = true; this.paused = false;
    this.input.enabled = true; this.input.flush();
    this.showcaseOn = false;
    this.game = new Game(this.gen, this.opts, this.rec, saveRecords);
    this.game.start(seed, run);
    this.handleEvents();
  }

  stop() {
    this.running = false; this.input.enabled = false;
    this.paused = false;
    this.game = new Game(this.gen, this.opts, this.rec, saveRecords);
    this.kit?.dispose(); this.kit = null; this.extras = null; this.mats.disposeOwned();
    this.syncHeld();
    this.audio.setAmbient(false);
    this.audio.setRunning(false);
  }

  /** タイトル画面の背景：これから挑むシードの第1室を静かに映す */
  showcase(seed: number) {
    this.game.seed = seed;
    this.loadRoom(this.game.room = this.game.roomAt(0));
    this.extras!.setItems(this.game.room.items);
    this.kit!.entry.passage!.visible = false;
    this.kit!.silent = true;
    this.showcaseOn = true;
  }

  setPaused(p: boolean) {
    if (!this.running || this.paused === p) return;
    this.paused = p;
    // 止める時も再開する時も、溜まった入力（ドラッグ中の視点移動・離したクリック）を捨てる
    this.input.flush();
    if (!p) this.last = performance.now();
    this.audio.setRunning(!p);
    this.ui.onPauseChange(p);
  }

  private loadRoom(def: RoomDef) {
    this.kit?.dispose();
    this.mats.disposeOwned();
    const kit = new Kit(def, this.mats, this.audio, this.view.quality);
    kit.buildShell();
    def.build(kit, () => this.game.s);
    this.extras = new Extras(kit, def);
    this.view.scene.add(kit.group);
    kit.group.updateMatrixWorld(true);
    this.kit = kit;
    this.roomTime = 0;
    const s = def.shell;
    this.view.setRoomLook(s.fog, s.env ?? 0.25, s.exposure ?? 1);
    this.audio.setTone(s.tone); this.audio.setReverb(s.reverb ?? 0.9);
    kit.entry.passage!.visible = true;
    kit.entry.setOpen(0);
  }

  private handleEvents() {
    const g = this.game;
    for (const e of g.events.splice(0)) {
      switch (e.type) {
        case "enter":
          this.loadRoom(g.room);
          this.extras!.setItems(g.items);
          this.syncHeld(); this.ui.hint.classList.remove("on");
          this.passDoor = null;
          this.ui.roomTag.textContent = `第${e.room + 1}室　${g.room.name}`;
          this.tagTimer = 3.2;
          if (e.fail && g.failNote) {
            const f = g.failNote;
            this.ui.failLine.textContent = `✕ 第${f.room + 1}室「${f.name}」 ${f.reason}`;
            this.failTimer = 7;
            this.audio.play("fail");
          }
          break;
        case "door": {
          const d = this.kit!.doors[e.door];
          this.passDoor = d;
          d.passage!.visible = true;
          this.fromPose = { x: this.player.x, y: EYE, z: this.player.z, yaw: this.player.yaw, pitch: this.player.pitch };
          this.hover = null;
          break;
        }
        case "blackout": this.audio.play("pop"); this.fromBlack = true; break;
        case "items": this.extras?.setItems(g.items); break;
        case "held": this.syncHeld(); break;
        case "msg": this.toast(e.text); break;
        case "hint":
          this.ui.hint.textContent = `メモ：${e.text}`; this.ui.hint.classList.add("on");
          this.audio.play("tick");
          break;
        case "reveal": this.extras?.reveal(); this.audio.play("tick"); break;
        case "unlock": this.extras?.unlock(); this.audio.play("buzz"); break;
        case "control": {
          const [sx, sz] = spawnOf(g.room.shell);
          this.player.place(sx, sz, 0);
          this.entryCloseK = 0;
          this.kit!.entry.sound(false);
          this.fromBlack = false;
          break;
        }
        case "clear":
        case "over":
          this.running = false; this.input.enabled = false;
          this.audio.setAmbient(false);
          this.quietTimer = window.setTimeout(() => { if (!this.running) this.audio.setRunning(false); }, 2500);
          if (e.type === "clear") this.ui.onClear(e.ms);
          else { this.audio.play("fail"); this.ui.onOver(e.room); }
          break;
      }
    }
  }

  /* ---------------- ループ ---------------- */
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (!this.paused) {
      this.time += dt;
      if (this.running) {
        const inp = this.input.frame();
        if (this.game.mode === "room") this.player.look(inp.lookX, inp.lookY);
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < 8) {
          this.fixedStep(inp.mx, inp.mz, inp.run);
          this.acc -= STEP; steps++;
        }
        if (steps === 8) this.acc = 0;
        if (this.game.mode === "room") this.updateHover(inp.interact, inp.tap);
        if (inp.use && this.game.mode === "room") { this.game.useItem(); this.handleEvents(); }
        this.extras?.update(dt, this.view.camera);
      } else if (this.showcaseOn && this.kit) { this.roomTime += dt; this.kit.update(0, this.roomTime, dt); }
      this.updateCamera(this.acc / STEP);
      this.updateHud(dt);
      this.measure(dt);
    }
    this.audio.listen(this.view.camera);
    const dark = this.game.mode === "blackout" ? span(this.game.pass!.k, 0, BLACKOUT * 0.8) : 0;
    this.view.render(this.time, this.running || this.kit ? dark : 0, this.exposureMul());
  };

  private fixedStep(mx: number, mz: number, run: boolean) {
    const g = this.game, p = this.player;
    if (g.mode === "room" && this.kit) p.step(mx, mz, run, this.kit.colliders, STEP);
    g.step(p.x, p.z);
    this.handleEvents();
    if (!this.kit) return;
    this.roomTime += STEP;
    this.kit.update(g.mode === "room" ? g.t : 0, this.roomTime, STEP);
    // 扉の動き
    if (g.mode === "passing" && this.passDoor) {
      const k = g.pass!.k;
      if (k === PASS.openStart) this.passDoor.sound(true);
      if (k === PASS.closeStart) this.passDoor.sound(false);
      this.passDoor.setOpen(k < PASS.closeStart ? span(k, PASS.openStart, PASS.openEnd) : 1 - span(k, PASS.closeStart, PASS.closeEnd));
      if (k > PASS.approachEnd && k <= PASS.walkEnd) this.walkBob(true);
    } else if (g.mode === "entering") {
      const k = g.enterK;
      if (k === ENTER.openStart) this.kit.entry.sound(true);
      this.kit.entry.setOpen(span(k, ENTER.openStart, ENTER.openEnd));
      if (k > ENTER.walkStart && k <= ENTER.walkEnd) this.walkBob(true);
      else p.bob *= 0.9;
    }
    if (this.entryCloseK >= 0) {
      this.entryCloseK++;
      this.kit.entry.setOpen(1 - span(this.entryCloseK, 0, ENTER.closeEnd - ENTER.closeStart));
      if (this.entryCloseK > ENTER.closeEnd - ENTER.closeStart) { this.entryCloseK = -1; this.kit.entry.passage!.visible = false; }
    }
  }

  /** 演出で歩いている間の揺れと足音 */
  private walkBob(moving: boolean) {
    const p = this.player;
    p.bob += ((moving ? 1 : 0) - p.bob) * 0.15;
    p.advance(moving ? 1.3 * STEP : 0, false);
  }

  private footstep(run: boolean) {
    const cam = this.view.camera.position, g = this.game, kit = this.kit;
    if (!kit) return;
    let kind: Floor = kit.def.shell.footstep;
    if (g.mode === "passing" && g.pass!.k > 34) kind = "concrete";
    if (g.mode === "entering" && g.enterK < 30) kind = "concrete";
    if (g.mode === "room") for (const z of kit.footZones) if (inBox(this.player.x, this.player.z, z.box)) kind = z.kind;
    this.audio.footstep(kind, { x: cam.x, y: cam.y - 1.45, z: cam.z }, run);
  }

  /** 扉の向こうの小部屋の座標（E座標）からワールドの姿勢へ */
  private passagePose(door: DoorObj, zE: number) {
    const E = door.passage!;
    E.updateMatrixWorld(true);
    const pos = E.localToWorld(new THREE.Vector3(0, EYE, zE));
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(E.matrixWorld);
    return { x: pos.x, y: pos.y, z: pos.z, yaw: Math.atan2(-dir.x, -dir.z), pitch: 0 };
  }

  private updateCamera(alpha: number) {
    const cam = this.view.camera, g = this.game, p = this.player;
    let x: number, y: number, z: number, yaw: number, pitch: number;
    if (this.showcaseOn && this.kit && !this.running) {
      const [sx, sz] = spawnOf(this.kit.def.shell);
      cam.position.set(sx + Math.sin(this.time * 0.13) * 0.08, EYE + Math.sin(this.time * 0.4) * 0.01, sz + 0.2);
      cam.rotation.set(-0.02 + Math.sin(this.time * 0.17) * 0.015, Math.sin(this.time * 0.09) * 0.12, 0, "YXZ");
      return;
    }
    if (!this.kit || g.mode === "idle" || g.mode === "clear" || g.mode === "over") return;
    if (g.mode === "passing" && this.passDoor) {
      const k = g.pass!.k + alpha;
      const startZ = -PASSAGE_L - 0.75, endZ = -1.2;
      const zE = lerp(startZ, endZ, span(k, PASS.approachEnd, PASS.walkEnd));
      const target = this.passagePose(this.passDoor, zE), a = span(k, 0, PASS.approachEnd);
      const f = this.fromPose;
      x = lerp(f.x, target.x, a); y = lerp(f.y, target.y, a); z = lerp(f.z, target.z, a);
      yaw = angLerp(f.yaw, target.yaw, a); pitch = lerp(f.pitch, 0, a);
    } else if (g.mode === "entering") {
      const k = g.enterK + alpha;
      const zE = lerp(-1.2, 1.0, span(k, ENTER.walkStart, ENTER.walkEnd));
      ({ x, y, z, yaw, pitch } = this.passagePose(this.kit.entry, zE));
    } else {
      x = lerp(p.px, p.x, alpha); z = lerp(p.pz, p.z, alpha); y = EYE; yaw = p.yaw; pitch = p.pitch;
    }
    const s = p.sway();
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    cam.position.set(x + rx * s.x, y + s.y, z + rz * s.x);
    cam.rotation.set(pitch + s.pitch, yaw, s.roll, "YXZ");
  }

  private exposureMul() {
    const g = this.game;
    if (g.mode === "passing") return 1 - 0.45 * span(g.pass!.k, 36, PASS.swap);
    if (g.mode === "entering") return this.fromBlack ? 0.55 * span(g.enterK, 0, 20) + 0.45 * span(g.enterK, ENTER.openStart, 36) : 0.55 + 0.45 * span(g.enterK, ENTER.openStart, 36);
    if (g.mode === "blackout") return 1 - span(g.pass!.k, 0, BLACKOUT * 0.8);
    return 1;
  }

  /* ---------------- 調べる ---------------- */
  private updateHover(interact: boolean, tap: { x: number; y: number } | null) {
    if (!this.kit) return;
    const hit = this.pick(tap ? new THREE.Vector2(tap.x, tap.y) : new THREE.Vector2(0, 0));
    if (!tap) this.hover = hit;
    if ((interact || tap) && hit) {
      if (hit.id.startsWith("door:")) this.game.chooseDoor(Number(hit.id.slice(5)));
      else this.game.interact(hit.id);
      this.handleEvents();
    }
  }

  private pick(ndc: THREE.Vector2): { id: string; dist: number } | null {
    this.ray.setFromCamera(ndc, this.view.camera);
    this.ray.far = 2.3;
    const hits = this.ray.intersectObject(this.kit!.group, true);
    for (const h of hits) {
      if (!h.object.visible || (h.object as THREE.Mesh).material === undefined) continue;
      let o: THREE.Object3D | null = h.object;
      while (o) { const it = this.kit!.interactables.find(i => i.obj === o); if (it) return { id: it.id, dist: h.distance }; o = o.parent; }
      if ((h.object as any).isMesh) return null; // 手前に物がある
    }
    return null;
  }

  /* ---------------- HUD ---------------- */
  private syncHeld() {
    const h = this.running ? this.game.held : null;
    this.ui.held.classList.toggle("on", !!h);
    if (h) this.ui.held.innerHTML = `<b>${ITEM_NAME[h]}</b><span>${this.input.touch ? "使う をタップ" : "F で使う"}</span>`;
    document.body.classList.toggle("holding", !!h);
  }

  toast(text: string, sec = 2.6) {
    this.ui.toast.textContent = text;
    this.ui.toast.classList.add("on");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.ui.toast.classList.remove("on"), sec * 1000);
  }

  private updateHud(dt: number) {
    const g = this.game;
    this.ui.crosshair.classList.toggle("hot", !!this.hover && g.mode === "room");
    this.ui.crosshair.classList.toggle("hide", g.mode !== "room" || !this.running);
    this.tagTimer -= dt; this.failTimer -= dt;
    this.ui.roomTag.style.opacity = String(Math.max(0, Math.min(1, this.tagTimer)) * (this.running ? 1 : 0));
    this.ui.failLine.style.opacity = String(Math.max(0, Math.min(1, this.failTimer)) * (this.running ? 1 : 0));
    const room = g.mode === "room" ? Math.max(0, 1 - g.t / g.room.limit) : g.mode === "entering" ? 1 : 0;
    this.ui.timer.style.transform = `scaleX(${room})`;
    this.ui.timer.classList.toggle("low", room < 0.25);
  }

  /** 重い時は自動で画質を下げる */
  private measure(dt: number) {
    if (this.qualitySetting !== "auto" || this.game.mode !== "room") return;
    this.fps.frames++; this.fps.t += dt;
    if (this.fps.t < 2) return;
    const fps = this.fps.frames / this.fps.t; this.fps.frames = 0; this.fps.t = 0;
    this.fps.low = fps < 45 ? this.fps.low + 1 : 0;
    if (this.fps.low >= 2 && this.view.quality !== "low") {
      const next: Quality = this.view.quality === "high" ? "medium" : "low";
      this.applyQuality(next); this.fps.low = 0;
      this.toast(`動作が重いため 画質を「${next === "medium" ? "中" : "低"}」に下げました`);
    }
  }
}
