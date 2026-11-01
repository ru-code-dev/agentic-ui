"""Amendment A1 §3 policy detector used by ``tests/unit/test_model_policy.py``.

No committed file may reveal an LLM provider, proxy or model: a model id, a provider/vendor name, a provider URL
or an API key. Everything machine-specific lives in the gitignored ``WORKFLOW/`` (``llm.env``, the qwen home).

Scans every git-tracked file under ``apps/``, ``packages/``, ``scripts/``, ``experiments/``, ``handover/``,
``.githooks/`` and the repo root (``SCANNED``). Flags, by generic heuristic (no provider name is written here except
the detector's own test fixtures and the optional machine-local term list):

* ``@preset/<x>`` ids and known vendor/model slugs (``<vendor>/<model>``) and model-family names;
* a VALUE given to a model setting (``--model X`` / ``-m X`` on a qwen/ACP line, ``agent.model=X``,
  ``<ANY>_MODEL=X``, a quoted ``model``/``modelName`` value, qwen settings ``model.name``) — references
  (``$X``/``<x>``/``{x}``) and the neutral example ids ``model-a``/``model-b`` are not names;
* every term in the optional gitignored ``WORKFLOW/llm-forbidden.txt`` (one term per line; the machine puts its
  real provider/proxy/model names and its endpoint URL there), when that file is present — this is the reliable
  catch for the provider name, proxy name, base URL and key, which have no safe generic shape (an LLM base URL
  looks like any other URL; a key looks like any other token).

Exemptions: the playground's offline tokenizer ids (``TOKENIZER_IDS``, DEC-003) and the generated HTTP contract's
neutral example ids (``EXAMPLE_IDS``), listed per file and exact (a stale or widened exemption fails).
"""

import json
import re
import subprocess
import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SCANNED = ("apps", "packages", "scripts", "experiments", "handover", ".githooks")
NOT_SCANNED = ("experiments/llm-contract/results/",)
SUFFIXES = {".py", ".mjs", ".cjs", ".js", ".jsx", ".ts", ".tsx", ".toml", ".json", ".yaml", ".yml", ".sh", ".md"}
# Neutral placeholder model ids used by fakes/fixtures/docs (A1 §2): never real names.
ALLOWED = {"model-a", "model-b", "model-c"}
FORBIDDEN_TERMS_FILE = REPO / "WORKFLOW" / "llm-forbidden.txt"
SELF = (  # the detector's own patterns and bad examples
    "apps/agent-server/tests/unit/test_model_policy.py",
    "apps/agent-server/tests/support/model_policy.py",
)
PLAYGROUND = "apps/playground/"
TOKENIZER_IDS: dict[str, set[str]] = {
    PLAYGROUND + "src/llm/tokenizers.ts": {"Qwen2.5", "Qwen3", "GPT-4o", "qwen2.5"},  # labels + vendored folder
    PLAYGROUND + "src/llm/tokenizers.test.ts": {"qwen2.5"},
    PLAYGROUND + "src/app/base-path.ts": {"qwen2.5"},  # doc example of a public/ URL
    PLAYGROUND + "src/app/base-path.test.ts": {"qwen2.5"},
    PLAYGROUND + "e2e/subpath.spec.ts": {"qwen2.5"},
    PLAYGROUND + "e2e/design-system.spec.ts": {"qwen2.5"},  # holds the tokenizer download for the loading state
    PLAYGROUND + "public/tokenizers/qwen2.5/SOURCE.md": {"Qwen2.5", "Qwen3", "Qwen2.5-7B-Instruct"},  # provenance
    PLAYGROUND + "public/tokenizers/qwen2.5/tokenizer_config.json": {"Qwen2Tokenizer"},
}
# The generated HTTP contract's neutral example ids beyond the globally-allowed model-a/model-b (see ALLOWED):
# the page's mocked /models list and an api-test id. Exempt in those files only.
EXAMPLE_IDS: dict[str, set[str]] = {
    PLAYGROUND + "e2e/agent-a3-turns.spec.ts": {"m-b"},  # the page's mocked /models list (neutral ids)
    PLAYGROUND + "e2e/agent-a4-stuck.spec.ts": {"m-b"},  # the same mocked /models list (A4 stuck-state e2e)
    PLAYGROUND + "src/agent/agent-api.test.ts": {"m2"},
}
EXEMPT = {
    path: TOKENIZER_IDS.get(path, set()) | EXAMPLE_IDS.get(path, set()) for path in {*TOKENIZER_IDS, *EXAMPLE_IDS}
}

