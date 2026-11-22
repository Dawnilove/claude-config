import { expect, test } from 'claude-code/testing'

import { DETAIL_TEXT, HANDOFF_TEXT, HEAD_MIN, TABS_H, TAB_GAP, countTasks, refreshSpec, specEmptyReason, tabLabelsFor, askPillSvg, asksText, bandCatSvg, bandSvg, barPlan, barsOf, cellWidth, countAgents, countRules, dailyBudget, detailRows, editLines, effortHint, fit, gauge, gridCols, innerPx, neededEffort, runVerify, turnUsage, weekProjection } from './band'
import { BAND_LEVEL, GROUP_NAMES, HEAD_H, MIN_CELL_W, MOTION_TOTAL_MS, PIC_H, PIC_W, fitNote, panelCells, panelGroups, panelHead, panelPics } from './band-ui'
import { COLOR, GAP, HOST, color, hostButtonPx } from './tokens'

// 펼친 격자의 그림 전부(머리글 + 다섯 묶음의 칸 그림들)를 한 문자열로 모아 본다
const allPics = (d: any, animate = false) => GROUP_NAMES.flatMap((_, g) => panelPics(d, animate, g))
const panelSvg = (d: any, animate = false) => ({ svg: [panelHead(d).svg, ...allPics(d, animate).map(p => p.svg)].join('') })

test('답변에서 필요한 노력 수준을 읽는다', () => {
  expect(neededEffort('Opus 기준으로는 한 단계 낮춘 **medium**이 맞다.')).toBe('medium')
  expect(neededEffort('Opus 5.5 기준 노력 수준은 medium이 필요하다 (지금과 같다).')).toBe('medium')
  expect(neededEffort('필요 수준: high')).toBe('high')
  // 지금 수준만 말하거나 수준이 없는 답은 바꾸지 않는다
  expect(neededEffort('노력 수준은 low다. 필요한 수준과 같다.')).toBe(null)
  expect(neededEffort('커밋했다.')).toBe(null)
  // 한 답에 둘이면 마지막(가장 최근 제안, 보통 끝의 검토 제안)을 쓴다
  expect(neededEffort('작업은 medium이 맞다.\n검토 제안: /ponytail-review. 노력 수준은 low가 필요하다.')).toBe('low')
})

test('필요 수준과 지금 수준이 다를 때만 알약을 보인다', () => {
  expect(effortHint('medium', 'low')).toBe('⚠ 수준 low→medium')
  expect(effortHint('low', 'low')).toBe(null)
  expect(effortHint(null, 'low')).toBe(null)
  expect(effortHint('high', undefined)).toBe(null)
})

// 예시 상태: 컨텍스트 31%, 주 15%(오늘 7/19%p), 턴 11초
const sample: any = {
  verify: { tone: 'ok', text: '✓ 검증 2' },
  children: 0,
  context: { percent: 31, tokens: 311020, window: 1000000 },
  week: { percent: 15, mark: 27, today: '7/19%p', todayTone: 'mute', reset: '11/18 06:00', recommended: 19, pace: -6 },
  turn: { text: '11초' },
  cache: { tone: 'mute', alert: null },
  history: [12, 20, 31],
}

test('검증: 성공·실패·도구 없음을 나누고, Python Store 별칭(9009)은 실패가 아니라 다음 후보로 넘어간다', async () => {
  // argv 첫 낱말 → 종료 코드. 없으면 실행 파일이 없는 것(예외)
  const fake = (codes: Record<string, number>) => ({ process: { run: async (argv: string[]) => { if (!(argv[0] in codes)) throw new Error('ENOENT'); return { exitCode: codes[argv[0]], stdout: '', stderr: '' } } } })
  expect(await runVerify(fake({ python: 0 }), ['a.py'])).toEqual({ state: 'ok', text: '✓ 검증 1' })
  expect(await runVerify(fake({ python: 1 }), ['a.py'])).toEqual({ state: 'fail', text: '✗ 검증 실패: a.py' })
  expect(await runVerify(fake({ python: 9009 }), ['a.py'])).toEqual({ state: 'skip', text: '⚠ 검증 못함 (도구 없음)' })
  expect(await runVerify(fake({ python: 9009, py: 0 }), ['a.py'])).toEqual({ state: 'ok', text: '✓ 검증 1' })
  expect(await runVerify(fake({}), ['a.md'])).toBeNull() // 검사 대상이 아닌 파일은 말하지 않는다
})

// 펼친 격자의 모든 항목에 값이 있는 상태 (rulegate 판정 폴더를 설정한 경우)
const full: any = {
  ...sample,
  cache: { tone: 'mute', alert: null, left: 48 },
  five: { percent: 34, reset: '23:40' },
  hits: [40, 88, 92],
  turnTokens: [{ fresh: 1000, read: 28000, write: 1000, output: 1000 }, { fresh: 1200, read: 35000, write: 2000, output: 2100 }],
  costs: [0.2, 0.31],
  costTotal: 4.12,
  secs: [40, 72],
  agents: { running: 1, waiting: 0, done: 3, failed: 1 },
  rules: { block: 1, ask: 0, warn: 26 },
  verifies: ['ok', 'warn', 'err'],
  session: { elapsed: '2시간 14분', turns: 37 },
}

test('접힌 띠는 컨텍스트·주간에 재디자인 전의 턴·캐시·검증을 되돌려 한 줄에 그리고, 좁으면 오늘 → 턴 → 캐시 → 검증 → 주간 순으로 뺀다', () => {
  const x = { ...sample, cache: { tone: 'mute', alert: null, left: 48 } }
  const wide = bandSvg(x, 2000, true)
  expect(wide.hidden).toBe(0)
  for (const t of ['>컨텍스트</tspan>', '>주간</tspan>', '>31%</tspan>', '>15%</tspan>', '>오늘 </tspan>', '>7/19%p</tspan>', '>턴 </tspan>', '>캐시 </tspan>', '>약</tspan>', '>✓ 검증 2</tspan>']) expect(wide.svg).toContain(t)
  expect(wide.svg).not.toContain('>하위 </tspan>') // 하위 수는 배지·세부 격자가 말한다
  const noToday = bandSvg(x, wide.w - 1, true) // 값은 자르지 않고 칸을 뺀다
  expect([noToday.svg.includes('>오늘 </tspan>'), noToday.svg.includes('>턴 </tspan>')]).toEqual([false, true])
  const noTurn = bandSvg(x, noToday.w - 1, true)
  expect([noTurn.svg.includes('>턴 </tspan>'), noTurn.svg.includes('>캐시 </tspan>')]).toEqual([false, true])
  const tiny = bandSvg(x, 100, true)
  expect(tiny.hidden).toBe(4) // 오늘·턴·캐시·검증(통과). 주간은 필수라 빼지 않는다
  expect(tiny.svg).toContain('>컨</tspan>') // 필수 세 항목은 이름을 줄여 남는다
  expect(tiny.svg).toContain('>주</tspan>')
  expect([tiny.level, tiny.fits]).toEqual([9, false]) // 100px 에는 못 들어가 가장 짧은 꼴 (barPlan 이 두 줄로 나눈다)
})

