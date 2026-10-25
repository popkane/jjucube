// 강릉큐브 화면. 규칙 판단은 engine.js, 바닥 배치는 board.js, 받침대는 rack.js, 온라인은 net.js, 컴퓨터 상대는 ai.js에 맡기고
// 여기서는 그리기·조작·타이머만 한다. 온라인은 각자 자기 폰으로 같은 방에 들어와서 하고, 컴퓨터전은 폰 안에서만 돈다.
// 타일은 한 번 만든 요소를 계속 써서(번호로 기억) 자리가 바뀌면 미끄러지듯 움직이게 한다.
import {
  newGame, validateTurn, submitTurn, drawTile, penalize, analyzeSet, tileOf, rackValue,
  TURN_SECONDS_OPTIONS, MIN_PLAYERS,
} from './engine.js';
import { DEFAULT_BOARD, segments, tableOf, nearestFree, dropTiles, blockOrder, arrangeTable } from './board.js';
import { syncRack, arrangeRack, rackCols, nearestFreeSlot, placeInRack, insertIntoRack, RACK_ROWS } from './rack.js';
import { aiMove, LEVELS } from './ai.js';
import { CHARACTERS, pickCharacters, avatarHtml } from './characters.js';
import { playTile, playTurnBell, unlockAudio, setSoundEnabled } from './sound.js';
import {
  signIn, serverNow, seatList, createRoom, joinRoom, leaveLobby, armLobbyCleanup, canResume, markOnline, watchRoom, startRoom, commitSync, setLive,
} from './net.js';

const $ = (sel) => document.querySelector(sel);
const KEY = { rack: 'rumikyub.rack', sound: 'rumikyub.sound', name: 'rumikyub.name', room: 'rumikyub.room', setup: 'rumikyub.setup', cpu: 'rumikyub.cpu' };
const CPU = 1; // 컴퓨터전에서 컴퓨터 자리 (나는 0)
const RATIO = 1.36; // 타일 세로/가로
const RACK_GAP = 4;
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
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-label="끝내기"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const UNDO_SVG = '<svg viewBox="0 0 24 24" aria-label="되돌리기"><path d="M8.5 6.5H5V3M5.4 6.4A8 8 0 1 1 4 12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
let lastAdded = new Set();  // 상대가 방금 차례에 새로 낸 타일 (주황 테두리)
let badIds = new Set();     // ✓를 눌렀는데 틀린 조합 (잠깐 빨갛게)
let selected = new Set();
let busy = false;           // 서버에 올리는 중
let firedRev = -1;          // 시간 초과 처리를 이 버전에서 이미 했는지
let geo = null;             // 지금 그려진 바닥 { w, h, rows, cols, el }
let rackPos = {};           // 내 받침대 배치 { id: [줄, 칸] } — 내 폰에만 저장
let rackFor = null;         // rackPos가 어느 판·자리 것인지
let rackGeo = null;         // 지금 그려진 받침대 { el, w, h, gap, cols }
let rackHome = {};          // 받침대에서 테이블로 나간 타일의 원래 칸 — 되돌리면 그 자리로
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
const usedCols = (layout) => Object.values(layout).reduce((m, [, c]) => Math.max(m, c + 1), 0);
const isHost = () => mode === 'cpu' || roomData?.meta?.host === uid;
const lockedIds = () => (game.melded[me()] ? null : startTableIds);

