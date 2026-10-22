// 第3室 夜間外来の待合室 — 呼び出しまで動くな。呼ばれた診察室へ
import * as THREE from "three";
import type { DoorSpec, RoomDef } from "../core/types";
import { nearDoor } from "../core/types";
import { place, plant } from "./props";
import { sample, type Plan, type Rng } from "./common";

const MOVE_LIMIT = 0.25;         // これ以上スタート地点から離れたら「動いた」

export function hospitalRoom(r: Rng, p: Plan): RoomDef<{ moved: boolean }> {
  // 呼び出しの時刻は lv とともに遅くなる。lv2 からは途中で「お待ちください」が出る（呼び出しではない）
  const callAt = 3.5 + r.int(0, 2 + Math.min(4, p.lv)) * 0.5;
  const nums = p.lv >= 1 ? sample(r, [1, 2, 3, 4, 5, 6, 7, 8, 9], 3).sort((a, b) => a - b) : [1, 2, 3];
  const answer = r.int(0, 2);
  const decoyAt = p.lv >= 2 ? Math.round(callAt * 0.5 * 10) / 10 : null;
  const doors: DoorSpec[] = [-1.85, 0, 1.85].map((at, i) => ({ wall: "n", at, label: `診察室 ${nums[i]}`, style: "hospital" }));
  const label = doors[answer].label!;
  const shell = hospitalShell;
  const wrongs = [
    [{ at: 1.0, moveTo: [0.6, 2.5] as [number, number] }, { at: callAt + 1.5, door: answer }],
    [{ at: callAt - 0.8, door: answer }],
  ];
  if (decoyAt != null) wrongs.push([{ at: decoyAt + 0.3, moveTo: nearDoor(shell, doors[answer]) }, { at: callAt + 1.0, door: answer }]);
  return {
    id: "hospital", kind: "wait", name: "夜間外来の待合室", limit: 20, shell, doors, answer,
    spec: { callAt, nums, called: answer, decoyAt },
    logic: {
      init: () => ({ moved: false }),
      update(s, c) {
        if (c.t < callAt && Math.hypot(c.px - c.sx, c.pz - c.sz) > MOVE_LIMIT) s.moved = true;
      },
      check(s, c) {
        if (s.moved || c.t < callAt) return "呼び出しの前に 動いてしまった";
        return null;
      },
      miss: () => `呼ばれたのは「${label}」だった`,
    },
    build(kit) { buildHospital(kit, { callAt, label, decoyAt }); },
    solution: [{ at: callAt + 0.6, moveTo: nearDoor(shell, doors[answer], 1.0) }, { at: callAt + 1.5, door: answer }],
    wrongs,
  };
}

const hospitalShell: RoomDef["shell"] = {
  w: 6, d: 7, h: 2.6,
  floor: "old_linoleum_flooring_01", floorTile: 1.6, floorColor: 0x8a9a94, wall: "painted_plaster_wall", wallTile: 2, ceiling: "ceiling_interior", ceilingTile: 1.2,
  wainscot: { mat: "long_white_tiles", h: 1.2 },
  entryStyle: "hospital", footstep: "linoleum", tone: "hospital", reverb: 1.3,
  fog: { color: 0x040606, density: 0.065 }, env: 0.18, exposure: 0.8,
};