test('밴드의 고양이는 상태에 따라 달라지고 필요한 고양이 하나만 담는다', () => {
  expect(bandSvg(sample, 2000).svg).toContain('use href="#zz"') // 값이 없으면 조는 고양이
  expect(bandSvg({ ...sample, mood: 'run' }, 2000).svg).toContain('use href="#run"')
  const flag = bandSvg({ ...sample, mood: 'flag' }, 2000).svg
  expect(flag).toContain('use href="#flag"')
  expect(flag).not.toContain('id="run"')
})

test('세부 격자는 토큰(변수)으로만 칠하고, 묶음 5개 x 칸 4개를 같은 크기의 그림으로 만든다', () => {
  const wide = panelSvg(full)
  expect(wide.svg).toContain(`--color-background-surface:${color('background-surface')}`) // 표면 색은 tokens.ts 의 MODE 를 따른다
  expect(wide.svg).not.toMatch(/fill="#/) // 색은 var(--color-*) 클래스로만 칠한다
  expect((wide.svg.match(/data-cell="/g) ?? []).length).toBe(20)
  expect(panelGroups(full).map(g => [g.name, g.cells.length])).toEqual(GROUP_NAMES.map(n => [n, 4]))
  expect(wide.svg).not.toContain('class="card"') // 칸은 카드가 아니라 간격으로 나눈다 (카드 안 카드 없음)
  expect(wide.svg).not.toContain('class="surface"') // 테두리·바탕은 바와 같은 상자(band.ts)가 그린다
})

test('반응형 격자: 칸 그림은 띠 폭에서 계산한 폭으로 그리고(글자는 늘이거나 줄이지 않음), 탭은 묶음 하나의 칸 4개를 고른다', () => {
  for (const p of allPics(full)) {
    expect([p.w, p.h]).toEqual([PIC_W, PIC_H])
    expect(p.svg).toContain(`width="${p.w}" height="${p.h}" viewBox="0 0 ${p.w} ${p.h}"`)
  }
  // 넓은 칸: 그래프(100%)와 값(오른쪽 끝)이 칸 폭을 따라간다. 최소 폭 아래로는 줄이지 않는다
  const wide = panelPics(full, false, 0, 258)[0]!
  expect(wide.w).toBe(258)
  expect(wide.svg).toContain('<svg y="12" width="254"')
  expect(wide.svg).toMatch(/<text x="254" [^>]*text-anchor="end"/)
  expect(panelPics(full, false, 0, 90)[0]!.w).toBe(MIN_CELL_W)
  expect(PIC_H).toBe(GAP.group + 56) // 낮은 칸(내용 56, 더 높으면 띠 아래가 잘린다) + 위 여백(탭 ↔ 칸: 묶음 간격, 없으면 딱 붙는다)
  expect(panelPics(full, false, 3).map(p => p.alt.split(' ')[0])).toEqual(['도구', '편집', '하위', 'OpenSpec']) // 작업 묶음
  expect(panelPics(full, false, 99).length).toBe(4) // 없는 묶음은 첫 묶음
})

test('묶음 칸의 열: 4칸이 들어가면 4열 1줄, 아니면 2열 2줄. 머리글은 폭에 맞춰 덜 중요한 항목부터 뺀다', () => {
  expect([gridCols(140), gridCols(100), gridCols(60), gridCols(10)]).toEqual([4, 4, 2, 2])
  // 머리글은 폭에 맞춰 흰 눈금 범례 → 추이 → 턴 → 세션 순으로 빼고, 값의 나이와 대체 글의 전부는 남긴다
  const stale = { ...full, session: { ...full.session, staleMin: 5 } }
  const narrow = panelHead(stale, 300)
  expect(narrow.w).toBeLessThanOrEqual(300)
  expect(narrow.svg).toContain('값 5분 전')
  expect(narrow.svg).not.toContain('흰 눈금')
  expect(narrow.alt).toContain('흰 눈금 = 오늘 권장')
})

test('5시간 값을 엔진이 주지 않으면 "제공 안 됨" 과 받은 종류를 쓰고, 사용량을 읽기 전에는 "아직 값 없음" 이다', () => {
  const cell = (d: any) => panelCells(d).find(c => c.k === '5시간')!
  expect(cell({ ...full, five: null, limits: ['seven_day'] }).notes[0]).toBe('제공 안 됨 (받은 값: seven_day)')
  expect(cell({ ...full, five: null, limits: [] }).notes[0]).toBe('제공 안 됨 (받은 값: 없음)')
  expect(cell({ ...full, five: null }).notes[0]).toBe('아직 값 없음')
})

test('따로 그린 고양이와 "컨텍스트" 사이는 칸 사이 간격(12px)이다', () => {
  expect(bandSvg(sample, 2000, true).svg).toMatch(/<text x="12" [^>]*><tspan[^>]*>컨텍스트</)
})

test('데스크톱에서 펼치면 바와 격자를 테두리 하나의 상자에 담고, 묶음 탭(앱 단추 5개)으로 묶음 하나의 4칸을 같은 열 격자에 보인다', async ($, on) => {
  void on
  const band = (bodyColumns: number) => $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns, isWorking: false }, surface: 'desktop' } as any)
  const cellsOf = async (ui: any) => (((await ui.find({ key: 'pg' }))?.children ?? []) as any[]).map(r => r.children as any[])
  let ui = await band(140)
  expect(await ui.find({ key: 'pb' })).toBeFalsy() // 기본은 접힘
  expect((await ui.find({ key: 'rb' }))?.props.borderStyle).toBe('round') // 접히면 바가 테두리를 갖는다
  await ui.press({ key: 'detail' })
  await ui.unmount()
  ui = await band(140)
  const relay = await ui.find({ key: 'relay' })
  expect([relay?.props.borderStyle, (await ui.find({ key: 'rb' }))?.props.borderStyle]).toEqual(['round', undefined]) // 펼치면 바깥 상자 하나
  const tabs = await Promise.all(GROUP_NAMES.map((_, i) => ui.find({ key: `g${i}` })))
  expect(tabs.map(t => t?.props.label)).toEqual(['● 한도', '토큰', '비용·시간', '작업', '품질']) // 고른 탭만 "● "
  expect(tabs.map(t => t?.props.variant)).toEqual(Array(5).fill('secondary')) // 모두 secondary (고른 탭은 "● " 글자로 구분한다)
  expect(tabs.map(t => t?.props.dimColor === true)).toEqual([false, true, true, true, true]) // 나머지는 흐린 글자
  const rows = await cellsOf(ui)
  expect(rows.map(r => r.length)).toEqual([4]) // 4열 1줄
  const rowBoxes = ((await ui.find({ key: 'pg' }))?.children ?? []) as any[]
  expect(rowBoxes.every(r => r.props.justifyContent === 'space-between')).toBe(true) // 양쪽정렬: 첫 칸은 왼쪽 끝, 마지막 칸은 오른쪽 끝
  for (const c of rows.flat()) {
    expect(c.children[0].type).toBe('Svg')
    expect(c.children[0].props.width).toBe(cellWidth(140, 4)) // 칸 폭 = (안쪽 폭 - 좌우 여백 - 칸 사이 간격) / 4
  }
  // 칸 4개 + 사이 간격 3개가 격자 폭 안에 든다 (넘치지 않음)
  expect(cellWidth(140, 4) * 4 + GAP.group * 3).toBeLessThanOrEqual(innerPx(140) - GAP.group * 2)
  expect(rows[0][0].children[0].props.alt).toMatch(/^컨텍스트 /) // 한도 묶음
  expect(await ui.find({ key: 'pnext' })).toBeFalsy() // 쪽 넘김은 없다
  await ui.press({ key: 'g3' }) // 작업 탭
  await ui.unmount()
  ui = await band(50) // 좁은 띠: 2열 x 2줄
  const narrow = await cellsOf(ui)
  expect(narrow.map(r => r.length)).toEqual([2, 2])
  expect(narrow.flat().every(c => c.children[0].props.width === cellWidth(50, 2))).toBe(true)
  expect(narrow[0][0].children[0].props.alt).toMatch(/^도구 호출 /)
  expect((await ui.find({ key: 'g3' }))?.props.label).toBe('● 작업')
  await ui.press({ key: 'g0' })
  await ui.press({ key: 'detail' })
  await ui.unmount()
})

test('새 수집: 도구 호출·편집·권한 질문·거부·압축·하위 에이전트 토큰이 실제 훅을 거쳐 묶음 칸에 쌓이고, 고른 탭은 다시 펼쳐도 남는다', async ($, on) => {
  on('tool.check', (_: any, e: any) => ({ decision: e.tool === 'Bash' && e.input?.command === 'ls' ? 'ask' : 'allow' }) as any) // 엔진 자리: Bash ls 만 승인을 묻는다
  on('tool.call', (_: any, e: any) => (e.tool === 'Bash' && e.command === 'rm' ? { deny: '거부' } : { result: {} }) as any)
  on('session.compact', (_: any, e: any) => ({ messages: e.messages }) as any)
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }) as any)
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'x', new_string: 'y\nz' } as any)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  await $.tool.call({ tool: 'Bash', command: 'rm' } as any)
  await $.turn.complete({ answer: '', reason: 'answer', durationMs: 1, isAborted: false, turnId: 's', agentId: 'a1', usage: { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50, output_tokens: 250, model: 'm' } } as any)
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: '요약', toolUses: [] }] } as any) // 사람이 /compact
  const band = () => $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 140, isWorking: false }, surface: 'desktop' } as any)
  const alts = async (ui: any) => (((await ui.find({ key: 'pg' }))?.children ?? []) as any[]).flatMap(r => r.children).map((c: any) => String(c.children[0].props.alt))
  let ui = await band()
  await ui.press({ key: 'detail' })
  await ui.press({ key: 'g3' }) // 작업
  await ui.unmount()
  ui = await band()
  const work = await alts(ui)
  expect(work[0]).toBe('도구 호출 3회 (실패 33.3% · Bash 2 · Edit 1)') // 시험 엔진은 승인할 사람이 없어 ask 호출(ls)이 오류로 끝난다
  expect(work[1]).toBe('편집 1파일 (+2 · −1줄)')
  expect(work[2]).toContain('토큰 400') // 하위 에이전트: 새 입력 100 + 쓰기 50 + 출력 250 (캐시 읽기 제외)
  await ui.press({ key: 'detail' }) // 접고
  await ui.press({ key: 'detail' }) // 다시 펼치면
  await ui.unmount()
  ui = await band()
  expect((await ui.find({ key: 'g3' }))?.props.label).toBe('● 작업') // 고른 탭(작업)이 남는다
  await ui.press({ key: 'g4' }) // 품질
  await ui.unmount()
  ui = await band()
  const quality = await alts(ui)
  // 품질 묶음: 검증 · (rulegate 폴더를 설정한 경우만 rulegate) · 권한 질문 · 중단·거부. 이 시험은 폴더를 설정하지 않았다
  expect(quality[1]).toBe('권한 질문 1회 (승인을 물은 도구 호출)')
  expect(quality[2]).toBe('중단·거부 1회 (턴 중단 0 · 도구 거부 1)')
  await ui.press({ key: 'g0' }) // 한도
  await ui.unmount()
  ui = await band()
  expect((await alts(ui))[3]).toBe('압축 1회 (자동 0 · 수동 1)')
  await ui.press({ key: 'detail' })
  await ui.unmount()
})

