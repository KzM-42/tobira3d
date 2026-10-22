import { App, type QualitySetting } from "./engine/app";
import type { RunMode } from "./core/game";
import { makeRoom, NORMAL_ROOMS } from "./rooms/index";
import { fmtMs } from "./core/records";
import { parseSeed } from "./core/rng";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const app = new App($<HTMLCanvasElement>("gl"), {
  crosshair: $("crosshair"), roomTag: $("roomTag"), failLine: $("failLine"), timer: $("timer"), toast: $("toast"),
  onClear: ms => showClear(ms),
  onOver: room => showOver(room),
  onPauseChange: p => { $("pause").hidden = !p; $("seedPause").textContent = String(app.game.seed); if (p) setTimeout(() => $("resumeBtn").focus(), 0); },
}, makeRoom, { length: NORMAL_ROOMS }, $("stick"), $("knob"));

if (app.input.touch) document.body.classList.add("touchdev");

/* ---------- シード ---------- */
// URL の ?seed=数字 があればそれを使う。なければタイトルに戻るたびに新しく選ぶ（演出ではなく挑戦の選択なので、ここだけは乱数でよい）
const urlSeed = parseSeed(new URLSearchParams(location.search).get("seed"));
const rollSeed = () => urlSeed ?? 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 999_999_999);
let titleSeed = rollSeed();

/* ---------- 記録 ---------- */
function showTitle() {
  app.stop();
  $("title").hidden = false; $("clear").hidden = true; $("pause").hidden = true;
  document.body.classList.add("playing-off");
  const r = app.rec;
  $("recBest").textContent = r.best ? `第${r.best}室` : "—";
  $("recTries").textContent = String(r.attempts);
  const bt = r.bestTime[String(NORMAL_ROOMS)];
  $("recTime").textContent = bt ? fmtMs(bt) : "—";
  $("recEndless").textContent = r.endless.best ? `第${r.endless.best}室` : "—";
  $("endlessSeed").textContent = r.endless.best ? ` ／ 無限の最高はシード ${r.endless.seed}（?seed=${r.endless.seed}）` : "";
  titleSeed = rollSeed();
  $("seedTitle").textContent = String(titleSeed);
  if (loaded) app.showcase(titleSeed);
}
let loaded = false;

function showClear(ms: number) {
  $("clearKicker").textContent = "ESCAPED";
  $("clrTimeL").textContent = "今回"; $("clrBestL").textContent = "最短"; $("clrTriesL").textContent = "挑戦回数";
  $("clearTitle").textContent = "外に出た";
  $("clearStory").innerHTML = `最後の扉の向こうは、朝だった。<br><span class="seed">シード ${app.game.seed}</span>`;
  $("clrTime").textContent = fmtMs(ms);
  $("clrBest").textContent = fmtMs(app.rec.bestTime[String(NORMAL_ROOMS)]);
  $("clrTries").textContent = String(app.rec.attempts);
  $("clear").hidden = false;
  document.body.classList.add("playing-off");
  setTimeout(() => $("againBtn").focus(), 0);
}

/** 無限モードの終わり */
function showOver(room: number) {
  const f = app.game.failNote, e = app.rec.endless;
  $("clearKicker").textContent = "LOST";
  $("clearTitle").textContent = `第${room + 1}室で途切れた`;
  $("clearStory").innerHTML = "";
  if (f) $("clearStory").append(`✕「${f.name}」 ${f.reason}`, document.createElement("br"));
  const seed = document.createElement("span"); seed.className = "seed"; seed.textContent = `シード ${app.game.seed}`;
  $("clearStory").append(seed);
  $("clrTimeL").textContent = "越えた部屋"; $("clrBestL").textContent = "無限 最高"; $("clrTriesL").textContent = "最高のシード";
  $("clrTime").textContent = String(room);
  $("clrBest").textContent = `第${e.best}室`;
  $("clrTries").textContent = String(e.seed);
  $("clear").hidden = false;
  document.body.classList.add("playing-off");
  setTimeout(() => $("againBtn").focus(), 0);
}

