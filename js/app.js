// 강릉큐브 화면. 규칙 판단은 engine.js, 바닥 배치는 board.js, 온라인은 net.js, 컴퓨터 상대는 ai.js에 맡기고
// 여기서는 그리기·조작·타이머만 한다. 온라인은 각자 자기 폰으로 같은 방에 들어와서 하고, 컴퓨터전은 폰 안에서만 돈다.
import {
  newGame, validateTurn, submitTurn, drawTile, penalize, analyzeSet, sortRack, tileOf, rackValue,
  TURN_SECONDS_OPTIONS, MIN_PLAYERS,
} from './engine.js';
import { DEFAULT_BOARD, segments, tableOf, placeAt, placeFree, tidy, blockOrder, arrangeTable } from './board.js';
import { syncRack, insertIntoRack, arrangeRack, rackGroups, rackCols, RACK_ROWS } from './rack.js';
import { aiMove, LEVELS } from './ai.js';
import { CHARACTERS, pickCharacters, avatarHtml } from './characters.js';
import { playTile, playTurnBell, unlockAudio, setSoundEnabled } from './sound.js';
import {
  signIn, serverNow, seatList, createRoom, joinRoom, leaveLobby, armLobbyCleanup, canResume, markOnline, watchRoom, startRoom, commitSync, setLive,
} from './net.js';

const $ = (sel) => document.querySelector(sel);
const KEY = { rack: 'rumikyub.rack', sort: 'rumikyub.sort', sound: 'rumikyub.sound', name: 'rumikyub.name', room: 'rumikyub.room', setup: 'rumikyub.setup', cpu: 'rumikyub.cpu' };
const CPU = 1; // 컴퓨터전에서 컴퓨터 자리 (나는 0)
const RATIO = 1.36; // 타일 세로/가로
const STALL_MS = 5000; // 차례인 사람이 시간 넘기고도 이만큼 반응이 없으면 다른 사람이 대신 벌칙 처리

// localStorage는 막혀 있을 수 있으니 항상 try로 감싼다
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 못 해도 게임은 계속 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

// 결과 창 기본 마스코트(오징어) — 무승부일 때 다시 씀
const SQUID_SVG = document.querySelector('#endMascot').innerHTML;

// 조커 = 주문진 오징어
const JOKER_SVG = '<svg viewBox="0 0 24 24" aria-label="조커"><path d="M12 1.5c4.2 3.8 6.4 7.2 6.4 11.8v2.2a2 2 0 0 1-2 2H7.6a2 2 0 0 1-2-2v-2.2C5.6 8.7 7.8 5.3 12 1.5z" fill="#ff8fa3" stroke="#2b2d42" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.3 17.6v3.4M10.8 17.6v4.4M13.2 17.6v4.4M15.7 17.6v3.4" stroke="#2b2d42" stroke-width="1.6" stroke-linecap="round"/><circle cx="9.6" cy="12.6" r="1.4" fill="#2b2d42"/><circle cx="14.4" cy="12.6" r="1.4" fill="#2b2d42"/><path d="M10.7 14.8q1.3 1.1 2.6 0" fill="none" stroke="#2b2d42" stroke-width="1.1" stroke-linecap="round"/></svg>';

// ---------- 상태 ----------
let uid = null;
let mode = null;            // 'online' | 'cpu'
let cpuLevel = 'easy';
let room = null;            // { code, seat, unwatch } — 컴퓨터전은 { seat: 0 }
let roomData = null;        // 마지막으로 받은 방 전체
let rev = -1;               // 지금 보고 있는 게임 버전 (sync.rev)
let game = null;            // 엔진 상태 + 바닥 배치(layout, board)
let match = null;           // 여러 판 누적 점수 { rounds, totals }
let deadline = 0;           // 이번 차례가 끝나는 서버 시각
let names = [];
let live = null;            // 상대가 지금 만지는 중인 테이블 { turn, player, layout, board, rack }
let liveRaw = null;
let work = null;            // 내 차례에 만지는 중인 { layout, board, rack }
let workTurn = null;        // work가 몇 번째 차례 것인지
let turnStart = null;       // 차례 시작 때의 work (되돌리기 = 여기로 전부 되돌림)
let moves = 0;              // 이번 차례에 옮긴 횟수
let startTableIds = new Set();
let selected = new Set();
let busy = false;           // 서버에 올리는 중
let firedRev = -1;          // 시간 초과 처리를 이 버전에서 이미 했는지
let geo = null;             // 지금 그려진 바닥의 크기 { w, h, rows, cols, el, preview }
let rackPos = {};           // 내 받침대 배치 { id: [줄, 칸] } — 내 폰에만 저장
let rackFor = null;         // rackPos가 어느 판·자리 것인지
let rackGeo = null;         // 지금 그려진 받침대 크기 { el, w, h, gap, cols }
const setup = { players: 2, seconds: 60, level: 'easy', ...store.get(KEY.setup) };

const me = () => room?.seat ?? -1;
const isMyTurn = () => !!game && game.status === 'playing' && game.current === me();
const dirty = () => moves > 0;
const playedCount = () => (work && turnStart ? turnStart.rack.length - work.rack.length : 0);
const canAct = () => isMyTurn() && !busy && !!work && workTurn === game.turn && $('#menu').hidden;
// 받침대 정리는 내 차례가 아니어도 할 수 있다
const canArrange = () => !!game && game.status === 'playing' && me() >= 0 && $('#menu').hidden;
const rackIds = () => (isMyTurn() && work ? work.rack : game.racks[me()]);
const usedRows = (layout) => Object.values(layout).reduce((m, [r]) => Math.max(m, r + 1), 0);
const isHost = () => mode === 'cpu' || roomData?.meta?.host === uid;

