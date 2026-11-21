// 우주비행사 고양이: 24x24 도트를 그리는 순수 함수(agents.ts 에서 옮김)와, 네 장을 SVG 안에서 돌리는 움직임(SMIL).
// 세션 카드(art.ts), 띠(band.ts), 에이전트 칸(agents.ts)이 같은 그림을 쓴다. 입출력이 없다.

// ---- 우주비행사 고양이 (24x24 도트, 원본 캐릭터) --------------------------------
// 격자에 색 칸을 찍고, 같은 줄에서 이어진 같은 색을 rect 하나로 합쳐 SVG 를 만든다. 유형은 소품과 포인트 색만 바꾼다.

export type CatState = 'run' | 'done' | 'fail' | 'idle'
const G = 24
const KIND_COLOR: Record<string, string> = { Explore: '#1FB5AA', Plan: '#8C6CF0', 'general-purpose': '#F0653F', default: '#4C8DE0' }
const FUR = '#F2994A'
const FUR_D = '#C9702A'
const CREAM = '#FFE3BD'
const PINK = '#F29A9A'
const SUIT = '#F4F4F0'
const SHADE = '#CBCBC2'
const FRAME_C = '#A9CBEA'
const GLASS = '#E3F0FB'
const GLASS_F = '#F6FAFD'
const DARK = '#2A2523'
const WHITE = '#FFFFFF'
const RED = '#E5503F'
const BLUE = '#4C8DE0'
const YEL = '#FFD35A'
const ZC = '#8D9CF0'
type Pt = [number, number]
type Deco = ['star', number, number] | ['flag', number] | ['drop', number] | ['zz', number]

const catCache = new Map<string, string>()

