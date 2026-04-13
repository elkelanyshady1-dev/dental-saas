"""
dashboard_server.py — Upgraded monitoring dashboard for the orthodontic AI engine.

Pages:
    /           Training + Hard Cases dashboard (Steps 8 & 9)
    /viewer     3D point cloud viewer with Dataset Validation mode (Steps 5 & 10)

APIs:
    /api/hard-cases          hard_cases.json
    /api/all-cases           difficulty_report.json
    /api/training-status     training_metrics.json + session_status.json
    /api/dataset-stats       dataset_validation.json summary
    /api/system              live CPU / RAM / GPU metrics
    /api/status              health check

Usage:
    python -m visualization.dashboard_server --log_dir ./logs --port 8080
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import platform
import queue
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional

try:
    from flask import Flask, jsonify, render_template_string, request, send_file, Response
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False

try:
    import numpy as np
    _NP_AVAILABLE = True
except ImportError:
    np = None  # type: ignore[assignment]
    _NP_AVAILABLE = False

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────
# Real-time SSE Log Broadcaster
# ────────────────────────────────────────────────────────────────────────────

# Thread-safe broadcast queue.  Each SSE subscriber drains its own copy.
_LOG_QUEUES: list["queue.Queue[str]"] = []
_LOG_QUEUES_LOCK = threading.Lock()

# ────────────────────────────────────────────────────────────────────────────
# Global Training Process Registry
# ────────────────────────────────────────────────────────────────────────────
# Stores the active training subprocess so it can be monitored and stopped
# from any endpoint.  Only ONE training job runs at a time.

_TRAINING_PROCESS: Optional[subprocess.Popen] = None
_TRAINING_LOCK = threading.Lock()


def broadcast_log(msg: str) -> None:
    """
    Push a log line to every active SSE subscriber.
    Call this from any thread (training loop, dataset pipeline, etc.).
    """
    with _LOG_QUEUES_LOCK:
        dead: list["queue.Queue[str]"] = []
        for q in _LOG_QUEUES:
            try:
                q.put_nowait(msg)
            except queue.Full:
                dead.append(q)  # slow subscriber — drop it
        for q in dead:
            _LOG_QUEUES.remove(q)


class DashboardLogHandler(logging.Handler):
    """
    Attaches to the Python logging system so that every log record
    emitted by any module (training, dataset pipeline, etc.) is
    automatically forwarded to SSE subscribers via broadcast_log().

    Usage (once at startup):
        root_logger = logging.getLogger()
        root_logger.addHandler(DashboardLogHandler())
    """

    LEVEL_PREFIX = {
        logging.DEBUG:    "[DEBUG]",
        logging.INFO:     "[INFO]",
        logging.WARNING:  "[WARN]",
        logging.ERROR:    "[ERROR]",
        logging.CRITICAL: "[ERROR]",
    }

    def emit(self, record: logging.LogRecord) -> None:
        try:
            prefix = self.LEVEL_PREFIX.get(record.levelno, "[INFO]")
            msg = f"{prefix} {self.format(record)}"
            broadcast_log(msg)
        except Exception:
            pass  # never let logging handlers raise


# ─────────────────────────────────────────────────────────────────────────────
# System metrics helper
# ─────────────────────────────────────────────────────────────────────────────

def _get_system_metrics() -> dict:
    out: dict = {"cpu_pct": None, "ram_pct": None, "gpu_pct": None,
                 "gpu_mem_pct": None, "gpu_name": None}
    try:
        import psutil
        out["cpu_pct"] = round(psutil.cpu_percent(interval=0.1), 1)
        vm = psutil.virtual_memory()
        out["ram_pct"] = round(vm.percent, 1)
    except ImportError:
        pass
    try:
        r = subprocess.run(
            ["nvidia-smi",
             "--query-gpu=name,utilization.gpu,memory.used,memory.total",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3
        )
        if r.returncode == 0:
            parts = [p.strip() for p in r.stdout.strip().split(",")]
            if len(parts) >= 4:
                out["gpu_name"] = parts[0]
                out["gpu_pct"] = float(parts[1])
                used, total = float(parts[2]), float(parts[3])
                out["gpu_mem_pct"] = round(100 * used / total, 1) if total else None
    except Exception:
        pass
    return out


# ─────────────────────────────────────────────────────────────────────────────
# HTML — Main Dashboard
# ─────────────────────────────────────────────────────────────────────────────

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orthodontic AI — Dashboard</title>
<style>
  :root{--bg:#0f1117;--surf:#1a1d27;--surf2:#22263a;--accent:#6c63ff;--accent2:#ff6584;--accent3:#43e97b;--text:#e2e8f0;--dim:#94a3b8;--border:#2d3359;--easy:#43e97b;--med:#f6d365;--hard:#f093fb;--vhard:#ff6584;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;}
  header{background:linear-gradient(135deg,#1a1d27,#22263a);border-bottom:1px solid var(--border);padding:18px 32px;display:flex;align-items:center;gap:14px;}
  header h1{font-size:19px;font-weight:700;}
  header .sub{color:var(--dim);font-size:12px;}
  .badge{background:var(--accent);color:#fff;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:600;}
  nav{margin-left:auto;display:flex;gap:10px;align-items:center;}
  .nav-btn{background:var(--surf2);border:1px solid var(--border);color:var(--text);padding:7px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;text-decoration:none;transition:.2s;}
  .nav-btn:hover{background:var(--accent);border-color:var(--accent);}
  .main{padding:28px 32px;flex:1;}

  /* Stat cards */
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px;}
  .card{background:var(--surf);border:1px solid var(--border);border-radius:12px;padding:18px;position:relative;overflow:hidden;transition:.2s;}
  .card:hover{transform:translateY(-2px);box-shadow:0 8px 24px #0004;}
  .card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2));}
  .card-label{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
  .card-val{font-size:26px;font-weight:800;}
  .card-sub{font-size:11px;color:var(--dim);margin-top:3px;}

  /* Training progress */
  .progress-wrap{background:var(--surf);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:24px;}
  .progress-title{font-size:15px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:10px;}
  .progress-bar-bg{background:var(--surf2);border-radius:8px;height:12px;overflow:hidden;margin-bottom:12px;}
  .progress-bar{height:100%;border-radius:8px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .6s;}
  .progress-meta{display:flex;gap:24px;flex-wrap:wrap;}
  .progress-item{display:flex;flex-direction:column;gap:2px;}
  .progress-key{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.4px;}
  .progress-val{font-size:16px;font-weight:700;}

  /* System metrics */
  .sys-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:12px;}
  .sys-item{background:var(--surf2);border-radius:8px;padding:12px;}
  .sys-label{font-size:11px;color:var(--dim);margin-bottom:4px;}
  .sys-bar-bg{background:var(--border);height:6px;border-radius:3px;overflow:hidden;margin-top:4px;}
  .sys-bar{height:100%;border-radius:3px;transition:width .8s;}

  /* 2-col grid */
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:22px;}
  @media(max-width:860px){.grid2{grid-template-columns:1fr;}}
  .panel{background:var(--surf);border:1px solid var(--border);border-radius:16px;padding:22px;}
  .panel-title{font-size:15px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;}

  /* Hard cases */
  .case-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;margin-bottom:6px;background:var(--surf2);border:1px solid var(--border);transition:.15s;}
  .case-item:hover{background:#2a2f4a;}
  .case-rank{width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
  .case-name{font-weight:600;font-size:13px;flex:1;}
  .case-meta{color:var(--dim);font-size:11px;margin-top:1px;}
  .difficulty-bar-bg{height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-top:4px;}
  .difficulty-bar{height:100%;border-radius:3px;transition:width .4s;}

  /* Dataset explorer */
  .ds-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);}
  .ds-row:last-child{border-bottom:none;}
  .ds-key{font-size:13px;color:var(--dim);}
  .ds-val{font-size:13px;font-weight:700;}
  .cls-bar-wrap{display:flex;align-items:center;gap:8px;margin-top:2px;}
  .cls-bar-bg{flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;}
  .cls-bar{height:100%;border-radius:4px;}
  .warn-tag{background:rgba(246,211,101,.15);color:var(--med);border:1px solid rgba(246,211,101,.3);border-radius:4px;padding:2px 8px;font-size:11px;margin:2px;}

  /* Distribution chart */
  .dist-chart{display:flex;gap:8px;align-items:flex-end;height:90px;}
  .dist-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;}
  .dist-bar{width:100%;border-radius:4px 4px 0 0;transition:height .4s;min-height:3px;}
  .dist-label{font-size:10px;color:var(--dim);}
  .dist-count{font-size:11px;font-weight:600;}

  /* Tier badges */
  .tier{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:700;text-transform:uppercase;}
  .tier-easy{background:rgba(67,233,123,.15);color:var(--easy);}
  .tier-medium{background:rgba(246,211,101,.15);color:var(--med);}
  .tier-hard{background:rgba(240,147,251,.15);color:var(--hard);}
  .tier-very_hard{background:rgba(255,101,132,.15);color:var(--vhard);}

  .refresh-btn{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;border:none;padding:9px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:.2s;}
  .refresh-btn:hover{opacity:.85;transform:translateY(-1px);}
  .empty{text-align:center;padding:32px;color:var(--dim);}
  .spin{width:22px;height:22px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px;}
  @keyframes spin{to{transform:rotate(360deg)}}
  footer{text-align:center;color:var(--dim);font-size:11px;padding:18px;border-top:1px solid var(--border);}

  /* ── Action Log / Developer Console ──────────────────────────── */
  .action-log-container{background:var(--surf);border:1px solid var(--border);border-radius:16px;padding:0;margin-bottom:24px;overflow:hidden;height:320px;min-height:250px;resize:vertical;display:flex;flex-direction:column;}
  .action-log-header{display:flex;align-items:center;gap:8px;padding:14px 18px 0;flex-shrink:0;}
  .action-log-title{font-size:15px;font-weight:700;flex:1;display:flex;align-items:center;gap:8px;}
  .al-dot{width:9px;height:9px;border-radius:50%;background:#43e97b;box-shadow:0 0 6px #43e97b;animation:pulse-dot 2s infinite;}
  @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.4}}
  .action-log-toolbar{display:flex;align-items:center;gap:6px;padding:10px 18px;flex-shrink:0;border-bottom:1px solid var(--border);flex-wrap:wrap;}
  .al-btn{background:var(--surf2);border:1px solid var(--border);color:var(--text);padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:.15s;white-space:nowrap;}
  .al-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff;}
  .al-sep{width:1px;height:20px;background:var(--border);margin:0 2px;}
  .al-filter-group{display:flex;gap:4px;margin-left:auto;}
  .al-filter{background:var(--surf2);border:1px solid var(--border);color:var(--dim);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;transition:.15s;user-select:none;}
  .al-filter.active-info{background:rgba(108,99,255,.18);border-color:var(--accent);color:var(--accent);}
  .al-filter.active-warn{background:rgba(246,211,101,.15);border-color:#f6d365;color:#f6d365;}
  .al-filter.active-error{background:rgba(255,101,132,.15);border-color:#ff6584;color:#ff6584;}
  .action-log{font-family:'JetBrains Mono','Fira Mono','Consolas',monospace;font-size:12.5px;background:#0b0f16;color:#d6e2ff;padding:14px;overflow-y:auto;flex:1;line-height:1.65;}
  .action-log .al-info{color:#d6e2ff;}
  .action-log .al-warn{color:#f6d365;}
  .action-log .al-error{color:#ff6b6b;font-weight:600;}
  .action-log .al-success{color:#43e97b;}
  .action-log .al-muted{color:#4a5568;}
  .al-ts{color:#3d4f6e;margin-right:6px;font-size:11px;}
  .al-level{margin-right:6px;font-size:11px;letter-spacing:.3px;}
  .fullscreen-log{position:fixed!important;left:20px!important;right:20px!important;bottom:20px!important;top:80px!important;z-index:9999;height:auto!important;border-radius:12px;box-shadow:0 24px 64px #000a;}
</style>
</head>
<body>
<header>
  <div style="font-size:26px">🦷</div>
  <div><h1>Orthodontic AI Engine</h1><div class="sub">Training & Dataset Dashboard</div></div>
  <nav>
    <a href="/viewer" class="nav-btn">🔬 3D Viewer</a>
    <span class="badge" id="status-badge">Loading...</span>
    <button class="refresh-btn" onclick="loadAll()">🔄 Refresh</button>
  </nav>
</header>

<div class="main">

  <!-- Stat cards -->
  <div class="cards">
    <div class="card"><div class="card-label">Epoch</div><div class="card-val" id="c-epoch">—</div><div class="card-sub" id="c-epoch-sub">of — epochs</div></div>
    <div class="card"><div class="card-label">Train Loss</div><div class="card-val" id="c-loss">—</div><div class="card-sub">last epoch</div></div>
    <div class="card"><div class="card-label">Val Loss</div><div class="card-val" id="c-vloss">—</div><div class="card-sub">last epoch</div></div>
    <div class="card"><div class="card-label">Best Metric</div><div class="card-val" id="c-best">—</div><div class="card-sub">val loss</div></div>
    <div class="card"><div class="card-label">Dataset Cases</div><div class="card-val" id="c-cases">—</div><div class="card-sub" id="c-cases-sub">—</div></div>
    <div class="card"><div class="card-label">Hard Cases</div><div class="card-val" id="c-hard">—</div><div class="card-sub">difficulty flagged</div></div>
  </div>

  <!-- Training progress -->
  <div class="progress-wrap">
    <div class="progress-title">⚡ Training Progress</div>
    <div class="progress-bar-bg"><div class="progress-bar" id="train-bar" style="width:0%"></div></div>
    <div class="progress-meta">
      <div class="progress-item"><div class="progress-key">Progress</div><div class="progress-val" id="p-pct">—</div></div>
      <div class="progress-item"><div class="progress-key">ETA</div><div class="progress-val" id="p-eta">—</div></div>
      <div class="progress-item"><div class="progress-key">LR</div><div class="progress-val" id="p-lr">—</div></div>
      <div class="progress-item"><div class="progress-key">mIoU</div><div class="progress-val" id="p-miou">—</div></div>
      <div class="progress-item"><div class="progress-key">Status</div><div class="progress-val" id="p-status">—</div></div>
    </div>
    <!-- System metrics -->
    <div class="sys-row" id="sys-row">
      <div class="sys-item"><div class="sys-label">CPU</div><div id="sys-cpu-val">—</div><div class="sys-bar-bg"><div class="sys-bar" id="sys-cpu-bar" style="width:0%;background:#6c63ff"></div></div></div>
      <div class="sys-item"><div class="sys-label">RAM</div><div id="sys-ram-val">—</div><div class="sys-bar-bg"><div class="sys-bar" id="sys-ram-bar" style="width:0%;background:#43e97b"></div></div></div>
      <div class="sys-item"><div class="sys-label">GPU</div><div id="sys-gpu-val">—</div><div class="sys-bar-bg"><div class="sys-bar" id="sys-gpu-bar" style="width:0%;background:#ff6584"></div></div></div>
      <div class="sys-item"><div class="sys-label">GPU Mem</div><div id="sys-gmem-val">—</div><div class="sys-bar-bg"><div class="sys-bar" id="sys-gmem-bar" style="width:0%;background:#f6d365"></div></div></div>
    </div>
  </div>

  <div class="grid2">
    <!-- Hard cases list -->
    <div class="panel">
      <div class="panel-title">🔥 Hardest Cases</div>
      <div id="hard-case-list"><div class="empty"><div class="spin"></div>Loading...</div></div>
    </div>

    <!-- Dataset Explorer -->
    <div>
      <div class="panel" style="margin-bottom:20px">
        <div class="panel-title">📂 Dataset Explorer</div>
        <div id="ds-explorer"><div class="empty"><div class="spin"></div>Loading...</div></div>
      </div>
      <div class="panel">
        <div class="panel-title">📊 Difficulty Distribution</div>
        <div class="dist-chart">
          <div class="dist-bar-wrap"><div class="dist-bar" style="background:var(--easy);height:0px" id="db-easy"></div><div class="dist-count" id="dc-easy">0</div><div class="dist-label">Easy</div></div>
          <div class="dist-bar-wrap"><div class="dist-bar" style="background:var(--med);height:0px" id="db-med"></div><div class="dist-count" id="dc-med">0</div><div class="dist-label">Medium</div></div>
          <div class="dist-bar-wrap"><div class="dist-bar" style="background:var(--hard);height:0px" id="db-hard"></div><div class="dist-count" id="dc-hard">0</div><div class="dist-label">Hard</div></div>
          <div class="dist-bar-wrap"><div class="dist-bar" style="background:var(--vhard);height:0px" id="db-vhard"></div><div class="dist-count" id="dc-vhard">0</div><div class="dist-label">Very Hard</div></div>
        </div>
      </div>
    </div>
  </div>
</div>

  <!-- Dataset Manager Panel -->
  <div class="panel" style="margin-bottom:24px">
    <div class="panel-title">🗄 Dataset Manager
      <span style="margin-left:auto;font-size:11px;font-weight:400;color:var(--dim)" id="dm-version-badge"></span>
    </div>
    <!-- Stat row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:18px">
      <div class="sys-item">
        <div class="sys-label">Real Cases</div>
        <div style="font-size:20px;font-weight:700" id="dm-processed">—</div>
      </div>
      <div class="sys-item">
        <div class="sys-label">Synthetic</div>
        <div style="font-size:20px;font-weight:700" id="dm-synthetic">—</div>
      </div>
      <div class="sys-item">
        <div class="sys-label">Pseudo</div>
        <div style="font-size:20px;font-weight:700" id="dm-pseudo">—</div>
      </div>
      <div class="sys-item">
        <div class="sys-label">Total Training</div>
        <div style="font-size:20px;font-weight:700" id="dm-total">—</div>
      </div>
      <div class="sys-item">
        <div class="sys-label">Dataset v</div>
        <div style="font-size:20px;font-weight:700" id="dm-dsver">—</div>
      </div>
      <div class="sys-item">
        <div class="sys-label">Snapshots</div>
        <div style="font-size:20px;font-weight:700" id="dm-snapshots">—</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--dim);margin-bottom:8px" id="dm-last-rebuild">Last rebuild: —</div>
    <div style="font-size:11px;color:var(--dim);margin-bottom:16px" id="dm-model-ver">Active model: —</div>
    <!-- Action buttons -->
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button id="btn-rebuild" onclick="dmRebuild()"
        style="background:linear-gradient(90deg,#6c63ff,#9f7afa);border:none;color:#fff;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:.2s">
        🔄 Rebuild Dataset
      </button>
      <button id="btn-backup" onclick="dmBackup()"
        style="background:linear-gradient(90deg,#43e97b,#38f9d7);border:none;color:#111;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:.2s">
        💾 Backup Dataset
      </button>
      <button id="btn-train" onclick="dmTrain()"
        style="background:linear-gradient(90deg,#f093fb,#f5576c);border:none;color:#fff;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:.2s">
        ⚡ Train on Updated Dataset
      </button>
      <button id="btn-stop-train" onclick="dmStopTraining()" style="display:none;background:linear-gradient(90deg,#ff4444,#cc0000);border:none;color:#fff;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:.2s">
        🛑 Stop Training
      </button>
    </div>
    <div id="dm-msg" style="margin-top:12px;font-size:12px;display:none;padding:10px 14px;border-radius:8px"></div>
    <!-- Version history mini-table -->
    <div id="dm-history" style="margin-top:18px"></div>
  </div>

  <!-- ══ Live 3D AI Segmentation Preview ══════════════════════════════════ -->
  <div class="panel" id="preview-panel" style="margin-bottom:24px">
    <div class="panel-title" style="display:flex;align-items:center;gap:10px">
      <span>🧠 Live AI Segmentation Preview</span>
      <span id="preview-epoch-badge" style="font-size:11px;font-weight:400;color:var(--dim);margin-left:auto"></span>
      <span id="preview-ts-badge" style="font-size:11px;font-weight:400;color:var(--dim)"></span>
      <select id="preview-interval-select" title="Preview fetch interval"
        style="background:var(--surf2);border:1px solid var(--border);color:var(--dim);padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer">
        <option value="5000">Poll: 5s</option>
        <option value="10000" selected>Poll: 10s</option>
        <option value="30000">Poll: 30s</option>
        <option value="60000">Poll: 60s</option>
      </select>
    </div>
    <div style="position:relative;width:100%;background:#060a10;border-radius:10px;overflow:hidden" id="preview-canvas-wrap">
      <canvas id="preview-canvas" style="display:block;width:100%;height:320px" width="800" height="320"></canvas>
      <!-- Empty / loading overlay -->
      <div id="preview-overlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(6,10,16,.88);border-radius:10px;pointer-events:none">
        <div style="font-size:38px;margin-bottom:10px">🦷</div>
        <div style="font-size:13px;color:var(--dim)">No preview yet — waiting for training to generate one…</div>
        <div style="font-size:11px;color:#3d4f6e;margin-top:6px">Preview updates every N epochs (configurable via <code>--preview_interval</code>)</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center">
      <div id="preview-legend" style="display:flex;flex-wrap:wrap;gap:6px;flex:1"></div>
      <div style="font-size:11px;color:var(--dim)" id="preview-pts-badge"></div>
    </div>
  </div>

  <!-- ══ Developer Action Log Console ══════════════════════════════════ -->
  <div class="action-log-container" id="action-log-container">
    <div class="action-log-header">
      <div class="action-log-title">
        <span class="al-dot"></span>⌨ Action Log
        <span style="font-size:11px;font-weight:400;color:var(--dim)" id="al-count">0 lines</span>
      </div>
    </div>
    <div class="action-log-toolbar">
      <button class="al-btn" id="copy-log" title="Copy all log lines to clipboard">📋 Copy</button>
      <button class="al-btn" id="clear-log" title="Clear log">🧹 Clear</button>
      <button class="al-btn" id="download-log" title="Download as .txt">⬇ Download</button>
      <button class="al-btn" id="expand-log" title="Toggle fullscreen">⤢ Expand</button>
      <div class="al-sep"></div>

      <div class="al-filter-group">
        <button class="al-filter active-info" id="f-info"  data-level="INFO">INFO</button>
        <button class="al-filter active-warn" id="f-warn"  data-level="WARN">WARN</button>
        <button class="al-filter active-error" id="f-error" data-level="ERROR">ERROR</button>
      </div>
    </div>
    <div class="action-log" id="action-log"></div>
  </div>

<footer>Orthodontic AI Engine · Auto-refreshes every 5s</footer>

<script>
async function j(url){const r=await fetch(url);if(!r.ok)throw new Error(r.statusText);return r.json();}

function pct(v){return v!=null?v.toFixed(1)+'%':'—';}
function fmt(v,d=3){return v!=null?v.toFixed(d):'—';}
function eta(secPerEpoch, remaining){
  if(!secPerEpoch||!remaining) return '—';
  const s = Math.round(secPerEpoch * remaining);
  if(s<60) return s+'s';
  if(s<3600) return Math.round(s/60)+'m';
  return (s/3600).toFixed(1)+'h';
}

async function loadTraining(){
  try{
    const t = await j('/api/training-status');
    const s = t.session||{}, h = t.history||[];
    const ep = s.epoch||0, total = s.total_epochs||0;
    document.getElementById('c-epoch').textContent = ep;
    document.getElementById('c-epoch-sub').textContent = 'of '+total+' epochs';
    const pctVal = s.progress_pct||0;
    document.getElementById('train-bar').style.width = pctVal+'%';
    document.getElementById('p-pct').textContent = pctVal.toFixed(1)+'%';
    document.getElementById('p-status').textContent = (s.status||'—').toUpperCase();
    document.getElementById('c-best').textContent = fmt(s.best_val_metric);

    if(h.length){
      const last=h[h.length-1];
      document.getElementById('c-loss').textContent = fmt(last.train_loss||last.train_total);
      document.getElementById('c-vloss').textContent = fmt(last.val_loss||last.val_total);
      document.getElementById('p-lr').textContent = (last.lr||0).toExponential(1);
      document.getElementById('p-miou').textContent = last.train_mIoU!=null?last.train_mIoU.toFixed(3):'—';
      // ETA
      const secPerEpoch = last.elapsed_s||0;
      document.getElementById('p-eta').textContent = eta(secPerEpoch, total-ep);
    }

    // Status badge
    const badge = document.getElementById('status-badge');
    badge.textContent = s.status==='done'?'Done':s.status==='running'?'Training':'Idle';
    badge.style.background = s.status==='done'?'#43e97b':s.status==='running'?'#6c63ff':'#94a3b8';
  }catch(e){console.warn('training-status:',e.message);}
}

async function loadSystem(){
  try{
    const s = await j('/api/system');
    const items=[
      ['cpu','sys-cpu-val','sys-cpu-bar',s.cpu_pct,'#6c63ff'],
      ['ram','sys-ram-val','sys-ram-bar',s.ram_pct,'#43e97b'],
      ['gpu','sys-gpu-val','sys-gpu-bar',s.gpu_pct,'#ff6584'],
      ['gmem','sys-gmem-val','sys-gmem-bar',s.gpu_mem_pct,'#f6d365'],
    ];
    items.forEach(([,vid,bid,val,col])=>{
      document.getElementById(vid).textContent = val!=null?val.toFixed(1)+'%':'N/A';
      document.getElementById(bid).style.width = (val||0)+'%';
      document.getElementById(bid).style.background = col;
    });
  }catch(e){}
}

async function loadHardCases(){
  try{
    const [hc,all] = await Promise.all([j('/api/hard-cases'),j('/api/all-cases')]);
    document.getElementById('c-hard').textContent = hc.length;

    // Hard cases list
    const el = document.getElementById('hard-case-list');
    if(!hc.length){el.innerHTML='<div class="empty">No hard cases yet.<br>Run mining script to populate.</div>';return;}
    const TIER={easy:'#43e97b',medium:'#f6d365',hard:'#f093fb',very_hard:'#ff6584'};
    el.innerHTML = hc.slice(0,12).map((c,i)=>`
      <div class="case-item">
        <div class="case-rank">${i+1}</div>
        <div style="flex:1">
          <div class="case-name">${c.case}</div>
          <div class="case-meta">IoU ${(c.mean_iou||0).toFixed(3)} · diff ${c.difficulty.toFixed(3)}</div>
          <div class="difficulty-bar-bg"><div class="difficulty-bar" style="width:${Math.round(c.difficulty*100)}%;background:${TIER[c.tier||'hard']}"></div></div>
        </div>
        <span class="tier tier-${c.tier||'hard'}">${(c.tier||'hard').replace('_',' ')}</span>
      </div>`).join('');

    // Distribution
    const tiers={easy:0,medium:0,hard:0,very_hard:0};
    all.forEach(c=>{const t=c.tier||'hard';if(t in tiers)tiers[t]++;});
    const mx=Math.max(...Object.values(tiers),1);
    document.getElementById('db-easy').style.height=Math.round(tiers.easy/mx*80)+'px';
    document.getElementById('db-med').style.height=Math.round(tiers.medium/mx*80)+'px';
    document.getElementById('db-hard').style.height=Math.round(tiers.hard/mx*80)+'px';
    document.getElementById('db-vhard').style.height=Math.round(tiers.very_hard/mx*80)+'px';
    document.getElementById('dc-easy').textContent=tiers.easy;
    document.getElementById('dc-med').textContent=tiers.medium;
    document.getElementById('dc-hard').textContent=tiers.hard;
    document.getElementById('dc-vhard').textContent=tiers.very_hard;
  }catch(e){console.warn('hard-cases:',e.message);}
}

async function loadDataset(){
  try{
    const ds = await j('/api/dataset-stats');
    const el = document.getElementById('ds-explorer');
    if(!ds||!ds.total_cases){el.innerHTML='<div class="empty">No dataset validation data.<br>Run validate_dataset.py first.</div>';return;}
    document.getElementById('c-cases').textContent = ds.total_cases;
    document.getElementById('c-cases-sub').textContent = ds.valid_cases+' valid';
    const gPct=Math.round((ds.avg_gingiva_ratio||0)*100);
    const tPct=100-gPct;
    const warns=(ds.warning_cases||0);
    el.innerHTML=`
      <div class="ds-row"><span class="ds-key">Total cases</span><span class="ds-val">${ds.total_cases}</span></div>
      <div class="ds-row"><span class="ds-key">Valid cases</span><span class="ds-val">${ds.valid_cases}</span></div>
      <div class="ds-row"><span class="ds-key">Avg points</span><span class="ds-val">${(ds.avg_points||0).toLocaleString()}</span></div>
      <div class="ds-row"><span class="ds-key">Tooth classes</span><span class="ds-val">${ds.n_detected_tooth_classes||0}</span></div>
      <div class="ds-row"><span class="ds-key">Sampling</span><span class="ds-val">${(ds.sampling_methods||[]).join(', ')||'—'}</span></div>
      <div class="ds-row"><span class="ds-key">Gingiva / Teeth</span>
        <div style="min-width:140px">
          <div class="cls-bar-wrap"><span style="width:36px;font-size:11px;color:var(--dim)">${gPct}%</span><div class="cls-bar-bg"><div class="cls-bar" style="width:${gPct}%;background:#f093fb"></div></div></div>
          <div class="cls-bar-wrap"><span style="width:36px;font-size:11px;color:var(--dim)">${tPct}%</span><div class="cls-bar-bg"><div class="cls-bar" style="width:${tPct}%;background:#43e97b"></div></div></div>
        </div>
      </div>
      ${warns?'<div class="ds-row"><span class="ds-key">Warnings</span><span class="warn-tag">⚠ '+warns+' case(s)</span></div>':''}
    `;
  }catch(e){document.getElementById('ds-explorer').innerHTML='<div class="empty">No dataset stats available.</div>';}
}

async function loadAll(){
  await Promise.all([loadTraining(),loadSystem(),loadHardCases(),loadDataset(),loadDatasetManager()]);
}

/* ── Dataset Manager ─────────────────────────────────────────────────────── */
async function loadDatasetManager(){
  try{
    const s = await j('/api/dataset-manager/status');
    document.getElementById('dm-processed').textContent = s.processed_cases??'—';
    document.getElementById('dm-synthetic').textContent = s.synthetic_cases??'—';
    document.getElementById('dm-pseudo').textContent    = s.pseudo_cases??'—';
    document.getElementById('dm-total').textContent     = s.total_training??'—';
    document.getElementById('dm-dsver').textContent     = s.dataset_version?'v'+s.dataset_version:'—';
    document.getElementById('dm-snapshots').textContent = s.snapshots??'—';
    document.getElementById('dm-last-rebuild').textContent =
      'Last rebuild: '+(s.last_rebuild?s.last_rebuild.slice(0,16).replace('T',' '):'—');
    document.getElementById('dm-model-ver').textContent =
      'Active model: '+(s.model_version||'—');
    document.getElementById('dm-version-badge').textContent =
      s.dataset_version?'Dataset v'+s.dataset_version+' · '+
      (s.total_training||0)+' cases':'';
  }catch(e){console.warn('dm-status:',e.message);}

  // Version history mini-table
  try{
    const h = await j('/api/dataset-manager/versions');
    const hist = (h.history||[]).slice().reverse().slice(0,5);
    if(hist.length){
      document.getElementById('dm-history').innerHTML=
        '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Recent Dataset Versions</div>'+
        '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
        hist.map(v=>`<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:5px 0;color:var(--accent);font-weight:700">v${v.version}</td>
          <td style="padding:5px 8px">${v.timestamp?v.timestamp.slice(0,10):''}</td>
          <td style="padding:5px 8px">${v.cases} cases</td>
          <td style="padding:5px 8px;color:var(--dim)">${v.notes||''}</td>
          <td style="padding:5px 0;color:var(--accent3);font-size:11px">${v.model_version||''}</td>
        </tr>`).join('')+
        '</table>';
    }
  }catch(e){}
}

function dmMsg(text,ok){
  const el=document.getElementById('dm-msg');
  el.style.display='block';
  el.style.background=ok?'rgba(67,233,123,.12)':'rgba(255,101,132,.12)';
  el.style.border='1px solid '+(ok?'rgba(67,233,123,.3)':'rgba(255,101,132,.3)');
  el.style.color=ok?'#43e97b':'#ff6584';
  el.textContent=text;
  setTimeout(()=>{el.style.display='none';},8000);
}

async function dmRebuild(){
  document.getElementById('btn-rebuild').disabled=true;
  document.getElementById('btn-rebuild').textContent='⏳ Rebuilding...';
  try{
    const r=await fetch('/api/dataset-manager/rebuild',{method:'POST'});
    const d=await r.json();
    if(d.success){
      dmMsg(`✓ Dataset rebuilt: ${d.total_cases} cases (v${d.dataset_version}) in ${d.elapsed_s?.toFixed(1)}s. Snapshot: ${d.snapshot}`,true);
      loadDatasetManager();
    } else { dmMsg('✗ Rebuild failed: '+(d.error||'Unknown error'),false); }
  }catch(e){dmMsg('✗ '+e.message,false);}
  document.getElementById('btn-rebuild').disabled=false;
  document.getElementById('btn-rebuild').textContent='🔄 Rebuild Dataset';
}

async function dmBackup(){
  document.getElementById('btn-backup').disabled=true;
  document.getElementById('btn-backup').textContent='⏳ Backing up...';
  try{
    const r=await fetch('/api/dataset-manager/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'dashboard'})});
    const d=await r.json();
    if(d.success){
      dmMsg(`✓ Backup created: ${d.snapshot} (${d.total_snapshots} total snapshots)`,true);
      loadDatasetManager();
    } else { dmMsg('✗ Backup failed: '+(d.error||'Unknown error'),false); }
  }catch(e){dmMsg('✗ '+e.message,false);}
  document.getElementById('btn-backup').disabled=false;
  document.getElementById('btn-backup').textContent='💾 Backup Dataset';
}

async function dmTrain(){
  const epochs=parseInt(prompt('Number of incremental training epochs?','50')||'50');
  if(!epochs||epochs<1)return;
  const rebuild=confirm('Rebuild dataset from all sources before training?');
  document.getElementById('btn-train').disabled=true;
  document.getElementById('btn-train').textContent='⏳ Launching...';
  try{
    const r=await fetch('/api/dataset-manager/train',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({epochs,rebuild})});
    const d=await r.json();
    if(d.success){
      dmMsg(`✓ Training started (pid=${d.pid}, epochs=${epochs}). Check session_status.json for progress.`,true);
    } else if(d.status==='already_running'){
      dmMsg(`⚠ Training already running (pid=${d.pid}).`,false);
    } else { dmMsg('✗ Train failed: '+(d.error||d.message||'Unknown error'),false); }
  }catch(e){dmMsg('✗ '+e.message,false);}
  document.getElementById('btn-train').disabled=false;
  document.getElementById('btn-train').textContent='⚡ Train on Updated Dataset';
  pollTrainingProcess();
}

/* ── Stop Training ──────────────────────────────────────────────────────── */
async function dmStopTraining(){
  const stopBtn=document.getElementById('btn-stop-train');
  if(stopBtn){stopBtn.disabled=true;stopBtn.textContent='⏳ Stopping...';}
  try{
    const r=await fetch('/api/action/stop_training',{method:'POST'});
    const d=await r.json();
    if(d.status==='stopped'){
      dmMsg('🛑 Training stopped (pid='+d.pid+', exit='+d.exit_code+')',true);
      alSuccess('Training stopped — pid='+d.pid);
    } else if(d.status==='no_process'){
      dmMsg('ℹ No training process was running.',false);
      alWarn('Stop training: no process registered.');
    } else if(d.status==='already_stopped'){
      dmMsg('ℹ Training had already finished (exit='+d.exit_code+').',false);
      alInfo('Training already stopped (exit='+d.exit_code+')');
    } else if(d.status==='error'){
      dmMsg('✗ Error stopping training: '+d.message,false);
      alError('Stop training error: '+d.message);
    }
  }catch(e){
    dmMsg('✗ Stop training failed: '+e.message,false);
    alError('Stop training fetch failed: '+e.message);
    console.error('Stop training failed:',e);
  }
  if(stopBtn){stopBtn.disabled=false;stopBtn.textContent='🛑 Stop Training';}
  pollTrainingProcess();
}

/* ── Training Process Status Poller ────────────────────────────────────── */
async function pollTrainingProcess(){
  try{
    const r=await fetch('/api/action/training_process_status');
    const d=await r.json();
    const stopBtn=document.getElementById('btn-stop-train');
    const trainBtn=document.getElementById('btn-train');
    if(d.status==='running'){
      if(stopBtn)stopBtn.style.display='inline-flex';
      if(trainBtn){trainBtn.disabled=true;trainBtn.textContent='⚡ Training in progress…';}
    } else {
      if(stopBtn)stopBtn.style.display='none';
      if(trainBtn){trainBtn.disabled=false;trainBtn.textContent='⚡ Train on Updated Dataset';}
    }
  }catch(e){}
}

loadAll();
setInterval(loadAll,5000);
setInterval(loadSystem,2000);
pollTrainingProcess();
setInterval(pollTrainingProcess,3000);

/* ══ Live 3-D Segmentation Preview ═════════════════════════════════════════ */

(function(){
  /* ── Tooth colour palette (label 0 = gingiva, 1–32 = teeth) ──────────── */
  const PALETTE = {
    0:  '#e8a0a0', // gingiva
    1:  '#4ecdc4', 2:  '#45b7d1', 3:  '#96ceb4', 4:  '#ffeaa7',
    5:  '#dda0dd', 6:  '#98d8c8', 7:  '#f7dc6f', 8:  '#a29bfe',
    9:  '#fd79a8', 10: '#00cec9', 11: '#e17055', 12: '#74b9ff',
    13: '#55efc4', 14: '#fdcb6e', 15: '#6c5ce7', 16: '#fab1a0',
    17: '#81ecec', 18: '#ff7675', 19: '#a3cb38', 20: '#1289a7',
    21: '#c4e538', 22: '#d980fa', 23: '#9980fa', 24: '#fd9644',
    25: '#32ff7e', 26: '#18dcff', 27: '#7efff5', 28: '#ffe66d',
    29: '#ff4757', 30: '#2ed573', 31: '#1e90ff', 32: '#eccc68',
  };
  const LABEL_NAMES = {
    0:'Gingiva',1:'UR8',2:'UR7',3:'UR6',4:'UR5',5:'UR4',6:'UR3',7:'UR2',8:'UR1',
    9:'UL1',10:'UL2',11:'UL3',12:'UL4',13:'UL5',14:'UL6',15:'UL7',16:'UL8',
    17:'LL8',18:'LL7',19:'LL6',20:'LL5',21:'LL4',22:'LL3',23:'LL2',24:'LL1',
    25:'LR1',26:'LR2',27:'LR3',28:'LR4',29:'LR5',30:'LR6',31:'LR7',32:'LR8',
  };

  const canvas  = document.getElementById('preview-canvas');
  const overlay = document.getElementById('preview-overlay');
  const epochBadge = document.getElementById('preview-epoch-badge');
  const tsBadge    = document.getElementById('preview-ts-badge');
  const ptsBadge   = document.getElementById('preview-pts-badge');
  const legend     = document.getElementById('preview-legend');
  const intSel     = document.getElementById('preview-interval-select');
  if(!canvas) return;

  const ctx = canvas.getContext('2d');
  let _previewData    = null;  // last fetched data object
  let _angleY         = 0.3;   // auto-orbit angle (radians)
  let _lastEpoch      = -1;
  let _rafId          = null;
  let _pollTimer      = null;
  let _pollInterval   = 10000;

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function hexToRgb(hex){
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return [r,g,b];
  }

  function renderFrame(){
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    if(!_previewData) return;

    const pts   = _previewData.points;
    const lbls  = _previewData.labels;
    const n     = pts.length;

    // Compute bounding box for normalisation
    let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity,zMin=Infinity,zMax=-Infinity;
    for(let i=0;i<n;i++){
      const [x,y,z]=pts[i];
      if(x<xMin)xMin=x; if(x>xMax)xMax=x;
      if(y<yMin)yMin=y; if(y>yMax)yMax=y;
      if(z<zMin)zMin=z; if(z>zMax)zMax=z;
    }
    const cx=(xMin+xMax)/2, cy=(yMin+yMax)/2, cz=(zMin+zMax)/2;
    const scale=Math.max(xMax-xMin,yMax-yMin,zMax-zMin)||1;

    const cosA=Math.cos(_angleY), sinA=Math.sin(_angleY);

    // Project all points to screen space; collect depth for sorting
    const projected = new Array(n);
    for(let i=0;i<n;i++){
      let nx=(pts[i][0]-cx)/scale, ny=(pts[i][1]-cy)/scale, nz=(pts[i][2]-cz)/scale;
      // Rotate around Y axis
      const rx=nx*cosA+nz*sinA, rz=-nx*sinA+nz*cosA;
      // Orthographic projection
      const sx=W*0.5+rx*W*0.43;
      const sy=H*0.5-ny*H*0.43-rz*H*0.08;
      projected[i]={sx,sy,depth:rz,lbl:lbls[i]};
    }

    // Sort back-to-front
    projected.sort((a,b)=>a.depth-b.depth);

    // Draw points
    const R=Math.max(1.2, W/400);
    for(let i=0;i<n;i++){
      const p=projected[i];
      const hex=PALETTE[p.lbl]||PALETTE[0];
      const [r,g,b]=hexToRgb(hex);
      // Depth shading: darker points are further away
      const brightness=0.4+0.6*(1-(p.depth+1)*0.5);
      ctx.fillStyle=`rgb(${Math.round(r*brightness)},${Math.round(g*brightness)},${Math.round(b*brightness)})`;
      ctx.beginPath();
      ctx.arc(p.sx,p.sy,R,0,Math.PI*2);
      ctx.fill();
    }

    _angleY+=0.005; // auto-orbit
    _rafId=requestAnimationFrame(renderFrame);
  }

  function startRender(){
    if(_rafId) cancelAnimationFrame(_rafId);
    renderFrame();
  }

  function updateLegend(data){
    const seen=new Set(data.labels);
    legend.innerHTML='';
    seen.forEach(lbl=>{
      const hex=PALETTE[lbl]||'#888';
      const name=LABEL_NAMES[lbl]||(lbl===0?'Gingiva':`Label ${lbl}`);
      const el=document.createElement('div');
      el.style.cssText=`display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--dim)`;
      el.innerHTML=`<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${hex}"></span>${name}`;
      legend.appendChild(el);
    });
  }

  /* ── fetcher ─────────────────────────────────────────────────────────── */
  async function fetchPreview(){
    try{
      const r=await fetch('/api/preview-mesh');
      if(!r.ok) return;
      const d=await r.json();
      if(!d.points||!d.labels) return;
      if(d.epoch===_lastEpoch) return; // no change, skip re-render
      _lastEpoch=d.epoch;
      _previewData=d;

      // Hide the "no preview" overlay
      if(overlay) overlay.style.display='none';

      // Update badges
      epochBadge.textContent=`Epoch ${d.epoch} / ${d.total_epochs}`;
      tsBadge.textContent=d.timestamp||'';
      ptsBadge.textContent=`${d.n_points||d.points.length} points`;

      // Resize canvas properly
      const wrap=document.getElementById('preview-canvas-wrap');
      if(wrap){canvas.width=wrap.clientWidth||800;}

      updateLegend(d);
      startRender();
    }catch(e){}
  }

  /* ── progress bar fix using session.progress ─────────────────────────── */
  // Hook into existing loadTraining to read 'progress' field
  const _origLoadTrainingPrev = window.loadTraining;
  window.loadTraining = async function(){
    if(_origLoadTrainingPrev) await _origLoadTrainingPrev();
    try{
      const r=await fetch('/api/training-status');
      const t=await r.json();
      const s=t.session||{};
      // Use the new normalised 'progress' field if available
      const bar=document.getElementById('progress-bar');
      if(bar && s.progress!=null){
        bar.style.width=(s.progress*100).toFixed(1)+'%';
      }
    }catch(e){}
  };

  /* ── polling ─────────────────────────────────────────────────────────── */
  function startPolling(){
    if(_pollTimer) clearInterval(_pollTimer);
    _pollTimer=setInterval(fetchPreview,_pollInterval);
    fetchPreview(); // immediate first fetch
  }

  if(intSel){
    intSel.addEventListener('change',()=>{
      _pollInterval=parseInt(intSel.value)||10000;
      startPolling();
    });
  }

  // Start polling once page is ready
  startPolling();
})();

/* ══ Action Log Console ════════════════════════════════════════════════════ */

// Active filter levels
const _alFilters = {INFO:true, WARN:true, ERROR:true};

// Raw log entries [{ts, level, text}]
const _alEntries = [];

function _alNow(){
  const n=new Date();
  return n.toTimeString().slice(0,8);
}

function _alRender(){
  const log=document.getElementById('action-log');
  if(!log)return;
  const visible=_alEntries.filter(e=>_alFilters[e.level]!==false);
  log.innerHTML=visible.map(e=>{
    let cls='al-info';
    if(e.level==='WARN')   cls='al-warn';
    if(e.level==='ERROR')  cls='al-error';
    if(e.level==='SUCCESS')cls='al-success';
    return `<div class="${cls}"><span class="al-ts">${e.ts}</span><span class="al-level">[${e.level}]</span>${e.html}</div>`;
  }).join('');
  log.scrollTop=log.scrollHeight;
  const el=document.getElementById('al-count');
  if(el)el.textContent=_alEntries.length+' line'+((_alEntries.length!==1)?'s':'');
}

/**
 * alog(message, level)
 * Main logging function. level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
 * Automatically highlights key terms.
 */
function alog(msg, level='INFO'){
  const ts=_alNow();
  // Safety-escape then re-apply highlights
  let html = String(msg)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  // Highlight known tokens
  html = html
    .replace(/(case[_\-]?\d+)/gi,'<span style="color:#9f7afa">$1</span>')
    .replace(/(v\d+\.\d+\.\d+|v\d+)/g,'<span style="color:#43e97b">$1</span>')
    .replace(/(\d+(\.\d+)?s)/g,'<span style="color:#f6d365">$1</span>')
    .replace(/(ERROR)/g,'<span style="color:#ff6b6b;font-weight:700">ERROR</span>')
    .replace(/(WARNING|WARN)/g,'<span style="color:#f6d365;font-weight:700">$1</span>')
    .replace(/(✓|pid=\d+|pid:\s*\d+)/g,'<span style="color:#43e97b">$1</span>');
  _alEntries.push({ts,level,html});
  // Keep last 2000 entries
  if(_alEntries.length>2000)_alEntries.splice(0,_alEntries.length-2000);
  _alRender();
}

// Alias helpers
const alInfo    = msg => alog(msg,'INFO');
const alWarn    = msg => alog(msg,'WARN');
const alError   = msg => alog(msg,'ERROR');
const alSuccess = msg => alog(msg,'SUCCESS');

// ── Toolbar buttons ─────────────────────────────────────────────────────────
document.getElementById('copy-log').onclick=()=>{
  const text=_alEntries.map(e=>`[${e.level}] ${e.ts} `+
    e.html.replace(/<[^>]+>/g,'')).join('\n');
  navigator.clipboard.writeText(text)
    .then(()=>alInfo('Log copied to clipboard.'))
    .catch(()=>alWarn('Clipboard write failed — try HTTPS context.'));
};

document.getElementById('clear-log').onclick=()=>{
  _alEntries.length=0;
  _alRender();
  alInfo('Log cleared.');
};

document.getElementById('download-log').onclick=()=>{
  const text=_alEntries.map(e=>`[${e.level}] ${e.ts} `+
    e.html.replace(/<[^>]+>/g,'')).join('\n');
  const blob=new Blob([text],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='dentalmeshnet_log_'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.txt';
  a.click();
  alInfo('Log downloaded.');
};

document.getElementById('expand-log').onclick=()=>{
  const c=document.getElementById('action-log-container');
  const expanded=c.classList.toggle('fullscreen-log');
  document.getElementById('expand-log').textContent=expanded?'✕ Collapse':'⤢ Expand';
};

// ── Filter toggles ───────────────────────────────────────────────────────────
['f-info','f-warn','f-error'].forEach(id=>{
  const btn=document.getElementById(id);
  if(!btn)return;
  const level=btn.dataset.level;
  const activeClass='active-'+level.toLowerCase();
  btn.onclick=()=>{
    _alFilters[level]=!_alFilters[level];
    btn.classList.toggle(activeClass,_alFilters[level]);
    if(!_alFilters[level])btn.style.opacity='.4';
    else btn.style.opacity='';
    _alRender();
  };
});

// ── Auto-capture: wrap existing action fns to echo to log ───────────────────

// Wrap dmRebuild
const _origDmRebuild=window.dmRebuild;
window.dmRebuild=async()=>{
  alInfo('Rebuild Dataset triggered...');
  try{
    const r=await fetch('/api/dataset-manager/rebuild',{method:'POST'});
    const d=await r.json();
    if(d.success){
      alSuccess('Dataset rebuilt: '+d.total_cases+' cases (v'+d.dataset_version+') in '+
        (d.elapsed_s||0).toFixed(1)+'s. Snapshot: '+d.snapshot);
    }else{
      alError('Rebuild failed: '+(d.error||'Unknown error'));
    }
    loadDatasetManager();
    // Also call the original to update UI buttons / dmMsg
    const btn=document.getElementById('btn-rebuild');
    if(btn){btn.disabled=false;btn.textContent='🔄 Rebuild Dataset';}
  }catch(e){
    alError('Rebuild exception: '+e.message);
    const btn=document.getElementById('btn-rebuild');
    if(btn){btn.disabled=false;btn.textContent='🔄 Rebuild Dataset';}
  }
};
document.getElementById('btn-rebuild').onclick=window.dmRebuild;

// Wrap dmBackup
window.dmBackup=async()=>{
  alInfo('Snapshot backup triggered...');
  try{
    const r=await fetch('/api/dataset-manager/backup',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'dashboard'})});
    const d=await r.json();
    if(d.success){
      alSuccess('Backup created: '+d.snapshot+' ('+d.total_snapshots+' total snapshots)');
    }else{
      alError('Backup failed: '+(d.error||'Unknown error'));
    }
    loadDatasetManager();
    const btn=document.getElementById('btn-backup');
    if(btn){btn.disabled=false;btn.textContent='💾 Backup Dataset';}
  }catch(e){
    alError('Backup exception: '+e.message);
    const btn=document.getElementById('btn-backup');
    if(btn){btn.disabled=false;btn.textContent='💾 Backup Dataset';}
  }
};
document.getElementById('btn-backup').onclick=window.dmBackup;

// Wrap dmTrain
window.dmTrain=async()=>{
  const epochs=parseInt(prompt('Number of incremental training epochs?','50')||'50');
  if(!epochs||epochs<1){alWarn('Training cancelled — invalid epoch count.');return;}
  const rebuild=confirm('Rebuild dataset from all sources before training?');
  alInfo('Training launched — epochs='+epochs+', rebuild='+rebuild);
  const btn=document.getElementById('btn-train');
  if(btn){btn.disabled=true;btn.textContent='⏳ Launching...';}
  try{
    const r=await fetch('/api/dataset-manager/train',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({epochs,rebuild})});
    const d=await r.json();
    if(d.success){
      alSuccess('Training started — pid='+d.pid+', epochs='+epochs+'. Monitor session_status.json for progress.');
    }else if(d.status==='already_running'){
      alWarn('Training already running — pid='+d.pid);
    }else{
      alError('Training failed: '+(d.error||d.message||'Unknown error'));
    }
  }catch(e){
    alError('Training exception: '+e.message);
  }
  if(btn){btn.disabled=false;btn.textContent='⚡ Train on Updated Dataset';}
  pollTrainingProcess();
};
document.getElementById('btn-train').onclick=window.dmTrain;

// ── Auto-capture API polling events ─────────────────────────────────────────
// Wrap loadTraining to echo epoch events
const _origLoadTraining=window.loadTraining;
let _lastEpoch=-1;
window.loadTraining=async()=>{
  if(_origLoadTraining){
    try{
      await _origLoadTraining();
    }catch(e){}
  }
  try{
    const d=await j('/api/training-status');
    if(d&&d.epoch!=null&&d.epoch!==_lastEpoch&&d.epoch>0){
      _lastEpoch=d.epoch;
      const status=d.status||'running';
      const lvl=status==='completed'?'SUCCESS':status==='error'?'ERROR':'INFO';
      alog(`Epoch ${d.epoch}/${d.total_epochs||'?'} — loss=${
        d.loss!=null?d.loss.toFixed(4):'—'} val_loss=${
        d.val_loss!=null?d.val_loss.toFixed(4):'—'} status=${status}`,lvl);
    }
  }catch(_){}
};

// Startup message
alInfo('DentalMeshNet AI Engine — Dashboard console ready.');
alInfo('Auto-refresh active: training every 5s / system every 2s.');

/* ══ Real-time SSE Log Stream ═════════════════════════════════════════════ */
(function startSSELog() {
  // Use Server-Sent Events (works with plain Flask, no extra deps)
  const sse = new EventSource('/stream/logs');

  sse.onopen = () => {
    alSuccess('Live log stream connected (⌀ SSE/stream/logs).');
    document.getElementById('al-dot').style.background = '#43e97b';
    document.getElementById('al-dot').style.boxShadow  = '0 0 8px #43e97b';
  };

  sse.onmessage = (ev) => {
    const raw = ev.data;
    // Route to correct level based on prefix
    if (raw.startsWith('[ERROR]') || raw.startsWith('[CRITICAL]')) {
      alog(raw, 'ERROR');
    } else if (raw.startsWith('[WARN]')) {
      alog(raw, 'WARN');
    } else if (raw.startsWith('[SUCCESS]')) {
      alog(raw, 'SUCCESS');
    } else {
      alog(raw, 'INFO');
    }
  };

  sse.onerror = () => {
    // SSE auto-reconnects; just dim the indicator while disconnected
    document.getElementById('al-dot').style.background = '#ff6584';
    document.getElementById('al-dot').style.boxShadow  = '0 0 6px #ff6584';
    alWarn('Live stream disconnected — auto-reconnecting...');
  };
})();

</script>
</body></html>"""


