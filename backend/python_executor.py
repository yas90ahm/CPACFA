"""
Secure Python execution environment for the Quantitative Agent.

- Logic: The agent must write Python code for any calculation involving more than
  two variables (e.g., NPV, WACC, Multi-year Depreciation).
- Requirements: Use 'pandas' for ledger manipulation and 'numpy' for financial modeling.
- Verification: Output the Python code in a collapsed 'Source Code' block for human auditor.
- Error Handling: Autonomously debug and retry up to 3 times before asking for help.
"""

from __future__ import annotations

import ast
import io
import sys
import traceback
from dataclasses import dataclass, field
from typing import Any

# Optional: numpy, pandas, scipy for financial/ledger work
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    np = None
    HAS_NUMPY = False

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    pd = None
    HAS_PANDAS = False

try:
    import scipy
    HAS_SCIPY = True
except ImportError:
    scipy = None
    HAS_SCIPY = False


# --- Safe builtins (no open, exec, eval, __import__, etc.) ---
_SAFE_BUILTINS = {
    "abs", "all", "any", "bin", "bool", "bytearray", "bytes", "chr", "dict",
    "divmod", "enumerate", "filter", "float", "format", "frozenset", "hash",
    "int", "len", "list", "map", "max", "min", "next", "oct", "ord", "pow",
    "print", "range", "repr", "reversed", "round", "set", "slice", "sorted",
    "str", "sum", "tuple", "type", "zip", "None", "True", "False",
    "Exception", "ValueError", "TypeError", "ZeroDivisionError", "KeyError",
    "IndexError", "ArithmeticError", "AssertionError",
}
_SAFE_BUILTINS_DICT = {k: getattr(__builtins__, k) for k in _SAFE_BUILTINS if hasattr(__builtins__, k)}
if isinstance(__builtins__, dict):
    _SAFE_BUILTINS_DICT = {k: __builtins__[k] for k in _SAFE_BUILTINS if k in __builtins__}


def _safe_globals() -> dict[str, Any]:
    g: dict[str, Any] = {"__builtins__": _SAFE_BUILTINS_DICT}
    if HAS_NUMPY:
        g["np"] = np
        g["numpy"] = np
    if HAS_PANDAS:
        g["pd"] = pd
        g["pandas"] = pd
    if HAS_SCIPY:
        g["scipy"] = scipy
    import math
    from decimal import Decimal
    g["math"] = math
    g["Decimal"] = Decimal
    return g


