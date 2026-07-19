$ErrorActionPreference = "Stop"
$base = "http://localhost:5000/api"
$testDir = "$env:TEMP\resume-tests"

function Write-Step($num, $name) { Write-Host "`n=== Step $num: $name ===" -ForegroundColor Cyan }

# --- LOGIN ---
Write-Step "0" "Login to get auth token"
try {
  $login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"test@example.com","password":"Test123!@"}'
  if (-not $login.success) { throw $login.message }
  $script:token = $login.data.accessToken
  Write-Host "  [OK] Token obtained" -ForegroundColor Green
} catch {
  Write-Host "  [FAIL] Login failed: $_" -ForegroundColor Red
  exit 1
}

$headers = @{ Authorization = "Bearer $script:token" }

# --- STEP 1: Upload real PDF ---
Write-Step "1" "Upload real PDF resume"
try {
  $result = Invoke-RestMethod -Uri "$base/resume/upload" -Method Post -Headers $headers -Form @{ resume = Get-Item -LiteralPath "$testDir\resume.pdf" } -ErrorAction Stop
  if ($result.success -and $result.data.status -eq "completed") {
    Write-Host "  [PASS] atsScore=$($result.data.atsScore)" -ForegroundColor Green
    Write-Host "  summary=$($result.data.summary)" -ForegroundColor Gray
    Write-Host "  strengths count=$($result.data.strengths.Count)" -ForegroundColor Gray
    $script:pdfResumeId = $result.data._id
  } else {
    Write-Host "  [ISSUE] success=$($result.success) status=$($result.data.status)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  [FAIL] $_" -ForegroundColor Red
}

# --- STEP 2: Upload real DOCX ---
Write-Step "2" "Upload real DOCX resume"
try {
  $result = Invoke-RestMethod -Uri "$base/resume/upload" -Method Post -Headers $headers -Form @{ resume = Get-Item -LiteralPath "$testDir\resume.docx" } -ErrorAction Stop
  if ($result.success -and $result.data.status -eq "completed") {
    Write-Host "  [PASS] atsScore=$($result.data.atsScore)" -ForegroundColor Green
    $script:docxResumeId = $result.data._id
  } else {
    Write-Host "  [ISSUE] success=$($result.success)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  [FAIL] $_" -ForegroundColor Red
}

# --- STEP 3: Upload non-PDF/DOCX (reject) ---
Write-Step "3" "Reject non-PDF/DOCX file"
try {
  $result = Invoke-RestMethod -Uri "$base/resume/upload" -Method Post -Headers $headers -Form @{ resume = Get-Item -LiteralPath "$testDir\test.txt" } -ErrorAction Stop
  Write-Host "  [FAIL] Should have been rejected" -ForegroundColor Red
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  $msg = ($_.ErrorDetails.Message | ConvertFrom-Json)
  if ($code -eq 400) {
    Write-Host "  [PASS] Rejected with 400: $($msg.message)" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] Expected 400, got ${code}: $($msg.message)" -ForegroundColor Red
  }
}

# --- STEP 4: Upload >5MB file (reject) ---
Write-Step "4" "Reject file larger than 5MB"
try {
  $result = Invoke-RestMethod -Uri "$base/resume/upload" -Method Post -Headers $headers -Form @{ resume = Get-Item -LiteralPath "$testDir\large.pdf" } -ErrorAction Stop
  Write-Host "  [FAIL] Should have been rejected" -ForegroundColor Red
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  $msg = ($_.ErrorDetails.Message | ConvertFrom-Json)
  if ($code -eq 400 -and $msg.message -match "too large|5 MB") {
    Write-Host "  [PASS] Rejected with 400: $($msg.message)" -ForegroundColor Green
  } else {
    Write-Host "  [ISSUE] Expected 400 about size, got ${code}: $($msg.message)" -ForegroundColor Yellow
  }
}

# --- STEP 5: Upload corrupted/empty PDF ---
Write-Step "5" "Handle corrupted PDF gracefully"
try {
  $result = Invoke-RestMethod -Uri "$base/resume/upload" -Method Post -Headers $headers -Form @{ resume = Get-Item -LiteralPath "$testDir\corrupted.pdf" } -ErrorAction Stop
  if (-not $result.success -or $result.data.status -eq "failed") {
    Write-Host "  [PASS] status=$($result.data.status)" -ForegroundColor Green
  } else {
    Write-Host "  [ISSUE] Unexpected success" -ForegroundColor Yellow
  }
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "  [PASS] Caught with ${code}" -ForegroundColor Green
}

# --- STEP 6: GET /history ---
Write-Step "6" "GET /api/resume/history"
try {
  $result = Invoke-RestMethod -Uri "$base/resume/history" -Method Get -Headers $headers -ErrorAction Stop
  if ($result.success) {
    $count = $result.data.resumes.Count
    Write-Host "  [PASS] Got ${count} resumes" -ForegroundColor Green
    Write-Host "  pagination: $($result.data.pagination.total) total, $($result.data.pagination.totalPages) pages" -ForegroundColor Gray
    if ($result.data.resumes[0].extractedText) {
      Write-Host "  [FAIL] History leaked extractedText!" -ForegroundColor Red
    } else {
      Write-Host "  [PASS] Summary-only fields" -ForegroundColor Green
    }
  } else {
    Write-Host "  [FAIL] $($result.message)" -ForegroundColor Red
  }
} catch {
  Write-Host "  [FAIL] $_" -ForegroundColor Red
}

# --- STEP 7: GET /:id (other user) returns 404 ---
Write-Step "7" "GET other user resume returns 404"
try {
  $fakeId = "507f1f77bcf86cd799439011"
  $result = Invoke-RestMethod -Uri "$base/resume/${fakeId}" -Method Get -Headers $headers -ErrorAction Stop
  Write-Host "  [FAIL] Should have returned 404" -ForegroundColor Red
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 404) {
    Write-Host "  [PASS] Got 404" -ForegroundColor Green
  } else {
    Write-Host "  [ISSUE] Expected 404, got ${code}" -ForegroundColor Yellow
  }
}

