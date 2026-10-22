# 扉は何も言わない（tobira3d）

一人称3Dの脱出ゲーム。部屋ごとに一つの言いつけに従い、正しい扉をくぐる。
正誤は扉を通るまで分からない。間違えれば第1室から。全30室を一度も失敗せずに抜ければクリア（現在 第1〜5室）。

## 起動

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ に静的ファイル（どこにでも置ける。base は相対パス）
npm run preview    # build したものを確認
npm test           # 全部屋の自動テスト（node）
npm run textures   # テクスチャを Poly Haven から取り直す（同梱済みなので通常は不要）
```

## 遊び方

| | PC | スマホ |
|---|---|---|
| 移動 | WASD / 矢印 | 左下の仮想スティック |
| 走る | Shift | スティックを大きく倒す |
| 視点 | マウス（クリックでポインタロック） | 右側をドラッグ |
| 調べる・扉を開ける | クリック / E | 見たい物をタップ |
| 一時停止 | Esc | 右上の II |
| ミュート | M | 右上の ♪ |

- 画質は タイトル／一時停止画面で 高・中・低・自動 を選べる。自動はスマホで「中」から始め、重ければさらに下げる。
- 音量は タイトル／一時停止画面で「環境音」「効果音」を別々に調整できる（localStorage に保存）。
- 環境音はゲームを始めてから鳴る。タイトル・一時停止中・タブが非表示の間は止まる。
- 記録（最高到達・挑戦回数・最短踏破）は localStorage に保存。

## 部屋（第1〜5室）

| 室 | 名前 | 言いつけ（部屋の中にある） | 手がかり |
|---|---|---|---|
| 1 | ホテルの廊下 | 立て看板「灯りのともる扉へ」 | 3つの扉の上のランプ。灯っているのは305だけ |
| 2 | 深夜のオフィス | ホワイトボード「鳴っている電話の机の番号の会議室へ」 | 鳴る音の方向（立体音響）と、点滅する赤いランプ |
| 3 | 夜間外来の待合室 | 吊り看板「お呼び出しまでその場から動かないでください」 | 4秒後のチャイムと表示板「診察室 2」 |
| 4 | 月見の座敷 | 掛け軸「赤き物の数の襖を開けよ」 | だるま・椀・座布団・屏風の裏の傘で4つ |
| 5 | 地下倉庫 | 柱の吹き付け「灯が消えて戻ったら動いたものの扉へ」 | 暗転中に人形が移動。床に埃の跡と引きずった跡が残る |

## 仕組み

```
src/
  core/        three.js に依存しない判定（node でテストできる）
    game.ts      進行・裏の判定・扉の通過タイムライン・リスタート・記録
    types.ts     部屋定義の型
    replay.ts    操作列の自動再生（テストとデバッグで共用）
  engine/      見た目と操作
    app.ts       60Hz 固定ステップのループ、部屋の読み込み/破棄、扉を通る演出、調べる
    kit.ts       部屋を組み立てる道具（壁・扉・照明・看板・当たり判定・音）
    view.ts      描画（ACES、影、霧、GTAO、ブルーム、SMAA、グレイン、ビネット、色収差）
    player.ts    歩行（加減速・壁ずり・ヘッドボブ・足音のタイミング）
    audio.ts     Web Audio の合成音（足音は床の素材別、HRTF の立体音響、部屋の残響）
    input.ts     キーボード・マウス・タッチ
    materials.ts テクスチャと、コードで描く畳・紙・看板
  rooms/       部屋データ（1部屋=1ファイル）
