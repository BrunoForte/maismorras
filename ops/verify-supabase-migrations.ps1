param(
    [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
    [string]$ExpectedName = "campaign_asset_versions"
)
if ([string]::IsNullOrWhiteSpace($ProjectRef)) { throw "Informe SUPABASE_PROJECT_REF." }
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) { throw "Informe SUPABASE_ACCESS_TOKEN." }
$result = supabase migration list --project-ref $ProjectRef 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw "Não foi possível consultar migrations: $result" }
if ($result -notmatch [regex]::Escape($ExpectedName)) { throw "A migration esperada $ExpectedName não aparece na lista remota." }
Write-Host "Migration remota verificada: $ExpectedName"

