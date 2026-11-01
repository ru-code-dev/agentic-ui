import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

// Testing Library registers its automatic cleanup only with test globals, which this suite does not use.
afterEach(cleanup);
