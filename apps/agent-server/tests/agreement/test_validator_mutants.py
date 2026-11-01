"""A4-33: every single-rule mutant of the Python validator is killed by the agreement data.

Reviewer reproduction (attack/validator/mutants.py): 12 of 25 single-rule mutants survived the agreement suites. Each
mutant here = one textual edit of a copy of ``agentic_ui_server`` (in ``WORKFLOW/tmp``); the copy judges every step
of the committed ``validator-cases/cases.json`` (stateful, expected = the referee) and the stateless boundary
payloads (expected = ``validatePayload`` + project rules, one referee run); a mutant is killed when one verdict
changes. ``EQUIVALENT``: edits no verdict can see (proven with the probe named in the reason).
"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from ..support.node import REPO, run_referee
from .validator_cases import CASES_FILE

SRC = Path(__file__).resolve().parents[2] / "src" / "agentic_ui_server"
V = "validation/"
MUTANTS = {
    "func-depth-6": (V + "integrity.py", "MAX_FUNC_CALL_DEPTH = 5", "MAX_FUNC_CALL_DEPTH = 6"),
    "global-depth-51": (V + "integrity.py", "MAX_GLOBAL_DEPTH = 50", "MAX_GLOBAL_DEPTH = 51"),
    "tree-depth-51": (V + "topology.py", "MAX_DEPTH = 50", "MAX_DEPTH = 51"),
    "max-args-1001": (V + "components.py", "MAX_FUNCTION_CALL_ARGS = 1000", "MAX_FUNCTION_CALL_ARGS = 1001"),
    "assumes-no-break": (V + "surfaces.py", "if later_sid == sid and action == DELETE:\n                break", "pass"),
    "empty-id-ok": (V + "components.py", "if not isinstance(cid, str) or not cid:", "if not isinstance(cid, str):"),
    "js-dollar-off": (V + "schema.py", 'pattern = pattern[:-1] + r"\\Z"', "pass"),
    "tilde-any-digit": (V + "integrity.py", '_SEGMENT = r"(?:[^~/]|~[01])"', '_SEGMENT = r"(?:[^~/]|~[0-9])"'),
    "function-key-off": (
        V + "components.py",
        'key = "call" if value.get("call") is not None else "function"',
        'key = "call"',
    ),
    "component-catalogid-off": (
        V + "components.py",
        "if isinstance(catalog_id, str) and catalog_id != self.registry.catalog_id:",
        "if False:",
    ),
    "nested-call-args-off": (
        V + "components.py",
        'return evaluator.check(schema, {} if args is None else args, self.registry.catalog_base, f"{where}.args")',
        "return []",
    ),
    "no-dup-id": (V + "surfaces.py", "            if cid in seen:\n", "            if False:\n"),
    "no-orphan": (V + "topology.py", "c not in visited and ROOT_ID in components)", "c not in visited and False)"),
    "at-call-off": (V + "integrity.py", '("call" in obj or "@call" in obj) and "args"', '"call" in obj and "args"'),
    "at-path-off": (
        V + "integrity.py",
        'for key in ("path", "@path"):\n            path',
        'for key in ("path",):\n            path',
    ),
    "min-items-off": (V + "schema.py", 'if "minItems" in schema and len(inst) < schema["minItems"]:', "if False:"),
    "create-catalog-off": (V + "surfaces.py", 'if body.get("catalogId") != self.catalog_id:', "if False:"),
    "per-message-cycles-off": (V + "surfaces.py", "issues += self._cycles(sid, path)", "pass"),
    "integer-accepts-float": (
        V + "values.py",
        'return ok and (wanted == "number" or float(value).is_integer())',
        "return ok",
    ),
    "missing-root-off": (
        V + "topology.py",
        "    if ROOT_ID not in components:\n        issues.append(",
        "    if False:\n        issues.append(",
    ),
    "minimum-off": (V + "schema.py", 'if "minimum" in schema and inst < schema["minimum"]:', "if False:"),
    "proto-key-off": (V + "integrity.py", 'if "__proto__" in item and not proto_reported:', "if False:"),
    "forbidden-segment-off": (V + "datamodel.py", "if segment in FORBIDDEN_KEYS:", "if False:"),
    "blank-surface-id-ok": (V + "surfaces.py", "if not sid.strip(JS_WHITESPACE):", "if not sid:"),
    "bound-values-off": (V + "bindings.py", "if held and (cid, prop) not in reported:", "if False:"),
    "template-path-off": (V + "bindings.py", 'and comp[key]["path"] in ("", ".")', "and False"),
    "array-segment-ok": (V + "datamodel.py", "if on_array and not _INDEX.fullmatch(segment):", "if False:"),
    "array-index-unbounded": (V + "datamodel.py", "if index > MAX_ARRAY_INDEX:", "if False:"),
    "through-primitive-ok": (
        V + "datamodel.py",
        "child = current.get(segment, UNDEFINED)\n            if not _absent(child) and not _container(child):",
        "child = current.get(segment, UNDEFINED)\n            if False:",
    ),
    "partial-type-off": (V + "structure.py", "message = _typed(message, known) if", "message = message if"),
    "unknown-surface-ok": (V + "surfaces.py", "if not (not self.stateful and self._assumes(index, sid)):", "if False:"),
    "delete-reported": (
        V + "surfaces.py",
        "            surfaces.pop(sid, None)\n",
        (
            "            issues.append(Issue(path, 'x')) if sid not in surfaces else None\n"
            "            surfaces.pop(sid, None)\n"
        ),
    ),
}
EQUIVALENT = {
    "uri-any": "Node checks no `format` (boundary-openurl-not-uri is valid in both)",
    "template-no-databinding": "a `{componentId, dataBinding}` ChildList fails the schema first "
    "(boundary-template-databinding)",
    "bool-eq-int": "the catalog and the v0.9 schemas hold no numeric const/enum a boolean could equal",
    "self-ref-off": "surfaces._cycles (check_cycles after every updateComponents) reports every self-reference first",
}
RUNNER = """
import json, sys
from agentic_ui_server.validation import SurfaceState, validate_payload, validate_step
data = json.load(open(sys.argv[1], encoding="utf-8"))
wrong = []
for case in data["cases"]:
    state = SurfaceState()
    for i, step in enumerate(case["steps"]):
        try:
            result = validate_step(step["messages"], state)
        except Exception as exc:  # a crash changes the verdict too
            wrong.append(f"{case['id']}#{i}: {type(exc).__name__}")
            break
        if (not result.issues) != step["expected"]["valid"]:
            wrong.append(f"{case['id']}#{i}")
        state = result.state or state
