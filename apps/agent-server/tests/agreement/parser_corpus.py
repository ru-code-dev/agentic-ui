"""P3 parser agreement corpus: ported ``@a2ui/agent`` lexer/reader vectors, real model replies, example variants.

- ``VECTORS``: the upstream ``lexer.test.ts`` / direct-json ``parser.test.ts`` cases adapted to ``<a2ui-json>``,
  plus reader edge cases and JavaScript-semantics edges (Unicode whitespace, ``\\r``/U+2028 line starts,
  ASCII-only case folding, UTF-16 error positions, the lexer's ``OPEN_FENCE_RE`` state).
- every ``reply`` of the experiment results (real model replies), when the gitignored ``WORKFLOW/project/`` is present.
- every example payload (``packages/ui-kit-one-catalog/examples``) plainly wrapped and in one variant.
"""

import json
import re

from ..support.node import CATALOG_PKG, REPO

OT, CT = "<a2ui-json>", "</a2ui-json>"
F = "```"
DEEP = "[" * 60 + "1" + "]" * 60
VECTORS: list[tuple[str, str]] = [
    ("standard", f'Preamble\n{OT}\n[{{"a": 1}}]\n{CT}\nPostamble'),
    ("close-tag-in-string", f'Preamble\n{OT}\n[{{"t": "Hello {CT} World"}}]\n{CT}'),
    ("triple-quoted", f"{OT}\n'''\n{CT}\n'''\n{CT}"),
    ("unclosed", f'Preamble\n{OT}\n{{"text": "Hello'),
    ("unclosed-fenced", f"{OT}\n{F}json\n[1]\n{F}"),
    ("attributes", f'Preamble\n<a2ui-json id="main" surfaceId="foo">\n[1]\n{CT}\nPostamble'),
    ("attributes-newline", '<a2ui-json\n data-x="1">[1]</a2ui-json>'),
    ("outer-fence", f"Preamble\n{F}html\n{OT}\n[]\n{CT}\n{F}\nPostamble"),
    ("inner-fence", f"Preamble\n{OT}\n{F}json\n[2]\n{F}\n{CT}\nPostamble"),
    ("double-inner-fence", f"{OT}{F}json\n{F}json\n[3]{F}{F}{CT}"),
    ("stray-close-fenced", f'Preamble\n{F}json\n[{{"a": 1}}]\n{CT}\n{F}\nPostamble'),
    ("stray-close-bare-array", f'Here is the UI.\n[{{"a": 1}}]\n{CT}'),
    ("stray-close-bare-object", f'UI:\n{{"version": "v0.9"}}\n{CT}'),
    ("stray-close-no-payload", f"just text {CT} more"),
    ("stray-close-twice", f"a\n[1]\n{CT}\nb\n[2]\n{CT}"),
    ("stray-close-twice-objects", f'a\n{{"x": 1}}\n{CT}\nb\n[{{"y": 2}}]\n{CT}'),
    ("stray-close-empty-array", f"a\n[]\n{CT}"),
    ("stray-close-after-block", f"{OT}[1]{CT}\n[2]\n{CT}"),
    ("stray-close-cr", f"Preamble\r{F}json\r[1]\r{F}\r{CT}"),
    ("stray-close-u2028", f"Preamble\u2028[5]\u2028{CT}"),
    ("stray-close-nested-fence", f"x\n{F}\n{F}json\n[1]\n{F}\n{CT}"),
    ("stray-close-nested-fence-last", f"x\n{F}\nfoo\n{F}json\n[1]\n{CT}"),
    ("after-nested-fence", f"y\n{F}json\n[7]\n{F}\n{CT}"),
    ("case-insensitive", "<A2UI-JSON>[1]</A2UI-JSON >"),
    ("long-s-not-a-tag", "<a2ui-j\u017fon>[1]</a2ui-j\u017fon>"),
    ("not-a-tag", "<a2ui-jsonx>[1]</a2ui-jsonx>"),
    ("close-tag-newline", f"{OT}[1]</a2ui-json\n>"),
    ("inline-code-tags", f"Use `{OT}`[1]`{CT}` ok"),
    ("trailing-backticks", f"{OT}[1]{CT}``` tail"),
    ("empty-block", f"Text\n{OT}\n{CT}"),
    ("backticks-only-block", f"{OT}{F}{CT}"),
    ("two-blocks", f"one {OT}[1]{CT} two {OT}[2]{CT} three"),
    ("empty-reply", ""),
    ("whitespace-reply", " \n\t\u00a0"),
    ("text-only", "Text before\nNo tags here"),
    ("fences-only", f"see:\n{F}\n{F}"),
    ("unicode-space", f"\u00a0{OT}\u3000[1]\ufeff{CT}\u2028"),
    ("crlf", f"Intro\r\n{OT}\r\n[\r\n  1,\r\n]\r\n{CT}\r\n"),
    ("apostrophe-opens-string", f"{OT}[1] it's{CT}"),
    ("escaped-quote", f'{OT}["a\\"{CT}"]{CT}'),
    ("escaped-backslash-end", f'{OT}["a\\\\"]{CT}'),
    ("trailing-commas", f'{OT}[{{"a": [1, 2,], }},]{CT}'),
    ("raw-newlines", f'{OT}[{{"id": "a\nb", "text": "l1\nl2\tt", "k\ney": 1}}]{CT}'),
    ("raw-control-char", f'{OT}["a\x01b"]{CT}'),
    ("children-newlines", f'{OT}[{{"children": ["a\nb", "c"], "tabs": ["x\ny"]}}]{CT}'),
    ("data-model-newlines", f'{OT}[{{"updateDataModel": {{"value": {{"id": "a\nb", "k\n": 1}}}}}}]{CT}'),
    ("create-surface-data", f'{OT}{{"createSurface": {{"dataModel": {{"id": "x\ny"}}, "surfaceId": "s\n1"}}}}{CT}'),
    ("curly-delimiters", f"{OT}[{{\u201ca\u201d: \u201cb\u201d}}]{CT}"),
    ("curly-inside-valid", f'{OT}[{{"t": "say \u201chi\u201d"}}]{CT}'),
    ("curly-still-broken", f"{OT}[{{\u201ca\u201d \u201cb\u201d}}]{CT}"),
    ("missing-colon", f'{OT}[{{"a" 1}}]{CT}'),
    ("unexpected-char", f"{OT}[1, x]{CT}"),
    ("invalid-escape", f'{OT}["\\q"]{CT}'),
    ("invalid-unicode-escape", f'{OT}["\\u12G4"]{CT}'),
    ("short-unicode-escape", f'{OT}["\\u12"]{CT}'),
    ("surrogate-pair", f'{OT}["\\ud83d\\ude00 \\u00e9"]{CT}'),
    ("emoji-before-error", f'{OT}["\U0001f600\U0001f600", x]{CT}'),
    ("numbers", f"{OT}[-0, 1e5, 1.5E-3, 10, -2.25, 9007199254740993]{CT}"),
    ("number-leading-zero", f"{OT}[01]{CT}"),
    ("number-trailing-dot", f"{OT}[1.]{CT}"),
    ("number-minus-only", f"{OT}[-]{CT}"),
    ("words", f"{OT}[true, false, null]{CT}"),
    ("bad-word", f"{OT}[tru]{CT}"),
    ("single-object", f'{OT}{{"version": "v0.9"}}{CT}'),
    ("scalar", f"{OT}42{CT}"),
    ("text-after-json", f"{OT}[1] trailing{CT}"),
    ("double-comma-array", f"{OT}[1,,2]{CT}"),
    ("leading-comma-array", f"{OT}[,]{CT}"),
    ("double-comma-object", f'{OT}{{"a":1,,}}{CT}'),
    ("leading-comma-object", f"{OT}{{,}}{CT}"),
    ("duplicate-keys", f'{OT}{{"a": 1, "b": 2, "a": 3}}{CT}'),
    ("proto-key", f'{OT}{{"__proto__": {{"x": 1}}}}{CT}'),
    ("deep-nesting", f"{OT}{DEEP}{CT}"),
    ("unterminated-string", f'{OT}["abc{CT}'),
    ("unterminated-array", f"{OT}[1, 2{CT}"),
    # A3-02: the linear recovery (close_scan.CloseFinder) on fence-heavy replies, decided by Node
    ("a3-fences-stray-close", f"{F}\nx\n" * 40 + CT),
    ("a3-fences-quotes-stray-close", f"{F}\n'\n" * 40 + CT),
    ("a3-fences-mixed-quotes", "".join(f"{F}\n{q}\n" for q in ("'", '"', "'" * 3, '"' * 3, "\\'", "x") * 8) + CT),
    ("a3-fences-then-fenced-json", f"{F}\nx\n" * 9 + f"{F}json\n[1]\n{CT}\n{F}"),
    ("a3-fences-pairs-then-bare", f"{F}\na\n{F}\n" * 6 + f"text\n[7]\n{CT}"),
    ("a3-fence-spaces-body", f"{F}\n" + " " * 300 + f"[1]\n   {F}  \r\n{CT}"),
    ("a3-fence-no-newline", f"{F} {F}\n[1]\n{F}\n{F}\n{F}\n{F}\n{CT}"),
    ("a3-open-attr-no-gt", "<a2ui-json " * 30 + "[1]"),
    ("a3-open-attr-later-gt", "<a2ui-json x <a2ui-json y>[2]</a2ui-json>"),
    ("a3-trailing-fence-spaces", f"{OT}[1]{CT}\nend" + " " * 200 + f"{F}js"),
]


