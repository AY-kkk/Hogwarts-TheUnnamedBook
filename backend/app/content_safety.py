from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SafetyDecision:
    allowed: bool
    category: str = "allowed"
    user_message: str = ""


_PHONE_RE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
_CHINA_ID_RE = re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")


def inspect_content(text: str, *, is_output: bool = False) -> SafetyDecision:
    normalized = " ".join(text.lower().split())

    if "<script" in normalized or "javascript:" in normalized:
        return SafetyDecision(False, "active_content", "内容包含不安全的活动脚本，已拦截。")

    minor_terms = ("minor", "underage", "child", "student", "未成年", "儿童", "学生")
    sexual_terms = ("sexual", "erotic", "nude", "porn", "性行为", "色情", "裸体")
    if any(term in normalized for term in minor_terms) and any(
        term in normalized for term in sexual_terms
    ):
        return SafetyDecision(False, "sexual_minors", "不能生成涉及未成年人的性内容。")

    self_harm_terms = ("how to kill myself", "suicide method", "怎么自杀", "自杀方法")
    if any(term in normalized for term in self_harm_terms):
        return SafetyDecision(
            False,
            "self_harm_instructions",
            "我不能提供自伤方法。如果这与你现实中的安全有关，请立即联系当地紧急服务或你信任的人。",
        )

    instruction_terms = ("how to make", "instructions", "怎么制作", "教我制作")
    weapon_terms = ("bomb", "explosive", "poison", "炸弹", "爆炸物", "毒药")
    if any(term in normalized for term in instruction_terms) and any(
        term in normalized for term in weapon_terms
    ):
        return SafetyDecision(False, "real_world_harm", "不能提供现实世界的高危伤害制作指南。")

    if not is_output and (_PHONE_RE.search(normalized) or _CHINA_ID_RE.search(normalized)):
        return SafetyDecision(False, "sensitive_personal_data", "请删除真实手机号或身份证号后再提交。")

    injection_terms = (
        "ignore previous instructions",
        "reveal system prompt",
        "忽略之前的指令",
        "显示系统提示词",
    )
    if not is_output and any(term in normalized for term in injection_terms):
        return SafetyDecision(False, "prompt_injection", "该请求不属于游戏世界内的可执行行动。")

    return SafetyDecision(True)
