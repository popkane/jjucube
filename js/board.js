// 테이블 바닥(격자) 배치. 같은 줄에서 빈칸 없이 붙어 있는 타일들이 한 조합이다.
// layout = { [타일id]: [줄, 칸] }, board = { rows, cols }. 화면과 무관한 순수 함수만 둔다.
import { analyzeSet, tileOf, sortRack } from './engine.js';

export const DEFAULT_BOARD = { rows: 8, cols: 12 };
export const MAX_COLS = 20;
const ROW_WEIGHT = 1.3; // 다른 줄로 옮기는 건 옆 칸보다 조금 더 먼 걸로 친다
const SNAP = 2;         // 조합되는 타일과 이만큼 가까이 놓으면 착 붙인다 (바로 옆, 한 칸 떨어짐)

export function makeGrid(layout, board) {
  const g = Array.from({ length: board.rows }, () => Array(board.cols).fill(null));
  for (const [id, [r, c]] of Object.entries(layout)) if (g[r] && c < board.cols) g[r][c] = Number(id);
  return g;
}

// 줄마다 붙어 있는 타일 묶음 (읽는 순서: 위→아래, 왼→오)
export function segments(layout) {
  const rows = new Map();
  for (const [id, [r, c]] of Object.entries(layout)) {
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push([c, Number(id)]);
  }
  const out = [];
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(r).sort((a, b) => a[0] - b[0]);
    let seg = null;
    for (const [c, id] of cells) {
      if (seg && c === seg.start + seg.ids.length) seg.ids.push(id);
      else { seg = { row: r, start: c, ids: [id] }; out.push(seg); }
    }
  }
  return out;
}

export const tableOf = (layout) => segments(layout).map((s) => s.ids);

// 지금은 3장이 안 돼도 이어서 조합이 될 수 있는 모양인지 (2장 이하: 같은 숫자 다른 색 / 같은 색 연속)
export function couldBeSet(ids) {
  if (ids.length >= 3) return analyzeSet(ids).valid;
  const reals = ids.map(tileOf).filter((t) => !t.joker);
  if (reals.length <= 1) return true;
  const [a, b] = reals;
  if (a.num === b.num && a.color !== b.color) return true;
  return a.color === b.color && Math.abs(a.num - b.num) === 1;
}

// 조합(또는 조합이 될 모양)이면 보기 좋은 순서로, 아니면 null (놓인 순서 그대로 둠)
export function setOrder(ids) {
  const a = analyzeSet(ids);
  if (a.valid) return a.order;
  if (!couldBeSet(ids)) return null;
  const reals = ids.map(tileOf).filter((t) => !t.joker);
  const run = reals.length === 2 && reals[0].color === reals[1].color;
  return sortRack(ids, run ? 'color' : 'number');
}

export const blockOrder = (ids) => setOrder(ids) || ids;

function without(layout, ids) {
  const out = { ...layout };
  for (const id of ids) delete out[id];
  return out;
}

// ids 묶음을 (row, col) 근처에 놓을 자리를 찾는다. grab = 손가락으로 잡은 타일이 묶음에서 몇 번째인지.
// locked = 붙으면 안 되는 타일(첫 등록 전의 기존 테이블 타일).
// 돌려주는 값: { row, start, order(그 칸들에 놓일 타일 순서), merge } 또는 null(자리 없음)
export function findPlacement(layout, board, ids, at, locked = null) {
  const block = blockOrder(ids);
  const k = block.length;
  if (k > board.cols) return null;
  const g = makeGrid(without(layout, ids), board);
  const want = at.col - (at.grab || 0);
  let best = null;
  for (let r = 0; r < board.rows; r++) {
    const row = g[r];
    for (let s = 0; s + k <= board.cols; s++) {
      let free = true;
      for (let i = s; i < s + k; i++) if (row[i] !== null) { free = false; break; }
      if (!free) continue;
      const left = [];
      for (let i = s - 1; i >= 0 && row[i] !== null; i--) left.unshift(row[i]);
      const right = [];
      for (let i = s + k; i < board.cols && row[i] !== null; i++) right.push(row[i]);
      const dr = Math.abs(r - at.row) * ROW_WEIGHT;
      let cand;
      if (left.length || right.length) {
        if (locked && [...left, ...right].some((id) => locked.has(id))) continue;
        const merged = [...left, ...block, ...right];
        if (!couldBeSet(merged)) continue;
        const a = s - left.length, b = s + k - 1 + right.length;
        const dc = at.col < a ? a - at.col : at.col > b ? at.col - b : 0;
        cand = { row: r, start: a, order: setOrder(merged), merge: true, score: dr + dc - SNAP };
      } else {
        cand = { row: r, start: s, order: block, merge: false, score: dr + Math.abs(s - want) };
      }
      // 점수가 같으면 따로 놓는 쪽을 고른다 (두 칸 이상 떨어뜨려 놓았으면 붙이지 않음)
      if (!best || cand.score < best.score || (cand.score === best.score && best.merge && !cand.merge)) best = cand;
    }
  }
  return best;
}

export function applyPlacement(layout, ids, p) {
  const out = without(layout, [...ids, ...p.order]);
  p.order.forEach((id, i) => { out[id] = [p.row, p.start + i]; });
  return out;
}

// 조합들을 그대로 유지한 채 위에서부터 빈칸 하나씩 띄워 촘촘히 다시 놓는다
export function tidy(layout, board) {
  const segs = segments(layout);
  const cols = Math.max(board.cols, ...segs.map((s) => s.ids.length));
  const out = {};
  let r = 0, c = 0;
  for (const seg of segs) {
    const ids = setOrder(seg.ids) || seg.ids;
    if (c > 0 && c + ids.length > cols) { r += 1; c = 0; }
    ids.forEach((id, i) => { out[id] = [r, c + i]; });
    c += ids.length + 1;
  }
  return { layout: out, board: { cols, rows: Math.max(board.rows, r + 1) } };
}

function grow(board) {
  return board.cols < MAX_COLS
    ? { cols: board.cols + 1, rows: board.rows + 1 }
    : { cols: board.cols, rows: board.rows + 1 };
}

// 자리가 없으면 정돈해 보고, 그래도 없으면 바닥을 키운다 (타일이 작아짐)
export function place(layout, board, ids, at, locked = null) {
  let p = findPlacement(layout, board, ids, at, locked);
  if (p) return { layout: applyPlacement(layout, ids, p), board, placement: p, tidied: false, grew: false };
  const t = tidy(without(layout, ids), board);
  let lay = t.layout, bd = t.board, grew = false;
  for (let tries = 0; tries < 30; tries++) {
    p = findPlacement(lay, bd, ids, at, locked);
    if (p) return { layout: applyPlacement(lay, ids, p), board: bd, placement: p, tidied: true, grew };
    bd = grow(bd);
    grew = true;
  }
  return null;
}

// 저장된 테이블(조합 목록)만 있을 때 바닥 배치 만들기
export function layoutFromTable(table, board = DEFAULT_BOARD) {
  const flat = {};
  table.forEach((set, r) => set.forEach((id, i) => { flat[id] = [r, i]; }));
  return tidy(flat, { ...board, rows: Math.max(board.rows, table.length) });
}
