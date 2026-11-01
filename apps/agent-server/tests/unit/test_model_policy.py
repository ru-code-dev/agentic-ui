"""Amendment A1 §3 (SV-C15/SV-C17): no committed file reveals an LLM provider, proxy or model — a model id, a
provider/vendor name, a provider URL or an API key. Everything machine-specific lives in the gitignored WORKFLOW/.

Scans every tracked code/config/doc file of apps/*, packages/*, scripts, experiments, handover and the root (the
detector in ``tests/support/model_policy.py``). Generic heuristics plus the optional machine-local term list
``WORKFLOW/llm-forbidden.txt``. Neutral placeholder ids (``model-a``/``model-b``) and tokenizer/contract example ids
are exempt.
"""

import re
import unittest

from ..support.model_policy import (
    EXEMPT,
    REPO,
    SUFFIXES,
    config_values,
    findings,
    forbidden_terms,
    parsed,
    read,
    scanned_files,
    violations,
)


class ModelPolicyTest(unittest.TestCase):
    def test_no_committed_file_names_a_provider_or_model(self) -> None:
        """[SV-C17] every tracked code/config/doc file of apps/*, packages/*, scripts, experiments, handover and the
        root names no model id, provider, provider URL or key (neutral/tokenizer/example ids exempt)."""
        files = scanned_files()
        tops = {p.split("/")[1] for p in files if p.startswith(("apps/", "packages/"))}
        self.assertTrue(
            {"agent-server", "playground", "ui-kit-one-catalog", "ui-kit-one-react", "ui-kit-conformance"} <= tops,
            f"every app and package is scanned: {sorted(tops)}",
        )
        self.assertTrue(any("/" not in p for p in files), "root files are scanned")
        problems = [v for path in files for v in violations(read(path), path)]
        self.assertEqual(problems, [], "A1 §3: a committed file names a provider, proxy, model id, URL or key")

    def test_config_files_name_only_neutral_ids(self) -> None:
        """[SV-C17, SV-C15] A3-08: every tracked TOML/JSON file, parsed: model keys, modelProviders ids and
        --model/-m values name nothing but the neutral placeholder ids."""
        files = [p for p in scanned_files() if p.endswith((".toml", ".json"))]
        self.assertIn("apps/agent-server/config.dev.toml", files)
        problems = [
            f"{path}: {value}"
            for path in files
            for value in config_values(parsed(path))
            if value not in EXEMPT.get(path, set())
        ]
        self.assertEqual(problems, [], "SV-C15: a committed config names a real model")
        probes = [
            {"agent": {"model": "qwen-plus"}},
            {"agent": {"extra_args": "--model=qwen-max"}},
            {"agent": {"base_args": ["--acp", "-m", "o4-mini"]}},
            {"agent": {"env": {"OPENAI_MODEL": "kimi"}}},
            {"model": {"name": "deepseek/deepseek-chat"}},
            {"modelProviders": {"openai": [{"id": "glm-4.6"}]}},
        ]
        for probe in probes:
            with self.subTest(probe=probe):
                self.assertTrue(config_values(probe), probe)
        self.assertEqual(config_values({"agent": {"model": "", "base_args": ["--model", "model-a"]}}), [])

    def test_every_exemption_is_used(self) -> None:
        """[SV-C17] each exempt tokenizer/example id still occurs in its file (a stale or widened exemption fails)."""
        for path, names in EXEMPT.items():
            with self.subTest(path):
                self.assertIn(path, scanned_files())
                self.assertEqual({name for _, _, name in findings(read(path), code=not path.endswith(".md"))}, names)

    def test_the_shipped_package_names_no_model_or_provider(self) -> None:
        """[SV-C15] the pyz (src/agentic_ui_server, its doc examples included) names no model and no provider: the
        production fork brings its own."""
        package = REPO / "apps/agent-server/src/agentic_ui_server"
        named = [
            f"{path.relative_to(package)}: {match.group(0)}"
            for path in sorted(package.rglob("*"))
            if path.is_file() and path.suffix in SUFFIXES and "__pycache__" not in path.parts
            for match in re.finditer(r"@preset/[\w.-]+|openrouter|litellm", path.read_text(encoding="utf-8"), re.I)
        ]
        self.assertEqual(named, [])

    def test_detector_catches_providers_models_urls_and_keys(self) -> None:
        bad = [
            'extra_args = "--model=qwen-max"',
            "--set agent.model=deepseek-chat",
            "export AGENTIC_UI_AGENT_MODEL=qwen-plus",
            '{"model": {"name": "deepseek/deepseek-chat"}}',
            '  "model": "kimi-k2",',
            "node cli.js --acp -m o4-mini",
            "--model x-ai/grok-4",
            '"@preset/fast"',
            "OPENAI_MODEL=coder-model",
            "gpt-oss-120b",
            'model = "kimi"',
        ]
        for line in bad:
            with self.subTest(line=line):
                self.assertTrue(violations(line, "probe"), line)
        self.assertTrue(violations("OPENAI_MODEL: mistral-large-latest", "x.yaml"), "YAML")
        ok = '--model model-a OPENAI_MODEL=model-b model = "model-a" "--model", "$MODEL"'
        self.assertEqual(violations(ok, "probe"), [], ok)
        # Legitimate non-provider URLs and ids are NOT flagged (A2UI spec namespace, schema refs, redaction fixtures).
        self.assertEqual(violations("$ref: https://a2ui.org/specification/v0_9/common_types.json", "x.json"), [])
        self.assertEqual(violations('key = "sk-cfg-secret-redaction-fixture"', "x.py"), [], "a redaction test fixture")
        code = [
            '"$WORKFLOW_PYTHON" -m unittest tests.integration.test_real_qwen_llm',  # python -m <module>
            'SESSION_SET_MODEL = "session/set_model"  # qwen',  # a code constant
            "model: str | None = None",
            'self.model = model or ""',
            'call(url, "/model", {"chatId": "m", "model": "<not-offered>"})',  # a reference, not a name
        ]
        for line in code:
            with self.subTest(line=line):
                self.assertEqual(violations(line, "probe.py"), [], line)

    def test_optional_term_list_is_scanned_when_present(self) -> None:
        """[SV-C17] a machine-local WORKFLOW/llm-forbidden.txt term is flagged wherever it appears (no term leaks
        into a committed file). When the file is absent the list is empty and this adds nothing."""
        terms = forbidden_terms()
        if not terms:
            self.skipTest("WORKFLOW/llm-forbidden.txt absent (fresh clone)")
        sample = terms[0]
        self.assertTrue(violations(f"endpoint = {sample}", "probe.toml"), sample)
        # Every term is genuinely absent from every scanned committed file.
        low = sample.lower()
        problems = [f"{path}: {sample}" for path in scanned_files() if low in read(path).lower()]
        self.assertEqual(problems, [], "a machine-local forbidden term leaked into a committed file")


if __name__ == "__main__":
    unittest.main()
