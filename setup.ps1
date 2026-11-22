# Installs this config for one agent: Claude Code (claude\), Codex (codex\), Antigravity (antigravity\) or Orca (orca\).
# ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
# Usage:  .\setup.ps1                          (Claude Code, as before)
#         .\setup.ps1 -Agent codex             (Codex CLI / app)
#         .\setup.ps1 -Agent antigravity       (Antigravity IDE and agy CLI)
#         .\setup.ps1 -Agent orca              (Orca's own plugins; the agents Orca runs need their own -Agent run)
#         .\setup.ps1 -Agent codex -Target C:\tmp\x -SkipPlugins   (dry test)
param(
    [ValidateSet('claude', 'codex', 'antigravity', 'orca')]
    [string]$Agent = 'claude',
    [string]$Target,
    [switch]$SkipPlugins
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$homes = @{ claude = "$env:USERPROFILE\.claude"; codex = "$env:USERPROFILE\.codex"; antigravity = "$env:USERPROFILE\.gemini\config"; orca = "$env:APPDATA\orca" }
if (-not $Target) { $Target = $homes[$Agent] }
# A test run into another -Target must not touch real user files or variables.
$realTarget = $Target.TrimEnd('\') -eq $homes[$Agent]
$src = Join-Path $root $Agent
# Orca keeps its own data folder; this script must not create it (Orca may not be installed yet).
if ($Agent -ne 'orca') { New-Item -ItemType Directory -Force $Target | Out-Null }

function Install-Graphify {
    # graphify: code knowledge graph CLI shared by every agent (skill copied from claude\skills\graphify, no hooks).
    # Not 'graphify install': it appends to the rules file. uv's default tool dir is under AppData\Roaming, which the
    # packaged Claude app redirects to another drive, so tools go to ~\.uv-tools (2026-11-19).
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Write-Warning 'uv not found: run "winget install astral-sh.uv", then this script again (graphify).'
    } elseif ($realTarget) {
        $env:UV_TOOL_DIR = "$env:USERPROFILE\.uv-tools"
        [Environment]::SetEnvironmentVariable('UV_TOOL_DIR', $env:UV_TOOL_DIR, 'User')
        [Environment]::SetEnvironmentVariable('GRAPHIFY_QUERY_LOG_DISABLE', '1', 'User')   # no local log of questions
        uv tool install graphifyy
    }
}

# Copies the rules file. An existing file of the user's own (first line differs) is backed up, never lost.
function Install-Rules($from, $to) {
    if ((Test-Path $to) -and ((Get-Content $to -TotalCount 1) -ne (Get-Content $from -TotalCount 1))) {
        Copy-Item $to "$to.bak-setup" -Force
        Write-Warning "$to was your own file. Saved it as $to.bak-setup; merge your rules back by hand."
    }
    Copy-Item $from $to -Force
}

# Copies the skills that work unchanged on every agent (list in <agent>\skills.txt) from claude\.
function Install-SharedSkills($skillsDir) {
    New-Item -ItemType Directory -Force $skillsDir | Out-Null
    $paths = Get-Content (Join-Path $src 'skills.txt') | Where-Object { $_ -and -not $_.StartsWith('#') }
    foreach ($p in $paths) {
        $from = Join-Path $root "claude\$p"
        $dest = Join-Path $skillsDir (Split-Path $p -Leaf)
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }   # same-name skill from an older run: replace, not merge
        Copy-Item $from $dest -Recurse
    }
    Write-Host "Copied $(@($paths).Count) skills -> $skillsDir"
}

