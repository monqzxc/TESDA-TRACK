"""Sliding-window request limits kept in memory.

The API runs as a single process (see backend/Dockerfile). With several workers, each would keep its own counts.
"""
import ipaddress
import threading
import time
from collections import deque
from collections.abc import Callable

from starlette.requests import Request


class RateLimiter:
    def __init__(self, window_seconds: float = 60, max_keys: int = 10_000,
                 clock: Callable[[], float] = time.monotonic):
        self._window = window_seconds
        self._max_keys = max_keys
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int) -> float:
        """Count one request for `key`. Returns 0 when it is allowed, else the seconds until one would be."""
        now = self._clock()
        with self._lock:
            hits = self._hits.get(key)
            if hits is None:
                if len(self._hits) >= self._max_keys:
                    self._make_room(now)
                hits = self._hits[key] = deque()
            while hits and hits[0] <= now - self._window:
                hits.popleft()
            if len(hits) >= limit:
                return max(hits[0] + self._window - now, 0.001)
            hits.append(now)
            return 0

    def _make_room(self, now: float) -> None:
        for key in [key for key, hits in self._hits.items() if not hits or hits[-1] <= now - self._window]:
            del self._hits[key]
        while len(self._hits) >= self._max_keys:
            # Forgetting the oldest key only resets its count; overall budgets still apply.
            del self._hits[next(iter(self._hits))]


def client_address_key(request: Request) -> str:
    """The client's address; IPv6 clients by their /64 network, since one host can use any address in it."""
    host = request.client.host if request.client else ""
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host or "unknown"
    if address.version == 6 and address.ipv4_mapped:
        address = address.ipv4_mapped
    if address.version == 6:
        return str(ipaddress.ip_network(f"{address}/64", strict=False))
    return str(address)