// ---------- 가로 틀 ----------
// 화면은 항상 가로형 틀(STAGE_W × STAGE_H) 하나. 창 크기에 맞게 키우고, 폰을 세로로 들면 90도 돌려서 가로로 보이게 한다.
const STAGE_W = 880;
const STAGE_H = 400;
const view = { s: 1, rot: false };
function fitStage() {
  const iw = innerWidth;
  const ih = innerHeight;
  view.rot = ih > iw;
  view.s = view.rot ? Math.min(ih / STAGE_W, iw / STAGE_H) : Math.min(iw / STAGE_W, ih / STAGE_H);
  const st = $('#stage');
  st.style.transform = `translate(-50%, -50%) ${view.rot ? 'rotate(90deg) ' : ''}scale(${view.s})`;
  // PC처럼 여백이 남으면 폰 모양 테두리를 보여준다
  const spare = view.rot ? Math.min(iw - STAGE_H * view.s, ih - STAGE_W * view.s) : Math.min(iw - STAGE_W * view.s, ih - STAGE_H * view.s);
  document.body.classList.toggle('framed', spare > 24 || Math.max(iw, ih) > 1100);
}
// 화면 좌표 → 틀 안 좌표
function toStage(x, y) {
  const dx = x - innerWidth / 2;
  const dy = y - innerHeight / 2;
  return view.rot
    ? { x: dy / view.s + STAGE_W / 2, y: -dx / view.s + STAGE_H / 2 }
    : { x: dx / view.s + STAGE_W / 2, y: dy / view.s + STAGE_H / 2 };
}
// 틀 안 좌표 → 화면 좌표
function fromStage(x, y) {
  const u = (x - STAGE_W / 2) * view.s;
  const v = (y - STAGE_H / 2) * view.s;
  return view.rot ? { x: innerWidth / 2 - v, y: innerHeight / 2 + u } : { x: innerWidth / 2 + u, y: innerHeight / 2 + v };
}
// 요소의 틀 안 위치 (스크롤 반영)
function stagePos(el) {
  const st = $('#stage');
  let x = 0;
  let y = 0;
  for (let e = el; e && e !== st; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  for (let p = el.parentElement; p && p !== st; p = p.parentElement) { x -= p.scrollLeft; y -= p.scrollTop; }
  return { x, y };
}
fitStage();
addEventListener('resize', fitStage);

function showScreen(id) {
  for (const s of ['#home', '#lobby', '#game']) $(s).hidden = s !== id;
}

// ---------- 시작 화면 ----------
$('#myName').value = store.get(KEY.name) || '';
$('#myName').addEventListener('input', () => store.set(KEY.name, $('#myName').value.trim()));
const myName = () => $('#myName').value.trim() || '이름없음';

function showHome() {
  showScreen('#home');
  for (const id of ['#menu', '#end']) $(id).hidden = true;
  $('#homeMain').hidden = false;
  $('#createForm').hidden = true;
  $('#joinForm').hidden = true;
  $('#cpuForm').hidden = true;
  // 온라인 이어하기는 그 방에서 게임이 아직 진행 중일 때만 보여준다 (끝났거나 없어진 방이면 기억도 지움)
  $('#resumeBtn').hidden = true;
  const saved = store.get(KEY.room);
  if (saved) {
    ready.then(() => canResume(saved, uid)).then((ok) => {
      if (!ok) { if (store.get(KEY.room) === saved) store.del(KEY.room); return; }
      if (store.get(KEY.room) !== saved || $('#home').hidden) return;
      $('#resumeBtn').textContent = `이어하기 (방 ${saved})`;
      $('#resumeBtn').hidden = false;
    }).catch(() => {});
  }
  const cpuSaved = store.get(KEY.cpu);
  $('#resumeCpuBtn').hidden = !cpuSaved;
  if (cpuSaved) $('#resumeCpuBtn').textContent = `컴퓨터전 이어하기 (${LEVELS[cpuSaved.level]})`;
}

function renderSegs() {
  for (const seg of document.querySelectorAll('.seg')) {
    const v = String(setup[seg.dataset.name]);
    for (const b of seg.children) b.classList.toggle('on', b.dataset.v === v);
  }
}
for (const seg of document.querySelectorAll('.seg')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = b.dataset.v;
    setup[seg.dataset.name] = /^\d+$/.test(v) ? Number(v) : v;
    renderSegs();
  });
}

$('#createCard').addEventListener('click', () => {
  $('#homeMain').hidden = true;
  $('#createForm').hidden = false;
  renderSegs();
});
$('#joinCard').addEventListener('click', () => {
  $('#homeMain').hidden = true;
  $('#joinForm').hidden = false;
  $('#joinCode').value = '';
  $('#joinCode').focus();
});
$('#cpuCard').addEventListener('click', () => {
  $('#homeMain').hidden = true;
  $('#cpuForm').hidden = false;
  renderSegs();
});
for (const b of document.querySelectorAll('.back-btn')) b.addEventListener('click', showHome);

async function withConn(fn) {
  if (!uid) { toast('아직 연결 중이에요. 잠시 후 다시 눌러 주세요'); return; }
  try { await fn(); } catch (e) { toast(e.message || '연결에 실패했어요'); }
}

$('#createForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!TURN_SECONDS_OPTIONS.includes(setup.seconds)) setup.seconds = 60;
  store.set(KEY.setup, setup);
  withConn(async () => enterRoom(await createRoom({ uid, name: myName(), players: setup.players, seconds: setup.seconds })));
});
$('#joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#joinCode').value.trim();
  if (!/^\d{4}$/.test(code)) { toast('방 번호 4자리를 넣어 주세요'); return; }
  withConn(async () => enterRoom(await joinRoom({ code, uid, name: myName() })));
});
$('#resumeBtn').addEventListener('click', () => {
  const code = store.get(KEY.room);
  withConn(async () => {
    try { enterRoom(await joinRoom({ code, uid, name: myName() })); } catch (err) { store.del(KEY.room); showHome(); throw err; }
  });
});

// ---------- 컴퓨터전 ----------
$('#cpuForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!TURN_SECONDS_OPTIONS.includes(setup.seconds)) setup.seconds = 60;
  if (!LEVELS[setup.level]) setup.level = 'easy';
  store.set(KEY.setup, setup);
  startCpu(setup.level, setup.seconds);
});
$('#resumeCpuBtn').addEventListener('click', () => {
  const saved = store.get(KEY.cpu);
  if (!saved) { showHome(); return; }
  enterCpu(saved.level);
  // 저장해 둔 판을 이어서 — 제한 시간은 새로 시작
  applyState({ game: saved.game, match: saved.match, deadline: serverNow() + saved.game.config.turnSeconds * 1000 });
});

