// 部屋を組み立てる道具箱。部屋データの build() はこれだけを使って家具や照明を置く。
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DoorSpec, DoorStyle, Floor, RoomDef, ShellSpec } from "../core/types";
import { Materials, metricBox, type SignOpts } from "./materials";
import type { AudioEngine, Loop } from "./audio";
import type { Box } from "./collision";

export type Quality = "high" | "medium" | "low";
export const DOOR_W = 0.92, DOOR_H = 2.08, HOLE_W = 1.0, HOLE_H = 2.14;
export const PASSAGE_L = 2.2, PASSAGE_W = 1.34, PASSAGE_H = 2.4;
export const EYE = 1.62;

export interface DoorObj {
  index: number;               // 出口の番号（入口は -1）
  frame: THREE.Group;          // 開口部の中心・床の高さ。ローカル +z が部屋の内側
  leaf: THREE.Object3D;
  slide: boolean;
  passage: THREE.Group | null; // 扉の向こうの小部屋（通る時だけ表示）
  setOpen(a: number): void;
  sound(open: boolean): void;
}

type Vec = [number, number, number];
interface PlaceOpts { rotY?: number; collide?: boolean | number; cast?: boolean; receive?: boolean; parent?: THREE.Object3D }

export class Kit {
  readonly group = new THREE.Group();
  readonly colliders: Box[] = [];
  readonly interactables: { obj: THREE.Object3D; id: string }[] = [];
  readonly doors: DoorObj[] = [];
  entry!: DoorObj;
  readonly loops: Loop[] = [];
  readonly footZones: { box: Box; kind: Floor }[] = [];
  private updaters: ((t: number, time: number, dt: number) => void)[] = [];
  private shellSpec: ShellSpec;
  /** true の間は音を出さない（タイトル画面の背景用） */
  silent = false;

  constructor(readonly def: RoomDef, readonly mats: Materials, readonly audio: AudioEngine, readonly quality: Quality) {
    this.shellSpec = def.shell;
  }

  get W() { return this.shellSpec.w; }
  get D() { return this.shellSpec.d; }
  get H() { return this.shellSpec.h; }

