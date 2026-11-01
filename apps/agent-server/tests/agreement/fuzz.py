"""Differential fuzzing of the Python validator against the Node referee (A3 review, ported: SV-C7, A3-04/05/07).

Random generic mutations of every bundled example (delete, add a key from ``KEYS``, duplicate/drop an item, int →
float, swap the component type, edit a string, copy a property, bind a string, replace a value). The generator is
the A3 reviewer's ``attack/fuzz_validator.py`` unchanged, so a seed reproduces the review's cases (seeds 3, 11, 12,
13 × 4000 held 48 disagreements on 867c5dc). CLI (from apps/agent-server):
``python -m tests.agreement.fuzz [--cases N] [--seed S ...]`` prints one line per seed and exits 1 on a
disagreement.
"""

import argparse
import copy
import json
import random
import sys

from agentic_ui_server.resources import read_data_json
from agentic_ui_server.validation import format_errors, validate_payload

from ..support.node import run_referee
from .validator_cases import examples

CATALOG = read_data_json("catalog.json")
COMPONENTS = sorted(CATALOG["components"])
FUNCTIONS = sorted(CATALOG.get("functions", {}))
KEYS = [
    "bogus",
    "path",
    "call",
    "args",
    "functionCall",
    "dataBinding",
    "@path",
    "@call",
    "componentId",
    "checks",
    "action",
    "weight",
    "accessibility",
    "child",
    "children",
    "id",
    "component",
    "returnType",
    "event",
    "context",
    "literalString",
    "value",
    "surfaceId",
    "catalogId",
    "theme",
    "sendDataModel",
    "dataModel",
]
STRINGS = [
    "",
    " ",
    "root",
    "/a/b",
    "/",
    "a/b",
    "~",
    "a~2",
    "~0",
    "~1/x",
    "\n",
    "#fff",
    "USD",
    "usd",
    "http://x",
    "x:y",
    "1",
    "😀",
    "v0.9",
    "s",
    "Text",
    "formatString",
    "${/x}",
    "${x",
    "\\",
    "null",
    "0",
    "a b",
]


def leaves(value, path=()):
    yield path, value
    if isinstance(value, dict):
        for k, v in value.items():
            yield from leaves(v, (*path, k))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from leaves(v, (*path, i))


def get(root, path):
    for p in path:
        root = root[p]
    return root


def random_value(rng: random.Random, depth: int = 0):
    kind = rng.randrange(10 if depth < 2 else 6)
    if kind == 0:
        return rng.choice([None, True, False])
    if kind == 1:
        return rng.choice([0, 1, -1, 2, 1.5, 0.5, 100, 1e20, -0.0, 3.0, 2**31, 7])
    if kind in (2, 3, 4, 5):
        return rng.choice(STRINGS + COMPONENTS[:3])
    if kind == 6:
        return {"path": rng.choice(["/x", "x", "/a~2", "", "/rows/0"])}
    if kind == 7:
        fn = rng.choice(FUNCTIONS) if FUNCTIONS else "formatString"
        return {"call": fn, "args": {"value": random_value(rng, depth + 1)}}
    if kind == 8:
        return [random_value(rng, depth + 1) for _ in range(rng.randrange(3))]
    return {rng.choice(KEYS): random_value(rng, depth + 1)}


def mutate_once(rng: random.Random, messages: list) -> str:
    spots = list(leaves(messages))[1:]
    path, node = rng.choice(spots)
    parent = get(messages, path[:-1])
    key = path[-1]
    op = rng.randrange(11)
    if op == 0 and isinstance(parent, dict):
        del parent[key]
        return f"del {path}"
    if op == 1 and isinstance(node, dict):
        k = rng.choice(KEYS)
        node[k] = random_value(rng)
        return f"add {path}.{k}"
    if op == 2 and isinstance(node, list) and node:
        node.append(copy.deepcopy(rng.choice(node)))
        return f"dup-item {path}"
    if op == 3 and isinstance(node, list) and node:
        node.pop(rng.randrange(len(node)))
        return f"drop-item {path}"
    if op == 4 and isinstance(node, int) and not isinstance(node, bool):
        parent[key] = float(node) + (0.5 if rng.random() < 0.5 else 0.0)
        return f"float {path}"
    if op == 5 and key == "component":
        parent[key] = rng.choice(COMPONENTS)
        return f"swap-type {path}"
    if op == 6 and isinstance(node, str):
        parent[key] = node + rng.choice(["", " ", "\n", "x", "~", "/"])
        return f"str-edit {path}"
    if op == 7 and isinstance(node, dict):
        other = rng.choice([v for _, v in spots if isinstance(v, dict)])
        if other is not node and other:
            k = rng.choice(list(other))
            node[k] = copy.deepcopy(other[k])
            return f"copy-prop {path}.{k}"
    if op == 8 and isinstance(node, str) and key not in ("version",):
        parent[key] = (
            {"path": "/" + node.replace("~", "")}
            if rng.random() < 0.5
            else {"call": "formatString", "args": {"value": node}}
        )
        return f"bind {path}"
    parent[key] = random_value(rng)
    return f"replace {path}"


def generate(n: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    base = examples()
    cases = []
    for i in range(n):
        name, msgs = rng.choice(base)
        msgs = copy.deepcopy(msgs)
        ops = [mutate_once(rng, msgs) for _ in range(rng.choice([1, 1, 1, 2, 3]))]
        msgs = json.loads(json.dumps(msgs))  # what the JSON wire / the reader hands either validator
        cases.append({"id": f"f{i}", "example": name, "ops": ops, "messages": msgs})
    return cases


def disagreements(cases: list[dict]) -> list[dict]:
    """Every case whose Python verdict differs from Node's (smallest first)."""
    verdicts = {}
    for start in range(0, len(cases), 1000):
        batch = [{"id": c["id"], "messages": c["messages"]} for c in cases[start : start + 1000]]
        verdicts |= {r["id"]: r for r in run_referee("validator-referee.mjs", batch, timeout=600)["results"]}
    bad = []
    for case in cases:
        python, node = validate_payload(case["messages"]), verdicts[case["id"]]
        if (not python) != node["valid"]:
            lines = format_errors(python).splitlines()[:3]
            bad.append({**case, "node_valid": node["valid"], "node_error": node["error"], "python": lines})
    return sorted(bad, key=lambda c: len(json.dumps(c["messages"])))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", type=int, default=4000)
    parser.add_argument("--seed", type=int, nargs="+", default=[3, 11, 12, 13])
    args = parser.parse_args()
    total = 0
    for seed in args.seed:
        bad = disagreements(generate(args.cases, seed))
        total += len(bad)
        print(f"seed={seed} cases={args.cases} disagreements={len(bad)}")
        for case in bad[:5]:
            print(f"- {case['id']} {case['example']} {case['ops']} node={case['node_error']!r:.120} {case['python']}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
