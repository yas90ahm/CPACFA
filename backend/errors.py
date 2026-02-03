"""
Dedicated errors for audit/forensic and agent-orchestrator paths.
Handled by Flask error handlers to return 500 Internal Server Error (no silent green).
"""


class ForensicAuditError(Exception):
    """Raised when forensic scan or audit persistence fails. API must return 500."""

    def __init__(self, message: str, cause: Exception | None = None):
        super().__init__(message)
        self.message = message
        self.cause = cause


class AgentOrchestratorError(Exception):
    """Raised when agent orchestrator (CPA/CFA) fails during parsing or execution. API must return 500."""

    def __init__(self, message: str, cause: Exception | None = None):
        super().__init__(message)
        self.message = message
        self.cause = cause
