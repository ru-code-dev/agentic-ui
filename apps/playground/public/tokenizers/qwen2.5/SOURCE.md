# Qwen2.5 tokenizer (vendored)

Used by the playground's LLM context page (PG-26) to count tokens exactly as Qwen2.5 / Qwen3 models do, offline.

| File | Source |
|---|---|
| tokenizer.json | https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/resolve/main/tokenizer.json |
| tokenizer_config.json | https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/resolve/main/tokenizer_config.json |
| LICENSE | https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/resolve/main/LICENSE |

- License: Apache License 2.0 (see LICENSE), © Alibaba Cloud / Qwen team.
- Retrieved: 2026-10-26. tokenizer.json sha256: `c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539`.
- Qwen3 models use the same byte-level BPE vocabulary and merges, so counts apply to both families.
- Verified against the Rust `tokenizers` library (npm `tokenizers` 0.23.2): see `src/llm/tokenizers.test.ts`.