function enterCpu(level) {
  leaveRoom(false);
  mode = 'cpu';
  cpuLevel = level;
  room = { seat: 0 };
  names = [myName(), '컴퓨터'];
}

function startCpu(level, seconds) {
  enterCpu(level);
  const g = freshGame(2, seconds);
  applyState({ game: g, match: { rounds: 0, totals: [0, 0] }, deadline: serverNow() + seconds * 1000 });
}

// 컴퓨터 차례: 잠깐 생각하는 척하고 둔다 (생각하는 동안 화면이 멈추지 않게 그린 뒤에 계산)
let cpuTimer = 0;
function scheduleCpu() {
  clearTimeout(cpuTimer);
  const atRev = rev;
  cpuTimer = setTimeout(() => {
    if (mode !== 'cpu' || rev !== atRev || !game || game.status !== 'playing' || game.current !== CPU) return;
    const m = aiMove(game, CPU, cpuLevel);
    if (m.action === 'play') {
      const r = submitTurn(game, CPU, m.table);
      if (r.ok) {
        const { layout, board } = arrangeTable(game.layout, game.board, m.table);
        const n = r.state.last.count;
        playTile(n > 1 ? 'snap' : 'place', n);
        commit({ ...r.state, layout, board });
        return;
      }
    }
    commit(drawTile(game, CPU));
  }, 900 + Math.random() * 900);
}

// ---------- 방 ----------
function enterRoom({ code, seat }) {
  leaveRoom(false);
  mode = 'online';
  room = { code, seat, unwatch: watchRoom(code, onRoom), unonline: markOnline(code, seat) };
  store.set(KEY.room, code);
}

function leaveRoom(goHome = true) {
  if (goHome) store.del(mode === 'cpu' ? KEY.cpu : KEY.room);
  clearTimeout(cpuTimer);
  room?.unwatch?.();
  room?.unonline?.();
  room?.disarm?.();
  mode = null;
  room = null;
  roomData = null;
  rev = -1;
  game = null;
  work = null;
  workTurn = null;
  live = null;
  liveRaw = null;
  if (goHome) { store.del(KEY.room); showHome(); }
}

function onRoom(data) {
  if (!room) return;
  if (!data || !data.meta) { toast('방장이 방을 닫았어요'); leaveRoom(); return; }
  roomData = data;
  const seats = seatList(data.seats);
  const seat = seats.findIndex((s) => s && s.uid === uid);
  if (seat < 0) { toast('방에서 나와졌어요'); leaveRoom(); return; }
  room.seat = seat;

  if (data.meta.status === 'lobby' || !data.sync) {
    if (!room.disarm) room.disarm = armLobbyCleanup(room.code, seat, data.meta.host === uid);
    renderLobby(seats);
    return;
  }
  if (room.disarm) { room.disarm(); room.disarm = null; }

  const sync = data.sync;
  if (sync.rev !== rev) {
    const g = JSON.parse(sync.game);
    names = Array.from({ length: g.players }, (_, i) => seats[i]?.name || `플레이어${i + 1}`);
    applyState({ game: g, match: JSON.parse(sync.match), deadline: sync.deadline }, sync.rev, false);
  }

  // 상대가 만지는 중인 테이블 (내 차례면 무시)
  const raw = data.live || null;
  if (raw !== liveRaw) {
    liveRaw = raw;
    const l = raw ? JSON.parse(raw) : null;
    const fresh = l && game && l.turn === game.turn && l.player === game.current && !isMyTurn() ? l : null;
    if (fresh && live && fresh.moves > live.moves) playTile(fresh.snap ? 'snap' : 'place', 1);
    live = fresh;
  }
  if (!press) render(); // 끄는 도중에는 다시 그리지 않음 (끝나면 그림)
  else renderPlayers();
}

// 새 게임 상태 반영 (온라인은 서버에서 받은 것, 컴퓨터전은 방금 둔 것)
function applyState(s, newRev = rev + 1, draw = true) {
  rev = newRev;
  game = s.game;
  match = s.match;
  deadline = s.deadline;
  startTableIds = new Set(game.table.flat());
  busy = false;
  if (live && live.turn !== game.turn) live = null;
  showScreen('#game');
  maybeIntro();
  if (game.status === 'ended') {
    work = null;
    workTurn = null;
    showEnd();
  } else {
    $('#end').hidden = true;
    if (isMyTurn() && workTurn !== game.turn) beginTurn();
    if (!isMyTurn()) { work = null; workTurn = null; }
  }
  if (mode === 'cpu') {
    if (game.status === 'ended') store.del(KEY.cpu); // 끝난 판은 이어하기에서 뺀다
    else store.set(KEY.cpu, { game, match, level: cpuLevel });
    if (game.status === 'playing' && game.current === CPU) scheduleCpu();
  }
  if (draw) render();
}

function renderLobby(seats) {
  showScreen('#lobby');
  const meta = roomData.meta;
  $('#lobbyCode').innerHTML = [...room.code].map((d) => `<span>${d}</span>`).join('');
  const list = $('#lobbySeats');
  list.innerHTML = '';
  for (let i = 0; i < meta.players; i++) {
    const li = document.createElement('li');
    const s = seats[i];
    li.className = s ? 'filled' : '';
    li.textContent = s ? `${s.name}${s.uid === uid ? ' (나)' : ''}${s.uid === meta.host ? ' · 방장' : ''}` : '기다리는 중…';
    list.append(li);
  }
  const count = seats.filter(Boolean).length;
  $('#startBtn').hidden = !isHost();
  $('#startBtn').disabled = count < MIN_PLAYERS;
  $('#startBtn').textContent = count < meta.players ? `지금 ${count}명으로 시작` : '시작';
  $('#lobbyInfo').textContent = isHost()
    ? (count < MIN_PLAYERS ? '상대가 들어오면 시작할 수 있어요' : `한 차례 ${meta.seconds}초`)
    : `방장이 시작하기를 기다리는 중… (한 차례 ${meta.seconds}초)`;
}

