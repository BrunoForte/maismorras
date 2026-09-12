param(
    [string]$ApiBaseUrl = "https://maismorras-api-454646414754.southamerica-east1.run.app"
)

$base = $ApiBaseUrl.TrimEnd('/')

function Invoke-Check {
    param(
        [string]$Name,
        [string]$Uri
    )

    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing
    } catch {
        throw "$Name falhou: $($_.Exception.Message)"
    }

    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "$Name retornou HTTP $($response.StatusCode)"
    }

    return $response
}

$health = Invoke-Check -Name "health" -Uri "$base/health"
$healthBody = $health.Content | ConvertFrom-Json
if ($healthBody.status -ne "ok") {
    throw "health retornou um payload inesperado: $($health.Content)"
}

# Smoke test do proxy sem imprimir a imagem Base64 no terminal.
$token = Invoke-Check -Name "tokens/gerar" -Uri "$base/api/v1/tokens/gerar?prompt=smoke-test"
$tokenBody = $token.Content | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($tokenBody.fotoUrl) -or -not $tokenBody.fotoUrl.StartsWith("data:image/")) {
    throw "tokens/gerar retornou um payload sem fotoUrl de imagem"
}

Write-Host "Smoke test OK: $base/health e /api/v1/tokens/gerar"
