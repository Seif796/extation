param(
    [string]$deviceCode = "da6c312fdbf5df9f90bb23705b4cedf7345aae9c"
)

$clientId = "178c6fc778ccc68e1d6a"
$token = $null

Write-Host "Waiting for GitHub Device Authorization..."

for ($i = 0; $i -lt 180; $i++) {
    Start-Sleep -Seconds 5
    try {
        $body = @{
            client_id = $clientId
            device_code = $deviceCode
            grant_type = "urn:ietf:params:oauth:grant-type:device_code"
        }
        $res = Invoke-RestMethod -Uri "https://github.com/login/oauth/access_token" -Method Post -Body $body -Headers @{ Accept = "application/json" }
        if ($res.access_token) {
            $token = $res.access_token
            Write-Host "Authorization successful! Token acquired."
            break
        }
        if ($res.error -ne "authorization_pending") {
            Write-Host "Status: $($res.error)"
            if ($res.error -eq "expired_token" -or $res.error -eq "access_denied") {
                break
            }
        }
    } catch {
        Write-Host "Network poll error: $_"
    }
}

if (-not $token) {
    Write-Host "Timed out or failed to get token."
    exit 1
}

# 1. Get authenticated user
$authHeader = @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github+json"
    "User-Agent" = "Da7eBot-Setup"
}
$user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $authHeader
$username = $user.login
Write-Host "Authenticated as: $username"

# 2. Create repo 'extation'
Write-Host "Creating repository 'extation' under $username..."
try {
    $createBody = @{
        name = "extation"
        description = "Da7eBot AI Code Assistant & Mobile Remote"
        private = $false
    } | ConvertTo-Json
    $repo = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Body $createBody -Headers $authHeader
    Write-Host "Repository created successfully: $($repo.html_url)"
} catch {
    Write-Host "Repo might already exist or: $_"
}

# 3. Push code to the new repository
$env:PATH = "C:\Program Files\Git\cmd;" + $env:PATH
cd "C:\Users\janah\OneDrive\Desktop\extintion"

$remoteUrl = "https://$($token)@github.com/$username/extation.git"
& "C:\Program Files\Git\cmd\git.exe" remote set-url origin $remoteUrl
& "C:\Program Files\Git\cmd\git.exe" branch -M main
Write-Host "Pushing files and workflows to GitHub..."
& "C:\Program Files\Git\cmd\git.exe" push -u origin main --force

Write-Host "ALL DONE! GitHub Actions is now building the APK."
@{
    username = $username
    repoUrl = "https://github.com/$username/extation"
    actionsUrl = "https://github.com/$username/extation/actions"
    releasesUrl = "https://github.com/$username/extation/releases"
} | ConvertTo-Json | Set-Content "github_setup_complete.json"