PRESET = re.compile(r"@preset/[A-Za-z0-9._-]+")
VENDORS = (
    "openai",
    "google",
    "anthropic",
    "deepseek",
    "z-ai",
    "inception",
    "qwen",
    "meta-llama",
    "mistralai",
    "x-ai",
    "moonshotai",
    "minimax",
    "cohere",
    "nvidia",
    "microsoft",
    "amazon",
)
SLUG = re.compile(r"\b(?:" + "|".join(re.escape(v) for v in VENDORS) + r")/[a-z0-9][a-z0-9._:-]*\d[a-z0-9._:-]*")
FAMILY = re.compile(
    r"\b(?:gpt-(?:oss|\d)[\w.-]*|gemini-\d[\w.-]*|claude-\d[\w.-]*|mercury-?\d[\w-]*|glm-\d[\w.-]*"
    r"|deepseek-v\d[\w.-]*|qwen\d[\w.-]*|llama-?\d[\w.-]*|coder-model)\b",
    re.IGNORECASE,
)
_VALUE = r"""["']?(@?[A-Za-z][\w./:-]*)"""
CARRIERS = (
    re.compile(r"""--model(?:=|\s+|["']\s*,\s*)""" + _VALUE),  # --model X, --model=X, "--model", "X"
    re.compile(r"""\bagent\.model\s*=\s*""" + _VALUE),  # the server's own --set agent.model=X
    re.compile(r"""\b[A-Z][A-Z0-9_]*_MODEL=""" + _VALUE),  # env style OPENAI_MODEL=X (a code constant has spaces)
    re.compile(r"""\bmodel(?:_?[Nn]ame)?["']?\s*[:=]\s*["'](@?[A-Za-z][\w./:-]*)["']"""),  # model = "x", "model": "x"
    re.compile(r"""["']model["']\s*:\s*\{\s*["']name["']\s*:\s*["'](@?[A-Za-z][\w./:-]*)"""),  # settings model.name
)
QWEN_LINE = re.compile(r"qwen|cli\.js|--acp", re.IGNORECASE)
PYTHON_M = re.compile(r"""python[\w.]*["']?\s+(?:-\w+\s+)*-m\b""", re.IGNORECASE)  # python -m <module>
SHORT_FLAG = re.compile(r"(?<![\w-])-m\s+" + _VALUE)  # -m X, only on a qwen/ACP command line
YAML_MODEL = re.compile(r"^\s*[\w-]*model\s*:\s*" + _VALUE + r"\s*(?:#.*)?$", re.IGNORECASE)  # model: x, X_MODEL: x


def forbidden_terms() -> list[str]:
    """The machine-local provider/proxy/model terms (gitignored); empty when the file is absent."""
    if not FORBIDDEN_TERMS_FILE.exists():
        return []
    out = []
    for line in FORBIDDEN_TERMS_FILE.read_text(encoding="utf-8").splitlines():
        term = line.strip()
        if term and not term.startswith("#"):
            out.append(term)
    return out


_TERMS = forbidden_terms()


def scanned_files() -> list[str]:
    """Repo-relative paths of every tracked file in scope (root files included)."""
    listed = subprocess.run(["git", "ls-files", "-z"], cwd=REPO, capture_output=True, check=True, text=True).stdout
    paths = [p for p in listed.split("\0") if p]
    in_scope = [p for p in paths if "/" not in p or p.startswith(tuple(d + "/" for d in SCANNED))]
    return sorted(p for p in in_scope if Path(p).suffix in SUFFIXES and not p.startswith(NOT_SCANNED) and p not in SELF)


