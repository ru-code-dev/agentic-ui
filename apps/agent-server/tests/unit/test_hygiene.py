"""Exit-criteria guards (PLAN §0, §3.3): env access, process spawning, stdlib-only imports, file size."""

import ast
import sys
import unittest

from ..support.tiers import APP_DIR, SRC_DIR

PACKAGE = SRC_DIR / "agentic_ui_server"
LIMIT = 250


def sources(root):
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


class HygieneTest(unittest.TestCase):
    def test_only_config_reads_the_environment(self) -> None:
        offenders = [
            path.name
            for path in sources(PACKAGE)
            if path.name != "config.py"
            and any(token in path.read_text(encoding="utf-8") for token in ("os.environ", "os.getenv", "getenv("))
        ]
        self.assertEqual(offenders, [])

    def test_only_process_spawns(self) -> None:
        tokens = ("create_subprocess", "subprocess", "os.system", "os.exec", "os.spawn", "os.fork", "Popen")
        offenders = [
            str(path.relative_to(PACKAGE))
            for path in sources(PACKAGE)
            if path.relative_to(PACKAGE).as_posix() != "agent/process.py"
            and any(token in path.read_text(encoding="utf-8") for token in tokens)
        ]
        self.assertEqual(offenders, [])

    def test_stdlib_imports_only(self) -> None:
        third_party = []
        for path in sources(PACKAGE):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                names = []
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.level == 0:
                    names = [node.module or ""]
                for name in names:
                    top = name.split(".")[0]
                    if top != "agentic_ui_server" and top not in sys.stdlib_module_names:
                        third_party.append(f"{path.name}: {name}")
        self.assertEqual(third_party, [])

    def test_every_python_file_within_250_lines(self) -> None:
        oversized = {
            str(path.relative_to(APP_DIR)): n
            for path in sources(APP_DIR)
            if (n := len(path.read_text(encoding="utf-8").splitlines())) > LIMIT
        }
        self.assertEqual(oversized, {})

    def test_no_network_modules_in_package_or_unit_tests(self) -> None:
        """Only ``http/server.py`` may import a network module (``http.server``, the P6 listener, the way only
        ``agent/process.py`` spawns); unit tests talk to it on 127.0.0.1 through ``tests/support/http_client.py``."""
        network = {"socket", "urllib", "http", "ssl", "asyncio.open_connection", "requests"}
        allowed = {"server.py": {"http.server"}}  # file name inside agentic_ui_server/http/
        offenders = []
        for path in sources(PACKAGE) + sources(APP_DIR / "tests" / "unit"):
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if isinstance(node, ast.ImportFrom) and node.level:
                    continue  # package-relative (``from ..http.api import``), not the stdlib
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
                    pure = {"urllib.parse"}  # string parsing only ($ref resolution, base path)
                    ok = pure | (allowed.get(path.name, set()) if path.parent.name == "http" else set())
                    offenders += [f"{path.name}: {n}" for n in names if n.split(".")[0] in network and n not in ok]
        self.assertEqual(offenders, [], "network modules only in http/server.py")

    def test_no_silent_except(self) -> None:
        silent = [
            f"{path.relative_to(PACKAGE)}:{node.lineno}"
            for path in sources(PACKAGE)
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8")))
            if isinstance(node, ast.ExceptHandler)
            and all(
                isinstance(stmt, (ast.Pass, ast.Continue))
                or (isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant))
                for stmt in node.body
            )
        ]
        self.assertEqual(silent, [], "SV-C16: every caught exception is logged")

    def test_runs_on_python_313(self) -> None:
        """[SV-C1] the server tests run on exactly Python 3.13, the deployment target (before: >= let 3.14 pass)."""
        self.assertEqual(sys.version_info[:2], (3, 13))


if __name__ == "__main__":
    unittest.main()
