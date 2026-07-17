from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import re
import secrets
from typing import Any, Literal


WEEKLY_BASE_AP = 7
MAX_AP_OVERDRAFT = 3


class RuleContextError(ValueError):
    """Raised when the client supplies a malformed canonical status snapshot."""


@dataclass(frozen=True)
class PrologueTurn:
    number: int
    title: str
    month: int
    week: int
    objective: str


PROLOGUE_TURNS: dict[int, PrologueTurn] = {
    1: PrologueTurn(1, "猫头鹰与信", 7, 4, "只描写来信与家庭反应，初始化人物基础状态。"),
    2: PrologueTurn(2, "讨论与回信", 8, 1, "结算家庭讨论并寄出回信，不得提前购物。"),
    3: PrologueTurn(3, "破釜酒吧与古灵阁", 8, 2, "进入魔法世界并按出身发放启动资金。"),
    4: PrologueTurn(4, "购物与魔杖", 8, 2, "完成负担得起的采购，金币不足时必须拒绝购买。"),
    5: PrologueTurn(5, "剩余假期", 8, 4, "只结算一个假期规划，并停在八月三十一日晚。"),
    6: PrologueTurn(6, "车站送别", 9, 1, "到达九又四分之三站台，只给出一组列车行动选择。"),
    7: PrologueTurn(7, "特快列车", 9, 1, "只结算一组车厢互动与必要消费或关系变化。"),
    8: PrologueTurn(8, "分院仪式", 9, 1, "让玩家直接或间接决定学院并更新 house。"),
    9: PrologueTurn(9, "开学晚宴", 9, 1, "完成晚宴与宿舍引导，然后进入 weekly 模式。"),
}


@dataclass(frozen=True)
class TurnDirective:
    phase: Literal["prologue", "weekly", "event"]
    instruction: str
    required_turn: dict[str, Any]
    required_status: dict[str, Any]

    def to_prompt(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, sort_keys=True)


@dataclass(frozen=True)
class RuleResult:
    accepted: bool
    check: str
    attribute: str
    difficulty: int | None
    roll: int | None
    total: int | None
    result: Literal["success", "failure", "invalid"]
    effect: str
    ap_cost: int
    overdraft: int
    required_turn: dict[str, Any] | None
    required_status: dict[str, Any] | None

    def to_prompt(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, sort_keys=True)


def _integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise RuleContextError(f"{name} must be an integer between {minimum} and {maximum}")
    return value


