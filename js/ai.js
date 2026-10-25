// 컴퓨터 상대. 게임 상태를 받아 '낼 테이블' 또는 '1장 받기'를 정한다. 화면·네트워크와 무관한 순수 함수.
//   초보 easy   : 받침대 타일끼리만 조합 (조커 안 씀, 한 번에 두 조합까지)
//   중수 normal : 받침대 조합 + 테이블 조합 끝에 붙이기
//   고수 hard   : 테이블 전체 + 받침대를 합쳐 다시 짜서 최대한 많이 냄, 조커는 아낌
import { analyzeSet, validateTurn } from './engine.js';

export const LEVELS = { easy: '초보', normal: '중수', hard: '고수' };
const THINK_MS = { easy: 150, normal: 300, hard: 1500 };

// 종류 번호 = 색*13 + (숫자-1), 0~51. 조커는 -1
const KINDS = 52;
const kindOf = (id) => (id >= 104 ? -1 : Math.floor(id / 26) * 13 + (id % 13));

// ---------- 조합 찾기 (깊이 우선 탐색) ----------
// 종류를 작은 번호부터 보면서, 그 종류를 '가장 작은 종류'로 갖는 조합만 만든다 → 같은 조합을 두 번 세지 않음.
// counts: 종류별 쓸 수 있는 장수, must: 종류별 꼭 써야 하는 장수(테이블에 있던 것), jokers/mustJokers 도 같은 뜻.
// score(sets, jokersUsed): 클수록 좋음. 돌려주는 값: 가장 좋은 조합 목록 [{ kinds, v }] 또는 null
function search({ counts, must, jokers, mustJokers = 0, useJokers = true, score, ms }) {
  const cnt = counts.slice();
  const used = new Array(KINDS).fill(0);
  const deadline = Date.now() + ms;
  let jk = jokers;
  let jUsed = 0;
  let nodes = 0;
  let stop = false;
  let best = null;
  let bestScore = -Infinity;
  const sets = [];

  const apply = (set, d) => {
    for (const k of set.kinds) {
      if (k < 0) { jk -= d; jUsed += d; } else { cnt[k] -= d; used[k] += d; }
    }
  };

  function setsFrom(k) {
    const out = [];
    const c = Math.floor(k / 13);
    const n = (k % 13) + 1;
    // 런: (앞에 조커 0~1장) + k부터 위로, 빈 숫자는 조커로
    const maxPre = useJokers && n > 1 ? Math.min(jk, 1) : 0;
    for (let pre = maxPre; pre >= 0; pre--) {
      let jLeft = jk - pre;
      const kinds = [...Array(pre).fill(-1), k];
      let v = n;
      for (let i = 1; i <= pre; i++) v += n - i;
      for (let pos = n + 1; pos <= 13; pos++) {
        const kk = c * 13 + pos - 1;
        if (cnt[kk] > 0) kinds.push(kk);
        else if (useJokers && jLeft > 0) { kinds.push(-1); jLeft -= 1; } else break;
        v += pos;
        if (kinds.length >= 3) out.push({ kinds: kinds.slice(), v });
      }
    }
    // 그룹: 같은 숫자, k보다 뒤 색깔 중 고르고 모자라면 조커
    const others = [];
    for (let cc = c + 1; cc < 4; cc++) if (cnt[cc * 13 + n - 1] > 0) others.push(cc * 13 + n - 1);
    for (let mask = 0; mask < 1 << others.length; mask++) {
      const g = [k];
      others.forEach((o, i) => { if (mask & (1 << i)) g.push(o); });
      const maxJ = useJokers ? Math.min(jk, 4 - g.length) : 0;
      for (let j = 0; j <= maxJ; j++) {
        const size = g.length + j;
        if (size >= 3 && size <= 4) out.push({ kinds: [...g, ...Array(j).fill(-1)], v: n * size });
      }
    }
    return out.sort((a, b) => b.kinds.length - a.kinds.length); // 많이 쓰는 것부터
  }

  function dfs(k) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
    if (stop) return;
    while (k < KINDS && cnt[k] === 0) {
      if (used[k] < must[k]) return; // 꼭 써야 할 타일을 못 씀
      k += 1;
    }
    if (k >= KINDS) {
      if (jUsed < mustJokers) return;
      const s = score(sets, jUsed);
      if (s > bestScore) { bestScore = s; best = sets.map((x) => ({ kinds: x.kinds.slice(), v: x.v })); }
      return;
    }
    for (const set of setsFrom(k)) {
      apply(set, 1);
      sets.push(set);
      dfs(k);
      sets.pop();
      apply(set, -1);
      if (stop) return;
    }
    if (used[k] >= must[k]) { // 남은 k는 받침대에 둔다
      const keep = cnt[k];
      cnt[k] = 0;
      dfs(k + 1);
      cnt[k] = keep;
    }
  }
  dfs(0);
  return best;
}

// 종류 조합 → 실제 타일 번호. pools: 종류별 타일 번호 목록(테이블 것이 앞), jokerPool 도 같음
function toIds(sets, pools, jokerPool) {
  const p = pools.map((a) => a.slice());
  const j = jokerPool.slice();
  return sets.map((s) => s.kinds.map((k) => (k < 0 ? j.shift() : p[k].shift())));
}

