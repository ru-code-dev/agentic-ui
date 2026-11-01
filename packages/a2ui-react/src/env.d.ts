interface ImportMetaEnv {
  /** DEC-056: the contract version, embedded at build time (tsdown.config.ts / vite.config.ts `define`). */
  readonly CONTRACT_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