$('#startBtn').addEventListener('click', () => withConn(async () => {
  const seats = seatList(roomData.seats).filter(Boolean);
  const players = seats.length;
  const g = freshGame(players, roomData.meta.seconds);
  const m = { rounds: 0, totals: Array(players).fill(0) };
  await startRoom(room.code, players, { rev: (roomData.sync?.rev || 0) + 1, game: JSON.stringify(g), match: JSON.stringify(m), deadline: serverNow() + g.config.turnSeconds * 1000 });
}));
$('#leaveLobbyBtn').addEventListener('click', () => {
  // 먼저 방 감시를 끊고(내 화면에 '나와졌어요'가 안 뜨게) 그다음 자리를 비운다
  const r = room && roomData?.meta?.status === 'lobby' ? { code: room.code, seat: room.seat, host: isHost() } : null;
  leaveRoom();
  if (r) leaveLobby(r.code, r.seat, r.host).catch(() => {});
});

// 새 판: 엔진 상태 + 바닥 배치 + 사람마다 랜덤 동물 캐릭터 + 판 번호(gid, 캐릭터 소개를 한 번만 띄우려고)
function freshGame(players, seconds) {
  return {
    ...newGame({ players, config: { turnSeconds: seconds } }),
    layout: {}, board: { ...DEFAULT_BOARD },
    chars: pickCharacters(players), gid: Math.random().toString(36).slice(2, 10),
  };
}
const charsOf = (g) => g.chars || [0, 1, 2, 3];

// 판이 새로 시작되면 이번 판 캐릭터를 잠깐 보여준다
let introGid = null;
function maybeIntro() {
  if (!game || game.status !== 'playing' || game.gid === introGid) return;
  introGid = game.gid;
  if (game.turn > 2) return; // 이어하기로 들어온 판은 생략
  const chars = charsOf(game);
  $('#introList').innerHTML = names.map((name, p) => `<li>${avatarHtml(chars[p])}<b></b><small>${CHARACTERS[chars[p]].name}</small></li>`).join('');
  [...$('#introList').children].forEach((li, p) => { li.querySelector('b').textContent = p === me() ? `${names[p]}(나)` : names[p]; });
  $('#intro').hidden = false;
  clearTimeout(maybeIntro.t);
  maybeIntro.t = setTimeout(() => { $('#intro').hidden = true; }, 2600);
}
$('#intro').addEventListener('click', () => { $('#intro').hidden = true; });

// ---------- 차례 ----------
function beginTurn() {
  work = { layout: structuredClone(game.layout), board: { ...game.board }, rack: [...game.racks[me()]] };
  workTurn = game.turn;
  turnStart = structuredClone(work);
  moves = 0;
  selected.clear();
  live = null;
  toast('내 차례예요!');
  playTurnBell();
  navigator.vibrate?.(60);
}

// 결과를 서버에 올린다. 다음 화면은 서버에서 바뀐 값이 돌아올 때(onRoom) 그린다.
async function commit(next, quiet = false) {
  if (busy) return;
  busy = true;
  render();
  let m = match;
  if (next.status === 'ended' && game.status !== 'ended') {
    m = { rounds: match.rounds + 1, totals: match.totals.map((t, i) => t + next.scores[i]) };
  }
  const nextDeadline = serverNow() + next.config.turnSeconds * 1000;
  if (mode === 'cpu') { applyState({ game: next, match: m, deadline: nextDeadline }); return; }
  const sync = { game: JSON.stringify(next), match: JSON.stringify(m), deadline: nextDeadline };
  try {
    const ok = await commitSync(room.code, rev, sync);
    if (!ok) { busy = false; if (!quiet) toast('다른 변경이 먼저 들어왔어요'); render(); }
  } catch (e) {
    busy = false;
    toast(`올리지 못했어요: ${e.message}`);
    render();
  }
}

function finishTurn() {
  const r = submitTurn(game, me(), tableOf(work.layout));
  if (!r.ok) { toast(r.error); render(); return; }
  // 바닥 배치는 엔진이 모르는 정보라 여기서 붙여 준다 (벌칙·가져오기는 원래 배치 그대로)
  commit({ ...r.state, layout: work.layout, board: work.board });
}

function timeUp() {
  // 시간이 다 됐을 때 맞는 조합이면 그대로 내고, 아니면 원래대로 되돌리고 벌칙
  if (work && playedCount() > 0 && validateTurn(game, me(), tableOf(work.layout)).ok) {
    toast('시간 끝 — 놓은 대로 냈어요');
    finishTurn();
  } else {
    toast(game.pool.length ? `시간 초과 — ${Math.min(game.config.penaltyDraws, game.pool.length)}장 받았어요` : '시간 초과 — 넘겼어요');
    commit(penalize(game, me()));
  }
}

// 상대 이름 + 한 일
function describeLast() {
  const l = game.last;
  if (!l) return '';
  const who = names[l.player];
  if (l.action === 'play') return `${who}: ${l.count}장 냈어요`;
  if (l.action === 'draw') return `${who}: 1장 받았어요`;
  if (l.action === 'penalty') return `${who}: 시간 초과로 ${l.count}장 받았어요`;
  return `${who}: 낼 게 없어 넘겼어요`;
}

// ---------- 라이브 (상대에게 내 손놀림 보여주기) ----------
let liveTimer = 0;
let lastSnap = false;
function sendLive(snap = false) {
  if (mode !== 'online' || !isMyTurn()) return;
  lastSnap = snap;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    if (!isMyTurn() || !work) return;
    setLive(room.code, JSON.stringify({
      turn: game.turn, player: me(), layout: work.layout, board: work.board, rack: work.rack.length, moves, snap: lastSnap,
    })).catch(() => {});
  }, 120);
}

