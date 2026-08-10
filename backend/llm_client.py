import json
import os

import anthropic
from json_repair import repair_json

from schemas import Profile

_SYSTEM_PROMPT = "你是一个简历解析助手。从用户提供的简历文本中提取结构化信息，调用提供的工具保存结果。"

_TOOLS = [
    {
        "name": "save_resume_profile",
        "description": "将解析后的简历信息以结构化格式保存",
        "input_schema": Profile.model_json_schema(),
    }
]

_MATCH_TOOLS = [
    {
        "name": "fill_form_fields",
        "description": "根据简历信息为表单字段提供填写值",
        "input_schema": {
            "type": "object",
            "properties": {
                "matches": {
                    "type": "array",
                    "description": "需要填写的字段列表",
                    "items": {
                        "type": "object",
                        "properties": {
                            "selector": {"type": "string", "description": "字段的 CSS 选择器"},
                            "value": {"type": "string", "description": "要填写的值"},
                        },
                        "required": ["selector", "value"],
                    },
                }
            },
            "required": ["matches"],
        },
    }
]

_MATCH_SYSTEM = (
    "你是一个求职表单填写助手。根据候选人的简历信息，将表单字段与简历数据语义匹配并填写。\n"
    "\n"
    "填写规则：\n"
    "1. 语义理解：\n"
    "   - '项目介绍/背景/描述' → 写项目是什么、解决什么问题\n"
    "   - '项目职责/工作内容/负责内容' → 写个人具体做了什么\n"
    "   - '项目成果/收益/亮点' → 写量化结果或取得的成就\n"
    "   - '自我评价/个人简介' → 综合提炼个人优势\n"
    "2. 格式转换：简历原文是分点列表时，改写为流畅的连续段落，不要保留'·''•''-'等符号\n"
    "3. 长度参考：maxlength 有值时按比例填写；placeholder 有示例时参考其风格和长度；否则写 2-4 句\n"
    "4. 写作风格：简洁专业，主动语态，不加冗余开场白（如'本人...'）\n"
    "5. 跳过字段：验证码、密码、手机验证码、同意协议勾选框等一律不填\n"
    "6. value 只输出纯文本，不加 markdown"
)


def _build_client() -> anthropic.Anthropic:
    base_url = os.environ.get("ANTHROPIC_BASE_URL", "").rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]
    kwargs = {"base_url": base_url} if base_url else {}
    return anthropic.Anthropic(**kwargs)


def _coerce_tool_input(data: dict) -> dict:
    for key, value in data.items():
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith(("[", "{")):
                try:
                    data[key] = json.loads(repair_json(stripped))
                except Exception:
                    pass
    return data


def parse_resume(resume_text: str) -> Profile:
    client = _build_client()
    message = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        tools=_TOOLS,
        tool_choice={"type": "tool", "name": "save_resume_profile"},
        messages=[{"role": "user", "content": f"请解析以下简历：\n\n{resume_text}"}],
    )
    tool_block = next(b for b in message.content if b.type == "tool_use")
    return Profile(**_coerce_tool_input(tool_block.input))


def match_fields_with_llm(fields: list, profile: dict, fill_hint: str = "") -> list:
    client = _build_client()
    fields_desc = "\n".join(
        f"- selector={f['selector']!r}  label={f['label']!r}  "
        f"name={f['name']!r}  placeholder={f['placeholder']!r}  "
        f"type={f['type']}  maxlength={f.get('maxlength', '')}"
        for f in fields
    )
    hint_text = f"\n\n用户指定：{fill_hint}" if fill_hint else ""
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=_MATCH_SYSTEM + hint_text,
        tools=_MATCH_TOOLS,
        tool_choice={"type": "tool", "name": "fill_form_fields"},
        messages=[
            {
                "role": "user",
                "content": (
                    f"简历信息：\n{json.dumps(profile, ensure_ascii=False, indent=2)}"
                    f"\n\n表单字段：\n{fields_desc}"
                    f"\n\n请为合适的字段提供填写值。"
                ),
            }
        ],
    )
    tool_block = next(b for b in message.content if b.type == "tool_use")
    raw = _coerce_tool_input(tool_block.input)
    return raw.get("matches", [])
