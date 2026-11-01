import { useState } from "react";
import { a, type B } from "./values.ts";

export { b, type B as Bee } from "./values.ts";
export const state = useState;
export const value: B = a;
export const lazy = () => import("./values.ts");
