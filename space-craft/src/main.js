// エントリ: シーン構築・レイキャスト（ボクセル DDA）・設置/破壊・ゲームループ
import * as THREE from 'three';
import { World, CHUNK_X } from './world.js';
import { Player } from './player.js';
import { buildSky } from './sky.js';
import { UI } from './ui.js';
import { buildAtlasTexture } from './textures.js';
import { BLOCK, isSolid } from './blocks.js';

const RENDER_RADIUS = 5; // チャンク描画半径

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

buildSky(scene);

// ブロック共通マテリアル（テクスチャアトラス + 頂点カラーで面シェーディング）
const atlas = buildAtlasTexture();
const material = new THREE.MeshBasicMaterial({
  map: atlas,
  vertexColors: true,
  alphaTest: 0.5,
});

const world = new World(scene);
world.setMaterial(material);

// プレイヤー周辺を先に生成してからスポーン
world.update(8, 8, RENDER_RADIUS);
const player = new Player(camera, world, canvas);
const ui = new UI();

// --- 照準ハイライト枠 ---
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })
);
highlight.visible = false;
scene.add(highlight);

// --- ボクセルレイキャスト（Amanatides & Woo の DDA）---
function raycastVoxel(maxDist = 6) {
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dir.x);
  const stepY = Math.sign(dir.y);
  const stepZ = Math.sign(dir.z);

  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

  const distToBound = (s, o, step) => {
    if (step > 0) return (Math.floor(o) + 1 - o);
    if (step < 0) return (o - Math.floor(o));
    return Infinity;
  };
  let tMaxX = tDeltaX === Infinity ? Infinity : distToBound('x', origin.x, stepX) * tDeltaX;
  let tMaxY = tDeltaY === Infinity ? Infinity : distToBound('y', origin.y, stepY) * tDeltaY;
  let tMaxZ = tDeltaZ === Infinity ? Infinity : distToBound('z', origin.z, stepZ) * tDeltaZ;

  let face = [0, 0, 0];

  for (let i = 0; i < maxDist * 3; i++) {
    if (isSolid(world.getBlock(x, y, z))) {
      return { x, y, z, face };
    }
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        if (tMaxX > maxDist) break;
        x += stepX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
      }
    } else {
      if (tMaxY < tMaxZ) {
        if (tMaxY > maxDist) break;
        y += stepY; tMaxY += tDeltaY; face = [0, -stepY, 0];
      } else {
        if (tMaxZ > maxDist) break;
        z += stepZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
      }
    }
  }
  return null;
}

let target = null;

function updateTarget() {
  target = raycastVoxel(6);
  if (target) {
    highlight.visible = true;
    highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  } else {
    highlight.visible = false;
  }
}

// --- 設置 / 破壊 ---
canvas.addEventListener('mousedown', (e) => {
  if (!player.locked || !target) return;
  if (e.button === 0) {
    // 破壊（岩盤は壊せない）
    if (world.getBlock(target.x, target.y, target.z) !== BLOCK.BEDROCK) {
      world.setBlock(target.x, target.y, target.z, BLOCK.AIR);
    }
  } else if (e.button === 2) {
    // 設置（照準面の隣接セル）
    const px = target.x + target.face[0];
    const py = target.y + target.face[1];
    const pz = target.z + target.face[2];
    // プレイヤーにめり込む位置には置かない
    const pminX = Math.floor(player.pos.x - 0.3), pmaxX = Math.floor(player.pos.x + 0.3);
    const pminY = Math.floor(player.pos.y), pmaxY = Math.floor(player.pos.y + 1.8);
    const pminZ = Math.floor(player.pos.z - 0.3), pmaxZ = Math.floor(player.pos.z + 0.3);
    const inside = px >= pminX && px <= pmaxX && py >= pminY && py <= pmaxY && pz >= pminZ && pz <= pmaxZ;
    if (!inside) world.setBlock(px, py, pz, ui.selectedBlock);
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- ループ ---
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  player.update(dt);
  world.update(player.pos.x, player.pos.z, RENDER_RADIUS);
  updateTarget();

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 起動オーバーレイ
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  overlay.style.display = 'none';
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) {
    overlay.style.display = 'flex';
  }
});
