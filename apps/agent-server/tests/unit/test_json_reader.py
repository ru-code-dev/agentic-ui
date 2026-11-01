"""a2ui/json_reader.py: the tolerant ``readJson`` port (trailing commas, raw newlines, curly quotes, errors)."""

import unittest

from agentic_ui_server.a2ui.json_reader import MAX_DEPTH, JsonReadError, read_json


class JsonReaderTest(unittest.TestCase):
    def assert_error(self, text: str, message: str) -> None:
        with self.assertRaises(JsonReadError) as ctx:
            read_json(text)
        self.assertEqual(str(ctx.exception), message)

    def test_strict_json(self) -> None:
        """[P3-extract] plain JSON values read as json.loads would."""
        self.assertEqual(
            read_json(' {"a": [1, -2.5, 1e3, true, false, null, "x"]} '),
            {"a": [1, -2.5, 1000.0, True, False, None, "x"]},
        )

    def test_trailing_commas(self) -> None:
        """[P3-extract] a trailing comma before ] or } is accepted, a leading or doubled one is not."""
        self.assertEqual(read_json('[{"a": [1, 2,],},]'), [{"a": [1, 2]}])
        self.assert_error("[,]", "Invalid JSON at 1: unexpected character ','")
        self.assert_error('{"a":1,,}', "Invalid JSON at 7: expected a key")

    def test_raw_newlines_kept_in_text_stripped_in_ids_keys_and_children(self) -> None:
        """[P3-extract] raw line breaks stay in text, are dropped from keys, id-like values and children items."""
        value = read_json('{"id": "a\nb", "text": "l1\nl2\tt", "k\ney": 1, "children": ["c\nd"]}')
        self.assertEqual(value, {"id": "ab", "text": "l1\nl2\tt", "key": 1, "children": ["cd"]})

    def test_data_model_keeps_newlines(self) -> None:
        """[P3-extract] inside updateDataModel.value / createSurface.dataModel nothing is stripped."""
        value = read_json('{"updateDataModel": {"value": {"id": "a\nb", "k\n": 1}, "surfaceId": "s\n1"}}')
        self.assertEqual(value, {"updateDataModel": {"value": {"id": "a\nb", "k\n": 1}, "surfaceId": "s1"}})

    def test_curly_quotes_retry(self) -> None:
        """[P3-extract] curly quotes as delimiters are straightened on retry; inside valid JSON they stay."""
        self.assertEqual(read_json("[{\u201ca\u201d: \u201cb\u201d}]"), [{"a": "b"}])
        self.assertEqual(read_json('{"t": "say \u201chi\u201d"}'), {"t": "say \u201chi\u201d"})

    def test_escapes(self) -> None:
        """[P3-extract] JSON escapes incl. surrogate pairs; bad escapes fail with Node's text."""
        self.assertEqual(read_json('["\\ud83d\\ude00\\u00e9\\n\\/"]'), ["\U0001f600\u00e9\n/"])
        self.assert_error('["\\q"]', "Invalid JSON at 2: invalid escape '\\q'")
        self.assert_error('["\\u12G4"]', "Invalid JSON at 2: invalid unicode escape")

    def test_error_positions_are_utf16(self) -> None:
        """[P3-extract] error offsets count UTF-16 units like JavaScript string indexes."""
        self.assert_error('["\U0001f600\U0001f600", x]', "Invalid JSON at 9: unexpected character 'x'")

    def test_numbers_follow_javascript(self) -> None:
        """[P3-extract] JSON number grammar; integers beyond 2**53 become doubles."""
        self.assertEqual(read_json("[-0, 10, 9007199254740993]"), [0, 10, 9007199254740992.0])
        self.assert_error("[01]", "Invalid JSON at 3: invalid number '01'")
        self.assert_error("[1.]", "Invalid JSON at 3: invalid number '1.'")

    def test_numbers_beyond_a_double_are_errors(self) -> None:
        """[P3-extract, SV-C7] 1e400 would be inf: the HTTP body would hold `Infinity`, which is not JSON.
        Deviation from Node (JSON.parse gives Infinity): the reply is invalid and goes to repair."""
        self.assertEqual(read_json("[1e308, -1e308]"), [1e308, -1e308])
        self.assert_error("[1e400]", "Invalid JSON at 6: number '1e400' is out of range")
        self.assert_error('{"v": -2E999}', "Invalid JSON at 12: number '-2E999' is out of range")
        self.assertEqual(read_json("[-9007199254740992, 123456789012345678]"), [-(2**53), 123456789012345678.0])
        for digits in (400, 5000):  # float(int) overflow, and Python's int digit limit: both used to escape
            with self.assertRaises(JsonReadError):
                read_json(f"[{'9' * digits}]")

    def test_structural_errors(self) -> None:
        """[P3-extract] missing colon, trailing text, unexpected end."""
        self.assert_error('{"a" 1}', "Invalid JSON at 5: expected ':' after key 'a'")
        self.assert_error("[1] x", "Invalid JSON at 4: unexpected text after the JSON value")
        self.assert_error('["abc', "Invalid JSON at 5: unexpected end of the JSON text")

    def test_depth_limit(self) -> None:
        """[P3-extract] deep nesting is a read error, never a RecursionError."""
        self.assertEqual(read_json("[" * MAX_DEPTH + "]" * MAX_DEPTH), eval("[" * MAX_DEPTH + "]" * MAX_DEPTH))
        with self.assertRaises(JsonReadError):
            read_json("[" * 5000 + "]" * 5000)


if __name__ == "__main__":
    unittest.main()