// ---------- 가로 틀 ----------
// 화면은 항상 가로형 틀(STAGE_W × STAGE_H) 하나. 창 크기에 맞게 키우고, 폰을 세로로 들면 90도 돌려서 가로로 보이게 한다.
// 폰(손가락 화면)에서는 틀의 가로 길이를 화면 비율에 맞춰 늘이고 줄여서 빈 곳 없이 꽉 채운다. PC는 폰 모양 틀(880) 그대로.
const STAGE_H = 400;
const isTouch = matchMedia('(pointer: coarse)').matches;
let STAGE_W = 880;
const view = { s: 1, rot: false };
function fitStage() {
  const iw = innerWidth;
  const ih = innerHeight;
  view.rot = ih > iw;
  const long = Math.max(iw, ih);
  const short = Math.min(iw, ih);
  STAGE_W = isTouch ? Math.round(Math.min(1000, Math.max(680, (STAGE_H * long) / short))) : 880;
  view.s = Math.min(long / STAGE_W, short / STAGE_H);
  const st = $('#stage');
  st.style.width = `${STAGE_W}px`;
  st.style.transform = `translate(-50%, -50%) ${view.rot ? 'rotate(90deg) ' : ''}scale(${view.s})`;
  document.body.classList.toggle('framed', !isTouch);
  syncFullBtns();
}

// ---------- 전체화면 ----------
// 안드로이드 크롬: 주소창·상태바를 숨기고 가로로 고정. 아이폰은 웹 전체화면을 막아서 '홈 화면에 추가'로 열어야 한다.
const isStandalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
function goFullscreen(quiet = false) {
  if (isStandalone() || document.fullscreenElement) return;
  if (!document.documentElement.requestFullscreen) {
    if (!quiet) toast('아이폰은 사파리 공유 버튼 → 홈 화면에 추가로 열면 전체화면이 돼요');
    return;
  }
  document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
    .catch(() => { if (!quiet) toast('전체화면을 열지 못했어요'); });
}
// 전체화면 버튼은 계속 보이고, 누를 때마다 전체화면 ↔ 일반화면 (홈 화면 앱으로 연 경우만 숨김)
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else goFullscreen();
}
function syncFullBtns() {
  const full = !!document.fullscreenElement;
  for (const id of ['#fullBtn', '#gameFullBtn']) {
    const b = $(id);
    if (!b) continue;
    b.hidden = isStandalone();
    b.classList.toggle('on', full);
    b.innerHTML = `<span class="fs-ic">${full ? '⤡' : '⤢'}</span><span>${full ? '일반화면' : '전체화면'}</span>`;
  }
}
document.addEventListener('fullscreenchange', () => { fitStage(); syncFullBtns(); if (game && !$('#game').hidden) render(); });
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
addEventListener('resize', () => { fitStage(); if (!press && game && !$('#game').hidden) render(); });
$('#fullBtn').addEventListener('click', toggleFullscreen);
$('#gameFullBtn').addEventListener('click', toggleFullscreen);
// 폰에서 게임을 시작하는 버튼을 누르면 자동으로 전체화면을 시도한다
document.addEventListener('click', (e) => {
  if (isTouch && e.target.closest('#resumeBtn, #resumeCpuBtn, #startBtn, #againBtn, #createForm [type=submit], #joinForm [type=submit], #cpuForm [type=submit]')) goFullscreen(true);
}, true);

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

// 컴퓨터 차례: 잠깐 생각하는 척하고 둔다
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
  }, 1100 + Math.random() * 900);
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
  const prevIds = new Set(game && game.gid === s.game.gid ? game.table.flat() : []);
  const prevGid = game?.gid;
  rev = newRev;
  game = s.game;
  match = s.match;
  deadline = s.deadline;
  startTableIds = new Set(game.table.flat());
  // 상대가 방금 낸 타일은 주황 테두리로 잠깐 보여준다
  lastAdded = game.last && game.last.action === 'play' && game.last.player !== me() && prevGid === game.gid
    ? new Set(game.table.flat().filter((id) => !prevIds.has(id))) : new Set();
  if (game.last && game.last.player !== me() && prevGid === game.gid && game.status === 'playing') toast(describeLast());
  busy = false;
  badIds = new Set();
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

// 새 판: 엔진 상태 + 바닥 배치 + 사람마다 랜덤 동물 캐릭터 + 판 번호(gid)
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
  maybeIntro.t = setTimeout(() => { $('#intro').hidden = true; }, 2200);
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
  setTimeout(() => toast(game.melded[me()] ? '내 차례예요!' : `내 차례예요! 첫 등록은 내 타일로 ${game.config.initialMeldPoints}점 이상`), 400);
  playTurnBell();
  navigator.vibrate?.(60);
}

