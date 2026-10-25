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
// ids는 바닥에 놓인 순서(왼→오). 런에서 남는 조커는 놓인 쪽을 따른다: 숫자 앞에 놓았으면 앞(작은 수), 뒤면 뒤.
export function setOrder(ids) {
  const a = analyzeSet(ids);
  if (a.valid && a.type === 'run') return runOrder(ids, a);
  if (a.valid) return a.order;
  if (!couldBeSet(ids)) return null;
  const reals = ids.map(tileOf).filter((t) => !t.joker);
  const run = reals.length === 2 && reals[0].color === reals[1].color;
  return sortRack(ids, run ? 'color' : 'number');
}

function runOrder(ids, a) {
  const tiles = ids.map(tileOf);
  const reals = tiles.filter((t) => !t.joker);
  const jokers = tiles.filter((t) => t.joker);
  const min = Math.min(...reals.map((t) => t.num));
  const max = Math.max(...reals.map((t) => t.num));
  const extra = ids.length - (max - min + 1); // 빈 숫자를 채우고도 남는 조커
  if (extra <= 0 || jokers.length === 0) return a.order;
  const leading = tiles.findIndex((t) => !t.joker); // 첫 숫자 앞에 놓인 조커 수
  let low = Math.min(extra, leading, min - 1);
  if (max + (extra - low) > 13) low = extra - (13 - max); // 13을 넘으면 앞으로
  const lo = min - low;
  const byNum = new Map(reals.map((t) => [t.num, t.id]));
  const free = jokers.map((t) => t.id);
  return Array.from({ length: ids.length }, (_, i) => byNum.get(lo + i) ?? free.shift());
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
  // 같은 줄에서 손가락(떠 있는 타일)에 가장 가까운 조합: 빈칸 하나를 두고 양쪽에 조합이 있을 때 어느 쪽에 붙일지 정한다
  const colF = at.colF ?? at.col + 0.5;
  let near = null;
  let nearD = Infinity;
  for (const s of segments(without(layout, ids))) {
    if (s.row !== at.row) continue;
    const d = colF < s.start ? s.start - colF : colF > s.start + s.ids.length ? colF - s.start - s.ids.length : 0;
    if (d < nearD) { nearD = d; near = s.ids[0]; }
  }
  const NEAR_BONUS = 0.75;
  const nearBonus = (merged) => (near !== null && nearD < 1.5 && merged.includes(near) ? NEAR_BONUS : 0);
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
        cand = { row: r, start: a, order: setOrder(merged), merge: true, score: dr + dc - SNAP - nearBonus(merged) };
      } else {
        cand = { row: r, start: s, order: block, merge: false, score: dr + Math.abs(s - want) };
      }
      // 점수가 같으면 따로 놓는 쪽을 고른다 (두 칸 이상 떨어뜨려 놓았으면 붙이지 않음)
      if (!best || cand.score < best.score || (cand.score === best.score && best.merge && !cand.merge)) best = cand;
    }
  }
  // 조합 옆에 붙일 자리가 없을 때(바로 옆에 다른 조합이 있어서 닿아 버리는 경우):
  // 조합되는 묶음이면 그 조합을 통째로 옆으로 밀거나 빈 곳으로 옮겨서 붙인다
  for (const seg of segments(without(layout, ids))) {
    if (locked && seg.ids.some((id) => locked.has(id))) continue;
    // 조합 왼쪽(첫 타일 포함)에 놓았으면 앞에, 아니면 뒤에 붙인 것으로 본다
    const merged = at.row === seg.row && at.col <= seg.start ? [...block, ...seg.ids] : [...seg.ids, ...block];
    if (!couldBeSet(merged)) continue;
    const spot = relocateSpot(g, board, seg, merged.length);
    if (!spot) continue;
    const end = seg.start + seg.ids.length - 1;
    const dr = Math.abs(seg.row - at.row) * ROW_WEIGHT;
    const dc = at.col < seg.start ? seg.start - at.col : at.col > end ? at.col - end : 0;
    // 제자리에서 붙일 수 있으면 그쪽이 먼저 (옮기는 건 조금 손해로 침)
    const cand = { row: spot.row, start: spot.start, order: setOrder(merged), merge: true, score: dr + dc - SNAP + 0.5 - nearBonus(merged) };
    if (!best || cand.score < best.score) best = cand;
  }
  return best;
}

