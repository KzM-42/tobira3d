// 一人称の歩行：加減速、壁ずり、ヘッドボブ、足音のタイミング
import { resolveCircle, type Box } from "./collision";

export const RADIUS = 0.28;
/** 歩く速さ（m/s）。速さは1つだけ */
const WALK = 1.45;

export class Player {
  x = 0; z = 0; yaw = 0; pitch = 0;
  px = 0; pz = 0;            // 1ステップ前（描画の補間用）
  vx = 0; vz = 0;
  phase = 0;                 // 歩行の位相
  bob = 0;                   // 揺れの強さ（0..1）
  private lastStep = 0;
  onStep: () => void = () => {};

  place(x: number, z: number, yaw: number) {
    this.x = this.px = x; this.z = this.pz = z; this.yaw = yaw; this.pitch = 0; this.vx = this.vz = 0; this.bob = 0;
  }

  look(dx: number, dy: number) {
    this.yaw += dx;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy));
  }

  /** 固定ステップ（1/60秒）で呼ぶ */
  step(mx: number, mz: number, boxes: Box[], dt: number) {
    this.px = this.x; this.pz = this.z;
    // 入力の向きだけを使い、どの方向・どの倒し方でも同じ速さで歩く
    const len = Math.hypot(mx, mz), k = len ? WALK / len : 0;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // 前 = (-sin, -cos)、右 = (cos, -sin)
    const wx = (-s * mz + c * mx) * k, wz = (-c * mz - s * mx) * k;
    const a = 1 - Math.exp(-dt * (len ? 9 : 12));
    this.vx += (wx - this.vx) * a; this.vz += (wz - this.vz) * a;
    const [nx, nz] = resolveCircle(this.x + this.vx * dt, this.z + this.vz * dt, RADIUS, boxes);
    // 壁に当たった分は速度も削る（壁沿いに滑る）
    this.vx = (nx - this.x) / dt; this.vz = (nz - this.z) / dt;
    this.x = nx; this.z = nz;
    const v = Math.hypot(this.vx, this.vz);
    this.bob += (Math.min(1, v / WALK) - this.bob) * 0.12;
    this.advance(v * dt);
  }

  /** 歩いた距離ぶん位相を進め、半周ごとに足音 */
  advance(dist: number) {
    this.phase += dist * 2.9;
    const n = Math.floor((this.phase + Math.PI / 2) / Math.PI); // 視点が一番沈む瞬間 = 足が着く
    if (n !== this.lastStep && this.bob > 0.3) this.onStep();
    this.lastStep = n;
  }

  /** 視点の揺れ（上下・左右・傾き） */
  sway() {
    const a = this.bob * 0.034;
    return {
      y: -Math.abs(Math.sin(this.phase)) * a * 1.4 + a * 0.6,
      x: Math.cos(this.phase) * a * 0.55,
      roll: Math.cos(this.phase) * this.bob * 0.004,
      pitch: Math.sin(this.phase * 2) * this.bob * 0.0035,
    };
  }
}