# ─────────────────────────────────────────────────────────────────────────────
# HTML — 3D Viewer (Steps 5 & 10)
# ─────────────────────────────────────────────────────────────────────────────

VIEWER_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orthodontic AI — 3D Viewer</title>
<!-- ── Three.js ES-module importmap (browser-native, no bundler needed) ── -->
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.158.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.158.0/examples/jsm/"
  }
}
</script>
<link rel="modulepreload" href="https://unpkg.com/three@0.158.0/build/three.module.js">
<link rel="modulepreload" href="https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js">
<link rel="modulepreload" href="https://unpkg.com/three@0.158.0/examples/jsm/loaders/STLLoader.js">
<style>
  :root{--bg:#0f1117;--surf:#1a1d27;--surf2:#22263a;--accent:#6c63ff;--accent2:#ff6584;--text:#e2e8f0;--dim:#94a3b8;--border:#2d3359;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;height:100vh;display:flex;flex-direction:column;}
  header{background:linear-gradient(135deg,#1a1d27,#22263a);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:14px;flex-shrink:0;}
  header h1{font-size:17px;font-weight:700;}
  .nav-btn{background:var(--surf2);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;transition:.2s;}
  .nav-btn:hover{background:var(--accent);border-color:var(--accent);}
  .layout{display:flex;flex:1;overflow:hidden;}

  /* Sidebar */
  .sidebar{width:260px;flex-shrink:0;background:var(--surf);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;}
  .sidebar-section{padding:16px;border-bottom:1px solid var(--border);}
  .sidebar-title{font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;}
  .mode-btn{display:block;width:100%;text-align:left;background:var(--surf2);border:1px solid var(--border);color:var(--text);padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;margin-bottom:6px;transition:.15s;}
  .mode-btn:hover,.mode-btn.active{background:var(--accent);border-color:var(--accent);color:#fff;}
  .legend-item{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;}
  .legend-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
  label.slider-label{display:block;font-size:12px;color:var(--dim);margin-bottom:4px;margin-top:10px;}
  input[type=range]{width:100%;accent-color:var(--accent);}
  .stat-row{display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px;}
  .stat-key{color:var(--dim);}
  .stat-val{font-weight:600;}
  .warn-box{background:rgba(246,211,101,.1);border:1px solid rgba(246,211,101,.3);border-radius:6px;padding:8px 10px;font-size:11px;color:#f6d365;margin-top:8px;}

  /* Canvas */
  .canvas-wrap{flex:1;position:relative;}
  canvas{display:block;width:100%;height:100%;}
  .canvas-overlay{position:absolute;top:14px;left:14px;background:rgba(15,17,23,.85);backdrop-filter:blur(8px);border:1px solid var(--border);border-radius:10px;padding:12px 16px;font-size:12px;color:var(--dim);pointer-events:none;}
  .canvas-overlay b{color:var(--text);}
</style>
</head>
<body>
<header>
  <div style="font-size:22px">🦷</div>
  <h1>3D Point Cloud Viewer</h1>
  <a href="/" class="nav-btn" style="margin-left:auto">← Dashboard</a>
</header>

<div class="layout">
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-section">
      <div class="sidebar-title">Visualization Mode</div>
      <button class="mode-btn active" onclick="setMode('ground_truth')" id="btn-gt">🎯 Ground Truth</button>
      <button class="mode-btn" onclick="setMode('dataset_validation')" id="btn-dv">🔬 Dataset Validation</button>
      <button class="mode-btn" onclick="setMode('boundary')" id="btn-bd">🔴 Boundary Points</button>
      <button class="mode-btn" onclick="setMode('error_heatmap')" id="btn-eh">🌡 Error Heatmap</button>
      <button class="mode-btn" onclick="setMode('tooth_graph')" id="btn-tg">🕸 Tooth Graph</button>
      <button class="mode-btn" onclick="setMode('segmented_mesh')" id="btn-sm">🦷 Segmented Mesh</button>
      <button class="mode-btn" onclick="setMode('raw_stl')" id="btn-rs">🖤 Raw STL</button>
    </div>

    <div class="sidebar-section" id="occlusal-panel">
      <div class="sidebar-title">⏫ Occlusal Plane</div>
      <div id="occ-status" style="font-size:11px;color:var(--dim);margin-bottom:10px">Pick 3 points on the occlusal surface to define the reference plane.</div>

      <button id="btn-pick" onclick="startOcclusalPicking()" style="width:100%;background:var(--surf2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:6px">
        📌 Pick Points (0/3)
      </button>

      <div id="occ-picks" style="font-size:11px;color:var(--dim);margin-bottom:8px"></div>

      <button id="btn-lock" onclick="lockOcclusalPlane()" disabled
        style="width:100%;background:linear-gradient(90deg,#22c55e,#16a34a);border:none;color:#fff;padding:9px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;opacity:.4">
        🔒 Lock Occlusal Plane
      </button>

      <div id="occ-msg" style="margin-top:8px;font-size:11px;display:none;padding:7px;border-radius:6px"></div>

      <button onclick="resetOcclusalPlane()" style="width:100%;margin-top:8px;background:transparent;border:1px solid var(--border);color:var(--dim);padding:7px;border-radius:7px;cursor:pointer;font-size:11px">
        ↺ Reset
      </button>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">Color Legend</div>
      <div id="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#e879f9"></div>Gingiva</div>
        <div class="legend-item"><div class="legend-dot" style="background:#43e97b"></div>Teeth (by ID)</div>
      </div>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">Display</div>
      <label class="slider-label">Point size: <span id="ps-val">2</span></label>
      <input type="range" min="1" max="8" value="2" id="point-size-slider" oninput="updatePointSize(this.value)">
      <label class="slider-label">Opacity: <span id="op-val">100</span>%</label>
      <input type="range" min="10" max="100" value="100" id="opacity-slider" oninput="updateOpacity(this.value)">
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">Dataset Stats</div>
      <div id="case-stats"><div style="color:var(--dim);font-size:12px">Load a case to see stats</div></div>
    </div>


    <div class="sidebar-section">
      <div class="sidebar-title">Load Case</div>
      <select id="case-select" style="width:100%;background:var(--surf2);border:1px solid var(--border);color:var(--text);padding:7px;border-radius:7px;font-size:12px;cursor:pointer">
        <option value="">Select case...</option>
      </select>
      <button onclick="loadSelectedCase()" style="margin-top:8px;width:100%;background:var(--accent);border:none;color:#fff;padding:8px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600">Load Point Cloud</button>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-title">STL Mesh Viewer</div>
      <select id="stl-case-select" style="width:100%;background:var(--surf2);border:1px solid var(--border);color:var(--text);padding:7px;border-radius:7px;font-size:12px;cursor:pointer;margin-bottom:6px">
        <option value="">Select case...</option>
      </select>
      <button onclick="loadSTLMeshes()" style="width:100%;background:linear-gradient(90deg,#6c63ff,#ff6584);border:none;color:#fff;padding:8px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600">&#128247; Load STL Meshes</button>
      <div id="stl-status" style="margin-top:8px;font-size:11px;color:var(--dim)">No meshes loaded</div>
      <div id="stl-legend" style="margin-top:6px"></div>
    </div>
  </div>

  <!-- ══ 3D AI Debug Mode Panel (right-side, hidden until activated) ══ -->
  <div id="debug-panel" style="
    width:240px;flex-shrink:0;background:var(--surf);
    border-left:1px solid var(--border);display:none;
    flex-direction:column;overflow-y:auto;
  ">
    <div class="sidebar-section" style="background:rgba(108,99,255,.08)">
      <div class="sidebar-title" style="color:#9f7afa">🧠 AI Debug Mode</div>
      <div style="font-size:11px;color:var(--dim);margin-bottom:12px">Press <kbd style="background:#22263a;padding:1px 6px;border-radius:3px">D</kbd> to toggle</div>
      <!-- Visualization sub-modes -->
      <div style="font-size:11px;color:var(--dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">Visualization</div>
      <button class="mode-btn" id="dbg-tooth-labels"    onclick="dbgSetViz('tooth_labels')">🦷 Tooth Labels</button>
      <button class="mode-btn" id="dbg-gingiva"         onclick="dbgSetViz('gingiva')">💗 Gingiva vs Teeth</button>
      <button class="mode-btn" id="dbg-boundary"        onclick="dbgSetViz('boundary')">  Boundary Edges</button>
      <button class="mode-btn" id="dbg-confidence"      onclick="dbgSetViz('confidence')">🌡 Confidence Map</button>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-title">📊 Debug Stats</div>
      <div id="dbg-stat-teeth"  class="stat-row"><span class="stat-key">Detected teeth</span><span class="stat-val" id="dbg-v-teeth">—</span></div>
      <div id="dbg-stat-gingfrac" class="stat-row"><span class="stat-key">Gingiva faces</span><span class="stat-val" id="dbg-v-gingfrac">—</span></div>
      <div id="dbg-stat-bnd"    class="stat-row"><span class="stat-key">Boundary pts</span><span class="stat-val" id="dbg-v-bnd">—</span></div>
      <div id="dbg-stat-conf"   class="stat-row"><span class="stat-key">Avg confidence</span><span class="stat-val" id="dbg-v-conf">—</span></div>
      <div id="dbg-stat-miss"   class="stat-row"><span class="stat-key">Missing teeth</span><span class="stat-val" id="dbg-v-miss" style="color:#ff6584">—</span></div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-title">🚨 Issues</div>
      <div id="dbg-issues" style="font-size:11px;color:var(--dim)">Load a case in debug mode.</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-title">Load Debug Data</div>
      <button onclick="loadDebugData()" style="width:100%;background:linear-gradient(90deg,#6c63ff,#9f7afa);border:none;color:#fff;padding:8px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600">
        🧠 Fetch AI Debug
      </button>
      <div id="dbg-load-status" style="margin-top:6px;font-size:11px;color:var(--dim)"></div>
    </div>
  </div>

  <!-- 3D Canvas -->
  <div class="canvas-wrap">
    <canvas id="viewer-canvas"></canvas>
    <div class="canvas-overlay">
      <b id="overlay-mode">Ground Truth</b><br>
      <span id="overlay-points">0 points</span> &middot;
      <span id="overlay-classes">0 classes</span><br>
      <span style="color:var(--dim);font-size:10px">LMB drag to rotate &middot; scroll to zoom &middot; RMB to pan</span><br>
      <span id="overlay-occ" style="color:#22c55e;font-size:10px;display:none">⏫ Occlusal picking active &mdash; click a point</span>
      <span id="overlay-dbg" style="color:#9f7afa;font-size:10px;display:none">🧠 Debug Mode active — press D to exit</span>
    </div>
    <!-- Debug Mode toggle button — floats top-right of canvas -->
    <button id="debug-mode-btn" onclick="toggleDebugMode()"
      title="Toggle AI Debug Mode (keyboard: D)"
      style="position:absolute;top:14px;right:14px;
        background:linear-gradient(135deg,#1a1d27,#2d2060);
        border:1px solid #6c63ff;color:#9f7afa;
        padding:8px 14px;border-radius:8px;cursor:pointer;
        font-size:12px;font-weight:700;transition:.2s;
        backdrop-filter:blur(4px);">
      🧠 Debug Mode
    </button>
  </div>
</div>

<script>
// ── Minimal WebGL point cloud renderer ──────────────────────────────────────
const canvas = document.getElementById('viewer-canvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

let points = [], colors = [], raw = null;
let currentMode = 'ground_truth';
let pointSize = 2, opacity = 1.0;

// Camera
let rot = [0.3, 0.3], zoom = 1.0, pan = [0,0];
let dragging = false, rightDrag = false, lastMouse = [0,0];

// ── Point cloud shader (existing) ──
const VS = `
  attribute vec3 aPos; attribute vec3 aCol;
  uniform mat4 uMVP; uniform float uSize; uniform float uOpacity;
  varying vec3 vCol; varying float vOp;
  void main(){gl_Position=uMVP*vec4(aPos,1.0);gl_PointSize=uSize;vCol=aCol;vOp=uOpacity;}`;
const FS = `
  precision mediump float;
  varying vec3 vCol; varying float vOp;
  void main(){
    float d=length(gl_PointCoord-.5)*2.0;
    if(d>1.0)discard;
    gl_FragColor=vec4(vCol,vOp);}`;

function mkShader(type,src){
  const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;
}
const prog = gl.createProgram();
gl.attachShader(prog,mkShader(gl.VERTEX_SHADER,VS));
gl.attachShader(prog,mkShader(gl.FRAGMENT_SHADER,FS));
gl.linkProgram(prog);

const posBuf=gl.createBuffer(), colBuf=gl.createBuffer();
const aPos=gl.getAttribLocation(prog,'aPos'), aCol=gl.getAttribLocation(prog,'aCol');
const uMVP=gl.getUniformLocation(prog,'uMVP');
const uSize=gl.getUniformLocation(prog,'uSize'), uOp=gl.getUniformLocation(prog,'uOpacity');

// ── Mesh triangle shader (Phong-lit with vertex colors) ──
const MESH_VS = `
  attribute vec3 aMPos; attribute vec3 aMCol; attribute vec3 aMNrm;
  uniform mat4 uMMVP; uniform mat4 uMModel;
  varying vec3 vMCol; varying vec3 vNrm; varying vec3 vWorldPos;
  void main(){
    gl_Position = uMMVP * vec4(aMPos, 1.0);
    vMCol       = aMCol;
    vNrm        = normalize((uMModel * vec4(aMNrm, 0.0)).xyz);
    vWorldPos   = (uMModel * vec4(aMPos, 1.0)).xyz;
  }`;
const MESH_FS = `
  precision mediump float;
  varying vec3 vMCol; varying vec3 vNrm; varying vec3 vWorldPos;
  uniform vec3 uLightDir;
  void main(){
    vec3 N = normalize(vNrm);
    float diff = max(dot(N, uLightDir), 0.0) * 0.7;
    float amb  = 0.35;
    float spec = pow(max(dot(reflect(-uLightDir, N), normalize(-vWorldPos)), 0.0), 16.0) * 0.2;
    vec3 lit   = vMCol * (amb + diff) + vec3(1.0) * spec;
    gl_FragColor = vec4(lit, 1.0);
  }`;

const meshProg = gl.createProgram();
gl.attachShader(meshProg, mkShader(gl.VERTEX_SHADER, MESH_VS));
gl.attachShader(meshProg, mkShader(gl.FRAGMENT_SHADER, MESH_FS));
gl.linkProgram(meshProg);

const mPosBuf=gl.createBuffer(), mColBuf=gl.createBuffer(), mNrmBuf=gl.createBuffer();
const aMPos=gl.getAttribLocation(meshProg,'aMPos');
const aMCol=gl.getAttribLocation(meshProg,'aMCol');
const aMNrm=gl.getAttribLocation(meshProg,'aMNrm');
const uMMVP=gl.getUniformLocation(meshProg,'uMMVP');
const uMModel=gl.getUniformLocation(meshProg,'uMModel');
const uLightDir=gl.getUniformLocation(meshProg,'uLightDir');

// ── Mesh data storage ──
let meshVerts = null;   // Float32Array — triangle vertices (already normalised)
let meshNorms = null;   // Float32Array — per-vertex normals
let meshCols  = null;   // Float32Array — per-vertex colors (from segmentation)
let meshLabels = null;  // Int32Array  — per-vertex labels (for recoloring by mode)
let meshTriCount = 0;
let meshLoaded = false;
let renderMesh = false; // toggle: true = show mesh, false = show points

// Simple mat4 helpers
function mat4mul(a,b){const o=new Float32Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=a[i*4+k]*b[k*4+j];o[i*4+j]=s;}return o;}
function rotX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]);}
function rotY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]);}
function perspective(fov,asp,n,f){const t=Math.tan(fov/2);return new Float32Array([1/(asp*t),0,0,0, 0,1/t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]);}
function translate(x,y,z){return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);}
function identity4(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}

