// Poly Haven（CC0）から 1K テクスチャを public/textures に取得する。
// 使い方: npm run textures
import { mkdir, writeFile, access } from "node:fs/promises";

const IDS = [
  "dirty_carpet", "decrepit_wallpaper", "walnut_veneer", "ceiling_interior", "painted_plaster_wall",
  "long_white_tiles", "old_linoleum_flooring_01", "clay_plaster", "white_oak_veneer",
  "concrete_floor_worn_001", "concrete_wall_006", "rusty_metal_02", "white_plaster_02",
];
const MAPS = { diff: "Diffuse", nor: "nor_gl", arm: "arm" };

for (const id of IDS) {
  const dir = `public/textures/${id}`;
  await mkdir(dir, { recursive: true });
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [name, key] of Object.entries(MAPS)) {
    const out = `${dir}/${name}.jpg`;
    try { await access(out); continue; } catch {}
    const url = files[key]?.["1k"]?.jpg?.url;
    if (!url) { console.warn(`skip ${id}/${name}`); continue; }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(out, buf);
    console.log(`${id}/${name}.jpg ${(buf.length / 1024) | 0}KB`);
  }
}
