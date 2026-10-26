// 캐릭터: 사람이 고르는 동물 6종 + 컴퓨터전 상대(난이도별 컴퓨터 3종). 판마다 game.chars에 자리 순서대로 들어간다.
// 온라인은 대기실에서 고르고(남이 고른 건 못 고름), 컴퓨터전은 시작 화면에서 고른 내 캐릭터 + 난이도 컴퓨터.
// 모두 같은 그림체: 굵은 테두리, 동그란 얼굴, 볼터치.
const INK = '#2b2d42';
const S = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`;

// 눈·볼·입 (얼굴 중심 높이 y)
const eyes = (y) => `<circle cx="18" cy="${y}" r="2.7" fill="${INK}"/><circle cx="30" cy="${y}" r="2.7" fill="${INK}"/>`
  + `<circle cx="19" cy="${y - 1}" r="0.9" fill="#fff"/><circle cx="31" cy="${y - 1}" r="0.9" fill="#fff"/>`;
const blush = (y) => `<ellipse cx="13" cy="${y}" rx="3.3" ry="2" fill="#ff8fa3" opacity=".85"/><ellipse cx="35" cy="${y}" rx="3.3" ry="2" fill="#ff8fa3" opacity=".85"/>`;
const smile = (y) => `<path d="M21 ${y}q1.5 2 3 0q1.5 2 3 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;

