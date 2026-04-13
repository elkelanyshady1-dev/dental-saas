# run_pipeline.ps1
# ================================================================================
# Boundary-Aware Sampling + Training Test Pipeline
# Steps 6 & 7 from the implementation plan.
#
# Usage:
#   cd dental-saas\python-ai-engine
#   .\run_pipeline.ps1
#
# Prerequisites: Python environment with requirements.txt installed.
# If no real STL data exists, a synthetic dataset will be generated.
# ================================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot   # dental-saas\python-ai-engine

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Boundary-Aware Sampling + Training Test Pipeline" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
$rawCasesDir    = Join-Path $root "dataset\raw_cases"
$datasetDir     = Join-Path $root "datasets\boundary_aware_cases"
$syntheticDir   = Join-Path $root "datasets\synthetic_cases"
$checkpointDir  = Join-Path $root "checkpoints\boundary_test"
$logsDir        = Join-Path $root "logs"

# ---------------------------------------------------------------------------
# STEP 6a — Synthesise dataset if no real STL cases are available
# ---------------------------------------------------------------------------
$hasRealCases = (Test-Path $rawCasesDir) -and `
    ((Get-ChildItem -Path $rawCasesDir -Directory -ErrorAction SilentlyContinue).Count -gt 0)

if (-not $hasRealCases) {
    Write-Host "[STEP 6a] No real STL cases found — generating synthetic dataset..." -ForegroundColor Yellow
    python -m dataset.scripts.make_synthetic_dataset `
        --output_dir $syntheticDir `
        --n_cases   6 `
        --n_points  4096 `
        --n_classes 8

    if ($LASTEXITCODE -ne 0) {
        Write-Error "make_synthetic_dataset FAILED (exit $LASTEXITCODE)"
        exit 1
    }

    Write-Host "[STEP 6a] Synthetic dataset ready at: $syntheticDir" -ForegroundColor Green
    # For the TRAIN step, use the synthetic dataset directly
    $trainDataRoot = $syntheticDir
} else {
    # ---------------------------------------------------------------------------
    # STEP 6b — Rebuild real dataset with --boundary-aware flag
    # ---------------------------------------------------------------------------
    Write-Host "[STEP 6b] Rebuilding dataset with --boundary-aware flag..." -ForegroundColor Yellow

    python -m dataset.scripts.generate_dataset `
        --input_dir  $rawCasesDir `
        --output_dir $datasetDir `
        --boundary-aware `
        --boundary-ratio 0.3 `
        --n_points  10000 `
        --overwrite

    if ($LASTEXITCODE -ne 0) {
        Write-Error "generate_dataset FAILED (exit $LASTEXITCODE)"
        exit 1
    }

    Write-Host "[STEP 6b] Dataset rebuilt at: $datasetDir" -ForegroundColor Green
    $trainDataRoot = $datasetDir
}

# ---------------------------------------------------------------------------
# STEP 7 — Training test (1 epoch)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[STEP 7] Running training test (1 epoch)..." -ForegroundColor Yellow
Write-Host "  data_root  : $trainDataRoot" -ForegroundColor Gray
Write-Host "  output_dir : $checkpointDir" -ForegroundColor Gray
Write-Host "  log_dir    : $logsDir" -ForegroundColor Gray
Write-Host ""

python -m train.train_pointnet `
    --data_root  $trainDataRoot `
    --output_dir $checkpointDir `
    --log_dir    $logsDir `
    --epochs     1 `
    --batch_size 2 `
    --num_points 4096 `
    --num_workers 0 `
    --scheduler  none

if ($LASTEXITCODE -ne 0) {
    Write-Error "train_pointnet FAILED (exit $LASTEXITCODE)"
    exit 1
}

# ---------------------------------------------------------------------------
# Verify outputs
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Verification" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

$metricsFile = Join-Path $logsDir "training_metrics.json"
$statusFile  = Join-Path $logsDir "session_status.json"

if (Test-Path $metricsFile) {
    Write-Host "  [OK] training_metrics.json exists" -ForegroundColor Green
    Get-Content $metricsFile | ConvertFrom-Json | Select-Object -ExpandProperty history | `
        ForEach-Object { Write-Host "       Epoch $($_.epoch): train_loss=$($_.train_loss)" -ForegroundColor Gray }
} else {
    Write-Host "  [MISSING] training_metrics.json not found!" -ForegroundColor Red
}

if (Test-Path $statusFile) {
    Write-Host "  [OK] session_status.json exists" -ForegroundColor Green
    $status = Get-Content $statusFile | ConvertFrom-Json
    Write-Host "       status=$($status.status) epoch=$($status.epoch)/$($status.total_epochs)" -ForegroundColor Gray
} else {
    Write-Host "  [MISSING] session_status.json not found!" -ForegroundColor Red
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Pipeline complete!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
