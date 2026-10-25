// 테이블 바닥(격자) 배치. 같은 줄에서 빈칸 없이 붙어 있는 타일들이 한 조합이다.
// layout = { [타일id]: [줄, 칸] }, board = { rows, cols }. 화면과 무관한 순수 함수만 둔다.
import { analyzeSet, tileOf, sortRack } from './engine.js';

export const DEFAULT_BOARD = { rows: 4, cols: 14 }; // 공식 앱처럼 처음엔 크게, 모자라면 늘리며 작아짐

// 줄 수에 따라 넓혀도 되는 칸 수. 테이블 자리가 가로로 긴 모양(대략 가로:세로 = 2.6:1, 타일 세로/가로 1.36)이라
// 이만큼까지는 판을 넓히는 게 줄을 하나 늘리는 것보다 타일이 크다. 넘치면 넓히지 않고 다른 줄로 보낸다
export const colLimit = (rows) => Math.max(DEFAULT_BOARD.cols, Math.floor(3.5 * (rows + 1)));

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

// ---------- 타일 놓기 (공식 앱 방식, 캡처 분석 결과) ----------
// 1) 놓을 곳 = 끄는 타일에서 가장 가까운 빈칸(여러 장이면 연속된 빈칸). 다른 줄·엉뚱한 곳으로 옮기지 않는다.
// 2) 놓은 뒤 그 줄에서 붙어 있는 묶음을 '맞는 조합'끼리 다시 나눈다
//    (예: 9 10 11 12 13 에 11을 붙이면 → 9 10 11 | 11 12 13, 2 3 4 와 10 11 12 13 사이에 9 → 2 3 4 | 9 10 11 12 13)
// 3) 나뉜 조합 사이·다른 조합과는 한 칸씩 띄운다. 밀 때는 오른쪽으로, 끝에 닿으면 왼쪽으로. 그래도 모자라면 판을 넓힌다.

// 끄는 묶음(k장)을 놓을 가장 가까운 연속 빈칸. at = { colF, rowF }: 첫 타일 중심이 놓인 칸 좌표(실수)
// skip: 빼고 볼 줄 (거기 놓으면 줄이 넘쳐 다른 줄로 밀려나는 경우)
export function nearestFree(layout, board, ids, at, skip = null) {
  const k = ids.length;
  const g = makeGrid(without(layout, ids), board);
  let best = null;
  // 판 양쪽 바깥 한 칸도 후보: 왼쪽 끝에 붙은 조합 앞에 놓으면 그 줄이 오른쪽으로 밀리며 들어간다 (오른쪽 끝도 마찬가지)
  const empty = (r, c) => c < 0 || c >= board.cols || g[r][c] === null;
  for (let r = 0; r < board.rows; r++) {
    if (skip?.has(r)) continue;
    for (let s = -k; s <= board.cols; s++) {
      // 바깥은 '완전히 바깥이면서 끝 칸에 바로 붙는' 자리만, 그리고 끝 칸이 차 있을 때만
      if (s < 0 && (s !== -k || empty(r, 0))) continue;
      if (s + k > board.cols && (s !== board.cols || empty(r, board.cols - 1))) continue;
      let ok = true;
      for (let c = s; c < s + k; c++) if (!empty(r, c)) { ok = false; break; }
      if (!ok) continue;
      const d = Math.hypot(s + 0.5 - at.colF, (r + 0.5 - at.rowF) * 1.25);
      if (!best || d < best.d) best = { row: r, start: s, d };
    }
  }
  return best;
}

// 붙어 있는 타일 줄(seq)을 맞는 조합 위주로 나눈다 (순서는 그대로, 동적 계획법)
// locked: 첫 등록 전이면 기존 테이블 타일 — 내 타일과 한 조합으로 묶지 않는다
function partition(seq, locked) {
  const score = (p) => {
    if (locked && p.some((id) => locked.has(id)) && p.some((id) => !locked.has(id))) return -1000;
    if (analyzeSet(p).valid) return 10 * p.length;
    if (couldBeSet(p)) return 2 * p.length;
    return -4 * p.length;
  };
  const best = [{ score: 0, cuts: [] }];
  for (let i = 1; i <= seq.length; i++) {
    for (let j = 0; j < i; j++) {
      if (!best[j]) continue;
      const v = best[j].score + score(seq.slice(j, i)) - 1;
      if (!best[i] || v > best[i].score) best[i] = { score: v, cuts: [...best[j].cuts, i] };
    }
  }
  const pieces = [];
  let from = 0;
  for (const to of best[seq.length].cuts) { pieces.push(seq.slice(from, to)); from = to; }
  return pieces;
}

