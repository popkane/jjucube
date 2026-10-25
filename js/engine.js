// 루미뀨브 규칙 엔진 — 화면·네트워크와 상관없는 순수 함수만 둔다.
// 게임 상태는 그대로 JSON으로 저장·전송할 수 있는 평범한 객체다(나중에 Firebase에 그대로 올림).

export const COLORS = ['r', 'b', 'y', 'k']; // 빨강·파랑·노랑·검정
export const COLOR_NAMES = { r: '빨강', b: '파랑', y: '노랑', k: '검정' };
export const JOKER_IDS = [104, 105];
export const TILE_COUNT = 106;
export const JOKER_PENALTY = 30;

export const DEFAULT_CONFIG = {
  initialMeldPoints: 30, // 첫 등록 최소 합
  penaltyDraws: 1,       // 벌칙으로 가져갈 장수 (집 규칙: 1장)
  turnSeconds: 60,       // 한 차례 제한 시간 — 호스트가 TURN_SECONDS_OPTIONS 중에서 고름
  rackSize: 14,
};
export const TURN_SECONDS_OPTIONS = [60, 90, 120];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

// 타일 번호 0~103: 색 = id/26, 숫자 = id%13+1 (같은 타일이 두 장씩). 104·105는 조커.
export function tileOf(id) {
  if (id >= 104) return { id, joker: true };
  return { id, color: COLORS[Math.floor(id / 26)], num: (id % 13) + 1 };
}

export function tileValue(id) {
  const t = tileOf(id);
  return t.joker ? JOKER_PENALTY : t.num;
}

export function rackValue(ids) {
  return ids.reduce((s, id) => s + tileValue(id), 0);
}

// 받침대 정렬: 'number'는 숫자→색, 'color'는 색→숫자. 조커는 맨 뒤.
export function sortRack(ids, by = 'number') {
  const key = (id) => {
    const t = tileOf(id);
    if (t.joker) return [99, 99, id];
    const c = COLORS.indexOf(t.color);
    return by === 'color' ? [c, t.num, id] : [t.num, c, id];
  };
  return [...ids].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}

// ---------- 조합 판정 ----------

function analyzeGroup(tiles) {
  const reals = tiles.filter((t) => !t.joker);
  const jokers = tiles.filter((t) => t.joker);
  if (tiles.length > 4 || reals.length === 0) return null;
  const num = reals[0].num;
  if (reals.some((t) => t.num !== num)) return null;
  const colors = new Set(reals.map((t) => t.color));
  if (colors.size !== reals.length) return null;
  const missing = COLORS.filter((c) => !colors.has(c));
  const sortedReals = [...reals].sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
  return {
    type: 'group',
    value: num * tiles.length,
    order: [...sortedReals, ...jokers].map((t) => t.id),
    // 그룹의 조커는 빠진 색 중 아무거나로 대신할 수 있다
    jokers: jokers.map((j) => ({ id: j.id, num, colors: missing })),
  };
}

function analyzeRun(tiles) {
  const reals = tiles.filter((t) => !t.joker);
  const jokers = tiles.filter((t) => t.joker);
  const n = tiles.length;
  if (reals.length === 0 || n > 13) return null;
  const color = reals[0].color;
  if (reals.some((t) => t.color !== color)) return null;
  const nums = reals.map((t) => t.num);
  if (new Set(nums).size !== nums.length) return null;
  const min = Math.min(...nums), max = Math.max(...nums);
  if (max - min + 1 > n) return null;
  // 남는 조커는 높은 쪽부터 붙이고, 13을 넘으면 낮은 쪽으로
  const hi = Math.min(13, min + n - 1);
  const lo = hi - n + 1;
  if (lo < 1) return null;
  const byNum = new Map(reals.map((t) => [t.num, t]));
  const freeJokers = [...jokers];
  const order = [];
  const jokerInfo = [];
  let value = 0;
  for (let v = lo; v <= hi; v++) {
    value += v;
    if (byNum.has(v)) order.push(byNum.get(v).id);
    else {
      const j = freeJokers.shift();
      order.push(j.id);
      jokerInfo.push({ id: j.id, num: v, colors: [color] });
    }
  }
  return { type: 'run', value, order, jokers: jokerInfo };
}

// 조합 하나를 판정한다. 그룹과 런 둘 다 되면(예: 빨강7+조커2) 점수가 큰 쪽으로 본다.
export function analyzeSet(ids) {
  if (!Array.isArray(ids) || ids.length < 3) return { valid: false, reason: '3장 이상이어야 해요' };
  const tiles = ids.map(tileOf);
  const options = [analyzeGroup(tiles), analyzeRun(tiles)].filter(Boolean);
  if (options.length === 0) return { valid: false, reason: '같은 숫자 다른 색, 또는 같은 색 연속 숫자여야 해요' };
  options.sort((a, b) => b.value - a.value);
  return { valid: true, ...options[0] };
}

// ---------- 게임 진행 ----------

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newGame({ config = {}, players = 2, rng = Math.random } = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) throw new Error(`${MIN_PLAYERS}~${MAX_PLAYERS}명만 할 수 있어요`);
  if (!TURN_SECONDS_OPTIONS.includes(cfg.turnSeconds)) throw new Error(`제한 시간은 ${TURN_SECONDS_OPTIONS.join('/')}초 중에서 골라요`);
  const pool = shuffle([...Array(TILE_COUNT).keys()], rng);
  const racks = [];
  for (let p = 0; p < players; p++) racks.push(pool.splice(0, cfg.rackSize));
  return {
    config: cfg,
    players,
    pool,
    racks,
    table: [],
    melded: Array(players).fill(false),
    current: Math.floor(rng() * players),
    passes: 0, // 풀이 비었을 때 연속으로 못 낸 횟수
    turn: 1,
    status: 'playing',
    winner: null,
    scores: null,
    last: null, // 마지막 행동 기록 (화면 알림용)
  };
}

