// 내 받침대 배치. 실제 받침대처럼 2줄짜리 판이고, 타일은 내가 놓은 자리에 그대로 있다(자동 정렬 없음).
// pos = { [타일id]: [줄(0|1), 칸] }. 내 폰에만 있는 정보라 서버에는 안 올린다. 화면과 무관한 순수 함수만.
import { analyzeSet, sortRack } from './engine.js';

export const RACK_ROWS = 2;
export const BASE_COLS = 10;

const rowOf = (pos, r) => Object.entries(pos).filter(([, [rr]]) => rr === r).map(([id, [, c]]) => [Number(id), c]).sort((a, b) => a[1] - b[1]);
const lastCol = (pos, r) => rowOf(pos, r).reduce((m, [, c]) => Math.max(m, c), -1);

// 칸 수: 기본 10칸, 타일이 많거나 오른쪽 끝까지 놓였으면 늘린다 (그만큼 타일이 작아짐)
export function rackCols(pos) {
  const n = Object.keys(pos).length;
  let maxCol = -1;
  for (const [, c] of Object.values(pos)) maxCol = Math.max(maxCol, c);
  return Math.max(BASE_COLS, maxCol + 2, Math.ceil(n / RACK_ROWS) + 1);
}

// 받침대에 실제로 있는 타일(ids)과 맞추기: 없어진 타일은 빼고, 새로 받은 타일은 윗줄 끝 → 아랫줄 끝에 넣는다
export function syncRack(pos, ids) {
  const have = new Set(ids);
  const out = {};
  for (const [id, p] of Object.entries(pos)) if (have.has(Number(id))) out[id] = p;
  const cols = Math.max(BASE_COLS, Math.ceil(ids.length / RACK_ROWS)); // 윗줄이 '찼다'고 보는 칸 수
  for (const id of ids) {
    if (out[id]) continue;
    const r = lastCol(out, 0) + 1 < cols ? 0 : 1;
    out[id] = [r, lastCol(out, r) + 1];
  }
  return out;
}

// ids를 (row, col)에 차례로 끼워 넣는다. 그 자리에 타일이 있으면 오른쪽으로 밀고, 밀다가 빈칸을 만나면 거기서 멈춘다.
export function insertIntoRack(pos, ids, row, col) {
  const moving = new Set(ids);
  const out = {};
  for (const [id, p] of Object.entries(pos)) if (!moving.has(Number(id))) out[id] = p;
  const line = [];
  for (const [id, c] of rowOf(out, row)) line[c] = id;
  for (let i = 0; i < line.length; i++) if (line[i] === undefined) line[i] = null;
  const at = Math.max(0, col);
  while (line.length < at) line.push(null); // 빈 곳 아무 데나 놓을 수 있게
  // 끼울 자리 뒤쪽 빈칸을 끼우는 장수만큼 없애서(밀린 타일이 빈칸을 채움) 다른 묶음은 안 움직이게
  let toRemove = ids.length;
  for (let i = at; i < line.length && toRemove > 0;) {
    if (line[i] === null) { line.splice(i, 1); toRemove -= 1; } else i += 1;
  }
  line.splice(at, 0, ...ids);
  line.forEach((id, c) => { if (id !== null) out[id] = [row, c]; });
  return out;
}

// 한 번만 정렬: 숫자순/색깔순으로 윗줄부터 채운다
export function arrangeRack(ids, by) {
  const sorted = sortRack(ids, by);
  const cols = Math.max(BASE_COLS, Math.ceil(sorted.length / RACK_ROWS));
  const out = {};
  sorted.forEach((id, i) => { out[id] = [Math.floor(i / cols), i % cols]; });
  return out;
}

// 받침대 안에서 같은 줄에 붙어 있는 묶음들과, 그게 규칙에 맞는 조합인지
export function rackGroups(pos) {
  const out = [];
  for (let r = 0; r < RACK_ROWS; r++) {
    let cur = null;
    for (const [id, c] of rowOf(pos, r)) {
      if (cur && c === cur.start + cur.ids.length) cur.ids.push(id);
      else { cur = { row: r, start: c, ids: [id] }; out.push(cur); }
    }
  }
  for (const g of out) g.valid = analyzeSet(g.ids).valid;
  return out;
}
