param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRef = $env:SUPABASE_PROJECT_REF
)

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    throw "Informe SUPABASE_PROJECT_REF."
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
    throw "SUPABASE_ACCESS_TOKEN é obrigatório para validar migrations antes do deploy."
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) {
    throw "SUPABASE_DB_PASSWORD é obrigatório para vincular o projeto e validar migrations."
}

$migrationDirectory = Join-Path $PSScriptRoot '..\supabase\migrations'
$localVersions = @(
    Get-ChildItem -LiteralPath $migrationDirectory -Filter '*.sql' -File |
        ForEach-Object {
            if ($_.BaseName -match '^(\d{14})_') { $Matches[1] }
        } |
        Sort-Object -Unique
)
if ($localVersions.Count -eq 0) {
    throw "Nenhuma migration versionada foi encontrada em $migrationDirectory."
}
$latestLocal = $localVersions[-1]

$linkOutput = & supabase link --project-ref $ProjectRef --password $env:SUPABASE_DB_PASSWORD 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível vincular o projeto Supabase: $($linkOutput | Out-String)"
}

$maxWaitMinutes = 8
$deadline = [DateTimeOffset]::UtcNow.AddMinutes($maxWaitMinutes)
$pollIntervalSeconds = 10
$attempt = 0
while ($true) {
    $attempt++
    $lines = & supabase migration list --linked 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Não foi possível consultar o histórico remoto de migrations: $($lines | Out-String)"
    }
    $listing = $lines -join [Environment]::NewLine
    $unapplied = @(
        $localVersions | Where-Object {
            $pattern = "(?<!\d)$([regex]::Escape($_))(?!\d)"
            [regex]::Matches($listing, $pattern).Count -lt 2
        }
    )
    if ($unapplied.Count -eq 0) {
        Write-Host "Migrations validadas: $latestLocal está aplicada no projeto remoto $ProjectRef."
        exit 0
    }
    $remainingSeconds = ($deadline - [DateTimeOffset]::UtcNow).TotalSeconds
    if ($remainingSeconds -le 0) {
        throw "Tempo limite de $maxWaitMinutes minuto(s): migrations ainda não aplicadas: $($unapplied -join ', '). Última saída:`n$($listing)"
    }
    Write-Host "Aguardando a integração Supabase aplicar $($unapplied -join ', ') (tentativa $attempt; próxima consulta em $pollIntervalSeconds s)."
    $sleepSeconds = [int][Math]::Min($pollIntervalSeconds, [Math]::Ceiling($remainingSeconds))
    Start-Sleep -Seconds $sleepSeconds
    $pollIntervalSeconds = [Math]::Min($pollIntervalSeconds * 2, 30)
}
