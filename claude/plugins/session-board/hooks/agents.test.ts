import { expect, test } from 'claude-code/testing'

import { DEFAULT_FRAMES, FRAMES, catState, isShown } from './agents'
import { avatarSvg } from './art'
import { bandCatSvg } from './band'
import { catMotionSvg, catSvg, hashMs } from './cat'

test('끝난 지 5분이 지난 에이전트는 그리지 않는다. 실행 중이면 오래돼도 그린다', () => {
  const now = 10 * 60_000
  expect(isShown(null, now)).toBe(true)
  expect(isShown(now - 4 * 60_000, now)).toBe(true)
  expect(isShown(now - 5 * 60_000, now)).toBe(false)
})

// 디자인 패키지의 원본 SVG 64개(유형 4 x 상태 4 x 프레임 4) 길이. 같은 칸을 같은 순서로 찍었는지 본다.
const GOLDEN: Record<string, number> = {"Explore_done_0":7009,"Explore_done_1":6984,"Explore_done_2":7009,"Explore_done_3":6984,"Explore_fail_0":6998,"Explore_fail_1":7004,"Explore_fail_2":6963,"Explore_fail_3":7004,"Explore_idle_0":6166,"Explore_idle_1":6108,"Explore_idle_2":6343,"Explore_idle_3":6502,"Explore_run_0":6613,"Explore_run_1":6605,"Explore_run_2":6669,"Explore_run_3":6106,"Plan_done_0":7009,"Plan_done_1":6984,"Plan_done_2":7009,"Plan_done_3":6984,"Plan_fail_0":7055,"Plan_fail_1":7061,"Plan_fail_2":7020,"Plan_fail_3":7061,"Plan_idle_0":6223,"Plan_idle_1":6165,"Plan_idle_2":6400,"Plan_idle_3":6559,"Plan_run_0":6670,"Plan_run_1":6662,"Plan_run_2":6669,"Plan_run_3":6163,"default_done_0":7121,"default_done_1":7040,"default_done_2":7121,"default_done_3":7040,"default_fail_0":6768,"default_fail_1":6774,"default_fail_2":6733,"default_fail_3":6774,"default_idle_0":5936,"default_idle_1":5878,"default_idle_2":6113,"default_idle_3":6272,"default_run_0":6383,"default_run_1":6375,"default_run_2":6439,"default_run_3":5876,"general-purpose_done_0":7237,"general-purpose_done_1":7212,"general-purpose_done_2":7237,"general-purpose_done_3":7212,"general-purpose_fail_0":6884,"general-purpose_fail_1":6890,"general-purpose_fail_2":6849,"general-purpose_fail_3":6890,"general-purpose_idle_0":6051,"general-purpose_idle_1":5993,"general-purpose_idle_2":6228,"general-purpose_idle_3":6387,"general-purpose_run_0":6497,"general-purpose_run_1":6490,"general-purpose_run_2":6553,"general-purpose_run_3":5991}

test('고양이 64장은 원본 도트판과 같은 길이로 만들어진다', () => {
  for (const [key, len] of Object.entries(GOLDEN)) {
    const [kind, state, f] = key.split('_')
    const svg = catSvg(state as any, Number(f), kind)
    expect(svg.length).toBe(len)
    expect(svg.length).toBeLessThan(131072) // Svg 요소의 한도
  }
  // 모르는 유형은 기본 고양이, 프레임은 4로 돌아간다
  expect(catSvg('run', 4, 'Explore')).toBe(catSvg('run', 0, 'Explore'))
})

// 위상(ms)에 따라 맨 앞에 보이는 장. SMIL 을 못 그리는 화면은 이 장만 보인다
const shown = (svg: string) => svg.match(/<g class="cat-m"><animate [^>]*\/>(.*?)<\/g>/)![1]

