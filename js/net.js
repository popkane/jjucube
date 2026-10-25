// Firebase 연결: 방 만들기·들어가기·게임 상태 주고받기.
// rooms/{4자리 코드} = { meta, seats, online, sync, live }
//   meta  : { host, players, seconds, status: 'lobby'|'playing', created }
//   seats : { 0: { uid, name }, 1: ... }  (자리 번호 = 게임의 플레이어 번호)
//   sync  : { rev, game(JSON 문자열), match(JSON 문자열), deadline(서버 시각 ms) } — 차례가 끝날 때만 바뀜
//   live  : 지금 차례인 사람이 만지는 중인 테이블 (JSON 문자열) — 상대 화면에 실시간으로 보여줌
// 게임 상태를 문자열로 넣는 이유: Realtime Database는 빈 배열을 지우고 숫자 키 객체를 배열로 바꿔서 모양이 망가진다.
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, onValue, runTransaction, onDisconnect,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const ROOM_TTL = 24 * 3600 * 1000; // 하루 지난 방 번호는 새 방에 다시 쓴다

let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
export const serverNow = () => Date.now() + offset;

const roomRef = (code, path) => ref(db, path ? `rooms/${code}/${path}` : `rooms/${code}`);

export async function signIn() {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

// DB에서 온 자리 목록(배열 또는 객체)을 [자리번호] 배열로
export function seatList(v) {
  const out = [];
  if (v) for (const [k, s] of Object.entries(v)) if (s) out[Number(k)] = s;
  return out;
}
const seatObj = (seats) => Object.fromEntries(seats.map((s, i) => [i, s]).filter(([, s]) => s));

export async function createRoom({ uid, name, players, seconds }) {
  for (let tries = 0; tries < 20; tries++) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const now = serverNow();
    const res = await runTransaction(roomRef(code), (cur) => {
      if (cur && cur.meta && now - (cur.meta.created || 0) < ROOM_TTL) return undefined; // 쓰는 중인 번호
      return { meta: { host: uid, players, seconds, status: 'lobby', created: now }, seats: { 0: { uid, name } } };
    });
    if (res.committed) return { code, seat: 0 };
  }
  throw new Error('방 번호를 만들지 못했어요. 다시 해 주세요');
}

export async function joinRoom({ code, uid, name }) {
  const meta = (await get(roomRef(code, 'meta'))).val();
  if (!meta) throw new Error('없는 방 번호예요');
  // 이미 앉아 있던 방이면 그대로 다시 들어온다 (트랜잭션은 처음에 빈 값으로 돌 수 있어서 먼저 읽어 본다)
  const before = seatList((await get(roomRef(code, 'seats'))).val());
  const was = before.findIndex((s) => s && s.uid === uid);
  if (was >= 0) {
    if (before[was].name !== name) await set(roomRef(code, `seats/${was}/name`), name);
    return { code, seat: was };
  }
  let seat = -1;
  const res = await runTransaction(roomRef(code, 'seats'), (cur) => {
    const seats = seatList(cur);
    const mine = seats.findIndex((s) => s && s.uid === uid);
    if (mine >= 0) { seat = mine; seats[mine] = { uid, name }; return seatObj(seats); } // 다시 들어오기
    if (meta.status !== 'lobby') return undefined;
    for (let i = 0; i < meta.players; i++) {
      if (!seats[i]) { seat = i; seats[i] = { uid, name }; return seatObj(seats); }
    }
    return undefined; // 꽉 참
  });
  if (!res.committed || seat < 0) throw new Error(meta.status === 'lobby' ? '방이 꽉 찼어요' : '이미 시작한 방이에요');
  return { code, seat };
}

// 접속 표시: 창을 닫거나 연결이 끊기면 서버가 알아서 지우고, 다시 연결되면 다시 켠다.
// 돌려주는 함수를 부르면 표시를 끄고 감시를 멈춘다.
export function markOnline(code, seat) {
  const r = roomRef(code, `online/${seat}`);
  const stop = onValue(ref(db, '.info/connected'), (s) => {
    if (!s.val()) return;
    onDisconnect(r).remove().then(() => set(r, true)).catch(() => {});
  });
  return () => { stop(); set(r, null).catch(() => {}); };
}

export function watchRoom(code, cb) {
  return onValue(roomRef(code), (snap) => cb(snap.val()));
}

// 게임 시작(또는 한 판 더). 인원은 실제로 앉은 사람 수로 맞춘다.
export function startRoom(code, players, sync) {
  return update(roomRef(code), { 'meta/status': 'playing', 'meta/players': players, sync, live: null });
}

// 차례 결과 올리기: 내가 본 rev가 최신일 때만 (두 사람이 동시에 올려도 하나만 들어감)
export async function commitSync(code, expectedRev, sync) {
  const res = await runTransaction(roomRef(code, 'sync'), (cur) => {
    if ((cur?.rev || 0) !== expectedRev) return undefined;
    return { ...sync, rev: expectedRev + 1 };
  });
  return res.committed;
}

export function setLive(code, live) {
  return set(roomRef(code, 'live'), live);
}