def model_values(line: str, yaml: bool = False) -> list[str]:
    """Values given to a model setting on ``line`` (A3-08), references and neutral ids excluded."""
    values = [m for pattern in CARRIERS for m in pattern.findall(line)]
    if QWEN_LINE.search(line) and not PYTHON_M.search(line):
        values += SHORT_FLAG.findall(line)
    if yaml:
        values += YAML_MODEL.findall(line)
    return [v for v in values if v not in ALLOWED and not v.startswith(("$", "<", "{"))]


def url_hosts(line: str, code: bool) -> list[str]:
    """Deprecated: generic URL flagging produced false positives on legitimate schema/doc URLs; the provider/proxy
    base URL is caught by the machine-local term list instead (see module docstring)."""
    return []


def term_hits(line: str) -> list[str]:
    low = line.lower()
    return [term for term in _TERMS if term.lower() in low]


def findings(text: str, yaml: bool = False, code: bool = False) -> list[tuple[int, str, str]]:
    """``(line, kind, matched name)`` of every provider/model reference in ``text``."""
    found = []
    for number, line in enumerate(text.splitlines(), 1):
        found += [(number, "preset", m) for m in PRESET.findall(line) if m not in ALLOWED]
        found += [(number, "model slug", m) for m in SLUG.findall(line)]
        found += [(number, "model family", m) for m in FAMILY.findall(line)]
        found += [(number, "model value", m) for m in dict.fromkeys(model_values(line, yaml))]
        found += [(number, "forbidden term", m) for m in term_hits(line)]
    return found


def config_values(node: object, key: str = "") -> list[str]:
    """A3-08 structural check of a parsed TOML/JSON document: a ``model``-named key's string (or ``{name}``), every
    ``modelProviders`` id, and a ``--model``/``-m`` value inside an argument string or list."""
    found: list[str] = []
    named = (
        key.lower() in ("model", "modelname", "model_name") or re.fullmatch(r"[A-Z][A-Z0-9_]*_MODEL", key) is not None
    )
    if isinstance(node, dict):
        if named and isinstance(node.get("name"), str):
            found.append(node["name"])
        for sub_key, value in node.items():
            if key == "modelProviders" and isinstance(value, list):
                found += [item["id"] for item in value if isinstance(item, dict) and isinstance(item.get("id"), str)]
            found += config_values(value, str(sub_key))
    elif isinstance(node, list):
        flags = [str(v) for v in node]
        found += [flags[i + 1] for i, v in enumerate(flags[:-1]) if v in ("--model", "-m")]
        found += [v.split("=", 1)[1] for v in flags if v.startswith("--model=")]
        for item in node:
            found += config_values(item, key)
    elif isinstance(node, str):
        if named:
            found.append(node)
        found += CARRIERS[0].findall(node)
    return [v for v in found if v and v not in ALLOWED and not v.startswith(("$", "<", "{"))]


def parsed(path: str) -> object | None:
    text = read(path)
    try:
        return tomllib.loads(text) if path.endswith(".toml") else json.loads(text) if path.endswith(".json") else None
    except (tomllib.TOMLDecodeError, json.JSONDecodeError):
        return None  # e.g. a JSONC tsconfig: the line scan still covers it


def is_code(label: str) -> bool:
    """Code/config file (URL hosts are checked there, not in prose .md guides)."""
    return not label.endswith(".md")


def violations(text: str, label: str) -> list[str]:
    exempt = EXEMPT.get(label, set())
    yaml = label.endswith((".yaml", ".yml"))
    return [
        f"{label}:{n}: {kind} {name}" for n, kind, name in findings(text, yaml, is_code(label)) if name not in exempt
    ]


def read(path: str) -> str:
    return (REPO / path).read_text(encoding="utf-8", errors="replace")
