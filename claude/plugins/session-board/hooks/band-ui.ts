// 띠 그림: 접힌 줄의 진행 막대와 경고 칩, 펼친 지표 격자, 개수 배지. 입출력이 없는 순수 함수만 둔다.
// 색·간격·반지름·글자·움직임은 tokens.ts 에서만 읽는다. 구성 원칙: 간격은 세 단계(구역 > 묶음 > 항목), 값에는 이름과 단위, 색만으로 말하지 않기(기호를 함께).
// 그래프 종류 규칙: 펼친 격자의 그래프는 이력(최근 턴)이 2개 이상이면 이력이다. 비율(%)은 0~100 눈금의 선, 턴마다 양(토큰·비용·초)은 0 에서 시작하는 세로 막대.
//   이력이 없는 한도(5시간·주간)는 지금 수준 막대, 부분의 합(하위 에이전트·rulegate)은 누적 막대, 결과 목록(검증)은 기호 칸이다. 접힌 줄은 늘 지금 수준 막대다.

import { CAT, tw } from './art'
import { FONT, GAP, MOTION, RADIUS, SPACE, TYPE, styleBlock } from './tokens'
import type { ClassName } from './tokens'

export type Tone = 'ok' | 'info' | 'warn' | 'err' | 'mute'
export type Rich = {
  verify: { tone: Tone; text: string } | null
  children: number
  context: { percent: number; tokens: number; window: number } | null
  week: { percent: number; mark: number | null; today: string | null; todayTone: Tone; reset: string | null; recommended: number | null; pace: number | null; projected?: number | null } | null
  turn: { text: string } | null
  cache: { tone: Tone; alert: string | null; left?: number | null } | null
  history: number[]
  mood?: 'run' | 'flag' | 'zz' // 띠 고양이: 일하는 중 / 알릴 일이 있음 / 쉬는 중
  // 펼친 격자의 항목들 (원천은 band.ts 의 수집 변수에 적었다)
  five?: { percent: number; reset: string | null } | null
  limits?: string[] | null // 엔진이 준 한도 창 종류 (사용량을 읽기 전이면 null). five_hour 가 없으면 5시간 칸은 "제공 안 됨"
  hits?: number[] // 턴마다 캐시 적중률(%)
  turnTokens?: { fresh: number; read: number; write: number; output: number }[] // 턴마다 새 입력 · 캐시 읽기 · 캐시 쓰기 · 출력 토큰
  costs?: number[] // 턴마다 비용($)
  costTotal?: number | null
  secs?: number[] // 턴마다 걸린 초
  agents?: { running: number; waiting: number; done: number; failed: number } | null
  rules?: { block: number; ask: number; warn: number } | null
  verifies?: ('ok' | 'warn' | 'err')[] // 턴마다 검증 결과
  session?: { elapsed: string; turns: number | null; staleMin?: number | null } | null
  // 작업·품질 묶음의 항목 (원천은 band.ts 의 수집 변수에 적었다). 모드가 로드된 뒤부터 센다
  perHour?: number | null // 세션 비용 / 지난 시간
  compacts?: { auto: number; manual: number } | null // session.compact
  tools?: { calls: number; errors: number; denies: number; by: [string, number][] } | null // tool.call, by 는 많은 순
  edits?: { files: number; added: number; removed: number } | null // Edit·Write·MultiEdit 입력의 줄 수
  spec?: { changes: { name: string; done: number; total: number }[]; branch: string | null; root: string } | null // OpenSpec 진행 중 change 들 (없으면 null)
  specEmpty?: string // spec 이 null 인 이유: "이 폴더에 OpenSpec 없음 (경로)" / "진행 중 change 없음"
  model?: string | null
  effort?: string | null
  aborted?: number // turn.complete isAborted
  asks?: number // tool.check 결정 ask
  subTokens?: number // 하위 에이전트 turn.complete usage 합 (새 입력 + 쓰기 + 출력)
}