// 한 줄 정리: anchor 타일이 든 묶음을 조합끼리 나누고, 줄 전체에서 조합 사이 한 칸 간격을 맞춘다
function settleRow(layout, board, row, anchor, locked, dropped = []) {
  const segs = segments(layout).filter((x) => x.row === row);
  const blocks = [];
  for (const seg of segs) {
    if (seg.ids.includes(anchor)) {
      let off = 0;
      for (const p of partition(seg.ids, locked)) {
        blocks.push({ ids: analyzeSet(p).valid ? setOrder(p) : p, want: seg.start + off });
        off += p.length;
      }
    } else blocks.push({ ids: seg.ids, want: seg.start });
  }
  for (const seg of segs) for (const id of seg.ids) delete layout[id];
  // 줄이 많이 넘치면 판을 넓히지 않고(너무 넓히면 타일이 작아져 폰에서 조작이 힘듦) 다른 줄 빈 곳으로 옮긴다:
  // 놓은 타일이 어디에도 안 붙고 따로 있으면 그것을, 붙었으면 놓은 곳에서 먼 조합부터
  let rows = board.rows;
  const need = () => blocks.reduce((sum, bl) => sum + bl.ids.length, 0) + blocks.length - 1;
  while (need() > colLimit(rows)) {
    const home = blocks.findIndex((bl) => bl.ids.includes(anchor));
    let far = -1;
    if (home >= 0 && blocks.length > 1 && blocks[home].ids.every((id) => dropped.includes(id))) far = home;
    else blocks.forEach((bl, i) => { if (i !== home && (far < 0 || Math.abs(i - home) > Math.abs(far - home))) far = i; });
    if (far < 0) break; // 놓은 조합 하나만으로도 넘치면 그때만 넓힌다
    const [bl] = blocks.splice(far, 1);
    let spot = freeSpotNear(layout, { ...board, rows }, bl.ids.length, row, bl.want);
    while (!spot) { rows += 1; spot = freeSpotNear(layout, { ...board, rows }, bl.ids.length, row, bl.want); }
    bl.ids.forEach((id, k) => { layout[id] = [spot.row, spot.start + k]; });
  }
  const { pos, cols } = packRow(blocks, board.cols);
  blocks.forEach((bl, i) => bl.ids.forEach((id, k) => { layout[id] = [row, pos[i] + k]; }));
  return { cols, rows };
}

// k장이 다른 조합과 안 붙게 들어갈 빈 곳 중 (row, col)에 가장 가까운 곳 (그 줄 자체는 빼고)
function freeSpotNear(layout, board, k, row, col) {
  const g = makeGrid(layout, board);
  let best = null;
  for (let r = 0; r < board.rows; r++) {
    if (r === row) continue;
    for (let s = 0; s + k <= board.cols; s++) {
      let ok = (s === 0 || g[r][s - 1] === null) && (s + k === board.cols || g[r][s + k] === null);
      for (let i = s; ok && i < s + k; i++) if (g[r][i] !== null) ok = false;
      if (!ok) continue;
      const d = Math.abs(r - row) * 3 + Math.abs(s - col);
      if (!best || d < best.d) best = { row: r, start: s, d };
    }
  }
  return best;
}