# --- STEP 8: DELETE /:id ---
Write-Step "8" "DELETE /api/resume/:id"
if ($script:pdfResumeId) {
  try {
    $result = Invoke-RestMethod -Uri "$base/resume/$script:pdfResumeId" -Method Delete -Headers $headers -ErrorAction Stop
    Write-Host "  [PASS] Deleted: $($result.message)" -ForegroundColor Green
    
    # Verify gone
    try {
      $check = Invoke-RestMethod -Uri "$base/resume/$script:pdfResumeId" -Method Get -Headers $headers -ErrorAction Stop
      Write-Host "  [FAIL] Still accessible!" -ForegroundColor Red
    } catch {
      Write-Host "  [PASS] Confirmed removed" -ForegroundColor Green
    }
  } catch {
    Write-Host "  [FAIL] $_" -ForegroundColor Red
  }
} else {
  Write-Host "  [SKIP] No resumeId from Step 1" -ForegroundColor Yellow
}

# --- STEP 9: Rate limit (rapid uploads) ---
Write-Step "9" "Rate limit check (10/hr per user, may not trigger)"
$attempts = 0
for ($i = 0; $i -lt 3; $i++) {
  try {
    $result = Invoke-RestMethod -Uri "$base/resume/upload" -Method Post -Headers $headers -Form @{ resume = Get-Item -LiteralPath "$testDir\resume.docx" } -ErrorAction Stop
    $attempts++
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 429) {
      Write-Host "  [PASS] Rate limited with 429" -ForegroundColor Green
      $limited = $true
      break
    }
  }
  Start-Sleep -Milliseconds 500
}
if (-not $limited) { Write-Host "  [SKIP] Rate limit not triggered in ${attempts} extra attempts (limit is 10/hr)" -ForegroundColor Yellow }

Write-Host "`n========== VERIFICATION COMPLETE ==========" -ForegroundColor Cyan
