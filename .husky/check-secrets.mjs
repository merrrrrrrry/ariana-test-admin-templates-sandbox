/* eslint-disable */
// bstage 시크릿 가드 rev 3 — SDK가 관리하는 파일입니다. 직접 편집하지 마세요(bstage ai install이 갱신).
// 스테이지된 변경에서 앱키(bsa_/bsm_/bsp_)·포털 CLI 토큰(bsc_)·GitHub PAT 리터럴과
// .env.{phase} 파일의 시크릿 값을 검출해 커밋을 차단한다. 읽지 못한 파일은 통과시키지 않고, 이진 파일도 훑는다.
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'

const LF = String.fromCharCode(10)
const PATTERNS = [
  { label: '앱키', re: /bs[amp]_[A-Za-z0-9]{16,}/g },
  { label: '포털 CLI 토큰', re: /bsc_[0-9a-f]{64}/g },
  { label: 'GitHub PAT', re: /ghp_[A-Za-z0-9]{36}/g },
  { label: 'GitHub PAT', re: /github_pat_[A-Za-z0-9_]{82}/g },
]
const HINTS = ['YOUR', 'EXAMPLE', 'PLACEHOLDER', 'XXXX', 'CHANGEME']
// .env.{phase}에서 값이 들어 있으면 안 되는 키 이름 조각. APP_KEY는 브라우저에 노출되는 값이라 제외한다.
const SECRET_KEY_WORDS = ['SECRET', 'TOKEN', 'PASSWORD', 'PASSWD', 'PRIVATE_KEY']
// git show 출력 상한. 기본 1MB를 넘는 파일이 예외로 빠져 검사 없이 통과하던 것을 막는다.
const MAX_BUFFER = 256 * 1024 * 1024

function isPlaceholder(token) {
  // 힌트는 **토큰 자체**만 본다 — 줄 전체를 보면 'see example above' 같은 주석 한 줄에
  // 진짜 키가 통과한다.
  const upper = token.toUpperCase()
  if (HINTS.some((h) => upper.includes(h))) return true
  const body = token.slice(token.indexOf('_') + 1)
  return body.length > 0 && body.split('').every((c) => c === body[0])
}
// 토큰은 접두사(bsa_·bsc_·ghp_ 등)가 곧 종류라 그만큼만 보인다. 접두사가 늦게 나오면 자른다.
function maskToken(token) {
  const us = token.indexOf('_')
  const prefix = us >= 0 && us < 12 ? token.slice(0, us + 1) : token.slice(0, 4)
  return prefix + '****'
}
// 값은 어느 한 조각도 드러내지 않는다 — 커밋 로그를 볼 수 있는 사람이 값을 읽게 된다.
function maskValue(value) {
  return '****(' + value.length + '자)'
}
function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: MAX_BUFFER,
  })
}
// .env.{phase} 한 줄에서 "시크릿 이름 키 = 실제 값"을 찾는다. 주석·빈 값·플레이스홀더는 무시한다.
function envSecretAssignment(line) {
  const t = line.trim()
  if (t === '' || t.startsWith('#')) return null
  const eq = t.indexOf('=')
  if (eq <= 0) return null
  let key = t.slice(0, eq).trim()
  if (key.startsWith('export ')) key = key.slice(7).trim()
  const upper = key.toUpperCase()
  if (!SECRET_KEY_WORDS.some((w) => upper.includes(w))) return null
  let value = t.slice(eq + 1).trim()
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
  if (quoted) value = value.slice(1, -1)
  if (value === '' || isPlaceholder(value)) return null
  return { key: key, value: value }
}

let out
try {
  out = git(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '--diff-filter=ACM'])
} catch {
  process.exit(0)
}
const files = out
  .split(LF)
  .map((s) => s.trim())
  .filter(Boolean)
const findings = []

for (const f of files) {
  const base = basename(f)
  if (base === '.env' || base.endsWith('.local')) {
    findings.push({ file: f, line: 0, label: '.env 파일', masked: base })
  }
}
for (const f of files) {
  const base = basename(f)
  // .env(차단됨)·*.local(차단됨)·.example(플레이스홀더 파일)을 뺀 나머지 .env.* — Vite 모드 파일은
  // 커밋될 수 있으므로 값만 본다. 키/토큰 리터럴 검사는 파일을 가리지 않는다(.example도 진짜 키면 차단).
  const envPhase =
    base.startsWith('.env.') && !base.endsWith('.local') && !base.endsWith('.example')
  let content
  try {
    content = git(['show', ':' + f])
  } catch {
    // 읽지 못한 파일을 검사 없이 통과시키면 가드가 없는 것과 같다 — 차단하고 이유를 말한다.
    findings.push({ file: f, line: -1, label: '읽기 실패', masked: '' })
    continue
  }
  // 이진 파일도 그대로 훑는다 — 패턴은 ASCII라 이진 안에서도 잡히고, NUL을 이유로 건너뛰면
  // NUL 한 바이트를 앞에 붙인 파일로 가드를 우회할 수 있다.
  const lines = content.split(LF)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (envPhase) {
      const a = envSecretAssignment(line)
      if (a) {
        findings.push({
          file: f,
          line: i + 1,
          label: '시크릿 값 (' + a.key + ')',
          masked: maskValue(a.value),
        })
      }
    }
    for (const p of PATTERNS) {
      p.re.lastIndex = 0
      let m
      while ((m = p.re.exec(line)) !== null) {
        const token = m[0]
        if (p.label === '앱키' && isPlaceholder(token)) continue
        findings.push({ file: f, line: i + 1, label: p.label, masked: maskToken(token) })
      }
    }
  }
}

if (findings.length === 0) process.exit(0)

console.error('')
console.error('✗ 커밋 차단: 스테이지된 변경에 키/시크릿 리터럴이 있습니다.')
for (const x of findings) {
  if (x.line === 0) {
    console.error('  ' + x.file + ' — .env류 파일은 커밋하지 마세요 (git add -f로 강제됨?)')
  } else if (x.line === -1) {
    console.error('  ' + x.file + ' — 내용을 읽지 못해 검사할 수 없습니다(너무 크거나 읽기 실패). 검사 없이 통과시키지 않습니다.')
  } else {
    console.error('  ' + x.file + ':' + x.line + ' — ' + x.label + ' 리터럴 (' + x.masked + ')')
  }
}
console.error('')
console.error('  인증 값은 .env(커밋 안 됨) + import.meta.env로 주입하세요. 노출된 키는 폐기·재발급이 필요합니다.')
console.error('')
process.exit(1)