/** 한 장의 칸들(rect 모음). 같은 줄에서 이어진 같은 색을 rect 하나로 합친다. */
function catRects(state: CatState, frameNo: number, kind: string): string {
  const f = ((frameNo % 4) + 4) % 4
  const key = `${kind}|${state}|${f}`
  const hit = catCache.get(key)
  if (hit !== undefined) return hit

  const px = new Map<number, string>()
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < G && y >= 0 && y < G) px.set(y * G + x, c)
  }
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(x + i, y + j, c)
  }
  const pts = (list: Pt[], c: string, ox = 0, oy = 0) => {
    for (const [x, y] of list) put(x + ox, y + oy, c)
  }

  const ac = KIND_COLOR[kind] ?? KIND_COLOR.default
  let dy = 0
  let dx = 0
  let legs: Pt = [0, 0]
  let tail = 0
  let eye = 'open'
  let mouth = 'w'
  let fog = false
  let arm: Pt = [0, 0]
  let deco: Deco[] = []

  if (state === 'run') {
    dy = [0, -1, 0, -1][f]
    legs = ([[1, 0], [0, 0], [0, 1], [0, 0]] as Pt[])[f]
    tail = [0, 1, 0, -1][f]
    arm = ([[1, -1], [0, 0], [-1, 1], [0, 0]] as Pt[])[f]
    eye = f === 3 ? 'blink' : 'open'
    deco = [['star', 2, 4 + [0, 1, 2, 1][f]], ['star', 21, 18 + [2, 1, 0, 1][f]]]
  } else if (state === 'done') {
    dy = [0, -2, 0, -2][f]
    legs = f === 0 || f === 2 ? [0, 0] : [1, 1]
    tail = [1, -1, 1, -1][f]
    eye = 'happy'
    mouth = 'open'
    arm = [0, -4]
    deco = [['flag', f], ['star', 2, 5 + (f % 2)], ['star', 22, 21]]
  } else if (state === 'fail') {
    dx = [-1, 0, 1, 0][f]
    dy = [0, 0, 1, 0][f]
    legs = ([[0, 1], [1, 1], [1, 0], [1, 1]] as Pt[])[f]
    tail = [1, -1, 1, -1][f]
    eye = 'x'
    mouth = 'wavy'
    fog = true
    arm = ([[-3, 0], [0, -3], [-3, 0], [0, -3]] as Pt[])[f]
    deco = [['drop', f]]
  } else {
    dy = [0, 0, 1, 0][f]
    legs = [1, 1]
    tail = [0, 0, 1, 0][f]
    eye = 'shut'
    mouth = f === 1 || f === 2 ? 'o' : 'w'
    arm = [1, 1]
    deco = [['zz', f]]
  }

  const ox = dx
  const oy = dy
  // 꼬리
  const tp: Pt[] = [[7, 19], [6, 19], [5, 18], [5, 17], [4, 16]]
  tp.forEach(([x, y], i) => put(x + ox, y + oy + (i >= 2 ? tail : 0), FUR))
  put(4 + ox, 16 + oy + tail, FUR_D)
  if (tail > 0) put(3 + ox, 16 + oy + tail, FUR_D)
  // 다리
  ;[8, 13].forEach((x, i) => {
    rect(x + ox, 20 + oy - legs[i], 3, 2, SUIT)
    rect(x + ox, 22 + oy - legs[i], 3, 1, ac)
  })
  // 몸
  rect(8 + ox, 16 + oy, 8, 4, SUIT)
  rect(8 + ox, 19 + oy, 8, 1, SHADE)
  put(10 + ox, 17 + oy, RED)
  put(13 + ox, 17 + oy, BLUE)
  if (kind === 'general-purpose') pts([[11, 17], [12, 17], [11, 18], [12, 16]], YEL, ox, oy)
  // 팔
  const ly = 17 + oy + arm[0]
  const ry = 17 + oy + arm[1]
  rect(6 + ox, ly, 2, 2, SUIT)
  put(6 + ox, ly + 1, ac)
  rect(16 + ox, ry, 2, 2, SUIT)
  put(17 + ox, ry + 1, ac)
  if (state !== 'done') {
    if (kind === 'Explore') {
      pts([[18, 16], [19, 15], [20, 14], [21, 13]], ac, ox, oy)
      pts([[21, 12], [22, 12], [22, 13]], SHADE, ox, oy)
    } else if (kind === 'Plan') {
      rect(18 + ox, 15 + oy, 3, 5, WHITE)
      rect(18 + ox, 15 + oy, 3, 1, ac)
      pts([[19, 17], [20, 17], [19, 18]], ac, ox, oy)
    }
  }
  // 목 고리
  rect(6 + ox, 15 + oy, 12, 1, ac)
  // 안테나(그 밖의 유형)
  if (kind !== 'Explore' && kind !== 'Plan' && kind !== 'general-purpose') {
    pts([[11, 2], [12, 2]], SHADE, ox, oy)
    pts([[11, 1], [12, 1]], RED, ox, oy)
  }
  // 헬멧 바탕
  const glass = fog ? GLASS_F : GLASS
  for (let y = 3; y < 15; y += 1) {
    const inset = y === 3 || y === 14 ? 2 : y === 4 || y === 13 ? 1 : 0
    rect(4 + inset + ox, y + oy, 16 - 2 * inset, 1, glass)
  }
  // 귀
  pts([[6, 4], [5, 5], [6, 5], [7, 5], [17, 4], [16, 5], [17, 5], [18, 5]], FUR, ox, oy)
  pts([[6, 5], [17, 5]], PINK, ox, oy)
  // 얼굴
  for (let y = 5; y < 14; y += 1) {
    const inset = y === 5 || y === 13 ? 1 : 0
    rect(5 + inset + ox, y + oy, 14 - 2 * inset, 1, FUR)
  }
  pts([[10, 5], [12, 5], [14, 5], [10, 6], [14, 6]], FUR_D, ox, oy)
  rect(9 + ox, 11 + oy, 6, 3, CREAM)
  pts([[6, 11], [17, 11], [6, 12], [17, 12]], PINK, ox, oy)
  // 눈
  if (eye === 'open') {
    rect(8 + ox, 8 + oy, 2, 3, DARK)
    rect(14 + ox, 8 + oy, 2, 3, DARK)
    put(8 + ox, 8 + oy, WHITE)
    put(14 + ox, 8 + oy, WHITE)
  } else if (eye === 'blink') {
    rect(8 + ox, 10 + oy, 3, 1, DARK)
    rect(14 + ox, 10 + oy, 3, 1, DARK)
  } else if (eye === 'happy') {
    pts([[8, 10], [9, 9], [10, 10], [14, 10], [15, 9], [16, 10]], DARK, ox, oy)
  } else if (eye === 'shut') {
    pts([[8, 9], [9, 10], [10, 9], [14, 9], [15, 10], [16, 9]], DARK, ox, oy)
  } else if (eye === 'x') {
    pts([[8, 8], [10, 8], [9, 9], [8, 10], [10, 10], [14, 8], [16, 8], [15, 9], [14, 10], [16, 10]], DARK, ox, oy)
  }
  // 코·입
  pts([[11, 11], [12, 11]], PINK, ox, oy)
  if (mouth === 'w') pts([[10, 12], [11, 13], [12, 13], [13, 12]], DARK, ox, oy)
  else if (mouth === 'open') {
    rect(10 + ox, 12 + oy, 4, 2, DARK)
    pts([[11, 13], [12, 13]], PINK, ox, oy)
  } else if (mouth === 'wavy') pts([[10, 13], [11, 12], [12, 13], [13, 12]], DARK, ox, oy)
  else if (mouth === 'o') rect(11 + ox, 12 + oy, 2, 2, DARK)
  // 헬멧 테두리
  for (let y = 3; y < 15; y += 1) {
    const inset = y === 3 || y === 14 ? 2 : y === 4 || y === 13 ? 1 : 0
    const xl = 4 + inset
    const xr = 19 - inset
    if (y === 3 || y === 14) rect(xl + ox, y + oy, xr - xl + 1, 1, FRAME_C)
    else {
      put(xl + ox, y + oy, FRAME_C)
      put(xr + ox, y + oy, FRAME_C)
    }
  }
  if (fog) pts([[14, 4], [14, 5], [13, 6], [13, 7]], DARK, ox, oy)
  // 하이라이트
  pts([[5, 6], [5, 7], [6, 5]], WHITE, ox, oy)
  // 몸 밖 장식
  for (const d of deco) {
    if (d[0] === 'star') {
      const [, x, y] = d
      pts([[x, y - 1], [x - 1, y], [x, y], [x + 1, y], [x, y + 1]], YEL)
    } else if (d[0] === 'flag') {
      rect(21, 4 + oy, 1, 13, DARK)
      const wv = [0, 1, 0, -1][d[1]]
      rect(22, 4 + oy, 2, 3, RED)
      if (wv === 1) put(23, 7 + oy, RED)
      else if (wv === -1) put(23, 3 + oy, RED)
    } else if (d[0] === 'drop') {
      pts([[20, 5], [20, 6]], '#7CC4FF')
    } else {
      const z = (x: number, y: number, s: number) => {
        rect(x, y, s, 1, ZC)
        rect(x, y + s - 1, s, 1, ZC)
        for (let k = 0; k < s - 2; k += 1) put(x + s - 2 - k, y + 1 + k, ZC)
      }
      if (d[1] === 1) z(19, 5, 3)
      else if (d[1] === 2) {
        z(19, 4, 4)
        z(22, 1, 2)
      } else if (d[1] === 3) {
        z(20, 3, 4)
        z(22, 0, 2)
      }
    }
  }

  let rects = ''
  for (let y = 0; y < G; y += 1) {
    let x = 0
    while (x < G) {
      const c = px.get(y * G + x)
      if (c === undefined) {
        x += 1
        continue
      }
      let x2 = x
      while (x2 + 1 < G && px.get(y * G + x2 + 1) === c) x2 += 1
      rects += `<rect x="${x}" y="${y}" width="${x2 - x + 1}" height="1" fill="${c}"/>`
      x = x2 + 1
    }
  }
  catCache.set(key, rects)
  return rects
}