let run: RunMode = "normal";
function begin(mode: RunMode = run) {
  run = mode;
  $("title").hidden = true; $("clear").hidden = true; $("pause").hidden = true;
  document.body.classList.remove("playing-off");
  app.start(titleSeed, run);
}

/* ---------- 設定 ---------- */
const QKEY = "tobira3d:quality";
let q: QualitySetting = "auto";
try { q = (localStorage.getItem(QKEY) as QualitySetting) || "auto"; } catch { /* */ }
const setQ = (v: QualitySetting) => {
  q = v; app.setQualitySetting(v);
  ($("quality") as HTMLSelectElement).value = v; ($("quality2") as HTMLSelectElement).value = v;
  try { localStorage.setItem(QKEY, v); } catch { /* */ }
};
setQ(q);
$("quality").onchange = e => setQ((e.target as HTMLSelectElement).value as QualitySetting);
$("quality2").onchange = e => setQ((e.target as HTMLSelectElement).value as QualitySetting);

const syncMute = () => {
  const m = app.audio.muted;
  $("muteBtn").textContent = m ? "×" : "♪";
  $("muteBtn2").textContent = $("muteBtn3").textContent = m ? "音：なし" : "音：あり";
};
const toggleMute = () => { app.audio.init(); app.audio.setMuted(!app.audio.muted); syncMute(); };
syncMute();
$("muteBtn").onclick = toggleMute; $("muteBtn2").onclick = toggleMute; $("muteBtn3").onclick = toggleMute;
// 音量（環境音・効果音）：タイトルと一時停止の両方のスライダーを同期
const volInputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-vol]"));
const syncVol = () => volInputs.forEach(i => {
  const v = Math.round(app.audio.volumes[i.dataset.vol as "amb" | "sfx"] * 100);
  i.value = String(v); (i.nextElementSibling as HTMLOutputElement).textContent = `${v}%`;
});
volInputs.forEach(i => i.addEventListener("input", () => { app.audio.setVolumes({ [i.dataset.vol!]: Number(i.value) / 100 }); syncVol(); }));
syncVol();

// ホットリロードで差し替えるときに外すリスナー
const listeners = new AbortController();
const sig = { signal: listeners.signal };
addEventListener("keydown", e => {
  if (e.code === "KeyM" && !e.repeat) toggleMute();
  if (e.code === "Escape" && app.running && !app.paused) app.setPaused(true);
}, sig);

/* ---------- 画面遷移 ---------- */
$("startBtn").onclick = () => begin("normal");
$("endlessBtn").onclick = () => begin("endless");
$("againBtn").onclick = () => { titleSeed = rollSeed(); begin(); };
$("toTitleBtn").onclick = showTitle;
$("resumeBtn").onclick = () => app.setPaused(false);
$("pauseBtn").onclick = () => app.setPaused(true);
$("quitBtn").onclick = showTitle;
// タブが隠れたらゲームを一時停止（音は AudioEngine 側でも止める）
document.addEventListener("visibilitychange", () => { if (document.hidden) app.setPaused(true); }, sig);

showTitle();
app.mats.preload(p => { ($("startBtn") as HTMLButtonElement).textContent = `読み込み中… ${Math.round(p * 100)}%`; }).then(() => {
  const b = $("startBtn") as HTMLButtonElement;
  b.disabled = false; b.textContent = "はいる"; b.focus();
  ($("endlessBtn") as HTMLButtonElement).disabled = false;
  loaded = true;
  if (!app.running) app.showcase(titleSeed);
});

/* ---------- 開発用（npm run dev のときだけ） ---------- */
if (import.meta.env.DEV) (window as any).__t3 = { app, makeRoom, begin };

// ホットリロード：古い App（描画ループ・AudioContext・音源・リスナー）を必ず破棄してから作り直す
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => { listeners.abort(); app.destroy(); });
}