// 조합 seg를 길이 m으로 늘려 놓을 자리: 오른쪽으로 늘리기 → 왼쪽으로 늘리기 → 가장 가까운 빈 곳 (양옆 한 칸은 비워야 함)
function relocateSpot(g, board, seg, m) {
  const own = new Set(seg.ids);
  const isFree = (r, c) => c >= 0 && c < board.cols && (g[r][c] === null || own.has(g[r][c]));
  const fits = (r, s) => {
    if (s < 0 || s + m > board.cols) return false;
    for (let c = s; c < s + m; c++) if (!isFree(r, c)) return false;
    return (s === 0 || isFree(r, s - 1)) && (s + m === board.cols || isFree(r, s + m));
  };
  const end = seg.start + seg.ids.length - 1;
  if (fits(seg.row, seg.start)) return { row: seg.row, start: seg.start };
  if (fits(seg.row, end - m + 1)) return { row: seg.row, start: end - m + 1 };
  let best = null;
  for (let r = 0; r < board.rows; r++) {
    for (let s = 0; s + m <= board.cols; s++) {
      if (!fits(r, s)) continue;
      const d = Math.abs(r - seg.row) * ROW_WEIGHT + Math.abs(s - seg.start);
      if (!best || d < best.d) best = { row: r, start: s, d };
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

// 빈 곳 찾기: 양옆이 비어 있어서 다른 조합과 붙지 않는 자리 (위에서부터)
function freeSpot(layout, board, k) {
  const g = makeGrid(layout, board);
  for (let r = 0; r < board.rows; r++) {
    for (let s = 0; s + k <= board.cols; s++) {
      let ok = (s === 0 || g[r][s - 1] === null) && (s + k === board.cols || g[r][s + k] === null);
      for (let i = s; ok && i < s + k; i++) if (g[r][i] !== null) ok = false;
      if (ok) return { row: r, start: s };
    }
  }
  return null;
}

// 조합 목록(컴퓨터가 낸 결과)을 바닥에 놓는다: 그대로인 조합은 제자리, 바뀌었거나 새로 생긴 조합은 빈 곳에.
// 빈 곳이 없으면 정돈해 보고, 그래도 없으면 줄을 늘린다.
export function arrangeTable(layout, board, table) {
  // 같은 타일들로 된 조합이면(순서가 달라도) 제자리에 그대로 둔다
  const key = (ids) => [...ids].sort((x, y) => x - y).join(',');
  const keep = new Map(segments(layout).map((s) => [key(s.ids), s]));
  let out = {};
  const pending = [];
  for (const set of table) {
    const ids = setOrder(set) || set;
    const s = keep.get(key(ids));
    if (s) {
      s.ids.forEach((id, i) => { out[id] = [s.row, s.start + i]; });
      keep.delete(key(ids));
    } else pending.push(ids);
  }
  let bd = { ...board, cols: Math.max(board.cols, ...pending.map((p) => p.length)) };
  let tidied = false;
  for (const ids of pending) {
    let spot = freeSpot(out, bd, ids.length);
    if (!spot && !tidied) {
      ({ layout: out, board: bd } = tidy(out, bd));
      tidied = true;
      spot = freeSpot(out, bd, ids.length);
    }
    while (!spot) {
      bd = { ...bd, rows: bd.rows + 1 };
      spot = freeSpot(out, bd, ids.length);
    }
    ids.forEach((id, i) => { out[id] = [spot.row, spot.start + i]; });
  }
  return { layout: out, board: bd };
}

// 조합 하나를 테이블 빈 곳에 놓는다 (받침대에서 한 번에 내기). 자리가 없으면 정돈 → 그래도 없으면 줄을 늘린다.
export function placeFree(layout, board, ids) {
  const order = setOrder(ids) || ids;
  let lay = { ...layout };
  for (const id of ids) delete lay[id];
  let bd = { ...board, cols: Math.max(board.cols, order.length) };
  let spot = freeSpot(lay, bd, order.length);
  let tidied = false;
  if (!spot) {
    ({ layout: lay, board: bd } = tidy(lay, bd));
    tidied = true;
    spot = freeSpot(lay, bd, order.length);
  }
  while (!spot) {
    bd = { ...bd, rows: bd.rows + 1 };
    spot = freeSpot(lay, bd, order.length);
  }
  order.forEach((id, i) => { lay[id] = [spot.row, spot.start + i]; });
  return { layout: lay, board: bd, tidied };
}
