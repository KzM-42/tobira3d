// 第5室 地下倉庫 — 灯が消えている間に動いたものの扉へ
import * as THREE from "three";
import type { RoomDef } from "../core/types";
import { mannequin, place, woodChair } from "./props";

export const DARK_FROM = 2.5, DARK_TO = 4.0;
const OLD: [number, number] = [1.35, -1.9], NEW: [number, number] = [-0.55, -0.7];

export const basement: RoomDef<{}> = {
  id: "basement",
  name: "地下倉庫",
  limit: 25,
  shell: {
    w: 5, d: 6.5, h: 2.4,
    floor: "concrete_floor_worn_001", floorTile: 2, floorColor: 0x8c867a, wall: "concrete_wall_006", wallTile: 2.2, ceiling: "concrete_wall_006", ceilingTile: 2.5,
    entryStyle: "metal", footstep: "concrete", tone: "basement", reverb: 1.6,
    fog: { color: 0x040404, density: 0.11 }, env: 0.1, exposure: 1.15,
  },
  doors: [
    { wall: "n", at: -1.5, label: "イス", style: "metal" },
    { wall: "n", at: 0, label: "ハコ", style: "metal" },
    { wall: "n", at: 1.5, label: "ニンギョウ", style: "metal" },
  ],
  answer: 2,
  logic: {
    init: () => ({}),
    check: (_s, c) => (c.t < DARK_TO ? "明かりが戻る前に 扉をくぐった" : null),
    miss: () => "暗い間に動いたのは 人形（マネキン）だった",
  },
  build(kit) {
    const M = kit.mats, H = kit.H;
    // 中央の柱と吹き付けの指示
    kit.box(0.42, H, 0.42, M.pbr("concrete_wall_006", { tile: 1.2, color: 0x9a968c }), [0, 0, 0.75], { collide: true });
    kit.sign({ w: 0.4, h: 0.62, lines: ["灯が", "消えて", "戻ったら", "動いたものの", "扉へ"], fg: "#f1ead8", font: "stencil", style: "spray", size: 0.17, transparent: true }, [0, 1.35, 0.962], 0);

    // 椅子・木箱・マネキン
    woodChair(kit, [-1.55, 0, -1.25], 0.4);
    const crate = M.pbr("white_oak_veneer", { tile: 0.5, color: 0x8a6a48 });
    kit.box(0.7, 0.62, 0.6, crate, [1.6, 0, 0.35], { collide: true, rotY: -0.15 });
    kit.box(0.5, 0.42, 0.45, crate, [1.62, 0.62, 0.34], { rotY: 0.2 });
    const man = mannequin(kit, [OLD[0], 0, OLD[1]], -Math.PI / 2);
    const manBox = { x0: 0, z0: 0, x1: 0, z1: 0 }; kit.colliders.push(manBox);
    const setMan = (p: [number, number]) => { man.position.set(p[0], 0, p[1]); Object.assign(manBox, { x0: p[0] - 0.22, z0: p[1] - 0.22, x1: p[0] + 0.22, z1: p[1] + 0.22 }); };
    setMan(OLD);

    // 引きずった跡（動いた後だけ見える）：元の場所だけ埃がない円と、二本の擦り跡
    const dustTex = M.canvas(256, 256, (g, W) => {
      const gr = g.createRadialGradient(W / 2, W / 2, W * 0.18, W / 2, W / 2, W * 0.5);
      gr.addColorStop(0, "rgba(20,18,16,.38)"); gr.addColorStop(0.5, "rgba(20,18,16,.3)"); gr.addColorStop(0.68, "rgba(170,160,140,.22)"); gr.addColorStop(1, "rgba(170,160,140,0)");
      g.fillStyle = gr; g.fillRect(0, 0, W, W);
    });
    const dust = kit.mesh(new THREE.PlaneGeometry(0.75, 0.75), M.track(new THREE.MeshStandardMaterial({ map: dustTex, transparent: true, depthWrite: false, roughness: 0.6 })), [OLD[0], 0.004, OLD[1]], { cast: false });
    dust.rotation.x = -Math.PI / 2;
    const dx = NEW[0] - OLD[0], dz = NEW[1] - OLD[1], len = Math.hypot(dx, dz);
    const scuffTex = M.canvas(64, 512, (g, W, Hh) => {
      for (let i = 0; i < 2; i++) { const x = W * (0.3 + i * 0.4); const gr = g.createLinearGradient(x - 6, 0, x + 6, 0); gr.addColorStop(0, "rgba(15,13,12,0)"); gr.addColorStop(0.5, "rgba(15,13,12,.7)"); gr.addColorStop(1, "rgba(15,13,12,0)"); g.fillStyle = gr; g.fillRect(x - 6, 0, 12, Hh); }
    });
    const scuff = kit.mesh(new THREE.PlaneGeometry(0.3, len - 0.3), M.track(new THREE.MeshStandardMaterial({ map: scuffTex, transparent: true, depthWrite: false, roughness: 0.7 })), [(OLD[0] + NEW[0]) / 2, 0.005, (OLD[1] + NEW[1]) / 2], { cast: false });
    scuff.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, -dz) + Math.PI);
    dust.visible = scuff.visible = false;

    // 吊り下げの裸電球（ゆっくり揺れて影が動く）
    const bulb = kit.bulb(0, 1.85, -0.5, { intensity: 5.5, distance: 9, shadow: true, color: 0xffc27f });
    const cordTop = new THREE.Vector3(0, H, -0.5);
    let moved = false;
    kit.at(DARK_FROM, () => kit.play("pop", [0, 1.85, -0.5]));
    kit.at(DARK_FROM + 0.35, () => kit.play("drag", [(OLD[0] + NEW[0]) / 2, 0.3, (OLD[1] + NEW[1]) / 2]));
    kit.at(DARK_TO, () => kit.play("flicker-on", [0, 1.85, -0.5]));
    kit.onUpdate((t, time) => {
      const sw = Math.sin(time * 1.25) * 0.06;
      bulb.mesh.position.x = cordTop.x + sw; bulb.light.position.x = sw;
      const dark = t >= DARK_FROM && t < DARK_TO;
      const flick = t >= DARK_TO && t < DARK_TO + 0.4 ? (Math.floor((t - DARK_TO) * 22) % 3 === 0 ? 0.15 : 1) : 1;
      const on = dark ? 0 : flick;
      bulb.light.intensity = 5.5 * on; (bulb.glass as THREE.MeshStandardMaterial).emissiveIntensity = 6 * on;
      if (!moved && t >= DARK_FROM + 0.4) { moved = true; setMan(NEW); man.rotation.y = Math.atan2(0 - NEW[0], 2.25 - NEW[1]); dust.visible = scuff.visible = true; }
    });

    // 配管・棚・水たまり
    const pipe = M.pbr("rusty_metal_02", { tile: 0.6 });
    for (const [z, r] of [[-3.0, 0.06], [-2.8, 0.04]] as const) { const p = kit.cyl(r, r, 5, pipe, [0, H - 0.2 - r, z], { cast: true }); p.rotation.z = Math.PI / 2; p.position.y = H - 0.18; }
    const p2 = kit.cyl(0.05, 0.05, 6.5, pipe, [2.3, H - 0.2, 0]); p2.rotation.x = Math.PI / 2; p2.position.y = H - 0.25;
    const shelf = place(kit, [-2.25, 0, 1.2]);
    const steel = M.plain(0x5a5c5e, 0.5, 0.8);
    for (const y of [0.1, 0.7, 1.3, 1.9]) kit.box(0.45, 0.03, 1.4, steel, [0, y, 0], { parent: shelf });
    for (const [x, z] of [[-0.2, -0.68], [0.2, -0.68], [-0.2, 0.68], [0.2, 0.68]]) kit.box(0.03, 1.95, 0.03, steel, [x, 0, z], { parent: shelf });
    const card = M.plain(0x8a6e4c, 0.9);
    [[0.13, -0.3, 0.35], [0.13, 0.3, 0.3], [0.73, 0.1, 0.4], [1.33, -0.4, 0.25], [1.33, 0.2, 0.35]].forEach(([y, z, s]) => kit.box(0.38, s, 0.4, card, [0, y, z], { parent: shelf }));
    kit.collider(-2.5, 0.45, -2.0, 1.95);
    const puddle = kit.mesh(new THREE.CircleGeometry(0.45, 32), M.plain(0x0a0a0a, 0.04, 0.2, { transparent: true, opacity: 0.75 }), [-1.8, 0.003, 2.4], { cast: false });
    puddle.rotation.x = -Math.PI / 2; puddle.scale.set(1.3, 0.8, 1);
    kit.onUpdate((_t, time) => { if (Math.floor(time * 60) % 103 === 0) kit.play("drip", [-1.8, 0.05, 2.4]); });
    kit.hemi(0x1a1a1c, 0x050505, 0.04);
  },
  solution: [{ at: 4.6, moveTo: [1.5, -2.6] }, { at: 5.5, door: 2 }],
  wrongs: [[{ at: 3.5, door: 2 }]],
};