def validate_status_snapshot(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuleContextError("status_snapshot must be an object")
    mode = value.get("game_mode")
    if mode not in {"prologue", "weekly", "event"}:
        raise RuleContextError("status_snapshot.game_mode is invalid")

    attributes = value.get("attributes")
    if not isinstance(attributes, dict):
        raise RuleContextError("status_snapshot.attributes must be an object")
    normalized_attributes = {
        "knowledge": _integer(attributes.get("knowledge"), "attributes.knowledge", 1, 200),
        "athletics": _integer(attributes.get("athletics"), "attributes.athletics", 1, 100),
        "charm": _integer(attributes.get("charm"), "attributes.charm", 1, 100),
        "morality": _integer(attributes.get("morality"), "attributes.morality", 1, 100),
        "mental": _integer(attributes.get("mental"), "attributes.mental", 1, 200),
    }

    normalized = {
        **value,
        "game_mode": mode,
        "current_year": _integer(value.get("current_year"), "current_year", 900, 2200),
        "current_month": _integer(value.get("current_month"), "current_month", 1, 12),
        "current_week": _integer(value.get("current_week"), "current_week", 1, 4),
        "prologue_turn": _integer(value.get("prologue_turn"), "prologue_turn", 1, 9),
        "ap": _integer(value.get("ap"), "ap", 0, 10),
        "max_ap": _integer(value.get("max_ap"), "max_ap", 0, 10),
        "attributes": normalized_attributes,
    }
    if normalized["ap"] > normalized["max_ap"]:
        raise RuleContextError("status_snapshot.ap cannot exceed max_ap")
    return normalized


def next_week(year: int, month: int, week: int) -> tuple[int, int, int]:
    if week < 4:
        return year, month, week + 1
    if month < 12:
        return year, month + 1, 1
    return year + 1, 1, 1


def build_turn_directive(raw_status: Any) -> TurnDirective:
    status = validate_status_snapshot(raw_status)
    mode = status["game_mode"]
    if mode == "prologue":
        current = status["prologue_turn"]
        target = min(9, current + 1)
        turn = PROLOGUE_TURNS[target]
        entering_weekly = target == 9
        required_status: dict[str, Any] = {
            "prologue_turn": target,
            "current_month": turn.month,
            "current_week": turn.week,
            "game_mode": "weekly" if entering_weekly else "prologue",
        }
        if entering_weekly:
            required_status |= {"ap": WEEKLY_BASE_AP, "max_ap": WEEKLY_BASE_AP}
        return TurnDirective(
            phase="prologue",
            instruction=f"本次只能推进到 Turn {target}《{turn.title}》：{turn.objective}",
            required_turn={"kind": "prologue", "target_prologue_turn": target, "ap_cost": 0},
            required_status=required_status,
        )

    if mode == "weekly":
        year, month, week = next_week(
            status["current_year"], status["current_month"], status["current_week"]
        )
        return TurnDirective(
            phase="weekly",
            instruction="结算且只结算当前一周。正常结算后推进一周；若触发事件则进入 event 并冻结日历。",
            required_turn={"kind": "weekly", "ap_cost": "由规则结果给出"},
            required_status={
                "game_mode": "weekly",
                "current_year": year,
                "current_month": month,
                "current_week": week,
            },
        )

    return TurnDirective(
        phase="event",
        instruction="事件未明确结束时继续 event；结束时切回 weekly。两种情况都不得推进日历或消耗 AP。",
        required_turn={"kind": "event_continue 或 event_resolve", "ap_cost": 0},
        required_status={
            "current_year": status["current_year"],
            "current_month": status["current_month"],
            "current_week": status["current_week"],
            "ap": status["ap"],
            "max_ap": status["max_ap"],
        },
    )


def _explicit_ap_cost(user_input: str) -> int | None:
    matches = [int(value) for value in re.findall(r"(?<!\d)(\d{1,2})\s*(?:AP|ap|行动点)", user_input)]
    return sum(matches) if matches else None


def _estimated_ap_cost(user_input: str) -> int:
    explicit = _explicit_ap_cost(user_input)
    if explicit is not None:
        return explicit
    if any(word in user_input for word in ("全勤", "上课")):
        return 3
    if any(word in user_input for word in ("图书馆", "研读", "练习", "训练")):
        return 2
    return 1


def _starts_event(user_input: str) -> bool:
    return any(
        word in user_input
        for word in ("巨怪", "遇袭", "决斗", "禁林", "禁书区", "夜游", "魁地奇比赛", "晚宴", "舞会")
    )


def _resolves_event(user_input: str) -> bool:
    return any(
        phrase in user_input
        for phrase in ("结束事件", "比赛结束", "晚宴结束", "逃脱危机", "安全离开", "返回周常")
    )


def _spell_requirement(user_input: str) -> tuple[str, int] | None:
    tiers = (
        (("阿瓦达索命", "钻心剜骨", "魂魄出窍", "不可饶恕"), "禁忌魔法", 85),
        (("厉火", "幻身咒", "无声施法", "混淆咒"), "宗师级咒语", 110),
        (("昏昏倒地", "障碍重重", "盔甲护身", "爆炸咒"), "专家级咒语", 85),
        (("呼神护卫", "滑稽滑稽"), "进阶级咒语", 60),
        (("除你武器", "冰冻咒"), "学徒级咒语", 35),
        (("荧光闪烁", "漂浮咒", "阿拉霍洞开"), "新生级咒语", 15),
    )
    for names, label, knowledge in tiers:
        if any(name in user_input for name in names):
            return label, knowledge
    return None


def _check_profile(user_input: str, attributes: dict[str, int]) -> tuple[str, str, int, int]:
    if any(word in user_input for word in ("咒", "魔杖", "施法", "魔法")):
        modifier = round(attributes["knowledge"] * 0.2 + attributes["mental"] * 0.2)
        return "施法检定", "knowledge+mental", modifier, 15
    if any(word in user_input for word in ("说服", "交谈", "社交", "安慰", "套话")):
        return "社交检定", "charm", attributes["charm"] // 10, 12
    if any(word in user_input for word in ("跑", "躲", "飞行", "攀爬", "魁地奇")):
        return "体能检定", "athletics", attributes["athletics"] // 10, 12
    if any(word in user_input for word in ("抵抗", "冥想", "恐惧", "意志")):
        return "心智检定", "mental", attributes["mental"] // 10, 14
    return "常规行动检定", "knowledge", attributes["knowledge"] // 10, 10


def resolve_action(user_input: str, raw_status: Any, *, roll: int | None = None) -> RuleResult:
    status = validate_status_snapshot(raw_status)
    mode = status["game_mode"]
    starts_event = mode == "weekly" and _starts_event(user_input)
    resolves_event = mode == "event" and _resolves_event(user_input)
    ap_cost = 0 if mode in {"prologue", "event"} or starts_event else _estimated_ap_cost(user_input)
    available_with_overdraft = status["ap"] + MAX_AP_OVERDRAFT
    if mode == "weekly" and not starts_event and ap_cost > available_with_overdraft:
        return RuleResult(
            accepted=False,
            check="行动点预算",
            attribute="ap",
            difficulty=None,
            roll=None,
            total=None,
            result="invalid",
            effect=f"本周当前可用 {status['ap']} AP，最多再透支 {MAX_AP_OVERDRAFT} AP；请删减行动后重试，时间不得推进。",
            ap_cost=ap_cost,
            overdraft=max(0, ap_cost - status["ap"]),
            required_turn=None,
            required_status=None,
        )

    directive = build_turn_directive(status)
    required_turn = dict(directive.required_turn)
    required_status = dict(directive.required_status)
    overdraft = max(0, ap_cost - status["ap"])
    if starts_event:
        required_turn = {"kind": "event_start", "ap_cost": 0}
        required_status = {
            "game_mode": "event",
            "current_year": status["current_year"],
            "current_month": status["current_month"],
            "current_week": status["current_week"],
            "ap": status["ap"],
            "max_ap": status["max_ap"],
        }
    elif mode == "weekly":
        next_limit = WEEKLY_BASE_AP - overdraft
        required_turn = {"kind": "weekly", "ap_cost": ap_cost}
        required_status |= {"ap": next_limit, "max_ap": next_limit}
    elif mode == "event":
        required_turn = {"kind": "event_resolve" if resolves_event else "event_continue", "ap_cost": 0}
        required_status["game_mode"] = "weekly" if resolves_event else "event"

    spell = _spell_requirement(user_input)
    if spell and status["attributes"]["knowledge"] < spell[1]:
        return RuleResult(
            accepted=True,
            check=spell[0],
            attribute="knowledge",
            difficulty=spell[1],
            roll=None,
            total=status["attributes"]["knowledge"],
            result="failure",
            effect=f"学识 {status['attributes']['knowledge']} 低于门槛 {spell[1]}，必须失败并呈现合理反噬或无效结果。",
            ap_cost=ap_cost,
            overdraft=overdraft,
            required_turn=required_turn,
            required_status=required_status,
        )

    check, attribute, modifier, difficulty = _check_profile(user_input, status["attributes"])
    actual_roll = secrets.randbelow(20) + 1 if roll is None else _integer(roll, "roll", 1, 20)
    total = modifier + actual_roll
    succeeded = total >= difficulty
    return RuleResult(
        accepted=True,
        check=check,
        attribute=attribute,
        difficulty=difficulty,
        roll=actual_roll,
        total=total,
        result="success" if succeeded else "failure",
        effect="按检定结果结算行动，不得由叙事改判。" if succeeded else "行动失败，但失败后果仍须符合当前场景与安全边界。",
        ap_cost=ap_cost,
        overdraft=overdraft,
        required_turn=required_turn,
        required_status=required_status,
    )