function getMVP(){
  const asp=canvas.width/canvas.height;
  const P=perspective(Math.PI/4,asp,0.01,1000);
  const T=translate(pan[0],pan[1],-3/zoom);
  const RX=rotX(rot[0]), RY=rotY(rot[1]);
  return mat4mul(P,mat4mul(T,mat4mul(RX,RY)));
}

function getModelMat(){
  const RX=rotX(rot[0]), RY=rotY(rot[1]);
  return mat4mul(RX,RY);
}

function render(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  gl.viewport(0,0,w,h);
  gl.clearColor(0.06,0.067,0.09,1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  const mvp = getMVP();

  // ── Draw mesh triangles (when loaded + mesh mode active) ──
  if (renderMesh && meshLoaded && meshVerts) {
    gl.useProgram(meshProg);
    gl.uniformMatrix4fv(uMMVP, false, mvp);
    gl.uniformMatrix4fv(uMModel, false, getModelMat());
    gl.uniform3f(uLightDir, 0.3, 0.8, 0.5); // top-right light

    gl.bindBuffer(gl.ARRAY_BUFFER, mPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, meshVerts, gl.STATIC_DRAW);
    gl.vertexAttribPointer(aMPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aMPos);

    gl.bindBuffer(gl.ARRAY_BUFFER, mColBuf);
    gl.bufferData(gl.ARRAY_BUFFER, meshCols, gl.STATIC_DRAW);
    gl.vertexAttribPointer(aMCol, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aMCol);

    gl.bindBuffer(gl.ARRAY_BUFFER, mNrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, meshNorms, gl.STATIC_DRAW);
    gl.vertexAttribPointer(aMNrm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aMNrm);

    gl.drawArrays(gl.TRIANGLES, 0, meshTriCount * 3);

    gl.disableVertexAttribArray(aMPos);
    gl.disableVertexAttribArray(aMCol);
    gl.disableVertexAttribArray(aMNrm);
  }

  // ── Draw point cloud (when NOT in mesh-only mode, or no mesh loaded) ──
  if (!renderMesh && points.length) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(aPos);

    gl.bindBuffer(gl.ARRAY_BUFFER,colBuf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(colors),gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(aCol,3,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(aCol);

    gl.uniformMatrix4fv(uMVP,false,mvp);
    gl.uniform1f(uSize,pointSize);
    gl.uniform1f(uOp,opacity);
    gl.drawArrays(gl.POINTS,0,points.length/3);
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Mouse
canvas.addEventListener('mousedown',e=>{dragging=true;rightDrag=e.button===2;lastMouse=[e.clientX,e.clientY];});
window.addEventListener('mouseup',()=>dragging=false);
window.addEventListener('mousemove',e=>{
  if(!dragging)return;
  const dx=(e.clientX-lastMouse[0])*0.008, dy=(e.clientY-lastMouse[1])*0.008;
  if(rightDrag){pan[0]+=dx;pan[1]-=dy;}
  else{rot[1]+=dx;rot[0]+=dy;}
  lastMouse=[e.clientX,e.clientY];
});
canvas.addEventListener('wheel',e=>{zoom*=e.deltaY>0?0.9:1.1;e.preventDefault();},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// Colour palettes
const TOOTH_COLORS=[
  [1,.53,.7],[.26,.91,.49],[.42,.39,1],[1,.89,.27],[.06,.74,.93],
  [1,.57,.08],[.58,1,.44],[1,.38,.38],[.48,.15,.9],[.02,.88,.72],
  [1,.7,.3],[.3,.6,1],[1,.4,.8],[.7,1,.2],[.2,.8,.8],
  [.9,.3,.5],[.4,.9,.4],[.8,.4,1],[1,.6,.2],[.6,.2,.8],
  [.2,.9,.6],[.9,.6,.1],[.1,.4,.9],[.7,.5,.2],[.5,.8,.6],
  [.8,.2,.4],[.4,.7,.9],[.9,.8,.1],[.2,.5,.7],[.6,.9,.3],[.9,.4,.6],[.3,.8,.5]
];
function toothColor(id){const c=TOOTH_COLORS[(id-1)%TOOTH_COLORS.length];return c||[.5,.5,.5];}

// Build colors based on mode
function buildColors(pts3, lbl){
  const n=pts3.length/3, out=new Array(n*3);
  for(let i=0;i<n;i++){
    let r,g,b;
    if(currentMode==='ground_truth'||currentMode==='dataset_validation'){
      if(lbl[i]===0){r=0.91;g=0.47;b=0.97;} // gingiva pink
      else{[r,g,b]=toothColor(lbl[i]);}
    } else if(currentMode==='boundary'){
      // boundary = points near label transitions (simplified: near gingiva=red, else blue)
      r=lbl[i]===0?0.1:1.0; g=lbl[i]===0?0.4:0.1; b=lbl[i]===0?0.9:0.1;
    } else { // error heatmap — use pseudo-random "error"
      const e=Math.abs(Math.sin(i*0.37));
      r=e; g=1-e; b=0.2;
    }
    out[i*3]=r; out[i*3+1]=g; out[i*3+2]=b;
  }
  return out;
}

function applyData(data){
  raw=data;
  const p=data.points, l=data.labels;
  // Normalise
  let cx=0,cy=0,cz=0;
  for(let i=0;i<p.length;i+=3){cx+=p[i];cy+=p[i+1];cz+=p[i+2];}
  cx/=(p.length/3);cy/=(p.length/3);cz/=(p.length/3);
  let maxD=1e-9;
  for(let i=0;i<p.length;i+=3){const dx=p[i]-cx,dy=p[i+1]-cy,dz=p[i+2]-cz;maxD=Math.max(maxD,Math.sqrt(dx*dx+dy*dy+dz*dz));}
  points=[];
  for(let i=0;i<p.length;i+=3){points.push((p[i]-cx)/maxD,(p[i+1]-cy)/maxD,(p[i+2]-cz)/maxD);}
  colors=buildColors(points,l);
  document.getElementById('overlay-points').textContent=(points.length/3).toLocaleString()+' points';
  const uniq=[...new Set(l)];
  document.getElementById('overlay-classes').textContent=uniq.length+' classes';
  updateStats(p,l,uniq);
  updateLegend(l,uniq);
}

function updateStats(p,l,uniq){
  const n=l.length;
  const gPct=Math.round(l.filter(x=>x===0).length/n*100);
  const teeth=uniq.filter(x=>x>0);
  document.getElementById('case-stats').innerHTML=`
    <div class="stat-row"><span class="stat-key">Points</span><span class="stat-val">${n.toLocaleString()}</span></div>
    <div class="stat-row"><span class="stat-key">Gingiva</span><span class="stat-val">${gPct}%</span></div>
    <div class="stat-row"><span class="stat-key">Teeth</span><span class="stat-val">${100-gPct}%</span></div>
    <div class="stat-row"><span class="stat-key">Tooth classes</span><span class="stat-val">${teeth.length}</span></div>
    ${gPct>85?'<div class="warn-box">⚠ Gingiva ratio very high — check labels</div>':''}
    ${teeth.length<4?'<div class="warn-box">⚠ Very few tooth classes</div>':''}
  `;
}

function updateLegend(l,uniq){
  const teeth=uniq.filter(x=>x>0).slice(0,8);
  let html='<div class="legend-item"><div class="legend-dot" style="background:#e879f9"></div>Gingiva</div>';
  teeth.forEach(id=>{
    const [r,g,b]=toothColor(id);
    html+=`<div class="legend-item"><div class="legend-dot" style="background:rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})"></div>Tooth #${id}</div>`;
  });
  if(uniq.filter(x=>x>0).length>8) html+=`<div style="color:var(--dim);font-size:11px;margin-top:4px">+${uniq.filter(x=>x>0).length-8} more...</div>`;
  if(currentMode==='boundary') html='<div class="legend-item"><div class="legend-dot" style="background:#ff6584"></div>Boundary zone</div><div class="legend-item"><div class="legend-dot" style="background:#1165de"></div>Normal surface</div>';
  if(currentMode==='error_heatmap') html='<div class="legend-item"><div class="legend-dot" style="background:#ff4444"></div>High error</div><div class="legend-item"><div class="legend-dot" style="background:#43e97b"></div>Low error</div>';
  document.getElementById('legend').innerHTML=html;
}

function setMode(m){
  currentMode=m;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  const map={ground_truth:'btn-gt',dataset_validation:'btn-dv',boundary:'btn-bd',error_heatmap:'btn-eh',tooth_graph:'btn-tg',segmented_mesh:'btn-sm',raw_stl:'btn-rs'};
  if(map[m]) document.getElementById(map[m]).classList.add('active');
  const labels={ground_truth:'Ground Truth',dataset_validation:'Dataset Validation',boundary:'Boundary Points',error_heatmap:'Error Heatmap',tooth_graph:'Tooth Graph',segmented_mesh:'Segmented Mesh',raw_stl:'Raw STL'};
  document.getElementById('overlay-mode').textContent=labels[m]||m;

  // Toggle mesh vs point cloud rendering
  if (m === 'segmented_mesh' || m === 'raw_stl') {
    if (!meshLoaded) {
      // Auto-load mesh overlay on first switch
      loadMeshOverlay();
    } else {
      rebuildMeshColors(m);
    }
    renderMesh = true;
  } else {
    renderMesh = false;
    if(raw){colors=buildColors(points,raw.labels);updateLegend(raw.labels,[...new Set(raw.labels)]);}
    if(m==='tooth_graph' && raw && raw.case_id) fetchAndDrawGraph(raw.case_id);
  }
}

function updatePointSize(v){pointSize=parseFloat(v);document.getElementById('ps-val').textContent=v;}
function updateOpacity(v){opacity=parseFloat(v)/100;document.getElementById('op-val').textContent=v;}

// Load cases list — populate BOTH dropdowns from /api/cases
async function loadCases(){
  try{
    // Point cloud cases from /api/dataset-stats
    const ds = await fetch('/api/dataset-stats').then(r=>r.json()).catch(()=>({}));
    const pcSel = document.getElementById('case-select');
    if(ds && ds.total_cases>0){
      const all = await fetch('/api/all-cases').then(r=>r.json()).catch(()=>[]);
      all.map(c=>c.case).filter(Boolean).slice(0,50).forEach(c=>{
        const o=document.createElement('option');o.value=c;o.textContent=c;pcSel.appendChild(o);
      });
    }

    // STL cases from /api/cases
    const stlSel = document.getElementById('stl-case-select');
    const stlCases = await fetch('/api/cases').then(r=>r.json()).catch(()=>[]);
    stlCases.forEach(c=>{
      const o=document.createElement('option');
      o.value=c.case_id;
      const tags=[];
      if(c.has_maxillary) tags.push('MAX');
      if(c.has_mandibular) tags.push('MAN');
      o.textContent=c.case_id + (tags.length?' ['+tags.join('+')+']':'');
      stlSel.appendChild(o);
    });
    if(stlCases.length===0){
      document.getElementById('stl-status').textContent='No STL cases found in datasets/cases/';
    }
  }catch(e){}
}

async function loadSelectedCase(){
  const sel=document.getElementById('case-select').value;
  if(!sel)return;
  try{
    const data = await fetch('/api/case-points?case='+encodeURIComponent(sel)).then(r=>r.json());
    applyData(data);
  }catch(e){alert('Could not load case: '+e.message);}
}

// Load synthetic demo if available
async function loadDemo(){
  try{
    const r=await fetch('/api/case-points?case=demo');
    if(r.ok){const d=await r.json();applyData(d);}
  }catch(e){}
}

loadCases();
loadDemo();

// ── STL Mesh Loading (Steps 3-5) ──────────────────────────────────────────────
// We parse binary STL manually so we don't need Three.js CDN.
// Each triangle: 12 bytes normal + 3×12 bytes vertices + 2 bytes attr = 50 bytes

function parseBinarySTL(buffer) {
  const view = new DataView(buffer);
  // Skip 80-byte header
  const numTriangles = view.getUint32(80, true);
  const verts = [];
  let offset = 84;
  for (let i = 0; i < numTriangles; i++) {
    offset += 12; // skip normal
    for (let v = 0; v < 3; v++) {
      verts.push(
        view.getFloat32(offset,     true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true)
      );
      offset += 12;
    }
    offset += 2; // attribute byte count
  }
  return verts; // flat [x,y,z, x,y,z, ...]
}

function parseASCIISTL(text) {
  const verts = [];
  const re = /vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  return verts;
}

async function fetchSTLPoints(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} — ${url}`);
  const buf = await resp.arrayBuffer();
  // Detect ASCII vs binary: binary STL starts with arbitrary 80-byte header
  const header = new Uint8Array(buf, 0, 5);
  const isASCII = String.fromCharCode(...header).startsWith('solid');
  if (isASCII) {
    return parseASCIISTL(new TextDecoder().decode(buf));
  }
  return parseBinarySTL(buf);
}

let stlPoints = [], stlColors = [];

async function loadSTLMeshes() {
  const caseId = document.getElementById('stl-case-select').value;
  if (!caseId) { alert('Select a case first'); return; }
  const statusEl = document.getElementById('stl-status');
  const legendEl = document.getElementById('stl-legend');
  statusEl.textContent = 'Loading STL files...';
  legendEl.innerHTML = '';

  const meshDefs = [
    { arch: 'maxillary',  url: `/cases/${caseId}/maxillary.stl`,  color: [0.47, 0.75, 0.95] },
    { arch: 'mandibular', url: `/cases/${caseId}/mandibular.stl`, color: [0.95, 0.65, 0.47] },
  ];

  const loaded = [];
  stlPoints = []; stlColors = [];

  for (const def of meshDefs) {
    try {
      const verts = await fetchSTLPoints(def.url);
      const n = verts.length / 3;

      // Normalise into same space as existing point cloud
      let cx=0,cy=0,cz=0,mx=1e-9;
      for(let i=0;i<verts.length;i+=3){cx+=verts[i];cy+=verts[i+1];cz+=verts[i+2];}
      cx/=n;cy/=n;cz/=n;
      for(let i=0;i<verts.length;i+=3){
        const dx=verts[i]-cx,dy=verts[i+1]-cy,dz=verts[i+2]-cz;
        mx=Math.max(mx,Math.sqrt(dx*dx+dy*dy+dz*dz));
      }
      for(let i=0;i<verts.length;i+=3){
        stlPoints.push((verts[i]-cx)/mx,(verts[i+1]-cy)/mx,(verts[i+2]-cz)/mx);
        stlColors.push(...def.color);
      }

      loaded.push({ arch: def.arch, n });
      const dot = `<div style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgb(${def.color.map(v=>Math.round(v*255)).join(',')});margin-right:5px"></div>`;
      legendEl.innerHTML += `<div style="display:flex;align-items:center;font-size:11px;margin-top:3px">${dot}${def.arch} (${n.toLocaleString()} verts)</div>`;
    } catch(e) {
      legendEl.innerHTML += `<div style="font-size:11px;color:var(--accent2);margin-top:3px">&#10005; ${def.arch}: ${e.message}</div>`;
    }
  }

  if (loaded.length === 0) {
    statusEl.textContent = 'No STL files found for this case.';
    return;
  }

  // Merge mesh vertices into the point cloud render buffers
  points = [...(raw ? points.slice(0, (raw.labels||[]).length * 3) : []), ...stlPoints];
  colors = [...(raw ? colors.slice(0, (raw.labels||[]).length * 3) : []), ...stlColors];
  statusEl.textContent = `Loaded ${loaded.length} mesh(es) — ${(stlPoints.length/3).toLocaleString()} verts`;
  document.getElementById('overlay-points').textContent =
    (points.length/3).toLocaleString() + ' points+verts';
}

// ══ MESH SEGMENTATION OVERLAY (Steps 1-7) ════════════════════════════════════
// Fetch pre-colored mesh from backend (KDTree label mapping done server-side)
async function loadMeshOverlay() {
  const caseId = currentCaseId || document.getElementById('stl-case-select').value || '';
  if (!caseId) {
    document.getElementById('overlay-mode').textContent = 'Segmented Mesh — load a case first';
    return;
  }
  document.getElementById('overlay-mode').textContent = 'Loading mesh...';

  try {
    const resp = await fetch('/api/case-mesh-overlay?case=' + encodeURIComponent(caseId));
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();

    // data shape: {vertices: [x,y,z,...], normals: [nx,ny,nz,...], labels: [l,...], tri_count: N}
    const verts   = data.vertices;
    const norms   = data.normals;
    const labels  = data.labels;
    meshTriCount  = data.tri_count;

    // Normalise vertices into [-1,1] range (same as point cloud normalisation)
    const nv = verts.length / 3;
    let cx=0,cy=0,cz=0;
    for(let i=0;i<verts.length;i+=3){cx+=verts[i];cy+=verts[i+1];cz+=verts[i+2];}
    cx/=nv; cy/=nv; cz/=nv;
    let maxD=1e-9;
    for(let i=0;i<verts.length;i+=3){
      const dx=verts[i]-cx,dy=verts[i+1]-cy,dz=verts[i+2]-cz;
      maxD=Math.max(maxD,Math.sqrt(dx*dx+dy*dy+dz*dz));
    }
    const normVerts = new Float32Array(verts.length);
    for(let i=0;i<verts.length;i+=3){
      normVerts[i]   = (verts[i]-cx)/maxD;
      normVerts[i+1] = (verts[i+1]-cy)/maxD;
      normVerts[i+2] = (verts[i+2]-cz)/maxD;
    }

    meshVerts  = normVerts;
    meshNorms  = new Float32Array(norms);
    meshLabels = new Int32Array(labels);
    meshLoaded = true;

    rebuildMeshColors(currentMode);

    document.getElementById('overlay-mode').textContent =
      currentMode === 'raw_stl' ? 'Raw STL' : 'Segmented Mesh';
    document.getElementById('overlay-points').textContent =
      meshTriCount.toLocaleString() + ' triangles';

    // Update legend for mesh mode
    if (currentMode === 'segmented_mesh') {
      const uniq = [...new Set(labels)];
      updateLegend(labels, uniq);
    }

    console.log(`Mesh overlay loaded: ${meshTriCount} triangles, ${nv} vertices`);
  } catch(e) {
    document.getElementById('overlay-mode').textContent = 'Mesh load failed: ' + e.message;
    console.warn('loadMeshOverlay:', e.message);
    renderMesh = false;
  }
}

// Rebuild mesh vertex colors based on current mode
function rebuildMeshColors(mode) {
  if (!meshLabels) return;
  const n = meshLabels.length;
  const cols = new Float32Array(n * 3);

  if (mode === 'raw_stl') {
    // Uniform light grey — clinical raw mesh look
    for (let i = 0; i < n; i++) {
      cols[i*3] = 0.82; cols[i*3+1] = 0.84; cols[i*3+2] = 0.86;
    }
    // Update legend
    document.getElementById('legend').innerHTML =
      '<div class="legend-item"><div class="legend-dot" style="background:#d1d5db"></div>Raw Surface</div>';
  } else {
    // Segmented mesh — use same tooth/gingiva palette as point cloud
    for (let i = 0; i < n; i++) {
      const lbl = meshLabels[i];
      if (lbl === 0) {
        // Gingiva — soft pink
        cols[i*3] = 0.91; cols[i*3+1] = 0.47; cols[i*3+2] = 0.73;
      } else {
        const tc = toothColor(lbl);
        cols[i*3] = tc[0]; cols[i*3+1] = tc[1]; cols[i*3+2] = tc[2];
      }
    }
    const uniq = [...new Set(meshLabels)];
    updateLegend(Array.from(meshLabels), uniq);
  }

  meshCols = cols;
}

// Tooth Graph mode — fetch centroid + adjacency overlay
let graphOverlay = [];   // extra coloured centroid points
async function fetchAndDrawGraph(caseId) {
  try {
    const data = await fetch('/api/case-graph?case=' + encodeURIComponent(caseId||'demo')).then(r=>r.json());
    if (!data || !data.centroids) return;
    const cents = data.centroids;  // [[x,y,z], ...]
    const adj   = data.adj;         // [[0/1,...], ...] T×T

    // Find normalisation params from current points
    if (!points.length) return;
    let cx=0,cy=0,cz=0,mx=1e-9;
    for(let i=0;i<points.length;i+=3){cx+=points[i];cy+=points[i+1];cz+=points[i+2];}
    const np=points.length/3; cx/=np;cy/=np;cz/=np;
    for(let i=0;i<points.length;i+=3){
      const dx=points[i]-cx,dy=points[i+1]-cy,dz=points[i+2]-cz;
      mx=Math.max(mx,Math.sqrt(dx*dx+dy*dy+dz*dz));
    }

    // Build extra points: centroid dots (bright white) + edge midpoints (orange)
    const extra = [], ecols = [];
    cents.forEach(([x,y,z]) => {
      if (!x && !y && !z) return;  // skip absent
      const nx=(x-cx)/mx,ny=(y-cy)/mx,nz=(z-cz)/mx;
      extra.push(nx,ny,nz); ecols.push(1,1,1);  // white centroid
    });
    // Edge points: one dot per edge pair at midpoint
    for(let i=0;i<adj.length;i++){
      for(let j=i+1;j<adj[i].length;j++){
        if(adj[i][j]>0.01 && cents[i] && cents[j]){
          const [x1,y1,z1]=cents[i],[x2,y2,z2]=cents[j];
          const nx=((x1+x2)/2-cx)/mx,ny=((y1+y2)/2-cy)/mx,nz=((z1+z2)/2-cz)/mx;
          extra.push(nx,ny,nz); ecols.push(1,0.6,0.1);  // orange edge midpoint
        }
      }
    }
    graphOverlay = {pts: extra, cols: ecols};
    // Overlay onto existing color buffers
    const allPts = [...points, ...extra];
    const allCols= [...colors, ...ecols];
    points=allPts; colors=allCols;
    document.getElementById('overlay-classes').textContent = cents.filter(c=>c[0]||c[1]||c[2]).length + ' teeth graphed';
  } catch(e) { console.warn('graph overlay:', e.message); }

// ══ OCCLUSAL PLANE LOCKING WORKFLOW ═══════════════════════════════════════════════
// State
let occPicking = false;
let occPicks   = [];          // [{x,y,z}]
let occPlaneData = null;      // {normal, origin, rotation, picks}
let occLocked  = false;
let currentCaseId = '';       // set each time a case loads

// Patch applyData to capture currentCaseId
const _origApplyData = applyData;
function applyData(data) {
  _origApplyData(data);
  if (data && data.case_id) currentCaseId = data.case_id;
}

// ─ Step 1: enable picking mode ──────────────────────────────────────────────
function startOcclusalPicking() {
  if (occLocked) return;
  if (!points.length) { showOccMsg('Load a case first.', 'warn'); return; }
  occPicking = true;
  occPicks = [];
  updateOccUI();
  document.getElementById('overlay-occ').style.display = 'block';
  document.getElementById('btn-pick').style.background   = 'rgba(108,99,255,.35)';
  document.getElementById('btn-pick').style.borderColor  = 'var(--accent)';
}

// ─ Canvas click → nearest-point picker ────────────────────────────────────
canvas.addEventListener('click', function(e) {
  if (!occPicking || occLocked || e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  const cx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  const cy = ((e.clientY - rect.top)  / rect.height) * 2 - 1;
  const mvp = getMVP();
  let best = -1, bestDist = Infinity;
  const np = points.length / 3;
  for (let i = 0; i < np; i++) {
    const px = points[i*3], py = points[i*3+1], pz = points[i*3+2];
    const w  = mvp[3]*px + mvp[7]*py + mvp[11]*pz + mvp[15];
    if (Math.abs(w) < 1e-9) continue;
    const sx = (mvp[0]*px + mvp[4]*py + mvp[8]*pz  + mvp[12]) / w;
    const sy = (mvp[1]*px + mvp[5]*py + mvp[9]*pz  + mvp[13]) / w;
    const d  = (sx - cx)**2 + (-sy - cy)**2;  // WebGL Y is flipped
    if (d < bestDist) { bestDist = d; best = i; }
  }
  if (best < 0) return;
  const pt = { x: points[best*3], y: points[best*3+1], z: points[best*3+2] };
  occPicks.push(pt);
  colors[best*3] = 1; colors[best*3+1] = 1; colors[best*3+2] = 0;  // highlight yellow
  updateOccUI();
  if (occPicks.length >= 3) {
    occPicking = false;
    document.getElementById('overlay-occ').style.display = 'none';
    document.getElementById('btn-pick').style.background   = '';
    document.getElementById('btn-pick').style.borderColor  = '';
    fitOcclusalPlane();
  }
});

// ─ Fit plane through exactly 3 points (cross-product normal) ───────────────
function fitOcclusalPlane() {
  const [A, B, C] = occPicks;
  const u = [B.x-A.x, B.y-A.y, B.z-A.z];
  const v = [C.x-A.x, C.y-A.y, C.z-A.z];
  let n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const len = Math.sqrt(n[0]**2+n[1]**2+n[2]**2);
  n = n.map(x => x / (len||1));
  if (n[1] < 0) n = n.map(x => -x);   // normal points up
  const origin = { x:(A.x+B.x+C.x)/3, y:(A.y+B.y+C.y)/3, z:(A.z+B.z+C.z)/3 };
  // Rodrigues rotation: align n → world-up [0,1,0]
  const worldUp = [0,1,0];
  const axis    = crossV(n, worldUp);
  const sinA    = Math.sqrt(axis[0]**2+axis[1]**2+axis[2]**2);
  const cosA    = dotV(n, worldUp);
  const rot3    = sinA < 1e-6 ? [1,0,0,0,1,0,0,0,1] : rodriguezRot(normaliseV(axis), Math.atan2(sinA,cosA));
  occPlaneData  = { normal:n, origin, rotation:rot3, picks:occPicks };
  addPlanePreview(origin, n);
  showOccMsg('Plane fitted — review orientation then lock.', 'info');
  const lockBtn = document.getElementById('btn-lock');
  lockBtn.disabled = false;
  lockBtn.style.opacity = '1';
}

function addPlanePreview(origin, normal) {
  const tip = 0.15;
  points = [...points,
    origin.x,                   origin.y,                   origin.z,
    origin.x + normal[0]*tip,   origin.y + normal[1]*tip,   origin.z + normal[2]*tip,
  ];
  colors = [...colors, 0,1,1, 0,0.6,1];  // cyan centroid + blue arrow tip
}

// ─ Step 2: apply rotation to all buffers ───────────────────────────────────
function applyOcclusalPlaneTransform(planeData) {
  if (!planeData || !planeData.rotation) return;
  const R  = planeData.rotation;
  const ox = planeData.origin.x, oy = planeData.origin.y, oz = planeData.origin.z;
  const n  = points.length / 3;
  const tp = new Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = points[i*3]-ox, y = points[i*3+1]-oy, z = points[i*3+2]-oz;
    tp[i*3]   = R[0]*x + R[1]*y + R[2]*z + ox;
    tp[i*3+1] = R[3]*x + R[4]*y + R[5]*z + oy;
    tp[i*3+2] = R[6]*x + R[7]*y + R[8]*z + oz;
  }
  points = tp;
  if (raw) colors = buildColors(points, raw.labels);
}

// ─ Step 3: reload case geometry ─────────────────────────────────────────────
async function reloadCase() {
  if (!currentCaseId) return;
  try {
    const data = await fetch('/api/case-points?case=' + encodeURIComponent(currentCaseId)).then(r => r.json());
    applyData(data);
    if (occPlaneData) applyOcclusalPlaneTransform(occPlaneData);  // re-apply transform
    console.log('Occlusal plane applied and viewer refreshed');
  } catch(e) { console.warn('reloadCase:', e.message); }
}

// ─ Full lock workflow ─────────────────────────────────────────────────────────
async function lockOcclusalPlane() {
  if (!occPlaneData) return;
  const btn = document.getElementById('btn-lock');
  btn.textContent = '⏳ Saving...';
  btn.disabled = true;

  // Step 1 — POST to backend
  try {
    const caseId = currentCaseId || 'default';
    const resp = await fetch('/api/case/' + encodeURIComponent(caseId) + '/occlusal_plane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(occPlaneData),
    });
    if (!resp.ok) throw new Error(await resp.text());
  } catch(e) {
    showOccMsg('Save failed: ' + e.message, 'error');
    btn.textContent = '🔒 Lock Occlusal Plane';
    btn.disabled = false;
    return;
  }

  // Step 2 — apply transform immediately
  applyOcclusalPlaneTransform(occPlaneData);

  // Step 3 — reload case geometry with transform persisted
  await reloadCase();

  // Step 4 — update UI
  occLocked = true;
  showOccMsg('✓ Occlusal plane locked — viewer refreshed.', 'success');
  console.log('Occlusal plane applied and viewer refreshed');

  // Step 5 — disable picking
  btn.textContent = '✓ Locked';
  btn.style.background = 'linear-gradient(90deg,#16a34a,#15803d)';
  btn.disabled = true;
  document.getElementById('btn-pick').disabled    = true;
  document.getElementById('btn-pick').style.opacity = '0.4';
  document.getElementById('overlay-occ').style.display = 'none';
  document.getElementById('overlay-classes').textContent =
    (document.getElementById('overlay-classes').textContent || '') + ' — ⏫ locked';
}

function resetOcclusalPlane() {
  occPicking = false; occPicks = []; occPlaneData = null; occLocked = false;
  const lockBtn = document.getElementById('btn-lock');
  lockBtn.disabled = true; lockBtn.style.opacity = '0.4';
  lockBtn.textContent = '🔒 Lock Occlusal Plane';
  const pickBtn = document.getElementById('btn-pick');
  pickBtn.disabled = false; pickBtn.style.opacity = '1';
  pickBtn.textContent = '📌 Pick Points (0/3)';
  document.getElementById('occ-picks').textContent = '';
  document.getElementById('overlay-occ').style.display = 'none';
  hideOccMsg();
  document.getElementById('occ-status').textContent =
    'Pick 3 points on the occlusal surface to define the reference plane.';
  reloadCase();
}

function updateOccUI() {
  const n = occPicks.length;
  document.getElementById('btn-pick').textContent = `📌 Pick Points (${n}/3)`;
  document.getElementById('occ-picks').innerHTML = occPicks.map((p,i) =>
    `P${i+1}: (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`
  ).join('<br>');
}

function showOccMsg(msg, type) {
  const el = document.getElementById('occ-msg');
  el.style.display = 'block';
  const s = {
    info:    'background:rgba(99,179,237,.15);color:#63b3ed;border:1px solid rgba(99,179,237,.3)',
    success: 'background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)',
    warn:    'background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3)',
    error:   'background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3)',
  }[type] || '';
  el.setAttribute('style', 'margin-top:8px;font-size:11px;padding:7px;border-radius:6px;' + s);
  el.textContent = msg;
}
function hideOccMsg() {
  const el = document.getElementById('occ-msg');
  el.style.display = 'none'; el.textContent = '';
}

// ─ Math helpers ─────────────────────────────────────────────────────────────
function crossV(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function dotV(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function normaliseV(v){const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2);return l<1e-9?v:v.map(x=>x/l);}
function rodriguezRot(k,theta){
  const[kx,ky,kz]=k,c=Math.cos(theta),s=Math.sin(theta),t=1-c;
  return[t*kx*kx+c,t*kx*ky-s*kz,t*kx*kz+s*ky,
         t*kx*ky+s*kz,t*ky*ky+c,t*ky*kz-s*kx,
         t*kx*kz-s*ky,t*ky*kz+s*kx,t*kz*kz+c];
}

// \u2550\u2550 3D AI Debug Mode \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

let DEBUG_MODE = false;
let _dbgData = null;           // last loaded /api/debug/<case_id> response
let _dbgViz  = 'tooth_labels'; // current debug visualisation type
let _dbgOrigColors = null;     // snapshot of colours before debug applied

// Colour palettes
const _TOOTH_PALETTE = [
  [0.93,0.20,0.20],[0.10,0.60,0.88],[0.18,0.85,0.48],
  [0.98,0.80,0.10],[0.88,0.10,0.88],[0.10,0.88,0.88],
  [1.00,0.50,0.10],[0.55,0.27,0.07],[0.30,0.30,1.00],
  [0.50,0.90,0.10],[0.90,0.50,0.60],[0.10,0.80,0.50],
  [0.80,0.30,0.70],[0.40,0.80,0.90],[0.60,0.60,0.10],
  [0.50,0.10,0.60],[0.10,0.50,0.10],[0.80,0.80,0.80],
  [0.95,0.38,0.10],[0.10,0.70,0.70],[0.70,0.10,0.30],
  [0.10,0.38,0.88],[0.60,0.90,0.30],[0.90,0.10,0.50],
  [0.30,0.70,0.20],[0.20,0.20,0.70],[0.70,0.40,0.10],
  [0.50,0.90,0.70],[0.90,0.70,0.40],[0.40,0.20,0.90],
  [0.80,0.60,0.20],[0.20,0.60,0.80],
];

function _toothColor(label) {
  if (label === 0) return [0.93, 0.44, 0.80]; // gingiva: pink
  return _TOOTH_PALETTE[(label - 1) % _TOOTH_PALETTE.length];
}

// \u2500 Toggle debug mode \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function toggleDebugMode() {
  DEBUG_MODE = !DEBUG_MODE;
  const panel = document.getElementById('debug-panel');
  const btn   = document.getElementById('debug-mode-btn');
  const dbgOvl= document.getElementById('overlay-dbg');
  if (DEBUG_MODE) {
    panel.style.display  = 'flex';
    btn.style.background = 'linear-gradient(135deg,#3b1fa8,#6c63ff)';
    btn.style.color      = '#fff';
    btn.textContent      = '\ud83e\udde0 Debug ON';
    dbgOvl.style.display = 'inline';
    // Snapshot original colours
    _dbgOrigColors = colors.slice();
    // Auto-apply last selected viz if debug data is loaded
    if (_dbgData) _applyDebugViz(_dbgViz);
    else {
      document.getElementById('dbg-load-status').textContent =
        '\u26a0\ufe0f Click "Fetch AI Debug" to load debug data for visible case.';
    }
  } else {
    panel.style.display  = 'none';
    btn.style.background = 'linear-gradient(135deg,#1a1d27,#2d2060)';
    btn.style.color      = '#9f7afa';
    btn.textContent      = '\ud83e\udde0 Debug Mode';
    dbgOvl.style.display = 'none';
    // Restore original colours
    if (_dbgOrigColors) { colors = _dbgOrigColors.slice(); render(); }
  }
}

// \u2500 Set active debug visualisation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function dbgSetViz(type) {
  _dbgViz = type;
  // Highlight active button
  ['tooth_labels','gingiva','boundary','confidence'].forEach(t => {
    const el = document.getElementById('dbg-' + t.replace('tooth_labels','tooth-labels').replace('_','-'));
    if (el) el.classList.toggle('active', t === type);
  });
  if (!_dbgData) {
    document.getElementById('dbg-load-status').textContent = '\u26a0\ufe0f Load debug data first.';
    return;
  }
  _applyDebugViz(type);
}

// \u2500 Core: recolour the point cloud with debug data \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function _applyDebugViz(type) {
  if (!_dbgData) return;
  const N = points.length / 3;  // number of points in the scene
  const labels = _dbgData.tooth_labels  || [];
  const conf   = _dbgData.confidence    || [];
  const bnd    = _dbgData.boundaries    || [];

  // Build a fresh colour flat-array (length = N * 3)
  const newCols = new Float32Array(N * 3);

  for (let i = 0; i < N; i++) {
    let r = 0.3, g = 0.3, b = 0.3;   // default dark grey

    if (type === 'tooth_labels') {
      // Every tooth class gets a distinct colour; gingiva = pink
      const lbl = labels[i] != null ? labels[i] : 0;
      [r, g, b] = _toothColor(lbl);

    } else if (type === 'gingiva') {
      // Binary: gingiva = warm pink, teeth = clean white
      const lbl = labels[i] != null ? labels[i] : 0;
      if (lbl === 0) { r=0.93; g=0.44; b=0.80; }   // pink \u2014 gingiva
      else           { r=0.94; g=0.95; b=0.96; }   // near-white \u2014 tooth

    } else if (type === 'boundary') {
      // Yellow boundary edges, dark interior
      const isBnd = bnd[i];
      if (isBnd) { r=1.00; g=0.90; b=0.10; }       // vivid yellow
      else       { r=0.10; g=0.12; b=0.18; }       // very dark blue-grey

    } else if (type === 'confidence') {
      // Gradient: green = confident (1.0), red = uncertain (0.0)
      const c  = conf[i] != null ? Math.max(0, Math.min(1, conf[i])) : 0.5;
      r = 1.0 - c;   // high c \u2192 low red
      g = c;          // high c \u2192 high green
      b = 0.10;
    }

    newCols[i*3]   = r;
    newCols[i*3+1] = g;
    newCols[i*3+2] = b;
  }

  // Replace colour buffer and re-upload to WebGL
  colors = Array.from(newCols);
  render();
}