  /* ---------------- 基本の置き方 ---------------- */
  add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.group): T { parent.add(o); return o; }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], pos: Vec, o: PlaceOpts = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); if (o.rotY) m.rotation.y = o.rotY;
    m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true;
    this.mats.track(geo);
    (o.parent ?? this.group).add(m);
    return m;
  }

  /** 直方体。pos は底面の中心 */
  box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], pos: Vec, o: PlaceOpts = {}) {
    const m = this.mesh(metricBox(w, h, d), mat, [pos[0], pos[1] + h / 2, pos[2]], o);
    if (o.collide) this.colliderFor(pos[0], pos[2], w, d, o.rotY ?? 0, typeof o.collide === "number" ? o.collide : 0);
    return m;
  }

  cyl(rTop: number, rBot: number, h: number, mat: THREE.Material, pos: Vec, o: PlaceOpts & { seg?: number } = {}) {
    const m = this.mesh(new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 20), mat, [pos[0], pos[1] + h / 2, pos[2]], o);
    if (o.collide) this.collider(pos[0] - rBot, pos[2] - rBot, pos[0] + rBot, pos[2] + rBot);
    return m;
  }

  sphere(r: number, mat: THREE.Material, pos: Vec, o: PlaceOpts = {}) {
    return this.mesh(new THREE.SphereGeometry(r, 24, 16), mat, pos, o);
  }

  /** 回転体（壺・椀・電球の笠など）。points は [半径, 高さ] */
  lathe(points: [number, number][], mat: THREE.Material, pos: Vec, o: PlaceOpts & { seg?: number } = {}) {
    const geo = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), o.seg ?? 32);
    return this.mesh(geo, mat, pos, o);
  }

  collider(x0: number, z0: number, x1: number, z1: number) { this.colliders.push({ x0, z0, x1, z1 }); }
  private colliderFor(x: number, z: number, w: number, d: number, rot: number, pad: number) {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const hw = (w * c + d * s) / 2 + pad, hd = (w * s + d * c) / 2 + pad;
    this.collider(x - hw, z - hd, x + hw, z + hd);
  }

  /** グループの位置を中心にした当たり判定（家具用） */
  colliderFromGroup(g: THREE.Object3D, hw: number, hd: number) { this.collider(g.position.x - hw, g.position.z - hd, g.position.x + hw, g.position.z + hd); }
  footZone(x0: number, z0: number, x1: number, z1: number, kind: Floor) { this.footZones.push({ box: { x0, z0, x1, z1 }, kind }); }
  interactable(obj: THREE.Object3D, id: string) { this.interactables.push({ obj, id }); }
  onUpdate(fn: (t: number, time: number, dt: number) => void) { this.updaters.push(fn); }
  /** ロジック時間 t が sec を越えた瞬間に一度だけ呼ぶ */
  at(sec: number, fn: () => void) { let prev = -1; this.onUpdate(t => { if (prev < sec && t >= sec) fn(); prev = t; }); }
  update(t: number, time: number, dt: number) { for (const u of this.updaters) u(t, time, dt); }

  sound(name: string, pos: Vec) { if (this.silent) return { stop() {}, gain() {} }; const l = this.audio.loop(name, { x: pos[0], y: pos[1], z: pos[2] }); this.loops.push(l); return l; }
  play(name: string, pos: Vec | null) { if (this.silent) return; this.audio.play(name, pos ? { x: pos[0], y: pos[1], z: pos[2] } : null); }

  /* ---------------- 照明 ---------------- */
  private shadowSize(kind: "spot" | "point") {
    if (this.quality === "low") return 0;
    if (kind === "point") return this.quality === "high" ? 512 : 0;
    return this.quality === "high" ? 1024 : 512;
  }

  /** 天井から下向きのスポット（蛍光灯・ダウンライトの主光源） */
  spot(pos: Vec, o: { color?: number; intensity?: number; angle?: number; distance?: number; shadow?: boolean; target?: Vec; penumbra?: number } = {}) {
    const l = new THREE.SpotLight(o.color ?? 0xffffff, o.intensity ?? 12, o.distance ?? 9, o.angle ?? 1.15, o.penumbra ?? 0.9, 2);
    l.position.set(...pos);
    l.target.position.set(...(o.target ?? [pos[0], 0, pos[2]]));
    const sz = o.shadow ? this.shadowSize("spot") : 0;
    if (sz) { l.castShadow = true; l.shadow.mapSize.set(sz, sz); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.camera.near = 0.1; l.shadow.radius = 3; }
    this.group.add(l, l.target);
    return l;
  }

  point(pos: Vec, o: { color?: number; intensity?: number; distance?: number; shadow?: boolean } = {}) {
    const l = new THREE.PointLight(o.color ?? 0xffd9a8, o.intensity ?? 3, o.distance ?? 6, 2);
    l.position.set(...pos);
    const sz = o.shadow ? this.shadowSize("point") : 0;
    if (sz) { l.castShadow = true; l.shadow.mapSize.set(sz, sz); l.shadow.bias = -0.002; l.shadow.normalBias = 0.02; l.shadow.radius = 4; }
    this.group.add(l);
    return l;
  }

  hemi(sky: number, ground: number, intensity: number) { const l = new THREE.HemisphereLight(sky, ground, intensity); this.group.add(l); return l; }

  /** 天井の蛍光灯パネル。flicker を渡すとちらつく（決まった時間パターン） */
  fluorescent(x: number, z: number, o: { w?: number; d?: number; on?: boolean; color?: number; intensity?: number; shadow?: boolean; flicker?: number; hum?: boolean } = {}) {
    const w = o.w ?? 0.6, d = o.d ?? 1.2, y = this.H, on = o.on ?? true;
    this.box(w + 0.06, 0.04, d + 0.06, this.mats.plain(0xb8b8b4, 0.5, 0.3), [x, y - 0.04, z], { cast: false });
    const glow = this.mats.glow(o.color ?? 0xeaf2ff, on ? 2.2 : 0);
    const panel = this.mesh(new THREE.PlaneGeometry(w, d), glow, [x, y - 0.042, z], { cast: false, receive: false });
    panel.rotation.x = Math.PI / 2;
    if (!on) { (panel.material as THREE.MeshStandardMaterial).color.set(0x6a6d70); return null; }
    const base = o.intensity ?? 6;
    const l = this.spot([x, y - 0.06, z], { color: o.color ?? 0xeaf2ff, intensity: base, shadow: o.shadow, angle: 1.25 });
    const hum = o.hum !== false ? this.sound("hum", [x, y - 0.1, z]) : null;
    if (o.flicker != null) {
      const seed = o.flicker; let wasOff = false;
      this.onUpdate((_t, time) => {
        const f = flicker(time, seed);
        l.intensity = base * f; glow.emissiveIntensity = 2.2 * f;
        hum?.gain(0.4 + f * 0.6);
        const off = f < 0.5; if (off && !wasOff) this.play("buzz", [x, y - 0.1, z]); wasOff = off;
      });
    }
    return l;
  }

  /** 裸電球（コード付き） */
  bulb(x: number, y: number, z: number, o: { color?: number; intensity?: number; distance?: number; shadow?: boolean; cord?: number } = {}) {
    const cord = o.cord ?? this.H - y;
    if (cord > 0) this.cyl(0.004, 0.004, cord, this.mats.plain(0x111111, 0.6), [x, y + 0.06, z], { cast: false });
    this.cyl(0.018, 0.018, 0.04, this.mats.plain(0x6b5a40, 0.4, 0.8), [x, y + 0.03, z], { cast: false });
    const glass = this.mats.glow(o.color ?? 0xffc98a, 6);
    const b = this.sphere(0.032, glass, [x, y, z], { cast: false, receive: false });
    const l = this.point([x, y - 0.05, z], { color: o.color ?? 0xffc98a, intensity: o.intensity ?? 4, distance: o.distance ?? 7, shadow: o.shadow });
    return { light: l, glass, mesh: b };
  }

  /** 壁や台に置く文字（看板・貼り紙・プレート）。pos は中心 */
  sign(o: SignOpts, pos: Vec, rotY = 0, parent?: THREE.Object3D) {
    const m = this.mesh(new THREE.PlaneGeometry(o.w, o.h), this.mats.sign(o), pos, { rotY, cast: false, parent });
    return m;
  }

  /* ---------------- 部屋の外殻 ---------------- */
  buildShell() {
    const s = this.shellSpec, M = this.mats;
    const wallMat = M.pbr(s.wall, { tile: s.wallTile ?? 2 });
    const wain = s.wainscot ? M.pbr(s.wainscot.mat, { tile: s.wallTile ?? 1.5 }) : null;
    const holes: Record<"n" | "s" | "e" | "w", number[]> = { n: [], s: [], e: [], w: [] };
    // 壁ごとのローカル u 座標（壁に向かって左→右ではなく、平面の +x 方向）
    const toU = (wall: "n" | "s" | "e" | "w", at: number) => (wall === "n" ? at : wall === "s" ? -at : wall === "w" ? -at : at);
    this.def.doors.forEach(d => holes[d.wall].push(toU(d.wall, d.at)));
    holes.s.push(toU("s", s.entryX ?? 0));
    const walls: { key: "n" | "s" | "e" | "w"; len: number; pos: Vec; rot: number }[] = [
      { key: "n", len: s.w, pos: [0, 0, -s.d / 2], rot: 0 },
      { key: "s", len: s.w, pos: [0, 0, s.d / 2], rot: Math.PI },
      { key: "w", len: s.d, pos: [-s.w / 2, 0, 0], rot: Math.PI / 2 },
      { key: "e", len: s.d, pos: [s.w / 2, 0, 0], rot: -Math.PI / 2 },
    ];
    const trimMat = M.plain(0x1c1712, 0.55);
    for (const w of walls) {
      const g = new THREE.Group(); g.position.set(...w.pos); g.rotation.y = w.rot; this.group.add(g);
      const wh = s.wainscot?.h ?? 0;
      const upper = wallGeometry(w.len, wh, s.h, holes[w.key], s.wallTile ?? 2);
      if (upper) this.mesh(upper, wallMat, [0, 0, 0], { parent: g, cast: false });
      if (wain && wh > 0) {
        const lower = wallGeometry(w.len, 0, wh, holes[w.key], s.wallTile ?? 1.5);
        if (lower) this.mesh(lower, wain, [0, 0, 0.012], { parent: g, cast: false });
        for (const [u0, u1] of solidSpans(w.len, holes[w.key])) this.box(u1 - u0, 0.035, 0.035, trimMat, [(u0 + u1) / 2, wh, 0.02], { parent: g, cast: false });
      }
      for (const [u0, u1] of solidSpans(w.len, holes[w.key])) this.box(u1 - u0, 0.09, 0.018, trimMat, [(u0 + u1) / 2, 0, 0.009], { parent: g, cast: false });
      // 天井の廻り縁
      this.box(w.len, 0.05, 0.03, trimMat, [0, s.h - 0.05, 0.015], { parent: g, cast: false });
    }
    // 床・天井（UV は絶対座標で連続させる）
    const floor = this.mesh(absPlane(s.w, s.d, s.floorTile ?? 1), M.pbr(s.floor, { tile: 1, color: s.floorColor }), [0, 0, 0], { cast: false });
    floor.rotation.x = -Math.PI / 2;
    const ceil = this.mesh(absPlane(s.w, s.d, s.ceilingTile ?? 1.5), M.pbr(s.ceiling, { tile: 1 }), [0, s.h, 0], { cast: false });
    ceil.rotation.x = Math.PI / 2;
    // 壁の当たり判定
    const T = 1;
    this.collider(-s.w / 2 - T, -s.d / 2 - T, s.w / 2 + T, -s.d / 2);
    this.collider(-s.w / 2 - T, s.d / 2, s.w / 2 + T, s.d / 2 + T);
    this.collider(-s.w / 2 - T, -s.d / 2 - T, -s.w / 2, s.d / 2 + T);
    this.collider(s.w / 2, -s.d / 2 - T, s.w / 2 + T, s.d / 2 + T);
    // 扉
    this.def.doors.forEach((d, i) => this.doors.push(this.buildDoor(d, i)));
    this.entry = this.buildDoor({ wall: "n", at: 0, style: s.entryStyle ?? this.def.doors[0]?.style }, -1);
  }

  /** 扉の開口部の座標系（ローカル +z が部屋の内側） */
  doorFrame(d: { wall: "n" | "e" | "w" | "s"; at: number }) {
    const s = this.shellSpec, g = new THREE.Group();
    if (d.wall === "n") { g.position.set(d.at, 0, -s.d / 2); g.rotation.y = 0; }
    if (d.wall === "s") { g.position.set(d.at, 0, s.d / 2); g.rotation.y = Math.PI; }
    if (d.wall === "w") { g.position.set(-s.w / 2, 0, d.at); g.rotation.y = Math.PI / 2; }
    if (d.wall === "e") { g.position.set(s.w / 2, 0, d.at); g.rotation.y = -Math.PI / 2; }
    return g;
  }

  private buildDoor(spec: DoorSpec, index: number): DoorObj {
    const M = this.mats, entry = index < 0;
    const frame = this.doorFrame(entry ? { wall: "s", at: this.shellSpec.entryX ?? 0 } : spec);
    this.group.add(frame);
    const style: DoorStyle = spec.style ?? "hotel";
    const slide = style === "fusuma" && !entry;
    // 枠
    const casing = style === "fusuma" ? M.pbr("white_oak_veneer", { tile: 1, color: 0xc9b08a }) : style === "metal" ? M.plain(0x2a2b2c, 0.5, 0.7) : style === "hotel" ? M.pbr("walnut_veneer", { tile: 1, color: 0x9a7a5a }) : M.plain(0xd9d6cc, 0.45);
    const cw = 0.07;
    this.box(cw, HOLE_H + cw, 0.05, casing, [-(HOLE_W + cw) / 2, 0, 0.02], { parent: frame });
    this.box(cw, HOLE_H + cw, 0.05, casing, [(HOLE_W + cw) / 2, 0, 0.02], { parent: frame });
    this.box(HOLE_W + cw * 2, cw, 0.05, casing, [0, HOLE_H, 0.02], { parent: frame });
    // 開口部の厚み（側面の見切り）
    const reveal = M.plain(0x15120f, 0.8);
    this.box(0.02, HOLE_H, 0.16, reveal, [-HOLE_W / 2 - 0.01, 0, -0.08], { parent: frame, cast: false });
    this.box(0.02, HOLE_H, 0.16, reveal, [HOLE_W / 2 + 0.01, 0, -0.08], { parent: frame, cast: false });
    this.box(HOLE_W, 0.02, 0.16, reveal, [0, HOLE_H, -0.08], { parent: frame, cast: false });

    // 扉の板：部屋側の面は部屋の様式、向こう側の面は「通路」の共通の見た目
    const face = this.doorFace(style, spec.label, entry);
    const back = passageMaterials(M).door;
    const edge = M.plain(0x1a1511, 0.6);
    const pivot = new THREE.Group();
    const hingeX = -DOOR_W / 2;
    pivot.position.set(slide ? 0 : hingeX, 0, slide ? -0.03 : -0.03);
    frame.add(pivot);
    this.mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.045), [edge, edge, edge, edge, face, back], [slide ? 0 : DOOR_W / 2, DOOR_H / 2, 0], { parent: pivot });
    if (style !== "fusuma") {
      const brass = M.plain(0xc8a050, 0.28, 1);
      this.sphere(0.03, brass, [DOOR_W / 2 + DOOR_W / 2 - 0.09, 1.0, 0.06], { parent: pivot });
      this.cyl(0.035, 0.035, 0.012, brass, [DOOR_W - 0.09, 1.0, 0.02], { parent: pivot, cast: false }).rotation.x = Math.PI / 2;
    } else {
      const hik = M.plain(0x1a1410, 0.3, 0.6);
      this.cyl(0.03, 0.03, 0.006, hik, [slide ? DOOR_W / 2 - 0.1 : DOOR_W - 0.1, 0.95, 0.025], { parent: pivot, cast: false }).rotation.x = Math.PI / 2;
    }
    if (spec.label && !entry) this.doorLabel(style, spec.label, pivot, slide);
    // 調べる対象
    if (!entry) this.interactable(pivot, `door:${index}`); // 板・ノブ・札のどこを見ても扉

    // 扉の向こうの小部屋
    const passage = buildPassage(M, this, !entry);
    passage.visible = false;
    if (entry) frame.add(passage);
    else { passage.rotation.y = Math.PI; passage.position.z = -PASSAGE_L; frame.add(passage); }

    const audio = this.audio;
    return {
      index, frame, leaf: pivot, slide, passage,
      setOpen(a: number) {
        const e = a * a * (3 - 2 * a);
        if (slide) pivot.position.x = -e * DOOR_W * 0.96;
        else pivot.rotation.y = entry ? -e * 1.5 : e * 1.45;
      },
      sound(open: boolean) {
        const p = frame.localToWorld(new THREE.Vector3(0, 1.2, 0));
        audio.play(slide ? (open ? "slide-open" : "slide-close") : open ? "door-open" : "door-close", p);
      },
    };
  }

  private doorFace(style: DoorStyle, _label: string | undefined, entry: boolean): THREE.Material {
    const M = this.mats;
    switch (style) {
      case "hotel": return M.pbr("walnut_veneer", { tile: 1.2, color: 0x8a6a4c });
      case "office": return M.plain(0xb9bcbc, 0.45, 0.05);
      case "hospital": return M.plain(0xd8d2bd, 0.5);
      case "metal": return M.pbr("rusty_metal_02", { tile: 1.5, color: 0x9a9a92 });
      case "fusuma": {
        const tex = M.canvas(512, 1152, (g, w, h) => {
          g.fillStyle = "#e4dcc6"; g.fillRect(0, 0, w, h);
          let seed = entry ? 5 : 9; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(150,130,90,${r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 4); }
          g.strokeStyle = "rgba(120,110,80,.25)"; g.lineWidth = 3;
          for (let i = 0; i < 9; i++) { const y = h * 0.62 + i * 26; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 50 + i) * 8); g.stroke(); }
          g.fillStyle = "#15110d"; g.fillRect(0, 0, w, 18); g.fillRect(0, h - 18, w, 18); g.fillRect(0, 0, 18, h); g.fillRect(w - 18, 0, 18, h);
        });
        return M.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      }
    }
  }

  private doorLabel(style: DoorStyle, label: string, pivot: THREE.Object3D, slide: boolean) {
    const cx = slide ? 0 : DOOR_W / 2;
    switch (style) {
      case "hotel":
        this.sign({ w: 0.2, h: 0.09, lines: [label], bg: "#b8924a", fg: "#2a1c0c", font: "mincho", style: "plaque", size: 0.8, metal: 0.9, rough: 0.35 }, [cx, 1.62, 0.025], 0, pivot);
        break;
      case "office":
        this.sign({ w: 0.34, h: 0.1, lines: [label], bg: "#202326", fg: "#f2f2f2", font: "gothic", style: "plate", size: 0.62, rough: 0.3 }, [cx, 1.55, 0.025], 0, pivot);
        break;
      case "hospital":
        this.sign({ w: 0.36, h: 0.12, lines: [label], bg: "#2c5d8a", fg: "#ffffff", font: "gothic", style: "plate", size: 0.6, rough: 0.35 }, [cx, 1.6, 0.025], 0, pivot);
        break;
      case "metal":
        this.sign({ w: 0.5, h: 0.16, lines: [label], fg: "#e8e0cc", font: "stencil", style: "spray", size: 0.75, transparent: true }, [cx, 1.5, 0.026], 0, pivot);
        break;
      case "fusuma":
        this.box(0.1, 0.2, 0.012, this.mats.pbr("white_oak_veneer", { tile: 0.5, color: 0xd8c09a }), [cx, 1.42, 0.03], { parent: pivot, cast: false });
        this.sign({ w: 0.08, h: 0.17, lines: [label], bg: "#d8c3a0", fg: "#1a120a", font: "brush", style: "plate", size: 0.9, vertical: true, transparent: true }, [cx, 1.52, 0.037], 0, pivot);
        break;
    }
  }

  dispose() {
    this.loops.forEach(l => l.stop());
    this.group.removeFromParent();
    this.group.traverse(o => {
      const l = o as THREE.Light;
      if ((l as any).isLight && l.shadow?.map) l.shadow.map.dispose();
    });
  }
}