test('배치 불변식: 폭 400~1600px(50 간격) x 상태 조합에서 접힌 바의 모든 요소가 오른쪽 끝 안에 있고, 간격은 세 단계, 펼친 높이는 띠 한도 안이다', () => {
  const alerts = { ...full, verify: { tone: 'err', text: '✗ 검증 실패: band-ui.ts' }, cache: { tone: 'warn', alert: '⚠ 캐시 약 12분', left: 12 } }
  const kindsOf = (n: number) => (['err', 'warn', 'ok'] as const).slice(0, n).map((level, i) => ({ level, n: i + 1, label: ['결재', '알림', '확인'][i]! }))
  const bad: string[] = []
  for (let px = 400; px <= 1600; px += 50) {
    const cols = (px + HOST.framePadX * 2) / HOST.colPx // 안쪽 폭이 px 가 되는 bodyColumns
    for (const n of [0, 1, 2, 3])
      for (const handoff of [false, true])
        for (const hint of [null, '⚠ 수준 low→medium'])
          for (const d of [full, alerts])
            for (const detail of [DETAIL_TEXT.closed, DETAIL_TEXT.open]) {
              const p = barPlan(cols, d, { kinds: kindsOf(n), open: n > 0 ? '▸' : '세션 ▸', hint, handoff, detail })
              for (const used of p.rows) if (used > p.inner) bad.push(`${px}px 배지${n} 인계${handoff} 힌트${!!hint} 경고${d === alerts} ${detail} ${p.twoLine ? '두 줄' : '한 줄'}: ${Math.ceil(used)} > ${p.inner}`)
              if (p.detail !== detail) bad.push(`${px}px: 세부 단추가 빠짐`)
            }
  }
  expect(bad).toEqual([])
  // 실제 화면 스크린샷(폭 약 1,300px, 인계 + 세부): 아무것도 빼지 않는다. 배지·힌트·경고가 다 붙으면 그때 오늘 표시부터 뺀다
  const wide = barPlan((1300 + HOST.framePadX * 2) / HOST.colPx, full, { kinds: kindsOf(1), open: '▸', hint: null, handoff: true, detail: DETAIL_TEXT.open })
  expect([wide.pills.length, wide.handoff, wide.band?.hidden]).toEqual([1, true, 0])
  // 간격 세 단계: 항목 < 묶음 < 구역, 그리고 펼친 격자에서 쓰는 자리
  expect(GAP.item < GAP.group && GAP.group < GAP.section).toBe(true)
  expect(HEAD_H).toBe(GAP.section + 20 + GAP.group) // 바 ↔ 머리글 = 구역, 머리글 ↔ 탭 = 묶음
  expect(PIC_H - 56).toBe(GAP.group) // 탭 ↔ 칸 = 묶음
  // 펼친 높이: 바 + 머리글 + 탭 + 칸 줄(넓으면 1줄, 좁으면 2줄) + 테두리 위아래가 띠 한도 안
  for (const rows of [1, 2]) expect(Math.max(36, HOST.buttonH) + HEAD_H + HOST.buttonH + rows * PIC_H + HOST.framePadX * 2).toBeLessThanOrEqual(HOST.bandMaxPx) // 탭이 다음 줄일 때(가장 높음)
  // 탭이 머리글과 한 줄이면: 머리글 그림 = 구역 간격 + 탭 높이, 아래 여백 없음(칸 그림 위 여백이 묶음 간격)
  expect(panelHead(full, 600, TABS_H, 0).h).toBe(GAP.section + TABS_H)
  // 한 줄로 둘 수 있는 폭: 탭 덩어리 + 머리글 최소 폭이 안쪽 폭에 든다 (스크린샷 6번 폭 약 700px 에서도 한 줄)
  const tabsW = tabLabelsFor(2).reduce((t, l) => t + hostButtonPx(l), 0) + TAB_GAP * 4 // 가장 긴 고른 탭("● 비용·시간") 기준
  expect(700 - GAP.group * 3 - tabsW).toBeGreaterThanOrEqual(HEAD_MIN)
})