function countRack(ids) {
  const counts = new Array(KINDS).fill(0);
  const pools = Array.from({ length: KINDS }, () => []);
  const jokerPool = [];
  for (const id of ids) {
    const k = kindOf(id);
    if (k < 0) jokerPool.push(id);
    else { counts[k] += 1; pools[k].push(id); }
  }
  return { counts, pools, jokerPool };
}

const tilesIn = (sets) => sets.reduce((s, x) => s + x.kinds.length, 0);
const valueIn = (sets) => sets.reduce((s, x) => s + x.v, 0);

// 받침대 타일끼리만 조합. needPoints: 첫 등록이면 30
function rackOnly(rack, { useJokers, needPoints, maxSets, ms }) {
  const { counts, pools, jokerPool } = countRack(rack);
  const best = search({
    counts, must: new Array(KINDS).fill(0), jokers: useJokers ? jokerPool.length : 0, useJokers, ms,
    score: (sets, jUsed) => {
      if (maxSets && sets.length > maxSets) return -Infinity;
      const v = valueIn(sets);
      if (needPoints && v < needPoints) return -Infinity;
      const n = tilesIn(sets);
      return (n === rack.length ? 1e6 : 0) + n * 100 + v - jUsed * 40;
    },
  });
  return best && best.length ? toIds(best, pools, jokerPool) : [];
}

// 남은 받침대 타일을 테이블 조합 끝에 붙인다 (조커는 다 털 수 있을 때만)
function layOff(table, rack) {
  const t = table.map((s) => s.slice());
  let left = rack.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of left) {
      if (id >= 104 && left.length > 1) continue;
      const i = t.findIndex((s) => analyzeSet([...s, id]).valid);
      if (i >= 0) {
        t[i] = analyzeSet([...t[i], id]).order;
        left = left.filter((x) => x !== id);
        changed = true;
        break;
      }
    }
  }
  return { table: t, left };
}

// 테이블 전체 + 받침대를 합쳐 다시 짜기 (테이블 타일은 전부 써야 함)
function rebuild(table, rack, ms) {
  const tableIds = table.flat();
  const all = countRack([...tableIds, ...rack]);
  const tab = countRack(tableIds);
  // 같은 종류면 테이블 타일 번호를 먼저 쓰도록
  const pools = all.pools.map((_, k) => [...tab.pools[k], ...all.pools[k].filter((id) => !tab.pools[k].includes(id))]);
  const jokerPool = [...tab.jokerPool, ...all.jokerPool.filter((id) => !tab.jokerPool.includes(id))];
  const tableCount = tableIds.length;
  const best = search({
    counts: all.counts, must: tab.counts, jokers: jokerPool.length, mustJokers: tab.jokerPool.length, ms,
    score: (sets, jUsed) => {
      const fromRack = tilesIn(sets) - tableCount;
      const rackJokers = Math.max(0, jUsed - tab.jokerPool.length);
      return (fromRack === rack.length ? 1e6 : 0) + fromRack * 100 + valueIn(sets) - rackJokers * 40;
    },
  });
  return best ? toIds(best, pools, jokerPool) : null;
}

const playedFrom = (state, table) => {
  const on = new Set(state.table.flat());
  return table.flat().filter((id) => !on.has(id)).length;
};

// ---------- 컴퓨터의 한 수 ----------
// 돌려주는 값: { action: 'play', table } 또는 { action: 'draw' }. opts.ms: 생각 시간(테스트용)
export function aiMove(state, player, level = 'normal', opts = {}) {
  const rack = state.racks[player];
  const ms = opts.ms ?? THINK_MS[level] ?? 300;
  const melded = state.melded[player];
  const candidates = [];

  if (!melded) {
    // 첫 등록: 받침대 타일로만 30 이상
    const sets = rackOnly(rack, { useJokers: level !== 'easy', needPoints: state.config.initialMeldPoints, maxSets: level === 'easy' ? 2 : 0, ms });
    if (sets.length) candidates.push([...state.table, ...sets]);
  } else if (level === 'easy') {
    const sets = rackOnly(rack, { useJokers: false, maxSets: 2, ms });
    if (sets.length) candidates.push([...state.table, ...sets]);
  } else {
    // 중수: 받침대 조합 + 붙이기
    const sets = rackOnly(rack, { useJokers: true, ms: Math.min(ms, 300) });
    const used = new Set(sets.flat());
    const lo = layOff([...state.table, ...sets], rack.filter((id) => !used.has(id)));
    if (lo.left.length < rack.length) candidates.push(lo.table);
    // 고수: 테이블까지 다시 짜기
    if (level === 'hard') {
      const re = rebuild(state.table, rack, ms);
      if (re) {
        const used2 = new Set(re.flat());
        candidates.push(layOff(re, rack.filter((id) => !used2.has(id))).table);
      }
    }
  }

  // 규칙에 맞는 것 중 가장 많이 내는 것 (다 털면 무조건)
  let best = null;
  let bestN = 0;
  for (const table of candidates) {
    if (!validateTurn(state, player, table).ok) continue;
    const n = playedFrom(state, table);
    if (n > bestN) { best = table; bestN = n; }
  }
  return best ? { action: 'play', table: best } : { action: 'draw' };
}
