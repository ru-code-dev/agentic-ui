"""acp/permissions.py: always allow tools (SV-C10), reject questions (SV-C14)."""

import unittest
from typing import ClassVar

from agentic_ui_server.acp.permissions import choose_option, decide, is_question, reject_option

QWEN_OPTIONS = [  # qwen 0.21.1, verified (RESEARCH §B.1)
    {"optionId": "proceed_always_project", "name": "Always allow in this project", "kind": "allow_always"},
    {"optionId": "proceed_always_user", "name": "Always allow for this user", "kind": "allow_always"},
    {"optionId": "proceed_once", "name": "Allow once", "kind": "allow_once"},
    {"optionId": "cancel", "name": "Reject", "kind": "reject_once"},
]
QUESTION_OPTIONS = [  # qwen permissionUtils.ts:312-324
    {"optionId": "proceed_once", "name": "Submit", "kind": "allow_once"},
    {"optionId": "cancel", "name": "Cancel", "kind": "reject_once"},
]


def selected(option_id: str) -> dict:
    return {"outcome": {"outcome": "selected", "optionId": option_id}}


class ChooseOptionTest(unittest.TestCase):
    def test_qwen_options_pick_allow_always_project(self) -> None:
        self.assertEqual(choose_option(QWEN_OPTIONS), selected("proceed_always_project"))

    def test_only_allow_once(self) -> None:
        self.assertEqual(choose_option(QWEN_OPTIONS[2:]), selected("proceed_once"))

    def test_none_allowing_is_cancelled(self) -> None:
        self.assertEqual(choose_option(QWEN_OPTIONS[3:]), {"outcome": {"outcome": "cancelled"}})
        self.assertEqual(choose_option([]), {"outcome": {"outcome": "cancelled"}})
        self.assertEqual(choose_option(None), {"outcome": {"outcome": "cancelled"}})

    def test_whitespace_ids_trimmed_and_blank_ids_skipped(self) -> None:
        self.assertEqual(choose_option([{"optionId": "  keep  ", "kind": "allow_always"}]), selected("keep"))
        blank_always = [{"optionId": "  ", "kind": "allow_always"}, {"optionId": "once", "kind": "allow_once"}]
        self.assertEqual(choose_option(blank_always), selected("once"))

    def test_agent_ids_echoed_verbatim(self) -> None:
        self.assertEqual(choose_option([{"optionId": "Custom-ID_1", "kind": "allow_always"}]), selected("Custom-ID_1"))

    def test_malformed_options_ignored(self) -> None:
        self.assertEqual(choose_option(["x", {"kind": "allow_once"}, 3]), {"outcome": {"outcome": "cancelled"}})


class QuestionTest(unittest.TestCase):
    QWEN_QUESTION_CALL: ClassVar[dict] = {
        "toolCallId": "c1",
        "title": "Ask user 1 question",
        "kind": "think",
        "_meta": {
            "toolName": "ask_user_question",
            "qwenInteractionKind": "user_question",
            "qwenQuestions": [{"question": "Which?"}],
        },
    }

    def test_detection_rules(self) -> None:
        self.assertTrue(is_question(self.QWEN_QUESTION_CALL))
        self.assertTrue(is_question({"_meta": {"qwenInteractionKind": "user_question"}}))
        self.assertTrue(is_question({"_meta": {"toolName": "AskUserQuestion"}}))
        self.assertTrue(is_question({"title": "Ask user 2 questions"}))
        self.assertFalse(is_question({"title": "WriteFile x.txt", "_meta": {"toolName": "write_file"}}))
        self.assertFalse(is_question(None))

    def test_question_rejected_with_reject_once(self) -> None:
        params = {"options": QUESTION_OPTIONS, "toolCall": self.QWEN_QUESTION_CALL}
        self.assertEqual(decide(params), selected("cancel"))

    def test_question_without_reject_option_is_cancelled(self) -> None:
        params = {"options": QUESTION_OPTIONS[:1], "toolCall": self.QWEN_QUESTION_CALL}
        self.assertEqual(decide(params), {"outcome": {"outcome": "cancelled"}})
        self.assertEqual(reject_option(None), {"outcome": {"outcome": "cancelled"}})

    def test_tool_allowed(self) -> None:
        params = {"options": QWEN_OPTIONS, "toolCall": {"toolCallId": "t", "_meta": {"toolName": "write_file"}}}
        self.assertEqual(decide(params), selected("proceed_always_project"))
        self.assertEqual(decide(None), {"outcome": {"outcome": "cancelled"}})


if __name__ == "__main__":
    unittest.main()