// 결과를 서버에 올린다. 다음 화면은 서버에서 바뀐 값이 돌아올 때(onRoom) 그린다.
async function commit(next, quiet = false) {
  if (busy) return;
  busy = true;
  renderControls();
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

// ✓: 맞으면 내고, 틀리면 알려주고 틀린 조합을 잠깐 빨갛게
function confirmTurn() {
  const v = validateTurn(game, me(), tableOf(work.layout));
  if (!v.ok) {
    toast(v.error === '맞지 않는 조합이 있어요' ? '테이블에 규칙에 맞지 않는 조합이 있어요' : v.error);
    badIds = new Set(segments(work.layout).filter((s) => !analyzeSet(s.ids).valid).flatMap((s) => s.ids));
    navigator.vibrate?.([40, 40, 40]);
    render();
    setTimeout(() => { badIds = new Set(); if (game && !$('#game').hidden) render(); }, 1600);
    return;
  }
  finishTurn();
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

// ---------- 타이머: 차례인 사람 캐릭터 둘레의 원형 게이지 + 남은 초 ----------
const RING_LEN = 2 * Math.PI * 27;
setInterval(tick, 250);
function tick() {
  if (!game || $('#game').hidden || game.status !== 'playing') return;
  const total = game.config.turnSeconds * 1000;
  const left = deadline - serverNow();
  const shown = Math.max(0, Math.min(total, left));
  const card = $('#players .player.active');
  if (card) {
    const fg = card.querySelector('.ring .fg');
    fg.style.strokeDashoffset = `${RING_LEN * (1 - shown / total)}`;
    card.classList.toggle('hurry', shown <= 10000);
    card.querySelector('.secs').textContent = Math.ceil(shown / 1000);
  }
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

// 화면에 보이는 만큼을 바닥 크기로 쓴다
const viewBoard = () => (geo ? { cols: geo.cols, rows: geo.rows } : work.board);

// dest: { type: 'rack', spot } 또는 { type: 'board', spot }  (spot = 가장 가까운 빈칸 { row, start })
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
    if (dest.insert) rackPos = insertIntoRack(rackPos, ids, dest.spot.row, dest.spot.start);
    else rackPos = dest.spot ? placeInRack(rackPos, ids, dest.spot) : insertIntoRack(rackPos, ids, 0, 999);
    saveRack();
    playTile('rack', ids.length);
    render();
    return;
  }
  for (const id of ids) if (rackPos[id]) rackHome[id] = rackPos[id];
  const res = dropTiles(work.layout, viewBoard(), ids, dest.spot, lockedIds());
  moves += 1;
  playTile('place', ids.length);
  work.layout = res.layout;
  work.board = { cols: Math.max(work.board.cols, res.board.cols), rows: Math.max(work.board.rows, usedRows(res.layout)) };
  const moved = new Set(ids);
  work.rack = work.rack.filter((id) => !moved.has(id));
  sendLive();
  render();
}

function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else {
    const err = moveError([id]);
    if (err) { toast(err); return; }
    selected.add(id);
  }
  syncTileClasses();
}

// ---------- 그리기 ----------
function tileEl(id) {
  const t = tileOf(id);
  const el = document.createElement('div');
  el.className = `tile ${t.joker ? 'joker' : `c-${t.color}`}`;
  el.dataset.id = id;
  el.innerHTML = t.joker ? JOKER_SVG : `<span>${t.num}</span>`;
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
    card.innerHTML = `<div class="av"><svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="27"/><circle class="fg" cx="30" cy="30" r="27" stroke-dasharray="${RING_LEN}"/></svg>${avatarHtml(chars[p])}<span class="secs"></span></div>`
      + `<div class="info"><span class="nm"></span><span class="count"><i></i>${count}</span></div>`
      + `${game.melded[p] ? '' : '<span class="tag">등록 전</span>'}`;
    card.querySelector('.nm').textContent = p === me() ? '나' : name;
    card.title = `${name} (${CHARACTERS[chars[p]].name})`;
    box.append(card);
  });
  tick();
}

