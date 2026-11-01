"""validation/: cost and nesting limits of a payload (SV-C7): no slow path, no crash, Node's integrity rules."""

import time
import unittest

from agentic_ui_server.resources import read_data_json
from agentic_ui_server.validation import validate_payload

CATALOG_ID = read_data_json("catalog.json")["catalogId"]


def text_surface(text: object) -> list:
    return [
        {"version": "v0.9", "createSurface": {"surfaceId": "s", "catalogId": CATALOG_ID}},
        {
            "version": "v0.9",
            "updateComponents": {"surfaceId": "s", "components": [{"id": "root", "component": "Text", "text": text}]},
        },
    ]


def nested_calls(depth: int) -> object:
    value: object = "x"
    for _ in range(depth):
        value = {"call": "formatString", "args": {"value": value}, "returnType": "string"}
    return value


class ValidationCostTest(unittest.TestCase):
    def test_nested_function_calls_validate_in_linear_time(self) -> None:
        """[SV-C7] five nested calls (Node's limit) validate fast: alternatives are not re-evaluated per branch."""
        started = time.perf_counter()
        self.assertEqual(validate_payload(text_surface(nested_calls(5))), [])
        self.assertLess(time.perf_counter() - started, 0.5)


def with_data(value: object, path: str = "/a") -> list:
    update = {"version": "v0.9", "updateDataModel": {"surfaceId": "s", "path": path, "value": value}}
    return [*text_surface("hi"), update]


def nested_objects(depth: int) -> object:
    value: object = "x"
    for _ in range(depth):
        value = {"k": value}
    return value


def texts(payload: list) -> list[str]:
    return [e.message for e in validate_payload(payload)]


class IntegrityRulesTest(unittest.TestCase):
    """Node's validateRecursionAndPaths rules (web_core integrity-checker.js); verdicts checked against Node in A2."""

    def test_global_depth_limit(self) -> None:
        """[SV-C7] a value deeper than 50 levels (counted from [message]) is invalid, never a RecursionError."""
        self.assertEqual(validate_payload(with_data(nested_objects(47))), [])
        self.assertEqual(texts(with_data(nested_objects(48))), ["Global recursion limit exceeded: Depth > 50"])
        deep_list: object = "x"
        for _ in range(150):
            deep_list = [deep_list]
        self.assertIn("Global recursion limit exceeded: Depth > 50", texts(text_surface(deep_list)))
        self.assertEqual(texts(text_surface(nested_calls(150))), ["Recursion limit exceeded: functionCall depth > 5"])

    def test_function_call_depth_limit(self) -> None:
        """[SV-C7] at most 5 nested function calls, in a component prop or a data-model value (Node's text)."""
        limit = "Recursion limit exceeded: functionCall depth > 5"
        self.assertEqual(validate_payload(text_surface(nested_calls(5))), [])
        self.assertIn(limit, texts(text_surface(nested_calls(6))))
        self.assertEqual(texts(with_data(nested_calls(7))), [limit])
        self.assertEqual(texts(with_data({"functionCall": nested_calls(5)})), [limit])

    def test_path_syntax(self) -> None:
        """[SV-C7] a path with '~' not followed by 0/1 is invalid wherever it appears; relaxed pointers pass."""
        for bad in ("/a~2", "/a~"):
            with self.subTest(bad):
                error = f"Invalid path syntax: '{bad}'"
                self.assertEqual(texts(text_surface({"path": bad})), [error])
                self.assertEqual(texts(with_data(1, bad)), [error])
                self.assertEqual(texts(with_data({"path": bad})), [error])
        for good in ("~0", "a~1b", "/a/~01", "", "/", "a", "/ä/😀"):
            with self.subTest(good):
                self.assertEqual(validate_payload(with_data(1, good)), [])
                if good not in ("", "/"):  # these bind the whole data model, an object (bindings.py, A4-26)
                    self.assertEqual(validate_payload(text_surface({"path": good})), [])
        self.assertIn("which holds an object", " ".join(texts(text_surface({"path": "/"}))))


if __name__ == "__main__":
    unittest.main()
