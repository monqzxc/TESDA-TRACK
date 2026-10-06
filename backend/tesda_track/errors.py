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