// 이번 차례에 나온 타일(내가 낸 것, 상대가 만지는 중, 상대가 방금 낸 것)
const isFresh = (id) => !startTableIds.has(id) || lastAdded.has(id);

// 번호로 기억해 둔 타일 요소를 다시 써서, 자리가 바뀌면 미끄러지듯 움직이게 한다
const boardTiles = new Map();
const rackTiles = new Map();
const spawnAt = new Map(); // 방금 끌어서 놓은 타일: 놓은 지점에서 칸으로 스르륵 { x, y } (그 판 기준 좌표)
let boardEl = null;
let rackGridEl = null;

function placeTile(map, parent, id, x, y) {
  let el = map.get(id);
  if (!el) {
    el = tileEl(id);
    parent.append(el);
    map.set(id, el);
    const from = spawnAt.get(id);
    spawnAt.delete(id);
    if (from) {
      el.style.transition = 'none';
      el.style.left = `${from.x}px`;
      el.style.top = `${from.y}px`;
      el.getBoundingClientRect();
      el.style.transition = '';
    } else {
      el.classList.add('appear');
      el.addEventListener('animationend', () => el.classList.remove('appear'), { once: true });
    }
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  return el;
}

function prune(map, keep) {
  for (const [id, el] of map) if (!keep.has(id)) { el.remove(); map.delete(id); }
}

function syncTileClasses() {
  for (const [id, el] of boardTiles) {
    el.classList.toggle('fresh', isFresh(id));
    el.classList.toggle('selected', selected.has(id));
    el.classList.toggle('bad', badIds.has(id));
  }
  for (const [id, el] of rackTiles) el.classList.toggle('selected', selected.has(id));
}

// 바닥: 칸 크기는 받침대 타일과 같게, 줄이 화면에 다 안 들어가거나 칸이 넘치면 그때만 작아짐 (스크롤 없음)
function renderTable() {
  const box = $('#table');
  if (!boardEl || !boardEl.isConnected) {
    box.innerHTML = '';
    boardEl = document.createElement('div');
    boardEl.className = 'board';
    boardEl.innerHTML = '<div class="grid-hint"></div><div class="target" hidden></div>';
    box.append(boardEl);
    boardTiles.clear();
  }
  const src = (isMyTurn() && work) || live || game;
  const { layout, board } = src;
  const W = box.clientWidth - 12;
  const H = box.clientHeight - 12;
  const cols = Math.max(board.cols, usedCols(layout));
  const needRows = Math.max(board.rows, usedRows(layout));
  const w = Math.max(16, Math.min(52, W / cols, H / (needRows * RATIO)));
  const h = w * RATIO;
  const rows = Math.max(needRows, Math.floor(H / h));
  boardEl.style.width = `${cols * w}px`;
  boardEl.style.height = `${rows * h}px`;
  boardEl.style.setProperty('--tw', `${w - 2}px`);
  boardEl.style.setProperty('--cw', `${w}px`);
  boardEl.style.setProperty('--ch', `${h}px`);
  const keep = new Set();
  for (const [key, [r, c]] of Object.entries(layout)) {
    const id = Number(key);
    placeTile(boardTiles, boardEl, id, c * w + 1, r * h + 1);
    keep.add(id);
  }
  prune(boardTiles, keep);
  geo = { w, h, rows, cols, el: boardEl };
  syncTileClasses();
}

// 받침대 배치를 지금 판·내 자리 것으로 맞춘다 (판이 바뀌면 새로, 받은/낸 타일 반영)
function ensureRack() {
  const key = `${game.gid || 'g'}:${me()}`;
  if (rackFor !== key) {
    const saved = store.get(KEY.rack);
    rackPos = saved && saved.key === key ? saved.pos : {};
    rackFor = key;
  }
  // 테이블에서 돌아온 타일은 원래 칸이 비어 있으면 그 자리로
  const used = new Set(Object.values(rackPos).map(([r, c]) => `${r}:${c}`));
  for (const id of rackIds()) {
    const home = rackHome[id];
    if (rackPos[id] || !home || used.has(`${home[0]}:${home[1]}`)) continue;
    rackPos[id] = home;
    used.add(`${home[0]}:${home[1]}`);
  }
  rackPos = syncRack(rackPos, rackIds());
}
const saveRack = () => store.set(KEY.rack, { key: rackFor, pos: rackPos });

// 받침대: 원목 2층. 칸이 늘면 타일이 작아진다. 타일은 놓은 자리 그대로.
function renderRack() {
  const box = $('#rack');
  if (me() < 0 || !game) return;
  if (!rackGridEl || !rackGridEl.isConnected) {
    box.innerHTML = '';
    rackGridEl = document.createElement('div');
    rackGridEl.className = 'rack-grid';
    rackGridEl.innerHTML = '<div class="rack-back"></div><div class="rack-front"><span>강릉큐브</span></div><div class="target" hidden></div>';
    box.append(rackGridEl);
    rackTiles.clear();
  }
  ensureRack();
  saveRack();
  const cols = rackCols(rackPos);
  const W = box.clientWidth - 40;
  const H = box.clientHeight - 16;
  const w = Math.max(16, Math.min(52, (W - RACK_GAP * (cols - 1)) / cols, (H - RACK_GAP) / RACK_ROWS / RATIO));
  const h = w * RATIO;
  const x = (c) => c * (w + RACK_GAP);
  const y = (r) => r * (h + RACK_GAP);
  rackGridEl.style.width = `${cols * w + (cols - 1) * RACK_GAP}px`;
  rackGridEl.style.height = `${RACK_ROWS * h + RACK_GAP}px`;
  rackGridEl.style.setProperty('--tw', `${w}px`);
  Object.assign(rackGridEl.querySelector('.rack-back').style, { top: `${h * 0.3}px`, height: `${y(1) + h * 0.5 - h * 0.3}px` });
  Object.assign(rackGridEl.querySelector('.rack-front').style, { top: `${y(1) + h * 0.3}px`, height: `${h * 0.7 + 8}px` });
  const keep = new Set();
  for (const [key, [r, c]] of Object.entries(rackPos)) {
    const id = Number(key);
    const el = placeTile(rackTiles, rackGridEl, id, x(c), y(r));
    el.classList.toggle('incoming', flying.has(id));
    el.classList.toggle('drawn', drawn.has(id));
    keep.add(id);
  }
  prune(rackTiles, keep);
  box.classList.toggle('waiting', !isMyTurn());
  rackGeo = { el: rackGridEl, w, h, gap: RACK_GAP, cols };
  syncTileClasses();
  flyNewTiles(Object.keys(rackPos).map(Number));
}

// ---------- 새로 받은 타일: 1장 받기 버튼에서 날아와 받침대 자리에 내려앉고, 잠깐 빛남 (판 시작 때는 14장을 나눠줌) ----------
const drawn = new Set();   // 빛나는 중인 새 타일
const flying = new Set();  // 날아오는 중(받침대 자리에서는 숨김)
const dealt = new Set();   // 나눠주기 연출을 이미 한 판
let knownRack = new Set();
let knownFor = null;
function flyNewTiles(ids) {
  if (knownFor !== rackFor) {
    knownFor = rackFor;
    const deal = game.turn <= 2 && game.table.length === 0 && !dealt.has(game.gid) && ids.length >= 14;
    knownRack = new Set(ids);
    if (!deal) return;
    dealt.add(game.gid);
    ids.forEach((id, i) => { flying.add(id); setTimeout(() => flyOne(id, true), 500 + i * 55); });
    syncDealHidden();
    return;
  }
  // 처음 보는 타일만 (이번 차례에 냈다가 되돌린 타일은 이미 본 타일이라 제외)
  const fresh = ids.filter((id) => !knownRack.has(id));
  ids.forEach((id) => knownRack.add(id));
  fresh.forEach((id, i) => { flying.add(id); setTimeout(() => flyOne(id), i * 140); });
  syncDealHidden();
}
function syncDealHidden() {
  for (const id of flying) rackTiles.get(id)?.classList.add('incoming');
}
function flyOne(id, quick = false) {
  const target = rackTiles.get(id);
  const src = $('#mainBtn');
  if (!target || !src || !rackGeo) { flying.delete(id); target?.classList.remove('incoming'); return; }
  const from = stagePos(src);
  const to = stagePos(target);
  const fx = from.x + src.offsetWidth / 2 - rackGeo.w / 2;
  const fy = from.y + src.offsetHeight / 2 - (rackGeo.w * RATIO) / 2;
  const ghost = tileEl(id);
  ghost.classList.add('flying');
  ghost.style.setProperty('--tw', `${rackGeo.w}px`);
  $('#stage').append(ghost);
  const anim = ghost.animate([
    { transform: `translate(${fx}px, ${fy}px) scale(0.6) rotate(-18deg)`, opacity: 0.5 },
    { transform: `translate(${(fx + to.x) / 2}px, ${Math.min(fy, to.y) - (quick ? 30 : 60)}px) scale(1.12) rotate(-6deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${to.x}px, ${to.y}px) scale(1) rotate(0deg)`, opacity: 1 },
  ], { duration: quick ? 420 : 620, easing: 'cubic-bezier(.3,.7,.4,1)' });
  // 화면이 그려지지 않는 상황(앱 전환 등)에서도 타일이 꼭 내려앉게, 시간이 지나면 끝난 걸로 친다
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    ghost.remove();
    flying.delete(id);
    const el = rackTiles.get(id);
    el?.classList.remove('incoming');
    if (!quick) {
      drawn.add(id);
      el?.classList.add('drawn');
      setTimeout(() => { drawn.delete(id); rackTiles.get(id)?.classList.remove('drawn'); }, 2500);
    }
    playTile(quick ? 'rack' : 'place', 1);
  };
  anim.onfinish = finish;
  setTimeout(finish, (quick ? 420 : 620) + 400);
}

