// 第2室 深夜のオフィス — 鳴っている電話の机の番号の会議室へ
import * as THREE from "three";
import type { DoorSpec, RoomDef, Wall } from "../core/types";
import { nearDoor } from "../core/types";
import { officeChair, place, plant } from "./props";
import { finish, type Plan, type Rng } from "./common";

const DESKS: [number, number][] = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 0.8], [1.5, 0.8]];
const SLOTS: { wall: Wall; at: number }[] = [{ wall: "w", at: -1.8 }, { wall: "w", at: 1.3 }, { wall: "e", at: -1.8 }, { wall: "e", at: 1.3 }];
const RING_START = 0.5, RING_LEN = 0.8;
export const ringingAt = (t: number, every = 3) => t >= RING_START && (t - RING_START) % every < RING_LEN;

export function officeRoom(r: Rng, p: Plan): RoomDef<{}> {
  // lv が上がると、机の番号・島の番号・会議室の並びがばらばらになり、ベルの間隔が空く
  const deskNo = p.lv >= 1 ? r.shuffle([1, 2, 3, 4]) : [1, 2, 3, 4];
  const isleNo = p.lv >= 1 ? r.shuffle([1, 2, 3, 4]) : deskNo;
  const roomNo = p.lv >= 1 ? r.shuffle([1, 2, 3, 4]) : [1, 2, 3, 4];
  const ringing = r.int(0, 3);
  const screen = r.int(0, 3);
  const every = 3 + Math.min(3, p.lv) * 0.5;
  const doors: DoorSpec[] = SLOTS.map((d, i) => ({ ...d, label: `会議室 ${roomNo[i]}`, style: "office" }));
  const num = deskNo[ringing];
  const answer = roomNo.indexOf(num);
  const shell = officeShell;
  const lock: DoorSpec = { wall: "n", at: r.pick([-1.5, 1.5]), label: "倉庫", style: "office" };
  return finish({
    id: "office", kind: "sound", name: "深夜のオフィス", limit: 20 + Math.min(2, p.lv), shell, doors, answer,
    spec: { deskNo, isleNo, roomNo, ringing, screen, every },
    logic: {
      init: () => ({}),
      miss: () => `鳴っていたのは 机${num} の電話だった（扉は「会議室 ${num}」）`,
    },
    build(kit) { buildOffice(kit, { deskNo, isleNo, ringing, screen, every }); },
    solution: [{ at: 2.0, moveTo: nearDoor(shell, doors[answer]) }, { at: 4.0, door: answer }],
  }, r, p, {
    lock, earliest: 0,
    hint: `鳴っているのは 机${num} の電話`,
    items: () => [
      ...DESKS.map(([x, z]): { pos: [number, number, number]; reach: [number, number] } => ({ pos: [x - 0.58, 0.762, z + 0.16], reach: [x - 0.58, z + 0.75] })),
      { pos: [-3.25, 1.112, 0.25], reach: [-2.6, 0.25] },
      { pos: [3.15, 1.022, -0.25], reach: [2.5, -0.25] },
    ],
    darks: [
      { pos: [-3.492, 0.42, -3.0], rotY: Math.PI / 2, reach: [-2.7, -3.0] },
      { pos: [3.492, 0.42, -3.0], rotY: -Math.PI / 2, reach: [2.7, -3.0] },
      { pos: [3.492, 0.42, 2.4], rotY: -Math.PI / 2, reach: [2.7, 2.4] },
    ],
  });
}

const officeShell: RoomDef["shell"] = {
  w: 7, d: 7.6, h: 2.7,
  floor: "dirty_carpet", floorTile: 1.0, floorColor: 0x7c8590, wall: "painted_plaster_wall", wallTile: 2.2, ceiling: "ceiling_interior", ceilingTile: 1.2,
  entryStyle: "office", footstep: "carpet", tone: "office", reverb: 1.1,
  fog: { color: 0x040507, density: 0.07 }, env: 0.14, exposure: 0.82,
};

