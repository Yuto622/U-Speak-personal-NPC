// ブロックテクスチャを実行時に手続き生成（オリジナルのドット絵）
// 16x16 のタイルを 1 枚のアトラスにまとめ、Three の CanvasTexture として返す。
import * as THREE from 'three';

export const TILE = 16;          // 1 タイルのピクセル数
export const ATLAS_COLS = 4;     // アトラスの列数
export const ATLAS_ROWS = 4;     // アトラスの行数

// タイル名 → アトラス内のインデックス
export const TILES = {
  alien_grass_top: 0,
  alien_grass_side: 1,
  alien_dirt: 2,
  rock: 3,
  crystal: 4,
  ice: 5,
  regolith: 6,
  ore: 7,
  bedrock: 8,
  glow: 9,
  trunk_top: 10,
  trunk_side: 11,
  leaves: 12,
  metal: 13,
};

// 簡易シード乱数（タイル毎にノイズを散らす用）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(r, g, b) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// 1 タイルを描く。base 色を中心にピクセル毎の明暗ノイズを加える。
function drawNoisyTile(ctx, ox, oy, base, variance, seed, opts = {}) {
  const rng = mulberry32(seed);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = (rng() - 0.5) * 2 * variance;
      let r = base[0] + n, g = base[1] + n, b = base[2] + n;
      if (opts.tintTop && y < 3) { g += 14; }
      ctx.fillStyle = hex(
        Math.max(0, Math.min(255, r)),
        Math.max(0, Math.min(255, g)),
        Math.max(0, Math.min(255, b))
      );
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function tileOrigin(index) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  return [col * TILE, row * TILE];
}

export function buildAtlasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const draw = (name, base, variance, seed, opts) => {
    const [ox, oy] = tileOrigin(TILES[name]);
    drawNoisyTile(ctx, ox, oy, base, variance, seed, opts);
  };

  // 異星の地表（青緑がかった草）
  draw('alien_grass_top', [70, 180, 150], 22, 11, {});
  draw('alien_grass_side', [120, 95, 80], 18, 12, { tintTop: true });
  // レゴリス土
  draw('alien_dirt', [120, 95, 80], 18, 13, {});
  // 岩
  draw('rock', [110, 112, 125], 26, 14, {});
  // クリスタル（発光感のある明るい紫）
  draw('crystal', [180, 120, 255], 40, 15, {});
  // 氷
  draw('ice', [150, 205, 235], 16, 16, {});
  // 砂・レゴリス
  draw('regolith', [200, 185, 150], 18, 17, {});
  // 鉱石（岩に黄金の粒）
  draw('ore', [110, 112, 125], 20, 18, {});
  // 岩盤（最下層）
  draw('bedrock', [55, 55, 62], 28, 19, {});
  // 発光鉱脈
  draw('glow', [255, 170, 60], 45, 20, {});
  // 異星樹の幹（断面）
  draw('trunk_top', [150, 110, 70], 16, 21, {});
  // 異星樹の幹（側面）
  draw('trunk_side', [95, 70, 50], 18, 22, {});
  // 異星樹の葉
  draw('leaves', [60, 150, 120], 30, 23, {});
  // 金属
  draw('metal', [160, 165, 175], 22, 24, {});

  // --- 装飾ピクセルを上から描き加える ---
  // ore: 黄金の粒
  {
    const [ox, oy] = tileOrigin(TILES.ore);
    const rng = mulberry32(99);
    ctx.fillStyle = hex(240, 200, 70);
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(ox + Math.floor(rng() * TILE), oy + Math.floor(rng() * TILE), 2, 2);
    }
  }
  // crystal: ハイライト
  {
    const [ox, oy] = tileOrigin(TILES.crystal);
    ctx.fillStyle = hex(230, 200, 255);
    ctx.fillRect(ox + 4, oy + 3, 2, 8);
    ctx.fillRect(ox + 9, oy + 6, 2, 6);
  }
  // grass_side: 上端の草ベルト
  {
    const [ox, oy] = tileOrigin(TILES.alien_grass_side);
    ctx.fillStyle = hex(70, 180, 150);
    for (let x = 0; x < TILE; x++) {
      const h = 2 + (mulberry32(x + 5)() * 2 | 0);
      ctx.fillRect(ox + x, oy, 1, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  return tex;
}

// 指定タイルの UV 範囲を返す（少しだけ内側に詰めて隣タイルの滲みを防ぐ）
export function tileUV(index) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const pad = 0.001;
  const u0 = (col + pad) / ATLAS_COLS;
  const u1 = (col + 1 - pad) / ATLAS_COLS;
  // Canvas は上原点・three の UV は下原点なので V を反転
  const v1 = 1 - (row + pad) / ATLAS_ROWS;
  const v0 = 1 - (row + 1 - pad) / ATLAS_ROWS;
  return { u0, u1, v0, v1 };
}