/** 고양이 한 장(frameNo 는 0~3, 넘으면 돌아간다). */
export function catSvg(state: CatState, frameNo: number, kind: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G} ${G}" shape-rendering="crispEdges">${catRects(state, frameNo, kind)}</svg>`
}

// ---- 움직임 -----------------------------------------------------------------------
// 타이머가 화면을 다시 그리지 않아도 움직이도록, 네 장을 SVG 안에서 번갈아 보인다(SMIL).

/** 문자열(세션·에이전트 id)의 작은 해시(0~999 ms). 같은 순간에 시작한 고양이끼리도 박자가 갈리게 위상에 더한다. */
export function hashMs(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 1000
}

/**
 * 프레임 여러 장을 SVG 안에서 번갈아 보인다(SMIL, 한 장에 dur/장수 초). phaseMs 는 이 고양이의 위상(시작 시각 등)이다:
 * 지금 보일 장을 맨 앞에 두고 그 장 안에서 지난 몫을 음수 begin 으로 준다. 그래서 고양이마다 박자가 다르고,
 * SMIL 을 못 그리는 화면은 맨 앞 장(위상에 맞는 장)만 보인다.
 * 움직임을 줄이는 설정(REDUCED)에서는 도는 장을 모두 숨기고, 숨겨 둔 정지 장(맨 앞 장과 같다) 하나만 보인다.
 */