function buildOffice(kit: Parameters<RoomDef["build"]>[0], o: { deskNo: number[]; isleNo: number[]; ringing: number; screen: number; every: number }) {
  const RINGING = o.ringing;
    const M = kit.mats, H = kit.H;
    const deskTop = M.pbr("white_oak_veneer", { tile: 1.2, color: 0xd8d2c4 });
    const metal = M.plain(0x9a9da0, 0.4, 0.8), black = M.plain(0x111214, 0.35, 0.2), plastic = M.plain(0xd9d6cc, 0.5);
    DESKS.forEach(([x, z], i) => {
      const g = place(kit, [x, 0, z]);
      kit.box(1.5, 0.035, 0.75, deskTop, [0, 0.72, 0], { parent: g });
      kit.box(0.04, 0.72, 0.7, metal, [-0.72, 0, 0], { parent: g }); kit.box(0.04, 0.72, 0.7, metal, [0.72, 0, 0], { parent: g });
      kit.box(1.4, 0.4, 0.02, metal, [0, 0.3, -0.33], { parent: g });
      kit.box(0.4, 0.6, 0.6, M.plain(0x8c8f92, 0.45, 0.6), [0.5, 0, -0.02], { parent: g });
      // モニター（机2だけ点いている）
      kit.box(0.2, 0.02, 0.16, black, [-0.15, 0.755, -0.2], { parent: g });
      kit.box(0.04, 0.22, 0.03, black, [-0.15, 0.775, -0.23], { parent: g });
      const screenOn = i === o.screen;
      kit.box(0.6, 0.36, 0.035, black, [-0.15, 0.93, -0.22], { parent: g });
      const scr = kit.mesh(new THREE.PlaneGeometry(0.56, 0.32), screenOn ? M.glow(0x7fa8d8, 1.4) : M.plain(0x050607, 0.12, 0.3), [-0.15, 1.11, -0.2], { parent: g, cast: false });
      scr.position.z = -0.2 + 0.018;
      if (screenOn) { kit.point([x - 0.15, 1.1, z + 0.1], { color: 0x8ab4ff, intensity: 0.8, distance: 2.5 }); kit.sound("screen", [x - 0.15, 1.1, z - 0.2]); }
      kit.box(0.44, 0.02, 0.15, plastic, [-0.15, 0.755, 0.12], { parent: g });
      // 書類
      for (let p = 0; p < 4; p++) { const s = kit.box(0.21, 0.004, 0.297, M.plain(0xe9e6dc, 0.9), [0.28 + p * 0.01, 0.755 + p * 0.004, 0.15], { parent: g, cast: false }); s.rotation.y = p * 0.15 - 0.1; }
      // 電話
      const phone = place(kit, [x + 0.48, 0.755, z - 0.18]);
      kit.box(0.2, 0.06, 0.22, M.plain(0x2a2b2d, 0.4), [0, 0, 0], { parent: phone });
      const hs = kit.box(0.2, 0.04, 0.05, M.plain(0x1d1e20, 0.35), [0, 0.06, -0.06], { parent: phone }); hs.rotation.x = 0.1;
      const led = kit.sphere(0.008, i === RINGING ? M.glow(0xff2a20, 0) : M.plain(0x401010, 0.4), [0.07, 0.065, 0.08], { parent: phone, cast: false });
      if (i === RINGING) {
        const mat = led.material as THREE.MeshStandardMaterial;
        const pos: [number, number, number] = [x + 0.48, 0.85, z - 0.18];
        const glow = kit.point([x + 0.48, 0.9, z - 0.1], { color: 0xff3020, intensity: 0, distance: 1.2 });
        let was = false;
        kit.onUpdate(t => {
          const on = ringingAt(t, o.every);
          if (on && !was) kit.play("ring", pos);
          was = on;
          const blink = on && Math.floor(t * 10) % 2 === 0;
          mat.emissiveIntensity = blink ? 6 : 0; glow.intensity = blink ? 0.25 : 0;
          hs.position.y = 0.06 + (on ? Math.sin(t * 90) * 0.002 : 0);
        });
      }
      // 机の番号札（通路側から読める）
      kit.box(0.2, 0.2, 0.012, M.plain(0x0e0f10, 0.2, 0.1, { transparent: true, opacity: 0.85 }), [0.55, 0.755, 0.33], { parent: g, cast: false });
      kit.sign({ w: 0.16, h: 0.16, lines: [String(o.deskNo[i])], bg: "#f4f4f0", fg: "#151515", font: "gothic", style: "plate", size: 0.9 }, [0.55, 0.855, 0.337], 0, g);
      // 天井から吊るした島番号
      kit.cyl(0.003, 0.003, 0.45, metal, [0, H - 0.45, 0], { parent: g, cast: false });
      kit.sign({ w: 0.36, h: 0.22, lines: [`島 ${o.isleNo[i]}`], bg: "#2a2d33", fg: "#e9e9e4", font: "gothic", style: "plate", size: 0.62 }, [0, H - 0.56, 0.005], 0, g);
      officeChair(kit, [x - 0.15, 0, z + 0.62], Math.PI + (i - 1.5) * 0.25);
      kit.collider(x - 0.77, z - 0.4, x + 0.77, z + 0.4);
    });

    // ホワイトボードの指示
    const wb = place(kit, [0, 1.45, -3.79]);
    kit.box(1.6, 1.02, 0.04, M.plain(0x9ea2a6, 0.3, 0.9), [0, -0.51, 0], { parent: wb });
    kit.sign({ w: 1.54, h: 0.96, lines: ["鳴っている電話の", "机の番号の", "会議室へ"], bg: "#f2f4f3", fg: "#1d2e6b", font: "hand", style: "whiteboard", size: 0.22, rough: 0.25 }, [0, 0, 0.022], 0, wb);
    kit.box(0.8, 0.03, 0.06, M.plain(0x9ea2a6, 0.3, 0.9), [0, -0.53, 0.04], { parent: wb });

    // 北の窓（夜景）とブラインド
    for (const wx of [-2.75, 2.75]) {
      const win = place(kit, [wx, 0.9, -3.79]);
      const city = M.canvas(256, 320, (g, W, Hh) => {
        const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, "#0b1424"); gr.addColorStop(1, "#1d2236"); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
        let s = wx > 0 ? 3 : 8; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let b = 0; b < 7; b++) { const bx = r() * W, bw = 30 + r() * 50, bh = 80 + r() * 200; g.fillStyle = "#070a12"; g.fillRect(bx, Hh - bh, bw, bh); for (let k = 0; k < 30; k++) if (r() < 0.35) { g.fillStyle = r() < 0.7 ? "#e8c27a" : "#9fc0e8"; g.fillRect(bx + 4 + (k % 5) * (bw / 5), Hh - bh + 8 + Math.floor(k / 5) * 14, 4, 6); } }
      });
      const cityMat = M.track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: city, emissiveIntensity: 0.55 }));
      kit.mesh(new THREE.PlaneGeometry(1.1, 1.4), cityMat, [0, 0.7, -0.02], { parent: win, cast: false });
      const frame = M.plain(0x2b2d30, 0.4, 0.7);
      kit.box(1.2, 0.05, 0.08, frame, [0, -0.02, 0], { parent: win }); kit.box(1.2, 0.05, 0.08, frame, [0, 1.4, 0], { parent: win });
      kit.box(0.05, 1.45, 0.08, frame, [-0.58, 0, 0], { parent: win }); kit.box(0.05, 1.45, 0.08, frame, [0.58, 0, 0], { parent: win });
      const slat = M.plain(0xc9c6bc, 0.5);
      for (let i = 0; i < 11; i++) { const s = kit.box(1.12, 0.004, 0.05, slat, [0, 0.75 + i * 0.06, 0.05], { parent: win, cast: false }); s.rotation.x = 0.9; }
      kit.spot([wx, 2.0, -3.4], { color: 0x6f86b8, intensity: 3, angle: 0.8, target: [wx, 0, -1.8], distance: 5 });
    }

    // 棚・コピー機・観葉植物
    const cab = M.plain(0x8e9194, 0.45, 0.6);
    for (const z of [-0.2, 0.25]) { kit.box(0.45, 1.1, 0.42, cab, [-3.25, 0, z], { collide: true }); kit.box(0.3, 0.02, 0.02, metal, [-3.02, 0.95, z], {}); }
    kit.box(0.6, 0.95, 0.55, M.plain(0xd5d3cc, 0.5), [3.15, 0, -0.25], { collide: true });
    kit.box(0.6, 0.06, 0.55, M.plain(0x2b2c2e, 0.4), [3.15, 0.95, -0.25], {});
    plant(kit, [-3.1, 0, 3.3]); plant(kit, [3.1, 0, 3.3], 1.1);

    // 天井の照明：机1の上は点灯、机2の上は消灯、机3の上はちらつき、机4の上は点灯
    kit.fluorescent(-1.5, -1.5, { shadow: true });
    kit.fluorescent(1.5, -1.5, { on: false });
    kit.fluorescent(-1.5, 0.8, { flicker: 5 });
    kit.fluorescent(1.5, 0.8, { shadow: true, intensity: 4.5 });
    // 非常口の灯り（入口の上）
    kit.box(0.36, 0.14, 0.05, M.glow(0x3cff7a, 1.6), [0, 2.32, 3.77], { cast: false });
    kit.sign({ w: 0.3, h: 0.1, lines: ["非常口"], bg: "#1fbf5a", fg: "#ffffff", font: "gothic", style: "plate", size: 0.8, emissive: 1.2 }, [0, 2.39, 3.74], Math.PI);
    kit.point([0, 2.2, 3.5], { color: 0x3cff7a, intensity: 0.4, distance: 2.5 });
    kit.hemi(0x2a3340, 0x0a0a0a, 0.05);
}
