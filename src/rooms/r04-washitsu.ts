// 第4室 月見の座敷 — 赤い物の数の襖を開けよ
import * as THREE from "three";
import type { DoorSpec, RoomDef } from "../core/types";
import { nearDoor } from "../core/types";
import { place } from "./props";
import { kanji, type Plan, type Rng } from "./common";

const RED = 0xa3161a; // 漆の朱。部屋の中で赤はこれだけ
/** 赤くなりうる物（赤でない時の色） */
const THINGS = [
  { id: "daruma", name: "だるま", other: 0xe8e0d0 },
  { id: "bowl", name: "椀", other: 0x141010 },
  { id: "pot", name: "急須", other: 0x3d5a3a },
  { id: "cushionC", name: "座布団", other: 0x1f2a48 },
  { id: "cushionL", name: "座布団", other: 0x1f2a48 },
  { id: "cushionR", name: "座布団", other: 0x1f2a48 },
  { id: "umbrella", name: "屏風の裏の傘", other: 0x2b3a55 },
] as const;
type Thing = (typeof THINGS)[number]["id"];

export function washitsuRoom(r: Rng, p: Plan): RoomDef<{}> {
  // 赤い物の数 N。lv が上がると数が増え、屏風の裏の傘が赤いことが多く、選択肢が隣り合う
  const n = r.int(2, p.lv >= 2 ? 6 : 5);
  const pool = r.shuffle(THINGS.map(t => t.id));
  if (p.lv >= 1 && r.chance(0.7) && !pool.slice(0, n).includes("umbrella")) { pool.splice(pool.indexOf("umbrella"), 1); pool.unshift("umbrella"); }
  const red = new Set<Thing>(pool.slice(0, n));
  const near = [n - 1, n + 1].filter(v => v >= 1 && v <= 9), far = [n - 2, n + 2, n + 3].filter(v => v >= 1 && v <= 9);
  const others = p.lv >= 1 && near.length === 2 ? near : r.shuffle([...near, ...far]).slice(0, 2);
  const labels = r.shuffle([n, ...others]);
  const doors: DoorSpec[] = [-1.6, 0, 1.6].map((at, i) => ({ wall: "w", at, label: kanji(labels[i]), style: "fusuma" }));
  const answer = labels.indexOf(n);
  const cushions = ["cushionC", "cushionL", "cushionR"].filter(c => red.has(c as Thing)).length;
  const names = [...THINGS.filter(t => red.has(t.id) && !t.id.startsWith("cushion")).map(t => t.name), ...(cushions ? [`座布団${cushions > 1 ? cushions + "枚" : ""}`] : [])];
  const colors = Object.fromEntries(THINGS.map(t => [t.id, red.has(t.id) ? RED : t.other])) as Record<Thing, number>;
  const shell = washitsuShell;
  return {
    id: "washitsu", kind: "count", name: "月見の座敷", limit: 25, shell, doors, answer,
    spec: { n, red: [...red].sort(), labels },
    logic: {
      init: () => ({}),
      miss: () => `赤い物は ${n}つ（${names.join("・")}）`,
    },
    build(kit) { buildWashitsu(kit, colors); },
    solution: [{ at: 3.0, moveTo: [1.8, -0.8] }, { at: 6.0, moveTo: nearDoor(shell, doors[answer]) }, { at: 8.0, door: answer }],
  };
}

const washitsuShell: RoomDef["shell"] = {
  w: 5.4, d: 5.4, h: 2.45,
  floor: "tatami", wall: "clay_plaster", wallTile: 1.6, ceiling: "white_oak_veneer", ceilingTile: 1.4,
  entryStyle: "fusuma", footstep: "tatami", tone: "washitsu", reverb: 0.5,
  fog: { color: 0x05070c, density: 0.05 }, env: 0.12, exposure: 1.1,
};