def real_replies() -> list[tuple[str, str]]:
    # Amendment A3: the experiment results are a workflow record under the gitignored WORKFLOW/project/; when the
    # folder is absent (a fresh clone) the corpus simply omits these vectors.
    results = REPO / "WORKFLOW" / "project" / "experiments" / "llm-contract" / "results"
    out = []
    for path in sorted(results.glob("*/*.json")) if results.exists() else []:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("reply"), str):
            out.append((f"reply:{path.parent.name}/{path.stem}", data["reply"]))
    return out


def _trailing_commas(text: str) -> str:
    return re.sub(r"([^\[{,\s])(\n\s*[\]}])", r"\1,\2", text)


def _raw_newlines(text: str) -> str:
    return text.replace('"id": "', '"id": "\n', 3).replace('"text": "', '"text": "\n', 3)


def _two_blocks(messages: list, compact: str) -> str:
    if len(messages) < 2:
        return f"Один блок: {OT}{compact}{CT}"
    first, rest = json.dumps(messages[:1], ensure_ascii=False), json.dumps(messages[1:], ensure_ascii=False)
    return f"Сначала поверхность:\n{OT}{first}{CT}\nПотом компоненты:\n{OT}\n{rest}\n{CT}"


VARIANTS = {
    "fenced": lambda j, c, m: f"{F}json\n{OT}\n{j}\n{CT}\n{F}",
    "inner-fence": lambda j, c, m: f"{OT}\n{F}json\n{j}\n{F}\n{CT}",
    "stray-close-fenced": lambda j, c, m: f"Вот UI:\n{F}json\n{j}\n{F}\n{CT}",
    "stray-close-bare": lambda j, c, m: f"Вот UI:\n{j}\n{CT}",
    "trailing-commas": lambda j, c, m: f"{OT}\n{_trailing_commas(j)}\n{CT}",
    "raw-newlines": lambda j, c, m: f"{OT}\n{_raw_newlines(j)}\n{CT}",
    "curly-quotes": lambda j, c, m: f"{OT}{c.replace(chr(34), chr(0x201C))}{CT}",
    "unclosed": lambda j, c, m: f"Готовлю…\n{OT}\n{j[:-12]}",
    "upper-attrs": lambda j, c, m: f'<A2UI-JSON data-surface="main">{c}</A2UI-JSON >',
    "two-blocks": lambda j, c, m: _two_blocks(m, c),
    "inline-code": lambda j, c, m: f"`{OT}`{c}`{CT}`",
}


def example_variants() -> list[tuple[str, str]]:
    files = sorted((CATALOG_PKG / "examples").glob("*/*.json"))
    names = list(VARIANTS)
    out = []
    for index, path in enumerate(files):
        messages = json.loads(path.read_text(encoding="utf-8"))["messages"]
        pretty, compact = json.dumps(messages, ensure_ascii=False, indent=2), json.dumps(messages, ensure_ascii=False)
        label = f"example:{path.parent.name}/{path.stem}"
        out.append((f"{label}:plain", f"Вот интерфейс:\n{OT}\n{pretty}\n{CT}\nГотово."))
        name = names[index % len(names)]
        out.append((f"{label}:{name}", VARIANTS[name](pretty, compact, messages)))
    return out


def build_corpus() -> list[dict]:
    return [{"id": i, "text": t} for i, t in [*VECTORS, *real_replies(), *example_variants()]]
