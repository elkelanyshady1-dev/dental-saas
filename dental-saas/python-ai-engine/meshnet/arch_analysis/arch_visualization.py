"""
arch_visualization.py — Render the dental arch curve in matplotlib.

Generates publication-quality arch curve plots:

    • Colour-coded tooth centroids (maxillary = blue, mandibular = red)
    • Smooth B-spline arch curve (blue / red line)
    • Tooth labels annotation
    • Landmark markers (canines, molars)
    • Measurement callouts (intercanine, intermolar width)

Output modes
------------
    save_plot()    → writes PNG to disk
    show_plot()    → interactive matplotlib window

Dependencies
------------
    matplotlib >= 3.7
    numpy      >= 1.24
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

_MPL_AVAILABLE = False
try:
    import matplotlib
    matplotlib.use("Agg")   # non-interactive backend (safe in headless env)
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.lines import Line2D
    _MPL_AVAILABLE = True
except ImportError:
    plt = None  # type: ignore


# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------

_MAX_COLOR   = "#1a73e8"   # Google-blue  — maxillary arch
_MAND_COLOR  = "#e53935"   # red          — mandibular arch
_GINGIVA_COLOR = "#b0bec5" # grey         — gingiva / background

_CANINE_MARKER_COLOR = "#ffd600"   # yellow
_MOLAR_MARKER_COLOR  = "#7b1fa2"   # purple

_LABEL_FDI_UPPER = set(range(11, 29))
_LABEL_FDI_LOWER = set(range(31, 49))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _require_matplotlib() -> None:
    if not _MPL_AVAILABLE:
        raise ImportError(
            "matplotlib is required for visualisation. "
            "Install it with: pip install matplotlib>=3.7"
        )


def _draw_arch_curve(
    ax,
    curve_xy: np.ndarray,
    color: str,
    label: str,
    linewidth: float = 2.5,
    alpha: float = 0.85,
) -> None:
    """Draw the smooth spline curve."""
    ax.plot(
        curve_xy[:, 0],
        curve_xy[:, 1],
        color=color,
        linewidth=linewidth,
        alpha=alpha,
        label=label,
        zorder=3,
    )


def _draw_centroids(
    ax,
    centroids_xy: np.ndarray,
    labels: np.ndarray,
    color: str,
    annotate: bool = True,
) -> None:
    """Scatter tooth centroids and annotate with FDI labels."""
    ax.scatter(
        centroids_xy[:, 0],
        centroids_xy[:, 1],
        c=color,
        s=90,
        zorder=5,
        edgecolors="white",
        linewidths=0.8,
        alpha=0.9,
    )
    if annotate:
        for i, lbl in enumerate(labels):
            ax.annotate(
                str(lbl),
                xy=(centroids_xy[i, 0], centroids_xy[i, 1]),
                fontsize=6,
                ha="center",
                va="bottom",
                color="#212121",
                xytext=(0, 5),
                textcoords="offset points",
            )


def _draw_width_line(
    ax,
    p1: np.ndarray,
    p2: np.ndarray,
    label: str,
    color: str = "#37474f",
    yoffset: float = 0.0,
    linestyle: str = "--",
) -> None:
    """Draw a dimension line between two points with a text callout."""
    mid = (p1 + p2) * 0.5 + np.array([0.0, yoffset])
    dist = np.linalg.norm(p1 - p2)
    ax.annotate(
        "",
        xy=p2,
        xytext=p1,
        arrowprops=dict(
            arrowstyle="<->",
            color=color,
            lw=1.2,
            linestyle=linestyle,
        ),
        zorder=6,
    )
    ax.text(
        mid[0], mid[1],
        f"{label}\n{dist:.1f} mm",
        ha="center", va="center",
        fontsize=7,
        color=color,
        bbox=dict(boxstyle="round,pad=0.2", fc="white", ec=color, alpha=0.85),
        zorder=7,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def plot_arch_curve(
    *,
    max_spline=None,
    mand_spline=None,
    title: str = "Dental Arch Curve",
    figsize: Tuple[float, float] = (10, 8),
    show_measurements: bool = True,
    show_labels: bool = True,
    output_path: Optional[str | Path] = None,
    dpi: int = 150,
) -> Optional["plt.Figure"]:
    """
    Generate a dental arch curve visualisation plot.

    Parameters
    ----------
    max_spline  : ArchSpline or None  — maxillary arch spline
    mand_spline : ArchSpline or None  — mandibular arch spline
    title       : str
    figsize     : (width, height) in inches
    show_measurements : bool — draw intercanine / intermolar width lines
    show_labels : bool — annotate FDI tooth labels
    output_path : str or Path or None — save PNG if provided
    dpi         : dots per inch for saved figure

    Returns
    -------
    matplotlib.pyplot.Figure or None
    """
    _require_matplotlib()

    fig, ax = plt.subplots(figsize=figsize, facecolor="#fafafa")
    ax.set_facecolor("#f5f5f5")

    has_any = False
    legend_handles = []

    # ── Maxillary arch ────────────────────────────────────────────────────
    if max_spline is not None:
        _draw_arch_curve(
            ax, max_spline.curve_xy,
            color=_MAX_COLOR, label="Maxillary arch"
        )
        _draw_centroids(
            ax, max_spline.sorted_xy, max_spline.sorted_labels,
            color=_MAX_COLOR, annotate=show_labels,
        )
        legend_handles.append(
            Line2D([0], [0], color=_MAX_COLOR, lw=2, label="Maxillary")
        )
        has_any = True

        if show_measurements:
            _try_draw_width(ax, max_spline, 13, 23, "Intercanine (U)", _CANINE_MARKER_COLOR)
            _try_draw_width(ax, max_spline, 16, 26, "Intermolar (U)", _MOLAR_MARKER_COLOR, yoffset=1.5)

    # ── Mandibular arch ───────────────────────────────────────────────────
    if mand_spline is not None:
        _draw_arch_curve(
            ax, mand_spline.curve_xy,
            color=_MAND_COLOR, label="Mandibular arch"
        )
        _draw_centroids(
            ax, mand_spline.sorted_xy, mand_spline.sorted_labels,
            color=_MAND_COLOR, annotate=show_labels,
        )
        legend_handles.append(
            Line2D([0], [0], color=_MAND_COLOR, lw=2, label="Mandibular")
        )
        has_any = True

        if show_measurements:
            _try_draw_width(ax, mand_spline, 33, 43, "Intercanine (L)", _CANINE_MARKER_COLOR, yoffset=-1.5)
            _try_draw_width(ax, mand_spline, 36, 46, "Intermolar (L)",  _MOLAR_MARKER_COLOR, yoffset=-3.0)

    if not has_any:
        ax.text(0.5, 0.5, "No arch data available", transform=ax.transAxes,
                ha="center", va="center", fontsize=14, color="#666666")
        return fig

    # ── Styling ────────────────────────────────────────────────────────────
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel("Labial ←————→ Lingual (mm)", fontsize=9, color="#444")
    ax.set_ylabel("Distal (mm)", fontsize=9, color="#444")
    ax.set_title(title, fontsize=13, fontweight="bold", pad=14, color="#1a1a2e")

    ax.grid(True, linestyle=":", color="#cccccc", alpha=0.6, linewidth=0.8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    if legend_handles:
        ax.legend(handles=legend_handles, loc="lower right", fontsize=9,
                  framealpha=0.9, edgecolor="#ccc")

    # Arch midline
    ax.axvline(0, linestyle="--", color="#9e9e9e", linewidth=0.8, alpha=0.7)
    ax.text(0.5, -0.03, "Midline", transform=ax.get_xaxis_transform(),
            ha="center", fontsize=7, color="#9e9e9e")

    plt.tight_layout()

    # ── Save / show ────────────────────────────────────────────────────────
    if output_path is not None:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(str(output_path), dpi=dpi, bbox_inches="tight")
        logger.info("Arch curve plot saved: %s", output_path)

    return fig


def _try_draw_width(
    ax,
    spline,
    label_a: int,
    label_b: int,
    name: str,
    color: str,
    yoffset: float = 0.0,
) -> None:
    """Draw width measurement line if both teeth present."""
    labs = spline.sorted_labels
    xy   = spline.sorted_xy

    idx_a = np.where(labs == label_a)[0]
    idx_b = np.where(labs == label_b)[0]

    if len(idx_a) == 0 or len(idx_b) == 0:
        return

    p1 = xy[idx_a[0]]
    p2 = xy[idx_b[0]]
    _draw_width_line(ax, p1, p2, name, color=color, yoffset=yoffset)


# ---------------------------------------------------------------------------
# Quick-render: single function for API / test use
# ---------------------------------------------------------------------------

def render_arch_to_png(
    max_spline=None,
    mand_spline=None,
    output_path: str | Path = "arch_curve.png",
    case_id: str = "",
    **kwargs,
) -> str:
    """
    Render arch curve to a PNG file.

    Returns the output path as a string.
    """
    title = f"Dental Arch Curve — {case_id}" if case_id else "Dental Arch Curve"
    fig = plot_arch_curve(
        max_spline=max_spline,
        mand_spline=mand_spline,
        title=title,
        output_path=output_path,
        **kwargs,
    )
    if fig is not None:
        plt.close(fig)
    return str(output_path)


def render_arch_to_base64(
    max_spline=None,
    mand_spline=None,
    case_id: str = "",
    **kwargs,
) -> str:
    """
    Render arch curve to a base64-encoded PNG string (for API embedding).

    Returns empty string if matplotlib unavailable.
    """
    if not _MPL_AVAILABLE:
        return ""

    import io, base64
    title = f"Dental Arch Curve — {case_id}" if case_id else "Dental Arch Curve"
    fig = plot_arch_curve(
        max_spline=max_spline,
        mand_spline=mand_spline,
        title=title,
        **kwargs,
    )
    if fig is None:
        return ""

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return encoded
