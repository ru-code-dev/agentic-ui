"""a2ui/extract.py: ``compile`` error texts (Node ParseError) and the per-reply ``Extraction``."""

import unittest

from agentic_ui_server.a2ui.extract import ParseError, compile_block, extract

OT, CT = "<a2ui-json>", "</a2ui-json>"


class CompileTest(unittest.TestCase):
    def test_array_object_and_scalar(self) -> None:
        """[P3-extract] an array is the message list; any other value is wrapped into a list."""
        self.assertEqual(compile_block('[{"a": 1}]'), [{"a": 1}])
        self.assertEqual(compile_block('{"a": 1}'), [{"a": 1}])
        self.assertEqual(compile_block("42"), [42])

    def test_error_texts_are_nodes(self) -> None:
        """[P3-extract] the three ParseError texts of DirectJsonParser.compile, verbatim."""
        cases = {
            ("[1", False): f"The response ended inside an {OT} block, before its {CT} tag.",
            ("```", True): "The direct JSON block is empty.",
            ("not json", True): "The direct JSON block is not JSON: Invalid JSON at 0: unexpected character 'n'",
        }
        for (raw, final), message in cases.items():
            with self.subTest(raw=raw), self.assertRaises(ParseError) as ctx:
                compile_block(raw, final)
            self.assertEqual(str(ctx.exception), message)


class ExtractTest(unittest.TestCase):
    def test_messages_texts_and_errors_of_every_block(self) -> None:
        """[P3-extract, P3-parser-agreement] every block is compiled; good ones give messages, bad ones errors."""
        result = extract(f"one {OT}[1]{CT} two {OT}[2,]{CT} three {OT}[x]{CT}")
        self.assertEqual(result.texts, ("one", "two", "three"))
        self.assertEqual(result.messages, [1, 2])
        self.assertEqual(
            result.errors, ("The direct JSON block is not JSON: Invalid JSON at 1: unexpected character 'x'",)
        )
        self.assertTrue(result.has_blocks)

    def test_text_only_reply_has_no_blocks(self) -> None:
        """[P3-extract] a question without a UI block has no blocks (the repair loop treats it as invalid, P5)."""
        result = extract("Какие данные показать?")
        self.assertFalse(result.has_blocks)
        self.assertEqual((result.text, result.messages, result.errors), ("Какие данные показать?", [], ()))


if __name__ == "__main__":
    unittest.main()