def _is_dangerous(code: str) -> bool:
    """Block obviously dangerous constructs (import, exec, open, file access, etc.)."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return True  # Let executor handle syntax error
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            return True
        if isinstance(node, ast.ImportFrom):
            return True
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                name = node.func.id
                if name in ("exec", "eval", "compile", "open", "input", "file", "__import__", "globals", "locals", "getattr", "setattr", "delattr", "breakpoint"):
                    return True
        if isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name) and node.value.id == "os":
                return True
            if node.attr in ("system", "popen", "exec", "eval", "open", "__import__"):
                return True
    return False


def _attempt_fix(code: str, error: Exception) -> str | None:
    """
    Autonomously suggest a fixed version of the script (e.g. add missing imports).
    Returns None if no fix is attempted.
    """
    err_text = str(error).strip().lower()
    tb_text = traceback.format_exc().lower()

    # Missing numpy
    if "numpy" in err_text or "name 'np' is not defined" in err_text or "'np'" in err_text:
        if HAS_NUMPY and "import numpy" not in code.lower() and "import np" not in code.lower():
            return "import numpy as np\n" + code
    # Missing pandas
    if "pandas" in err_text or "name 'pd' is not defined" in err_text or "'pd'" in err_text:
        if HAS_PANDAS and "import pandas" not in code.lower() and "import pd" not in code.lower():
            return "import pandas as pd\n" + code
    # Missing scipy (e.g. scipy.optimize or scipy.stats)
    if "scipy" in err_text and HAS_SCIPY:
        if "import scipy" not in code.lower():
            return "import scipy\n" + code
    # Common typo: nupmy / numpy
    if "nupmy" in code or "numpy as npp" in code:
        return code.replace("nupmy", "numpy").replace("numpy as npp", "numpy as np")
    return None


@dataclass
class ExecutionResult:
    """Result of running agent Python code."""
    success: bool
    result: Any = None
    source_code: str = ""
    source_code_block: str = ""  # Collapsed 'Source Code' block for auditor (markdown)
    error: str | None = None
    attempt: int = 1
    max_attempts: int = 3
    stdout: str = ""
    stderr: str = ""
    traceback: str = ""

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "success": self.success,
            "attempt": self.attempt,
            "max_attempts": self.max_attempts,
            "source_code": self.source_code,
            "source_code_block": self.source_code_block,
        }
        if self.success:
            d["result"] = self.result
        else:
            d["error"] = self.error
            d["stderr"] = self.stderr
            if self.traceback:
                d["traceback"] = self.traceback
        if self.stdout:
            d["stdout"] = self.stdout
        return d


def _run_code(code: str) -> tuple[Any, str, str, str, Exception | None]:
    """
    Execute code in restricted globals. Returns (result, stdout, stderr, traceback_str, exception).
    Expects code to assign a variable 'result' for the numeric/output value (e.g. result = np.npv(...)).
    """
    g = _safe_globals()
    out = io.StringIO()
    err = io.StringIO()
    old_stdout, old_stderr = sys.stdout, sys.stderr
    exc: Exception | None = None
    try:
        sys.stdout = out
        sys.stderr = err
        exec(code, g)
        res = g.get("result")
        return res, out.getvalue(), err.getvalue(), "", None
    except Exception as e:
        exc = e
        tb_str = traceback.format_exc()
        return None, out.getvalue(), err.getvalue(), tb_str, e
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


def build_source_code_block(code: str, language: str = "python") -> str:
    """
    Format code as a collapsed 'Source Code' block for human auditor verification.
    Returns markdown that can be rendered as a collapsible block:
    <details><summary>Source Code</summary>
    ```python
    ...
    ```
    </details>
    """
    return f'<details><summary>Source Code</summary>\n\n```{language}\n{code}\n```\n\n</details>'


def execute(
    code: str,
    max_attempts: int = 3,
    allow_retry_fix: bool = True,
) -> ExecutionResult:
    """
    Execute agent-provided Python code in a secure environment.

    - Uses pandas (pd) for ledger manipulation and numpy (np) for financial modeling.
    - Returns the code in source_code_block so a human auditor can verify the formula.
    - On failure: autonomously attempts to fix (e.g. add missing imports) and retries up to max_attempts.
    """
    code = (code or "").strip()
    if not code:
        return ExecutionResult(
            success=False,
            source_code="",
            source_code_block=build_source_code_block("(no code provided)"),
            error="No code provided",
            attempt=1,
            max_attempts=max_attempts,
        )

    if _is_dangerous(code):
        return ExecutionResult(
            success=False,
            source_code=code,
            source_code_block=build_source_code_block(code),
            error="Code rejected: disallowed construct (e.g. import, exec, open)",
            attempt=1,
            max_attempts=max_attempts,
        )

    current_code = code
    last_tb = ""
    last_stderr = ""
    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        result, stdout, stderr, tb, exc = _run_code(current_code)
        if exc is None:
            # No exception: success (result may be None if code didn't set 'result')
            return ExecutionResult(
                success=True,
                result=result,
                source_code=current_code,
                source_code_block=build_source_code_block(current_code),
                attempt=attempt,
                max_attempts=max_attempts,
                stdout=stdout,
                stderr=stderr,
            )
        last_tb = tb
        last_stderr = stderr or str(exc)
        last_exc = exc

        if allow_retry_fix and attempt < max_attempts:
            fixed = _attempt_fix(current_code, exc)
            if fixed is not None and fixed != current_code:
                current_code = fixed
                continue
        break

    return ExecutionResult(
        success=False,
        source_code=current_code,
        source_code_block=build_source_code_block(current_code),
        error=last_stderr or last_tb or "Execution failed",
        attempt=min(attempt, max_attempts),
        max_attempts=max_attempts,
        stderr=last_stderr,
        traceback=last_tb,
    )


def _result_to_json_serializable(obj: Any) -> Any:
    """Convert numpy/pandas types to native Python for JSON response."""
    if obj is None:
        return None
    if HAS_NUMPY and hasattr(np, "ndarray") and isinstance(obj, np.ndarray):
        return obj.tolist()
    if HAS_NUMPY and hasattr(np, "floating") and isinstance(obj, (np.floating, np.integer)):
        return float(obj) if isinstance(obj, np.floating) else int(obj)
    if HAS_PANDAS and hasattr(pd, "DataFrame") and isinstance(obj, pd.DataFrame):
        return obj.to_dict(orient="records")
    if HAS_PANDAS and hasattr(pd, "Series") and isinstance(obj, pd.Series):
        return obj.tolist()
    if isinstance(obj, (list, tuple)):
        return [_result_to_json_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): _result_to_json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (int, float, str, bool)):
        return obj
    return str(obj)


def execute_for_quantitative_agent(
    code: str,
    formula_name: str | None = None,
    max_attempts: int = 3,
) -> dict[str, Any]:
    """
    Entry point for the Quantitative Agent: run code and return a response that includes
    the collapsed 'Source Code' block for auditor verification.
    """
    out = execute(code, max_attempts=max_attempts)
    d = out.to_dict()
    if out.success and d.get("result") is not None:
        d["result"] = _result_to_json_serializable(d["result"])
    if formula_name:
        d["formula_name"] = formula_name
    return d
