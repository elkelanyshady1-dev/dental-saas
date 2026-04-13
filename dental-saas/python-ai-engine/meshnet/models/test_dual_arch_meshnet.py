"""
test_dual_arch_meshnet.py — shape / forward-pass smoke tests.

Run from the python-ai-engine root:
    python -m pytest meshnet/models/test_dual_arch_meshnet.py -v
or without pytest:
    python meshnet/models/test_dual_arch_meshnet.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch
import pytest

# Insert root so local imports resolve
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from meshnet.models.dual_arch_meshnet import (
    ArchPositionalEncoding,
    CrossArchAttention,
    DualArchMeshNet,
    ARCH_POS_IDX,
    POS_EMBED_DIM,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

B, N_U, N_L = 2, 128, 96  # small for fast CI
IN_CH       = 14
FEAT_CH     = IN_CH - 3   # 11
NUM_CLASSES = 33


@pytest.fixture
def upper_batch():
    xyz  = torch.randn(B, N_U, 3)
    feat = torch.randn(B, N_U, FEAT_CH)
    # Ensure arch_pos channel (idx 13 → feat idx 10) is in [0,1]
    feat[:, :, ARCH_POS_IDX - 3] = torch.rand(B, N_U)
    return xyz, feat


@pytest.fixture
def lower_batch():
    xyz  = torch.randn(B, N_L, 3)
    feat = torch.randn(B, N_L, FEAT_CH)
    feat[:, :, ARCH_POS_IDX - 3] = torch.rand(B, N_L)
    return xyz, feat


@pytest.fixture
def model_dual():
    return DualArchMeshNet(
        in_channels=IN_CH,
        num_classes=NUM_CLASSES,
        use_cross_arch=True,
    )


@pytest.fixture
def model_single():
    return DualArchMeshNet(
        in_channels=IN_CH,
        num_classes=NUM_CLASSES,
        use_cross_arch=False,
    )


# ── ArchPositionalEncoding tests ─────────────────────────────────────────────

class TestArchPositionalEncoding:

    def test_output_shape(self):
        enc = ArchPositionalEncoding(out_dim=8)
        arch_pos = torch.rand(B, N_U)
        out = enc(arch_pos)
        assert out.shape == (B, N_U, 8), f"Expected (B,N,8), got {out.shape}"

    def test_custom_dim(self):
        enc = ArchPositionalEncoding(out_dim=16)
        arch_pos = torch.rand(B, N_U)
        out = enc(arch_pos)
        assert out.shape == (B, N_U, 16)

    def test_values_in_range(self):
        """Output should be finite (no NaN/Inf)."""
        enc = ArchPositionalEncoding(out_dim=8)
        arch_pos = torch.rand(B, N_U)
        out = enc(arch_pos)
        assert torch.isfinite(out).all(), "ArchPositionalEncoding produced non-finite values"

    def test_boundary_positions(self):
        """arch_pos = 0.0 and 1.0 edge cases should not crash."""
        enc = ArchPositionalEncoding(out_dim=8)
        arch_pos = torch.zeros(1, 10)
        out0 = enc(arch_pos)
        arch_pos = torch.ones(1, 10)
        out1 = enc(arch_pos)
        # Embeddings at 0 and 1 should differ (distinguishable positions)
        assert not torch.allclose(out0, out1), \
            "Encoding at pos=0 and pos=1 should not be identical"

    def test_distinct_positions_produce_distinct_embeddings(self):
        enc = ArchPositionalEncoding(out_dim=8)
        pos_a = torch.full((1, 1), 0.1)
        pos_b = torch.full((1, 1), 0.9)
        assert not torch.allclose(enc(pos_a), enc(pos_b)), \
            "Different arch positions should yield different embeddings"

    def test_gradient_flows(self):
        enc = ArchPositionalEncoding(out_dim=8)
        arch_pos = torch.rand(B, N_U, requires_grad=False)
        out = enc(arch_pos)
        loss = out.sum()
        loss.backward()
        # Check that MLP weights have gradients
        for p in enc.parameters():
            assert p.grad is not None, "Gradient not flowing through ArchPositionalEncoding"


# ── CrossArchAttention tests ──────────────────────────────────────────────────

class TestCrossArchAttention:

    def test_output_shape(self):
        attn = CrossArchAttention(feat_dim=128, n_heads=4)
        u = torch.randn(B, 64, 128)
        l = torch.randn(B, 64, 128)
        uo, lo = attn(u, l)
        assert uo.shape == u.shape
        assert lo.shape == l.shape

    def test_residual_connection(self):
        """Output should not be identical to input (residual is added)."""
        attn = CrossArchAttention(feat_dim=128, n_heads=4)
        u = torch.randn(B, 64, 128)
        l = torch.randn(B, 64, 128)
        uo, lo = attn(u, l)
        assert not torch.allclose(uo, u) or not torch.allclose(lo, l)


# ── DualArchMeshNet tests ─────────────────────────────────────────────────────

class TestDualArchMeshNet:

    def test_single_arch_output_shape(self, model_single, upper_batch):
        xyz, feat = upper_batch
        out = model_single(xyz, feat)
        assert "upper_logits" in out
        assert out["upper_logits"].shape == (B, N_U, NUM_CLASSES), \
            f"Expected (B,N_u,C), got {out['upper_logits'].shape}"
        assert "lower_logits" not in out

    def test_dual_arch_output_shapes(self, model_dual, upper_batch, lower_batch):
        xyz_u, feat_u = upper_batch
        xyz_l, feat_l = lower_batch
        out = model_dual(xyz_u, feat_u, xyz_l, feat_l)
        assert out["upper_logits"].shape == (B, N_U, NUM_CLASSES)
        assert out["lower_logits"].shape == (B, N_L, NUM_CLASSES)

    def test_output_finite(self, model_single, upper_batch):
        xyz, feat = upper_batch
        with torch.no_grad():
            out = model_single(xyz, feat)
        assert torch.isfinite(out["upper_logits"]).all(), "Logits contain NaN/Inf"

    def test_pos_encoding_changes_output(self, upper_batch):
        """
        Verify that two scans with identical geometry but different arch_pos
        produce meaningfully different logits — confirming positional encoding
        is wired in and not zeroed out.
        """
        xyz, feat_base = upper_batch

        # Scan A: arch_pos near 0 (anterior)
        feat_a = feat_base.clone()
        feat_a[:, :, ARCH_POS_IDX - 3] = 0.05

        # Scan B: arch_pos near 1 (posterior)
        feat_b = feat_base.clone()
        feat_b[:, :, ARCH_POS_IDX - 3] = 0.95

        model = DualArchMeshNet(in_channels=IN_CH, num_classes=NUM_CLASSES,
                                 use_cross_arch=False)
        model.eval()
        with torch.no_grad():
            la = model(xyz, feat_a)["upper_logits"]
            lb = model(xyz, feat_b)["upper_logits"]

        # Logits should differ because positional encoding differs
        assert not torch.allclose(la, lb, atol=1e-4), \
            "Arch positional encoding has no effect on output — check wiring"

    def test_gradient_end_to_end(self, model_single, upper_batch):
        xyz, feat = upper_batch
        out = model_single(xyz, feat)
        loss = out["upper_logits"].sum()
        loss.backward()
        # Check that pos_encoder parameters receive gradients
        for name, p in model_single.pos_encoder.named_parameters():
            assert p.grad is not None, \
                f"No gradient reached pos_encoder.{name}"

    def test_cross_arch_vs_single_arch_shapes(self, upper_batch, lower_batch):
        """Cross-arch and single-arch modes must produce same output *shape*."""
        xyz_u, feat_u = upper_batch
        xyz_l, feat_l = lower_batch

        m_dual   = DualArchMeshNet(IN_CH, NUM_CLASSES, use_cross_arch=True)
        m_single = DualArchMeshNet(IN_CH, NUM_CLASSES, use_cross_arch=False)

        with torch.no_grad():
            out_d = m_dual(xyz_u, feat_u, xyz_l, feat_l)
            out_s = m_single(xyz_u, feat_u)

        assert out_d["upper_logits"].shape == out_s["upper_logits"].shape


# ── Segment head input dimension sanity ──────────────────────────────────────

def test_head_input_dim():
    """
    Ensure the seg head input channel count equals
    SharedEncoder.FP_OUT_CH + pos_embed_dim.
    """
    from meshnet.models.dual_arch_meshnet import SharedEncoder

    pos_dim = 8
    model = DualArchMeshNet(
        in_channels=IN_CH,
        num_classes=NUM_CLASSES,
        pos_embed_dim=pos_dim,
        use_cross_arch=False,
    )
    # Introspect first Conv1d in seg head
    first_conv = model.seg_head_upper.net[0]
    expected_in = SharedEncoder.FP_OUT_CH + pos_dim  # 128 + 8 = 136
    assert first_conv.in_channels == expected_in, (
        f"Seg head expects in_ch={expected_in}, "
        f"got {first_conv.in_channels}"
    )


# ── Standalone runner ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import subprocess
    result = subprocess.run(
        ["python", "-m", "pytest", __file__, "-v", "--tb=short"],
        cwd=str(Path(__file__).resolve().parents[2]),
    )
    sys.exit(result.returncode)
