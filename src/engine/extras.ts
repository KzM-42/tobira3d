// 小物まわりの見た目：落ちている小物・鍵の扉の錠前・暗がりとその文字・懐中電灯の光。
// どの部屋でも同じ作り方なので、部屋データ（build）には書かない。
import * as THREE from "three";
import type { ItemKind, ItemSpot, RoomDef } from "../core/types";
import { DOOR_W, type Kit } from "./kit";

/** 調べやすいように、小物より一回り大きい見えない当たり */
const HIT_R = 0.17;

export class Extras {
  private itemGroup = new THREE.Group();
  private chalk: THREE.Mesh | null = null;
  private lock: THREE.Group | null = null;
  private beam: THREE.SpotLight | null = null;
  private beamT = 0;

  constructor(private kit: Kit, private def: RoomDef) {
    kit.group.add(this.itemGroup);
    if (def.dark) this.buildDark();
    if (def.locked != null) this.buildLock(def.locked);
  }

  /** 落ちている小物を作り直す（拾う・持ち替えるたび） */
  setItems(items: (ItemSpot | null)[]) {
    const kit = this.kit;
    kit.interactables.splice(0, kit.interactables.length, ...kit.interactables.filter(i => !isIn(i.obj, this.itemGroup)));
    this.itemGroup.clear();
    items.forEach((it, k) => {
      if (!it) return;
      const g = new THREE.Group(); g.position.set(...it.pos); g.rotation.y = (k * 1.7 + it.pos[0] * 3) % (Math.PI * 2);
      this.itemGroup.add(g);
      itemMesh(kit, it.kind, g);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(HIT_R, 8, 6), kit.mats.track(new THREE.MeshBasicMaterial({ visible: false })));
      hit.position.y = 0.05; kit.mats.track(hit.geometry); g.add(hit);
      kit.interactable(g, `item:${k}`);
    });
  }

  /** 暗がり：壁の低い所の黒ずみ。照らすと正解の扉の札がチョークで書いてある */
  private buildDark() {
    const kit = this.kit, M = kit.mats, d = this.def.dark!;
    const g = new THREE.Group(); g.position.set(...d.pos); g.rotation.y = d.rotY; kit.group.add(g);
    const soot = M.canvas(256, 192, (c, W, H) => {
      const gr = c.createRadialGradient(W / 2, H / 2, 8, W / 2, H / 2, W / 2);
      gr.addColorStop(0, "rgba(4,3,2,.92)"); gr.addColorStop(0.6, "rgba(6,5,4,.7)"); gr.addColorStop(1, "rgba(6,5,4,0)");
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
    });
    const patch = kit.mesh(new THREE.PlaneGeometry(0.8, 0.6), M.track(new THREE.MeshStandardMaterial({ map: soot, transparent: true, depthWrite: false, roughness: 1 })), [0, 0, 0.004], { parent: g, cast: false });
    kit.interactable(patch, "dark");
    this.chalk = kit.sign({ w: 0.5, h: 0.32, lines: [d.text, "○"], fg: "#e9e4d6", font: "hand", style: "spray", size: 0.34, transparent: true, emissive: 0.35 }, [0, 0, 0.008], 0, g);
    this.chalk.visible = false;
  }

  /** 鍵の扉：ノブの下に南京錠 */
  private buildLock(i: number) {
    const kit = this.kit, M = kit.mats, door = kit.doors[i];
    const g = new THREE.Group();
    g.position.set(door.slide ? DOOR_W / 2 - 0.16 : DOOR_W - 0.12, 0.82, 0.05);
    door.leaf.add(g);
    const steel = M.plain(0x9a9c9e, 0.3, 0.95), brass = M.plain(0xc29a4a, 0.3, 1);
    kit.box(0.1, 0.2, 0.012, steel, [0, -0.02, -0.02], { parent: g, cast: false });
    kit.box(0.075, 0.07, 0.03, brass, [0, -0.1, 0.0], { parent: g });
    kit.mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16, Math.PI), steel, [0, -0.065, 0.0], { parent: g });
    kit.sphere(0.006, M.plain(0x111111, 0.6), [0, -0.08, 0.016], { parent: g, cast: false });
    this.lock = g;
  }

  unlock() { if (this.lock) this.lock.visible = false; }

  /** 懐中電灯で照らす：光が暗がりを向き、しばらくして電池が切れる */
  reveal() {
    if (!this.def.dark) return;
    if (this.chalk) this.chalk.visible = true;
    const l = new THREE.SpotLight(0xfff1d6, 9, 6, 0.32, 0.5, 2);
    l.target.position.set(...this.def.dark.pos);
    this.kit.group.add(l, l.target);
    this.beam = l; this.beamT = 0;
  }

  /** 毎フレーム：光をカメラに付けて動かす */
  update(dt: number, cam: THREE.Camera) {
    if (!this.beam) return;
    this.beamT += dt;
    const p = cam.getWorldPosition(new THREE.Vector3());
    this.beam.position.set(p.x, p.y - 0.15, p.z);
    const t = this.beamT, LIFE = 3;
    const f = t < LIFE ? 1 : t < LIFE + 0.6 ? (Math.floor(t * 18) % 3 === 0 ? 0.1 : 0.6) : 0;
    this.beam.intensity = 9 * f;
    if (t > LIFE + 0.6) { this.beam.removeFromParent(); this.beam.target.removeFromParent(); this.beam = null; }
  }
}