test('보정 화면: /session_board 보정 으로 띠에 px 눈금과 알려진 부품(간격·여백·테두리·단추·글자)을 켜고 끈다', async ($, on) => {
  void on
  const mountBand = () => $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 140, isWorking: false, maxRows: 18 }, surface: 'desktop' } as any)
  expect((await $.command.run({ command: 'session_board', args: '보정' } as any)).text).toContain('보정 화면을 켰습니다')
  let ui = await mountBand()
  const drawn = JSON.stringify(await ui.drawn())
  for (const t of ['보정 눈금 640px', 'bodyColumns 140', 'maxRows 18', '② gap 1', '③ paddingLeft 1', '④ 테두리 상자', '⑤ width 10 · height 3', 'ABCDEFGHIJ', '가나다라마바사아자차']) expect(drawn).toContain(t)
  await ui.unmount()
  expect((await $.command.run({ command: 'session_board', args: '보정' } as any)).text).toContain('껐습니다')
  ui = await mountBand()
  expect(JSON.stringify(await ui.drawn())).not.toContain('보정 눈금')
  await ui.unmount()
})

test('세부 단추의 글자(label)는 짧게 상태를 말하고(세부 ▾ / 접기 ▴), 탭은 떨어진 secondary 단추 5개(사이 NBSP 8px)다', async ($, on) => {
  void on
  const mountBand = () => $.ui.mount({ plugin: 'session-board', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 140, isWorking: false }, surface: 'desktop' } as any)
  let ui = await mountBand()
  expect((await ui.find({ key: 'detail' }))?.props.label).toBe('세부 ▾') // 실제 앱은 label 을 그린다
  await ui.press({ key: 'detail' })
  await ui.unmount()
  ui = await mountBand()
  expect((await ui.find({ key: 'detail' }))?.props.label).toBe('접기 ▴')
  const tabs = await ui.find({ key: 'pt' })
  expect([tabs?.props.backgroundColor, tabs?.props.borderStyle, tabs?.props.alignSelf]).toEqual([undefined, undefined, 'flex-end']) // 상자 없이 오른쪽 끝
  // 탭은 "세션 지표" 머리글과 한 줄의 오른쪽 끝: [머리글 그림, 채움, 탭]
  const head = await ui.find({ key: 'phr' })
  expect(((head?.children ?? []) as any[]).map(c => c.type === 'Svg' ? String(c.props.alt).split(':')[0] : c.props.key)).toEqual(['세션 지표', 'pfill', 'pt'])
  const kids = (tabs?.children ?? []) as any[]
  expect(kids.map(c => c.type)).toEqual(['Button', 'Text', 'Button', 'Text', 'Button', 'Text', 'Button', 'Text', 'Button']) // 단추 사이마다 NBSP 간격
  expect(kids.filter(c => c.type === 'Text').every(c => /^ +$/.test(String(c.children[0])) && c.children[0].length === Math.round(TAB_GAP / HOST.nbspPx))).toBe(true)
  // 인계와 세부 사이 등 앱 부품 사이 간격은 NBSP 글자다 (빈 대체 글의 투명 그림은 실제 앱이 그리지 않았다)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain('"alt":""')
  expect(drawn).toContain('   ')
  await ui.press({ key: 'detail' })
  await ui.unmount()
})

test('탭: 앱이 dimColor 를 흐리게 그리지 않아도 "● " 하나로 고른 탭이 드러난다 (모든 탭에서 정확히 하나, 그 탭만)', () => {
  for (let sel = 0; sel < GROUP_NAMES.length; sel++) {
    const labels = tabLabelsFor(sel)
    expect(labels.filter(l => l.startsWith('● '))).toEqual([`● ${GROUP_NAMES[sel]}`])
    expect(labels.filter((_, i) => i !== sel).some(l => l.includes('●'))).toBe(false)
    expect(labels.map(l => l.replace(/^● /, ''))).toEqual([...GROUP_NAMES]) // 표시를 빼면 이름 그대로
  }
})

// OpenSpec: 가짜 파일 시스템 (경로 → 글). 폴더는 그 아래 경로가 있으면 있다
const fakeFs = (cwd: string, files: Record<string, string>) => {
  const at = (p: string) => `${cwd}/${p}`
  const all = Object.fromEntries(Object.entries(files).map(([p, t]) => [at(p), t]))
  return {
    session: { cwd: async () => cwd },
    fs: {
      read: async (p: string) => (p in all ? all[p]! : Promise.reject(new Error('ENOENT'))),
      stat: async (p: string) => (p in all ? { size: all[p]!.length } : Promise.reject(new Error('ENOENT'))),
      list: async (dir: string) => {
        const names = new Set(Object.keys(all).filter(p => p.startsWith(`${dir}/`)).map(p => p.slice(dir.length + 1).split('/')[0]!))
        if (names.size === 0) throw new Error('ENOENT')
        return [...names].map(name => ({ name, kind: Object.keys(all).some(p => p.startsWith(`${dir}/${name}/`)) ? 'dir' : 'file', size: 0 }))
      },
    },
  }
}