// 한 줄의 묶음들(want 순서)을 원하는 칸에 두되 서로 한 칸 이상 띄운다.
// 오른쪽 끝을 넘으면 오른쪽부터 왼쪽으로 밀고, 그래도 모자라면 판을 넓힌다. 돌려주는 값: { pos, cols }
function packRow(blocks, cols) {
  const pos = [];
  const leftPass = (useWant) => {
    blocks.forEach((bl, i) => {
      const min = i === 0 ? 0 : pos[i - 1] + blocks[i - 1].ids.length + 1;
      pos[i] = useWant ? Math.max(bl.want, min) : min;
    });
  };
  leftPass(true);
  const last = blocks.length - 1;
  if (last >= 0 && pos[last] + blocks[last].ids.length > cols) {
    // 오른쪽 끝을 넘으면 오른쪽부터 왼쪽으로 밀어 넣는다
    pos[last] = cols - blocks[last].ids.length;
    for (let i = last - 1; i >= 0; i--) pos[i] = Math.min(pos[i], pos[i + 1] - blocks[i].ids.length - 1);
    if (pos[0] < 0) { // 그래도 모자라면 판을 넓힌다 (타일이 작아짐)
      cols = blocks.reduce((sum, bl) => sum + bl.ids.length, 0) + blocks.length - 1;
      leftPass(false);
    }
  }
  return { pos, cols };
}

// 테이블 조합에서 타일을 빼 갔을 때, 남은 타일끼리 맞는 조합이면 빈칸을 메워 붙인다 (왼쪽은 그대로, 오른쪽이 당겨짐)
// 예: 5 5 5 5 에서 가운데 하나 → 5 5 5, 3 4 5 6 7 에서 가운데 5 → 3 4 _ 6 7 은 안 맞으니 그대로
// 빼 간 타일을 원래 조합 자리 안에 다시 놓는 중이면 건드리지 않는다
function closeGaps(out, before, ids, spot) {
  const moving = new Set(ids);
  for (const seg of segments(before)) {
    if (!seg.ids.some((id) => moving.has(id))) continue;
    const end = seg.start + seg.ids.length - 1;
    if (spot.row === seg.row && spot.start >= seg.start && spot.start <= end) continue;
    const rest = seg.ids.filter((id) => !moving.has(id));
    if (rest.length < 3 || !analyzeSet(rest).valid) continue;
    rest.forEach((id, i) => { out[id] = [seg.row, seg.start + i]; });
  }
}

