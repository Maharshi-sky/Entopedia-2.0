"""The Anthropic client, loaded on first use.

Importing the SDK at start-up made the whole API fail to start when the SDK cannot load (for example when a
Windows Application Control policy blocks one of its compiled modules). Loaded lazily, only the AI
Assistant endpoints that need it fail, with a clear error, and everything else keeps working.
"""
from typing import Any, Optional

_client: Optional[Any] = None


def _get() -> Any:
    global _client
    if _client is None:
        try:
            from anthropic import AsyncAnthropic
        except Exception as error:  # noqa: BLE001 - ImportError, or an OS error from a blocked DLL
            raise RuntimeError(f"The Anthropic SDK could not be loaded ({error!r})") from error
        _client = AsyncAnthropic()  # reads ANTHROPIC_API_KEY from the environment
    return _client


class _LazyAnthropic:
    @property
    def messages(self) -> Any:
        return _get().messages


anthropic_client = _LazyAnthropic()
