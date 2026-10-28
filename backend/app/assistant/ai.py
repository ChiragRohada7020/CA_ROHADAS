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

from app.core.config import settings


_SYSTEM_PROMPT = """You are CA Assistant, having a natural spoken conversation with a CA professional.

Speak like a real person would on a call - casual, brief, and natural. Think out loud briefly or just give the answer.
Keep responses to 1-2 sentences max when possible. Only give details if asked.
Don't use markdown, bullet lists, or formatting in spoken responses.
Avoid phrases like "Here's what I found" or "Let me check". Just answer directly.
Use natural Indian business conversation style.

You work directly on the firm's live records through tools (MCP), under the user's permissions.
Every answer must be grounded in data the tools return.

Rules:
- Never fabricate client names, task IDs, or reference numbers. If you can't find it, say "Can't find that" briefly.
- When a tool call could change data, ask for confirmation in natural speech.
- Round monetary figures to 2 decimal places.
- Dates are Indian financial year context: FY starts April 1, ends March 31.
- If user says "latest task", get the most recently created one.
- In voice mode, be ultra-concise. Think like whispering the key info.
"""


_PROVIDERS = {
    "kilo": {
        "url": "https://ai-gateway.kilo.ai/api/v1/chat/completions",
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
) -> AsyncIterator[dict[str, Any]]:
    """Stream chat completions from the configured AI provider.

    Yields structured events:
      {"type": "content",    "data": str}
      {"type": "tool_calls", "data": [{"name": str, "arguments": str}]}

    Raises ``HTTPException`` if the provider is unconfigured or the call fails.
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

        async with AsyncClient(
            timeout=120.0, verify=settings.ENVIRONMENT != "development"
        ) as client:
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
                    tool_calls: dict[int, dict[str, str]] = {}
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        if line.startswith("data:"):
                            chunk = line[5:].strip()
                            if chunk == "[DONE]":
                                break
                            try:
                                data = json.loads(chunk)
                            except json.JSONDecodeError:
                                continue
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content")
                            if content:
                                yield {"type": "content", "data": content}

                            for tc in delta.get("tool_calls", []):
                                idx = tc.get("index", 0)
                                if idx not in tool_calls:
                                    tool_calls[idx] = {"name": "", "arguments": ""}
                                func = tc.get("function", {})
                                if func.get("name"):
                                    tool_calls[idx]["name"] = func["name"]
                                if func.get("arguments"):
                                    tool_calls[idx]["arguments"] += func["arguments"]

                    if tool_calls:
                        yield {"type": "tool_calls", "data": [
                            {"name": tc["name"], "arguments": tc["arguments"]}
                            for tc in tool_calls.values()
                            if tc["name"]
                        ]}
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

        async with AsyncClient(
            timeout=120.0, verify=settings.ENVIRONMENT != "development"
        ) as client:
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
                    tool_calls: dict[int, dict[str, str]] = {}
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        if line.startswith("data:"):
                            chunk = line[5:].strip()
                            if chunk == "[DONE]":
                                break
                            try:
                                data = json.loads(chunk)
                            except json.JSONDecodeError:
                                continue

                            if data.get("type") == "content_block_delta":
                                delta = data.get("delta", {})
                                text = delta.get("text")
                                if text:
                                    yield {"type": "content", "data": text}

                            if data.get("type") == "content_block_start":
                                cb = data.get("content_block", {})
                                if cb.get("type") == "tool_use":
                                    idx = data.get("index", 0)
                                    if idx not in tool_calls:
                                        tool_calls[idx] = {"name": cb.get("name", ""), "arguments": ""}

                            if data.get("type") == "content_block_delta":
                                idx = data.get("index", 0)
                                delta = data.get("delta", {})
                                partial = delta.get("partial_json", "")
                                if idx in tool_calls and partial:
                                    tool_calls[idx]["arguments"] += partial

                    if tool_calls:
                        yield {"type": "tool_calls", "data": [
                            {"name": tc["name"], "arguments": tc["arguments"]}
                            for tc in tool_calls.values()
                            if tc["name"]
                        ]}
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
