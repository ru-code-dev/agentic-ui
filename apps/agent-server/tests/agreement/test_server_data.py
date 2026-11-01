"""CF-I3: the bundled server data equals what the contract generates now; a stale copy fails check:generated."""

import shutil
import subprocess
import unittest

from agentic_ui_server.resources import SCHEMA_RESOURCES, read_data_text

from ..support.node import REPO, require_node
from ..support.tiers import temp_dir

DATA = REPO / "apps" / "agent-server" / "src" / "agentic_ui_server" / "data"
CHECK = REPO / "apps" / "agent-server" / "scripts" / "check-generated.mjs"
FILES = ("catalog.json", "contract-version.json", "system-prompt.md", *SCHEMA_RESOURCES)


class ServerDataTest(unittest.TestCase):
    def check(self, *args: str) -> subprocess.CompletedProcess:
        node = require_node()
        return subprocess.run([node, str(CHECK), *args], cwd=REPO, capture_output=True, text=True, check=False)

    def test_bundled_copy_is_fresh(self) -> None:
        """[P3-sync-data, DEC-042] the data files equal the freshly generated contract artifacts."""
        tmp = temp_dir(self)
        for name in FILES:
            (tmp / name).write_text(read_data_text(name), encoding="utf-8")
        result = self.check("--against", str(tmp))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("agent-server: 5 generated artifacts up to date", result.stdout)

    def test_stale_copy_fails(self) -> None:
        """[P3-sync-data, DEC-042] an unsynced copy (old prompt, missing schema) fails the stale check."""
        tmp = temp_dir(self)
        for name in FILES:
            shutil.copy(DATA / name, tmp / name)
        (tmp / "system-prompt.md").write_text(read_data_text("system-prompt.md") + "old\n", encoding="utf-8")
        (tmp / "common_types.json").unlink()
        result = self.check("--against", str(tmp))
        self.assertEqual(result.returncode, 1)
        self.assertIn("system-prompt.md: stale", result.stderr)
        self.assertIn("common_types.json: missing", result.stderr)


if __name__ == "__main__":
    unittest.main()
