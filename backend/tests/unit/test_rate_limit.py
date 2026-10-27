"""Database-free checks. Run with --confcutdir=backend/tests/unit."""
from tesda_track.services.rate_limit import RateLimiter


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_requests_are_allowed_again_as_the_window_slides():
    clock = Clock()
    limiter = RateLimiter(window_seconds=60, clock=clock)
    assert limiter.hit("a", 2) == 0
    clock.now += 30
    assert limiter.hit("a", 2) == 0
    assert limiter.hit("a", 2) == 30
    assert limiter.hit("b", 2) == 0
    clock.now += 30
    assert limiter.hit("a", 2) == 0
    assert limiter.hit("a", 2) == 30


def test_refused_requests_do_not_count():
    clock = Clock()
    limiter = RateLimiter(window_seconds=60, clock=clock)
    limiter.hit("a", 1)
    for _ in range(5):
        assert limiter.hit("a", 1) > 0
    clock.now += 60
    assert limiter.hit("a", 1) == 0


def test_key_count_stays_bounded():
    clock = Clock()
    limiter = RateLimiter(window_seconds=60, max_keys=3, clock=clock)
    for key in "abc":
        limiter.hit(key, 1)
    clock.now += 61
    limiter.hit("d", 1)
    # Expired keys go first, so a key still inside its window keeps its count.
    assert len(limiter._hits) == 1
    for key in "efg":
        limiter.hit(key, 1)
    assert len(limiter._hits) == 3
    assert limiter.hit("g", 1) > 0