```

### 扉の切り替え（フェードなし）
全ての扉の向こうに、同じ形・同じ焼き込み照明（ライトの影響を受けない素材）の小部屋がある。
扉をくぐってこの小部屋に入り、背後の扉が閉まった瞬間に前の部屋を破棄して次の部屋を読み込む。
次の部屋の入口の扉の裏にも同じ小部屋があり、カメラの相対位置はそのままなので、つなぎ目は見えない。
正解・不正解で扉の動き・音・時間（くぐり始めから次の部屋で動けるまで約2秒）は完全に同じ。結果は次の部屋で初めて分かる。

## 部屋の追加方法

1. `src/rooms/r06-xxx.ts` を作り、`RoomDef` を export する（既存の部屋をコピーするのが早い）。
   - `shell`：広さ・床/壁/天井の素材・霧・環境音・足音の種類
   - `doors`：扉の壁（n/e/w）・位置・札・様式（hotel/office/hospital/fusuma/metal）
   - `answer`：正解の扉が `doors` 配列の何番目か（0始まり）
   - `logic`：`init` / `update`（60Hz）/ `interact` / `check`（言いつけを破ったら理由を返す）/ `miss`（扉違いの理由）
   - `build(kit)`：家具・照明・看板・音を置く。`kit.at(秒, fn)` で時刻に合わせた演出
   - `solution`：正解の操作列。`wrongs`：失敗すべき操作列
2. `src/rooms/index.ts` の `ROOMS` 配列に足す。エンジンは触らなくてよい。
3. `npm test` で「正解の扉だけが通れる」「言いつけを破ると失敗する」「時間切れ」「通しで踏破できる」を確認する。

失敗理由は「次に活かせる1行」にする。判定に乱数は使わない（テストで検査している）。

## 素材とライセンス（出典）

### テクスチャ — Poly Haven（CC0 1.0）
出典：[Poly Haven](https://polyhaven.com/)　ライセンス：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)（[Poly Haven のライセンス説明](https://polyhaven.com/license)）
帰属表示は不要だが、出典として記載する。`public/textures/<ID>/` に 1K 解像度の diff（色）/ nor（法線, OpenGL）/ arm（AO・粗さ・金属）を同梱。
取得スクリプト：`scripts/fetch-textures.mjs`（`npm run textures`）

| アセット | 使っている場所 |
|---|---|
| [dirty_carpet](https://polyhaven.com/a/dirty_carpet) | ホテル・オフィスの床 |
| [decrepit_wallpaper](https://polyhaven.com/a/decrepit_wallpaper) | ホテルの壁 |
| [walnut_veneer](https://polyhaven.com/a/walnut_veneer) | 腰板・扉・家具 |
| [ceiling_interior](https://polyhaven.com/a/ceiling_interior) | オフィス・病院の天井 |
| [painted_plaster_wall](https://polyhaven.com/a/painted_plaster_wall) | オフィス・病院の壁 |
| [long_white_tiles](https://polyhaven.com/a/long_white_tiles) | 病院の腰壁 |
| [old_linoleum_flooring_01](https://polyhaven.com/a/old_linoleum_flooring_01) | 病院の床 |
| [clay_plaster](https://polyhaven.com/a/clay_plaster) | 和室の土壁 |
| [white_oak_veneer](https://polyhaven.com/a/white_oak_veneer) | 和室の天井・机・木箱 |
| [concrete_floor_worn_001](https://polyhaven.com/a/concrete_floor_worn_001) | 地下の床 |
| [concrete_wall_006](https://polyhaven.com/a/concrete_wall_006) | 地下の壁・天井・柱 |
| [rusty_metal_02](https://polyhaven.com/a/rusty_metal_02) | 地下の扉・配管 |
| [white_plaster_02](https://polyhaven.com/a/white_plaster_02) | ホテルの天井 |

### コードで生成したもの（外部素材なし）
- 畳・襖・掛け軸・看板・貼り紙・ホワイトボード・夜景・埃の跡などの模様と文字（Canvas）
- 家具・人形・小物・照明器具の形（three.js の基本形状）
- 音：環境音・足音・扉・ベル・チャイムなど、すべて Web Audio API で合成（音声ファイルなし）
- 環境反射：three.js の `RoomEnvironment`（HDRI は使っていない）

### ライブラリ
- [three.js](https://github.com/mrdoob/three.js)（MIT）
- [Vite](https://github.com/vitejs/vite)（MIT）
- TypeScript（Apache-2.0）、tsx（MIT）※開発時のみ
