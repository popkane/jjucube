// 테이블 바닥(격자) 배치. 같은 줄에서 빈칸 없이 붙어 있는 타일들이 한 조합이다.
// layout = { [타일id]: [줄, 칸] }, board = { rows, cols }. 화면과 무관한 순수 함수만 둔다.
import { analyzeSet, tileOf, sortRack } from './engine.js';

export const DEFAULT_BOARD = { rows: 4, cols: 14 };

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

// 공식 앱처럼: 놓은 칸에 정확히 놓는다. 그 칸들이 비어 있으면 그대로 놓고,
// 타일이 있으면 그 자리부터 오른쪽을 밀어서 자리를 만든다. 알아서 붙이거나 다른 데로 옮기지 않는다.
// ids = 놓을 묶음(왼→오 순서), at = { row, col, grab }(grab = 손가락으로 잡은 타일이 묶음에서 몇 번째인지)
// 돌려주는 값: { layout, board, row, start, count, pushed }
export function placeAt(layout, board, ids, at) {
  const k = ids.length;
  const row = Math.max(0, at.row);
  const start = Math.max(0, at.col - (at.grab || 0));
  const out = without(layout, ids);
  const line = [];
  for (const [id, [r, c]] of Object.entries(out)) if (r === row) { line[c] = Number(id); delete out[id]; }
  for (let i = 0; i < line.length; i++) if (line[i] === undefined) line[i] = null;
  let free = true;
  for (let c = start; c < start + k; c++) if (c < line.length && line[c] !== null) free = false;
  while (line.length < start) line.push(null);
  if (free) ids.forEach((id, i) => { line[start + i] = id; });
  else line.splice(start, 0, ...ids);
  line.forEach((id, c) => { if (id !== null && id !== undefined) out[id] = [row, c]; });
  tidySegmentAt(out, row, start);
  return {
    layout: out,
    board: { rows: Math.max(board.rows, row + 1), cols: Math.max(board.cols, line.length) },
    row, start, count: k, pushed: !free,
  };
}

// 놓은 자리가 속한 조합이 맞는 조합이면 칸은 그대로 두고 순서만 보기 좋게 (런은 숫자 순, 조커는 놓은 쪽)
function tidySegmentAt(layout, row, col) {
  const seg = segments(layout).find((s) => s.row === row && col >= s.start && col < s.start + s.ids.length);
  if (!seg || !analyzeSet(seg.ids).valid) return;
  setOrder(seg.ids).forEach((id, i) => { layout[id] = [row, seg.start + i]; });
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