test('OpenSpec 진행률: change 0개면 없음, 1개·여러 개는 체크 합계, archive 와 큰 tasks.md 는 뺀다, 브랜치를 읽는다', async () => {
  expect(countTasks('- [x] 1.1 a\n- [ ] 1.2 b\n  - [X] 1.2.1 c\n* [ ] d\n본문 [x] 은 세지 않는다\n')).toEqual({ done: 2, total: 4 }) // 옛 session-band 와 같은 식
  // 0개: openspec 폴더가 없거나, change 에 체크 항목이 없다
  expect(await refreshSpec(fakeFs('C:/p', {}))).toBeNull()
  expect(await refreshSpec(fakeFs('C:/p', { 'openspec/changes/a/proposal.md': '# a', 'openspec/changes/a/tasks.md': '할 일 없음' }))).toBeNull()
  // 1개 + archive 제외 + 브랜치(.git/HEAD)
  const one = await refreshSpec(fakeFs('C:/p', { '.git/HEAD': 'ref: refs/heads/main\n', 'openspec/changes/api/tasks.md': '- [x] a\n- [ ] b\n- [ ] c', 'openspec/changes/archive/old/tasks.md': '- [ ] z' }))
  expect(one).toEqual({ changes: [{ name: 'api', done: 1, total: 3 }], branch: 'main', root: 'C:/p' })
  // 여러 개 + worktree(.git 파일의 gitdir) 브랜치 + 256KB 넘는 tasks.md 는 읽지 않음
  const many = await refreshSpec(fakeFs('C:/w', {
    '.git': 'gitdir: C:/w/.gitdir/wt\n',
    '.gitdir/wt/HEAD': 'ref: refs/heads/feat/x\n',
    'openspec/changes/b/tasks.md': '- [x] 1\n- [x] 2',
    'openspec/changes/a/tasks.md': '- [x] 1\n- [ ] 2\n- [ ] 3\n- [ ] 4',
    'openspec/changes/huge/tasks.md': '- [ ] x\n'.repeat(40_000),
  }))
  expect(many).toEqual({ changes: [{ name: 'a', done: 1, total: 4 }, { name: 'b', done: 2, total: 2 }], branch: 'feat/x', root: 'C:/w' })
  // 칸과 접힌 바: 합계 3/6 = 50%, 남음 3, 브랜치를 함께 쓴다
  const d = { ...full, spec: many }
  const cell = panelCells(d).find(c => c.k === 'OpenSpec')!
  expect([cell.v, cell.u]).toEqual(['50', '%'])
  expect(cell.notes).toContain('feat/x · 2개 · 3/6 · 남음 3')
  expect(cell.notes[0]).toBe('feat/x · 2개 · a 1/4 · b 2/2 · 남음 3 (C:/w)') // 대체 글: change 별 진행과 경로
  expect(bandSvg(d, 3000, true).svg).toMatch(/>작업 <\/tspan>.*>50%<\/tspan>.*> 3\/6<\/tspan>/)
  expect(bandSvg({ ...full, spec: null }, 3000, true).svg).not.toContain('>작업 </tspan>') // change 가 없으면 보이지 않는다
})

test('접힌 바(메인 줄)의 작업(OpenSpec)은 컨텍스트와 같은 급: 아무리 좁아도 빠지지 않고, 마지막에 "98/107" 만 줄인다', () => {
  const d = { ...full, cache: { tone: 'mute', alert: null, left: 40 }, spec: { changes: [{ name: 'a', done: 98, total: 107 }], branch: 'main', root: 'C:/p' } }
  const has = (svg: string) => ({ spec: /(>작업 |>작 )<\/tspan>/.test(svg), count: svg.includes('> 98/107</tspan>'), turn: svg.includes('>턴 </tspan>'), cache: svg.includes('>캐시 </tspan>'), week: /(>주간|>주)<\/tspan>/.test(svg) && svg.includes('>15%</tspan>') })
  expect(has(bandSvg(d, 3000, true).svg)).toEqual({ spec: true, count: true, turn: true, cache: true, week: true })
  // 폭을 줄여 가며 모든 단계를 거쳐도 작업과 주간은 남는다. 턴·캐시가 다 빠진 뒤에야 "98/107" 이 빠진다
  let w = 3000
  const seen: ReturnType<typeof has>[] = []
  for (let i = 0; i < 12; i++) {
    const b = bandSvg(d, w, true)
    seen.push(has(b.svg))
    w = b.w - 1
  }
  expect(seen.every(s => s.spec && s.week)).toBe(true)
  const firstShort = seen.findIndex(s => !s.count)
  expect(firstShort).toBeGreaterThan(0)
  expect(seen.slice(firstShort).every(s => !s.turn && !s.cache)).toBe(true)
  expect(bandSvg(d, 10, true).svg).toMatch(/>작 <\/tspan>.*>91%<\/tspan>/) // 가장 좁을 때 "작 91%"
})

test('필수 세 항목(컨텍스트·주간·OpenSpec)의 % 는 폭 200~1600px(1px 단위) x 배지·힌트·인계·경고 칩 조합 어디서도 메인 줄에 그려진다', () => {
  const base = { ...full, context: { percent: 54, tokens: 540000, window: 1000000 }, week: { ...full.week, percent: 40 }, spec: { changes: [{ name: 'a', done: 98, total: 107 }], branch: 'main', root: 'C:/p' } }
  const alerts = { ...base, verify: { tone: 'err', text: '✗ 검증 실패: band-ui.ts' }, cache: { tone: 'warn', alert: '⚠ 캐시 약 12분', left: 12 } }
  const kinds = [{ level: 'err' as const, n: 1, label: '결재' }, { level: 'warn' as const, n: 2, label: '알림' }, { level: 'ok' as const, n: 3, label: '확인' }]
  const bad: string[] = []
  let twoLines = 0
  for (let px = 200; px <= 1600; px += 1) {
    const cols = (px + HOST.framePadX * 2) / HOST.colPx
    for (const d of [base, alerts])
      for (const ks of [[], kinds])
        for (const hint of [null, '⚠ 수준 low→medium'])
          for (const handoff of [false, true]) {
            const p = barPlan(cols, d, { kinds: ks, open: ks.length ? '▸' : '세션 ▸', hint, handoff, detail: DETAIL_TEXT.closed })
            const svg = p.band?.svg ?? ''
            if (!svg.includes('>54%</tspan>') || !svg.includes('>40%</tspan>') || !svg.includes('>91%</tspan>')) bad.push(`${px}px 경고${d === alerts} 배지${ks.length} 힌트${!!hint} 인계${handoff}`)
            if (p.twoLine) twoLines += 1
          }
  }
  expect(bad.slice(0, 5)).toEqual([])
  expect(twoLines).toBeGreaterThan(0) // 아주 좁으면 빼지 않고 두 줄로 나눈다
  // 여러 줄: 첫 줄 = 고양이 + 지표, (경고 칩이 첫 줄에 안 들어가면 칩 줄), 마지막 줄 = 배지·단추
  const narrow = barPlan((300 + HOST.framePadX * 2) / HOST.colPx, alerts, { kinds, open: '▸', hint: '⚠ 수준 low→medium', handoff: true, detail: DETAIL_TEXT.closed })
  expect([narrow.twoLine, narrow.rows.length, !!narrow.chips]).toEqual([true, 3, true])
  expect(narrow.band!.svg).not.toContain('검증 실패') // 칩은 첫 줄이 아니라 칩 줄에
  expect(narrow.chips!.svg).toContain('>✗ 검증 실패</tspan>')
})

