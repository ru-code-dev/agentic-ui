"""agent/turn.py: folding session/update frames into a TurnResult."""

import unittest

from agentic_ui_server.agent.turn import TurnCollector


def chunk(text: str, meta: dict | None = None) -> dict:
    update = {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": text}}
    if meta:
        update["_meta"] = meta
    return update


class TurnCollectorTest(unittest.TestCase):
    def test_chunks_concatenated(self) -> None:
        c = TurnCollector()
        for text in ("Hel", "lo", ", мир"):
            c.feed(chunk(text))
        result = c.result("end_turn")
        self.assertEqual((result.text, result.stop_reason, result.updates_count), ("Hello, мир", "end_turn", 3))

    def test_final_empty_chunk_with_usage(self) -> None:
        c = TurnCollector()
        c.feed(chunk("OK"))
        c.feed(chunk("", {"usage": {"inputTokens": 12, "outputTokens": 1}, "durationMs": 340}))
        result = c.result("end_turn")
        self.assertEqual(result.text, "OK")
        self.assertEqual(result.usage, {"inputTokens": 12, "outputTokens": 1})
        self.assertEqual(result.duration_ms, 340)

    def test_tool_call_lifecycle(self) -> None:
        c = TurnCollector()
        c.feed(
            {
                "sessionUpdate": "tool_call",
                "toolCallId": "t1",
                "status": "pending",
                "title": "Write",
                "kind": "edit",
                "rawInput": {},
                "_meta": {"toolName": "write_file"},
            }
        )
        c.feed(
            {
                "sessionUpdate": "tool_call_update",
                "toolCallId": "t1",
                "status": "in_progress",
                "rawInput": {"file_path": "a.txt", "content": "x"},
            }
        )
        c.feed(
            {"sessionUpdate": "tool_call_update", "toolCallId": "t1", "status": "completed", "rawOutput": {"ok": True}}
        )
        call = c.result("end_turn").tool_calls["t1"]
        self.assertEqual((call.name, call.title, call.kind, call.status), ("write_file", "Write", "edit", "completed"))
        self.assertEqual(call.raw_input, {"file_path": "a.txt", "content": "x"})
        self.assertEqual(call.raw_output, {"ok": True})

    def test_permission_carries_raw_input_without_tool_call_frame(self) -> None:
        c = TurnCollector()
        params = {
            "toolCall": {
                "toolCallId": "g1",
                "title": "render",
                "rawInput": {"messages": [1]},
                "_meta": {"toolName": "mcp__x__render_ui"},
            }
        }
        c.feed_permission(params, {"outcome": {"outcome": "selected", "optionId": "proceed_always_project"}})
        result = c.result("end_turn")
        self.assertEqual(result.tool_calls["g1"].raw_input, {"messages": [1]})
        self.assertEqual(result.tool_calls["g1"].permission, "proceed_always_project")
        self.assertEqual(len(result.permissions), 1)
        self.assertFalse(result.permissions[0].question)

    def test_question_permission_recorded_as_question(self) -> None:
        c = TurnCollector()
        params = {"toolCall": {"toolCallId": "q1", "_meta": {"toolName": "ask_user_question"}}}
        c.feed_permission(params, {"outcome": {"outcome": "cancelled"}})
        record = c.result("end_turn").permissions[0]
        self.assertEqual((record.question, record.outcome, record.tool_name), (True, "cancelled", "ask_user_question"))

    def test_thoughts_kept_separate(self) -> None:
        c = TurnCollector()
        c.feed({"sessionUpdate": "agent_thought_chunk", "content": {"type": "text", "text": "thinking"}})
        c.feed(chunk("answer"))
        result = c.result("end_turn")
        self.assertEqual((result.text, result.thoughts), ("answer", "thinking"))

    def test_plan_and_usage_update(self) -> None:
        c = TurnCollector()
        c.feed({"sessionUpdate": "plan", "entries": [{"content": "step", "status": "pending"}]})
        c.feed({"sessionUpdate": "usage_update", "used": 10, "size": 100})
        result = c.result("end_turn")
        self.assertEqual(result.plan, [{"content": "step", "status": "pending"}])
        self.assertEqual(result.usage, {"context": {"used": 10, "size": 100}})

    def test_unknown_kinds_counted_not_fatal(self) -> None:
        c = TurnCollector()
        c.feed({"sessionUpdate": "brand_new_kind", "x": 1})
        c.feed({"no": "kind"})
        c.feed({"sessionUpdate": "agent_message_chunk", "content": {"type": "image", "data": "..."}})
        result = c.result("end_turn")
        self.assertEqual(result.text, "")
        self.assertEqual(result.updates_count, 3)
        self.assertEqual(result.kinds["brand_new_kind"], 1)


if __name__ == "__main__":
    unittest.main()
