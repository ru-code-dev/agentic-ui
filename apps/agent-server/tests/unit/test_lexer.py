"""a2ui/lexer.py: the ``BlockLexer`` port as DirectJsonParser configures it (vectors from @a2ui/agent tests)."""

import unittest

from agentic_ui_server.a2ui.lexer import Part, tokenize

OT, CT, F = "<a2ui-json>", "</a2ui-json>", "```"


def text(t: str) -> Part:
    return Part("text", text=t)


def block(raw: str, final: bool = True) -> Part:
    return Part("a2ui", raw=raw, final=final)


class LexerTest(unittest.TestCase):
    def test_standard(self) -> None:
        """[P3-extract] text, block, text."""
        reply = f"Preamble\n{OT}\n[1]\n{CT}\nPostamble"
        self.assertEqual(tokenize(reply), [text("Preamble"), block("[1]"), text("Postamble")])

    def test_close_tag_inside_strings(self) -> None:
        """[P3-extract] a close tag inside a double, single or triple-quoted string does not close the block."""
        self.assertEqual(tokenize(f'{OT}["x {CT} y"]{CT}'), [block(f'["x {CT} y"]')])
        self.assertEqual(tokenize(f"{OT}'''\n{CT}\n'''{CT}"), [block(f"'''\n{CT}\n'''")])

    def test_unclosed_block_is_not_final(self) -> None:
        """[P3-extract] a reply that ends inside a block yields a non-final part."""
        self.assertEqual(
            tokenize(f'Preamble\n{OT}\n{{"text": "Hello'), [text("Preamble"), block('{"text": "Hello', False)]
        )

    def test_attributes_and_case(self) -> None:
        """[P3-extract] tags are case-insensitive and may carry attributes; other names are not tags."""
        self.assertEqual(tokenize('<A2UI-JSON id="main">[1]</A2UI-JSON >'), [block("[1]")])
        self.assertEqual(tokenize("<a2ui-jsonx>[1]</a2ui-jsonx>"), [text("<a2ui-jsonx>[1]</a2ui-jsonx>")])
        long_s = "<a2ui-j\u017fon>[1]"
        self.assertEqual(tokenize(long_s), [text(long_s)], "case folding is ASCII-only like JavaScript /i")

    def test_markdown_cleaning(self) -> None:
        """[P3-extract] fences around or inside a block and inline-code backticks around tags are removed."""
        self.assertEqual(tokenize(f"P\n{F}html\n{OT}\n[]\n{CT}\n{F}\nQ"), [text("P"), block("[]"), text("Q")])
        self.assertEqual(tokenize(f"P\n{OT}\n{F}json\n[2]\n{F}\n{CT}"), [text("P"), block("[2]")])
        self.assertEqual(tokenize(f"Use `{OT}`[1]`{CT}` ok"), [text("Use"), block("[1]"), text("ok")])

    def test_stray_close_recovery(self) -> None:
        """[P3-extract] a close tag without an open tag recovers a fenced or line-started payload, once."""
        fenced = f'Preamble\n{F}json\n[{{"a": 1}}]\n{CT}\n{F}\nPostamble'
        self.assertEqual(tokenize(fenced), [text("Preamble"), block('[{"a": 1}]'), text("Postamble")])
        self.assertEqual(
            tokenize(f'Here is the UI.\n[{{"a": 1}}]\n{CT}'), [text("Here is the UI."), block('[{"a": 1}]')]
        )
        self.assertEqual(tokenize(f"Not a payload start:\n[1]\n{CT}"), [text(f"Not a payload start:\n[1]\n{CT}")])
        twice = tokenize(f'a\n{{"x": 1}}\n{CT}\nb\n{{"y": 2}}\n{CT}')
        self.assertEqual(twice, [text("a"), block('{"x": 1}'), text(f'b\n{{"y": 2}}\n{CT}')])
        self.assertEqual(tokenize(f"just text {CT} more"), [text(f"just text {CT} more")])

    def test_javascript_line_terminators_and_whitespace(self) -> None:
        """[P3-extract] \\r and U+2028 start lines, ECMAScript whitespace is trimmed (\\ufeff, \\u3000)."""
        self.assertEqual(tokenize(f"Preamble\r{F}json\r[1]\r{F}\r{CT}"), [text("Preamble"), block("[1]")])
        self.assertEqual(tokenize(f"\u00a0{OT}\u3000[1]\ufeff{CT}\u2028"), [block("[1]")])

    def test_empty_and_text_only(self) -> None:
        """[P3-extract] empty reply \u2192 no parts; text only \u2192 one text part; an empty block \u2192 empty raw."""
        self.assertEqual(tokenize(""), [])
        self.assertEqual(tokenize("No tags here"), [text("No tags here")])
        self.assertEqual(tokenize(f"T\n{OT}\n{CT}"), [text("T"), block("")])


if __name__ == "__main__":
    unittest.main()