function buildWashitsu(kit: Parameters<RoomDef["build"]>[0], colors: Record<Thing, number>) {
    const M = kit.mats, W = kit.W, D = kit.D, H = kit.H;
    const wood = M.pbr("white_oak_veneer", { tile: 0.8, color: 0xb89a74 });
    const dark = M.pbr("walnut_veneer", { tile: 0.8, color: 0x5a3f2a });
    const mats = new Map<number, THREE.Material>();
    const col = (id: Thing) => { const c = colors[id]; if (!mats.has(c)) mats.set(c, c === RED ? M.plain(RED, 0.32, 0, { envMapIntensity: 1.2 } as any) : M.plain(c, id.startsWith("cushion") ? 0.85 : 0.35)); return mats.get(c)!; };
    // 柱と鴨居
    for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) kit.box(0.12, H, 0.12, wood, [x + Math.sign(-x) * 0.06, 0, z + Math.sign(-z) * 0.06], { cast: false });
    for (const z of [-D / 2 + 0.03, D / 2 - 0.03]) kit.box(W, 0.07, 0.06, wood, [0, 2.24, z], { cast: false });
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) kit.box(0.06, 0.07, D, wood, [x, 2.24, 0], { cast: false });

    // 床の間（北）：掛け軸とだるま
    kit.box(2.0, 0.14, 0.62, dark, [0, 0, -D / 2 + 0.31], { collide: true });
    kit.box(0.1, H, 0.1, M.pbr("walnut_veneer", { tile: 0.5, color: 0x3a2a1c }), [1.05, 0, -D / 2 + 0.6], { collide: true });
    const scroll = place(kit, [-0.15, 1.5, -D / 2 + 0.02]);
    kit.cyl(0.012, 0.012, 0.48, dark, [0, 0.57, 0.01], { parent: scroll }).rotation.z = Math.PI / 2;
    kit.cyl(0.015, 0.015, 0.5, dark, [0, -0.62, 0.012], { parent: scroll }).rotation.z = Math.PI / 2;
    kit.box(0.44, 1.18, 0.006, M.plain(0x6b6040, 0.85), [0, -0.6, 0.003], { parent: scroll, cast: false });
    kit.sign({ w: 0.34, h: 1.0, lines: ["赤き物の数の", "襖を開けよ"], bg: "#efe7d2", fg: "#141008", font: "brush", style: "scroll", size: 0.4, vertical: true }, [0, 0, 0.008], 0, scroll);
    const daruma = place(kit, [0.55, 0.14, -D / 2 + 0.32], 0.15);
    const body = kit.sphere(0.13, col("daruma"), [0, 0.12, 0], { parent: daruma }); body.scale.set(1, 1.05, 0.95);
    const face = kit.mesh(new THREE.CircleGeometry(0.07, 24), M.plain(0xf1e6d0, 0.5), [0, 0.15, 0.124], { parent: daruma, cast: false });
    face.scale.set(1, 0.85, 1);
    kit.sphere(0.012, M.plain(0x101010, 0.3), [-0.025, 0.16, 0.13], { parent: daruma, cast: false });

    // 卓袱台と椀・急須・盆
    const table = place(kit, [0, 0, -0.3]);
    kit.cyl(0.5, 0.5, 0.035, dark, [0, 0.3, 0], { parent: table, seg: 40 });
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) kit.box(0.04, 0.3, 0.04, dark, [x, 0, z], { parent: table });
    kit.lathe([[0, 0], [0.035, 0], [0.06, 0.02], [0.075, 0.07], [0.07, 0.075], [0, 0.03]], col("bowl"), [0.18, 0.335, 0.05], { parent: table });
    kit.lathe([[0, 0], [0.06, 0], [0.075, 0.06], [0.05, 0.11], [0.02, 0.12], [0, 0.12]], col("pot"), [-0.18, 0.335, -0.05], { parent: table });
    kit.box(0.3, 0.015, 0.2, M.plain(0x0d0b09, 0.25), [0.0, 0.335, -0.25], { parent: table, cast: false });
    kit.collider(-0.55, -0.85, 0.55, 0.25);
    // 座布団3枚
    const cushion = (x: number, z: number, m: THREE.Material, rot: number) => kit.box(0.55, 0.07, 0.6, m, [x, 0, z], { rotY: rot });
    cushion(0, 0.55, col("cushionC"), 0.05);
    cushion(-0.85, -0.3, col("cushionL"), Math.PI / 2); cushion(0.85, -0.3, col("cushionR"), Math.PI / 2 + 0.1);

    // 屏風（北東の隅）とその裏の和傘
    const byobu = place(kit, [1.75, 0, -1.75], -Math.PI / 4);
    const gold = M.plain(0xb08a3a, 0.45, 0.65), frameM = M.plain(0x1a1210, 0.4);
    for (let i = 0; i < 4; i++) {
      const p = kit.box(0.5, 1.4, 0.025, gold, [-0.75 + i * 0.5, 0, 0], { parent: byobu });
      p.rotation.y = i % 2 ? 0.25 : -0.25;
      kit.box(0.5, 0.04, 0.03, frameM, [-0.75 + i * 0.5, 1.38, 0], { parent: byobu, cast: false }).rotation.y = p.rotation.y;
    }
    kit.collider(1.0, -2.55, 2.55, -1.0);
    const umb = place(kit, [2.42, 0, -2.42], 0.6);
    kit.cyl(0.012, 0.012, 1.55, wood, [0, 0, 0], { parent: umb });
    const canopy = kit.mesh(new THREE.ConeGeometry(0.11, 1.0, 16, 1, true), col("umbrella"), [0, 1.0, 0], { parent: umb });
    canopy.rotation.x = Math.PI;
    kit.sphere(0.03, col("umbrella"), [0, 1.52, 0], { parent: umb });
    umb.rotation.z = 0.12;

    // 箪笥（南西）と行灯（北西）
    const tansu = kit.box(0.9, 1.0, 0.45, dark, [-1.95, 0, D / 2 - 0.25], { collide: true });
    tansu.castShadow = true;
    for (let r = 0; r < 3; r++) kit.box(0.08, 0.02, 0.02, M.plain(0x2a2a2a, 0.3, 0.8), [-1.95, 0.22 + r * 0.3, D / 2 - 0.47], {});
    const andon = place(kit, [-2.05, 0, -2.05]);
    kit.box(0.3, 0.04, 0.3, dark, [0, 0, 0], { parent: andon });
    for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) kit.box(0.025, 0.7, 0.025, dark, [x, 0.04, z], { parent: andon });
    kit.box(0.24, 0.42, 0.24, M.glow(0xffc27a, 1.5), [0, 0.22, 0], { parent: andon, cast: false });
    const andonLight = kit.point([-2.05, 0.45, -2.05], { color: 0xffb46a, intensity: 2.6, distance: 6, shadow: true });
    kit.collider(-2.25, -2.25, -1.85, -1.85);
    kit.onUpdate((_t, time) => { andonLight.intensity = 2.6 * (0.93 + 0.07 * Math.sin(time * 7.3) * Math.sin(time * 3.1)); });

    // 障子窓（東）と月明かり
    const shoji = place(kit, [W / 2 - 0.01, 0.75, 0], -Math.PI / 2);
    kit.mesh(new THREE.PlaneGeometry(2.4, 1.3), M.glow(0xc8d4ff, 0.55), [0, 0.65, 0], { parent: shoji, cast: false, receive: false });
    for (let i = 0; i <= 8; i++) kit.box(0.025, 1.3, 0.03, wood, [-1.2 + i * 0.3, 0, 0.02], { parent: shoji });
    for (let j = 0; j <= 4; j++) kit.box(2.4, 0.025, 0.03, wood, [0, j * 0.325 - 0.0125, 0.02], { parent: shoji });
    kit.spot([W / 2 + 0.6, 2.3, 0.3], { color: 0x9fb4ff, intensity: 26, angle: 0.75, penumbra: 0.6, distance: 9, shadow: true, target: [-0.5, 0, 0.3] });
    kit.at(0.8, () => kit.play("cricket", [W / 2 + 1, 0.3, 1]));
    kit.onUpdate((_t, time) => { if (Math.floor(time * 60) % 157 === 0) kit.play("cricket", [W / 2 + 1.5, 0.3, -1 + Math.sin(time) * 2]); });

    // 吊り下げの照明（消えている）
    kit.cyl(0.003, 0.003, 0.4, M.plain(0x111111), [0.9, H - 0.4, 0.9], { cast: false });
    kit.cyl(0.18, 0.18, 0.26, M.plain(0xd8cfb8, 0.9), [0.9, H - 0.66, 0.9], { cast: false });
    kit.hemi(0x2a3348, 0x0b0805, 0.07);
}