/* ---------------- ちらつきのパターン（時間だけで決まる） ---------------- */
export function flicker(time: number, seed: number) {
  const seg = Math.floor(time * 14), h = hash(seg * 7 + seed * 131);
  const burst = Math.floor(time / 2.6), inBurst = hash(burst * 13 + seed) < 0.45 && (time % 2.6) < 0.5;
  if (inBurst && h < 0.55) return 0.05 + h * 0.3;
  if (h < 0.025) return 0.3;
  return 0.94 + 0.06 * Math.sin(time * 120);
}
function hash(n: number) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

/* ---------------- 壁（開口部をくり抜いた平面）。UV は壁の座標そのまま ---------------- */
function solidSpans(len: number, holes: number[]): [number, number][] {
  const cuts = holes.map(u => [u - HOLE_W / 2 - 0.07, u + HOLE_W / 2 + 0.07] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = []; let u = -len / 2;
  for (const [a, b] of cuts) { if (a > u) out.push([u, a]); u = Math.max(u, b); }
  if (u < len / 2) out.push([u, len / 2]);
  return out;
}

function wallGeometry(len: number, y0: number, y1: number, holes: number[], tile: number) {
  const xs = new Set<number>([-len / 2, len / 2]);
  holes.forEach(u => { xs.add(u - HOLE_W / 2); xs.add(u + HOLE_W / 2); });
  const sorted = [...xs].sort((a, b) => a - b), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1], mid = (a + b) / 2;
    const inHole = holes.some(u => Math.abs(mid - u) < HOLE_W / 2);
    const bot = inHole ? Math.max(y0, HOLE_H) : y0;
    if (bot >= y1 - 1e-4 || b - a < 1e-4) continue;
    const g = new THREE.PlaneGeometry(b - a, y1 - bot);
    g.translate(mid, (bot + y1) / 2, 0);
    const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
    for (let j = 0; j < p.count; j++) uv.setXY(j, p.getX(j) / tile, p.getY(j) / tile);
    parts.push(g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
}

function absPlane(w: number, d: number, tile: number) {
  const g = new THREE.PlaneGeometry(w, d, 1, 1);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let j = 0; j < p.count; j++) uv.setXY(j, p.getX(j) / tile, p.getY(j) / tile);
  return g;
}

