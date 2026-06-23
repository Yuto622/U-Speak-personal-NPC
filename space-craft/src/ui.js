// HUD: クロスヘア・ホットバー・操作説明
import { HOTBAR, BLOCKS } from './blocks.js';
import { buildAtlasTexture, tileUV, TILE, ATLAS_COLS, ATLAS_ROWS } from './textures.js';

// ホットバー用に各ブロックの「側面アイコン」を小さな canvas に切り出す
function makeBlockIcon(atlasCanvas, tileIndex, size = 40) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  ctx.drawImage(atlasCanvas, col * TILE, row * TILE, TILE, TILE, 0, 0, size, size);
  return c.toDataURL();
}

export class UI {
  constructor() {
    this.selected = 0;
    this._build();
  }

  _build() {
    // クロスヘア
    const cross = document.createElement('div');
    cross.id = 'crosshair';
    document.body.appendChild(cross);

    // ホットバー
    const bar = document.createElement('div');
    bar.id = 'hotbar';
    document.body.appendChild(bar);
    this.bar = bar;

    // ブロックアイコン生成用にアトラス canvas を再構築
    const tex = buildAtlasTexture();
    const atlasCanvas = tex.image;

    this.slots = [];
    HOTBAR.forEach((blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const block = BLOCKS[blockId];
      const iconTile = block.faces[0]; // 側面
      const img = document.createElement('img');
      img.src = makeBlockIcon(atlasCanvas, iconTile);
      slot.appendChild(img);
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = (i + 1).toString();
      slot.appendChild(num);
      slot.title = block.name;
      bar.appendChild(slot);
      this.slots.push(slot);
    });

    // ブロック名表示
    this.label = document.createElement('div');
    this.label.id = 'blocklabel';
    document.body.appendChild(this.label);

    this._refresh();
    this._bindInput();
  }

  _bindInput() {
    document.addEventListener('keydown', (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= HOTBAR.length) {
        this.selected = n - 1;
        this._refresh();
      }
    });
    document.addEventListener('wheel', (e) => {
      this.selected = (this.selected + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
      this._refresh();
    }, { passive: true });
  }

  _refresh() {
    this.slots.forEach((s, i) => s.classList.toggle('active', i === this.selected));
    const block = BLOCKS[HOTBAR[this.selected]];
    this.label.textContent = block ? block.name : '';
  }

  get selectedBlock() { return HOTBAR[this.selected]; }
}
