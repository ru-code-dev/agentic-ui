"""SV-C21 in the Python validator: every style prop of every component takes its literal theme tokens only.

Each payload is the component's own valid example (``packages/ui-kit-one-catalog/examples/components/<Name>.json``)
with one style prop changed, so a rejection is about that prop, never a missing required one. Style props = the
catalog's literal-token props (``enum``) of the component and of the ``#/$defs`` groups it includes. Node's verdict
for the same variants was compared in A2 (910 cases, no disagreement on these).
"""

import copy
import json
import unittest

from agentic_ui_server.resources import read_data_json
from agentic_ui_server.validation import validate_payload

from ..support.node import CATALOG_PKG

CATALOG = read_data_json("catalog.json")
CALL = {"call": "formatString", "args": {"value": "x"}, "returnType": "string"}


def style_props(name: str) -> dict[str, list]:
    """prop → its token list, for the component's own and included ``#/$defs`` literal-token props."""
    out = {}
    for part in CATALOG["components"][name].get("allOf", []):
        ref = part.get("$ref", "")
        source = CATALOG["$defs"][ref.rsplit("/", 1)[-1]] if ref.startswith("#/$defs/") else part
        for prop, schema in source.get("properties", {}).items():
            if isinstance(schema, dict) and "enum" in schema:
                out[prop] = schema["enum"]
    return out


def example_with(name: str, prop: str, value: object) -> tuple[list, int]:
    """``(messages, index of the component)``: the component's example with ``prop`` set to ``value``."""
    path = CATALOG_PKG / "examples" / "components" / f"{name}.json"
    messages = copy.deepcopy(json.loads(path.read_text(encoding="utf-8"))["messages"])
    for message in messages:
        components = message.get("updateComponents", {}).get("components", [])
        for index, component in enumerate(components):
            if component.get("component") == name:
                component[prop] = value
                return messages, index
    raise AssertionError(f"{path.name} has no {name} component")


class StyleTokensTest(unittest.TestCase):
    def test_every_component_has_style_props(self) -> None:
        """[SV-C21] the walk covers every catalog component (none silently skipped)."""
        props = {name: style_props(name) for name in CATALOG["components"]}
        self.assertEqual([name for name, found in props.items() if not found], [])
        self.assertGreaterEqual(sum(len(found) for found in props.values()), 100)

    def test_bindings_calls_and_unknown_tokens_are_rejected_at_that_prop(self) -> None:
        """[SV-C21, SV-C7] a {"path"} binding, a function call or an unknown token in any style prop is invalid,
        and the problem names that component's prop."""
        for name in CATALOG["components"]:
            for prop in style_props(name):
                for label, value in (("binding", {"path": "/x"}), ("call", CALL), ("token", "no-such-token")):
                    with self.subTest(component=name, prop=prop, value=label):
                        messages, index = example_with(name, prop, value)
                        paths = [e.path for e in validate_payload(messages)]
                        self.assertTrue(paths, "accepted")
                        self.assertTrue(any(p.endswith(f"components[{index}].{prop}") for p in paths), paths)

    def test_every_literal_token_is_accepted(self) -> None:
        """[SV-C21] positive control: each token of each style prop validates on the same example."""
        for name in CATALOG["components"]:
            for prop, tokens in style_props(name).items():
                for token in tokens:
                    with self.subTest(component=name, prop=prop, token=token):
                        self.assertEqual(validate_payload(example_with(name, prop, token)[0]), [])


if __name__ == "__main__":
    unittest.main()