function isIn(o: THREE.Object3D, root: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}

/** 小物の形（g の原点が置き場所の面） */
export function itemMesh(kit: Kit, kind: ItemKind, g: THREE.Object3D) {
  const M = kit.mats;
  switch (kind) {
    case "key": {
      const brass = M.plain(0xd0a44c, 0.25, 1, { emissive: new THREE.Color(0x3a2a08), emissiveIntensity: 0.6 });
      const ring = kit.mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), brass, [-0.045, 0.006, 0], { parent: g });
      ring.rotation.x = Math.PI / 2;
      kit.box(0.07, 0.008, 0.008, brass, [0.005, 0.002, 0], { parent: g });
      kit.box(0.008, 0.008, 0.016, brass, [0.03, 0.002, 0.01], { parent: g });
      kit.box(0.008, 0.008, 0.012, brass, [0.017, 0.002, 0.008], { parent: g });
      break;
    }
    case "torch": {
      const body = M.plain(0x26282a, 0.4, 0.6), rim = M.plain(0xb7b9bb, 0.25, 1);
      const b = kit.cyl(0.018, 0.018, 0.17, body, [0, 0.018, 0], { parent: g }); b.rotation.z = Math.PI / 2; b.position.set(-0.02, 0.018, 0);
      const h = kit.cyl(0.028, 0.02, 0.05, rim, [0, 0.028, 0], { parent: g }); h.rotation.z = Math.PI / 2; h.position.set(0.085, 0.028, 0);
      const lens = kit.mesh(new THREE.CircleGeometry(0.024, 16), M.glow(0xfff4dd, 0.25), [0.111, 0.028, 0], { parent: g, cast: false });
      lens.rotation.y = Math.PI / 2;
      break;
    }
    case "memo": {
      const paper = kit.mats.sign({ w: 0.12, h: 0.09, lines: ["メモ", "～～～", "～～"], bg: "#f1ead6", fg: "#3a3428", font: "hand", style: "paper", size: 0.2, res: 2000 });
      const m = kit.mesh(new THREE.PlaneGeometry(0.12, 0.09), paper, [0, 0.004, 0], { parent: g, cast: false });
      m.rotation.x = -Math.PI / 2;
      kit.box(0.122, 0.003, 0.092, M.plain(0xdcd3bc, 0.9), [0, 0, 0], { parent: g, cast: false });
      break;
    }
  }
}
