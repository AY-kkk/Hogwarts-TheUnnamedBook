import pytest

from app.observability import (
    CostSettings,
    MetricsRegistry,
    SessionBudgetExceeded,
    SessionBudgetTracker,
    estimate_token_cost,
)


def test_budget_reservation_blocks_concurrent_overspend():
    tracker = SessionBudgetTracker(limit_usd=0.10)
    first = tracker.reserve("session-a", 0.06)

    with pytest.raises(SessionBudgetExceeded):
        tracker.reserve("session-a", 0.05)

    assert tracker.settle(first, actual_usd=0.04) == pytest.approx(0.04)
    tracker.reserve("session-a", 0.05)


def test_failed_call_conservatively_charges_reserved_amount():
    tracker = SessionBudgetTracker(limit_usd=0.10)
    reservation = tracker.reserve("session-a", 0.06)

    assert tracker.settle(reservation) == pytest.approx(0.06)


def test_cost_estimate_uses_configured_rates():
    settings = CostSettings(
        session_budget_usd=1,
        input_cost_per_million_tokens=2,
        output_cost_per_million_tokens=8,
    )

    assert estimate_token_cost(400, 800, settings) == pytest.approx(0.0018)


def test_metrics_render_only_aggregated_labels_and_values():
    registry = MetricsRegistry()
    registry.increment("ai_requests_total", model="model-a", outcome="success")

    output = registry.render_prometheus()

    assert 'ai_requests_total{model="model-a",outcome="success"} 1' in output
    assert "story body" not in output
