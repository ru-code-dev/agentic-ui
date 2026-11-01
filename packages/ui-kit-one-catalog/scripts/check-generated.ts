import { fileURLToPath } from "node:url";
import { compareGenerated, report } from "../../../scripts/generated/compare.ts";
import { catalogArtifacts } from "./artifacts.ts";

const artifacts = catalogArtifacts();
const pkgDir = fileURLToPath(new URL("..", import.meta.url));
report("ui-kit-one-catalog", compareGenerated(pkgDir, artifacts), Object.keys(artifacts).length);