// ---------- 타이머 (모두의 화면에서 같은 시각 기준) ----------
setInterval(tick, 250);
function tick() {
  if (!game || $('#game').hidden) return;
  const bar = $('#timerBar');
  if (game.status !== 'playing') { bar.style.width = '0%'; $('#timerText').textContent = ''; return; }
  const total = game.config.turnSeconds * 1000;
  const left = deadline - serverNow();
  const shown = Math.max(0, Math.min(total, left));
  bar.style.width = `${(shown / total) * 100}%`;
  bar.classList.toggle('warn', shown <= 10000);
  $('#timerText').textContent = mode === 'cpu' && !isMyTurn()
    ? '컴퓨터 생각 중…'
    : `${isMyTurn() ? '내 차례' : names[game.current]} ${Math.ceil(shown / 1000)}초`;
  if (firedRev === rev || busy) return;
  if (isMyTurn() && left <= 0) { firedRev = rev; timeUp(); }
  // 차례인 사람이 연결이 끊겨 멈춰 있으면 다른 사람이 대신 벌칙 처리 (rev 확인으로 한 번만 들어감)
  else if (mode === 'online' && !isMyTurn() && left <= -STALL_MS) { firedRev = rev; commit(penalize(game, game.current), true); }
}

// ---------- 타일 옮기기 ----------
function moveError(ids, dest) {
  const fromTable = ids.some((id) => startTableIds.has(id));
  if (fromTable && !game.melded[me()]) return '첫 등록 전에는 테이블 조합을 건드릴 수 없어요';
  if (fromTable && dest?.type === 'rack') return '테이블에 있던 타일은 받침대로 가져올 수 없어요';
  return null;
}

// 화면에 보이는 만큼을 바닥 크기로 쓴다 (저장된 줄 수보다 화면이 크면 그만큼 더 쓸 수 있음)
const viewBoard = () => (geo ? { cols: geo.cols, rows: geo.rows } : work.board);

// dest: { type: 'rack' } 또는 { type: 'board', at: { row, col, grab } }
function moveTiles(ids, dest) {
  const err = moveError(ids, dest);
  if (err) { toast(err); selected.clear(); render(); return; }
  selected.clear();
  if (dest.type === 'rack') {
    // 테이블에서 돌아오는 타일(이번 차례에 낸 것)은 내 차례에만
    const back = ids.filter((id) => !rackIds().includes(id));
    if (back.length) {
      if (!canAct()) { render(); return; }
      moves += 1;
      for (const id of back) delete work.layout[id];
      work.rack.push(...back);
      sendLive();
    }
    ensureRack();
    const at = dest.at || { row: 0, col: 999, grab: 0 };
    rackPos = insertIntoRack(rackPos, ids, at.row, at.col - (at.grab || 0));
    saveRack();
    playTile('rack', ids.length);
    render();
    return;
  }
  // 놓은 칸에 정확히 (타일이 있으면 그 줄을 오른쪽으로 밀어서 자리를 만듦)
  const res = placeAt(work.layout, viewBoard(), ids, dest.at);
  moves += 1;
  playTile(res.pushed ? 'snap' : 'place', ids.length);
  work.layout = res.layout;
  work.board = { cols: Math.max(work.board.cols, res.board.cols), rows: Math.max(work.board.rows, usedRows(res.layout)) };
  const moved = new Set(ids);
  work.rack = work.rack.filter((id) => !moved.has(id));
  sendLive(res.pushed);
  render();
}

function toggleSelect(id) {
  if (selected.has(id)) { selected.delete(id); render(); return; }
  const err = moveError([id]);
  if (err) { toast(err); return; }
  selected.add(id);
  render();
}

// ---------- 그리기 ----------
function tileEl(id) {
  const t = tileOf(id);
  const el = document.createElement('div');
  el.className = `tile ${t.joker ? 'joker' : `c-${t.color}`}`;
  el.dataset.id = id;
  el.innerHTML = t.joker ? JOKER_SVG : `<span>${t.num}</span>`;
  if (selected.has(id)) el.classList.add('selected');
  return el;
}

function render() {
  if (!game || $('#game').hidden) return;
  renderPlayers();
  renderTable();
  renderRack();
  renderControls();
}

function renderPlayers() {
  if (!game) return;
  const box = $('#players');
  box.innerHTML = '';
  const online = mode === 'cpu' ? { 0: true, 1: true } : roomData?.online || {};
  const chars = charsOf(game);
  names.forEach((name, p) => {
    let count = game.racks[p].length;
    if (p === me() && work) count = work.rack.length;
    else if (live && p === live.player) count = live.rack;
    const turn = p === game.current && game.status === 'playing';
    const card = document.createElement('div');
    card.className = `player${turn ? ' active' : ''}${online[p] ? '' : ' offline'}${p === me() ? ' me' : ''}`;
    card.innerHTML = `${avatarHtml(chars[p])}<span class="count">${count}</span>`
      + `${game.melded[p] ? '' : '<span class="tag">등록 전</span>'}<span class="nm"></span>`;
    card.querySelector('.nm').textContent = p === me() ? '나' : name;
    card.title = `${name} (${CHARACTERS[chars[p]].name})`;
    box.append(card);
  });
  $('#poolCount').textContent = game.pool.length;
}

