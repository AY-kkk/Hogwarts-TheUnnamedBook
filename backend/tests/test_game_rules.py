import pytest

from app.game_rules import (
    PROLOGUE_TURNS,
    RuleContextError,
    build_turn_directive,
    next_week,
    resolve_action,
)


def status_fixture(**changes):
    status = {
        "hp": 100,
        "mp": 20,
        "max_mp": 20,
        "ap": 0,
        "max_ap": 7,
        "current_year": 1991,
        "current_month": 7,
        "current_week": 4,
        "prologue_turn": 1,
        "game_mode": "prologue",
        "attributes": {
            "knowledge": 15,
            "athletics": 40,
            "charm": 40,
            "morality": 50,
            "mental": 40,
        },
    }
    status.update(changes)
    return status


def test_all_nine_prologue_turns_are_explicit():
    assert list(PROLOGUE_TURNS) == list(range(1, 10))


def test_prologue_advances_exactly_one_turn_with_fixed_calendar():
    directive = build_turn_directive(status_fixture())
    assert directive.required_turn == {
        "kind": "prologue",
        "target_prologue_turn": 2,
        "ap_cost": 0,
    }
    assert directive.required_status["current_month"] == 8
    assert directive.required_status["current_week"] == 1


def test_turn_nine_enters_weekly_mode_with_seven_ap():
    directive = build_turn_directive(status_fixture(prologue_turn=8, current_month=9, current_week=1))
    assert directive.required_status | {} == {
        "prologue_turn": 9,
        "current_month": 9,
        "current_week": 1,
        "game_mode": "weekly",
        "ap": 7,
        "max_ap": 7,
    }


def test_calendar_never_creates_a_fifth_week():
    assert next_week(1991, 11, 4) == (1991, 12, 1)
    assert next_week(1991, 12, 4) == (1992, 1, 1)


def test_nine_ap_plan_applies_two_point_next_week_penalty():
    result = resolve_action(
        "全勤上课 3AP，图书馆研读 2AP，咒语训练 4AP",
        status_fixture(game_mode="weekly", prologue_turn=9, current_month=9, current_week=1, ap=7),
        roll=10,
    )
    assert result.accepted is True
    assert result.ap_cost == 9
    assert result.overdraft == 2
    assert result.required_status["ap"] == 5
    assert result.required_status["max_ap"] == 5


def test_plan_over_ten_ap_is_rejected_without_state_transition():
    result = resolve_action(
        "上课 6AP，再训练 5AP",
        status_fixture(game_mode="weekly", prologue_turn=9, current_month=9, current_week=1, ap=7),
        roll=10,
    )
    assert result.accepted is False
    assert result.result == "invalid"
    assert result.required_turn is None
    assert result.required_status is None


def test_penalized_week_can_only_overdraft_from_current_available_ap():
    result = resolve_action(
        "安排 9AP 的行动",
        status_fixture(
            game_mode="weekly", prologue_turn=9, current_month=9, current_week=2, ap=5, max_ap=5
        ),
        roll=10,
    )
    assert result.accepted is False


def test_weekly_crisis_enters_event_without_time_or_ap_cost():
    result = resolve_action(
        "参加魁地奇比赛",
        status_fixture(game_mode="weekly", prologue_turn=9, current_month=11, current_week=1, ap=7),
        roll=10,
    )
    assert result.required_turn == {"kind": "event_start", "ap_cost": 0}
    assert result.required_status["game_mode"] == "event"
    assert result.required_status["current_week"] == 1


def test_explicit_event_resolution_returns_to_weekly_without_advancing():
    result = resolve_action(
        "比赛结束，我安全离开",
        status_fixture(game_mode="event", prologue_turn=9, current_month=11, current_week=1, ap=7),
        roll=10,
    )
    assert result.required_turn == {"kind": "event_resolve", "ap_cost": 0}
    assert result.required_status["game_mode"] == "weekly"
    assert result.required_status["current_week"] == 1


def test_event_actions_freeze_calendar_and_cost_no_ap():
    status = status_fixture(
        game_mode="event", prologue_turn=9, current_month=10, current_week=4, ap=5
    )
    result = resolve_action("躲到桌子后面", status, roll=10)
    assert result.ap_cost == 0
    assert result.required_turn == {"kind": "event_continue", "ap_cost": 0}
    assert result.required_status["current_week"] == 4
    assert result.required_status["ap"] == 5


def test_high_tier_spell_fails_before_a_random_roll():
    result = resolve_action("我直接释放厉火", status_fixture(), roll=20)
    assert result.result == "failure"
    assert result.roll is None
    assert "低于门槛 110" in result.effect


def test_invalid_status_fails_closed():
    with pytest.raises(RuleContextError):
        build_turn_directive({"game_mode": "weekly"})
