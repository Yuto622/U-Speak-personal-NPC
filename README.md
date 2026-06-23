<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1DEcwUX1TB2cq3Fq_H13RNGAqcQUpIt9R

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## 🪐 SpaceCraft — 宇宙惑星ボクセルゲーム

このリポジトリには、Minecraft 風の仕組みを参考に作った**オリジナルのボクセル・サンドボックスゲーム**
「SpaceCraft」も含まれています。舞台は遠い惑星の地表で、低重力の中を掘って・積んで・建てて遊べます。

> Minecraft のコード・テクスチャ・サウンド・商標は一切使用していません。ジャンル（ボクセル探索・建築）と
> 一般的な仕組みのみを参考にしたオリジナル実装です。設計の調査資料は
> [`docs/minecraft-research.md`](docs/minecraft-research.md) にあります。

### 遊び方

1. 開発サーバを起動: `npm run dev`
2. ブラウザで `http://localhost:3000/space-craft/` を開く
3. 画面をクリックして開始（マウスがロックされます。解除は `Esc`）

> ビルド不要・依存追加なしで動きます（Three.js は CDN から読み込み）。
> `space-craft/index.html` をローカルサーバ経由で開けば単体でも動作します。

### 操作

| 操作 | キー / マウス |
| --- | --- |
| 移動 | W / A / S / D |
| 視点 | マウス |
| ジャンプ | Space |
| 飛行モード切替 | F |
| 飛行中の上昇 / 下降 | Space / Shift |
| ブロック破壊 | 左クリック |
| ブロック設置 | 右クリック |
| ブロック選択 | 数字キー 1〜9 / マウスホイール |

### 特徴

- 異星の地表を Perlin ノイズで手続き生成（草・土・岩・氷・砂レゴリス・鉱石・発光鉱脈・クリスタル柱・異星樹）
- チャンク単位のメッシュ結合＋露出面のみ描画で軽快に動作
- 低重力ジャンプ、星空・太陽・遠景の惑星とリングなど宇宙演出
- すべてのテクスチャは実行時に手続き生成（オリジナルのドット絵）

### 構成

```
space-craft/
├── index.html          # エントリ（importmap で three を読み込み）
└── src/
    ├── noise.js        # Perlin ノイズ（地形生成）
    ├── textures.js     # 手続き生成テクスチャアトラス
    ├── blocks.js       # ブロック定義
    ├── world.js        # チャンク管理・地形生成・メッシュ生成
    ├── player.js       # 一人称操作・低重力物理・衝突
    ├── sky.js          # 星空・太陽・遠景の惑星
    ├── ui.js           # クロスヘア・ホットバー
    └── main.js         # ループ・レイキャスト・設置/破壊
```