// 바닥: 화면 너비에 칸 수를 맞추고, 쓰는 줄이 화면보다 많아지면 타일을 줄여서 다 보이게 한다
function renderTable() {
  const box = $('#table');
  box.innerHTML = '';
  const src = (isMyTurn() && work) || live || game;
  const { layout, board } = src;
  const W = box.clientWidth - 16;
  const H = box.clientHeight - 16;
  // 화면에 딱 맞게(스크롤 없음): 타일은 최대 46으로 크게, 타일이 놓인 줄이 화면에 다 안 들어갈 때만 작아진다
  const needRows = Math.max(1, usedRows(layout));
  const w = Math.max(16, Math.min(46, W / board.cols, H / (needRows * RATIO)));
  const h = w * RATIO;
  const rows = Math.max(needRows, Math.floor(H / h));
  const el = document.createElement('div');
  el.className = 'board';
  el.style.width = `${board.cols * w}px`;
  el.style.height = `${rows * h}px`;
  el.style.setProperty('--tw', `${w - 3}px`);

  for (const seg of segments(layout)) {
    const s = document.createElement('div');
    s.className = `segbox${analyzeSet(seg.ids).valid ? '' : ' invalid'}`;
    Object.assign(s.style, { left: `${seg.start * w}px`, top: `${seg.row * h}px`, width: `${seg.ids.length * w}px`, height: `${h}px` });
    el.append(s);
  }
  for (const [key, [r, c]] of Object.entries(layout)) {
    const id = Number(key);
    const t = tileEl(id);
    t.style.left = `${c * w + 1.5}px`;
    t.style.top = `${r * h + 1.5}px`;
    if (!startTableIds.has(id)) t.classList.add('fresh');
    el.append(t);
  }
  if (Object.keys(layout).length === 0) {
    const hint = document.createElement('div');
    hint.className = 'board-hint';
    hint.textContent = isMyTurn() ? '받침대 타일을 끌어서 바닥 아무 데나 놓으세요' : '';
    el.append(hint);
  }
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.hidden = true;
  el.append(preview);
  box.append(el);
  geo = { w, h, rows, cols: board.cols, el, preview };
}

// 받침대 배치를 지금 판·내 자리 것으로 맞춘다 (판이 바뀌면 새로, 받은/낸 타일 반영)
function ensureRack() {
  const key = `${game.gid || 'g'}:${me()}`;
  if (rackFor !== key) {
    const saved = store.get(KEY.rack);
    rackPos = saved && saved.key === key ? saved.pos : {};
    rackFor = key;
  }
  rackPos = syncRack(rackPos, rackIds());
}
const saveRack = () => store.set(KEY.rack, { key: rackFor, pos: rackPos });

// 받침대: 2줄 판. 칸이 많아지면 타일이 작아진다. 같은 줄에 붙어 있는 맞는 조합에는 '내기' 버튼
function renderRack() {
  const box = $('#rack');
  box.innerHTML = '';
  if (me() < 0 || !game) return;
  ensureRack();
  saveRack();
  const cols = rackCols(rackPos);
  const gap = 4;
  const W = box.clientWidth - 24;
  const H = box.clientHeight - 24;
  const w = Math.max(16, Math.min(48, (W - gap * (cols - 1)) / cols, (H - gap * (RACK_ROWS - 1)) / RACK_ROWS / RATIO));
  const h = w * RATIO;
  const grid = document.createElement('div');
  grid.className = 'rack-grid';
  grid.style.width = `${cols * w + (cols - 1) * gap}px`;
  grid.style.height = `${RACK_ROWS * h + (RACK_ROWS - 1) * gap}px`;
  grid.style.setProperty('--tw', `${w}px`);
  const x = (c) => c * (w + gap);
  const y = (r) => r * (h + gap);
  const mine = canAct();
  // 원목 받침대: 뒤판(윗단 받침) + 앞판(아랫단 받침). 둘 다 타일 뒤에 있어서 타일을 가리지 않는다
  const back = document.createElement('div');
  back.className = 'rack-back';
  Object.assign(back.style, { top: `${h * 0.3}px`, height: `${y(1) + h * 0.5 - h * 0.3}px` });
  grid.append(back);
  const front = document.createElement('div');
  front.className = 'rack-front';
  Object.assign(front.style, { top: `${y(1) + h * 0.3}px`, height: `${h * 0.7 + 10}px` });
  front.innerHTML = '<span>강릉큐브</span>';
  grid.append(front);
  for (const g of rackGroups(rackPos)) {
    if (!g.valid) continue;
    const s = document.createElement('div');
    s.className = 'rack-set';
    Object.assign(s.style, { left: `${x(g.start) - 3}px`, top: `${y(g.row) - 3}px`, width: `${g.ids.length * (w + gap) - gap + 6}px`, height: `${h + 6}px` });
    grid.append(s);
    if (mine) {
      const b = document.createElement('button');
      b.className = 'rack-play';
      b.textContent = '내기 ▲';
      b.dataset.ids = g.ids.join(',');
      Object.assign(b.style, { left: `${x(g.start) + (g.ids.length * (w + gap) - gap) / 2}px`, top: `${y(g.row)}px` });
      grid.append(b);
    }
  }
  for (const [key, [r, c]] of Object.entries(rackPos)) {
    const t = tileEl(Number(key));
    t.style.left = `${x(c)}px`;
    t.style.top = `${y(r)}px`;
    grid.append(t);
  }
  box.append(grid);
  box.classList.toggle('waiting', !isMyTurn());
  rackGeo = { el: grid, w, h, gap, cols };
}

function rackCell(px, py) {
  const s = toStage(px, py);
  const o = stagePos(rackGeo.el);
  const col = Math.max(0, Math.floor((s.x - o.x + rackGeo.gap / 2) / (rackGeo.w + rackGeo.gap)));
  const row = Math.min(RACK_ROWS - 1, Math.max(0, Math.floor((s.y - o.y + rackGeo.gap / 2) / (rackGeo.h + rackGeo.gap))));
  return { row, col };
}

// 받침대에서 맞춰 둔 조합을 테이블 빈 곳에 한 번에
function playFromRack(ids) {
  if (!canAct()) return;
  const res = placeFree(work.layout, viewBoard(), ids);
  moves += 1;
  work.layout = res.layout;
  work.board = { cols: res.board.cols, rows: Math.max(work.board.rows, usedRows(res.layout), res.board.rows) };
  const moved = new Set(ids);
  work.rack = work.rack.filter((id) => !moved.has(id));
  selected.clear();
  playTile('snap', ids.length);
  sendLive();
  render();
}

