// ワールド: チャンク管理・地形生成・チャンクメッシュ生成（面カリング）
import * as THREE from 'three';
import { Noise } from './noise.js';
import { BLOCK, BLOCKS, isTransparent } from './blocks.js';
import { tileUV } from './textures.js';

export const CHUNK_X = 16;
export const CHUNK_Z = 16;
export const WORLD_Y = 64;   // ワールドの高さ上限
export const SEA_ICE = 14;   // 低地に氷を敷く高さ

// 面の方向と頂点（単位立方体の各面）
const FACES = [
  { dir: [1, 0, 0], idx: 0, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },   // +X
  { dir: [-1, 0, 0], idx: 1, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },  // -X
  { dir: [0, 1, 0], idx: 2, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },   // +Y top
  { dir: [0, -1, 0], idx: 3, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },  // -Y bottom
  { dir: [0, 0, 1], idx: 4, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },   // +Z
  { dir: [0, 0, -1], idx: 5, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },  // -Z
];
// 面ごとの簡易シェーディング（上が明るく、下が暗い）
const FACE_LIGHT = [0.78, 0.78, 1.0, 0.55, 0.7, 0.7];

function key(cx, cz) { return cx + ',' + cz; }

export class World {
  constructor(scene, seed = 20260623) {
    this.scene = scene;
    this.noise = new Noise(seed);
    this.treeNoise = new Noise(seed + 7777);
    this.chunks = new Map();   // key -> Uint8Array
    this.meshes = new Map();   // key -> THREE.Group
    this.material = null;      // main.js から注入
    this.dirty = new Set();    // 再メッシュが必要なチャンク
  }

  setMaterial(mat) { this.material = mat; }