/* ---------------- 扉の向こうの小部屋（全ての扉で同一。照明の影響を受けない焼き込み） ---------------- */
let passageCache: ReturnType<typeof makePassageMaterials> | null = null;
function passageMaterials(M: Materials) { return (passageCache ??= makePassageMaterials(M)); }

function makePassageMaterials(M: Materials) {
  const bulb = new THREE.Vector3(0, PASSAGE_H - 0.3, -PASSAGE_L * 0.45);
  // 平面上の各点の明るさを電球からの距離で計算して焼き込む
  const bake = (w: number, h: number, base: [number, number, number], toWorld: (u: number, v: number) => THREE.Vector3, normal: THREE.Vector3, grain = 18) => {
    const RW = 128, RH = Math.max(32, Math.round((128 * h) / w));
    const cv = document.createElement("canvas"); cv.width = RW; cv.height = RH;
    const g = cv.getContext("2d")!, img = g.createImageData(RW, RH);
    let seed = 41; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const p = toWorld((x + 0.5) / RW, 1 - (y + 0.5) / RH), L = bulb.clone().sub(p), d = L.length();
      const lam = Math.max(0, L.normalize().dot(normal));
      const lum = 0.05 + (lam * 1.25) / (1 + d * d * 1.6);
      const n = (rnd() - 0.5) * grain, i = (y * RW + x) * 4;
      img.data[i] = Math.min(255, base[0] * lum + n); img.data[i + 1] = Math.min(255, base[1] * lum + n); img.data[i + 2] = Math.min(255, base[2] * lum + n); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, fog: false });
  };
  const L = PASSAGE_L, W = PASSAGE_W, H = PASSAGE_H;
  const wallC: [number, number, number] = [150, 132, 112];
  return {
    left: bake(L, H, wallC, (u, v) => new THREE.Vector3(-W / 2, v * H, -u * L), new THREE.Vector3(1, 0, 0)),
    right: bake(L, H, wallC, (u, v) => new THREE.Vector3(W / 2, v * H, -L + u * L), new THREE.Vector3(-1, 0, 0)),
    floor: bake(W, L, [110, 102, 92], (u, v) => new THREE.Vector3(-W / 2 + u * W, 0, -v * L), new THREE.Vector3(0, 1, 0), 30),
    ceil: bake(W, L, [130, 122, 110], (u, v) => new THREE.Vector3(-W / 2 + u * W, H, -L + v * L), new THREE.Vector3(0, -1, 0)),
    end: bake(W, H, [70, 64, 58], (u, v) => new THREE.Vector3(W / 2 - u * W, v * H, -L), new THREE.Vector3(0, 0, 1)),
    door: (() => {
      const m = bake(DOOR_W, DOOR_H, [120, 98, 76], (u, v) => new THREE.Vector3(-DOOR_W / 2 + u * DOOR_W, v * DOOR_H, -0.03), new THREE.Vector3(0, 0, -1), 10);
      // 扉の板の線
      const t = m.map as THREE.CanvasTexture, cv = t.image as HTMLCanvasElement, g = cv.getContext("2d")!;
      g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2;
      g.strokeRect(cv.width * 0.14, cv.height * 0.08, cv.width * 0.72, cv.height * 0.38);
      g.strokeRect(cv.width * 0.14, cv.height * 0.54, cv.width * 0.72, cv.height * 0.38);
      t.needsUpdate = true;
      return m;
    })(),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 2), fog: false }),
    _keep: M,
  };
}

