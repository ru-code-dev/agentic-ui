/**
 * Repo oxlint JS plugin (`jsPlugins` in .oxlintrc.json). DEC-050: every public name is listed
 * explicitly, so `export * from` and `export * as` are errors everywhere, index.ts barrels included.
 * (`import * as` is the built-in `import/no-namespace`.) OWN-01: an effect callback must have a block body,
 * so it can only return a cleanup on purpose. A4-13: no direct `randomUUID` (non-secure contexts lack it).
 * Proof: scripts/lint-rules.test.mjs.
 */
const noExportStar = {
  meta: {
    type: "problem",
    docs: { description: "Disallow `export * from` and `export * as` (DEC-050)." },
    schema: [],
  },
  create(context) {
    return {
      ExportAllDeclaration(node) {
        const source = node.source.value;
        context.report({
          node,
          message:
            node.exported === null
              ? `\`export * from "${source}"\` hides the public API; re-export names explicitly: \`export { A, type B } from "${source}"\` (DEC-050).`
              : `\`export * as ${node.exported.name ?? node.exported.value}\` re-exports a namespace; export the names explicitly (DEC-050).`,
        });
      },
    };
  },
};

const EFFECTS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);
const calleeName = (callee) =>
  callee.type === "Identifier"
    ? callee.name
    : callee.type === "MemberExpression" && !callee.computed
      ? callee.property.name
      : undefined;

/**
 * OWN-01: `useEffect(() => end.current?.scrollIntoView())` returns what the expression returns; React
 * calls a returned value as the cleanup, and browsers whose scroll methods return a Promise crash the
 * app ("destroy is not a function"). Only a block body (which returns a cleanup explicitly) is allowed.
 */
const effectBlockBody = {
  meta: {
    type: "problem",
    docs: { description: "Effect callbacks need a block body (OWN-01)." },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        const [effect] = node.arguments;
        if (!EFFECTS.has(name) || effect?.type !== "ArrowFunctionExpression") return;
        if (effect.body.type === "BlockStatement") return;
        context.report({
          node: effect,
          message: `\`${name}(() => expression)\` returns the expression's value, and React calls it as the cleanup (a Promise crashes the app); use a block body: \`${name}(() => { ... })\` (OWN-01).`,
        });
      },
    };
  },
};

/**
 * A4-13: `crypto.randomUUID` is undefined outside a secure context (plain http from a LAN host), so a
 * direct call blanks the page there; ids come from `newId()` (apps/playground/src/lib/new-id.ts).
 */
const noRandomUuid = {
  meta: {
    type: "problem",
    docs: { description: "Use newId(): crypto.randomUUID is missing on plain http (A4-13)." },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        const name = node.computed ? node.property.value : node.property.name;
        if (name !== "randomUUID") return;
        context.report({
          node,
          message:
            "`crypto.randomUUID` is undefined outside a secure context (plain http from a LAN host); use `newId()` from apps/playground/src/lib/new-id.ts (A4-13).",
        });
      },
    };
  },
};

/**
 * A4b-R1: the kit boundary as an allowlist. Outside `src/kit/` the renderer may import only its own
 * files and the packages named in the rule's `allow` option (`react`, `@a2ui`, …: the name or its
 * subpaths / scope); any kit, also a fork under any package name (REMAP recipe 1), fails with no
 * lint edit.
 */
const kitBoundary = {
  meta: {
    type: "problem",
    docs: { description: "Outside src/kit/ the renderer imports only allowed packages (A4b-R1)." },
    schema: [{ type: "object", properties: { allow: { type: "array" } } }],
  },
  create(context) {
    const allow = context.options?.[0]?.allow ?? [];
    const check = (source) => {
      const spec = source?.value;
      if (typeof spec !== "string" || spec.startsWith("./") || spec.startsWith("../")) return;
      if (allow.some((name) => spec === name || spec.startsWith(`${name}/`))) return;
      context.report({
        node: source,
        message: `\`${spec}\`: only src/kit/ may import the UI kit (kit boundary); the renderer imports its own files and ${allow.join(", ")} (A4b-R1).`,
      });
    };
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};

export default {
  meta: { name: "agentic-ui" },
  rules: {
    "no-export-star": noExportStar,
    "effect-block-body": effectBlockBody,
    "no-random-uuid": noRandomUuid,
    "kit-boundary": kitBoundary,
  },
};
