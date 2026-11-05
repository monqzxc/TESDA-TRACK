"""Domain errors raised by services and turned into JSON responses by tesda_track.main."""


class DomainError(Exception):
    status_code = 400

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class InvalidRequestError(DomainError):
    status_code = 422


class PermissionDeniedError(DomainError):
    status_code = 403


class AuthenticationError(DomainError):
    status_code = 401

    def __init__(self, detail: str = "Incorrect email or password."):
        super().__init__(detail)


class SessionCookieError(AuthenticationError):
    """A session cookie that is expired, revoked or forged. The error response clears it from the browser."""


class TooManyAttemptsError(DomainError):
    status_code = 429


class TspSignInError(DomainError):
    """Signing in through TESDA Skill Passport failed. `code` is the embed contract's error code, which the page
    passes on to TSP (docs/contracts/tsp-tracker-embed/CONTRACT.md); the response carries it beside the detail."""

    def __init__(self, code: str, status_code: int, detail: str):
        super().__init__(detail)
        self.code = code
        self.status_code = status_code
