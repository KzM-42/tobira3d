// 素材：Poly Haven(CC0) の PBR テクスチャと、コードで描く布・紙・畳・文字のテクスチャ
import * as THREE from "three";

export const TEXTURE_IDS = [
  "dirty_carpet", "decrepit_wallpaper", "walnut_veneer", "ceiling_interior", "painted_plaster_wall",
  "long_white_tiles", "old_linoleum_flooring_01", "clay_plaster", "white_oak_veneer",
  "concrete_floor_worn_001", "concrete_wall_006", "rusty_metal_02", "white_plaster_02",
] as const;

interface TexSet { map: THREE.Texture; normal: THREE.Texture; arm: THREE.Texture }

export interface PbrOpts {
  tile?: number;          // 1枚のテクスチャが何メートル分か
  color?: THREE.ColorRepresentation;
  rough?: number;         // roughness の倍率
  metal?: number;
  normalScale?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

const BASE = import.meta.env.BASE_URL + "textures/";

export class Materials {
  private sets = new Map<string, TexSet>();
  private manager = new THREE.LoadingManager();
  private loader = new THREE.TextureLoader(this.manager);
  readonly anisotropy: number;
  /** 部屋ごとに作った物（部屋を破棄する時に dispose） */
  private owned: { dispose(): void }[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  /** 全テクスチャを先読みする */
  preload(onProgress: (p: number) => void): Promise<void> {
    return new Promise(resolve => {
      this.manager.onProgress = (_u, loaded, total) => onProgress(loaded / total);
      this.manager.onLoad = () => resolve();
      this.manager.onError = () => {};
      for (const id of TEXTURE_IDS) this.set(id);
    });
  }

  private set(id: string): TexSet {
    let s = this.sets.get(id);
    if (!s) {
      const load = (name: string, srgb: boolean) => {
        const t = this.loader.load(`${BASE}${id}/${name}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.anisotropy;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      s = { map: load("diff", true), normal: load("nor", false), arm: load("arm", false) };
      this.sets.set(id, s);
    }
    return s;
  }

  track<T extends { dispose(): void }>(o: T): T { this.owned.push(o); return o; }

  /** PBR マテリアル。UV はメートル単位で作っているので tile で大きさを決める */
  pbr(id: string, o: PbrOpts = {}): THREE.MeshStandardMaterial {
    if (id === "tatami") return this.tatami(1.8); // 畳1枚 = 0.9m × 1.8m
    const s = this.set(id), rep = 1 / (o.tile ?? 1);
    const clone = (t: THREE.Texture) => { const c = this.track(t.clone()); c.repeat.set(rep, rep); c.needsUpdate = true; return c; };
    const arm = clone(s.arm);
    const m = new THREE.MeshStandardMaterial({
      map: clone(s.map), normalMap: clone(s.normal), aoMap: arm, roughnessMap: arm, metalnessMap: arm,
      color: o.color ?? 0xffffff, roughness: o.rough ?? 1, metalness: o.metal ?? 1,
      normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1,
    });
    if (o.metal == null) m.metalness = 1; // arm の青チャンネルに従う
    return this.track(m);
  }

  /** 単色の質感（塗装・プラスチック・金属） */
  plain(color: THREE.ColorRepresentation, rough = 0.6, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
    return this.track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  }

  /** 発光体（蛍光灯・電球・画面） */
  glow(color: THREE.ColorRepresentation, intensity = 2) {
    return this.track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 1 }));
  }

  /** キャンバスで描いたテクスチャ */
  canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d")!, w, h);
    const t = this.track(new THREE.CanvasTexture(cv));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.anisotropy;
    return t;
  }

  /** 畳（コードで生成：い草の筋と縁） */
  private tatamiTex?: { map: THREE.Texture; normal: THREE.Texture };
  tatami(tile: number) {
    if (!this.tatamiTex) {
      const W = 512, H = 1024;
      const draw = (bump: boolean) => (g: CanvasRenderingContext2D) => {
        let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        g.fillStyle = bump ? "#8080ff" : "#a59a62"; g.fillRect(0, 0, W, H);
        for (let y = 0; y < H; y += 3) {
          const v = rnd();
          if (bump) { g.fillStyle = `rgb(128,${100 + v * 60},255)`; }
          else { const l = 52 + v * 14; g.fillStyle = `hsl(${50 + v * 8},${30 + v * 8}%,${l}%)`; }
          g.fillRect(0, y, W, 2);
        }
        for (let i = 0; i < 1400; i++) { g.fillStyle = bump ? "rgba(128,128,255,.4)" : `rgba(70,60,30,${rnd() * 0.12})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 30, 1); }
        g.fillStyle = bump ? "#8080ff" : "#1f2a22"; g.fillRect(0, 0, 26, H); g.fillRect(W - 26, 0, 26, H);
        if (!bump) { g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(4, 0, 6, H); g.fillRect(W - 22, 0, 6, H); }
        g.fillStyle = bump ? "#6060ff" : "rgba(0,0,0,.35)"; g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3); g.fillRect(25, 0, 2, H); g.fillRect(W - 27, 0, 2, H);
      };
      this.tatamiTex = { map: this.canvas(W, H, draw(false)), normal: this.canvas(W, H, draw(true), false) };
      [this.tatamiTex.map, this.tatamiTex.normal].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
      this.owned = this.owned.filter(o => o !== this.tatamiTex!.map && o !== this.tatamiTex!.normal);
    }
    const map = this.track(this.tatamiTex.map.clone()), normal = this.track(this.tatamiTex.normal.clone());
    map.repeat.set(1 / (tile * 0.5), 1 / tile); normal.repeat.copy(map.repeat);
    return this.track(new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.85 }));
  }

  /** 紙・看板・プレートなどの文字テクスチャ */
  sign(o: SignOpts) {
    const pxPerM = o.res ?? 600, W = Math.round(o.w * pxPerM), H = Math.round(o.h * pxPerM);
    const tex = this.canvas(W, H, (g) => drawSign(g, W, H, o));
    return this.track(new THREE.MeshStandardMaterial({
      map: tex, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0,
      emissive: o.emissive ? 0xffffff : 0x000000, emissiveMap: o.emissive ? tex : null, emissiveIntensity: o.emissive ?? 0,
      transparent: !!o.transparent, alphaTest: o.transparent ? 0.02 : 0,
    }));
  }

  /** 部屋で作った素材をまとめて捨てる */
  disposeOwned() { this.owned.forEach(o => o.dispose()); this.owned = []; }
}

