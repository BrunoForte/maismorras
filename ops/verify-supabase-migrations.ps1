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
if ($unapplied.Count -gt 0) {
    throw "Deploy bloqueado: estas migrations locais não aparecem como aplicadas nos lados local e remoto da CLI: $($unapplied -join ', '). Saída recebida:`n$($listing)"
}
Write-Host "Migration mais recente validada: $latestLocal (aplicada no projeto remoto $ProjectRef)."
