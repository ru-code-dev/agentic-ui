"""agent/forget.py (A4-11): which of the CLI's per-chat files a forgotten chat removes, and never anything else."""

import hashlib
import re
import unittest
from pathlib import Path

from agentic_ui_server.agent.forget import chat_paths, remove_chat_files

from ..support.http_client import stub_settings
from ..support.tiers import temp_dir


class ForgetTest(unittest.TestCase):
    def layout(self) -> tuple[Path, Path, Path, Path]:
        tmp = temp_dir(self)
        home, work = tmp / "home", tmp / "work"
        cwd = work / "chat-1"
        cwd.mkdir(parents=True)
        project = home / ".qwen" / "projects" / re.sub(r"[^a-zA-Z0-9]", "-", str(cwd.resolve())) / "chats"
        project.mkdir(parents=True)
        (project / "s.jsonl").write_text("pasted data", encoding="utf-8")
        scratch = home / ".qwen" / "tmp" / hashlib.sha256(str(cwd.resolve()).encode()).hexdigest()
        scratch.mkdir(parents=True)
        (home / ".qwen" / "settings.json").write_text("{}", encoding="utf-8")
        return home, work, cwd, scratch

    def test_the_cli_transcript_and_tmp_are_removed_with_the_chat(self) -> None:
        """[A4-11] qwen's project dir (transcript) and tmp dir of the chat's cwd go; settings stay."""
        home, work, cwd, scratch = self.layout()
        settings = stub_settings(agent__home=str(home), agent__work_root=str(work))
        self.assertEqual(len(chat_paths(settings, cwd)), 2)
        remove_chat_files(settings, "chat-1", cwd)
        self.assertFalse(cwd.exists() or scratch.exists() or any((home / ".qwen" / "projects").iterdir()))
        self.assertTrue((home / ".qwen" / "settings.json").is_file())

    def test_a_template_outside_the_home_or_not_keyed_by_the_chat_is_refused(self) -> None:
        """[A4-11] a forget path that resolves outside the agent HOME, to HOME itself or to a shared folder (no
        cwd slug/hash in its name) is never removed."""
        home, _, cwd, _ = self.layout()
        for template in ("{home}/../{cwd_slug}", "{home}", "{home}/.qwen", "{home}/.qwen/projects"):
            with self.subTest(template):
                settings = stub_settings(agent__home=str(home), agent__forget_paths=template)
                self.assertEqual(chat_paths(settings, cwd), [])


if __name__ == "__main__":
    unittest.main()