function renderControls() {
  const status = $('#status');
  const main = $('#mainBtn');
  const mine = canAct();
  $('#undoBtn').disabled = !mine || !dirty();
  $('#tidyBtn').hidden = !mine || Object.keys(work.layout).length === 0;
  if (game.status !== 'playing') { main.disabled = true; status.textContent = ''; return; }
  if (!isMyTurn()) {
    main.textContent = '상대 차례';
    main.disabled = true;
    status.className = 'status';
    status.textContent = describeLast() || `${names[game.current]} 차례예요`;
    return;
  }
  if (busy) { main.disabled = true; status.className = 'status'; status.textContent = '올리는 중…'; return; }

  // 받침대에서 한 장도 안 냈으면 '1장 받기' (테이블을 만졌어도 받으면 원래대로 돌아감)
  if (playedCount() === 0) {
    main.textContent = game.pool.length ? '1장 받기' : '넘기기';
    main.disabled = !mine;
    status.className = 'status';
    status.textContent = dirty()
      ? '받침대에서 타일을 내지 않으면 테이블은 원래대로 돌아가요'
      : game.melded[me()]
        ? '타일을 내거나 1장 받으세요'
        : `첫 등록: 내 타일로 합 ${game.config.initialMeldPoints} 이상`;
    return;
  }
  const v = validateTurn(game, me(), tableOf(work.layout));
  main.textContent = '끝내기';
  main.disabled = !mine || !v.ok;
  status.className = `status ${v.ok ? 'ok' : 'err'}`;
  status.textContent = v.ok ? `✓ 낼 수 있어요 (${v.played.length}장)` : v.error;
}

addEventListener('resize', () => { if (!press) render(); });

// ---------- 버튼 ----------
// 되돌리기: 이번 차례에 한 것을 전부 처음으로
$('#undoBtn').addEventListener('click', () => {
  if (!canAct()) return;
  work = structuredClone(turnStart);
  moves = 0;
  selected.clear();
  sendLive();
  render();
});
// 정돈은 모두의 테이블에: 지금 만지는 테이블과, 되돌리기·1장 받기 때 돌아갈 원래 테이블을 같이 정돈해서 올린다.
// 타일을 만진 걸로 치지 않으므로 정돈한 뒤에도 바로 1장 받기를 할 수 있다.
$('#tidyBtn').addEventListener('click', () => {
  if (!canAct()) return;
  const base = tidy(game.layout, game.board);
  const baseBoard = { cols: base.board.cols, rows: Math.max(game.board.rows, base.board.rows) };
  turnStart.layout = structuredClone(base.layout);
  turnStart.board = { ...baseBoard };
  const t = tidy(work.layout, work.board);
  work.layout = t.layout;
  work.board = { cols: t.board.cols, rows: Math.max(work.board.rows, t.board.rows) };
  selected.clear();
  commitLayout(base.layout, baseBoard);
  sendLive();
  render();
});

// 차례는 그대로 두고 테이블 배치만 바꿔서 올린다 (남은 시간도 그대로)
async function commitLayout(layout, board) {
  const next = { ...game, layout, board };
  if (mode === 'cpu') {
    game = next;
    store.set(KEY.cpu, { game, match, level: cpuLevel });
    return;
  }
  try {
    await commitSync(room.code, rev, { game: JSON.stringify(next), match: JSON.stringify(match), deadline });
  } catch { /* 정돈은 못 올려도 게임은 계속 */ }
}
// 789 = 같은 색 연속끼리, 777 = 같은 숫자끼리. 누를 때만 한 번 정렬 (조합 뒤에 한 칸씩 띄움)
function arrangeBy(by) {
  if (!canArrange()) return;
  rackPos = arrangeRack(rackIds(), by, rackGeo?.cols);
  saveRack();
  playTile('rack', 3);
  render();
}
$('#sortRunBtn').addEventListener('click', () => arrangeBy('color'));
$('#sortGroupBtn').addEventListener('click', () => arrangeBy('number'));
$('#mainBtn').addEventListener('click', () => {
  if (!canAct()) return;
  if (playedCount() > 0) finishTurn();
  else commit(drawTile(game, me()));
});

let soundOn = store.get(KEY.sound) !== false;
setSoundEnabled(soundOn);
const renderSoundBtn = () => { $('#soundBtn').textContent = `소리: ${soundOn ? '켜짐' : '꺼짐'}`; };
$('#menuBtn').addEventListener('click', () => {
  renderSoundBtn();
  $('#menuRoom').textContent = mode === 'cpu' ? `컴퓨터전 (${LEVELS[cpuLevel]})` : room ? `방 번호 ${room.code}` : '';
  $('#menuQuit').textContent = mode === 'cpu' ? '그만하기' : '방 나가기';
  $('#menu').hidden = false;
});
$('#menuClose').addEventListener('click', () => { $('#menu').hidden = true; render(); });
$('#soundBtn').addEventListener('click', () => {
  soundOn = !soundOn;
  setSoundEnabled(soundOn);
  store.set(KEY.sound, soundOn);
  renderSoundBtn();
  if (soundOn) { unlockAudio(); playTile('place'); }
});
$('#menuQuit').addEventListener('click', () => leaveRoom());

// ---------- 게임 끝 ----------
function showEnd() {
  const w = game.winner;
  $('#endTitle').textContent = w === null ? '무승부!' : w === me() ? '🎉 내가 이겼어요!' : `🎉 ${names[w]} 승리!`;
  // 위에 뜨는 마스코트 = 이긴 사람 캐릭터 (무승부면 오징어 그대로)
  $('#endMascot').innerHTML = w === null ? SQUID_SVG : avatarHtml(charsOf(game)[w], 'winner');
  const rows = $('#endRows');
  rows.innerHTML = '';
  const cls = (v) => (v > 0 ? 'plus' : v < 0 ? 'minus' : '');
  const sign = (v) => `${v > 0 ? '+' : ''}${v}`;
  names.forEach((name, p) => {
    const tr = document.createElement('tr');
    if (p === w) tr.className = 'win';
    const sc = game.scores[p];
    tr.innerHTML = `<td></td><td>${game.racks[p].length}장 (${rackValue(game.racks[p])})</td><td class="${cls(sc)}">${sign(sc)}</td><td class="${cls(match.totals[p])}">${sign(match.totals[p])}</td>`;
    tr.firstChild.textContent = name;
    rows.append(tr);
  });
  $('#againBtn').hidden = !isHost();
  $('#againInfo').hidden = isHost();
  $('#homeBtn').textContent = mode === 'cpu' ? '그만하기' : '방 나가기';
  $('#end').hidden = false;
}
$('#againBtn').addEventListener('click', () => {
  if (mode === 'cpu') {
    const g = freshGame(2, game.config.turnSeconds);
    applyState({ game: g, match, deadline: serverNow() + g.config.turnSeconds * 1000 });
    return;
  }
  againOnline();
});
const againOnline = () => withConn(async () => {
  const g = freshGame(game.players, game.config.turnSeconds);
  const ok = await commitSync(room.code, rev, { game: JSON.stringify(g), match: JSON.stringify(match), deadline: serverNow() + g.config.turnSeconds * 1000 });
  if (ok) setLive(room.code, null).catch(() => {});
});
$('#homeBtn').addEventListener('click', () => leaveRoom());