test('줄이는 순서: 덜 중요한 칸 → 노력 힌트 → 배지 합치기 → 인계 글자 줄이기 → 필수 세 항목 짧게 (한 줄인 동안)', () => {
  const d = { ...full, spec: { changes: [{ name: 'a', done: 98, total: 107 }], branch: 'main', root: 'C:/p' } }
  const kinds = [{ level: 'err' as const, n: 1, label: '결재' }, { level: 'warn' as const, n: 2, label: '알림' }]
  const at = (px: number) => barPlan((px + HOST.framePadX * 2) / HOST.colPx, d, { kinds, open: '▸', hint: '⚠ 수준 low→medium', handoff: true, detail: DETAIL_TEXT.closed })
  // 폭을 줄여 가며 처음 나타나는 순서를 본다: 힌트가 빠진 뒤 배지가 합쳐지고, 그 뒤 인계 글자가 줄고, 그 뒤에야 필수 항목이 짧아진다
  const firstAt = (pred: (p: ReturnType<typeof at>) => boolean) => { for (let px = 1600; px >= 200; px -= 1) { if (pred(at(px))) return px } return 0 }
  const noHint = firstAt(p => p.hint === null)
  const merged = firstAt(p => p.pills.length === 1)
  const shortHandoff = firstAt(p => p.handoffLabel === HANDOFF_TEXT.short)
  const essentialsShort = firstAt(p => (p.band?.level ?? 0) > BAND_LEVEL.othersLast)
  expect(noHint >= merged && merged >= shortHandoff && shortHandoff >= essentialsShort).toBe(true)
  expect(at(noHint).band!.level).toBe(BAND_LEVEL.othersLast) // 힌트를 뺄 때는 덜 중요한 칸이 이미 다 빠져 있다
})

test('OpenSpec 이 없으면 메인 줄에서는 숨기고, 세부 칸에는 이유(폴더에 없음 / 진행 중 change 없음)를 쓴다', async () => {
  expect(await refreshSpec(fakeFs('C:', {}))).toBeNull()
  expect(specEmptyReason()).toBe('이 폴더에 OpenSpec 없음 (C:)')
  expect(await refreshSpec(fakeFs('C:/p', { 'openspec/changes/archive/old/tasks.md': '- [x] a' }))).toBeNull()
  expect(specEmptyReason()).toBe('진행 중 change 없음')
  const cell = (specEmpty: string) => panelCells({ ...full, spec: null, specEmpty }).find(c => c.k === 'OpenSpec')!
  expect(cell('이 폴더에 OpenSpec 없음 (C:)').notes).toEqual(['이 폴더에 OpenSpec 없음 (C:)', '이 폴더에 OpenSpec 없음'])
  expect(cell('진행 중 change 없음').v).toBe('—')
  expect(bandSvg({ ...full, spec: null }, 3000, true).svg).not.toContain('>작업 </tspan>')
})

test('새 지표의 계산: 편집 줄 수, 주간 리셋 때 예상(추정), 묶음 칸의 근거, 값이 없을 때의 이유', () => {
  const none = Object.fromEntries(panelCells({ ...sample, limits: ['seven_day'], costTotal: null }).map(c => [c.k, c]))
  expect([none['도구 호출'].v, none['도구 호출'].notes[0]]).toEqual(['—', '로드 뒤 호출 없음'])
  expect(none['세션 비용'].notes[0]).toBe('앱이 비용을 주지 않음')
  expect(none['새 입력'].notes[0]).toBe('턴 기록 없음')
  expect(none['OpenSpec'].notes[0]).toBe('아직 값 없음') // 아직 읽기 전 (읽은 뒤의 이유는 다른 시험)
  expect(editLines('Edit', { old_string: 'a\nb', new_string: 'a\nb\nc' })).toEqual({ added: 3, removed: 2 })
  expect(editLines('MultiEdit', { edits: [{ old_string: 'x', new_string: 'y\nz' }, { old_string: '', new_string: 'w' }] })).toEqual({ added: 3, removed: 1 })
  expect(editLines('Write', { content: '1\n2\n3' })).toEqual({ added: 3, removed: 0 })
  const reset = Date.parse('2026-11-24T06:00:00Z')
  expect(weekProjection(30, reset, reset - 3.5 * 86_400_000)).toBe(60) // 주의 절반에 30% → 리셋 때 약 60%
  expect(weekProjection(5, reset, reset - 7 * 86_400_000 + 3_600_000)).toBeNull() // 12시간 미만은 흔들려서 내지 않는다
  expect(weekProjection(30, NaN, 0)).toBeNull()
  const x = { ...full, tools: { calls: 200, errors: 6, denies: 1, by: [['Bash', 120], ['Read', 50], ['Edit', 20], ['Grep', 10]] }, edits: { files: 4, added: 30, removed: 12 }, model: 'opus-5-5', effort: 'high', aborted: 1, asks: 2, compacts: { auto: 1, manual: 0 }, week: { ...full.week, projected: 61 } }
  const by = Object.fromEntries(panelCells(x).map(c => [c.k, c]))
  expect(by['도구 호출'].notes[0]).toBe('실패 3.0% · Bash 120 · Read 50')
  expect(by['편집'].notes[0]).toBe('+30 · −12줄')
  expect(by['프롬프트'].notes[0]).toBe('세션 2시간 14분 · opus-5-5 high') // 모델·effort 는 "단계/턴" 칸이 OpenSpec 으로 바뀌며 여기로
  expect(by['중단·거부'].notes[0]).toBe('턴 중단 1 · 도구 거부 1')
  expect(by['압축'].notes[0]).toBe('자동 1 · 수동 0')
  expect(by['주간'].notes[0]).toContain('리셋 때 약 61')
})