function buildHospital(kit: Parameters<RoomDef["build"]>[0], o: { callAt: number; label: string; decoyAt: number | null }) {
  const CALL_AT = o.callAt;
    const M = kit.mats, H = kit.H;
    // 天井から吊るした注意書き（入ってすぐ正面）
    const hang = place(kit, [-1.25, H, 0.9]);
    const wire = M.plain(0x888888, 0.4, 0.9);
    for (const x of [-0.5, 0.5]) kit.cyl(0.002, 0.002, 0.3, wire, [x, -0.3, 0], { parent: hang, cast: false });
    kit.box(1.24, 0.5, 0.025, M.plain(0xd9d6cc, 0.6), [0, -0.8, 0], { parent: hang });
    kit.sign({ w: 1.2, h: 0.46, lines: ["お呼び出しまで", "その場から", "動かないでください"], bg: "#efede6", fg: "#16416e", font: "gothic", style: "plate", size: 0.27 }, [0, -0.55, 0.014], 0, hang);
    kit.sign({ w: 1.2, h: 0.46, lines: ["院内では お静かに"], bg: "#efede6", fg: "#16416e", font: "gothic", style: "plate", size: 0.34 }, [0, -0.55, -0.014], Math.PI, hang);

    // 呼び出し表示板
    const board = place(kit, [1.25, H, -0.6]);
    for (const x of [-0.45, 0.45]) kit.cyl(0.002, 0.002, 0.38, wire, [x, -0.38, 0], { parent: board, cast: false });
    kit.box(1.1, 0.34, 0.08, M.plain(0x1a1b1d, 0.35, 0.3), [0, -0.72, 0], { parent: board });
    kit.sign({ w: 1.0, h: 0.08, lines: ["お呼び出し"], bg: "#1a1b1d", fg: "#9aa0a6", font: "gothic", style: "plate", size: 0.8 }, [0, -0.44, 0.041], 0, board);
    const idle = kit.sign({ w: 1.0, h: 0.2, lines: ["－　－　－"], bg: "#060606", fg: "#3a0c08", font: "gothic", style: "led", size: 0.7, emissive: 0.5 }, [0, -0.6, 0.041], 0, board);
    const call = kit.sign({ w: 1.0, h: 0.2, lines: [o.label], bg: "#060606", fg: "#ff5a36", font: "gothic", style: "led", size: 0.72, emissive: 1.6 }, [0, -0.6, 0.041], 0, board);
    call.visible = false;
    const wait = kit.sign({ w: 1.0, h: 0.2, lines: ["しばらくお待ちください"], bg: "#060606", fg: "#ffb04a", font: "gothic", style: "led", size: 0.5, emissive: 1.2 }, [0, -0.6, 0.041], 0, board);
    wait.visible = false;
    const decoyAt = o.decoyAt ?? Infinity;
    const boardLight = kit.point([1.25, H - 0.75, -0.4], { color: 0xff5a36, intensity: 0, distance: 2.2 });
    kit.at(CALL_AT, () => { kit.play("chime", [1.25, H - 0.6, -0.6]); });
    kit.onUpdate(t => { const on = t >= CALL_AT, w = !on && t >= decoyAt; call.visible = on; wait.visible = w; idle.visible = !on && !w; boardLight.intensity = on ? 0.6 : 0; });

    // 待合の長椅子
    const vinyl = M.plain(0x2e4a63, 0.45), steel = M.plain(0xa6a9ac, 0.3, 0.9);
    const bench = (x: number, z: number) => {
      const g = place(kit, [x, 0, z]);
      for (const bx of [-0.7, 0.7]) { kit.box(0.04, 0.42, 0.4, steel, [bx, 0, 0], { parent: g }); }
      kit.box(1.6, 0.04, 0.05, steel, [0, 0.36, 0.18], { parent: g });
      for (let i = 0; i < 3; i++) {
        kit.box(0.5, 0.07, 0.42, vinyl, [-0.54 + i * 0.54, 0.42, 0], { parent: g });
        const back = kit.box(0.5, 0.42, 0.06, vinyl, [-0.54 + i * 0.54, 0.5, 0.22], { parent: g }); back.rotation.x = -0.12;
      }
      kit.collider(x - 0.85, z - 0.25, x + 0.85, z + 0.3);
    };
    bench(-1.65, 0.0); bench(1.65, 0.0); bench(-1.65, -0.95); bench(1.65, -0.95);

    // 受付（西側）
    const desk = M.pbr("white_oak_veneer", { tile: 1, color: 0xcfc6b2 });
    kit.box(0.6, 1.05, 2.0, desk, [-2.7, 0, 2.2], { collide: true });
    kit.box(0.7, 0.04, 2.1, M.plain(0xe8e6e0, 0.35), [-2.65, 1.05, 2.2], {});
    kit.sign({ w: 0.5, h: 0.16, lines: ["受　付"], bg: "#2c5d8a", fg: "#ffffff", font: "gothic", style: "plate", size: 0.7 }, [-2.39, 0.8, 2.2], Math.PI / 2);
    const glass = M.plain(0x9ab0b8, 0.05, 0, { transparent: true, opacity: 0.18 });
    kit.box(0.02, 0.8, 2.0, glass, [-2.42, 1.09, 2.2], { cast: false });
    // 自販機（東側）
    const vend = place(kit, [2.62, 0, 2.3], -Math.PI / 2);
    kit.box(0.9, 1.8, 0.7, M.plain(0xd9dde0, 0.35, 0.3), [0, 0, 0], { parent: vend });
    kit.mesh(new THREE.PlaneGeometry(0.7, 0.9), M.glow(0xdfe9ff, 0.9), [0, 1.2, 0.351], { parent: vend, cast: false });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) kit.box(0.08, 0.18, 0.06, M.plain([0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xecf0f1][c], 0.4), [-0.28 + c * 0.14, 0.82 + r * 0.29, 0.3], { parent: vend, cast: false });
    kit.point([2.0, 1.3, 2.3], { color: 0xdfe9ff, intensity: 1.2, distance: 3 });
    kit.sound("fridge", [2.6, 0.5, 2.3]);
    kit.collider(2.2, 1.8, 3, 2.8);
    plant(kit, [2.6, 0, -2.9], 1.1); plant(kit, [-2.6, 0, -2.9], 1.1);
    // 掲示板のポスター
    const poster = (x: number, lines: string[], col: string) => kit.sign({ w: 0.42, h: 0.56, lines, bg: "#f7f5ef", fg: col, font: "gothic", style: "paper", size: 0.16 }, [x, 1.55, -3.48], 0);
    poster(-0.93, ["手洗い", "うがい", "マスク"], "#1f6b3a");
    poster(0.93, ["夜間は", "救急外来", "のみ"], "#8a1f1f");

    // 照明：北側2枚は点灯、南東はちらつき、南西は点灯
    kit.fluorescent(-1.4, -1.3, { shadow: true });
    kit.fluorescent(1.4, -1.3, { on: false });
    kit.fluorescent(1.4, 1.6, { flicker: 7 });
    kit.fluorescent(-1.4, 1.6, { intensity: 4, shadow: true });
    kit.box(0.36, 0.14, 0.05, M.glow(0x3cff7a, 1.6), [0, 2.32, 3.47], { cast: false });
    kit.point([0, 2.2, 3.2], { color: 0x3cff7a, intensity: 0.4, distance: 2.5 });
    kit.hemi(0x324046, 0x0b0b0b, 0.06);
}
