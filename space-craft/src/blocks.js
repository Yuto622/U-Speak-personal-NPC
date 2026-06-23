// ブロック定義。各ブロックの面ごとのテクスチャタイルと属性を持つ。
import { TILES } from './textures.js';

// ブロック ID（0 = 空気）
export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  ROCK: 3,
  CRYSTAL: 4,
  ICE: 5,
  REGOLITH: 6,
  ORE: 7,
  BEDROCK: 8,
  GLOW: 9,
  TRUNK: 10,
  LEAVES: 11,
  METAL: 12,
};

// faces: [+X, -X, +Y(top), -Y(bottom), +Z, -Z] のタイルインデックス
function uniform(t) { return [t, t, t, t, t, t]; }
function topBottomSide(top, bottom, side) {
  return [side, side, top, bottom, side, side];
}

export const BLOCKS = {
  [BLOCK.GRASS]: {
    name: 'エイリアン地表',
    faces: topBottomSide(TILES.alien_grass_top, TILES.alien_dirt, TILES.alien_grass_side),
    solid: true,
  },
  [BLOCK.DIRT]: {
    name: 'レゴリス土',
    faces: uniform(TILES.alien_dirt),
    solid: true,
  },
  [BLOCK.ROCK]: {
    name: '岩',
    faces: uniform(TILES.rock),
    solid: true,
  },
  [BLOCK.CRYSTAL]: {
    name: '発光クリスタル',
    faces: uniform(TILES.crystal),
    solid: true,
    light: true,
  },
  [BLOCK.ICE]: {
    name: '氷',
    faces: uniform(TILES.ice),
    solid: true,
  },
  [BLOCK.REGOLITH]: {
    name: '砂レゴリス',
    faces: uniform(TILES.regolith),
    solid: true,
  },
  [BLOCK.ORE]: {
    name: '鉱石',
    faces: uniform(TILES.ore),
    solid: true,
  },
  [BLOCK.BEDROCK]: {
    name: '岩盤',
    faces: uniform(TILES.bedrock),
    solid: true,
  },
  [BLOCK.GLOW]: {
    name: '発光鉱脈',
    faces: uniform(TILES.glow),
    solid: true,
    light: true,
  },
  [BLOCK.TRUNK]: {
    name: '異星樹の幹',
    faces: topBottomSide(TILES.trunk_top, TILES.trunk_top, TILES.trunk_side),
    solid: true,
  },
  [BLOCK.LEAVES]: {
    name: '異星樹の葉',
    faces: uniform(TILES.leaves),
    solid: true,
    transparent: true, // 葉は隣接面を描画する（中まで見える）
  },
  [BLOCK.METAL]: {
    name: '金属',
    faces: uniform(TILES.metal),
    solid: true,
  },
};

export function isSolid(id) {
  return id !== BLOCK.AIR;
}

export function isTransparent(id) {
  if (id === BLOCK.AIR) return true;
  const b = BLOCKS[id];
  return !!(b && b.transparent);
}

// ホットバーに並べるブロック（順番）
export const HOTBAR = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.ROCK,
  BLOCK.REGOLITH,
  BLOCK.ICE,
  BLOCK.CRYSTAL,
  BLOCK.GLOW,
  BLOCK.METAL,
  BLOCK.TRUNK,
];