// ---------- 끌기 / 누르기 ----------
// 타일을 짧게 누르면 선택, 끌면 이동. 선택한 상태에서 끌면 선택한 타일이 같이 움직인다.
// 손가락으로 끌 때는 타일이 손가락에 가리지 않게 조금 위에 띄우고, 그 띄운 위치를 기준으로 놓는다.
let press = null;

function boardCell(x, y) {
  const s = toStage(x, y);
  const o = stagePos(geo.el);
  const clamp = (v, max) => Math.min(max - 1, Math.max(0, v));
  return { col: clamp(Math.floor((s.x - o.x) / geo.w), geo.cols), row: clamp(Math.floor((s.y - o.y) / geo.h), geo.rows) };
}

// 놓을 곳: 받침대 / 바닥(칸) / 그 밖이면 null
function dropAt(x, y, grab) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest('#rack')) return { type: 'rack', at: { ...rackCell(x, y), grab } };
  if (el.closest('#table')) return { type: 'board', at: { ...boardCell(x, y), grab } };
  return null;
}

function showPreview(dest, ids) {
  const pv = geo.preview;
  $('#rack').classList.toggle('over', dest?.type === 'rack');
  if (dest?.type !== 'board' || !canAct()) { pv.hidden = true; return; }
  const p = placeAt(work.layout, viewBoard(), ids, dest.at);
  pv.hidden = false;
  pv.className = `preview${p.pushed ? ' push' : ''}`; // push = 그 자리 타일들이 오른쪽으로 밀림
  Object.assign(pv.style, { left: `${p.start * geo.w}px`, top: `${p.row * geo.h}px`, width: `${p.count * geo.w}px`, height: `${geo.h}px` });
}

// 손가락 위치 → 끄는 타일 위치 (틀 안 좌표 sx, sy) + 그 지점의 화면 좌표 (x, y: 놓을 곳 찾기용)
function pointOf(e) {
  const s = toStage(e.clientX, e.clientY);
  const sy = s.y - (press?.touch ? Math.max(geo.h, 40) * 1.1 : 0);
  const c = fromStage(s.x, sy);
  return { sx: s.x, sy, x: c.x, y: c.y };
}

document.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const tile = e.target.closest('#game .tile[data-id]');
  if (!tile) return;
  if (!canAct() && !(canArrange() && tile.closest('#rack'))) return;
  press = { id: Number(tile.dataset.id), x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', dragging: false };
});

document.addEventListener('pointermove', (e) => {
  if (!press) return;
  if (!press.dragging) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) return;
    const ids = blockOrder(selected.has(press.id) ? [...selected] : [press.id]);
    const err = moveError(ids);
    if (err) { toast(err); press = null; return; }
    press.dragging = true;
    press.ids = ids;
    press.grab = ids.indexOf(press.id);
    press.size = Math.max(30, geo.w - 3);
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.setProperty('--gw', `${press.size}px`);
    for (const id of ids) ghost.append(tileEl(id));
    $('#stage').append(ghost);
    press.ghost = ghost;
    for (const id of ids) document.querySelector(`#game .tile[data-id="${id}"]`)?.classList.add('lifted');
  }
  const pt = pointOf(e);
  const gx = pt.sx - press.grab * (press.size + 3) - press.size / 2;
  const gy = pt.sy - (press.size * RATIO) / 2;
  press.ghost.style.transform = `translate(${gx}px, ${gy}px)`;
  showPreview(dropAt(pt.x, pt.y, press.grab), press.ids);
});

function endPress(e, cancelled) {
  if (!press) return;
  const p = press;
  $('#rack').classList.remove('over');
  if (!p.dragging) {
    press = null;
    if (!cancelled && canAct()) toggleSelect(p.id);
    return;
  }
  const pt = pointOf(e);
  press = null;
  p.ghost.remove();
  // 내 차례가 아니면(끄는 도중 차례가 넘어간 경우 포함) 받침대 안에서 자리만 바꿀 수 있다
  let dest = cancelled ? null : dropAt(pt.x, pt.y, p.grab);
  if (dest && !canAct() && !(dest.type === 'rack' && canArrange() && p.ids.every((id) => rackIds().includes(id)))) dest = null;
  if (dest) moveTiles(p.ids, dest);
  else render();
}
document.addEventListener('pointerup', (e) => endPress(e, false));
document.addEventListener('pointercancel', (e) => endPress(e, true));

// 선택해 둔 타일을 바닥의 빈 곳이나 받침대를 눌러서 옮기기
document.addEventListener('click', (e) => {
  const play = e.target.closest('.rack-play');
  if (play) { playFromRack(play.dataset.ids.split(',').map(Number)); return; }
  if (!canAct() || !selected.size || e.target.closest('.tile[data-id]')) return;
  const ids = blockOrder([...selected]);
  if (e.target.closest('#rack')) moveTiles(ids, { type: 'rack', at: { ...rackCell(e.clientX, e.clientY), grab: 0 } });
  else if (e.target.closest('#table')) moveTiles(ids, { type: 'board', at: { ...boardCell(e.clientX, e.clientY), grab: 0 } });
});

// ---------- 알림 ----------
let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---------- 시작 ----------
const ready = signIn().then((id) => {
  uid = id;
  $('#connState').textContent = '';
}).catch((e) => {
  $('#connState').textContent = `연결 실패: ${e.message}`;
  throw e;
});
showHome();
