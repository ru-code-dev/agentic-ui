interface ImportMetaEnv {
  /** PG-28: id of this build (vite.config.ts `define`), stamped on every preview-channel message. */
  readonly BUILD_ID: string;
  /** DEC-056: `<catalogId> sha256:<12 hex>` of the contract's catalog.json (vite.config.ts `define`). */
  readonly CONTRACT_VERSION: string;
}
