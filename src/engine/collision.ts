// 円（プレイヤー）と軸平行の箱（壁・家具）の衝突。押し戻しで壁沿いに滑る。
export interface Box { x0: number; z0: number; x1: number; z1: number }

export function resolveCircle(x: number, z: number, r: number, boxes: Box[]): [number, number] {
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2), push = r - d;
        x += (dx / d) * push; z += (dz / d) * push;
      } else {
        // 中心が箱の中：一番近い面から外へ
        const l = x - b.x0 + r, rr = b.x1 - x + r, t = z - b.z0 + r, bt = b.z1 - z + r, m = Math.min(l, rr, t, bt);
        if (m === l) x = b.x0 - r; else if (m === rr) x = b.x1 + r; else if (m === t) z = b.z0 - r; else z = b.z1 + r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}

export const inBox = (x: number, z: number, b: Box) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