export function flick(frames: string[], dur: number, phaseMs = 0): string {
  const n = frames.length
  const cycle = dur * 1000
  const step = cycle / n
  const p = ((phaseMs % cycle) + cycle) % cycle
  const start = Math.floor(p / step)
  const begin = Math.round(p - start * step) / 1000
  const order = frames.map((_, i) => frames[(start + i) % n])
  const at = begin > 0 ? ` begin="-${begin}s"` : ''
  const turning = order.map((f, i) => `<g class="cat-m"${i ? ' visibility="hidden"' : ''}><animate attributeName="visibility" values="${order.map((_, j) => (j === i ? 'visible' : 'hidden')).join(';')}" calcMode="discrete" dur="${dur}s"${at} repeatCount="indefinite"/>${f}</g>`)
  return turning.join('') + `<g class="cat-still" display="none">${order[0]}</g>`
}

// 움직임 줄이기(prefers-reduced-motion): SMIL 은 CSS 로 멈출 수 없어 도는 장을 숨기고 정지 장을 보인다. 이 그림을 담는 SVG 마다 함께 넣는다.
// display 는 SMIL 이 바꾸는 visibility 와 다른 속성이고, CSS 규칙은 display="none" 속성보다 앞선다
const REDUCED = '<style>@media (prefers-reduced-motion: reduce){.cat-m{display:none}.cat-still{display:inline}}</style>'

/** 네 장이 한 바퀴 도는 시간(초). 한 장은 250ms 이고, 대기는 절반 속도다. */
const catDur = (state: CatState) => (state === 'idle' ? 2 : 1)
const motion = (state: CatState, kind: string, phaseMs: number) => flick([0, 1, 2, 3].map((f) => catRects(state, f, kind)), catDur(state), phaseMs)

/** 움직이는 고양이 SVG(에이전트 칸). phaseMs = 지금 - 시작 시각 + id 해시. */
export const catMotionSvg = (state: CatState, kind: string, phaseMs: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${G} ${G}" shape-rendering="crispEdges">${REDUCED}${motion(state, kind, phaseMs)}</svg>`

/** 세션 카드·띠가 쓰는 이름(run/flag/zz)을 고양이 상태로 옮긴다: 달리는 / 깃발 든 / 조는. */
const MOOD_STATE: Record<'run' | 'flag' | 'zz', CatState> = { run: 'run', flag: 'done', zz: 'idle' }

/** 카드·띠 그림 안에 넣는 심볼. 이 그림을 쓰는 이미지는 defs 에 이것을 함께 담는다. */
export const catSymbol = (mood: 'run' | 'flag' | 'zz', phaseMs = 0) =>
  `<symbol id="${mood}" viewBox="0 0 ${G} ${G}" shape-rendering="crispEdges">${REDUCED}${motion(MOOD_STATE[mood], 'default', phaseMs)}</symbol>`