// \u2500 Load debug data from the backend \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function loadDebugData() {
  const sel = document.getElementById('case-select');
  const caseId = sel ? sel.value : '';
  if (!caseId) {
    document.getElementById('dbg-load-status').textContent = '\u26a0\ufe0f Select a case first.';
    return;
  }
  document.getElementById('dbg-load-status').textContent = '\u23f3 Loading...';
  try {
    const resp = await fetch('/api/debug/' + encodeURIComponent(caseId));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    _dbgData = await resp.json();
    _updateDebugStats(_dbgData);
    document.getElementById('dbg-load-status').textContent =
      '\u2713 Debug data loaded (' + caseId + ')';
    // Snapshot before we modify colours
    _dbgOrigColors = colors.slice();
    _applyDebugViz(_dbgViz);
  } catch(e) {
    document.getElementById('dbg-load-status').textContent = '\u274c Error: ' + e.message;
  }
}

// \u2500 Update stats panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function _updateDebugStats(d) {
  const s = v => v != null ? v : '\u2014';
  const pct = v => v != null ? (v*100).toFixed(1)+'%' : '\u2014';
  document.getElementById('dbg-v-teeth').textContent    = s(d.detected_teeth);
  document.getElementById('dbg-v-gingfrac').textContent = pct(d.gingiva_fraction);
  document.getElementById('dbg-v-bnd').textContent      = s(d.boundary_count);
  document.getElementById('dbg-v-conf').textContent     =
    d.avg_confidence != null ? d.avg_confidence.toFixed(3) : '\u2014';

  const miss = d.missing_teeth || [];
  const missEl = document.getElementById('dbg-v-miss');
  if (miss.length) {
    missEl.textContent = miss.join(', ');
    missEl.style.color = '#ff6584';
  } else {
    missEl.textContent = 'None detected';
    missEl.style.color = '#43e97b';
  }

  // Issues list
  const issues = d.issues || [];
  const issEl = document.getElementById('dbg-issues');
  if (issues.length) {
    issEl.innerHTML = issues.map(i =>
      `<div style="margin-bottom:5px;padding:5px 8px;background:rgba(255,101,132,.1);border-left:3px solid #ff6584;border-radius:3px;font-size:11px">\u26a0\ufe0f ${i}</div>`
    ).join('');
  } else {
    issEl.innerHTML =
      '<div style="color:#43e97b;font-size:11px">\u2713 No issues detected</div>';
  }
}

