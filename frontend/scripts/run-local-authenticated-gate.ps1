param(
	[ValidateRange(1, 10)][int]$Runs = 1,
	[ValidateRange(0, 2)][int]$Retries = 0
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$frontendDir = Join-Path $repoRoot 'frontend'
$backendDir = Join-Path $repoRoot 'backend'
$tempRoot = Join-Path $env:TEMP 'maismorras-authenticated-gate'
New-Item -ItemType Directory -Force $tempRoot | Out-Null

$supabaseValues = @{}
foreach ($line in (supabase status -o env)) {
	if ($line -match '^([A-Z0-9_]+)="?(.*?)"?$') {
		$supabaseValues[$matches[1]] = $matches[2].Trim('"')
	}
}
foreach ($required in @('API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET', 'DB_URL')) {
	if ([string]::IsNullOrWhiteSpace($supabaseValues[$required])) {
		throw "Supabase local did not provide $required."
	}
}
$dbUri = [Uri]$supabaseValues['DB_URL']
$supabaseUri = [Uri]$supabaseValues['API_URL']
if ($dbUri.Host -notin @('localhost', '127.0.0.1') -or $supabaseUri.Host -notin @('localhost', '127.0.0.1')) {
	throw 'Refusing to run: Supabase URL and database must both be local loopback addresses.'
}

$env:LOCAL_SUPABASE_URL = $supabaseValues['API_URL']
$env:SUPABASE_URL = $supabaseValues['API_URL']
$env:PUBLIC_SUPABASE_URL = $supabaseValues['API_URL']
$env:PUBLIC_SUPABASE_PUBLISHABLE_KEY = $supabaseValues['ANON_KEY']
$env:SUPABASE_SERVICE_ROLE_KEY = $supabaseValues['SERVICE_ROLE_KEY']
$env:SUPABASE_JWT_SECRET = $supabaseValues['JWT_SECRET']
$env:DATABASE_URL = $supabaseValues['DB_URL']
$env:REALTIME_BROKER = 'local'
$env:PORT = '8080'
$env:CORS_ORIGIN = 'http://127.0.0.1:4173'
$env:PUBLIC_API_BASE_URL = 'http://127.0.0.1:8080'
$env:E2E_BASE_URL = 'http://127.0.0.1:4173'
$env:PUBLIC_E2E_AUTH = 'true'
$env:LOCAL_AUTH_E2E = 'true'
$env:E2E_LOCAL_STACK = 'true'
$env:CI = 'true'

$binary = Join-Path $tempRoot 'maismorras-api.exe'
$buildWatch = [Diagnostics.Stopwatch]::StartNew()
Push-Location $backendDir
try {
	go build -o $binary ./cmd/api
	if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
} finally { Pop-Location }
$buildMs = [Math]::Round($buildWatch.Elapsed.TotalMilliseconds)
"Backend build: ${buildMs} ms"

$apiLog = Join-Path $tempRoot 'backend.log'
$apiErrorLog = Join-Path $tempRoot 'backend-error.log'
$frontendLog = Join-Path $tempRoot 'frontend.log'
$frontendErrorLog = Join-Path $tempRoot 'frontend-error.log'
$api = $null
$vite = $null
try {
	$launchWatch = [Diagnostics.Stopwatch]::StartNew()
	$api = Start-Process -FilePath $binary -WorkingDirectory $backendDir -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog -PassThru -WindowStyle Hidden
	$vite = Start-Process -FilePath 'node' -ArgumentList @('node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', '4173') -WorkingDirectory $frontendDir -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrorLog -PassThru -WindowStyle Hidden
	$launchMs = [Math]::Round($launchWatch.Elapsed.TotalMilliseconds)
	$readyWatch = [Diagnostics.Stopwatch]::StartNew()
	$deadline = (Get-Date).AddMinutes(3)
	do {
		Start-Sleep -Milliseconds 500
		$apiReady = $false
		$frontendReady = $false
		try { $apiReady = (Invoke-RestMethod 'http://127.0.0.1:8080/health/ready').status -eq 'ok' } catch {}
		try { $frontendReady = (Invoke-WebRequest 'http://127.0.0.1:4173' -UseBasicParsing).StatusCode -eq 200 } catch {}
		if ($apiReady -and $frontendReady) { break }
		if ($api.HasExited -or $vite.HasExited) { throw 'A local app exited before readiness.' }
		if ((Get-Date) -gt $deadline) { throw 'Local API/frontend readiness exceeded three minutes.' }
	} while ($true)
	$readyMs = [Math]::Round($readyWatch.Elapsed.TotalMilliseconds)
	"Process launch: ${launchMs} ms; backend + frontend readiness: ${readyMs} ms"

	Push-Location $frontendDir
	try {
		for ($run = 1; $run -le $Runs; $run++) {
			$timings = Join-Path $tempRoot "run-$run-timings.jsonl"
			$output = Join-Path $tempRoot "run-$run-results"
			$env:E2E_TIMINGS_FILE = $timings
			$playwrightWatch = [Diagnostics.Stopwatch]::StartNew()
			npx playwright test e2e/local-authenticated.spec.ts e2e/local-authenticated-audio.spec.ts e2e/local-authenticated-map-sheet.spec.ts --project=chromium --workers=1 --retries=$Retries --output=$output
			$testExitCode = $LASTEXITCODE
			$playwrightMs = [Math]::Round($playwrightWatch.Elapsed.TotalMilliseconds)
			"Run ${run}: Playwright ${playwrightMs} ms; exit=$testExitCode; configured retries=$Retries"
			if (Test-Path -LiteralPath $timings) {
				Get-Content -LiteralPath $timings | ForEach-Object {
					$record = $_ | ConvertFrom-Json
					"  attempt=$([int]$record.retry + 1) status=$($record.status) duration_ms=$([int]$record.durationMs) test=$($record.test)"
					$fixtureSteps = @('create unique GM/player test users', 'login GM', 'login player', 'create campaign and initial scene', 'create invite and join player to campaign', 'upload unique temporary audio assets to Storage', 'pair overlay using a one-time test code', 'open campaign scene and wait for canvas/overlay players')
					foreach ($step in $record.steps | Where-Object { $_.depth -eq 0 -or $_.name -in $fixtureSteps }) {
						"    phase=$($step.name) duration_ms=$([int]$step.durationMs)"
					}
				}
			}
			if ($testExitCode -ne 0) { throw "Authenticated E2E run $run failed; later repetitions were not started." }
		}
	} finally { Pop-Location }
} finally {
	$cleanupWatch = [Diagnostics.Stopwatch]::StartNew()
	foreach ($process in @($vite, $api)) {
		if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
	}
	"Local app shutdown: $([Math]::Round($cleanupWatch.Elapsed.TotalMilliseconds)) ms"
}