export interface SignOpts {
  w: number; h: number;              // メートル
  lines: string[];
  bg?: string; fg?: string;
  font?: "mincho" | "gothic" | "hand" | "stencil" | "brush";
  size?: number;                     // 1行の高さ（看板の高さに対する比）
  vertical?: boolean;
  border?: string;
  style?: "paper" | "plaque" | "whiteboard" | "spray" | "scroll" | "led" | "plate";
  emissive?: number; rough?: number; metal?: number; res?: number; transparent?: boolean;
  align?: "center" | "left";
}

const FONTS = {
  mincho: `"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`,
  gothic: `"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif`,
  hand: `"Klee One","Hiragino Maru Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif`,
  stencil: `"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif`,
  brush: `"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`,
};

function drawSign(g: CanvasRenderingContext2D, W: number, H: number, o: SignOpts) {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const style = o.style ?? "paper";
  if (!o.transparent) { g.fillStyle = o.bg ?? "#e9e2d0"; g.fillRect(0, 0, W, H); }
  if (style === "paper" || style === "scroll") {
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(90,70,40,${rnd() * 0.05})`; g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 2 + rnd() * 6); }
    const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(90,60,20,.28)"); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }
  if (style === "whiteboard") {
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(60,70,90,${0.03 + rnd() * 0.05})`; g.lineWidth = 6 + rnd() * 20; g.beginPath(); const x = rnd() * W, y = rnd() * H; g.moveTo(x, y); g.lineTo(x + rnd() * 300 - 150, y + rnd() * 60 - 30); g.stroke(); }
  }
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = Math.min(W, H) * 0.04; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth); }
  const font = FONTS[o.font ?? "mincho"];
  const lh = (o.size ?? 1 / (o.lines.length + 1)) * (o.vertical ? W : H);
  g.fillStyle = o.fg ?? "#222"; g.textBaseline = "middle";
  const weight = o.font === "stencil" ? "900" : o.font === "brush" ? "700" : "600";
  g.font = `${weight} ${lh * 0.78}px ${font}`;
  if (style === "led") { g.shadowColor = o.fg ?? "#f33"; g.shadowBlur = lh * 0.3; }
  if (o.vertical) {
    // 縦書き：右の行から左へ
    const n = o.lines.length, colW = lh, x0 = W / 2 + ((n - 1) * colW) / 2;
    o.lines.forEach((line, i) => {
      const x = x0 - i * colW; const chars = [...line]; const longest = Math.max(...o.lines.map(l => [...l].length));
      const ch = Math.min(lh * 0.92, (H * 0.9) / longest); g.font = `${weight} ${Math.min(lh * 0.78, ch * 0.85)}px ${font}`;
      let y = (H - chars.length * ch) / 2 + ch / 2;
      g.textAlign = "center"; chars.forEach(c => { g.fillText(c, x, y); y += ch; });
    });
  } else {
    const n = o.lines.length, y0 = H / 2 - ((n - 1) * lh) / 2;
    g.textAlign = o.align ?? "center";
    const x = o.align === "left" ? W * 0.07 : W / 2;
    // 一番長い行が幅の88%に収まるよう文字を縮める
    const widest = Math.max(...o.lines.map(l => g.measureText(l).width));
    if (widest > W * 0.88) g.font = `${weight} ${lh * 0.78 * (W * 0.88) / widest}px ${font}`;
    o.lines.forEach((line, i) => {
      if (style === "spray") {
        for (let j = 0; j < 3; j++) { g.globalAlpha = 0.35; g.fillText(line, x + (rnd() - 0.5) * lh * 0.05, y0 + i * lh + (rnd() - 0.5) * lh * 0.05); }
        g.globalAlpha = 1;
        for (let d = 0; d < 2; d++) { const dx = rnd() * W * 0.8 + W * 0.1; g.fillRect(dx, y0 + i * lh + lh * 0.3, lh * 0.04, lh * (0.2 + rnd() * 0.6)); }
      } else g.fillText(line, x, y0 + i * lh);
    });
  }
  g.shadowBlur = 0;
}

/** BoxGeometry の UV をメートル単位にする（テクスチャが伸びない） */
export function metricBox(w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  return geo;
}

export function metricPlane(w: number, h: number) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return geo;
}