// \u2500 Keyboard shortcut: D = toggle debug \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
window.addEventListener('keydown', (e) => {
  // Ignore when typing in an input/select/textarea
  if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)) return;
  if (e.key === 'd' || e.key === 'D') {
    toggleDebugMode();
  }
});

</script>

<!-- ══ Three.js Viewer Bridge (module) ═════════════════════════════════════ -->
<script type="module">
/**
 * viewer_bridge.js (inline module)
 *
 * Provides a Three.js-powered STL renderer alongside the existing native-WebGL
 * point-cloud viewer.  Activated by calling window.threeViewer.loadSTL(url)
 * from the existing UI buttons or from the console.
 *
 * Features
 * ────────
 *   • STL loading via THREE.STLLoader (binary + ASCII)
 *   • Per-face segmentation colour overlay
 *   • OrbitControls: rotate / zoom / pan
 *   • Correction brush: repaint face labels by radius click+drag
 *   • Draggable landmark spheres
 *   • Runtime safety check + init log
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader }     from "three/addons/loaders/STLLoader.js";

// ─ Runtime safety check ───────────────────────────────────────────────────────
if (!THREE) {
  console.error("[viewer_bridge] Three.js failed to load — check CDN or network.");
  throw new Error("Three.js unavailable");
}

// ─ Tooth colour palette (label 0 = gingiva, 1–32 = teeth) ───────────────
const TOOTH_PALETTE = [
  0xee3333, 0x1a99e0, 0x2ee07a,  0xf7cc18, 0xd420d4, 0x18d4d4,
  0xff8020, 0x8844bb, 0x4d4dff,  0x80e618, 0xe68090, 0x20cc80,
  0xcc4db8, 0x60cce8, 0x999918,  0x801890, 0x208020, 0xcccccc,
  0xf36018, 0x18b8b8, 0xb3182a,  0x1860e0, 0x99e84d, 0xe3186d,
  0x4db833, 0x3333b3, 0xb36618,  0x80e6b3, 0xe6b365, 0x663de6,
  0xcca033, 0x3399cc,
];

/** Return a THREE.Color for a label integer */
function labelColor(label) {
  if (label === 0) return new THREE.Color(0xee70cc); // gingiva
  return new THREE.Color(TOOTH_PALETTE[(label - 1) % TOOTH_PALETTE.length]);
}

