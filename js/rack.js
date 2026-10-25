// 내 받침대 배치. 실제 받침대처럼 2줄짜리 판이고, 타일은 내가 놓은 자리에 그대로 있다(자동 정렬 없음).
// pos = { [타일id]: [줄(0|1), 칸] }. 내 폰에만 있는 정보라 서버에는 안 올린다. 화면과 무관한 순수 함수만.
import { analyzeSet, sortRack, tileOf } from './engine.js';

export const RACK_ROWS = 2;
export const BASE_COLS = 12; // 가로 화면 기준 (타일을 크게)

const rowOf = (pos, r) => Object.entries(pos).filter(([, [rr]]) => rr === r).map(([id, [, c]]) => [Number(id), c]).sort((a, b) => a[1] - b[1]);
const lastCol = (pos, r) => rowOf(pos, r).reduce((m, [, c]) => Math.max(m, c), -1);

// 칸 수: 기본 12칸. 줄마다 빈칸이 2칸 이상 남도록 늘린다 (그만큼 타일이 작아짐)
export function rackCols(pos) {
  const n = Object.keys(pos).length;
  let maxCol = -1;
  for (const [, c] of Object.values(pos)) maxCol = Math.max(maxCol, c);
  return Math.max(BASE_COLS, maxCol + 2, Math.ceil(n / RACK_ROWS) + 2);
}

// 받침대에 실제로 있는 타일(ids)과 맞추기: 없어진 타일은 빼고, 새로 받은 타일은 덜 찬 줄 끝에 넣는다
// (처음 14장은 7장씩 두 줄 → 양쪽 줄 다 빈칸이 남아서 아무 데나 옮기기 쉬움)
export function syncRack(pos, ids) {
  const have = new Set(ids);
  const out = {};
  for (const [id, p] of Object.entries(pos)) if (have.has(Number(id))) out[id] = p;
  for (const id of ids) {
    if (out[id]) continue;
    const r = rowOf(out, 1).length < rowOf(out, 0).length ? 1 : 0;
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

// 버튼을 누를 때만 한 번 정렬 (자동 정렬은 없음)
//   by = 'color'  (789): 같은 색 연속 숫자끼리
//   by = 'number' (777): 같은 숫자 다른 색끼리
// 3장 이상 이어지는 묶음은 앞쪽에 모으고 묶음 뒤에 한 칸씩 띄운다. 나머지는 그 뒤에 붙여서. 묶음은 줄을 넘어가며 쪼개지 않는다.
export function arrangeRack(ids, by, cols = BASE_COLS) {
  const sorted = sortRack(ids, by);
  const tiles = sorted.map(tileOf);
  const follows = (a, b) => (by === 'color'
    ? a.color === b.color && b.num === a.num + 1
    : a.num === b.num && a.color !== b.color);
  const chunks = [];
  tiles.forEach((t, i) => {
    const last = chunks[chunks.length - 1];
    const prev = i > 0 ? tiles[i - 1] : null;
    if (last && prev && !t.joker && !prev.joker && follows(prev, t)) last.push(sorted[i]);
    else chunks.push([sorted[i]]);
  });
  const sets = chunks.filter((c) => c.length >= 3);
  const rest = chunks.filter((c) => c.length < 3).flat();
  const out = {};
  let r = 0;
  let c = 0;
  const put = (group, gapAfter) => {
    if (c > 0 && c + group.length > cols && r < RACK_ROWS - 1) { r += 1; c = 0; }
    group.forEach((id) => { out[id] = [r, c++]; });
    if (gapAfter) c += 1;
  };
  for (const s of sets) put(s, true);
  for (const id of rest) put([id], false);
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

// 끄는 묶음(k장)을 놓을 받침대의 가장 가까운 연속 빈칸. at = { colF, rowF } (첫 타일 중심의 칸 좌표, 실수)
export function nearestFreeSlot(pos, ids, at, cols) {
  const moving = new Set(ids);
  const used = new Set(Object.entries(pos).filter(([id]) => !moving.has(Number(id))).map(([, [r, c]]) => `${r}:${c}`));
  let best = null;
  for (let r = 0; r < RACK_ROWS; r++) {
    for (let s = 0; s + ids.length <= cols; s++) {
      let ok = true;
      for (let c = s; c < s + ids.length; c++) if (used.has(`${r}:${c}`)) { ok = false; break; }
      if (!ok) continue;
      const d = Math.hypot(s + 0.5 - at.colF, (r + 0.5 - at.rowF) * 1.25);
      if (!best || d < best.d) best = { row: r, start: s, d };
    }
  }
  return best;
}

export function placeInRack(pos, ids, spot) {
  const moving = new Set(ids);
  const out = {};
  for (const [id, p] of Object.entries(pos)) if (!moving.has(Number(id))) out[id] = p;
  ids.forEach((id, i) => { out[id] = [spot.row, spot.start + i]; });
  return out;
}