function buildPassage(M: Materials, kit: Kit, withDoor: boolean) {
  const m = passageMaterials(M), g = new THREE.Group();
  const L = PASSAGE_L, W = PASSAGE_W, H = PASSAGE_H;
  const plane = (w: number, h: number, mat: THREE.Material, pos: Vec, rx: number, ry: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(...pos); p.rotation.set(rx, ry, 0);
    kit.mats.track(p.geometry); g.add(p); return p;
  };
  plane(L, H, m.left, [-W / 2, H / 2, -L / 2], 0, Math.PI / 2);
  plane(L, H, m.right, [W / 2, H / 2, -L / 2], 0, -Math.PI / 2);
  plane(W, L, m.floor, [0, 0, -L / 2], -Math.PI / 2, 0);
  plane(W, L, m.ceil, [0, H, -L / 2], Math.PI / 2, 0);
  // 部屋側の壁（扉の開口部の周り）を通路側から見た面
  // 扉の板の大きさぴったりまで覆う（隙間から部屋の光が漏れて切り替えが見えないように）
  const OW = DOOR_W + 0.004, OH = DOOR_H + 0.004, sideW = (W - OW) / 2;
  plane(sideW, H, m.end, [-(OW / 2 + sideW / 2), H / 2, -0.001], 0, Math.PI);
  plane(sideW, H, m.end, [OW / 2 + sideW / 2, H / 2, -0.001], 0, Math.PI);
  plane(OW, H - OH, m.end, [0, (H + OH) / 2, -0.001], 0, Math.PI);
  // 突き当たりの扉（入口の扉を通路側から見た姿と同じ形・同じ位置）
  if (withDoor) {
    const edge = kit.mats.plain(0x1a1511, 0.6);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.045), [edge, edge, edge, edge, edge, m.door]);
    leaf.position.set(0, DOOR_H / 2, -0.03); kit.mats.track(leaf.geometry); g.add(leaf);
  }
  // 天井の裸電球
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), m.bulb); b.position.set(0, H - 0.3, -L * 0.45); g.add(b);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.27, 6), new THREE.MeshBasicMaterial({ color: 0x050505, fog: false }));
  cord.position.set(0, H - 0.15, -L * 0.45); g.add(cord);
  return g;
}