test('고양이는 상태마다 네 장을 SVG 안에서 돌리고(SMIL), 위상 한 바퀴(1초, 대기 2초)면 같아지며 Svg 한도 안이다', () => {
  const firsts = new Set<string>()
  for (const st of ['run', 'done', 'fail', 'idle'] as const) {
    const step = st === 'idle' ? 500 : 250
    const frames = new Set([0, 1, 2, 3].map((k) => shown(catMotionSvg(st, 'default', k * step))))
    expect(frames.size).toBeGreaterThanOrEqual(2) // 완료·실패는 같은 장이 되풀이되지만 움직인다
    expect(catMotionSvg(st, 'default', 4 * step)).toBe(catMotionSvg(st, 'default', 0))
    expect(catMotionSvg(st, 'default', 0).split('<animate ').length - 1).toBe(4)
    expect(catMotionSvg(st, 'default', 0).length).toBeLessThan(131072) // Svg 요소의 한도
    firsts.add(shown(catMotionSvg(st, 'default', 0)))
  }
  expect(firsts.size).toBe(4) // 상태마다 그림이 다르다
  expect(catMotionSvg('run', 'default', -250)).toBe(catMotionSvg('run', 'default', 750))
})

test('시작 시각이 다른 고양이는 같은 순간에 다른 장을 보이고, 장 안에서 지난 몫은 음수 begin 으로 이어진다', () => {
  const a = catMotionSvg('run', 'default', 300) // 300ms 전에 시작
  const b = catMotionSvg('run', 'default', 800) // 800ms 전에 시작
  expect(shown(a)).not.toBe(shown(b)) // 300ms → 2번째 장, 800ms → 4번째 장
  expect(a).toContain('begin="-0.05s"') // 2번째 장에 들어온 지 50ms
  expect(catMotionSvg('run', 'default', 0)).not.toContain('begin=') // 장 경계면 begin 이 없다
  expect(shown(catMotionSvg('run', 'default', 260))).toBe(shown(catMotionSvg('run', 'default', 499))) // 같은 장 안이면 같은 장
  expect(shown(catMotionSvg('run', 'default', 0))).toBe(catSvg('run', 0, 'default').replace(/^<svg[^>]*>|<\/svg>$/g, '')) // 맨 앞 장 = 정지 그림
})

test('세션 카드·띠 아바타도 움직이고, 위상(시작 시각 + id 해시)이 다르면 같은 순간에 다른 장을 보인다', () => {
  expect(shown(avatarSvg('running', 1_000))).not.toBe(shown(avatarSvg('running', 1_300)))
  expect(avatarSvg('running', 0).split('<animate ').length - 1).toBe(4)
  expect(avatarSvg('request')).toContain('use href="#flag"')
  expect(bandCatSvg('zz', 0).split('<animate ').length - 1).toBe(4)
  for (const id of ['a', 'session-1', '7f3c']) {
    expect(hashMs(id)).toBe(hashMs(id))
    expect(hashMs(id) >= 0 && hashMs(id) < 1000).toBe(true)
  }
  expect(hashMs('session-1')).not.toBe(hashMs('session-2'))
})

test('움직임 줄이기: 어느 그림이든 도는 장을 숨기는 규칙과, 맨 앞 장과 같은 정지 장 하나를 담는다', () => {
  for (const svg of [catMotionSvg('run', 'default', 300), avatarSvg('running', 300), bandCatSvg('zz', 300)]) {
    expect(svg).toContain('@media (prefers-reduced-motion: reduce){.cat-m{display:none}.cat-still{display:inline}}')
    expect(svg.split('class="cat-m"').length - 1).toBe(4) // 도는 장 넷
    const still = svg.match(/<g class="cat-still" display="none">(.*?)<\/g>/)![1]
    expect(still).toBe(shown(svg)) // 정지 장 = 위상에 맞는 맨 앞 장
    expect(still).not.toContain('<animate') // 정지 장은 움직이지 않는다
  }
})

test('에이전트 상태는 고양이 상태 네 가지로 빠짐없이 옮겨진다', () => {
  expect(catState('running')).toBe('run')
  expect(catState('pending')).toBe('run')
  expect(catState('completed')).toBe('done')
  expect(catState('failed')).toBe('fail')
  expect(catState('killed')).toBe('fail')
  expect(catState('idle')).toBe('idle')
  expect(catState('waiting')).toBe('idle')
})

test('캐릭터는 한 글자이고 두 칸이 될 수 있는 글자를 쓰지 않는다', () => {
  const ambiguous = /[àáæè-êìíðòó÷-úüþ]/ // 동아시아 모호 폭(Latin-1)
  for (const set of [...Object.values(FRAMES), DEFAULT_FRAMES]) {
    for (const ch of set) {
      expect([...ch].length).toBe(1)
      expect(ambiguous.test(ch)).toBe(false)
    }
  }
})