function Read-Json($path) {
    $o = if (Test-Path $path) { Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
    if (-not $o) { $o = New-Object psobject }   # missing or empty file
    return $o
}

function Write-Json($path, $obj) {
    if (Test-Path $path) { Copy-Item $path "$path.bak-setup" -Force }
    # WriteAllText: no BOM. Set-Content -Encoding utf8 would add one in PowerShell 5.1.
    [IO.File]::WriteAllText($path, (ConvertTo-Json $obj -Depth 30))
    Write-Host "Updated $path"
}

if ($Agent -eq 'orca') {
    # Orca runs Claude Code, Codex and Antigravity with their own config folders, so rules, subagents and skills
    # come from the other -Agent runs. This branch installs Orca's own plugins (orca\plugins\*) with 'orca plugin install'.
    # A plugin that runs code needs the user's approval in Orca (exit code 3); this script never approves for the user.
    # session-board (loaded into Claude through CLAUDE_CODE_PLUGIN_DIRS) already runs the same guards, so agent-guard would only repeat them.
    $pluginDirs = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', 'User')
    $sessionBoardLoaded = [bool]$pluginDirs -and ([IO.Path]::GetFullPath($pluginDirs).TrimEnd('\') -eq (Join-Path $root 'claude\plugins'))
    $dirs = @(Get-ChildItem (Join-Path $src 'plugins') -Directory)
    $install = @($dirs | Where-Object { -not ($_.Name -eq 'agent-guard' -and $sessionBoardLoaded) })
    $pending = @()
    $failed = @()
    if ($install.Count -lt $dirs.Count) {
        Write-Host "Skipped agent-guard: session-board already guards Claude on this PC. To install it anyway: orca plugin install `"$(Join-Path $src 'plugins\agent-guard')`""
    }
    if ($SkipPlugins -or -not $realTarget) {
        Write-Host "Dry run: would install $(($install | ForEach-Object Name) -join ', ') with 'orca plugin install'."
    } elseif (-not (Get-Command orca -ErrorAction SilentlyContinue)) {
        Write-Warning 'orca CLI not found. Start Orca once, then run this script again.'
        exit 1
    } else {
        $ErrorActionPreference = 'Continue'   # exit code 3 (approval needed) must not stop the loop
        foreach ($d in $install) {
            # 'orca plugin test' writes typings into <plugin>\.orca. An install hashes and copies them, so the fingerprint
            # changes after every test run. They are generated and git-ignored: remove them first.
            Remove-Item (Join-Path $d.FullName '.orca') -Recurse -Force -ErrorAction SilentlyContinue
            orca plugin install $d.FullName
            if ($LASTEXITCODE -eq 3) { $pending += $d.Name }
            elseif ($LASTEXITCODE -ne 0) {
                $failed += $d.Name
                Write-Warning "$($d.Name): install failed (exit $LASTEXITCODE). Is Orca running and Plugins turned on (Settings > Plugins)?"
            }
        }
        if ($pending.Count -gt 0) {
            Write-Host "Approval needed for: $($pending -join ', '). Read what each plugin asks for above, then run the 'orca plugin install ... --approve <fingerprint>' command Orca printed."
        }
    }
    Write-Host 'Done. For the agents Orca runs, also run: setup.ps1 -Agent claude | codex | antigravity.'
    # Exit codes follow 'orca plugin install': 1 = a failure, 3 = approval still needed, 0 = nothing left to do.
    if ($failed.Count -gt 0) { exit 1 }
    if ($pending.Count -gt 0) { exit 3 }
    exit 0
}

if ($Agent -eq 'codex') {
    Install-Rules (Join-Path $src 'AGENTS.md') (Join-Path $Target 'AGENTS.md')
    foreach ($d in 'agents', 'rules', 'hooks') { Copy-Item (Join-Path $src $d) $Target -Recurse -Force }
    # Codex reads user skills from ~/.agents/skills. Other tools also keep skills there; only our names are replaced.
    Install-SharedSkills $(if ($realTarget) { "$env:USERPROFILE\.agents\skills" } else { Join-Path $Target 'skills' })
    # UserPromptSubmit hook: plain stdout is added to the model's context. Other hooks stay.
    $hp = Join-Path $Target 'hooks.json'
    $h = Read-Json $hp
    if ((ConvertTo-Json $h -Depth 30) -notmatch 'reminder\.txt') {
        $cmd = "powershell -NoProfile -Command `"Get-Content -Raw -Encoding UTF8 '" + ($Target -replace '\\', '/') + "/hooks/reminder.txt'`""
        $entry = @{ hooks = @(@{ type = 'command'; command = $cmd; commandWindows = $cmd; timeout = 10 }) }
        if (-not $h.hooks) { $h | Add-Member -NotePropertyName hooks -NotePropertyValue (New-Object psobject) }
        $list = @($h.hooks.UserPromptSubmit | Where-Object { $_ }) + $entry
        $h.hooks | Add-Member -NotePropertyName UserPromptSubmit -NotePropertyValue $list -Force
        Write-Json $hp $h
    }
    if (-not $SkipPlugins) { Install-Graphify }
    Write-Host 'Done. Restart Codex, then run /hooks once and trust the reminder hook.'
    exit 0
}

if ($Agent -eq 'antigravity') {
    Install-Rules (Join-Path $src 'AGENTS.md') (Join-Path $Target 'AGENTS.md')
    foreach ($d in 'agents', 'hooks') { Copy-Item (Join-Path $src $d) $Target -Recurse -Force }
    Install-SharedSkills (Join-Path $Target 'skills')
    # hooks.json: each top-level key is one named hook, so ours is one key and the others stay.
    $hp = Join-Path $Target 'hooks.json'
    $h = Read-Json $hp
    $cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"" + (Join-Path $Target 'hooks\reminder.ps1') + "`""
    $h | Add-Member -NotePropertyName 'claude-config-reminder' -NotePropertyValue @{ PreInvocation = @(@{ type = 'command'; command = $cmd; timeout = 10 }) } -Force
    Write-Json $hp $h
    if (-not $SkipPlugins) { Install-Graphify }
    Write-Host 'Done. Restart Antigravity (IDE and agy).'
    exit 0
}

# ---- Claude Code ----
# Never overwrite this computer's CLAUDE.md. The shared rules go to CLAUDE.shared.md
# and the local CLAUDE.md imports them with one "@" line, so local rules stay.
$main = Join-Path $Target 'CLAUDE.md'
$import = '@CLAUDE.shared.md'
# The source computer's CLAUDE.md IS the shared rules. Importing a copy there loads every rule twice.
# shortcut: detects the source copy by its first line only. Use a marker file if a local CLAUDE.md ever starts with the same title.
$isSource = (Test-Path $main) -and ((Get-Content $main -TotalCount 1) -eq (Get-Content (Join-Path $src 'CLAUDE.md') -TotalCount 1))
if ($isSource) {
    Write-Host "$main is the source copy. Skipped CLAUDE.shared.md and the import line."
} else {
    Copy-Item (Join-Path $src 'CLAUDE.md') (Join-Path $Target 'CLAUDE.shared.md') -Force
    if (-not (Test-Path $main) -or -not (Select-String -Path $main -SimpleMatch $import -Quiet)) {
        Add-Content $main "`r`n$import" -Encoding utf8
        Write-Host "Added import line to $main"
    }
}

# The source computer edits ~/.claude directly (README 4-1). Copying here would overwrite edits not yet pushed, with no backup.
if ($isSource) {
    Write-Warning "Source computer: skipped copying docs, agents, skills, hooks. Copy them into this repo before you push."
} else {
    foreach ($d in 'agents', 'skills', 'hooks') {
        Copy-Item (Join-Path $src $d) $Target -Recurse -Force
    }
    # docs also holds the GitHub Pages site. Only the .md rule files belong in ~/.claude.
    New-Item -ItemType Directory -Force (Join-Path $Target 'docs') | Out-Null
    Copy-Item (Join-Path $root 'docs\*.md') (Join-Path $Target 'docs') -Force
}
# decision-rack moved into the session-board plugin (plugins/session-board). Copy does not delete, so remove the old copy.
$old = Join-Path $Target 'skills\decision-rack'
if (Test-Path $old) { Remove-Item $old -Recurse -Force; Write-Host "Removed old $old" }

# Register the reminder hook in settings.json. Other hooks and settings stay.
$sp = Join-Path $Target 'settings.json'
$s = Read-Json $sp
$changed = $false
# Response language. An existing value (any language) is kept.
if (-not $s.language) {
    $s | Add-Member -NotePropertyName language -NotePropertyValue 'korean'
    $changed = $true
}
# Ask before risky delete/git commands. The app's own approval prompt replaced the guard card (2026-11-19 decision).
$ask = @('Bash(rm -rf:*)', 'Bash(rm -r:*)', 'Bash(rm -fr:*)', 'Bash(git reset --hard:*)', 'Bash(git clean:*)', 'Bash(git push --force:*)', 'Bash(git push -f:*)')
if (-not $s.permissions) { $s | Add-Member -NotePropertyName permissions -NotePropertyValue (New-Object psobject) }
$have = @($s.permissions.ask | Where-Object { $_ })
$missing = @($ask | Where-Object { $have -notcontains $_ })
if ($missing.Count -gt 0) {
    $s.permissions | Add-Member -NotePropertyName ask -NotePropertyValue (@($have) + @($missing)) -Force
    $changed = $true
}
if ((ConvertTo-Json $s -Depth 30) -notmatch 'reminder\.txt') {
    $changed = $true
    $cmd = "powershell -NoProfile -Command `"Get-Content -Raw '" + ($Target -replace '\\', '/') + "/hooks/reminder.txt'`""
    $entry = @{ hooks = @(@{ type = 'command'; command = $cmd; timeout = 10 }) }
    if (-not $s.hooks) { $s | Add-Member -NotePropertyName hooks -NotePropertyValue (New-Object psobject) }
    $list = @($s.hooks.UserPromptSubmit | Where-Object { $_ }) + $entry
    $s.hooks | Add-Member -NotePropertyName UserPromptSubmit -NotePropertyValue $list -Force
}
if ($changed) { Write-Json $sp $s }
Write-Host "Copied: CLAUDE.shared.md, docs, agents, skills, hooks -> $Target"

# Point Claude Code at this repo's own plugins (session-board, relay-skills, relay-agents, ...).
# Runs even with -SkipPlugins: it installs nothing, and an update that moves the folder must move the variable too.
# shortcut: the variable holds one path. If it holds something else, warn and keep it. Support a path list if a second source is needed.
$normPath = { param($p) [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($p)).TrimEnd('\') }
$mods = & $normPath (Join-Path $src 'plugins')
# Older plugin folders: mods\my-own-mods\plugins (until 2026-11-18) and plugins\ (until 2026-11-19).
# git pull leaves their ignored files behind, and a variable still pointing there would load that shell, so remove them.
$oldDirs = @((Join-Path $root 'mods\my-own-mods'), (Join-Path $root 'plugins'))
foreach ($oldDir in $oldDirs) {
    if (-not (Test-Path $oldDir)) { continue }
    # Only the ignored leftovers (.gitignore: .claude-plugin/types/, tsconfig.json, *.log) may go. Anything else is the user's work.
    $own = Get-ChildItem $oldDir -Recurse -File -Force | Where-Object { $_.FullName -notmatch '\\\.claude-plugin\\types\\' -and $_.Name -ne 'tsconfig.json' -and $_.Extension -ne '.log' }
    if ($own) { Write-Warning "$oldDir still holds $(@($own).Count) file(s) of your own. Move them into claude\plugins\, then delete the folder." }
    else { Remove-Item $oldDir -Recurse -Force; Write-Host "Removed old $oldDir" }
}
if ((Test-Path (Join-Path $root 'mods')) -and -not (Get-ChildItem (Join-Path $root 'mods') -Force)) { Remove-Item (Join-Path $root 'mods') }
$old = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', 'User')
$oldNorm = if ($old) { & $normPath $old } else { '' }
$oldPluginPaths = @((& $normPath (Join-Path $root 'plugins')))
if (-not $realTarget) {
    Write-Host "Test target: skipped CLAUDE_CODE_PLUGIN_DIRS (would be $mods)"
} elseif ($oldNorm -eq $mods) {
    # already right
} elseif (-not $old -or $oldNorm -like '*\my-own-mods\plugins' -or $oldPluginPaths -contains $oldNorm) {
    [Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', $mods, 'User')
    Write-Host "Set CLAUDE_CODE_PLUGIN_DIRS -> $mods"
} else {
    Write-Warning "CLAUDE_CODE_PLUGIN_DIRS already holds '$old'. Left unchanged. Set it to '$mods' by hand."
}

if (-not $SkipPlugins) {
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
        Write-Warning 'claude CLI not found. Install Claude Code, then run this script again.'
        exit 1
    }
    $ErrorActionPreference = 'Continue'   # "already installed" must not stop the script
    claude plugin marketplace add DietrichGebert/ponytail
    claude plugin install ponytail@ponytail
    claude plugin install frontend-design@claude-plugins-official
    claude plugin marketplace add google/elephant-goldfish-model
    claude plugin install egm@egm
    claude plugin marketplace add openai/codex-plugin-cc
    claude plugin install codex@openai-codex   # needs the codex CLI and 'codex login' (done by the user)
    Install-Graphify
}
Write-Host 'Done. Restart Claude Code.'