// ---------- 오른쪽 버튼: 평소엔 +(1장 받기, 남은 수), 타일을 움직이면 ↺(되돌리기) + ✓(끝내기) ----------
function renderControls() {
  const main = $('#mainBtn');
  const undo = $('#undoBtn');
  if (!game) return;
  const mine = canAct();
  const editing = mine && dirty() && game.status === 'playing';
  undo.hidden = !editing;
  main.classList.toggle('confirm', editing);
  main.classList.toggle('draw', !editing);
  main.classList.toggle('my-turn', isMyTurn() && !busy);
  main.innerHTML = editing ? CHECK_SVG : `<span class="ic">+</span><span class="pool"><i></i>${game.pool.length}</span>`;
  main.disabled = !mine || game.status !== 'playing';
  undo.innerHTML = UNDO_SVG;
}

// ---------- 버튼 ----------
// 되돌리기: 이번 차례에 한 것을 전부 처음으로 (타일이 제자리로 스르륵)
$('#undoBtn').addEventListener('click', () => {
  if (!canAct()) return;
  work = structuredClone(turnStart);
  moves = 0;
  selected.clear();
  playTile('rack', 2);
  sendLive();
  render();
});
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
  if (dirty()) confirmTurn();
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
// 타일을 짧게 누르면 선택(살짝 들림), 끌면 이동. 선택한 상태에서 끌면 선택한 타일이 같이 움직인다.
// 끄는 동안 들어갈 칸이 파랗게 보이고(주변에 옅은 칸 격자), 놓으면 그 칸으로 스르륵 들어간다.
// 손가락으로 끌 때는 타일이 손가락에 가리지 않게 조금 위에 띄운다.
let press = null;