for item in data["stateless"]:
    try:
        ok = not validate_payload(item["messages"])
    except Exception as exc:
        ok = type(exc).__name__
    if ok != item["valid"]:
        wrong.append(item["id"])
print(json.dumps(wrong))
"""


def stateless_boundaries(cases: list[dict]) -> list[dict]:
    """The first step of every multi-turn / boundary chat as a stateless payload, judged by validatePayload."""
    payloads = [{"id": c["id"], "messages": c["steps"][0]["messages"]} for c in cases if c["mutation"] == "multi-turn"]
    payloads.append({"id": "assume-then-delete-then-create", "messages": ASSUME_DELETE_CREATE})
    verdicts = {r["id"]: r["valid"] for r in run_referee("validator-referee.mjs", payloads)["results"]}
    return [{**p, "valid": verdicts[p["id"]]} for p in payloads]


_COMPS = {
    "version": "v0.9",
    "updateComponents": {"surfaceId": "s", "components": [{"id": "root", "component": "Text", "text": "a"}]},
}
ASSUME_DELETE_CREATE = [
    _COMPS,
    {"version": "v0.9", "deleteSurface": {"surfaceId": "s"}},
    {"version": "v0.9", "createSurface": {"surfaceId": "s", "catalogId": "urn:agentic-ui:catalog:ui-kit-one:v1"}},
    _COMPS,
]


class ValidatorMutantsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))["cases"]
        cls.data = {"cases": cases, "stateless": stateless_boundaries(cases)}
        cls.tmp = Path(tempfile.mkdtemp(prefix="a4f-mutants-", dir=REPO / "WORKFLOW" / "tmp"))
        cls.input = cls.tmp / "input.json"
        cls.input.write_text(json.dumps(cls.data, ensure_ascii=False), encoding="utf-8")

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def judge(self, name: str, file: str | None = None, old: str = "", new: str = "") -> list[str]:
        copy_root = self.tmp / name
        shutil.copytree(SRC, copy_root / "agentic_ui_server", ignore=shutil.ignore_patterns("__pycache__"))
        if file is not None:
            target = copy_root / "agentic_ui_server" / file
            text = target.read_text(encoding="utf-8")
            self.assertEqual(text.count(old), 1, f"{name}: the mutated snippet must occur once in {file}")
            target.write_text(text.replace(old, new), encoding="utf-8")
        proc = subprocess.run(
            [
                sys.executable,
                "-I",
                "-c",
                f"import sys; sys.path.insert(0, {str(copy_root)!r})\n{RUNNER}",
                str(self.input),
            ],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
        return json.loads(proc.stdout)

    def test_unmutated_copy_agrees(self) -> None:
        """[A4-33, SV-C28] baseline: the copy gives every expected verdict (else no kill would mean anything)."""
        self.assertEqual(self.judge("baseline"), [])

    def test_every_single_rule_mutant_is_killed(self) -> None:
        """[A4-33, SV-C7, SV-C28, A4-24, A4-27, A4-29, A4-30] each mutant changes at least one verdict of cases.json
        or the boundary payloads."""
        survivors = [name for name, edit in MUTANTS.items() if not self.judge(name, *edit)]
        print(
            f"\nvalidator mutants: {len(MUTANTS) - len(survivors)}/{len(MUTANTS)} killed, {len(EQUIVALENT)} equivalent"
        )
        self.assertEqual(survivors, [])


if __name__ == "__main__":
    unittest.main()
