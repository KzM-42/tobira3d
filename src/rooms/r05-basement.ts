// 第5室 地下倉庫 — 灯が消えている間に動いたものの扉へ
import * as THREE from "three";
import type { DoorSpec, RoomDef } from "../core/types";
import { nearDoor } from "../core/types";
import { mannequin, place, woodChair } from "./props";
import type { Plan, Rng } from "./common";

type P2 = [number, number];
/** 動きうる物：元の位置と、動いた先（lv0 の時の距離） */
const THINGS = [
  { id: "chair", label: "イス", from: [-1.55, -1.25] as P2, to: [-0.5, -0.35] as P2 },
  { id: "crate", label: "ハコ", from: [1.6, 0.35] as P2, to: [0.85, -0.95] as P2 },
  { id: "doll", label: "ニンギョウ", from: [1.35, -1.9] as P2, to: [-0.55, -0.7] as P2 },
] as const;

export function basementRoom(r: Rng, p: Plan): RoomDef<{}> {
  // lv が上がると、札の並びが入れ替わり、動く距離が縮み、引きずった跡・埃の跡が消える
  const darkFrom = 2.0 + r.int(0, 3) * 0.5, darkTo = darkFrom + 1.5;
  const order = p.lv >= 1 ? r.shuffle([0, 1, 2]) : [0, 1, 2];
  const mover = r.int(0, 2);
  const dist = p.lv >= 2 ? 0.55 : p.lv >= 1 ? 0.75 : 1;
  const marks = { scuff: p.lv < 1, dust: p.lv < 3 };
  const t = THINGS[mover];
  const to: P2 = [t.from[0] + (t.to[0] - t.from[0]) * dist, t.from[1] + (t.to[1] - t.from[1]) * dist];
  const doors: DoorSpec[] = [-1.5, 0, 1.5].map((at, i) => ({ wall: "n", at, label: THINGS[order[i]].label, style: "metal" }));
  const answer = order.indexOf(mover);
  const shell = basementShell;
  return {
    id: "basement", kind: "blackout", name: "地下倉庫", limit: 25, shell, doors, answer,
    spec: { darkFrom, order, mover, to, marks },
    logic: {
      init: () => ({}),
      check: (_s, c) => (c.t < darkTo ? "明かりが戻る前に 扉をくぐった" : null),
      miss: () => `暗い間に動いたのは「${t.label}」だった`,
    },
    build(kit) { buildBasement(kit, { darkFrom, darkTo, mover, to, marks }); },
    solution: [{ at: darkTo + 0.6, moveTo: nearDoor(shell, doors[answer]) }, { at: darkTo + 1.5, door: answer }],
    wrongs: [[{ at: darkTo - 0.5, door: answer }]],
  };
}

const basementShell: RoomDef["shell"] = {
  w: 5, d: 6.5, h: 2.4,
  floor: "concrete_floor_worn_001", floorTile: 2, floorColor: 0x8c867a, wall: "concrete_wall_006", wallTile: 2.2, ceiling: "concrete_wall_006", ceilingTile: 2.5,
  entryStyle: "metal", footstep: "concrete", tone: "basement", reverb: 1.6,
  fog: { color: 0x040404, density: 0.11 }, env: 0.1, exposure: 1.15,
};

function buildBasement(kit: Parameters<RoomDef["build"]>[0], o: { darkFrom: number; darkTo: number; mover: number; to: P2; marks: { scuff: boolean; dust: boolean } }) {
  const DARK_FROM = o.darkFrom, DARK_TO = o.darkTo;
  const OLD = THINGS[o.mover].from, NEW = o.to;
    const M = kit.mats, H = kit.H;
    // 中央の柱と吹き付けの指示
    kit.box(0.42, H, 0.42, M.pbr("concrete_wall_006", { tile: 1.2, color: 0x9a968c }), [0, 0, 0.75], { collide: true });
    kit.sign({ w: 0.4, h: 0.62, lines: ["灯が", "消えて", "戻ったら", "動いたものの", "扉へ"], fg: "#f1ead8", font: "stencil", style: "spray", size: 0.17, transparent: true }, [0, 1.35, 0.962], 0);

    // 椅子・木箱・マネキン（動く1つは、当たり判定ごと動かす）
    const crate = M.pbr("white_oak_veneer", { tile: 0.5, color: 0x8a6a48 });
    const make: Record<string, (x: number, z: number) => { g: THREE.Object3D; r: number }> = {
      chair: (x, z) => { const g = woodChair(kit, [x, 0, z], 0.4); kit.colliders.pop(); return { g, r: 0.26 }; },
      crate: (x, z) => {
        const g = place(kit, [x, 0, z]);
        kit.box(0.7, 0.62, 0.6, crate, [0, 0, 0], { parent: g, rotY: -0.15 });
        kit.box(0.5, 0.42, 0.45, crate, [0.02, 0.62, -0.01], { parent: g, rotY: 0.2 });
        return { g, r: 0.38 };
      },
      doll: (x, z) => ({ g: mannequin(kit, [x, 0, z], -Math.PI / 2), r: 0.22 }),
    };
    let man!: THREE.Object3D;
    let setMan!: (p: P2) => void;
    THINGS.forEach((t, i) => {
      const { g, r } = make[t.id](t.from[0], t.from[1]);
      const box = { x0: 0, z0: 0, x1: 0, z1: 0 }; kit.colliders.push(box);
      const set = (p: P2) => { g.position.set(p[0], 0, p[1]); Object.assign(box, { x0: p[0] - r, z0: p[1] - r, x1: p[0] + r, z1: p[1] + r }); };
      set(t.from);
      if (i === o.mover) { man = g; setMan = set; }
    });
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
    const showDust = o.marks.dust, showScuff = o.marks.scuff;

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
      if (!moved && t >= DARK_FROM + 0.4) {
        moved = true; setMan(NEW);
        if (o.mover === 2) man.rotation.y = Math.atan2(0 - NEW[0], 2.25 - NEW[1]); else man.rotation.y += 0.5;
        dust.visible = showDust; scuff.visible = showScuff;
      }
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
}