// 끄는 묶음의 첫 타일 중심(틀 좌표) → 놓을 곳 { type, spot }
function findDrop(pt, ids, grab) {
  const el = document.elementFromPoint(pt.x, pt.y);
  if (!el) return null;
  const firstX = pt.sx - grab * press.pitch;
  if (el.closest('#rack')) {
    if (!rackGeo) return null;
    const o = stagePos(rackGeo.el);
    const cell = rackGeo.w + rackGeo.gap;
    const at = { colF: (firstX - o.x + rackGeo.gap / 2) / cell, rowF: (pt.sy - o.y) / (rackGeo.h + rackGeo.gap) };
    // 손가락 아래 칸이 비어 있으면 그 칸에, 타일이 있으면 그 자리에 끼워 넣고 옆 타일을 오른쪽으로 민다
    const row = Math.min(RACK_ROWS - 1, Math.max(0, Math.floor(at.rowF)));
    const col = Math.max(0, Math.floor(at.colF));
    const moving = new Set(ids);
    const taken = new Set(Object.entries(rackPos).filter(([id]) => !moving.has(Number(id))).map(([, [r, c]]) => `${r}:${c}`));
    let insert = false;
    for (let c = col; c < col + ids.length; c++) if (taken.has(`${row}:${c}`)) insert = true;
    return { type: 'rack', spot: { row, start: col }, insert };
  }
  if (el.closest('#table') && canAct()) {
    const o = stagePos(geo.el);
    const at = { colF: (firstX - o.x) / geo.w, rowF: (pt.sy - o.y) / geo.h };
    const spot = nearestFree(work.layout, viewBoard(), ids, at);
    return spot ? { type: 'board', spot, at } : null;
  }
  return null;
}