// ─ Canvas + renderer ────────────────────────────────────────────────────────

// Create a secondary canvas overlaid on the canvas-wrap div.
// It sits behind the native WebGL canvas and is activated when
// Three.js mode is explicitly enabled.
const _wrap = document.querySelector('.canvas-wrap');
const _threeCanvas = document.createElement('canvas');
_threeCanvas.id = 'three-canvas';
_threeCanvas.style.cssText = [
  'position:absolute', 'inset:0', 'width:100%', 'height:100%',
  'display:none', 'z-index:5', 'border-radius:inherit',
].join(';');
if (_wrap) _wrap.appendChild(_threeCanvas);

const renderer = new THREE.WebGLRenderer({
  canvas: _threeCanvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(_threeCanvas.clientWidth || 800, _threeCanvas.clientHeight || 500);
renderer.shadowMap.enabled = true;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x0f1117);

const camera = new THREE.PerspectiveCamera(45, 1.6, 0.01, 1000);
camera.position.set(0, 0, 100);

const controls = new OrbitControls(camera, _threeCanvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 500;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(50, 80, 60);
dirLight.castShadow = true;
scene.add(dirLight);
scene.add(new THREE.DirectionalLight(0x8888ff, 0.3).position.set(-30, -40, -30));

// ─ State ─────────────────────────────────────────────────────────────────
let _currentMesh   = null;  // THREE.Mesh for the loaded STL
let _faceLabels    = [];    // per-face label array

// Correction brush
let _brushActive   = false;
let _brushRadius   = 5.0;   // world-space radius
let _brushLabel    = 1;     // label to paint
const _raycaster   = new THREE.Raycaster();
const _mouse       = new THREE.Vector2();

// Landmarks
const _landmarks   = [];    // [{sphere, id, label}] draggable landmark spheres
let   _dragLM      = null;  // currently dragged landmark

// ─ Render loop ──────────────────────────────────────────────────────────
(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();

// Keep canvas / camera in sync with container resize
const _resizeObs = new ResizeObserver(() => {
  if (!_threeCanvas.parentElement) return;
  const w = _threeCanvas.clientWidth;
  const h = _threeCanvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
if (_wrap) _resizeObs.observe(_wrap);

// ─ STL loading ───────────────────────────────────────────────────────────

/**
 * Load an STL from url, replace current mesh, apply optional per-face labels.
 * @param {string}   url       - URL to .stl file or data URI
 * @param {number[]?} labels   - optional per-face label array
 */
async function loadSTL(url, labels = null) {
  return new Promise((resolve, reject) => {
    const loader = new STLLoader();
    loader.load(
      url,
      (geometry) => {
        // Remove old mesh
        if (_currentMesh) { scene.remove(_currentMesh); _currentMesh.geometry.dispose(); }

        // Ensure non-indexed for per-face colours
        const geom = geometry.index ? geometry.toNonIndexed() : geometry;
        geom.computeVertexNormals();

        const faceCount = geom.attributes.position.count / 3;
        _faceLabels = labels ? labels.slice(0, faceCount) : new Array(faceCount).fill(1);

        // Build vertex colour attribute (3 verts per face, all same colour)
        const colorArr = new Float32Array(geom.attributes.position.count * 3);
        for (let f = 0; f < faceCount; f++) {
          const lbl = _faceLabels[f] ?? 1;
          const col = labelColor(lbl);
          for (let v = 0; v < 3; v++) {
            const idx = (f * 3 + v) * 3;
            colorArr[idx]     = col.r;
            colorArr[idx + 1] = col.g;
            colorArr[idx + 2] = col.b;
          }
        }
        geom.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));

        const mat = new THREE.MeshPhongMaterial({
          vertexColors: true,
          shininess: 60,
          side: THREE.DoubleSide,
        });
        _currentMesh = new THREE.Mesh(geom, mat);
        _currentMesh.castShadow    = true;
        _currentMesh.receiveShadow = true;
        scene.add(_currentMesh);

        // Auto-fit camera
        const box    = new THREE.Box3().setFromObject(_currentMesh);
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3()).length();
        controls.target.copy(center);
        camera.position.copy(center).addScaledVector(new THREE.Vector3(0, 0.4, 1).normalize(), size * 1.6);
        controls.update();

        // Show Three.js canvas, hide WebGL canvas
        _threeCanvas.style.display = 'block';
        const nativeCanvas = document.getElementById('viewer-canvas');
        if (nativeCanvas) nativeCanvas.style.display = 'none';

        console.log(`[viewer_bridge] STL loaded: ${faceCount} faces, ${_faceLabels.length} labels`);
        resolve({ faceCount, labelCount: new Set(_faceLabels).size });
      },
      undefined,
      (err) => {
        console.error('[viewer_bridge] STL load failed:', err);
        reject(err);
      }
    );
  });
}

// ─ Segmentation overlay ───────────────────────────────────────────────────

/** Apply per-face label colours to the currently loaded mesh. */
function applySegmentation(labels) {
  if (!_currentMesh) return;
  const geom = _currentMesh.geometry;
  const colorArr = geom.attributes.color.array;
  const faceCount = geom.attributes.position.count / 3;
  _faceLabels = labels.slice(0, faceCount);

  for (let f = 0; f < faceCount; f++) {
    const lbl = _faceLabels[f] ?? 0;
    const col = labelColor(lbl);
    for (let v = 0; v < 3; v++) {
      const idx = (f * 3 + v) * 3;
      colorArr[idx]     = col.r;
      colorArr[idx + 1] = col.g;
      colorArr[idx + 2] = col.b;
    }
  }
  geom.attributes.color.needsUpdate = true;
}

// ─ Correction brush ─────────────────────────────────────────────────────────

function _getNDC(e) {
  const rect = _threeCanvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((e.clientX - rect.left)  / rect.width)  * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
}

/** Paint all faces within world-radius _brushRadius of the hit point. */
function _brushPaint(e) {
  if (!_brushActive || !_currentMesh) return;
  const ndc = _getNDC(e);
  _raycaster.setFromCamera(ndc, camera);
  const hits = _raycaster.intersectObject(_currentMesh);
  if (!hits.length) return;

  const hitPt  = hits[0].point;
  const geom   = _currentMesh.geometry;
  const pos    = geom.attributes.position;
  const colArr = geom.attributes.color.array;
  const faceCount = pos.count / 3;

  const col = labelColor(_brushLabel);
  let changed = false;

  for (let f = 0; f < faceCount; f++) {
    // Centroid of face
    const base = f * 3;
    const cx = (pos.getX(base)   + pos.getX(base+1) + pos.getX(base+2)) / 3;
    const cy = (pos.getY(base)   + pos.getY(base+1) + pos.getY(base+2)) / 3;
    const cz = (pos.getZ(base)   + pos.getZ(base+1) + pos.getZ(base+2)) / 3;
    const dx = cx - hitPt.x, dy = cy - hitPt.y, dz = cz - hitPt.z;
    if (dx*dx + dy*dy + dz*dz > _brushRadius * _brushRadius) continue;

    _faceLabels[f] = _brushLabel;
    for (let v = 0; v < 3; v++) {
      const idx = (f * 3 + v) * 3;
      colArr[idx]     = col.r;
      colArr[idx + 1] = col.g;
      colArr[idx + 2] = col.b;
    }
    changed = true;
  }
  if (changed) geom.attributes.color.needsUpdate = true;
}

_threeCanvas.addEventListener('mousedown', (e) => {
  if (_brushActive) { controls.enabled = false; _brushPaint(e); }
});
_threeCanvas.addEventListener('mousemove', (e) => {
  if (_brushActive && e.buttons === 1) _brushPaint(e);
});
_threeCanvas.addEventListener('mouseup',   () => { controls.enabled = !_brushActive; });

// ─ Landmark drag ──────────────────────────────────────────────────────────────

/**
 * Add a draggable sphere landmark.
 * @param {string}   id     - unique landmark id
 * @param {number[]} pos3   - [x, y, z] world position
 * @param {number}   label  - tooth label for colour
 * @param {number}   radius - sphere radius (default 1.5)
 */
function addLandmark(id, pos3, label = 0, radius = 1.5) {
  // Remove existing landmark with same id
  removeLandmark(id);
  const geom   = new THREE.SphereGeometry(radius, 16, 12);
  const mat    = new THREE.MeshPhongMaterial({ color: labelColor(label), emissive: labelColor(label), emissiveIntensity: 0.4 });
  const sphere = new THREE.Mesh(geom, mat);
  sphere.position.set(...pos3);
  scene.add(sphere);
  _landmarks.push({ sphere, id, label });
  return sphere;
}

function removeLandmark(id) {
  const idx = _landmarks.findIndex(lm => lm.id === id);
  if (idx < 0) return;
  const { sphere } = _landmarks.splice(idx, 1)[0];
  scene.remove(sphere);
  sphere.geometry.dispose();
}

function clearLandmarks() {
  [..._landmarks].forEach(lm => removeLandmark(lm.id));
}

// Drag logic — project mouse onto plane perpendicular to camera at landmark depth
_threeCanvas.addEventListener('mousedown', (e) => {
  if (_brushActive) return;
  const ndc  = _getNDC(e);
  _raycaster.setFromCamera(ndc, camera);
  const spheres = _landmarks.map(lm => lm.sphere);
  const hits    = _raycaster.intersectObjects(spheres);
  if (!hits.length) return;
  _dragLM = hits[0].object;
  controls.enabled = false;
});

_threeCanvas.addEventListener('mousemove', (e) => {
  if (!_dragLM) return;
  const ndc   = _getNDC(e);
  _raycaster.setFromCamera(ndc, camera);
  // Plane at landmark's current Z (camera-local)
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    camera.getWorldDirection(new THREE.Vector3()),
    _dragLM.position
  );
  const target = new THREE.Vector3();
  _raycaster.ray.intersectPlane(plane, target);
  if (target) _dragLM.position.copy(target);
});

_threeCanvas.addEventListener('mouseup', () => {
  if (_dragLM) {
    _dragLM = null;
    controls.enabled = true;
  }
});

// ─ Public API exposed on window.threeViewer ──────────────────────────────

window.threeViewer = {
  /** Load STL from URL and optionally apply per-face label array */
  loadSTL,

  /** Apply per-face segmentation (array of int labels, one per face) */
  applySegmentation,

  /** Enable/disable correction brush */
  setBrush({ active = true, radius = 5, label = 1 } = {}) {
    _brushActive = active;
    _brushRadius = radius;
    _brushLabel  = label;
    controls.enabled = !active;
    _threeCanvas.style.cursor = active ? 'crosshair' : 'grab';
  },

  /** Add a draggable landmark sphere */
  addLandmark,
  removeLandmark,
  clearLandmarks,

  /** Return current per-face label array (snapshot) */
  getLabels: () => _faceLabels.slice(),

  /** Return landmark positions: [{id, x, y, z, label}] */
  getLandmarks: () => _landmarks.map(lm => ({
    id:    lm.id,
    label: lm.label,
    x:     lm.sphere.position.x,
    y:     lm.sphere.position.y,
    z:     lm.sphere.position.z,
  })),

  /** Switch back to the native WebGL point-cloud renderer */
  hide() {
    _threeCanvas.style.display = 'none';
    const nc = document.getElementById('viewer-canvas');
    if (nc) nc.style.display = 'block';
  },

  THREE,
  renderer,
  scene,
  camera,
  controls,
};

console.log('[viewer_bridge] Three.js viewer initialized — r' + THREE.REVISION);
</script>

</body></html>"""


# ─────────────────────────────────────────────────────────────────────────────
# Flask app
# ─────────────────────────────────────────────────────────────────────────────

def create_app(
    log_dir: str,
    data_root: Optional[str] = None,
    cases_dir: Optional[str] = None,
) -> "Flask":
    app = Flask(__name__)
    log_path   = Path(log_dir)
    data_path  = Path(data_root)  if data_root  else None

    # STL cases directory — anchored to the project root (parent of this file)
    # so it works correctly regardless of CWD at server startup.
    _project_root = Path(__file__).resolve().parent.parent
    _default_cases = _project_root / "datasets" / "cases"
    cases_path = Path(cases_dir).resolve() if cases_dir else _default_cases
    cases_path.mkdir(parents=True, exist_ok=True)   # ensure it exists

    def _read_json(p: Path) -> Optional[dict | list]:
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return None

    @app.route("/")
    def index():
        return render_template_string(DASHBOARD_HTML)

    @app.route("/viewer")
    def viewer():
        return render_template_string(VIEWER_HTML)

    @app.route("/api/hard-cases")
    def api_hard_cases():
        data = _read_json(log_path / "hard_cases.json") or []
        return jsonify([c for c in data if isinstance(c, dict) and c.get("difficulty", 0) > 0])

    @app.route("/api/all-cases")
    def api_all_cases():
        data = _read_json(log_path / "difficulty_report.json") \
            or _read_json(log_path / "hard_cases.json") or []
        return jsonify(data)

    @app.route("/api/training-status")
    def api_training_status():
        metrics = _read_json(log_path / "training_metrics.json") or {}
        session = _read_json(log_path / "session_status.json") or {}
        return jsonify({
            "session": session,
            "history": metrics.get("history", []),
            "total_epochs": metrics.get("total_epochs"),
        })

    @app.route("/api/dataset-stats")
    def api_dataset_stats():
        report = _read_json(log_path / "dataset_validation.json")
        if report and "summary" in report:
            return jsonify(report["summary"])
        return jsonify({})

    @app.route("/api/system")
    def api_system():
        return jsonify(_get_system_metrics())

    @app.route("/api/preview-mesh")
    def api_preview_mesh():
        """
        GET /api/preview-mesh
        Return the latest 3-D segmentation preview snapshot written by the
        training loop (preview_mesh.json).  Returns 404 if no preview exists yet.
        """
        data = _read_json(log_path / "preview_mesh.json")
        if not data:
            return jsonify({"error": "No preview available yet"}), 404
        return jsonify(data)

    @app.route("/api/case-points")
    def api_case_points():
        """Return points + labels for a case as JSON (for the 3D viewer)."""
        import numpy as np
        case = request.args.get("case", "")

        # Demo: generate synthetic data
        if case == "demo" or not case:
            rng = np.random.default_rng(42)
            n = 2000
            pts = rng.uniform(-10, 10, (n, 3)).astype(float)
            lbl = rng.integers(0, 9, n).tolist()
            return jsonify({"points": pts.flatten().tolist(), "labels": lbl})

        # Real case
        search_roots = [data_path] if data_path else []
        search_roots += [log_path.parent / "datasets" / d for d in
                         ["synthetic_cases", "boundary_aware_cases", "cases"]]
        for root in search_roots:
            if root is None:
                continue
            case_dir = root / case
            if (case_dir / "points.npy").exists():
                pts = np.load(case_dir / "points.npy").astype(float)
                lbl_path = case_dir / "tooth_labels.npy"
                lbl = np.load(lbl_path).tolist() if lbl_path.exists() else [0] * len(pts)
                return jsonify({"points": pts.flatten().tolist(), "labels": lbl})

        return jsonify({"error": "Case not found"}), 404

    @app.route("/api/case-mesh-overlay")
    def api_case_mesh_overlay():
        """
        Return STL mesh with per-vertex segmentation labels.

        Reads the STL from datasets/cases/{case_id}/maxillary.stl (or mandibular),
        parses triangle vertices + normals, then uses a KDTree to map each mesh
        vertex to the nearest segmentation point from the dataset.

        Query params:
            case  — case ID (directory name)
            arch  — 'maxillary' or 'mandibular' (default: maxillary)

        Returns JSON:
            {
              vertices:  [x,y,z, ...],      // flat, 3 per triangle vertex
              normals:   [nx,ny,nz, ...],    // flat, per-vertex face normal
              labels:    [l, ...],           // one label per vertex
              tri_count: N,
              case_id:   str,
              arch:      str
            }
        """
        import struct
        import numpy as np

        case = request.args.get("case", "")
        arch = request.args.get("arch", "maxillary")
        if not case:
            return jsonify({"error": "Missing 'case' parameter"}), 400

        # --- Locate STL file ---
        stl_path = cases_path / case / f"{arch}.stl"
        if not stl_path.exists():
            return jsonify({
                "error": f"STL not found: {arch}.stl",
                "hint": f"Expected at: {stl_path}",
            }), 404

        # --- Parse binary STL ---
        stl_data = stl_path.read_bytes()
        if len(stl_data) < 84:
            return jsonify({"error": "STL file too small"}), 400

        num_tri = struct.unpack_from("<I", stl_data, 80)[0]
        expected = 84 + num_tri * 50
        is_binary = len(stl_data) >= expected

        if is_binary:
            # Binary STL parse
            vertices = []
            normals  = []
            offset   = 84
            for _ in range(num_tri):
                nx, ny, nz = struct.unpack_from("<fff", stl_data, offset)
                offset += 12
                for _ in range(3):
                    vx, vy, vz = struct.unpack_from("<fff", stl_data, offset)
                    offset += 12
                    vertices.extend([vx, vy, vz])
                    normals.extend([nx, ny, nz])  # face normal broadcast to all 3 vertices
                offset += 2  # attribute byte count
        else:
            # ASCII STL fallback
            import re
            text = stl_data.decode("utf-8", errors="replace")
            facet_re = re.compile(
                r"facet\s+normal\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)"
            )
            vertex_re = re.compile(
                r"vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)"
            )
            vertices = []
            normals  = []
            current_normal = [0.0, 0.0, 1.0]
            for line in text.splitlines():
                fm = facet_re.search(line)
                if fm:
                    current_normal = [float(fm.group(i)) for i in (1, 2, 3)]
                vm = vertex_re.search(line)
                if vm:
                    vertices.extend([float(vm.group(i)) for i in (1, 2, 3)])
                    normals.extend(current_normal)
            num_tri = len(vertices) // 9

        mesh_verts = np.array(vertices, dtype=np.float32).reshape(-1, 3)

        # --- Load segmentation points + labels ---
        seg_points = None
        seg_labels = None

        # Try dataset npz/npy next to log_path
        for root in [data_path, log_path.parent / "datasets" / "synthetic_cases" / case,
                      log_path.parent / "datasets" / "cases" / case]:
            if root is None:
                continue
            pts_path = root / "points.npy" if isinstance(root, Path) else Path(root) / "points.npy"
            lbl_path = root / "tooth_labels.npy" if isinstance(root, Path) else Path(root) / "tooth_labels.npy"
            if pts_path.exists() and lbl_path.exists():
                seg_points = np.load(str(pts_path)).astype(np.float32)
                seg_labels = np.load(str(lbl_path)).astype(np.int32)
                if seg_labels.shape[0] == 0:
                    seg_points = None
                    seg_labels = None
                break

        if seg_points is not None and seg_labels is not None:
            # --- KDTree nearest-neighbor mapping (Step 4) ---
            try:
                from scipy.spatial import cKDTree
                tree = cKDTree(seg_points[:, :3])
                _, indices = tree.query(mesh_verts, k=1)
                mesh_labels = seg_labels[indices].tolist()
            except ImportError:
                # Fallback: brute-force (slower but no scipy needed)
                mesh_labels = []
                for v in mesh_verts:
                    dists = np.sum((seg_points[:, :3] - v) ** 2, axis=1)
                    mesh_labels.append(int(seg_labels[np.argmin(dists)]))
        else:
            # No segmentation data available — assign label 0 (gingiva) to all
            mesh_labels = [0] * len(mesh_verts)

        return jsonify({
            "vertices":  vertices,
            "normals":   normals,
            "labels":    mesh_labels,
            "tri_count": num_tri,
            "case_id":   case,
            "arch":      arch,
        })

    @app.route("/api/case-graph")
    def api_case_graph():
        """Return tooth centroids and adjacency matrix for the 3D viewer Tooth Graph mode."""
        import numpy as np
        case = request.args.get("case", "")

        # Load points + labels (same resolution logic as /api/case-points)
        search_roots_p = [data_path] if data_path else []
        search_roots_p += [log_path.parent / "datasets" / d for d in
                           ["synthetic_cases", "boundary_aware_cases", "cases"]]

        pts_arr, lbl_arr = None, None
        if case and case != "demo":
            for root in search_roots_p:
                if root is None:
                    continue
                case_dir = root / case
                if (case_dir / "points.npy").exists():
                    pts_arr = np.load(case_dir / "points.npy").astype(np.float32)
                    lp = case_dir / "tooth_labels.npy"
                    lbl_arr = np.load(lp).astype(np.int64) if lp.exists() else np.zeros(len(pts_arr), dtype=np.int64)
                    break

        if pts_arr is None:
            # Synthetic demo
            rng = np.random.default_rng(42)
            pts_arr = rng.uniform(-10, 10, (500, 3)).astype(np.float32)
            lbl_arr = rng.integers(0, 9, 500).astype(np.int64)

        try:
            import torch
            from geometry.tooth_graph import compute_tooth_centroids, build_tooth_adjacency
            pts_t = torch.from_numpy(pts_arr).unsqueeze(0)    # (1,N,3)
            lbl_t = torch.from_numpy(lbl_arr).unsqueeze(0)    # (1,N)
            centroids, valid = compute_tooth_centroids(pts_t, lbl_t, 33)
            adj = build_tooth_adjacency(centroids, valid, k=3)
            cent_list = centroids[0].tolist()   # (T,3)
            adj_list  = adj[0].tolist()          # (T,T)
            return jsonify({"centroids": cent_list, "adj": adj_list, "num_teeth": int(valid[0].sum().item())})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ── STL file serving (Step 2-4) ──────────────────────────────────────────
    @app.route("/cases/<case_id>/<path:filename>")
    def serve_stl(case_id: str, filename: str):
        """
        Serve STL files from {cases_dir}/{case_id}/{filename}.

        Example:
            GET /cases/case001/maxillary.stl
            GET /cases/case001/mandibular.stl

        Returns 200 with the raw binary STL, or 404 if not found.
        The Content-Disposition header is set so browsers download the file.
        """
        # Security: block path traversal
        if ".." in case_id or ".." in filename:
            return jsonify({"error": "Invalid path"}), 400

        stl_path = cases_path / case_id / filename
        if not stl_path.exists():
            return jsonify(
                {"error": f"File not found: cases/{case_id}/{filename}",
                 "hint": f"Expected at: {stl_path}"}
            ), 404

        # Detect MIME type
        fname_lower = filename.lower()
        if fname_lower.endswith(".stl"):
            mimetype = "model/stl"
        elif fname_lower.endswith(".obj"):
            mimetype = "model/obj"
        elif fname_lower.endswith(".ply"):
            mimetype = "application/octet-stream"
        else:
            mimetype = "application/octet-stream"

        return send_file(
            stl_path,
            mimetype=mimetype,
            as_attachment=False,   # inline — browser/Three.js can fetch it
            download_name=filename,
        )

    @app.route("/api/cases")
    def api_cases():
        """List all case directories that exist under cases_dir."""
        if not cases_path.exists():
            return jsonify([])
        case_list = []
        for d in sorted(cases_path.iterdir()):
            if not d.is_dir():
                continue
            files = [f.name for f in d.iterdir() if f.is_file()]
            case_list.append({
                "case_id": d.name,
                "files": files,
                "has_maxillary": "maxillary.stl" in files,
                "has_mandibular": "mandibular.stl" in files,
                "stl_count": sum(1 for f in files if f.endswith(".stl")),
            })
        return jsonify(case_list)

    # ── Occlusal Plane API (Steps 1 & 4) ────────────────────────────────────────
    _occ_store = log_path / "occlusal_planes.json"

    def _load_occ_store():
        if _occ_store.exists():
            try:
                return json.loads(_occ_store.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {}

    def _save_occ_store(data: dict):
        _occ_store.parent.mkdir(parents=True, exist_ok=True)
        _occ_store.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    @app.route("/api/case/<case_id>/occlusal_plane", methods=["POST"])
    def api_save_occlusal_plane(case_id: str):
        """
        Save the fitted occlusal plane definition for a case.

        Body (JSON):
            {
              "normal":   [nx, ny, nz],
              "origin":   {"x": ..., "y": ..., "z": ...},
              "rotation": [r00, r01, ..., r22],   // row-major 3x3 flat
              "picks":    [{"x": ..., "y": ..., "z": ...}, ...]  // 3 control points
            }
        """
        import datetime
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400
        payload = request.get_json(force=True)
        # Validate minimum shape
        for key in ("normal", "origin", "rotation"):
            if key not in payload:
                return jsonify({"error": f"Missing field: {key}"}), 422
        payload["case_id"]   = case_id
        payload["saved_at"]  = datetime.datetime.utcnow().isoformat() + "Z"
        store = _load_occ_store()
        store[case_id] = payload
        _save_occ_store(store)
        return jsonify({"status": "saved", "case_id": case_id, "saved_at": payload["saved_at"]})

    @app.route("/api/case/<case_id>/occlusal_plane", methods=["GET"])
    def api_get_occlusal_plane(case_id: str):
        """Retrieve the saved occlusal plane for a case (or 404 if none)."""
        store = _load_occ_store()
        if case_id not in store:
            return jsonify({"error": "No occlusal plane saved for this case"}), 404
        return jsonify(store[case_id])

    @app.route("/api/case/<case_id>/gingival_margin", methods=["GET"])
    def api_gingival_margin(case_id: str):
        """
        Return gingival margin data for a case.

        Reads pre-computed gingival_margin_vertices.npy + gingiva_meta.json
        from the case directory.  If neither exists, returns 404.

        Response (200 OK)
        -----------------
        {
          "case_id": "case001",
          "margin_vertices": [[x,y,z], ...],   // 3D coordinates of margin ring
          "margin_vertex_count": 842,
          "n_gingiva_faces": 12450,
          "n_tooth_faces":  28332,
          "n_components": 14,
          "component_sizes": [80, 76, ...],
          "timing_s": { "curvature_s": 1.2, ... },
          "source": "auto_detected" | "precomputed"
        }

        Error (404) if no margin data exists for this case.
        Error (503) if meshnet module unavailable and no precomputed data.

        Viewer Integration
        ------------------
        The frontend can render margin_vertices as a green point cloud or
        tube overlay on the existing 3D viewer (Three.js PointsMaterial).
        """
        # ── Try to load precomputed margin data ────────────────────────────
        case_dir = cases_path / case_id
        if not case_dir.exists():
            return jsonify({"error": f"Case '{case_id}' not found"}), 404

        margin_npy = case_dir / "gingival_margin_vertices.npy"
        meta_json  = case_dir / "gingiva_meta.json"
        pts_npy    = case_dir / "points.npy"

        # ── If precomputed margin exists, serve it immediately ─────────────
        if margin_npy.exists():
            margin_idx = np.load(str(margin_npy)).tolist()
            meta_data: dict = {}
            if meta_json.exists():
                try:
                    with open(meta_json) as f:
                        meta_data = json.load(f)
                except Exception:
                    pass

            # Resolve coordinates: prefer points.npy, else report indices only
            margin_coords: list = []
            raw_stl = meta_data.get("source_stl") or ""

            if pts_npy.exists():
                try:
                    pts = np.load(str(pts_npy))
                    # Clamp indices to valid range
                    valid_idx = [i for i in margin_idx if i < len(pts)]
                    margin_coords = pts[valid_idx].tolist()
                except Exception:
                    margin_coords = []

            response = {
                "case_id": case_id,
                "margin_vertices": margin_coords,
                "margin_vertex_count": len(margin_idx),
                "n_gingiva_faces": meta_data.get("n_gingiva_faces", 0),
                "n_tooth_faces": meta_data.get("n_tooth_faces", 0),
                "n_components": meta_data.get("n_components", 0),
                "component_sizes": meta_data.get("component_sizes", []),
                "curvature_threshold": meta_data.get("curvature_threshold"),
                "valley_threshold": meta_data.get("valley_threshold"),
                "timing_s": meta_data.get("timing_s", {}),
                "source": "precomputed",
            }
            return jsonify(response)

        # ── On-demand detection: run if meshnet available ──────────────────
        try:
            import sys as _sys
            _sys.path.insert(0, str(log_path.parent))
            from meshnet.gingiva_detection.gingiva_classifier import (
                detect_gingival_margin,
            )
            _meshnet_ok = True
        except ImportError:
            _meshnet_ok = False

        # Find the STL for this case
        stl_candidates = (
            list(case_dir.glob("*.stl")) + list(case_dir.glob("*.STL"))
        )

        if not stl_candidates:
            return jsonify({
                "error": (
                    f"No precomputed gingival margin for '{case_id}' and "
                    "no STL file found for on-demand detection."
                )
            }), 404

        if not _meshnet_ok:
            return jsonify({
                "error": (
                    "meshnet.gingiva_detection not available. "
                    "Run generate_dataset.py with --auto_gingiva to precompute, "
                    "or install meshnet module."
                ),
                "case_id": case_id,
            }), 503

        # Run on-demand detection
        try:
            import trimesh as _trimesh
            mesh = _trimesh.load(str(stl_candidates[0]), force="mesh", process=True)
            face_labels, margin_verts, gingiva_meta = detect_gingival_margin(mesh)

            # Cache the result
            margin_arr = np.array(margin_verts, dtype=np.int64)
            np.save(str(margin_npy), margin_arr)
            gingiva_meta["source_stl"] = str(stl_candidates[0])
            with open(meta_json, "w") as f:
                json.dump(gingiva_meta, f, indent=2)

            # Build coordinate list from mesh vertices
            verts = np.asarray(mesh.vertices, dtype=np.float32)
            step = max(1, len(margin_verts) // 2000)   # cap at ~2000 for API response
            margin_coords_live = verts[margin_verts[::step]].tolist()

            return jsonify({
                "case_id": case_id,
                "margin_vertices": margin_coords_live,
                "margin_vertex_count": len(margin_verts),
                "n_gingiva_faces": gingiva_meta.get("n_gingiva_faces", 0),
                "n_tooth_faces": gingiva_meta.get("n_tooth_faces", 0),
                "n_components": gingiva_meta.get("n_components", 0),
                "component_sizes": gingiva_meta.get("component_sizes", []),
                "curvature_threshold": gingiva_meta.get("curvature_threshold"),
                "valley_threshold": gingiva_meta.get("valley_threshold"),
                "timing_s": gingiva_meta.get("timing_s", {}),
                "source": "on_demand",
            })

        except Exception as exc:
            logger.exception("Gingival margin on-demand detection failed for %s", case_id)
            return jsonify({
                "error": f"Detection failed: {exc}",
                "case_id": case_id,
            }), 500

    # ── Preprocessing API ─────────────────────────────────────────────────────

    _PREPROCESS_PIPELINE_AVAILABLE = False
    try:
        import sys as _sys2
        _sys2.path.insert(0, str(log_path.parent))
        from meshnet.preprocessing.base_creation.preprocess_pipeline import (
            PreprocessPipeline as _DashPreprocessPipeline,
            detect_base as _dash_detect_base,
        )
        _PREPROCESS_PIPELINE_AVAILABLE = True
    except ImportError:
        pass

    @app.route("/api/preprocess_case", methods=["POST"])
    def api_preprocess_case():
        """
        POST /api/preprocess_case

        Accepts either:
          A) multipart file upload  — field name "stl_file"
          B) JSON body              — {"case_id": "case001"}

        Runs the full PreprocessPipeline and returns a JSON result with
        download URLs for the processed STL and debug outputs.

        Response 200  — success
        Response 400  — missing parameters
        Response 503  — preprocessing module unavailable
        Response 500  — processing error
        """
        if not _PREPROCESS_PIPELINE_AVAILABLE:
            return jsonify({
                "error": (
                    "meshnet.preprocessing.base_creation is not installed. "
                    "Ensure the meshnet package is on sys.path."
                )
            }), 503

        import tempfile
        import os as _os2

        stl_path_to_process: Optional[str] = None
        upload_case_id: str = "uploaded_scan"
        out_dir: Optional[str] = None

        # Branch A: File upload
        if "stl_file" in request.files:
            f = request.files["stl_file"]
            if not f.filename:
                return jsonify({"error": "Empty file upload"}), 400
            tmp = tempfile.mkdtemp(prefix="preprocess_")
            stl_path_to_process = _os2.path.join(tmp, f.filename)
            f.save(stl_path_to_process)
            upload_case_id = Path(f.filename).stem
            out_dir = tmp

        # Branch B: JSON case_id
        elif request.is_json and request.json and request.json.get("case_id"):
            upload_case_id = str(request.json["case_id"])
            case_d = cases_path / upload_case_id
            if not case_d.exists():
                return jsonify({"error": f"Case '{upload_case_id}' not found"}), 404
            stl_candidates = list(case_d.glob("*.stl")) + list(case_d.glob("*.STL"))
            if not stl_candidates and (case_d / "final_model.stl").exists():
                stl_candidates = [case_d / "final_model.stl"]
            if not stl_candidates:
                return jsonify({"error": f"No STL found for case '{upload_case_id}'"}), 404
            stl_path_to_process = str(stl_candidates[0])
            out_dir = str(case_d)
        else:
            return jsonify({
                "error": "Provide 'stl_file' upload or JSON {'case_id': '...'}"
            }), 400

        try:
            pipeline = _DashPreprocessPipeline(save_intermediates=True, overwrite=True)
            result = pipeline.run(stl_path_to_process, output_dir=out_dir)
            resp = result.to_dict()
            if result.success:
                resp["output_stl"]  = f"/api/case/{upload_case_id}/download/final_model.stl"
                resp["debug_files"] = {
                    "trimmed_scan":   f"/api/case/{upload_case_id}/download/trimmed_scan.stl",
                    "base_plane":     f"/api/case/{upload_case_id}/download/base_plane.stl",
                    "scan_with_base": f"/api/case/{upload_case_id}/download/scan_with_base.stl",
                    "final_model":    f"/api/case/{upload_case_id}/download/final_model.stl",
                }
            return jsonify(resp), (200 if result.success else 500)
        except Exception as exc:
            logger.exception("PreprocessPipeline failed for '%s'", upload_case_id)
            return jsonify({"error": str(exc), "case_id": upload_case_id}), 500

    @app.route("/api/case/<case_id>/preprocess_status", methods=["GET"])
    def api_preprocess_status(case_id: str):
        """
        GET /api/case/<case_id>/preprocess_status

        Returns whether a case has been preprocessed (has final_model.stl),
        together with preprocess_meta.json contents if available.
        """
        case_dir_pp = cases_path / case_id
        if not case_dir_pp.exists():
            return jsonify({"error": f"Case '{case_id}' not found"}), 404

        final_model_pp = case_dir_pp / "final_model.stl"
        meta_file_pp   = case_dir_pp / "preprocess_meta.json"
        meta_data_pp: dict = {}
        if meta_file_pp.exists():
            try:
                with open(meta_file_pp) as fh:
                    meta_data_pp = json.load(fh)
            except Exception:
                pass

        if final_model_pp.exists():
            return jsonify({
                "case_id": case_id,
                "preprocessed": True,
                "has_base_before": meta_data_pp.get("has_base_before"),
                "final_model": f"/api/case/{case_id}/download/final_model.stl",
                "debug_files": {
                    "trimmed_scan":   (case_dir_pp / "trimmed_scan.stl").exists(),
                    "base_plane":     (case_dir_pp / "base_plane.stl").exists(),
                    "scan_with_base": (case_dir_pp / "scan_with_base.stl").exists(),
                },
                "meta": meta_data_pp,
            })
        return jsonify({
            "case_id": case_id,
            "preprocessed": False,
            "has_base_before": None,
            "final_model": None,
            "meta": {},
        })

    @app.route("/api/case/<case_id>/download/<filename>", methods=["GET"])
    def api_download_case_file(case_id: str, filename: str):
        """
        GET /api/case/<case_id>/download/<filename>

        Download a file from a case directory.
        Whitelist: .stl, .npy, .json only.
        Download as attachment for .npy/.json; inline for .stl (viewer preview).
        """
        _allowed_ext = {".stl", ".npy", ".json"}
        ext = Path(filename).suffix.lower()
        if ext not in _allowed_ext:
            return jsonify({"error": "File type not allowed"}), 403
        file_path = cases_path / case_id / filename
        if not file_path.exists() or not file_path.is_file():
            return jsonify({"error": f"'{filename}' not found for case '{case_id}'"}), 404
        try:
            file_path.resolve().relative_to(cases_path.resolve())
        except ValueError:
            return jsonify({"error": "Access denied"}), 403
        return send_file(str(file_path), as_attachment=(ext != ".stl"))

    @app.route("/api/status")
    def api_status():
        return jsonify({"status": "ok", "log_dir": str(log_path),
                        "cases_dir": str(cases_path)})

    # ── Arch Curve API ────────────────────────────────────────────────────────
    @app.route("/api/case/<case_id>/arch_curve", methods=["GET"])
    def api_arch_curve(case_id: str):
        """
        Detect and return the dental arch curve for a case.

        Query parameters:
            n_points  (int)   — number of spline sample points (default 200)
            smoothing (float) — B-spline smoothing factor (default auto)
            plot      (bool)  — include base64 PNG in response (default false)

        Response JSON:
        {
          "success": true,
          "elapsed_s": 0.12,
          "occlusal_normal": [nx, ny, nz],
          "occlusal_origin": [ox, oy, oz],
          "centroids_3d": [[x,y,z], ...],
          "maxillary": {
            "curve_xy":   [[x,y], ...],
            "sorted_xy":  [[x,y], ...],
            "sorted_labels": [11, 12, ...],
            "fit_residual": 0.45,
            "arch_length_mm": 104.2,
            "intercanine_width_mm": 35.1,
            "intermolar_width_mm": 52.8
          },
          "mandibular": { ... },
          "max_curve_3d":  [[x,y,z], ...],
          "mand_curve_3d": [[x,y,z], ...],
          "plot_base64": "..."  (only if ?plot=1)
        }
        """
        import numpy as np
        import sys
        from pathlib import Path

        # Parse query params
        try:
            n_points  = int(request.args.get("n_points", 200))
            smoothing = request.args.get("smoothing", None)
            if smoothing is not None:
                smoothing = float(smoothing)
            include_plot = request.args.get("plot", "0").lower() in ("1", "true", "yes")
        except ValueError as exc:
            return jsonify({"error": f"Invalid query parameter: {exc}"}), 400

        # ── Load points + labels ──────────────────────────────────────────
        search_roots = [data_path] if data_path else []
        search_roots += [
            log_path.parent / "datasets" / d
            for d in ["synthetic_cases", "boundary_aware_cases", "cases"]
        ]

        pts_arr, lbl_arr = None, None
        if case_id and case_id != "demo":
            for root in search_roots:
                if root is None:
                    continue
                case_dir = root / case_id
                pts_p = case_dir / "points.npy"
                lbl_p = case_dir / "tooth_labels.npy"
                if pts_p.exists() and lbl_p.exists():
                    pts_arr = np.load(pts_p).astype(np.float32)
                    lbl_arr = np.load(lbl_p).astype(np.int64)
                    break

        if pts_arr is None:
            # Demo: generate synthetic arch data
            rng = np.random.default_rng(42)
            from meshnet.tests.test_arch_curve import _make_synthetic_arch
            pts_arr, lbl_arr = _make_synthetic_arch(n_points=6000)

        # ── Run arch detection ────────────────────────────────────────────
        try:
            _engine_root = Path(__file__).resolve().parents[1]
            if str(_engine_root) not in sys.path:
                sys.path.insert(0, str(_engine_root))

            from meshnet.arch_analysis.arch_detection import detect_arch_curve
            from meshnet.arch_analysis.arch_measurements import compute_case_measurements
            from meshnet.arch_analysis.arch_visualization import render_arch_to_base64

            result = detect_arch_curve(
                pts_arr, lbl_arr,
                num_classes=33,
                n_curve_points=n_points,
                smoothing=smoothing,
            )

            response = result.to_dict()

            # ── Attach measurements inline ────────────────────────────────
            meas = compute_case_measurements(
                result.maxillary,
                result.mandibular,
                result.centroids_3d,
                result.centroids_valid,
            )

            for arch_type in ("maxillary", "mandibular"):
                m = meas.get(arch_type)
                if m is not None and response.get(arch_type) is not None:
                    response[arch_type].update({
                        "arch_length_mm":        m.arch_length_mm,
                        "intercanine_width_mm":  m.intercanine_width_mm,
                        "intermolar_width_mm":   m.intermolar_width_mm,
                        "curve_of_spee_depth_mm": m.curve_of_spee_depth_mm,
                        "crowding_index":        m.crowding_index,
                        "symmetry_index":        m.symmetry_index,
                        "bolton_ratio":          m.bolton_ratio,
                        "notes":                 m.notes,
                    })

            # ── Optional PNG plot ─────────────────────────────────────────
            if include_plot:
                response["plot_base64"] = render_arch_to_base64(
                    max_spline=result.maxillary,
                    mand_spline=result.mandibular,
                    case_id=case_id,
                )

            return jsonify(response)

        except Exception as exc:
            import traceback
            return jsonify({
                "success": False,
                "error": str(exc),
                "trace": traceback.format_exc(),
            }), 500

    # ─────────────────────────────────────────────────────────────────────────
    # Dataset Manager APIs
    # ─────────────────────────────────────────────────────────────────────────
    # These routes back the Dataset Manager panel in the dashboard UI.
    # Paths are resolved from the log_dir parent (the ai-engine root).
    # All management operations are non-blocking where possible.

    _ai_root        = Path(log_path).parents[1]  # python-ai-engine/
    _ds_root        = _ai_root / "datasets"
    _processed_dir  = _ds_root / "processed_cases"   # was datasets/cases
    _synthetic_dir  = _ds_root / "synthetic_cases"
    _pseudo_dir     = _ds_root / "pseudo_cases"
    _training_dir   = _ds_root / "training_set"
    _backups_root   = _ai_root / "dataset_backups"
    _registry_path  = _ds_root / "registry.json"
    _version_path   = _ds_root / "dataset_version.json"
    _models_dir     = _ai_root / "models"

    # Lazy dataset management imports
    try:
        from meshnet.dataset_management import (
            DatasetRegistry as _DsReg,
            DatasetIntegrityChecker as _DsCheck,
            DatasetMerger as _DsMerge,
            DatasetVersionManager as _DsVer,
            DatasetBackup as _DsBkp,
        )
        _DS_MGMT_OK = True
    except ImportError:
        _DS_MGMT_OK = False

    @app.route("/api/dataset-manager/status")
    def api_dataset_manager_status():
        """
        GET /api/dataset-manager/status
        Returns counts, version, and last-rebuild info for the Dataset Manager panel.
        """
        out: dict = {
            "processed_cases": 0,
            "synthetic_cases": 0,
            "pseudo_cases":    0,
            "total_training":  0,
            "dataset_version": 0,
            "last_rebuild":    None,
            "model_version":   None,
            "snapshots":       0,
        }

        # Count directories in each source pool
        for key, d in [
            ("processed_cases", _processed_dir),
            ("synthetic_cases", _synthetic_dir),
            ("pseudo_cases",    _pseudo_dir),
        ]:
            if d.exists():
                out[key] = sum(1 for p in d.iterdir() if p.is_dir())

        out["total_training"] = (
            out["processed_cases"] + out["synthetic_cases"] + out["pseudo_cases"]
        )

        # Dataset version
        if _version_path.exists():
            try:
                ver_data = json.loads(_version_path.read_text(encoding="utf-8"))
                vers = ver_data.get("versions", [])
                if vers:
                    latest = vers[-1]
                    out["dataset_version"] = latest.get("version", 0)
                    out["last_rebuild"]    = latest.get("timestamp")
                    out["model_version"]   = latest.get("model_version")
            except Exception:
                pass

        # Snapshot count
        if _backups_root.exists():
            out["snapshots"] = sum(
                1 for p in _backups_root.iterdir()
                if p.is_dir() and p.name.startswith("dataset_snapshot_")
            )

        # Model history
        model_hist = _models_dir / "model_history.json"
        if model_hist.exists():
            try:
                mh = json.loads(model_hist.read_text(encoding="utf-8"))
                models = mh.get("models", [])
                if models:
                    out["model_version"] = models[-1].get("filename")
            except Exception:
                pass

        return jsonify(out)

    @app.route("/api/dataset-manager/versions")
    def api_dataset_versions():
        """GET /api/dataset-manager/versions — full dataset version history."""
        if not _version_path.exists():
            return jsonify({"current_version": 0, "history": []})
        try:
            data = json.loads(_version_path.read_text(encoding="utf-8"))
            return jsonify({
                "current_version": data.get("current_version", 0),
                "history": data.get("versions", []),
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/dataset-manager/report")
    def api_dataset_report():
        """GET /api/dataset-manager/report — full registry report + integrity summary."""
        if not _DS_MGMT_OK:
            return jsonify({"error": "Dataset management module not available"}), 503

        registry = _DsReg(_registry_path)
        reg_report = registry.generate_report()

        checker = _DsCheck(
            processed_dir=_processed_dir,
            synthetic_dir=_synthetic_dir if _synthetic_dir.exists() else None,
            pseudo_dir=_pseudo_dir if _pseudo_dir.exists() else None,
        )
        integ = checker.run()

        # Training report
        total = reg_report.get("total", 0)
        synth = reg_report.get("by_source", {}).get("synthetic", 0)
        pseudo = reg_report.get("by_source", {}).get("pseudo", 0)
        proc = reg_report.get("by_source", {}).get("processed", 0)

        return jsonify({
            "registry": reg_report,
            "integrity": integ.to_dict(),
            "training_report": {
                "cases":                 proc,
                "synthetic":             synth,
                "pseudo":                pseudo,
                "total_training_samples": total,
            },
        })

    @app.route("/api/dataset-manager/rebuild", methods=["POST"])
    def api_dataset_rebuild():
        """
        POST /api/dataset-manager/rebuild
        Rebuild the merged training dataset from all sources.
        Creates a backup snapshot first, then merges.
        """
        if not _DS_MGMT_OK:
            return jsonify({"error": "Dataset management module not available"}), 503
        try:
            # Backup first
            backup = _DsBkp(
                processed_dir=_processed_dir,
                training_dir=_training_dir,
                backup_root=_backups_root,
                dataset_dir=_ds_root,
            )
            snap_dir = backup.create_snapshot(label="manual_rebuild")

            # Version manager
            ver_mgr = _DsVer(_version_path)
            next_ver = ver_mgr.current_version + 1

            # Merge
            merger = _DsMerge(
                processed_dir=_processed_dir,
                synthetic_dir=_synthetic_dir if _synthetic_dir.exists() else None,
                pseudo_dir=_pseudo_dir if _pseudo_dir.exists() else None,
                output_dir=_training_dir / "merged_dataset",
                overwrite=True,
                version=next_ver,
            )
            report = merger.rebuild()

            # Bump version
            new_ver = ver_mgr.bump_version(
                cases=report.total_cases,
                processed=report.processed_cases,
                synthetic=report.synthetic_cases,
                pseudo=report.pseudo_cases,
                notes="Manual rebuild from Dashboard",
            )

            return jsonify({
                "success":         True,
                "dataset_version": new_ver.version,
                "total_cases":     report.total_cases,
                "processed":       report.processed_cases,
                "synthetic":       report.synthetic_cases,
                "pseudo":          report.pseudo_cases,
                "skipped":         report.skipped_cases,
                "snapshot":        snap_dir.name,
                "elapsed_s":       report.elapsed_s,
            })
        except Exception as exc:
            logger.error("Dataset rebuild failed: %s", exc)
            return jsonify({"error": str(exc)}), 500

    @app.route("/api/dataset-manager/backup", methods=["POST"])
    def api_dataset_backup():
        """
        POST /api/dataset-manager/backup
        Create a manual timestamped dataset snapshot.
        """
        if not _DS_MGMT_OK:
            return jsonify({"error": "Dataset management module not available"}), 503
        data = request.get_json(silent=True) or {}
        label = data.get("label", "manual")
        try:
            backup = _DsBkp(
                processed_dir=_processed_dir,
                training_dir=_training_dir,
                backup_root=_backups_root,
                dataset_dir=_ds_root,
            )
            snap_dir = backup.create_snapshot(label=label)
            snapshots = backup.list_snapshots()
            return jsonify({
                "success":        True,
                "snapshot":       snap_dir.name,
                "total_snapshots": len(snapshots),
            })
        except Exception as exc:
            logger.error("Backup failed: %s", exc)
            return jsonify({"error": str(exc)}), 500

    @app.route("/api/dataset-manager/train", methods=["POST"])
    def api_dataset_train():
        """
        POST /api/dataset-manager/train
        Launch incremental training as a background subprocess.
        Stores the process globally so it can be stopped.
        Returns immediately with job info.
        """
        global _TRAINING_PROCESS
        import subprocess as _sp
        data = request.get_json(silent=True) or {}
        epochs = int(data.get("epochs", 50))
        rebuild = bool(data.get("rebuild", False))

        with _TRAINING_LOCK:
            # Reject if already running
            if _TRAINING_PROCESS is not None and _TRAINING_PROCESS.poll() is None:
                return jsonify({
                    "success": False,
                    "status":  "already_running",
                    "pid":     _TRAINING_PROCESS.pid,
                    "message":  "A training process is already running.",
                })

            train_script = _ai_root / "train" / "train_incremental.py"
            if not train_script.exists():
                return jsonify({"error": "train_incremental.py not found"}), 404

            cmd = [
                sys.executable, str(train_script),
                "--data_root",     str(_training_dir / "merged_dataset"),
                "--models_dir",    str(_models_dir),
                "--output_dir",    str(_ai_root / "checkpoints"),
                "--log_dir",       str(log_path),
                "--epochs",        str(epochs),
                "--processed_dir", str(_processed_dir),
                "--synthetic_dir", str(_synthetic_dir),
                "--pseudo_dir",    str(_pseudo_dir),
                "--training_dir",  str(_training_dir),
                "--version_file",  str(_version_path),
            ]
            if rebuild:
                cmd.append("--rebuild")

            try:
                log_file = open(str(log_path / "train_incremental.log"), "a")
                proc = _sp.Popen(
                    cmd,
                    stdout=log_file,
                    stderr=_sp.STDOUT,
                    cwd=str(_ai_root),
                )
                _TRAINING_PROCESS = proc
                logger.info("Training started — pid=%d, epochs=%d", proc.pid, epochs)
                broadcast_log(f"[INFO] Training started — pid={proc.pid}, epochs={epochs}")
                return jsonify({
                    "success": True,
                    "pid":     proc.pid,
                    "message": f"Incremental training started (pid={proc.pid}, epochs={epochs})",
                    "rebuild": rebuild,
                })
            except Exception as exc:
                logger.error("Failed to start training: %s", exc)
                return jsonify({"error": str(exc)}), 500

    # ── Stop Training ────────────────────────────────────────────────────

    @app.route("/api/action/stop_training", methods=["POST"])
    def api_stop_training():
        """
        POST /api/action/stop_training
        Gracefully stop the running training subprocess.
        Falls back to force-kill on Windows if SIGTERM doesn't work.
        """
        global _TRAINING_PROCESS

        with _TRAINING_LOCK:
            if _TRAINING_PROCESS is None:
                return jsonify({"status": "no_process", "message": "No training process registered."})

            if _TRAINING_PROCESS.poll() is not None:
                exit_code = _TRAINING_PROCESS.returncode
                _TRAINING_PROCESS = None
                return jsonify({
                    "status":    "already_stopped",
                    "exit_code": exit_code,
                    "message":   "Training process had already exited.",
                })

            pid = _TRAINING_PROCESS.pid
            try:
                # Phase 1: graceful terminate
                _TRAINING_PROCESS.terminate()
                try:
                    _TRAINING_PROCESS.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Phase 2: force kill (Windows-compatible)
                    if platform.system() == "Windows":
                        os.kill(pid, signal.SIGTERM)  # SIGTERM on Windows
                        try:
                            _TRAINING_PROCESS.wait(timeout=3)
                        except subprocess.TimeoutExpired:
                            _TRAINING_PROCESS.kill()  # ultimate fallback
                            _TRAINING_PROCESS.wait(timeout=3)
                    else:
                        os.kill(pid, signal.SIGKILL)
                        _TRAINING_PROCESS.wait(timeout=3)

                exit_code = _TRAINING_PROCESS.returncode
                _TRAINING_PROCESS = None
                msg = f"Training stopped (pid={pid}, exit_code={exit_code})"
                logger.info(msg)
                broadcast_log(f"[INFO] 🛑 {msg}")
                return jsonify({
                    "status":    "stopped",
                    "pid":       pid,
                    "exit_code": exit_code,
                    "message":   msg,
                })
            except Exception as exc:
                logger.error("Error stopping training pid=%d: %s", pid, exc)
                _TRAINING_PROCESS = None
                return jsonify({
                    "status":  "error",
                    "pid":     pid,
                    "message": str(exc),
                }), 500

    # ── Training Process Status ──────────────────────────────────────────

    @app.route("/api/action/training_process_status")
    def api_training_process_status():
        """
        GET /api/action/training_process_status
        Returns the live process state of the training subprocess.
        """
        with _TRAINING_LOCK:
            if _TRAINING_PROCESS is None:
                return jsonify({"status": "idle", "pid": None})
            rc = _TRAINING_PROCESS.poll()
            if rc is None:
                return jsonify({"status": "running", "pid": _TRAINING_PROCESS.pid})
            return jsonify({"status": "finished", "pid": _TRAINING_PROCESS.pid, "exit_code": rc})


    return app


# ────────────────────────────────────────────────────────────────────────────
# SSE Log Stream + AI Debug endpoints
# ────────────────────────────────────────────────────────────────────────────

def _add_realtime_routes(app: "Flask", log_path: Path) -> None:
    """
    Register SSE log-stream + AI-debug routes onto the Flask app.
    Called at the very end of create_app().
    """

    @app.route("/stream/logs")
    def stream_logs():
        """
        GET /stream/logs — Server-Sent Events endpoint.
        Each connected browser tab gets its own per-request Queue.
        The queue is filled by broadcast_log() / DashboardLogHandler.
        Works with plain Flask (no flask-sock / gevent required).
        """
        client_q: queue.Queue[str] = queue.Queue(maxsize=500)
        with _LOG_QUEUES_LOCK:
            _LOG_QUEUES.append(client_q)

        def generate():
            # Initial hello burst
            yield "data: [INFO] SSE log stream connected.\n\n"
            try:
                while True:
                    try:
                        msg = client_q.get(timeout=25)   # 25s heartbeat
                        yield f"data: {msg}\n\n"
                    except queue.Empty:
                        yield ":heartbeat\n\n"   # SSE comment keeps conn alive
            except GeneratorExit:
                pass
            finally:
                with _LOG_QUEUES_LOCK:
                    if client_q in _LOG_QUEUES:
                        _LOG_QUEUES.remove(client_q)

        return Response(
            generate(),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",   # nginx: disable buffering
                "Connection": "keep-alive",
            },
        )

    # ── AI Debug data endpoint ──────────────────────────────────────────────────

    @app.route("/api/debug/<case_id>")
    def api_debug_case(case_id: str):
        """
        GET /api/debug/<case_id>
        Returns AI debug data for the 3D viewer's Debug Mode.

        Response shape:
        {
          "tooth_labels": [int, ...],     // per-point label 0-32
          "confidence":   [float, ...],   // per-point softmax-max in [0,1]
          "boundaries":   [bool, ...],    // per-point boundary flag
          "missing_teeth": [int, ...],   // FDI ids present in GT but absent in pred
          "detected_teeth": int,
          "gingiva_fraction": float,
          "avg_confidence": float,
          "boundary_count": int,
          "issues": [str, ...]
        }
        """
        # Resolve case directory
        _ai_root   = Path(log_path).parents[1]
        _ds_root   = _ai_root / "datasets"
        case_dir: Optional[Path] = None
        for search in [
            _ds_root / "processed_cases" / case_id,
            _ds_root / "cases" / case_id,
            _ai_root / "datasets" / "hard_cases" / case_id,
        ]:
            if search.exists():
                case_dir = search
                break

        if case_dir is None:
            return jsonify({"error": f"Case '{case_id}' not found"}), 404

        out: dict = {
            "tooth_labels":    [],
            "confidence":      [],
            "boundaries":      [],
            "missing_teeth":   [],
            "detected_teeth":  0,
            "gingiva_fraction": 0.0,
            "avg_confidence":  None,
            "boundary_count":  0,
            "issues":          [],
        }

        if not _NP_AVAILABLE:
            out["issues"].append("numpy not available")
            return jsonify(out)

        try:
            # ── Tooth labels ──
            lbl_path = case_dir / "tooth_labels.npy"
            if lbl_path.exists():
                labels = np.load(str(lbl_path)).astype(int)
                out["tooth_labels"] = labels.tolist()

                unique = set(int(x) for x in np.unique(labels))
                teeth  = unique - {0}
                out["detected_teeth"] = len(teeth)
                n = len(labels)
                out["gingiva_fraction"] = float((labels == 0).sum() / max(n, 1))

                # Detect missing teeth (present in 1-28 expected range but absent)
                expected = set(range(1, 29))
                missing  = sorted(expected - teeth) if len(teeth) >= 4 else []
                out["missing_teeth"] = missing
                if missing:
                    out["issues"].append(f"Missing teeth (FDI estimate): {missing}")

                # Boundary mask: point whose neighbor has different label
                # (fast approximation without spatial KD-tree)
                shifted = np.roll(labels, 1)
                bnd_mask = (labels != shifted).tolist()
                out["boundaries"]    = bnd_mask
                out["boundary_count"] = int(sum(bnd_mask))

            # ── Confidence ──
            conf_path = case_dir / "confidence.npy"
            if conf_path.exists():
                conf = np.load(str(conf_path)).astype(float)
                out["confidence"]     = conf.tolist()
                out["avg_confidence"] = float(conf.mean())
                low_conf = int((conf < 0.5).sum())
                if low_conf > len(conf) * 0.15:
                    out["issues"].append(
                        f"{low_conf} points ({100*low_conf//max(len(conf),1)}%) below 50% confidence"
                    )
            else:
                out["issues"].append("No confidence.npy — run inference with save_confidence=True")

        except Exception as exc:
            out["issues"].append(f"Load error: {exc}")
            logger.warning("api_debug_case %s: %s", case_id, exc)

        # Broadcast to SSE log
        _avg_c = "N/A" if out["avg_confidence"] is None else f"{out['avg_confidence']:.3f}"
        broadcast_log(
            f"[INFO] Debug data loaded for case '{case_id}' \u2014 "
            f"{out['detected_teeth']} teeth detected, "
            f"{len(out['missing_teeth'])} missing, "
            f"avg_conf={_avg_c}"
        )
        return jsonify(out)


# Patch create_app to attach the new routes at the bottom
_original_create_app = create_app  # type: ignore[name-defined]


def create_app(log_path="./logs", data_root=None, cases_dir=None):   # type: ignore[override]
    app = _original_create_app(log_path, data_root, cases_dir)
    _add_realtime_routes(app, Path(log_path))
    return app


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Orthodontic AI Engine — Dashboard")
    p.add_argument("--log_dir",    default="./logs")
    p.add_argument("--data_root",  default=None,  help="Dataset root for 3D viewer point clouds")
    p.add_argument("--cases_dir",  default=None,
                   help="STL cases root (default: <log_dir>/../datasets/cases). "
                        "Files served at /cases/<case_id>/<file>.stl")
    p.add_argument("--port",  type=int, default=8080)
    p.add_argument("--host",  default="0.0.0.0")
    p.add_argument("--debug", action="store_true")
    return p.parse_args()


def main():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s")
    if not FLASK_AVAILABLE:
        print("Flask not installed. Run: pip install flask")
        return
    args = parse_args()
    app = create_app(args.log_dir, args.data_root, args.cases_dir)
    _cases = Path(args.cases_dir) if args.cases_dir else Path(args.log_dir).parent / "datasets" / "cases"
    print(f"\n{'='*58}")
    print(f"  Orthodontic AI Engine — Dashboard")
    print(f"  http://localhost:{args.port}              (main dashboard)")
    print(f"  http://localhost:{args.port}/viewer       (3D boundary viewer)")
    print(f"  http://localhost:{args.port}/cases/<id>/maxillary.stl")
    print(f"  Log dir   : {args.log_dir}")
    print(f"  Cases dir : {_cases}")
    print(f"{'='*58}\n")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
