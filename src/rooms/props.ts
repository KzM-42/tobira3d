// 部屋で共通して使う小物（コードで組み立てる）
import * as THREE from "three";
import type { Kit } from "../engine/kit";

type V = [number, number, number];

/** 部屋の中に小さなグループを置く（回転込み） */
export function place(kit: Kit, pos: V, rotY = 0) {
  const g = new THREE.Group(); g.position.set(...pos); g.rotation.y = rotY; kit.group.add(g); return g;
}

export function woodChair(kit: Kit, pos: V, rotY = 0, color = 0x6a4a30) {
  const g = place(kit, pos, rotY), m = kit.mats.pbr("walnut_veneer", { tile: 0.6, color });
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) kit.box(0.04, 0.45, 0.04, m, [x, 0, z], { parent: g });
  kit.box(0.46, 0.04, 0.46, m, [0, 0.45, 0], { parent: g });
  kit.box(0.04, 0.5, 0.04, m, [-0.2, 0.49, -0.2], { parent: g }); kit.box(0.04, 0.5, 0.04, m, [0.2, 0.49, -0.2], { parent: g });
  kit.box(0.44, 0.12, 0.03, m, [0, 0.82, -0.2], { parent: g }); kit.box(0.44, 0.05, 0.03, m, [0, 0.62, -0.2], { parent: g });
  kit.colliderFromGroup(g, 0.26, 0.26);
  return g;
}

export function officeChair(kit: Kit, pos: V, rotY = 0) {
  const g = place(kit, pos, rotY), black = kit.mats.plain(0x18191b, 0.7), metal = kit.mats.plain(0x8a8d90, 0.35, 0.9);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = kit.box(0.3, 0.03, 0.04, metal, [Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15], { parent: g }); leg.rotation.y = -a; kit.sphere(0.025, black, [Math.cos(a) * 0.3, 0.025, Math.sin(a) * 0.3], { parent: g }); }
  kit.cyl(0.025, 0.025, 0.36, metal, [0, 0.06, 0], { parent: g });
  kit.box(0.48, 0.08, 0.46, black, [0, 0.42, 0], { parent: g });
  const back = kit.box(0.44, 0.5, 0.06, black, [0, 0.55, 0.24], { parent: g }); back.rotation.x = -0.12;
  kit.colliderFromGroup(g, 0.28, 0.28);
  return g;
}

export function plant(kit: Kit, pos: V, scale = 1, dead = false) {
  const g = place(kit, pos), pot = kit.mats.plain(dead ? 0x4a3a2c : 0x3b3b3b, 0.8);
  kit.lathe([[0.0, 0], [0.13 * scale, 0], [0.17 * scale, 0.32 * scale], [0.15 * scale, 0.33 * scale], [0, 0.31 * scale]], pot, [0, 0, 0], { parent: g });
  const leaf = kit.mats.plain(dead ? 0x5a4a2a : 0x2f4a2a, 0.75, 0, { side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, h = (0.5 + (i % 3) * 0.18) * scale;
    const l = kit.mesh(new THREE.PlaneGeometry(0.09 * scale, h), leaf, [Math.cos(a) * 0.05, 0.3 * scale + h / 2, Math.sin(a) * 0.05], { parent: g });
    l.rotation.set(Math.cos(a) * 0.35, a, Math.sin(a) * 0.35);
  }
  kit.collider(pos[0] - 0.2 * scale, pos[2] - 0.2 * scale, pos[0] + 0.2 * scale, pos[2] + 0.2 * scale);
  return g;
}

/** 額縁の絵（キャンバスで描く） */
export function painting(kit: Kit, pos: V, rotY: number, w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
  const g = place(kit, pos, rotY), frame = kit.mats.plain(0x6b5226, 0.4, 0.6);
  kit.box(w + 0.1, h + 0.1, 0.04, frame, [0, -0.05 - h / 2, 0.02], { parent: g });
  const tex = kit.mats.canvas(Math.round(w * 400), Math.round(h * 400), draw);
  kit.mesh(new THREE.PlaneGeometry(w, h), kit.mats.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 })), [0, 0, 0.042], { parent: g, cast: false });
  return g;
}

/** 等身大のマネキン（顔のない人形） */
export function mannequin(kit: Kit, pos: V, rotY = 0) {
  const g = place(kit, pos, rotY);
  const skin = kit.mats.plain(0xcfc6b8, 0.42, 0, { envMapIntensity: 1.4 } as any), metal = kit.mats.plain(0x3a3a3a, 0.35, 0.9);
  kit.cyl(0.22, 0.24, 0.03, metal, [0, 0, 0], { parent: g });
  kit.cyl(0.015, 0.015, 0.85, metal, [0, 0.03, 0], { parent: g });
  const torso = kit.mesh(new THREE.CapsuleGeometry(0.17, 0.42, 8, 16), skin, [0, 1.2, 0], { parent: g }); torso.scale.set(1, 1, 0.62);
  kit.mesh(new THREE.CapsuleGeometry(0.15, 0.12, 8, 16), skin, [0, 0.9, 0], { parent: g }).scale.set(1.05, 1, 0.7);
  kit.cyl(0.045, 0.055, 0.12, skin, [0, 1.52, 0], { parent: g });
  const head = kit.sphere(0.105, skin, [0, 1.72, 0.01], { parent: g }); head.scale.set(0.9, 1.15, 0.95);
  for (const s of [-1, 1]) {
    const arm = kit.mesh(new THREE.CapsuleGeometry(0.045, 0.52, 6, 12), skin, [s * 0.24, 1.15, 0.02], { parent: g });
    arm.rotation.z = s * 0.12;
  }
  return g;
}

/** 壁付けの小さなランプ（on のものだけ光る） */
export function sconce(kit: Kit, pos: V, rotY: number, on: boolean, color = 0xffc58a) {
  const g = place(kit, pos, rotY), brass = kit.mats.plain(0xb08a48, 0.3, 1);
  kit.box(0.08, 0.16, 0.02, brass, [0, -0.08, 0.01], { parent: g, cast: false });
  kit.cyl(0.012, 0.012, 0.1, brass, [0, -0.02, 0.06], { parent: g, cast: false }).rotation.x = Math.PI / 2;
  const shade = on ? kit.mats.glow(color, 4) : kit.mats.plain(0x77736b, 0.3, 0, { transparent: true, opacity: 0.85 });
  kit.lathe([[0.03, 0], [0.075, 0.02], [0.07, 0.15], [0.05, 0.16]], shade, [0, -0.06, 0.11], { parent: g, cast: false });
  return g;
}
