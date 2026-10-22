// 第1室 ホテルの廊下 — 灯りのともる扉へ
import * as THREE from "three";
import type { RoomDef } from "../core/types";
import { painting, place, plant, sconce } from "./props";

const LIT = 2; // 灯りがともっている扉（東の305）

export const hotel: RoomDef<{}> = {
  id: "hotel",
  name: "ホテルの廊下",
  limit: 15,
  shell: {
    w: 2.6, d: 11, h: 2.7,
    floor: "dirty_carpet", floorTile: 1.6, wall: "decrepit_wallpaper", wallTile: 1.8, ceiling: "white_plaster_02",
    wainscot: { mat: "walnut_veneer", h: 0.9 },
    entryStyle: "hotel", footstep: "carpet", tone: "hotel", reverb: 0.7,
    fog: { color: 0x0b0806, density: 0.075 }, env: 0.12, exposure: 1.05,
  },
  doors: [
    { wall: "w", at: -3.6, label: "303", style: "hotel" },
    { wall: "n", at: 0, label: "304", style: "hotel" },
    { wall: "e", at: -3.6, label: "305", style: "hotel" },
  ],
  answer: LIT,
  logic: {
    init: () => ({}),
    miss: () => "灯りがともっていたのは 右の「305」だった",
  },
  build(kit) {
    const M = kit.mats, H = kit.H;
    // 扉の上のランプ：305 だけが灯っている
    sconce(kit, [-1.3, 2.46, -3.6], Math.PI / 2, false);
    sconce(kit, [0, 2.46, -5.5], 0, false);
    sconce(kit, [1.3, 2.46, -3.6], -Math.PI / 2, true);
    kit.point([1.12, 2.3, -3.6], { color: 0xffb36b, intensity: 2.6, distance: 4.5 });

    // 天井の照明（手前は点灯、中ほどはちらつき、奥は消えている）
    const fixture = (z: number, on: boolean, flick?: number) => {
      kit.cyl(0.2, 0.22, 0.05, M.plain(0x8f7b5a, 0.35, 0.8), [0, H - 0.05, z], { cast: false });
      const glass = on ? M.glow(0xffd6a0, 2.2) : M.plain(0x5c5850, 0.4);
      const d = kit.cyl(0.17, 0.17, 0.03, glass, [0, H - 0.075, z], { cast: false, receive: false });
      if (!on) return;
      const l = kit.spot([0, H - 0.1, z], { color: 0xffcf98, intensity: 7, shadow: flick == null, angle: 1.2 });
      if (flick != null) kit.onUpdate((_t, time) => { const f = flickerSoft(time); l.intensity = 7 * f; (d.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 * f; });
    };
    fixture(3.2, true); fixture(0, true, 1); fixture(-3.4, false);

    // 案内の立て看板（入ってすぐ正面）
    const stand = place(kit, [0, 0, 2.3]);
    const brass = M.plain(0xa8843f, 0.3, 1);
    kit.cyl(0.16, 0.18, 0.03, brass, [0, 0, 0], { parent: stand });
    kit.cyl(0.015, 0.015, 1.05, brass, [0, 0.03, 0], { parent: stand });
    kit.box(0.5, 0.66, 0.03, M.pbr("walnut_veneer", { tile: 0.7, color: 0x7a5a3c }), [0, 1.0, 0], { parent: stand });
    kit.sign({ w: 0.44, h: 0.6, lines: ["ご 案 内", "", "灯りのともる", "扉へ", "お進みください"], bg: "#efe7d4", fg: "#2b2014", font: "mincho", style: "paper", size: 0.15, border: "#8a6a3a" }, [0, 1.33, 0.017], 0, stand);
    kit.collider(-0.28, 2.15, 0.28, 2.45);

    // 廊下の調度
    const table = place(kit, [-1.08, 0, 0.6]);
    const wood = M.pbr("walnut_veneer", { tile: 0.8, color: 0x6a4a30 });
    kit.box(0.4, 0.04, 1.0, wood, [0, 0.78, 0], { parent: table });
    for (const z of [-0.45, 0.45]) kit.box(0.04, 0.78, 0.04, wood, [0.15, 0, z], { parent: table });
    kit.lathe([[0, 0], [0.06, 0], [0.09, 0.12], [0.05, 0.26], [0.06, 0.3], [0, 0.29]], M.plain(0x2f3b3a, 0.15, 0.1), [0, 0.82, 0.1], { parent: table });
    const stem = M.plain(0x3d3420, 0.8);
    for (let i = 0; i < 5; i++) { const s = kit.cyl(0.004, 0.004, 0.4, stem, [0.01 * i - 0.02, 1.08, 0.1], { parent: table, cast: false }); s.rotation.z = (i - 2) * 0.18; }
    kit.collider(-1.3, 0.05, -0.85, 1.15);
    painting(kit, [1.29, 1.65, 0.6], -Math.PI / 2, 0.7, 0.5, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#232a2a"); gr.addColorStop(1, "#4a3c2a"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = "#151614"; g.beginPath(); g.moveTo(0, H * 0.75); g.quadraticCurveTo(W * 0.4, H * 0.5, W, H * 0.7); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      g.fillStyle = "#c9b98f"; g.beginPath(); g.arc(W * 0.7, H * 0.3, H * 0.06, 0, Math.PI * 2); g.fill();
    });
    plant(kit, [1.0, 0, 4.9], 1, true);
    // ルームサービスのワゴン
    const cart = place(kit, [-0.9, 0, -1.6]);
    const steel = M.plain(0xb5b3ad, 0.3, 0.95);
    kit.box(0.45, 0.02, 0.7, steel, [0, 0.75, 0], { parent: cart }); kit.box(0.45, 0.02, 0.7, steel, [0, 0.2, 0], { parent: cart });
    for (const [x, z] of [[-0.2, -0.32], [0.2, -0.32], [-0.2, 0.32], [0.2, 0.32]]) kit.cyl(0.012, 0.012, 0.75, steel, [x, 0, z], { parent: cart });
    kit.lathe([[0, 0], [0.16, 0], [0.15, 0.06], [0.08, 0.13], [0, 0.14]], steel, [0, 0.77, 0.1], { parent: cart });
    kit.box(0.3, 0.01, 0.4, M.plain(0xe8e2d4, 0.9), [0, 0.765, -0.1], { parent: cart, cast: false });
    kit.collider(-1.2, -2.0, -0.6, -1.2);
    kit.hemi(0x3a3430, 0x0a0806, 0.12);
  },
  solution: [{ at: 2.0, moveTo: [0.6, -3.6] }, { at: 3.0, door: LIT }],
};

/** 天井灯のゆっくりした明滅（廊下用） */
function flickerSoft(time: number) {
  const a = Math.sin(time * 1.7) * Math.sin(time * 0.53 + 1);
  if (a > 0.82) return 0.25 + 0.2 * Math.sin(time * 60);
  return 0.92 + 0.08 * Math.sin(time * 9.1);
}
