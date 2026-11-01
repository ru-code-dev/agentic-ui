/**
 * DEC-056: `<catalogId> sha256:<12 hex>` of the contract the package renders. Embedded at build time from the
 * catalog source (`define` in tsdown.config.ts, vite.config.ts and the playground's vite.config.ts); every server
 * answer must name the same version, else the client shows a mismatch instead of rendering.
 */
export const CONTRACT_VERSION: string = import.meta.env.CONTRACT_VERSION;
