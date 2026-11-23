"""Background tasks that are not lost.

The event loop keeps only a weak reference to a task made with asyncio.create_task, so a task nobody holds
can be garbage-collected before it finishes (see the asyncio docs). `spawn` keeps a reference until the task
is done. Use it for fire-and-forget work such as a news refresh started by a request.
"""
import asyncio
from typing import Any, Coroutine

_running: set[asyncio.Task] = set()


def spawn(coro: Coroutine[Any, Any, Any]) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _running.add(task)
    task.add_done_callback(_running.discard)
    return task
