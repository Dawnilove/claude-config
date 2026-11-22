// edit-guard 규칙: 파일을 조용히 깨뜨리는 명령(sed -i, heredoc 로 파일 쓰기, python/PowerShell 문자열 치환)을 찾는다.
// 입출력이 없는 순수 함수다. 원본: claude/plugins/session-board/hooks/guard.ts (규칙을 고치면 두 파일을 같이 고친다).
// shortcut: 플러그인 폴더만 설치되므로 원본을 import 하지 못해 복사했다. 규칙이 자주 바뀌면 setup 이 복사하게 바꾼다.

const stripQuoted = (s: string) => s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""')
// 진짜 heredoc 표시만: <<WORD, <<-WORD, <<'WORD'. <<< (here-string) 와 1<<2 (산술) 는 아니다. lookbehind 는 쓰지 않는다.
const HEREDOC = /(^|[^<])<<-?\s*['"]?([A-Za-z_]\w*)['"]?/
// 본문이 그대로 실행되는 해석기 앞의 heredoc 은 본문도 명령이므로 지우지 않는다.
const INTERPRETER = /\b(?:bash|sh|zsh|dash|python3?|py|node|pwsh|powershell)(?:\.exe)?\b[^|;&\n]*<</

/** heredoc 본문(두 번째 줄부터 끝 표시까지)을 뺀다. 파일에 쓰는 본문은 명령이 아니라 글자다. */
function dropHeredocBodies(cmd: string): string {
  const out: string[] = []
  let end: string | null = null
  for (const line of cmd.split('\n')) {
    if (end !== null) {
      if (line.trim() === end) end = null
      continue
    }
    out.push(line)
    // 따옴표 안의 << 는 표시가 아니다. 표시 끝 단어의 따옴표(<<'EOF')만 먼저 벗긴다.
    const plain = stripQuoted(line.replace(/<<-?\s*(['"])([A-Za-z_]\w*)\1/g, '<<$2'))
    const m = HEREDOC.exec(plain)
    if (m && !INTERPRETER.test(plain)) end = m[2]
  }
  return out.join('\n')
}

/** 따옴표 안의 글자와 heredoc 본문을 비워서, 명령이 아닌 글자에 걸리지 않게 한 문자열. */
function visibleText(command: string): string {
  const marked = dropHeredocBodies(command).replace(/(^|[^<])<<-?\s*['"]?([A-Za-z_]\w*)['"]?/g, '$1<<$2')
  return stripQuoted(marked)
}

type Shell = 'Bash' | 'PowerShell'

// shell -c "..." 와 powershell -Command "..." 는 따옴표 안이 실제 명령이다. 앞에 sudo·env·옵션이 붙어도 푼다.
const WRAP_PREFIX = new Set(['command', 'exec', 'env', 'nohup', 'time', 'sudo'])
function unwrap(seg: string): { script: string; tool: Shell } | null {
  const words = tokenize(seg.trim())
  while (words.length > 0 && (WRAP_PREFIX.has(words[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]))) words.shift()
  const first = words[0] ?? ''
  if (/^(?:.*[\\/])?(?:bash|sh|zsh|dash)(?:\.exe)?$/i.test(first)) {
    const k = words.findIndex((w, i) => i > 0 && /^-[a-z]*c$/.test(w))
    return k >= 0 ? { script: words[k + 1] ?? '', tool: 'Bash' } : null
  }
  if (/^(?:.*[\\/])?(?:powershell|pwsh)(?:\.exe)?$/i.test(first)) {
    const k = words.findIndex((w, i) => i > 0 && /^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/i.test(w))
    return k >= 0 ? { script: words.slice(k + 1).join(' '), tool: 'PowerShell' } : null
  }
  return null
}

// python 으로 읽은 글자를 바꿔서 같은 파일에 다시 쓰는 패턴. 읽기만 하는 코드는 걸리지 않는다.
function isPyReplace(command: string, visible: string): boolean {
  return (
    /\b(?:python3?|py)\b/.test(visible) &&
    /(?:open\([^)]*['"][wa]b?\+?['"]|write_text\(|write_bytes\()/.test(command) &&
    /(?:\.replace\(|re\.sub\(|\.sub\()/.test(command)
  )
}

// shortcut: 정규식으로 본다. 따옴표 안과 heredoc 본문은 뺐지만, 변수나 $( ) 로 만든 명령은 못 본다. 새는 게 보이면 토큰 분석으로 올린다.
export function corruptReason(command: string, tool: Shell): string | null {
  const visible = visibleText(command)
  if (tool === 'PowerShell') {
    const writes = /(Set-Content|Out-File|WriteAllText|Add-Content)/i.test(visible)
    if (writes && /(-[ci]?replace\b|\.Replace\()/i.test(visible)) return 'PowerShell 문자열 치환 후 덮어쓰기'
    if (isPyReplace(command, visible)) return 'python 문자열 치환 후 덮어쓰기'
    return null
  }
  // bash -c "sed -i ..." 처럼 따옴표 안에 든 명령도 본다.
  for (const seg of splitTop(dropHeredocBodies(command))) {
    const w = unwrap(seg)
    const r = w ? corruptReason(w.script, w.tool) : null
    if (r !== null) return r
  }
  // 옵션 묶음은 해당 도구의 한 글자 옵션만 본다. perl -Mstrict 의 i 는 옵션이 아니다.
  if (/\bsed\b[^\n|;&]*\s(?:-[nEefrsuzl]*i|--in-place)/.test(visible)) return 'sed -i'
  if (/\bperl\b[^\n|;&]*\s-[pnals0-9]*i/.test(visible)) return 'perl -i'
  const toFile = '>{1,2}\\s*(?!/dev/null)[^\\s&|;]+'
  const hereDocToFile =
    new RegExp(`<<\\w+[^\\n;&|]*${toFile}`).test(visible) ||
    new RegExp(`\\b(?:cat|tee)\\b[^\\n;&|]*${toFile}[^\\n;&|]*<<\\w+`).test(visible) ||
    /\btee\b\s+(?:-[a-zA-Z]+\s+)*[^\s&|;<>-][^\n;&|]*<<\w+/.test(visible)
  if (hereDocToFile) return 'heredoc 으로 파일 쓰기'
  if (isPyReplace(command, visible)) return 'python 문자열 치환 후 덮어쓰기'
  return null
}

function tokenize(text: string): string[] {
  const words: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) words.push(m[1] !== undefined ? m[1].replace(/\\(["\\$`])/g, '$1') : (m[2] ?? m[3]))
  return words
}

// 알려진 한계(정규식 방식): 주석이나 it\'s 의 가짜 따옴표, "C:\out\" 의 \", $( )·백틱 안의 명령은 못 본다.
// 실수성 명령을 막는 안전장치이며, 일부러 우회하는 입력을 막는 보안 장치는 아니다.

/** ; | & 줄바꿈으로 나누되 따옴표 안은 나누지 않는다. 2>&1 의 & 는 나누지 않는다. */
function splitTop(command: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i]
    if (quote !== null) {
      cur += c
      if (c === '\\' && quote === '"') cur += command[++i] ?? ''
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      cur += c
      continue
    }
    const isRedirectAmp = c === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || command[i + 1] === '>')
    if (c === '\n' || c === ';' || c === '|' || (c === '&' && !isRedirectAmp)) {
      out.push(cur)
      cur = ''
      while ((c === '&' || c === '|') && command[i + 1] === c) i += 1
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}
