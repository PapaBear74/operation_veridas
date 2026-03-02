param(
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

function Write-JsonResponse {
  param(
    [Parameter(Mandatory=$true)]$Response,
    [Parameter(Mandatory=$true)][int]$StatusCode,
    [Parameter(Mandatory=$true)][string]$Json
  )
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Add-CorsHeaders {
  param([Parameter(Mandatory=$true)]$Response)
  $Response.Headers["Access-Control-Allow-Origin"] = "*"
  $Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
  $Response.Headers["Access-Control-Max-Age"] = "86400"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "Proxy listening on http://localhost:$Port/"
Write-Host "Stop with Ctrl+C"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    Add-CorsHeaders -Response $res

    if ($req.HttpMethod -eq "OPTIONS") {
      $res.StatusCode = 204
      $res.OutputStream.Close()
      continue
    }

    if ($req.HttpMethod -eq "GET" -and ($req.Url.AbsolutePath -eq "/" -or $req.Url.AbsolutePath -eq "/health")) {
      Write-JsonResponse -Response $res -StatusCode 200 -Json '{"status":"ok"}'
      continue
    }

    Write-JsonResponse -Response $res -StatusCode 404 -Json '{"error":"not_found"}'
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