function showTarget(dest, ids, pt) {
  const bt = geo?.el.querySelector('.target');
  const rt = rackGeo?.el.querySelector('.target');
  if (bt) bt.hidden = dest?.type !== 'board';
  if (rt) rt.hidden = !(dest?.type === 'rack' && dest.spot);
  geo?.el.classList.toggle('dragging', dest?.type === 'board');
  if (dest?.type === 'board') {
    const o = stagePos(geo.el);
    geo.el.style.setProperty('--mx', `${pt.sx - o.x}px`);
    geo.el.style.setProperty('--my', `${pt.sy - o.y}px`);
    // 판 끝 바깥에 넣으면(줄이 밀리며 들어감) 그 끝에 빛나는 막대로 보여준다
    const edgeL = dest.spot.start < 0;
    const edgeR = dest.spot.start + ids.length > geo.cols;
    bt.classList.toggle('edge', edgeL || edgeR);
    const left = edgeL ? -3 : edgeR ? geo.cols * geo.w - 3 : dest.spot.start * geo.w;
    Object.assign(bt.style, { left: `${left}px`, top: `${dest.spot.row * geo.h}px`, width: edgeL || edgeR ? '6px' : `${ids.length * geo.w}px`, height: `${geo.h}px` });
  } else if (dest?.type === 'rack' && dest.spot) {
    const cell = rackGeo.w + rackGeo.gap;
    rt.classList.toggle('insert', !!dest.insert); // 끼워 넣기: 그 자리 왼쪽에 막대
    Object.assign(rt.style, { left: `${dest.spot.start * cell}px`, top: `${dest.spot.row * (rackGeo.h + rackGeo.gap)}px`, width: `${ids.length * cell - rackGeo.gap}px`, height: `${rackGeo.h}px` });
  }
}