test('숫자용 글꼴 조각 안의 한글은 sans 글꼴로 나눠 그린다(Consolas 에는 한글이 없다)', () => {
  const { svg } = panelSvg(full)
  expect(svg).toMatch(/font-family="'Noto Sans KR'[^>]*>턴 시간 초<\/tspan>/) // 단위는 이름과 같은 sans 조각 (글꼴이 바뀌는 틈이 없다)
  expect(svg).not.toMatch(/monospace"[^>]*>[^<]*[가-힣]/) // 고정폭 글꼴 조각에는 한글이 없다
  expect(bandSvg({ ...sample, week: { ...sample.week, today: '7일/19%p' } }, 2000, true).svg).not.toMatch(/monospace"[^>]*>[^<]*[가-힣]/)
})

test('진행 막대 색은 70% 에서 경고, 85% 에서 오류로 바뀐다 (색과 함께 % 숫자가 늘 보인다)', () => {
  const at = (p: number) => bandSvg({ ...sample, week: null, context: { ...sample.context, percent: p } }, 2000, true).svg
  expect(at(31)).toContain('class="acc"')
  expect(at(31)).not.toMatch(/class="(warn|err)"/)
  expect(at(75)).toContain('class="warn"')
  expect(at(90)).toContain('class="err"')
  expect(at(90)).toContain('>90%</tspan>')
})

test('세부 격자는 묶음별 항목을 고정 순서로 그리고, 값이 없으면 지어내지 않고 빈 상태로 남긴다', () => {
  const names = panelCells(full).map(c => c.k)
  expect(names).toEqual(['컨텍스트', '5시간', '주간', '압축', '새 입력', '캐시 읽기', '캐시 쓰기', '출력', '세션 비용', '턴 비용', '턴 시간', '프롬프트', '도구 호출', '편집', '하위 에이전트', 'OpenSpec', '검증', 'rulegate', '권한 질문', '중단·거부'])
  const svg = panelSvg(full).svg
  // 토큰은 새 입력 · 캐시 읽기 · 캐시 쓰기 · 출력을 나눈 칸이다 (캐시 읽기를 입력에 더하지 않는다)
  for (const t of ['>세션 지표</tspan>', '세션 2시간 14분 · 턴 37', '>1.2</tspan>', '>35.0</tspan>', '>2.0</tspan>', '>2.1</tspan>', '>4.12</tspan>', '만료 약 48분']) expect(svg).toContain(t)
  expect(panelCells(full).find(c => c.k === '캐시 읽기')!.notes[0]).toBe('적중 92% · 평균 31.5 · 최대 35.0')
  // 상태: 검증 중이면 "검증 중…", 값이 오래되면 머리글에 나이를 쓴다
  expect(panelSvg({ ...full, verify: { tone: 'info', text: '● 검증 중…' } }).svg).toContain('검증 중…')
  expect(panelSvg({ ...full, session: { ...full.session, staleMin: 7 } }).svg).toContain('값 7분 전')
  expect(panelSvg({ ...full, session: { ...full.session, staleMin: 1 } }).svg).not.toContain('분 전')
  const empty = panelSvg({ ...sample, context: null, week: null, cache: null, history: [] }).svg
  expect(empty).toContain('아직 값 없음')
  expect(empty).toContain('>—</tspan>')
  expect(empty).toContain('고친 파일 없음') // 검증할 파일이 없었다
  // rulegate 칸은 판정 폴더를 설정해 읽었을 때만 있다: 값이 없으면 칸 자체가 없고, 나머지 묶음은 그대로다
  expect(panelCells({ ...full, rules: null }).map(c => c.k)).not.toContain('rulegate')
  expect(panelGroups({ ...full, rules: null }).map(g => g.cells.length)).toEqual([4, 4, 4, 4, 3])
  expect(panelSvg({ ...full, rules: null }).svg).not.toContain('rulegate')
})

test('근거 문구는 말줄임 없이 칸에 들어가고, 0 이 아닌 실패·막음은 짧은 문구에서도 남는다', () => {
  expect(panelSvg(full).svg).not.toContain('…')
  const cells = panelCells(full)
  for (const n of cells.find(c => c.k === '하위 에이전트')!.notes) expect(n).toContain('실패')
  for (const n of cells.find(c => c.k === 'rulegate')!.notes) expect(n).toContain('막음')
  for (const n of cells.find(c => c.k === '검증')!.notes) expect(n).toContain('실패')
  expect(fitNote(['아주 긴 문구가 칸보다 넓습니다 정말로', '짧음'], 40)).toEqual({ text: '짧음', size: 12 })
  expect(fitNote(['아주 긴 문구가 칸보다 넓습니다', '조금 긴 문구'], 20).size).toBe(10) // 다 넘치면 한 단계 작은 글자, 말줄임 없음
})

test('펼친 직후에만 칸이 들어오고(175ms + 시차, 250ms 안에 끝남), 움직임 줄이기에서는 이동 없이 나타나기만 한다', () => {
  const opened = panelSvg(full, true).svg
  expect(opened).toContain('animation:enter 175ms')
  expect(opened).toContain('@media (prefers-reduced-motion: reduce){.enter{animation:fade 175ms')
  expect(opened).toContain('class="enter"')
  const delays = [...opened.matchAll(/animation-delay:(\d+)ms/g)].map(m => Number(m[1]))
  expect(Math.max(...delays) + 175).toBeLessThanOrEqual(250) // 들어오는 움직임은 250ms 안
  expect(MOTION_TOTAL_MS).toBeLessThanOrEqual(250)
  expect(panelSvg(full, false).svg).not.toContain('animation') // 다시 그려도 반복하지 않는다
})

test('접힌 줄은 경고(검증 못함·실패, 캐시 만료 임박)를 칩으로 남기고, 아주 좁아도 지우지 않는다', () => {
  const failed = { ...sample, verify: { tone: 'err', text: '✗ 검증 실패: a.py' }, cache: { tone: 'warn', alert: '⚠ 캐시 12분', left: 12 } }
  for (const w of [2000, 100]) {
    const svg = bandSvg(failed, w, true).svg
    expect(svg).toContain(w === 2000 ? '✗ 검증 실패: a.py' : '>✗ 검증 실패</tspan>') // 아주 좁으면 파일 이름만 뺀 짧은 칩
    expect(svg).toContain('⚠ 캐시 12분')
  }
  expect(bandSvg(sample, 2000, true).svg).not.toContain('class="card"') // 통과·정상은 칩이 아니라 글자다
})

test('지난 턴 막대는 흐린 색(바탕과 3:1 이상), 이번 턴은 강조색이고 비율 그래프는 0~100 눈금이다', () => {
  const svg = panelSvg(full).svg
  expect(svg).toContain('class="mut"')
  expect(svg).not.toMatch(/rx="1" class="trk"/) // 지난 턴 막대가 트랙 색(바탕과 1.3:1)이 아니다
  const flat = panelPics({ ...full, history: [30, 31], hits: [90, 91] }, false, 0).map(p => p.svg).join('') // 한도 묶음의 비율 선
  const ys = [...flat.matchAll(/<path class="line" d="M[\d.]+ ([\d.]+) L[\d.]+ ([\d.]+)"/g)].map(m => Math.abs(Number(m[1]) - Number(m[2])))
  for (const dy of ys) expect(dy).toBeLessThan(1) // 1%p 차이는 선이 거의 평평하다 (눈금을 늘리지 않는다)
})

test('근거 문구와 상태 기호는 12px 아래로 내려가지 않는다', () => {
  const svg = panelSvg(full).svg
  expect(svg).not.toContain('font-size="10"')
  expect(svg).toMatch(/통과 ?1[^<]*실패 ?1/) // 칸 폭에 맞춰 자세한 문구 또는 띄어쓰기를 줄인 문구, 실패 수는 늘 남는다
})

test('세부 격자의 칸마다 대체 글이 있고, 모든 항목과 가장 자세한 근거를 말한다', () => {
  const alt = allPics(full).map(p => p.alt).join(', ')
  for (const t of ['컨텍스트 31%', '5시간 34%', '적중 92%', '하위 에이전트 5개 (실행 1 · 대기 0 · 완료 3 · 실패 1)', 'rulegate 27건 (막음 1 · 물음 0 · 경고 26)', '세션 비용 4.12 (세션 합계)', '턴 비용 0.31 (평균 0.26 · 최대 0.31)', '흰 눈금은 오늘 권장 위치']) expect(alt).toContain(t)
})

test('데이터 원천: 턴 토큰과 캐시 적중률, 하위 에이전트 상태별 수, rulegate 판정 수를 센다', () => {
  // 새 입력·캐시 읽기·캐시 쓰기·출력을 나눈다 (캐시 읽기를 입력에 더하면 949.8k 처럼 부푼다)
  expect(turnUsage({ input_tokens: 100, cache_read_input_tokens: 800, cache_creation_input_tokens: 100, output_tokens: 50 })).toEqual({ fresh: 100, read: 800, write: 100, output: 50, hit: 80 })
  expect(turnUsage(undefined)).toBeNull()
  expect(turnUsage({ output_tokens: 5 })).toEqual({ fresh: 0, read: 0, write: 0, output: 5, hit: null })
  expect(countAgents([{ status: 'running' }, { status: 'pending' }, { status: 'idle' }, { status: 'completed' }, { status: 'failed' }, { status: 'killed' }])).toEqual({ running: 2, waiting: 1, done: 1, failed: 2 })
  const jsonl = ['{"decision":"deny"}', '{"decision":"held"}', '{"decision":"ask"}', '{"decision":"ask-shadowed"}', '{"decision":"warn"}', '{"decision":"inject"}', ''].join('\n')
  expect(countRules(jsonl)).toEqual({ block: 2, ask: 2, warn: 1 })
})

test('토큰 대비: 두 모드 모두 글자 4.5:1, 막대·상태 색 3:1 이상이다', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  for (const m of [0, 1])
    for (const [fg, bg, min] of [['text-primary', 'background-surface', 4.5], ['text-primary', 'background-card', 4.5], ['text-secondary', 'background-surface', 4.5], ['text-secondary', 'background-card', 4.5], ['on-accent', 'accent', 4.5], ['accent', 'track', 3], ['success', 'background-surface', 3], ['warning', 'background-surface', 3], ['error', 'background-surface', 3], ['data-1', 'background-surface', 3], ['data-1-muted', 'background-surface', 3], ['border-strong', 'background-surface', 3], ['text-secondary', 'track', 3]] as const)
      expect(ratio(COLOR[fg][m], COLOR[bg][m])).toBeGreaterThanOrEqual(min)
})

test('게이지는 6칸이고 범위를 벗어난 값도 안전하다', () => {
  expect(gauge(19)).toEqual(['▰', '▱▱▱▱▱'])
  expect(gauge(0)).toEqual(['', '▱▱▱▱▱▱'])
  expect(gauge(100)).toEqual(['▰▰▰▰▰▰', ''])
  expect(gauge(250)[0].length + gauge(250)[1].length).toBe(6)
  expect(gauge(-5)[0]).toBe('')
})

test('막대는 0~100% 눈금이고 가장 낮은 막대는 ▂ 다', () => {
  expect(barsOf([10, 19, 30])).toBe('▂▂▃')
  expect(barsOf([46])).toBe('▄') // 한 점이 꽉 찬 █ 로 그려지지 않는다
  expect(barsOf([10, 100])).toBe('▂█')
})

test('상세를 펼치면 값을 못 읽은 항목은 줄을 만들지 않는다', () => {
  const rows = detailRows(Date.now())
  const keys = rows.map(r => r[0])
  expect(keys).toContain('상태')
  expect(keys).not.toContain('주간') // 한도 값을 아직 못 읽었다
})

const DAY = 86_400_000

test('오늘 권장량은 남은 한도를 남은 날에 나눈다', () => {
  // 수요일 정오, 리셋은 4일 뒤(목·금·토·일 지나 월요일 0시 전). 평일 가중치 1, 주말 0.3.
  const wed = new Date(2026, 10, 11, 12, 0, 0).getTime() // 2026-11-11 은 수요일
  const resets = new Date(2026, 10, 16, 0, 0, 0).toISOString() // 다음 월요일 0시
  const b = dailyBudget(40, 40, resets, wed)
  // 남은 날: 수·목·금(1+1+1) + 토·일(0.3+0.3) = 3.6, 오늘 가중치 1 → (100-40)/3.6
  expect(Math.round(b!.recommended * 10) / 10).toBe(16.7)
  // 리셋을 모르면 계산하지 않는다
  expect(dailyBudget(40, 40, undefined, wed)).toBeNull()
  void DAY
})

test('리셋이 낀 마지막 날은 리셋 시각까지의 몫만 센다', () => {
  const wed = new Date(2026, 10, 11, 12, 0, 0).getTime()
  const resets = new Date(2026, 10, 16, 6, 0, 0).toISOString() // 월요일 06시: 마지막 날은 0.25 몫
  // 수·목·금(3) + 토·일(0.6) + 월(0.25) = 3.85 → (100-40)/3.85
  expect(Math.round(dailyBudget(40, 40, resets, wed)!.recommended * 10) / 10).toBe(15.6)
})

test('좁으면 번호가 큰 칸부터 숨긴다', () => {
  const segs = [
    { prio: 1, value: '✓ 검증 2' },
    { prio: 3, label: '컨텍스트', value: '43%' },
    { prio: 7, label: '캐시', value: '38분' },
    { prio: 9, label: '페이스', value: '+6%p 앞섬' },
  ]
  expect(fit(segs, 200).length).toBe(4)
  const narrow = fit(segs, 36)
  expect(narrow.map(s => s.prio)).toEqual([1, 3])
})

test('아주 좁아도 이상 칸은 남긴다', () => {
  const segs = [
    { prio: 1, value: '✓ 검증 2', level: 'ok' as const },
    { prio: 3, label: '컨텍스트', value: '⚠ 72%', level: 'warn' as const },
    { prio: 7, label: '캐시', value: '38분', level: 'mute' as const },
  ]
  expect(fit(segs, 18).map(s => s.prio)).toEqual([3])
  // 이상 칸이 없으면 번호가 작은 칸이 남는다
  expect(fit(segs.map(s => ({ ...s, level: undefined })), 18).map(s => s.prio)).toEqual([1])
})

// 아래 플러그인(ponytail 등)이 이미 띠를 그리는 경우: 내 띠가 그것을 가리지 않고 함께 그려야 한다.
test('띠의 글은 0이 아닌 종류만 쓰고, 칸이 없으면 쓰지 않는다', () => {
  expect(asksText({ request: 1, notice: 2, report: 0 })).toBe('결재 1 · 알림 2')
  expect(asksText({ request: 0, notice: 0, report: 3 })).toBe('확인 3')
  expect(asksText({ request: 0, notice: 0, report: 0 })).toBeNull()
})

test('터미널 띠 글자 칸에도 개수가 들어가고, 이상 칸이라 좁아도 남는다', () => {
  const segs = [{ prio: 0, value: '✗ 결재 1 · 알림 2', level: 'err' as const }, { prio: 2, label: '하위', value: '0', level: 'mute' as const }, { prio: 9, label: '페이스', value: '+1%p 앞섬', level: 'mute' as const }]
  expect(fit(segs, 24).map(s => s.prio)).toContain(0)
})

test('개수 배지는 기호와 굵은 숫자이고 색만으로 말하지 않는다. 글자(결재·알림)는 쓰지 않는다', () => {
  const warn = askPillSvg('warn', 3).svg
  expect(warn).toMatch(/class="warn">!</) // 알림: 경고색 느낌표
  expect(warn).toMatch(/font-weight="700">3</) // 굵은 숫자
  expect(warn).not.toContain('알림')
  expect(askPillSvg('err', 1).svg).toMatch(/class="err">✗</) // 결재: 오류색 ✗
  expect(askPillSvg('ok', 1).svg).toMatch(/class="ok">✓</) // 확인: 성공색 ✓
  expect(askPillSvg('warn', 12).w).toBeGreaterThan(askPillSvg('warn', 1).w) // 두 자리면 넓어진다
})

test('따로 그린 띠 그림에는 고양이가 없다', () => {
  expect(bandSvg(sample, 2000, true).svg).not.toContain('<use href="#zz"')
  expect(bandSvg(sample, 2000).svg).toContain('use href="#zz"')
  expect(bandCatSvg('flag')).toContain('use href="#flag"')
})