// ids를 spot(={row,start})에 놓고 그 줄을 정리한다. 돌려주는 값: { layout, board }
// spot.insert 이면 끼워 넣기: 그 줄에서 spot.start 칸부터 오른쪽 타일을 k칸 밀고 그 자리에 넣는다
// (예: 4 5 6 7 8 9 의 6과 7 사이에 7 → 4 5 6 7 | 7 8 9 로 나뉘며 7 8 9가 밀림)
export function dropTiles(layout, board, ids, spot, locked = null) {
  const out = without(layout, ids);
  closeGaps(out, layout, ids, spot);
  if (spot.insert) {
    for (const [id, [r, c]] of Object.entries(out)) if (r === spot.row && c >= spot.start) out[id] = [r, c + ids.length];
  }
  ids.forEach((id, i) => { out[id] = [spot.row, spot.start + i]; });
  const { cols, rows } = settleRow(out, { ...board, rows: Math.max(board.rows, spot.row + 1) }, spot.row, ids[0], locked, ids);
  return { layout: out, board: { rows, cols: Math.max(board.cols, cols) } };
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

// 빈 곳 찾기: 양옆이 비어 있어서 다른 조합과 붙지 않는 자리 중 판 가운데에 가장 가까운 곳
// (공식 앱 3인용 캡처: 새로 낸 조합은 가운데부터 채워지고, 위·아래 줄로 퍼진다)
function freeSpot(layout, board, k) {
  const g = makeGrid(layout, board);
  const rc = (board.rows - 1) / 2, cc = (board.cols - k) / 2;
  let best = null;
  for (let r = 0; r < board.rows; r++) {
    for (let s = 0; s + k <= board.cols; s++) {
      let ok = (s === 0 || g[r][s - 1] === null) && (s + k === board.cols || g[r][s + k] === null);
      for (let i = s; ok && i < s + k; i++) if (g[r][i] !== null) ok = false;
      if (!ok) continue;
      const d = Math.abs(r - rc) * 2 + Math.abs(s - cc);
      if (!best || d < best.d) best = { row: r, start: s, d };
    }
  }
  return best;
}

// 조합 목록(컴퓨터가 낸 결과)을 바닥에 놓는다. 공식 앱처럼 테이블을 통째로 다시 깔지 않는다:
//  - 그대로인 조합은 제자리
//  - 바뀐 조합(옛 조합에 타일을 붙이거나 나눈 것)은 타일이 가장 많이 있던 옛 조합 자리에 두고, 그 줄만 한 칸 간격으로 맞춘다
//  - 받침대에서 새로 낸 조합은 가운데에 가까운 빈 곳. 없으면 줄을 늘린다(타일이 작아짐)
export function arrangeTable(layout, board, table) {
  // 같은 타일들로 된 조합이면(순서가 달라도) 제자리에 그대로 둔다
  const key = (ids) => [...ids].sort((x, y) => x - y).join(',');
  const segs = segments(layout);
  const keep = new Map(segs.map((s) => [key(s.ids), s]));
  const segOf = new Map();
  for (const s of segs) for (const id of s.ids) segOf.set(id, s);
  const out = {};
  const moved = [];
  const fresh = [];
  for (const set of table) {
    const ids = setOrder(set) || set;
    const s = keep.get(key(ids));
    if (s) {
      s.ids.forEach((id, i) => { out[id] = [s.row, s.start + i]; });
      keep.delete(key(ids));
      continue;
    }
    const count = new Map();
    for (const id of ids) { const o = segOf.get(id); if (o) count.set(o, (count.get(o) || 0) + 1); }
    let home = null;
    for (const [o, n] of count) if (!home || n > count.get(home)) home = o;
    if (!home) { fresh.push(ids); continue; }
    // 옛 조합 안에서 내 타일이 처음 나오는 위치 → 나뉜 조합(4 5 6 7 | 7 8 9)도 원래 순서대로
    const first = Math.min(...ids.map((id) => home.ids.indexOf(id)).filter((i) => i >= 0));
    moved.push({ ids, row: home.row, want: home.start + first });
  }
  let bd = { ...board, cols: Math.max(board.cols, ...table.map((t) => t.length)) };
  for (const row of new Set(moved.map((m) => m.row))) {
    const blocks = segments(out).filter((x) => x.row === row).map((x) => ({ ids: x.ids, want: x.start }));
    blocks.push(...moved.filter((m) => m.row === row));
    blocks.sort((a, b) => a.want - b.want);
    for (const bl of blocks) for (const id of bl.ids) delete out[id];
    // 줄이 많이 넘치면 판을 넓히지 않고 맨 끝 조합부터 다른 줄 빈 곳으로
    while (blocks.length > 1 && blocks.reduce((sum, bl) => sum + bl.ids.length + 1, -1) > colLimit(bd.rows)) {
      const bl = blocks.pop();
      let spot = freeSpotNear(out, bd, bl.ids.length, row, bl.want);
      while (!spot) { bd = { ...bd, rows: bd.rows + 1 }; spot = freeSpotNear(out, bd, bl.ids.length, row, bl.want); }
      bl.ids.forEach((id, k) => { out[id] = [spot.row, spot.start + k]; });
    }
    const { pos, cols } = packRow(blocks, bd.cols);
    blocks.forEach((bl, i) => bl.ids.forEach((id, k) => { out[id] = [row, pos[i] + k]; }));
    bd = { ...bd, cols: Math.max(bd.cols, cols) };
  }
  for (const ids of fresh) {
    let spot = freeSpot(out, bd, ids.length);
    // 빈 곳이 없으면 줄을 늘리기 전에(타일이 작아짐) 한 줄씩 조합을 왼쪽으로 모아 자리를 만들어 본다
    for (let r = 0; !spot && r < bd.rows; r++) {
      const trial = { ...out };
      let c = 0;
      for (const seg of segments(out).filter((x) => x.row === r)) {
        seg.ids.forEach((id, i) => { trial[id] = [r, c + i]; });
        c += seg.ids.length + 1;
      }
      const s2 = freeSpot(trial, bd, ids.length);
      if (s2) { Object.assign(out, trial); spot = s2; }
    }
    // 그래도 없으면 넓혀도 되는 만큼 넓혀 보고, 마지막에 줄을 늘린다
    while (!spot) {
      const wide = { ...bd, cols: colLimit(bd.rows) };
      spot = wide.cols > bd.cols ? freeSpot(out, wide, ids.length) : null;
      bd = spot ? wide : { ...bd, rows: bd.rows + 1 };
      spot = spot || freeSpot(out, bd, ids.length);
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
