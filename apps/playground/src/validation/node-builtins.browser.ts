/**
 * Browser stand-in for `fs` and `path`. `@a2ui/agent` imports them at module level for its
 * file-system catalog provider and skill writer, which the playground never calls (validation and
 * prompt generation do not touch them). Every member the SDK references fails loudly if reached.
 */
function unavailable(name: string): never {
  throw new Error(`${name} is not available in the browser`);
}

export const existsSync = (): never => unavailable("fs.existsSync");
export const mkdirSync = (): never => unavailable("fs.mkdirSync");
export const readFileSync = (): never => unavailable("fs.readFileSync");
export const realpathSync = (): never => unavailable("fs.realpathSync");
export const rmSync = (): never => unavailable("fs.rmSync");
export const writeFileSync = (): never => unavailable("fs.writeFileSync");
export const dirname = (): never => unavailable("path.dirname");
export const join = (): never => unavailable("path.join");
export const sep = "/";
export const posix = { sep: "/" };
export const win32 = { sep: "\\" };
