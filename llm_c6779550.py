import asyncio
import json
import httpx
from pydantic import BaseModel, ValidationError

from .config import settings

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class LLMError(Exception):
    pass


async def _chat(messages: list[dict]) -> str:
    if not settings.groq_api_key:
        raise LLMError("GROQ_API_KEY not set")
    body = {
        "model": settings.groq_model,
        "messages": messages,
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(4):
            r = await client.post(GROQ_URL, json=body, headers=headers)
            if r.status_code == 429:
                await asyncio.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
    raise LLMError("Groq rate-limited")


async def generate_structured(system: str, user: str, model_cls: type[BaseModel], retries: int = 1):
    """Call the LLM, validate against a Pydantic model, feed errors back and retry."""
    schema = json.dumps(model_cls.model_json_schema())
    messages = [
        {"role": "system", "content": f"{system}\n\nReturn ONLY JSON matching this schema:\n{schema}"},
        {"role": "user", "content": user},
    ]
    last_err = None
    for _ in range(retries + 1):
        raw = await _chat(messages)
        try:
            return model_cls.model_validate_json(raw)
        except (ValidationError, ValueError) as e:
            last_err = e
            messages += [
                {"role": "assistant", "content": raw},
                {"role": "user", "content": f"Invalid output: {e}\nReturn corrected JSON only."},
            ]
    raise LLMError(f"LLM output failed validation: {last_err}")