// 손가락 위치 → 끄는 타일 위치 (틀 안 좌표 sx, sy) + 그 지점의 화면 좌표 (x, y: 놓을 곳 찾기용)
function pointOf(e) {
  const s = toStage(e.clientX, e.clientY);
  const sy = s.y - (press?.touch ? Math.max(geo?.h || 40, 40) * 0.9 : 0);
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
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 7) return;
    const ids = blockOrder(selected.has(press.id) ? [...selected] : [press.id]);
    const err = moveError(ids);
    if (err) { toast(err); press = null; return; }
    press.dragging = true;
    press.ids = ids;
    press.grab = ids.indexOf(press.id);
    press.size = Math.max(geo?.w || 36, rackGeo?.w || 36) - 2;
    press.pitch = press.size + 2;
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.setProperty('--gw', `${press.size}px`);
    for (const id of ids) ghost.append(tileEl(id));
    $('#stage').append(ghost);
    press.ghost = ghost;
    for (const id of ids) (boardTiles.get(id) || rackTiles.get(id))?.classList.add('lifted');
    playTile('rack', 1);
  }
  const pt = pointOf(e);
  press.gx = pt.sx - press.grab * press.pitch - press.size / 2;
  press.gy = pt.sy - (press.size * RATIO) / 2;
  press.ghost.style.transform = `translate(${press.gx}px, ${press.gy}px)`;
  press.dest = findDrop(pt, press.ids, press.grab);
  showTarget(press.dest, press.ids, pt);
});

function endPress(e, cancelled) {
  if (!press) return;
  const p = press;
  press = null;
  showTarget(null);
  if (!p.dragging) {
    if (!cancelled && canAct()) toggleSelect(p.id);
    return;
  }
  p.ghost.remove();
  let dest = cancelled ? null : p.dest;
  // 내 차례가 아니면(끄는 도중 차례가 넘어간 경우 포함) 받침대 안에서 자리만 바꿀 수 있다
  if (dest && !canAct() && !(dest.type === 'rack' && canArrange() && p.ids.every((id) => rackIds().includes(id)))) dest = null;
  for (const id of p.ids) (boardTiles.get(id) || rackTiles.get(id))?.classList.remove('lifted');
  if (!dest) { render(); return; }
  // 놓은 지점에서 칸으로 스르륵 들어가게: 끄던 타일 위치를 그 판(바닥/받침대) 좌표로 기억
  const host = dest.type === 'board' ? geo.el : rackGeo.el;
  const o = stagePos(host);
  const map = dest.type === 'board' ? boardTiles : rackTiles;
  p.ids.forEach((id, i) => {
    const at = { x: p.gx + i * p.pitch - o.x, y: p.gy - o.y };
    const el = map.get(id);
    if (!el) { spawnAt.set(id, at); return; }
    // 같은 판 안에서 옮길 때도 원래 자리가 아니라 손가락 위치에서 들어가게
    el.style.transition = 'none';
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    el.getBoundingClientRect();
    el.style.transition = '';
  });
  moveTiles(p.ids, dest);
}
document.addEventListener('pointerup', (e) => endPress(e, false));
document.addEventListener('pointercancel', (e) => endPress(e, true));

// 선택해 둔 타일을 바닥의 빈 곳이나 받침대를 눌러서 옮기기
document.addEventListener('click', (e) => {
  if (!canAct() || !selected.size || e.target.closest('.tile[data-id]')) return;
  const ids = blockOrder([...selected]);
  const s = toStage(e.clientX, e.clientY);
  if (e.target.closest('#rack') && rackGeo) {
    const o = stagePos(rackGeo.el);
    const spot = nearestFreeSlot(rackPos, ids, { colF: (s.x - o.x) / (rackGeo.w + rackGeo.gap), rowF: (s.y - o.y) / (rackGeo.h + rackGeo.gap) }, rackGeo.cols + 2);
    moveTiles(ids, { type: 'rack', spot });
  } else if (e.target.closest('#table') && geo) {
    const o = stagePos(geo.el);
    const spot = nearestFree(work.layout, viewBoard(), ids, { colF: (s.x - o.x) / geo.w, rowF: (s.y - o.y) / geo.h });
    if (spot) moveTiles(ids, { type: 'board', spot });
  }
});

// ---------- 알림 ----------
let toastTimer = 0;
function toast(msg) {
  if (!msg) return;
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
