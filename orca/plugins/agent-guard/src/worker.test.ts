// session-board 의 guard.test.ts · secrets.test.ts 사례를 그대로 옮겼다. 훅 시험은 Orca 가 하는 대로 이 워커만 체인에 두고 돌린다.
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import { corruptReason } from './edit-rules'
import { secretInCommand, secretPath } from './secret-rules'
import * as main from './worker'

const before = (tool: string, input: Record<string, unknown>) => ({ agent: 'claude', workspaceId: null, tool, input })

test('따옴표 안과 heredoc 본문의 글자에는 걸리지 않는다', () => {
  assert.equal(corruptReason('git commit -m "docs: sed -i 사용법 설명"', 'Bash'), null)
  assert.equal(corruptReason('python3 -c "import sys; sys.stdout.write(open(a).read())"', 'Bash'), null)
  assert.equal(corruptReason('psql <<EOF > /dev/null\nselect 1;\nEOF', 'Bash'), null)
  assert.equal(corruptReason('perl -Mstrict -Mwarnings -e "print 1"', 'Bash'), null)
  assert.equal(corruptReason('make | tee log; psql <<EOF\nselect 1;\nEOF', 'Bash'), null)
})

test('파일을 깨뜨리는 명령을 잡는다', () => {
  assert.equal(corruptReason("sed -i 's/a/b/' src/x.ts", 'Bash'), 'sed -i')
  assert.equal(corruptReason("sed -ie 's/a/b/' x", 'Bash'), 'sed -i')
  assert.equal(corruptReason('bash -c "sed -i s/a/b/ x"', 'Bash'), 'sed -i')
  assert.equal(corruptReason('perl -pi -e "s/a/b/" x', 'Bash'), 'perl -i')
  assert.equal(corruptReason("cat > a.txt <<'EOF'\nhi\nEOF", 'Bash'), 'heredoc 으로 파일 쓰기')
  assert.equal(corruptReason('tee a.txt <<EOF\nhi\nEOF', 'Bash'), 'heredoc 으로 파일 쓰기')
  assert.equal(
    corruptReason("python -c \"p=open('a').read().replace('x','y'); open('a','w').write(p)\"", 'PowerShell'),
    'python 문자열 치환 후 덮어쓰기'
  )
  assert.equal(corruptReason("(Get-Content a) -creplace 'a','b' | Set-Content a", 'PowerShell'), 'PowerShell 문자열 치환 후 덮어쓰기')
})

test('비밀 파일 경로와 읽기 명령을 알아본다', () => {
  assert.equal(secretPath('C:\\proj\\.env'), '.env')
  assert.equal(secretPath('/proj/.env.local'), '.env.local')
  assert.equal(secretPath('C:\\Users\\me\\.claude\\.credentials.json'), '.credentials.json')
  assert.equal(secretPath('/home/me/.ssh/id_ed25519'), 'id_ed25519')
  assert.equal(secretPath('/proj/server.pem'), 'server.pem')
  assert.equal(secretPath('/proj/.env.example'), null)
  assert.equal(secretPath('/proj/id_ed25519.pub'), null)
  assert.equal(secretPath('/proj/environment.ts'), null)
  assert.equal(secretPath(''), null)
  assert.equal(secretInCommand('cat .env'), '.env')
  assert.equal(secretInCommand('Get-Content C:\\Users\\me\\.claude\\.credentials.json'), '.credentials.json')
  assert.equal(secretInCommand('cat .env.example'), null)
  assert.equal(secretInCommand('git status'), null)
})

test('검색 패턴 속 정규식 글자는 파일로 보지 않고, 경로는 막는다', () => {
  assert.equal(secretInCommand(`git ls-files | Select-String -Pattern '\\.credentials|(^|/)\\.env'`), null)
  assert.equal(secretInCommand('grep -E "\\.env$" list.txt'), null)
  assert.equal(secretInCommand('Get-Content C:\\proj\\.env'), '.env')
  assert.equal(secretInCommand('cat .\\.env'), '.env')
  assert.equal(secretInCommand('type \\\\server\\share\\.env'), '.env')
})

test('훅: 깨뜨리는 명령과 비밀 파일 읽기는 한국어 사유로 거부하고, 나머지는 그대로 통과한다', async () => {
  const worker = await mountWorker(main)

  for (const [tool, input] of [
    ['Bash', { command: "sed -i 's/a/b/' src/x.ts" }],
    ['PowerShell', { command: "(Get-Content a.txt) -replace 'a','b' | Set-Content a.txt" }],
  ] as const) {
    const d = await worker.hooks.fire('agent.tool.before', before(tool, input))
    assert.equal(d.kind, 'deny')
    if (d.kind === 'deny') assert.match(d.reason, /^✗ edit-guard 막음 · .*\n이유 .*\n대신 .*\n재시도 /)
  }

  for (const [tool, input] of [
    ['Read', { file_path: 'C:\\proj\\.env' }],
    ['Bash', { command: 'cat .env' }],
  ] as const) {
    const d = await worker.hooks.fire('agent.tool.before', before(tool, input))
    assert.equal(d.kind, 'deny')
    if (d.kind === 'deny') assert.match(d.reason, /^✗ secret-guard 막음 · /)
  }

  // 위험 명령 확인은 앱 권한 규칙(permissions.ask)이 맡는다. 이 가드는 묻지 않는다 (2026-11-19 사용자 결정).
  for (const [tool, input] of [
    ['Bash', { command: 'ls -la' }],
    ['Bash', { command: 'rm -rf build' }],
    ['Read', { file_path: 'C:\\proj\\.env.example' }],
    ['Edit', { file_path: 'a.ts' }],
    ['Bash', {}],
  ] as const) {
    const d = await worker.hooks.fire('agent.tool.before', before(tool, input))
    assert.equal(d.kind, 'continue')
  }

  // 로그에는 명령 내용이 없다
  assert.ok(worker.logs.every((line) => !line.includes('.env') && !line.includes('sed -i')))
  await worker.deactivate()
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 20)) // 시작할 때 읽는 설정이 메모리에 오기를 기다린다

test('설정: 가드마다 끌 수 있고, 다른 가드는 계속 막는다', async () => {
  const sed = before('Bash', { command: "sed -i 's/a/b/' x" })
  const env = before('Read', { file_path: 'C:\\proj\\.env' })

  const editOff = await mountWorker(main, { host: mockHost({ settings: { editGuard: false } }) })
  await tick()
  assert.equal((await editOff.hooks.fire('agent.tool.before', sed)).kind, 'continue')
  assert.equal((await editOff.hooks.fire('agent.tool.before', env)).kind, 'deny')
  await editOff.deactivate()

  const secretOff = await mountWorker(main, { host: mockHost({ settings: { secretGuard: false } }) })
  await tick()
  assert.equal((await secretOff.hooks.fire('agent.tool.before', env)).kind, 'continue')
  assert.equal((await secretOff.hooks.fire('agent.tool.before', before('Bash', { command: 'cat .env' }))).kind, 'continue')
  assert.equal((await secretOff.hooks.fire('agent.tool.before', sed)).kind, 'deny')
  await secretOff.deactivate()
})

test('설정을 못 읽으면 가드는 켜진 채로 둔다', async () => {
  const host = mockHost({ results: { 'settings.get': () => { throw new Error('unavailable') } } })
  const worker = await mountWorker(main, { host })
  await tick()
  assert.equal((await worker.hooks.fire('agent.tool.before', before('Bash', { command: "sed -i 's/a/b/' x" }))).kind, 'deny')
  assert.ok(worker.logs.some((line) => line.includes('settings read failed')))
  await worker.deactivate()
})
