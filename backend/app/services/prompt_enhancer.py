"""
Prompt enhancer: rewrites a rough request into a clearer, more specific prompt.

Uses the active LLM when one is available (keeping the prompt's own language), and falls back to a
structured template in the UI language when it isn't.
"""
import asyncio
from typing import Optional

from backend.app.llm.provider import ModelConfig, UnifiedLLMClient

# mode -> language -> (header, points, footer). {prompt} is the user's original text.
TEMPLATES = {
    "precise": {
        "zh-TW": ("【🎯 精確嚴謹模式】請針對以下需求進行完整拆解與可驗證的實作：",
                  ["核心目標與邊界條件", "嚴密的邏輯推論、演算法設計與邊界案例", "完整實作、型別定義與驗證測試步驟"],
                  "原始需求：", "請輸出高確定性、零假設、可直接驗證的方案。"),
        "zh-CN": ("【🎯 精确严谨模式】请针对以下需求进行完整拆解与可验证的实现：",
                  ["核心目标与边界条件", "严密的逻辑推理、算法设计与边界案例", "完整实现、类型定义与验证测试步骤"],
                  "原始需求：", "请输出高确定性、零假设、可直接验证的方案。"),
        "en": ("[🎯 Precise mode] Break the following request down and deliver a verifiable implementation:",
               ["Core goal and strict constraints", "Rigorous reasoning, algorithm design and edge cases", "Complete implementation, types and verification steps"],
               "Original request:", "Give a precise answer with no unstated assumptions that can be verified directly."),
        "ja": ("【🎯 厳密モード】以下の要件を分解し、検証可能な形で実装してください：",
               ["目的と制約条件", "厳密な推論、アルゴリズム設計、境界ケース", "完全な実装、型定義、検証手順"],
               "元の要件：", "前提を置かず、そのまま検証できる確度の高い回答をしてください。"),
    },
    "balanced": {
        "zh-TW": ("【⚖️ 標準平衡模式】請針對以下需求提供結構化且具實用價值的解答：",
                  ["需求分析與最佳實踐架構", "模組化程式碼實作與關鍵說明", "潛在風險與效能優化建議"],
                  "原始需求：", "請輸出結構清晰、兼顧深度與可維護性的回答。"),
        "zh-CN": ("【⚖️ 标准平衡模式】请针对以下需求提供结构化且具实用价值的解答：",
                  ["需求分析与最佳实践架构", "模块化代码实现与关键说明", "潜在风险与性能优化建议"],
                  "原始需求：", "请输出结构清晰、兼顾深度与可维护性的回答。"),
        "en": ("[⚖️ Balanced mode] Give a structured, practical answer to the following request:",
               ["Requirements analysis and best-practice design", "Modular implementation with key explanations", "Risks and performance recommendations"],
               "Original request:", "Keep the answer well structured, thorough and maintainable."),
        "ja": ("【⚖️ バランスモード】以下の要件に対し、構造化された実用的な回答をしてください：",
               ["要件分析とベストプラクティスの設計", "モジュール化した実装と要点の説明", "潜在的なリスクとパフォーマンス改善案"],
               "元の要件：", "構造が明確で、深さと保守性を両立した回答にしてください。"),
    },
    "creative": {
        "zh-TW": ("【🎨 發散創意模式】請針對以下靈感進行跨界探索與延伸：",
                  ["突破框架的概念設計與體驗", "多種創新方案與驚喜構想", "具表現力且完整的實作藍圖"],
                  "原始靈感：", "請發揮想像力，帶來超乎預期的成果。"),
        "zh-CN": ("【🎨 发散创意模式】请针对以下灵感进行跨界探索与延伸：",
                  ["突破框架的概念设计与体验", "多种创新方案与惊喜构想", "富有表现力且完整的实现蓝图"],
                  "原始灵感：", "请发挥想象力，带来超出预期的成果。"),
        "en": ("[🎨 Creative mode] Explore and expand on the following idea:",
               ["Bold concepts and experience design", "Several inventive variations and surprises", "An expressive, complete implementation plan"],
               "Original idea:", "Use your imagination and go beyond the obvious."),
        "ja": ("【🎨 クリエイティブモード】以下のアイデアを自由に発展させてください：",
               ["枠にとらわれないコンセプトと体験設計", "複数の革新的な案と意外性のあるアイデア", "表現力豊かで完成度の高い実装プラン"],
               "元のアイデア：", "想像力を発揮し、期待を超える成果を出してください。"),
    },
}

AI_SYSTEM_PROMPT = (
    "You improve prompts. Rewrite the user's request into a clear, specific, well-structured prompt for an AI "
    "assistant: state the goal, relevant context and constraints, and the expected output format. Do not answer "
    "the request and do not add facts the user didn't imply. Write in the same language as the user's request. "
    "Output only the improved prompt, without any preamble or quotes."
)


def mode_for(temperature: float) -> str:
    if temperature <= 0.3:
        return "precise"
    if temperature >= 0.9:
        return "creative"
    return "balanced"


def template_enhance(prompt: str, temperature: float, language: str) -> str:
    lang = language if language in TEMPLATES["balanced"] else "zh-TW"
    header, points, label, footer = TEMPLATES[mode_for(temperature)][lang]
    lines = [header] + [f"{i}. {p}" for i, p in enumerate(points, 1)]
    return "\n".join(lines) + f"\n\n{label}\n{prompt}\n\n{footer}"


async def ai_enhance(prompt: str, config: ModelConfig, timeout: float = 60.0) -> Optional[str]:
    cfg = config.model_copy(update={"max_tokens": min(config.max_tokens or 1024, 1024), "temperature": 0.4})
    client = UnifiedLLMClient(cfg)
    messages = [{"role": "system", "content": AI_SYSTEM_PROMPT}, {"role": "user", "content": prompt}]

    async def run() -> str:
        text = ""
        async for chunk in client.stream_chat(messages):
            if chunk.type == "token" and chunk.content:
                text += chunk.content
            elif chunk.type == "error":
                raise RuntimeError(chunk.content)
        return text.strip().strip('"').strip()

    try:
        result = await asyncio.wait_for(run(), timeout=timeout)
    except Exception:
        return None
    return result if len(result) >= max(8, len(prompt) // 3) else None