  // --- ブロックアクセス（ワールド座標） ---
  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_Y) return BLOCK.AIR;
    const cx = Math.floor(x / CHUNK_X);
    const cz = Math.floor(z / CHUNK_Z);
    const data = this.chunks.get(key(cx, cz));
    if (!data) return BLOCK.AIR;
    const lx = x - cx * CHUNK_X;
    const lz = z - cz * CHUNK_Z;
    return data[this._index(lx, y, lz)];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_Y) return;
    const cx = Math.floor(x / CHUNK_X);
    const cz = Math.floor(z / CHUNK_Z);
    const k = key(cx, cz);
    const data = this.chunks.get(k);
    if (!data) return;
    const lx = x - cx * CHUNK_X;
    const lz = z - cz * CHUNK_Z;
    data[this._index(lx, y, lz)] = id;
    this.dirty.add(k);
    // 隣チャンクの境界面も更新が必要
    if (lx === 0) this.dirty.add(key(cx - 1, cz));
    if (lx === CHUNK_X - 1) this.dirty.add(key(cx + 1, cz));
    if (lz === 0) this.dirty.add(key(cx, cz - 1));
    if (lz === CHUNK_Z - 1) this.dirty.add(key(cx, cz + 1));
  }

  _index(lx, y, lz) {
    return lx + lz * CHUNK_X + y * CHUNK_X * CHUNK_Z;
  }

  // --- 地形生成 ---
  generateChunk(cx, cz) {
    const k = key(cx, cz);
    if (this.chunks.has(k)) return;
    const data = new Uint8Array(CHUNK_X * WORLD_Y * CHUNK_Z);

    for (let lx = 0; lx < CHUNK_X; lx++) {
      for (let lz = 0; lz < CHUNK_Z; lz++) {
        const wx = cx * CHUNK_X + lx;
        const wz = cz * CHUNK_Z + lz;

        // 高さマップ（複数スケールを合成）
        const base = this.noise.fbm(wx * 0.012, wz * 0.012, 4);
        const hills = this.noise.fbm(wx * 0.05, wz * 0.05, 3);
        let height = Math.floor(18 + base * 22 + hills * 8);
        height = Math.max(2, Math.min(WORLD_Y - 8, height));

        for (let y = 0; y <= height; y++) {
          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y < height - 4) {
            // 岩盤層。たまに鉱石・発光鉱脈
            const oreN = this.noise.perlin2(wx * 0.3 + y, wz * 0.3 - y);
            if (oreN > 0.78) id = BLOCK.GLOW;
            else if (oreN > 0.55) id = BLOCK.ORE;
            else id = BLOCK.ROCK;
          } else if (y < height) {
            id = BLOCK.DIRT;
          } else {
            // 地表
            if (height < SEA_ICE) id = BLOCK.ICE;
            else if (base > 0.62) id = BLOCK.REGOLITH;
            else id = BLOCK.GRASS;
          }
          data[this._index(lx, y, lz)] = id;
        }

        // クリスタル柱（まれに地表から生える）
        const cN = this.treeNoise.perlin2(wx * 0.9, wz * 0.9);
        if (cN > 0.92 && height >= SEA_ICE) {
          const ch = 2 + (Math.floor((cN - 0.92) * 60) % 3);
          for (let y = height + 1; y <= height + ch && y < WORLD_Y; y++) {
            data[this._index(lx, y, lz)] = BLOCK.CRYSTAL;
          }
        }
      }
    }

    this.chunks.set(k, data);

    // 異星樹を生やす（チャンク内に数本）
    this._growTrees(cx, cz, data);

    this.dirty.add(k);
  }

  _growTrees(cx, cz, data) {
    for (let lx = 2; lx < CHUNK_X - 2; lx++) {
      for (let lz = 2; lz < CHUNK_Z - 2; lz++) {
        const wx = cx * CHUNK_X + lx;
        const wz = cz * CHUNK_Z + lz;
        const t = this.treeNoise.perlin2(wx * 0.37, wz * 0.37);
        if (t < 0.86) continue;
        // 地表（GRASS）の高さを探す
        let gy = -1;
        for (let y = WORLD_Y - 1; y > 1; y--) {
          if (data[this._index(lx, y, lz)] === BLOCK.GRASS) { gy = y; break; }
        }
        if (gy < 0 || gy + 6 >= WORLD_Y) continue;
        const trunkH = 3 + (Math.floor(t * 100) % 3);
        for (let i = 1; i <= trunkH; i++) {
          data[this._index(lx, gy + i, lz)] = BLOCK.TRUNK;
        }
        // 葉の塊
        const topY = gy + trunkH;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 3) continue;
              const x = lx + dx, z = lz + dz, y = topY + dy;
              if (x < 0 || x >= CHUNK_X || z < 0 || z >= CHUNK_Z || y >= WORLD_Y) continue;
              if (data[this._index(x, y, z)] === BLOCK.AIR) {
                data[this._index(x, y, z)] = BLOCK.LEAVES;
              }
            }
          }
        }
        // 天辺
        if (topY + 1 < WORLD_Y) data[this._index(lx, topY + 1, lz)] = BLOCK.LEAVES;
      }
    }
  }

  // --- チャンクメッシュ生成（露出面のみ） ---
  buildChunkMesh(cx, cz) {
    const k = key(cx, cz);
    const data = this.chunks.get(k);
    if (!data) return;

    // 既存メッシュを破棄
    const old = this.meshes.get(k);
    if (old) {
      this.scene.remove(old);
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }

    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    const baseX = cx * CHUNK_X;
    const baseZ = cz * CHUNK_Z;

    for (let y = 0; y < WORLD_Y; y++) {
      for (let lz = 0; lz < CHUNK_Z; lz++) {
        for (let lx = 0; lx < CHUNK_X; lx++) {
          const id = data[this._index(lx, y, lz)];
          if (id === BLOCK.AIR) continue;
          const wx = baseX + lx, wz = baseZ + lz;
          const block = BLOCKS[id];

          for (const face of FACES) {
            const nx = wx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = wz + face.dir[2];
            const neighbor = this.getBlock(nx, ny, nz);

            // 隣が不透明なら面を省略。葉同士は描画しない。
            if (!isTransparent(neighbor)) continue;
            if (neighbor === id && block.transparent) continue;

            const uv = tileUV(block.faces[face.idx]);
            const light = block.light ? 1.0 : FACE_LIGHT[face.idx];
            const start = positions.length / 3;

            const cs = face.corners;
            // 4 頂点
            for (let c = 0; c < 4; c++) {
              positions.push(wx + cs[c][0], y + cs[c][1], wz + cs[c][2]);
              normals.push(face.dir[0], face.dir[1], face.dir[2]);
              colors.push(light, light, light);
            }
            // UV（コーナー順に合わせて）
            uvs.push(uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1, uv.u0, uv.v0);
            indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          }
        }
      }
    }

    if (positions.length === 0) {
      this.meshes.delete(k);
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this.meshes.set(k, mesh);
  }

  // 描画距離内のチャンクを生成・メッシュ化
  update(playerX, playerZ, radius) {
    const pcx = Math.floor(playerX / CHUNK_X);
    const pcz = Math.floor(playerZ / CHUNK_Z);

    // 生成（メッシュ化のため近傍も先に生成しておく）
    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        this.generateChunk(pcx + dx, pcz + dz);
      }
    }

    // dirty を 1 フレームに数枚ずつメッシュ化
    let budget = 4;
    for (const k of this.dirty) {
      const [sx, sz] = k.split(',').map(Number);
      if (Math.abs(sx - pcx) > radius + 1 || Math.abs(sz - pcz) > radius + 1) continue;
      this.buildChunkMesh(sx, sz);
      this.dirty.delete(k);
      if (--budget <= 0) break;
    }
  }

  // 地表の高さ（スポーン位置決め用）
  surfaceHeight(x, z) {
    for (let y = WORLD_Y - 1; y >= 0; y--) {
      if (this.getBlock(x, y, z) !== BLOCK.AIR) return y + 1;
    }
    return WORLD_Y / 2;
  }
}
