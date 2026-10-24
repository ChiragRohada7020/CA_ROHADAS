"""AI provider abstraction for the assistant.

Supports multiple providers (kilo, openai, anthropic, groq) via a single
``call_chat`` function that returns a streaming response. In development,
the ``kilo`` provider forwards to the Kilo Gateway URL.
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator

from fastapi import HTTPException, status
from httpx import AsyncClient, HTTPStatusError, TimeoutException


_SYSTEM_PROMPT = """You are CA Assistant, an expert clerk for an Indian CA firm.
You work directly on the firm's live records through your tools (MCP), under the
user's own permissions. Every answer is grounded in the data the tools return.

Rules:
- Never fabricate client names, task IDs, or reference numbers. If you cannot
  find something with a tool, say so and offer to look it up.
- When a tool call could change data, state what you will do and wait for the
  user to confirm before calling it. Only state-changing tools need confirmation.
- Round monetary figures to 2 decimal places.
- Dates are Indian financial year context: FY starts April 1, ends March 31.
- Present lists as short tables or bullet lists. Do not use markdown headers
  in your response beyond what is needed.
"""


_PROVIDERS = {
    "kilo": {
        "url": "https://gateway.kilo.ai/v1/chat/completions",
        "header_prefix": "Bearer",
    },
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "header_prefix": "Bearer",
    },
    "anthropic": {
        "url": "https://api.anthropic.com/v1/messages",
        "header_prefix": "Bearer",
    },
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "header_prefix": "Bearer",
    },
}


def _get_provider_config(provider: str) -> dict[str, Any]:
    if provider not in _PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_503_NOT_IMPLEMENTED,
            detail=f"AI provider '{provider}' is not configured",
        )
    return _PROVIDERS[provider]


async def call_chat(
    *,
    provider: str,
    api_key: str | None,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> AsyncIterator[str]:
    """Stream chat completions from the configured AI provider.

    Yields raw text tokens as they arrive. Raises ``HTTPException`` if the
    provider is unconfigured or the call fails.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider API key is not configured",
        )

    config = _get_provider_config(provider)

    if provider in ("openai", "groq", "kilo"):
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        async with AsyncClient(timeout=120.0) as client:
            try:
                async with client.stream(
                    "POST",
                    config["url"],
                    headers={
                        "Authorization": f"{config['header_prefix']} {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"AI provider error: {resp.status_code} {body[:500]}",
                        )
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        if line.startswith("data:"):
                            chunk = line[5:].strip()
                            if chunk == "[DONE]":
                                return
                            try:
                                data = json.loads(chunk)
                                content = data.get("choices", [{}])[0].get("delta", {}).get("content")
                                if content:
                                    yield content
                            except (json.JSONDecodeError, KeyError):
                                continue
            except TimeoutException:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="AI provider timed out",
                )
            except HTTPStatusError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"AI provider error: {exc}",
                )

    elif provider == "anthropic":
        # Claude uses a different streaming format
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages,
            "system": _SYSTEM_PROMPT,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        async with AsyncClient(timeout=120.0) as client:
            try:
                async with client.stream(
                    "POST",
                    config["url"],
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"AI provider error: {resp.status_code} {body[:500]}",
                        )
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        if line.startswith("data:"):
                            chunk = line[5:].strip()
                            if chunk == "[DONE]":
                                return
                            try:
                                data = json.loads(chunk)
                                if data.get("type") == "content_block_delta":
                                    content = data.get("delta", {}).get("text")
                                    if content:
                                        yield content
                            except (json.JSONDecodeError, KeyError):
                                continue
            except TimeoutException:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="AI provider timed out",
                )

    else:
        raise HTTPException(
            status_code=status.HTTP_503_NOT_IMPLEMENTED,
            detail=f"AI provider '{provider}' is not supported",
        )


def format_system_prompt() -> str:
    """Return the system prompt for the AI provider."""
    return _SYSTEM_PROMPT


def build_tool_schema(name: str, description: str, input_schema: dict[str, Any]) -> dict[str, Any]:
    """Convert an MCP tool definition into OpenAI-style tool schema."""
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": input_schema,
        },
    }