// ---- 글자: 고정폭 글꼴 조각 안의 한글은 sans 로 나눠 그린다 (Consolas 에는 한글이 없다) ----
export type Run = { t: string; cls: ClassName; weight?: number; mono?: boolean }
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const HANGUL = /([ᄀ-ᇿ가-힣]+)/
const splitMono = (runs: Run[]): Run[] => runs.flatMap(r => (r.mono ? r.t.split(HANGUL).filter(Boolean).map(t => ({ ...r, t, mono: !HANGUL.test(t) })) : [r]))
export const rs = (runs: Run[], x: number, y: number, size: number, anchor = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" xml:space="preserve"${anchor ? ` text-anchor="${anchor}"` : ''}>${splitMono(runs).map(r => `<tspan class="${r.cls}${r.mono ? ' num' : ''}" font-family="${r.mono ? FONT.mono : FONT.sans}" font-weight="${r.weight ?? 400}">${xml(r.t)}</tspan>`).join('')}</text>`
export const rsW = (runs: Run[], size: number) => runs.reduce((n, r) => n + tw(r.t, size, r.mono, (r.weight ?? 400) >= 600), 0)
export const svgDoc = (w: number, h: number, body: string, animate = false, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}">${styleBlock(animate)}${extra ? `<defs>${extra}</defs>` : ''}${body}</svg>`
/** 그림의 원래 크기(width·height 속성). Svg 에 그대로 넘겨 패널 폭에 맞춰 커지지 않게 한다. */
export const sizeOf = (svg: string): { width?: number; height?: number } => {
  const m = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(svg)
  return m ? { width: Math.round(Number(m[1])), height: Math.round(Number(m[2])) } : {}
}

// ---- 진행 막대 (이름표는 옆 글자, 변형 accent → warning(70%) → error(85%), 색 없이도 남은 양이 보인다) ----
export const variantOf = (p: number): ClassName => (p >= 85 ? 'err' : p >= 70 ? 'warn' : 'acc')
const BAR_H = SPACE[2]
// 트랙은 바탕과 대비가 낮아 100% 끝에 눈금을 둔다(막대 끝이 보인다)
const bar = (x: number, y: number, w: number, pct: number, cls: ClassName, mark: number | null = null) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${BAR_H}" rx="${RADIUS.inner}" class="trk"/><rect x="${x}" y="${y}" width="${Math.max(BAR_H, (w * Math.max(0, Math.min(100, pct))) / 100).toFixed(1)}" height="${BAR_H}" rx="${RADIUS.inner}" class="${cls}"/>` +
  `<rect x="${x + w - 1}" y="${y - 2}" width="1" height="${BAR_H + 4}" class="t2"/>` +
  (mark === null ? '' : `<rect x="${(x + (w * Math.min(100, mark)) / 100 - 1).toFixed(1)}" y="${y - 3}" width="2" height="${BAR_H + 6}" class="t1"/>`)
// 상태 칸: 색 + 기호 (색만으로 말하지 않는다). 기호도 12px, 최근 6턴
const GLYPH = { ok: '✓', warn: '!', err: '✗' } as const
const MARK = SPACE[4]
const marks = (x: number, y: number, list: ('ok' | 'warn' | 'err')[]) =>
  list.slice(-6).map((s, i) => `<rect x="${x + i * (MARK + 2)}" y="${y - 2}" width="${MARK}" height="${MARK}" rx="${RADIUS.inner}" class="${s}"/><text x="${x + i * (MARK + 2) + MARK / 2}" y="${y + 10}" font-size="${TYPE.sm}" font-weight="700" text-anchor="middle" class="onacc">${GLYPH[s]}</text>`).join('')

// ---- 접힌 줄: 툴바의 가운데 구역 (컨텍스트·주간 진행 막대 + 턴·캐시·검증). 시작 구역(고양이·배지)과 끝 구역(세부 단추)은 band.ts 가 놓는다 ----
// 경고·오류(검증 못함·실패, 캐시 만료 임박)는 칩으로 그리고 좁아도 빼지 않는다. 글자에 ✗/⚠ 가 있어 색만으로 말하지 않는다.
const H = 36 // 고양이 동그라미(36)와 같은 높이
// 파스텔 동그라미 바탕: 일하는 중 / 알릴 일이 있음 / 쉬는 중 (결재함의 색 규칙)
export const MOOD_BG = { run: '#E4E9FF', flag: '#FEF3C7', zz: '#EEF0F8' }
/** 파스텔 동그라미 안의 고양이(가운데 (cx, cy)). 이 그림을 쓰는 이미지는 defs 에 CAT[mood] 를 함께 담아야 한다. */
export const catAvatar = (mood: 'run' | 'flag' | 'zz', cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="16" fill="${MOOD_BG[mood]}"/><use href="#${mood}" x="${cx - 13}" y="${cy - 13}" width="26" height="26"/>`
/** 접힌 줄의 늘 보이는 지표 (재디자인 전 띠에 있던 턴·캐시·검증). 경고·오류는 칩, 나머지는 글자 */
export function bandStats(d: Rich): { key: 'turn' | 'cache' | 'verify' | 'spec'; runs: Run[]; chip: ClassName | null; short?: Run[] }[] {
  const out: { key: 'turn' | 'cache' | 'verify' | 'spec'; runs: Run[]; chip: ClassName | null; short?: Run[] }[] = []
  if (d.turn) out.push({ key: 'turn', runs: [{ t: '턴 ', cls: 't2' }, { t: d.turn.text, cls: 't1', weight: 600, mono: true }], chip: null })
  const c = d.cache
  if (c && (c.tone === 'warn' || c.tone === 'err') && c.alert) out.push({ key: 'cache', runs: [{ t: c.alert, cls: c.tone, weight: 600 }], chip: c.tone })
  else if (c && c.left != null) out.push({ key: 'cache', runs: [{ t: '캐시 ', cls: 't2' }, { t: c.left <= 0 ? '만료(추정)' : `약 ${c.left}분`, cls: 't1', weight: 600, mono: true }], chip: null })
  const v = d.verify
  if (v) {
    const cls: ClassName = v.tone === 'ok' ? 'ok' : v.tone === 'warn' ? 'warn' : v.tone === 'err' ? 'err' : 't2'
    // 짧은 칩: 아주 좁을 때 "✗ 검증 실패: a.py" → "✗ 검증 실패" (파일·사유는 대체 글과 세부 격자에 남는다)
    out.push({ key: 'verify', runs: [{ t: v.text, cls, weight: 600 }], chip: v.tone === 'warn' || v.tone === 'err' ? v.tone : null, short: [{ t: v.text.split(/:| \(/)[0], cls, weight: 600 }] })
  }
  // OpenSpec 진행률 "작업 31% 10/32" (진행 중 change 가 없으면 없다). 옛 session-band 의 보라 고리 자리
  if (d.spec) {
    const t = specSum(d.spec)
    const head: Run[] = [{ t: '작업 ', cls: 't2' }, { t: `${t.pct}%`, cls: 't1', weight: 600, mono: true }]
    out.push({ key: 'spec', runs: [...head, { t: ` ${t.done}/${t.total}`, cls: 't2', mono: true }], chip: null, short: head }) // 아주 좁으면 "작업 91%"
  }
  return out
}

/**
 * 접힌 줄 그림의 단계 (0 = 다 보임). 0~4 는 덜 중요한 칸을 뺀다: 오늘 → 턴 → 캐시 → 검증(통과).
 * 5~9 는 경고 칩을 짧게 한 뒤 필수 세 항목(컨텍스트·주간·작업)을 짧게 한다: 막대 줄이기 → 막대 없애기 → 이름 줄이기("컨"·"주"·"작") → "98/107" 빼기.
 * 필수 세 항목과 그 % 는 어느 단계에서도 빠지지 않는다 (컨텍스트·주간·OpenSpec).
 * 끝 구역(노력 힌트·배지·인계)을 줄이는 단계는 barPlan(band.ts)이 4 와 5 사이에 넣는다
 */
export const BAND_LEVEL = { othersLast: 4, last: 9 } as const
const WIDTHS = new WeakMap<Rich, Map<string, number>>() // 데이터 한 벌의 단계별 그림 폭 (그리기마다 새 데이터라 쌓이지 않는다)
/**
 * 접힌 줄의 그림: 컨텍스트 · 주간(오늘) · 턴 · 캐시 · 검증 · 작업(OpenSpec). range 안에서 maxW 에 드는 첫 단계를 고른다(BAND_LEVEL).
 * 경고·오류 칩(검증 못함·실패, 캐시 임박)은 빼지 않고 짧게만 한다. 값은 자르지 않는다. noCat 이 아니면 왼쪽에 고양이를 함께 그린다(옛 호출).
 */
export function bandSvg(d: Rich, maxW: number, noCat = false, range: [number, number] = [0, BAND_LEVEL.last], part: 'all' | 'metrics' | 'chips' = 'all', measure = false): { svg: string; w: number; hidden: number; level: number; fits: boolean } {
  const cy = H / 2
  type Show = { barW: number; today: boolean; turn: boolean; cache: boolean; verify: boolean; chipShort?: boolean; shortName?: boolean; noCount?: boolean; gap: number }
  const build = ({ barW, today: withToday, turn: withTurn, cache: withCache, verify: withVerify, chipShort: shortChip, shortName, noCount }: Show) => {
    const items: { w: number; draw: (x: number) => string }[] = []
    const progress = (label: string, p: number, cls: ClassName, mark: number | null, tail: Run[]) => {
      const lab: Run[] = [{ t: label, cls: 't2' }]
      const val: Run[] = [{ t: `${Math.round(p)}%`, cls: 't1', weight: 600, mono: true }]
      const lw = rsW(lab, TYPE.sm) + SPACE[2]
      const vw = rsW(val, TYPE.body)
      const tailW = tail.length ? SPACE[2] + rsW(tail, TYPE.sm) : 0
      const bw = barW > 0 ? barW + SPACE[2] : 0 // barW 0: 막대 없이 이름과 % 만 (가장 좁은 단계)
      items.push({ w: lw + bw + vw + tailW, draw: x => rs(lab, x, cy + 4, TYPE.sm) + (barW > 0 ? bar(x + lw, cy - BAR_H / 2, barW, p, cls, mark) : '') + rs(val, x + lw + bw, cy + 5, TYPE.body) + (tail.length ? rs(tail, x + lw + bw + vw + SPACE[2], cy + 4, TYPE.sm) : '') })
    }
    // part: 'metrics' = 경고 칩 없이(두 줄 배치의 첫 줄), 'chips' = 경고 칩만(칩이 첫 줄에 안 들어갈 때 따로 한 줄)
    if (d.context && part !== 'chips') progress(shortName ? '컨' : '컨텍스트', d.context.percent, variantOf(d.context.percent), null, [])
    if (d.week && part !== 'chips') {
      const k = d.week
      const cls: ClassName = k.todayTone === 'err' ? 'err' : k.todayTone === 'warn' ? 'warn' : 'acc'
      const tail: Run[] = withToday && k.today ? [{ t: '오늘 ', cls: 't2' }, { t: k.today, cls: k.todayTone === 'err' ? 'err' : k.todayTone === 'warn' ? 'warn' : 't2', mono: true }] : []
      progress(shortName ? '주' : '주간', k.percent, cls, k.mark, tail)
    }
    for (const s of bandStats(d)) {
      if ((part === 'chips' && !s.chip) || (part === 'metrics' && s.chip)) continue
      if (!s.chip && !({ turn: withTurn, cache: withCache, verify: withVerify, spec: true } as const)[s.key]) continue // 경고·오류 칩과 작업은 빼지 않는다
      // 글자 크기: 이름 12 · 값 14 (진행 막대 칸과 같은 사다리). 칩은 12 한 가지. 짧은 꼴: 칩은 파일·사유를 빼고, 작업은 "작" 과 "98/107" 빼기
      const base = s.key === 'spec' ? (noCount ? s.short! : s.runs).map((r, i) => (i === 0 && shortName ? { ...r, t: '작 ' } : r)) : s.chip && shortChip && s.short ? s.short : s.runs
      const sized = base.map(r => ({ ...r, size: s.chip || r.cls === 't2' ? TYPE.sm : TYPE.body }))
      const tw2 = sized.reduce((n, r) => n + rsW([r], r.size), 0)
      const w = tw2 + (s.chip ? SPACE[3] * 2 : 0)
      items.push({
        w,
        draw: x => {
          let tx = x + (s.chip ? SPACE[3] : 0)
          let out = s.chip ? `<rect x="${x + 0.5}" y="${cy - 10.5}" width="${w - 1}" height="21" rx="10.5" class="card" style="stroke:var(--color-border)"/>` : ''
          for (const r of sized) {
            out += rs([r], tx, cy + (r.size === TYPE.body ? 5 : 4), r.size)
            tx += rsW([r], r.size)
          }
          return out
        },
      })
    }
    return items
  }
  const all: Show = { barW: 72, today: true, turn: true, cache: true, verify: true, gap: SPACE[6] }
  const lean: Show = { ...all, today: false, turn: false, cache: false, verify: false, chipShort: true }
  const steps: Show[] = [
    all, // 0
    { ...all, today: false }, // 1
    { ...all, today: false, turn: false }, // 2
    { ...all, today: false, turn: false, cache: false }, // 3
    { ...lean, chipShort: false }, // 4: 검증(통과) 빼기 (= othersLast)
    lean, // 5: 경고 칩 짧게
    { ...lean, barW: 48 }, // 6: 필수 세 항목의 막대 줄이기
    { ...lean, barW: 0 }, // 7: 막대 없애기
    { ...lean, barW: 0, shortName: true, gap: SPACE[3] }, // 8: 이름 줄이기 ("컨"·"주"·"작"), 칸 사이도 묶음 간격으로
    { ...lean, barW: 0, shortName: true, noCount: true, gap: SPACE[3] }, // 9: "98/107" 빼기
  ]
  const catW = noCat ? SPACE[3] : 36 + SPACE[2] // 따로 그린 고양이와 첫 이름 사이도 칸 사이 간격(12)
  // 단계별 폭은 maxW 와 상관없어 같은 데이터(d)에 한 번만 잰다: barPlan 이 폭을 바꿔 가며 여러 번 부른다
  let memo = WIDTHS.get(d)
  if (!memo) WIDTHS.set(d, (memo = new Map()))
  const widthOf = (i: number) => {
    const key = `${part}:${noCat}:${i}`
    let w = memo!.get(key)
    if (w === undefined) {
      const s = steps[i]!
      const list = build(s)
      w = catW + list.reduce((n, it) => n + it.w, 0) + s.gap * Math.max(0, list.length - 1) + SPACE[2]
      memo!.set(key, w)
    }
    return w
  }
  let pick = range[1]
  let fits = false
  for (let i = range[0]; i <= range[1]; i += 1) {
    if (widthOf(i) <= maxW) {
      pick = i
      fits = true
      break
    }
  }
  // measure: 폭과 단계만 잰다(그림은 만들지 않는다). barPlan 이 배치를 고를 때 쓴다
  if (measure) return { svg: '', w: Math.round(Math.max(1, widthOf(pick))), hidden: 0, level: pick, fits }
  const step = steps[pick]!
  const items = build(step)
  const mood = d.mood ?? 'zz'
  let body = noCat ? '' : catAvatar(mood, 18, cy)
  let x = catW
  items.forEach(it => {
    body += it.draw(x)
    x += it.w + step.gap
  })
  const w = Math.round(Math.max(1, x - step.gap + SPACE[2]))
  const hidden = build(all).length - items.length + (d.week?.today && !step.today ? 1 : 0)
  return { svg: svgDoc(w, H, body, false, noCat ? '' : CAT[mood]), w, hidden, level: pick, fits }
}

// ---- 개수 배지: 기호 + 굵은 숫자 (결재 ✗ · 알림 ! · 확인 ✓). 띠와 같은 높이 ----
const BADGE = { err: { glyph: '✗', cls: 'err' }, warn: { glyph: '!', cls: 'warn' }, ok: { glyph: '✓', cls: 'ok' } } as const
export function askPillSvg(level: 'err' | 'warn' | 'ok', n: number): { svg: string; w: number; h: number } {
  const b = BADGE[level]
  const num: Run[] = [{ t: String(n), cls: 't1', weight: 700, mono: true }]
  const w = SPACE[3] + 10 + SPACE[1] + rsW(num, TYPE.sm) + SPACE[3]
  // radius-full(알약): SVG 는 rx 를 높이 절반으로 줘야 알약이 된다
  const body = `<rect x="0.5" y="${H / 2 - 10 + 0.5}" width="${w - 1}" height="19" rx="9.5" class="card" style="stroke:var(--color-border)"/><text x="${SPACE[3] + 5}" y="${H / 2 + 4}" font-size="${TYPE.sm}" font-weight="700" text-anchor="middle" class="${b.cls}">${b.glyph}</text>${rs(num, SPACE[3] + 10 + SPACE[1], H / 2 + 4, TYPE.sm)}`
  return { svg: svgDoc(w, H, body), w: Math.round(w), h: H }
}

// ---- 펼친 격자: 칸마다 이름·단위 | 큰 값 | 근거(잘리지 않게 짧은 표현으로 바꾼다) | 추이 ----
export type Cell = { k: string; u: string; v: string; notes: string[]; empty: boolean; chart: (y: number) => string }
const k1 = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n))
const k1f = (n: number) => (n / 1000).toFixed(n >= 100_000 ? 0 : 1) // k 단위 숫자 (단위 k 는 이름 옆에 쓴다)
const last = <T,>(a: T[] | undefined): T | undefined => (a && a.length > 0 ? a[a.length - 1] : undefined)
const parts = (list: [string, number][], keep: (n: number) => boolean) => list.filter(([, n]) => keep(n))
/** 근거 문구의 후보: 앞이 자세하고 뒤가 짧다. 0 이 아닌 실패·막음은 어느 후보에서도 빠지지 않는다. 누적 막대의 구간 순서와 같은 순서로 쓴다. */
const noteSet = (list: [string, number][]) => {
  const nonzero = parts(list, n => n > 0)
  const kept = nonzero.length ? nonzero : null
  return [
    list.map(([l, n]) => `${l} ${n}`).join(' · '),
    kept ? kept.map(([l, n]) => `${l} ${n}`).join(' · ') : '없음',
    kept ? kept.map(([l, n]) => `${l}${n}`).join(' ') : '없음',
  ]
}
const EMPTY_NOTE = '아직 값 없음'
const PCT: [number, number] = [0, 100]

// 격자 칸의 그래프는 가로를 칸 폭의 비율(%)로 그린다: 앱이 그림을 띠 폭에 맞춰 늘이면 그래프도 칸을 꽉 채운다. 높이·글자는 px 그대로
const pc = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(2)}%`
const at = (x: string, inner: string) => `<svg x="${x}" y="0" width="1" height="1" overflow="visible">${inner}</svg>` // x 위치(%)에 px 로 그린 조각을 붙인다
const blank = (y: number) => `<rect x="0" y="${y + 3}" width="100%" height="${BAR_H}" rx="${RADIUS.inner}" class="trk"/>`
const pBar = (y: number, p: number, cls: ClassName, mark: number | null = null) =>
  `<rect x="0" y="${y}" width="100%" height="${BAR_H}" rx="${RADIUS.inner}" class="trk"/>` +
  `<rect x="0" y="${y}" width="${BAR_H}" height="${BAR_H}" rx="${RADIUS.inner}" class="${cls}"/><rect x="0" y="${y}" width="${pc(p)}" height="${BAR_H}" rx="${RADIUS.inner}" class="${cls}"/>` +
  at('100%', `<rect x="-1" y="${y - 2}" width="1" height="${BAR_H + 4}" class="t2"/>`) +
  (mark === null ? '' : at(pc(mark), `<rect x="-1" y="${y - 3}" width="2" height="${BAR_H + 6}" class="t1"/>`))
// 이력 선: domain 을 주면 그 눈금(비율은 0~100)에 그려 작은 변화를 키우지 않는다. 가로로 늘여도 선 굵기는 그대로
const pSpark = (y: number, h: number, pts: number[], domain: [number, number] | null = null) => {
  const lo = domain ? domain[0] : Math.min(...pts)
  const hi = domain ? domain[1] : Math.max(...pts, lo + 1)
  const P = pts.map((p, i) => [(i / (pts.length - 1)) * 100, h - ((Math.max(lo, Math.min(hi, p)) - lo) / (hi - lo)) * h] as const)
  return `<svg x="0" y="${y}" width="100%" height="${h}" viewBox="0 0 100 ${h}" preserveAspectRatio="none" overflow="visible"><path class="line" d="${P.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ')}" vector-effect="non-scaling-stroke"/></svg>` +
    at('100%', `<circle cx="0" cy="${(y + P[P.length - 1][1]).toFixed(1)}" r="2.5" class="acc"/>`)
}
// 턴별 양: 0 에서 시작한다. 지난 턴은 바탕과 3:1 이상인 흐린 색, 이번 턴은 강조색
const pCols = (y: number, h: number, vals: number[]) => {
  const hi = Math.max(...vals, 1e-9)
  const bw = 100 / vals.length
  return vals.map((v, i) => `<rect x="${pc(i * bw + bw * 0.1)}" y="${(y + h - (v / hi) * h).toFixed(1)}" width="${pc(bw * 0.8)}" height="${Math.max(1, (v / hi) * h).toFixed(1)}" rx="1" class="${i === vals.length - 1 ? 'acc' : 'mut'}"/>`).join('')
}
const pStack = (y: number, parts: [number, ClassName][]) => {
  const total = parts.reduce((n, p) => n + p[0], 0)
  let cx = 0
  let out = `<rect x="0" y="${y}" width="100%" height="${BAR_H}" rx="${RADIUS.inner}" class="trk"/>`
  if (total > 0)
    for (const [n, cls] of parts) {
      if (n > 0) out += `<rect x="${pc(cx)}" y="${y}" width="${pc((100 * n) / total)}" height="${BAR_H}" class="${cls}"/>`
      cx += (100 * n) / total
    }
  return out
}

type Spec = NonNullable<Rich['spec']>
/** OpenSpec 합계: 끝난 수 / 전체 수, 백분율(내림), 남은 수 */
export const specSum = (s: Spec) => {
  const done = s.changes.reduce((n, c) => n + c.done, 0)
  const total = s.changes.reduce((n, c) => n + c.total, 0)
  return { done, total, left: total - done, pct: total > 0 ? Math.floor((100 * done) / total) : 0 }
}
/** OpenSpec 칸의 근거: 자세한 것(브랜치 · change 별 진행 · 경로)부터 짧은 것까지. 브랜치는 worktree 세션이 자기 브랜치의 tasks.md 를 보기 때문에 쓴다 */
const specNotes = (s: Spec, t: ReturnType<typeof specSum>) => {
  const b = s.branch ?? '브랜치 모름'
  const one = s.changes.length === 1 ? s.changes[0]! : null
  const each = s.changes.map(c => `${c.name} ${c.done}/${c.total}`).join(' · ')
  return [
    `${b} · ${one ? '' : `${s.changes.length}개 · `}${each} · 남음 ${t.left} (${s.root})`,
    one ? `${b} · ${one.name} · 남음 ${t.left}` : `${b} · ${s.changes.length}개 · ${t.done}/${t.total} · 남음 ${t.left}`,
    `${b} · ${t.done}/${t.total} · 남음 ${t.left}`,
    `${t.done}/${t.total} · 남음 ${t.left}`,
  ]
}
const pSpecBar = (y: number, changes: Spec['changes']) => {
  const total = changes.reduce((n, c) => n + c.total, 0) || 1
  let x = 0
  let out = `<rect x="0" y="${y}" width="100%" height="${BAR_H}" rx="${RADIUS.inner}" class="trk"/>`
  changes.forEach((c, i) => {
    const w = (100 * c.total) / total
    out += `<rect x="${pc(x)}" y="${y}" width="${pc((w * c.done) / Math.max(1, c.total))}" height="${BAR_H}" class="acc"/>`
    if (i > 0) out += `<rect x="${pc(x)}" y="${y}" width="1" height="${BAR_H}" style="fill:var(--color-background-surface)"/>` // change 사이 틈
    x += w
  })
  return out
}

const avg = (a: number[]) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0)
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`)
const none = (k: string, u: string, note = EMPTY_NOTE): Cell => ({ k, u, v: '—', notes: [note], empty: true, chart: blank })

/**
 * 펼친 격자: 묶음 5개 x 칸 3~4개(묶음 탭). 묶음 = 서로 비교할 만한 항목.
 * 출처가 없는 항목은 넣지 않는다(압축까지 남은 턴, 세션 예상 비용, 권한 대기 시간). 값이 없으면 칸은 남기고 빈 상태로 그린다.
 * 추정은 "약" 을 붙인다: 캐시 만료(60분 가정), 주간 리셋 때 예상(지금까지의 속도로 이어 그음).
 */
export const GROUP_NAMES = ['한도', '토큰', '비용·시간', '작업', '품질'] as const
export function panelGroups(d: Rich): { name: (typeof GROUP_NAMES)[number]; cells: Cell[] }[] {
  const c = d.context
  const k = d.week
  const f = d.five
  const T = d.turnTokens ?? []
  const tok = last(T)
  const hit = last(d.hits)
  const S = d.secs ?? []
  const C = d.costs ?? []
  const a = d.agents
  const r = d.rules
  const vs = d.verifies ?? []
  const verifying = d.verify?.tone === 'info'
  const count = (s: 'ok' | 'warn' | 'err') => vs.filter(v => v === s).length
  const left = d.cache?.left
  const h = d.history
  const ups = h.slice(1).map((v, i) => v - h[i]).filter(x => x > 0).slice(-5) // 압축으로 줄어든 턴은 빼고 최근 5턴
  const tokCell = (key: 'fresh' | 'read' | 'write' | 'output', name: string, lead: string | null): Cell =>
    tok
      ? { k: name, u: 'k', v: k1f(tok[key]), notes: [[lead, `평균 ${k1f(avg(T.map(t => t[key])))}`, `최대 ${k1f(Math.max(...T.map(t => t[key])))}`].filter(Boolean).join(' · '), [lead, `평균 ${k1f(avg(T.map(t => t[key])))}`].filter(Boolean).join(' · ')], empty: false, chart: y => pCols(y, 12, T.map(t => t[key])) }
      : none(name, 'k', '턴 기록 없음')
  const tl = d.tools
  const top = tl ? tl.by.slice(0, 2).map(([n, x]) => `${n} ${x}`).join(' · ') : ''
  const failPct = tl && tl.calls > 0 ? ((100 * tl.errors) / tl.calls).toFixed(1) : '0'
  const ed = d.edits
  const sp = d.spec ? specSum(d.spec) : null
  return [
    {
      name: '한도',
      cells: [
        c
          ? { k: '컨텍스트', u: '%', v: String(c.percent), notes: [[`${k1(c.tokens)} / ${k1(c.window)}`, ups.length ? `턴당 +${avg(ups).toFixed(1)}` : ''].filter(Boolean).join(' · '), `${k1(c.tokens)}/${k1(c.window)}`], empty: false, chart: y => (h.length >= 2 ? pSpark(y, 12, h, PCT) : pBar(y + 3, c.percent, variantOf(c.percent))) }
          : none('컨텍스트', '%'),
        f
          ? { k: '5시간', u: '%', v: String(Math.round(f.percent)), notes: [f.reset ? `리셋 ${f.reset}` : '리셋 시각 모름'], empty: false, chart: y => pBar(y + 3, f.percent, variantOf(f.percent)) }
          : // 엔진은 읽은 값이 있는 창만 준다(rateLimits). 사용량을 읽었는데 five_hour 가 없으면 받은 종류를 그대로 보인다
            { ...none('5시간', '%'), notes: d.limits ? [`제공 안 됨 (받은 값: ${d.limits.join(', ') || '없음'})`, '제공 안 됨'] : [EMPTY_NOTE] },
        k
          ? {
              k: '주간',
              u: '%',
              v: String(Math.round(k.percent)),
              notes: [
                [k.today && k.recommended !== null ? `오늘 ${k.today.replace('/', '/권장 ')}` : '', k.projected != null ? `리셋 때 약 ${k.projected}` : ''].filter(Boolean).join(' · ') || (k.reset ? `리셋 ${k.reset}` : '리셋 시각 모름'),
                k.today ? `오늘 ${k.today}` : k.projected != null ? `리셋 때 약 ${k.projected}` : '리셋 시각 모름',
              ],
              empty: false,
              chart: y => pBar(y + 3, k.percent, k.todayTone === 'err' ? 'err' : k.todayTone === 'warn' ? 'warn' : 'acc', k.mark),
            }
          : none('주간', '%'),
        d.compacts ? { k: '압축', u: '회', v: String(d.compacts.auto + d.compacts.manual), notes: [`자동 ${d.compacts.auto} · 수동 ${d.compacts.manual}`], empty: false, chart: () => '' } : none('압축', '회'),
      ],
    },
    {
      name: '토큰',
      cells: [
        tokCell('fresh', '새 입력', null),
        // 적중률 = 입력 전체 중 캐시 읽기 몫. 만료는 마지막 답 뒤 60분이라는 가정값이라 "약"
        tokCell('read', '캐시 읽기', hit !== undefined ? `적중 ${Math.round(hit)}%` : null),
        tokCell('write', '캐시 쓰기', left == null ? null : left <= 0 ? '만료(추정)' : `만료 약 ${left}분`),
        tokCell('output', '출력', tok && tok.fresh + tok.write > 0 ? `출력/입력 ${(tok.output / (tok.fresh + tok.write)).toFixed(1)}` : null),
      ],
    },
    {
      name: '비용·시간',
      cells: [
        d.costTotal != null
          ? { k: '세션 비용', u: '$', v: d.costTotal.toFixed(2), notes: [d.perHour != null ? `시간당 $${d.perHour.toFixed(2)}` : '세션 합계'], empty: false, chart: y => (C.length >= 2 ? pSpark(y, 12, C.map((_, i) => C.slice(0, i + 1).reduce((n, x) => n + x, 0))) : blank(y)) }
          : none('세션 비용', '$', d.limits ? '앱이 비용을 주지 않음' : EMPTY_NOTE), // 사용량은 읽었는데 cost 가 없다 = 앱이 비용 장부를 두지 않는다
        C.length > 0 ? { k: '턴 비용', u: '$', v: last(C)!.toFixed(2), notes: [`평균 ${avg(C).toFixed(2)} · 최대 ${Math.max(...C).toFixed(2)}`, `평균 ${avg(C).toFixed(2)}`], empty: false, chart: y => pCols(y, 12, C) } : none('턴 비용', '$', d.costTotal == null && d.limits ? '앱이 비용을 주지 않음' : '턴 기록 없음'),
        S.length > 0 ? { k: '턴 시간', u: '초', v: String(last(S)), notes: [`평균 ${dur(Math.round(avg(S)))} · 최대 ${dur(Math.max(...S))}`, `최대 ${dur(Math.max(...S))}`], empty: false, chart: y => pCols(y, 12, S) } : none('턴 시간', '초', '턴 기록 없음'),
        d.session?.turns != null ? { k: '프롬프트', u: '회', v: String(d.session.turns), notes: [[`세션 ${d.session.elapsed}`, [d.model, d.effort].filter(Boolean).join(' ')].filter(Boolean).join(' · '), `세션 ${d.session.elapsed}`], empty: false, chart: () => '' } : none('프롬프트', '회'),
      ],
    },
    {
      name: '작업',
      cells: [
        tl && tl.calls > 0
          ? { k: '도구 호출', u: '회', v: String(tl.calls), notes: [`실패 ${failPct}% · ${top}`, `실패 ${failPct}%`], empty: false, chart: y => pStack(y + 3, [...tl.by.slice(0, 3).map(([, x], i) => [x, (['d2', 'acc', 'ok'] as const)[i]] as [number, ClassName]), [tl.by.slice(3).reduce((n, [, x]) => n + x, 0), 'mut']]) }
          : none('도구 호출', '회', '로드 뒤 호출 없음'),
        ed && ed.files > 0 ? { k: '편집', u: '파일', v: String(ed.files), notes: [`+${ed.added} · −${ed.removed}줄`], empty: false, chart: y => pStack(y + 3, [[ed.added, 'ok'], [ed.removed, 'err']]) } : none('편집', '파일', '고친 파일 없음'),
        a
          ? (() => {
              const ns = noteSet([['실행', a.running], ['대기', a.waiting], ['완료', a.done], ['실패', a.failed]])
              const tk = d.subTokens ? ` · 토큰 ${k1(d.subTokens)}` : ''
              return { k: '하위 에이전트', u: '개', v: String(a.running + a.waiting + a.done + a.failed), notes: [ns[0] + tk, ns[1] + tk, ns[2]], empty: false, chart: (y: number) => pStack(y + 3, [[a.running, 'd2'], [a.waiting, 'mut'], [a.done, 'ok'], [a.failed, 'err']]) }
            })()
          : none('하위 에이전트', '개', d.subTokens ? `목록 못 읽음 · 토큰 ${k1(d.subTokens)}` : EMPTY_NOTE), // 목록(agent.list)은 5초마다 읽는다
        // OpenSpec: 작업 묶음의 나머지 셋(도구·편집·하위)과 같이 "얼마나 했나" 를 말한다.
        // 막대는 change 마다 한 구간(폭 = 그 change 의 전체 수, 채움 = 끝난 수, 사이 1px 틈)이라 여러 change 의 진행이 한눈에 보인다
        sp && d.spec ? { k: 'OpenSpec', u: '%', v: String(sp.pct), notes: specNotes(d.spec, sp), empty: false, chart: y => pSpecBar(y + 3, d.spec!.changes) } : { ...none('OpenSpec', '%'), notes: d.specEmpty ? [d.specEmpty, d.specEmpty.replace(/ \(.*\)$/, '')] : [EMPTY_NOTE] } // 숨김의 이유: 폴더에 OpenSpec 없음(경로) / 진행 중 change 없음,
      ],
    },
    {
      name: '품질',
      cells: [
        verifying
          ? { k: '검증', u: '회', v: String(vs.length), notes: ['검증 중…'], empty: false, chart: y => (vs.length ? marks(0, y, vs) : '') }
          : vs.length > 0
            ? { k: '검증', u: '회', v: String(vs.length), notes: noteSet([['통과', count('ok')], ['못함', count('warn')], ['실패', count('err')]]), empty: false, chart: y => marks(0, y, vs) }
            : none('검증', '회', '고친 파일 없음'),
        // rulegate 칸은 판정 기록을 읽을 폴더를 설정한 사람에게만 나온다 (r 이 null 이면 칸 자체가 없다)
        ...(r ? [{ k: 'rulegate', u: '건', v: String(r.block + r.ask + r.warn), notes: noteSet([['막음', r.block], ['물음', r.ask], ['경고', r.warn]]), empty: false, chart: (y: number) => pStack(y + 3, [[r.block, 'err'], [r.ask, 'warn'], [r.warn, 'd1']]) } as Cell] : []),
        d.asks != null ? { k: '권한 질문', u: '회', v: String(d.asks), notes: ['승인을 물은 도구 호출'], empty: false, chart: () => '' } : none('권한 질문', '회'),
        d.aborted != null ? { k: '중단·거부', u: '회', v: String(d.aborted + (tl?.denies ?? 0)), notes: [`턴 중단 ${d.aborted} · 도구 거부 ${tl?.denies ?? 0}`], empty: false, chart: () => '' } : none('중단·거부', '회'),
      ],
    },
  ]
}

/** 모든 묶음의 칸을 한 줄로 (대체 글·시험용) */
export const panelCells = (d: Rich): Cell[] => panelGroups(d).flatMap(g => g.cells)

/** 칸 폭에 들어가는 첫 근거 문구(글자 sm 12px). 다 넘치면 가장 짧은 것을 한 단계 작은 글자(xs)로 쓴다. 말줄임은 쓰지 않는다. */
export function fitNote(notes: string[], width: number): { text: string; size: number } {
  for (const t of notes) if (tw(t, TYPE.sm) <= width) return { text: t, size: TYPE.sm }
  return { text: notes[notes.length - 1], size: TYPE.xs }
}

// 펼친 격자 = 한 줄에 칸 그림 n 개를 양쪽정렬(band.ts: space-between)로 놓는다. 칸 폭은 띠 안쪽 폭에서 계산해 그래프가 칸을 꽉 채우고,
// 칸 사이는 묶음 간격이다(가로를 꽉 채우고 양쪽 정렬). 그림은 늘이거나 줄이지 않는다(글자 크기 그대로)
// 칸은 세 줄(이름 + 값 | 근거 | 추이)로 낮게 그린다 (높게 그리면 화면에 지표가 3개만 보였다)
export const MIN_CELL_W = 160 // 칸 그림의 최소 폭. 이보다 좁아지면 열을 줄인다
export const PIC_W = MIN_CELL_W // 기본 칸 폭 (폭을 모를 때)
export const HEAD_H = GAP.section + 20 + GAP.group // 머리글 그림 높이 48
export const CELL_H = 56 // 칸 내용: 이름·값 줄(18) + 근거 줄(16) + 추이(16) + 아래 여백 6. 64 는 띠 아래가 살짝 잘렸다
export const PIC_H = GAP.group + CELL_H // 칸 그림 = 위 여백(탭 ↔ 칸, 줄 ↔ 줄: 묶음 간격) + 내용
const STAGGER = 8 // 칸 사이 시차: 묶음 4칸의 마지막도 175 + 3 x 8 = 199ms 안에 끝난다 (움직임은 150~250ms 안)
export type Pic = { svg: string; w: number; h: number; alt: string }
const doc = (w: number, h: number, body: string, animate: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${styleBlock(animate)}${body}</svg>`

/** 칸 하나의 대체 글(화면 낭독용): "이름 값단위 (가장 자세한 근거)" */
const cellAlt = (c: Cell, d: Rich) => `${c.k} ${c.v}${c.empty || c.u === '$' ? '' : c.u} (${c.notes[0]})${c.k === '주간' && d.week?.mark != null ? ', 흰 눈금은 오늘 권장 위치' : ''}`

/** 펼친 격자의 머리글: 표 이름 + 세션 시간·턴 수(원천: session.usage().startedAt, $.session.turns()) + 추이 기간 + 값의 나이 + 눈금 범례 + 쪽 안내. 글자 폭만큼의 그림이다. */
export function panelHead(d: Rich, maxW = Infinity, rowH = 20, bottom: number = GAP.group): Pic {
  const title: Run[] = [{ t: '세션 지표', cls: 't1', weight: 600 }]
  const titleW = rsW(title, TYPE.body) + SPACE[3]
  const span = Math.max(d.history.length, d.secs?.length ?? 0)
  // [글, 뺄 순서(클수록 먼저 뺀다)]. 값의 나이는 끝까지 남긴다. 대체 글에는 늘 전부를 쓴다
  const parts: [string, number][] = (
    [
      [d.session ? `세션 ${d.session.elapsed}` : '', 1],
      [d.session?.turns != null ? `턴 ${d.session.turns}` : '', 2],
      [span > 0 ? `추이는 최근 ${span}턴` : '', 3],
      [d.session?.staleMin != null && d.session.staleMin >= 2 ? `값 ${d.session.staleMin}분 전` : '', 0],
      [d.week?.mark != null ? '흰 눈금 = 오늘 권장' : '', 4],
    ] as [string, number][]
  ).filter(([t]) => t !== '')
  const all = parts.map(([t]) => t).join(' · ')
  let shown = parts
  while (shown.length > 0 && titleW + tw(shown.map(([t]) => t).join(' · '), TYPE.sm) + SPACE[1] > maxW) {
    const drop = Math.max(...shown.map(([, p]) => p))
    if (drop === 0) break
    shown = shown.filter(([, p]) => p !== drop)
  }
  const meta = shown.map(([t]) => t).join(' · ')
  const w = Math.ceil(titleW + tw(meta, TYPE.sm) + SPACE[1])
  // 높이 = 위 여백(바 ↔ 머리글: 구역 간격) + 글자 줄 rowH + 아래 여백. 탭과 한 줄이면 rowH = 탭 높이, 아래 여백 0
  // (칸 그림의 위 여백이 머리글 ↔ 칸 묶음 간격). 글자는 rowH 가운데. 앱의 gap 단위는 쓰지 않는다
  const h = GAP.section + rowH + bottom
  const y = GAP.section + Math.round(rowH / 2) + 5
  return { svg: doc(w, h, rs(title, 0, y, TYPE.body) + rs([{ t: meta, cls: 't2' }], titleW, y, TYPE.sm), false), w, h, alt: `세션 지표: ${all}` }
}

/** 펼친 격자에서 고른 묶음(탭)의 칸 그림 4개, 폭 cellW. animate 이면 칸이 차례로 들어온다(펼치거나 탭을 바꾼 직후 한 번만). */
export function panelPics(d: Rich, animate = false, group = 0, cellW: number = PIC_W): Pic[] {
  const w = Math.max(MIN_CELL_W, Math.floor(cellW))
  const inner = w - SPACE[1] // 그래프 끝 눈금·점이 그림 밖으로 잘리지 않게 오른쪽 4px 를 남긴다
  const g = panelGroups(d)
  return (g[group] ?? g[0]).cells.map((c, i) => {
    const n = fitNote(c.notes, inner)
    // 1줄: 이름·단위(왼쪽) + 값(오른쪽 끝, 굵게) · 2줄: 근거 · 3줄: 추이. 그래프의 100% 는 칸 내용 폭
    const body = `<g data-cell="${i}"${animate ? ` class="enter" style="animation-delay:${i * STAGGER}ms"` : ''}><svg y="${GAP.group}" width="${inner}" height="${CELL_H}" overflow="visible">` +
      rs([{ t: `${c.k} ${c.u}`, cls: 't2' }], 0, 14, TYPE.sm) +
      rs([{ t: c.v, cls: c.empty ? 't2' : 't1', weight: 600, mono: true }], inner, 15, TYPE.lg, 'end') +
      rs([{ t: n.text, cls: 't2' }], 0, 30, n.size) +
      c.chart(36) + '</svg></g>'
    return { svg: doc(w, PIC_H, body, animate), w, h: PIC_H, alt: cellAlt(c, d) }
  })
}


export const MOTION_TOTAL_MS = MOTION.fast + 3 * STAGGER // 칸 4개: 175 + 3 x 8 = 199ms