const setKey = (ids) => [...ids].sort((a, b) => a - b).join(',');

// 차례를 끝낼 때 테이블 모양이 규칙에 맞는지 검사한다. 상태는 바꾸지 않는다.
export function validateTurn(state, player, newTable) {
  const rack = state.racks[player];
  const oldIds = state.table.flat();
  const newIds = newTable.flat();
  if (new Set(newIds).size !== newIds.length) return { ok: false, error: '같은 타일이 두 번 놓였어요' };
  const newSet = new Set(newIds);
  if (oldIds.some((id) => !newSet.has(id))) return { ok: false, error: '테이블의 타일은 손으로 가져올 수 없어요' };
  const oldSet = new Set(oldIds);
  const played = newIds.filter((id) => !oldSet.has(id));
  const rackSet = new Set(rack);
  if (played.some((id) => !rackSet.has(id))) return { ok: false, error: '내 받침대에 없는 타일이에요' };
  if (played.length === 0) return { ok: false, error: '타일을 1장 이상 내야 해요' };

  const analyses = newTable.map(analyzeSet);
  const badIndex = analyses.findIndex((a) => !a.valid);
  if (badIndex >= 0) return { ok: false, error: '맞지 않는 조합이 있어요', badSets: analyses.map((a, i) => (a.valid ? -1 : i)).filter((i) => i >= 0) };

  if (!state.melded[player]) {
    // 첫 등록: 기존 조합은 그대로 두고, 내 타일로만 새 조합을 만들어 합이 기준 이상
    const newKeys = new Set(newTable.map(setKey));
    if (state.table.some((s) => !newKeys.has(setKey(s)))) return { ok: false, error: '첫 등록 전에는 테이블 조합을 건드릴 수 없어요' };
    const playedSet = new Set(played);
    let points = 0;
    for (let i = 0; i < newTable.length; i++) {
      const s = newTable[i];
      const mine = s.filter((id) => playedSet.has(id)).length;
      if (mine === 0) continue;
      if (mine !== s.length) return { ok: false, error: '첫 등록은 내 타일로만 해야 해요' };
      points += analyses[i].value;
    }
    const need = state.config.initialMeldPoints;
    if (points < need) return { ok: false, error: `첫 등록은 합이 ${need} 이상이어야 해요 (지금 ${points})`, points };
  }
  return { ok: true, played, table: analyses.map((a) => a.order) };
}

function nextTurn(s) {
  s.current = (s.current + 1) % s.players;
  s.turn += 1;
  return s;
}

function finish(s, winner) {
  s.status = 'ended';
  const totals = s.racks.map(rackValue);
  if (winner === null) {
    // 풀이 비고 아무도 못 내서 끝: 남은 합이 가장 적은 사람이 승리
    const min = Math.min(...totals);
    const best = totals.map((t, i) => (t === min ? i : -1)).filter((i) => i >= 0);
    winner = best.length === 1 ? best[0] : null; // 동점이면 무승부
    s.scores = totals.map((t) => (t === min ? 0 : -(t - min)));
  } else {
    s.scores = totals.map((t) => -t);
  }
  if (winner !== null) {
    s.scores[winner] = -s.scores.reduce((sum, v, i) => (i === winner ? sum : sum + v), 0);
  }
  s.winner = winner;
  s.totals = totals;
  return s;
}

function checkTurn(state, player) {
  if (state.status !== 'playing') throw new Error('게임이 끝났어요');
  if (state.current !== player) throw new Error('내 차례가 아니에요');
}

// 테이블에 내고 차례 끝내기. 규칙에 안 맞으면 상태는 그대로 두고 error를 돌려준다.
export function submitTurn(state, player, newTable) {
  checkTurn(state, player);
  const v = validateTurn(state, player, newTable);
  if (!v.ok) return { ...v, state };
  const s = structuredClone(state);
  const played = new Set(v.played);
  s.table = v.table;
  s.racks[player] = s.racks[player].filter((id) => !played.has(id));
  s.melded[player] = true;
  s.passes = 0;
  s.last = { player, action: 'play', count: v.played.length };
  if (s.racks[player].length === 0) return { ok: true, state: finish(s, player) };
  return { ok: true, state: nextTurn(s) };
}

// 풀에서 count장 가져오고 차례를 넘긴다. 풀이 비어 있으면 '패스'로 센다.
function drawAndPass(state, player, count, action) {
  checkTurn(state, player);
  const s = structuredClone(state);
  const n = Math.min(count, s.pool.length);
  if (n === 0) {
    s.passes += 1;
    s.last = { player, action: 'pass' };
    if (s.passes >= s.players) return finish(s, null);
    return nextTurn(s);
  }
  s.racks[player].push(...s.pool.splice(s.pool.length - n, n));
  s.passes = 0;
  s.last = { player, action, count: n };
  return nextTurn(s);
}

// 낼 게 없거나 안 내기로 하고 1장 가져오기
export function drawTile(state, player) {
  return drawAndPass(state, player, 1, 'draw');
}

// 시간 초과 또는 틀린 채로 포기: 테이블은 그대로(원래대로) 두고 벌칙 장수만큼 가져오기
export function penalize(state, player) {
  return drawAndPass(state, player, state.config.penaltyDraws, 'penalty');
}
