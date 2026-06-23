// プレイヤー: 一人称操作・低重力物理・AABB 衝突
import * as THREE from 'three';
import { isSolid } from './blocks.js';

const PLAYER_W = 0.6;   // 幅（X/Z）
const PLAYER_H = 1.8;   // 高さ
const EYE = 1.62;       // 足元から目の高さ

export class Player {
  constructor(camera, world, dom) {
    this.camera = camera;
    this.world = world;
    this.dom = dom;

    // 足元（中心下端）の位置
    this.pos = new THREE.Vector3(8, world.surfaceHeight(8, 8) + 1, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;

    // 低重力（異星）パラメータ
    this.gravity = 18;       // m/s^2（地球より弱め）
    this.jumpSpeed = 8.0;    // 低重力で高く跳べる
    this.walkSpeed = 5.5;
    this.flySpeed = 12;

    this.keys = {};
    this._bindInput();
  }

  _bindInput() {
    const canvas = this.dom;
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = 0.0025;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });

    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.flying = !this.flying;
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  get locked() { return document.pointerLockElement === this.dom; }

  // ある足元位置でブロックと衝突しているか
  _collides(px, py, pz) {
    const minX = Math.floor(px - PLAYER_W / 2);
    const maxX = Math.floor(px + PLAYER_W / 2);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + PLAYER_H);
    const minZ = Math.floor(pz - PLAYER_W / 2);
    const maxZ = Math.floor(pz + PLAYER_W / 2);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (isSolid(this.world.getBlock(x, y, z))) return true;
        }
      }
    }
    return false;
  }

  update(dt) {
    // 入力方向（ヨーに沿った水平移動）
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys['KeyW']) move.add(forward);
    if (this.keys['KeyS']) move.sub(forward);
    if (this.keys['KeyD']) move.add(right);
    if (this.keys['KeyA']) move.sub(right);
    if (move.lengthSq() > 0) move.normalize();

    if (this.flying) {
      const sp = this.flySpeed * (this.keys['ControlLeft'] ? 2 : 1);
      this.vel.x = move.x * sp;
      this.vel.z = move.z * sp;
      this.vel.y = 0;
      if (this.keys['Space']) this.vel.y = sp;
      if (this.keys['ShiftLeft']) this.vel.y = -sp;
    } else {
      const sp = this.walkSpeed;
      this.vel.x = move.x * sp;
      this.vel.z = move.z * sp;
      this.vel.y -= this.gravity * dt;
      if (this.keys['Space'] && this.onGround) {
        this.vel.y = this.jumpSpeed;
        this.onGround = false;
      }
    }

    // 軸ごとに移動して衝突解決
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this.onGround = false;
    this._moveAxis('y', this.vel.y * dt);

    // 奈落落下のセーフティ
    if (this.pos.y < -20) {
      this.pos.set(this.pos.x, this.world.surfaceHeight(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 1, this.pos.z);
      this.vel.set(0, 0, 0);
    }

    // カメラ更新
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }

  _moveAxis(axis, amount) {
    if (amount === 0) return;
    const old = this.pos[axis];
    this.pos[axis] += amount;
    if (this._collides(this.pos.x, this.pos.y, this.pos.z)) {
      this.pos[axis] = old;
      if (axis === 'y') {
        if (amount < 0) this.onGround = true; // 地面に着地
        this.vel.y = 0;
      } else {
        this.vel[axis] = 0;
      }
    }
  }
}

export const PLAYER_CONST = { PLAYER_W, PLAYER_H, EYE };