export const CHARACTERS = [
  {
    name: '갈매기', bg: '#d9f4ff',
    svg: svg(`<path d="M19 11q5-7 10 0" fill="none" ${S} stroke-linecap="round"/>`
      + `<circle cx="24" cy="27" r="16" fill="#fff" ${S}/>`
      + `<path d="M10 22q14-8 28 0" fill="none" stroke="#c9d6e3" stroke-width="3" stroke-linecap="round"/>`
      + eyes(25) + blush(31) + `<path d="M20.5 30h7l-3.5 4.5z" fill="#ffb703" ${S}/>`),
  },
  {
    name: '수달', bg: '#ffe9c7',
    svg: svg(`<circle cx="11" cy="15" r="5" fill="#9a6a3c" ${S}/><circle cx="37" cy="15" r="5" fill="#9a6a3c" ${S}/>`
      + `<circle cx="24" cy="26" r="17" fill="#b98250" ${S}/>`
      + `<ellipse cx="24" cy="32" rx="9.5" ry="6.5" fill="#f5dfc3" ${S}/>`
      + eyes(23) + blush(30) + `<ellipse cx="24" cy="29.5" rx="2.8" ry="1.9" fill="${INK}"/>`
      + `<path d="M24 31.5v2.5" stroke="${INK}" stroke-width="1.6"/>`
      + `<path d="M14 31h-5M14 33.5l-4.5 1.5M34 31h5M34 33.5l4.5 1.5" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`),
  },
  {
    name: '고양이', bg: '#fff1d6',
    svg: svg(`<path d="M9 22 11 5l11 8z" fill="#ffab4c" ${S}/><path d="M39 22 37 5l-11 8z" fill="#ffab4c" ${S}/>`
      + `<path d="M12.5 15 13 9l4.5 3.5z" fill="#ff8fa3"/><path d="M35.5 15 35 9l-4.5 3.5z" fill="#ff8fa3"/>`
      + `<circle cx="24" cy="27" r="16" fill="#ffb35c" ${S}/>`
      + `<path d="M24 12v5M19 13l1.2 4M29 13l-1.2 4" stroke="#e07b1a" stroke-width="2.2" stroke-linecap="round"/>`
      + eyes(26) + blush(32) + `<path d="M22.5 29.5h3l-1.5 1.8z" fill="#ff6b8a"/>` + smile(32)),
  },
  {
    name: '강아지', bg: '#ffe3e8',
    svg: svg(`<circle cx="24" cy="26" r="16" fill="#fff3df" ${S}/>`
      + `<path d="M10 13q-7 10 1 20q6-6 5-17z" fill="#b5784a" ${S}/><path d="M38 13q7 10-1 20q-6-6-5-17z" fill="#b5784a" ${S}/>`
      + `<ellipse cx="30" cy="22" rx="5" ry="4" fill="#f0c99a"/>`
      + eyes(24) + blush(31) + `<ellipse cx="24" cy="29" rx="3" ry="2.2" fill="${INK}"/>` + smile(32)),
  },
  {
    name: '토끼', bg: '#efe4ff',
    svg: svg(`<path d="M17 21q-7-16 0-18q6 1 4 18z" fill="#fff" ${S}/><path d="M31 21q7-16 0-18q-6 1-4 18z" fill="#fff" ${S}/>`
      + `<path d="M17.5 17q-3-9 0-10q2.5 1 1.5 10z" fill="#ffc2d1"/><path d="M30.5 17q3-9 0-10q-2.5 1-1.5 10z" fill="#ffc2d1"/>`
      + `<circle cx="24" cy="31" r="14" fill="#fff" ${S}/>`
      + eyes(29) + blush(35) + `<path d="M22.5 33h3l-1.5 1.8z" fill="#ff6b8a"/>` + smile(35.5)),
  },
  {
    name: '곰돌이', bg: '#e3f7e6',
    svg: svg(`<circle cx="12" cy="14" r="6" fill="#9c6b3e" ${S}/><circle cx="36" cy="14" r="6" fill="#9c6b3e" ${S}/>`
      + `<circle cx="12" cy="14" r="2.8" fill="#e0b48a"/><circle cx="36" cy="14" r="2.8" fill="#e0b48a"/>`
      + `<circle cx="24" cy="27" r="17" fill="#ad7a4c" ${S}/>`
      + `<ellipse cx="24" cy="33" rx="8.5" ry="6" fill="#f0d2a8" ${S}/>`
      + eyes(24) + blush(30) + `<ellipse cx="24" cy="31" rx="2.8" ry="2" fill="${INK}"/>` + smile(34)),
  },
  // ---------- 컴퓨터전 상대 (고를 수 없음) ----------
  {
    name: '고물 컴퓨터', bg: '#efe6d2', cpu: true,
    svg: svg(`<circle cx="9" cy="7" r="2.2" fill="#d0d0d0"/><circle cx="13" cy="4.5" r="1.5" fill="#dcdcdc"/>`
      + `<path d="M15 36h18l3 6H12z" fill="#d6c8a6" ${S}/>`
      + `<rect x="6" y="9" width="36" height="27" rx="5" fill="#e8dcc0" ${S}/>`
      + `<rect x="10" y="13" width="28" height="19" rx="3" fill="#a9c79a" ${S}/>`
      + `<path d="M35 13l-2.5 4 2.5 2.5-2 3.5" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M15.5 21q2.5 2 5 0M26 21q2.5 2 5 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
      + `<path d="M19 27q1.5-1.5 3 0t3 0t3 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
      + `<rect x="3" y="27" width="10" height="4.5" rx="2" transform="rotate(-32 8 29)" fill="#ffcf9e" stroke="${INK}" stroke-width="1.4"/>`
      + `<path d="M41 4q2.2 3.2 0 5.4q-2.2-2.2 0-5.4z" fill="#7fd0ff" stroke="${INK}" stroke-width="1.2"/>`),
  },
  {
    name: '일반 컴퓨터', bg: '#e3f0ff', cpu: true,
    svg: svg(`<path d="M21 34h6l2 6h-10z" fill="#aab6c4" ${S}/><path d="M14 41h20" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`
      + `<rect x="5" y="8" width="38" height="26" rx="4" fill="#cfd8e3" ${S}/>`
      + `<rect x="9" y="11.5" width="30" height="19" rx="2.5" fill="#bfe6ff" stroke="${INK}" stroke-width="1.6"/>`
      + eyes(19) + blush(24.5) + smile(23.5)
      + `<circle cx="38.5" cy="32.2" r="1" fill="#2fbf71"/>`),
  },
  {
    name: '최신형 컴퓨터', bg: '#efe3ff', cpu: true,
    svg: svg(`<defs><linearGradient id="cpuNew" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b5cff"/><stop offset="1" stop-color="#29d3ff"/></linearGradient></defs>`
      + `<path d="M23 34h2v5h-2z" fill="#9aa3b8"/><path d="M15 40h18" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`
      + `<rect x="4" y="8" width="40" height="26" rx="4" fill="${INK}" ${S}/>`
      + `<rect x="6.5" y="10.5" width="35" height="21" rx="2.5" fill="url(#cpuNew)"/>`
      + `<path d="M18 16l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3zM30 16l1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3z" fill="#fff"/>`
      + `<path d="M20 26q4 3.5 8 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`
      + `<path d="M7 34.5h34" stroke="#29d3ff" stroke-width="1.6" opacity=".85"/>`
      + `<path d="M43 2l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9zM5 2l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" fill="#ffc93c" stroke="${INK}" stroke-width=".8"/>`),
  },
];
// 사람이 고를 수 있는 캐릭터 수 (앞쪽 동물들), 컴퓨터전 상대 캐릭터 번호
export const PLAYER_CHARS = CHARACTERS.filter((c) => !c.cpu).length;
export const CPU_CHARS = { easy: PLAYER_CHARS, normal: PLAYER_CHARS + 1, hard: PLAYER_CHARS + 2 };

// 고른 캐릭터(자리 순서, 빈 값 가능)를 겹치지 않게 채운다: 안 골랐거나 겹치면 남은 동물 중 하나
export function fillCharacters(wanted, rng = Math.random) {
  const used = new Set();
  const out = wanted.map((c) => (Number.isInteger(c) && c < PLAYER_CHARS && !used.has(c) ? (used.add(c), c) : null));
  return out.map((c) => {
    if (c !== null) return c;
    const free = [...Array(PLAYER_CHARS).keys()].filter((i) => !used.has(i));
    const pick = free[Math.floor(rng() * free.length)] ?? 0;
    used.add(pick);
    return pick;
  });
}

// 인원수만큼 서로 다른 캐릭터를 랜덤으로
export function pickCharacters(players, rng = Math.random) {
  const idx = [...Array(PLAYER_CHARS).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, players);
}

// 캐릭터 동그라미 (HTML 문자열)
export function avatarHtml(i, extraClass = '') {
  const c = CHARACTERS[i] || CHARACTERS[0];
  return `<span class="avatar ${extraClass}" style="background:${c.bg}">${c.svg}</span>`;
}
