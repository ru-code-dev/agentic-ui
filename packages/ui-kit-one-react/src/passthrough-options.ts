/**
 * Compile-time contract of `passthrough(...)` (DEC-005, DEC-046): which contract props pass to the
 * kit unchanged, which values are renamed on the way, and which hidden kit props are fixed.
 */
import type {
  ComponentApi,
  InferredComponentApiSchemaType,
  ResolveA2uiProps,
} from "@a2ui/web_core/v0_9";

/** Contract props the factory translates; every other prop passes to the kit unchanged. */
export type TranslatedKey = "text" | "label" | "children" | "child";
type Contract<Api extends ComponentApi> = InferredComponentApiSchemaType<Api>;
/** Identity props as the binder hands them over (dynamic values resolved). */
export type IdentityProps<Api extends ComponentApi> = Omit<
  Pick<
    ResolveA2uiProps<Contract<Api>>,
    keyof Contract<Api> & keyof ResolveA2uiProps<Contract<Api>>
  >,
  TranslatedKey
>;

type Defined<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };
type KitValue<KitProps, K> = K extends keyof KitProps ? Exclude<KitProps[K], undefined> : never;
type HiddenKey<Api extends ComponentApi, KitProps> = Exclude<
  keyof KitProps,
  keyof Contract<Api> | "children"
>;

/**
 * `values`: contract value → kit value per prop (renamed or merged values); unlisted values pass
 * through and must be kit values themselves. `fixed`: kit props the contract hides, always set.
 * Every target is checked against the kit facade's prop types.
 */
export interface PassthroughOptions<Api extends ComponentApi, KitProps> {
  readonly values?: {
    readonly [K in keyof IdentityProps<Api>]?: Partial<
      Record<Defined<IdentityProps<Api>>[K] & PropertyKey, KitValue<KitProps, K>>
    >;
  };
  readonly fixed?: { readonly [K in HiddenKey<Api, KitProps>]?: KitProps[K] } & {
    readonly [K in keyof Contract<Api>]?: never;
  };
}

/** An option of `O`, or an empty record when absent (never `never`: `keyof never` is every key). */
type Field<O, F extends string> = F extends keyof O ? NonNullable<O[F]> : Record<never, never>;
type Maps<O> = Field<O, "values">;
type Fixed<O> = Field<O, "fixed">;
/** Contract values of `K` that reach the kit unchanged (not renamed by `values`). */
type Unmapped<
  Api extends ComponentApi,
  O,
  K extends keyof IdentityProps<Api>,
> = K extends keyof Maps<O>
  ? Exclude<Defined<IdentityProps<Api>>[K], keyof NonNullable<Maps<O>[K]>>
  : Defined<IdentityProps<Api>>[K];

/** Keys of the contract whose (defined, unmapped) values are not valid values of the same kit prop. */
export type IdentityMismatch<Api extends ComponentApi, KitProps, O = object> = {
  [K in keyof IdentityProps<Api>]-?: K extends keyof KitProps
    ? [Unmapped<Api, O, K>] extends [Exclude<KitProps[K], undefined>]
      ? never
      : K
    : K;
}[keyof IdentityProps<Api>];

/** Value maps naming a prop or a source value the contract does not have. */
type UnknownMapped<Api extends ComponentApi, O> = {
  [K in keyof Maps<O>]-?: K extends keyof IdentityProps<Api>
    ? [Exclude<keyof NonNullable<Maps<O>[K]>, Defined<IdentityProps<Api>>[K]>] extends [never]
      ? never
      : K
    : K;
}[keyof Maps<O>];

/** Value maps with a target that is not a value of the kit prop. */
type BadTarget<KitProps, O> = {
  [K in keyof Maps<O>]-?: [NonNullable<Maps<O>[K]>[keyof NonNullable<Maps<O>[K]>]] extends [
    KitValue<KitProps, K>,
  ]
    ? never
    : K;
}[keyof Maps<O>];

/** Fixed props whose value the kit prop does not take (unknown or exposed keys: FixedKeyCheck). */
type BadFixed<Api extends ComponentApi, KitProps, O> = {
  [K in keyof Fixed<O>]-?: K extends HiddenKey<Api, KitProps>
    ? [Fixed<O>[K]] extends [KitProps[K]]
      ? never
      : K
    : never;
}[keyof Fixed<O>];

/** Every problem the compile-time proof reports (never = the passthrough is sound). */
export type PassthroughProblem<Api extends ComponentApi, KitProps, O> =
  | IdentityMismatch<Api, KitProps, O>
  | UnknownMapped<Api, O>
  | BadTarget<KitProps, O>
  | BadFixed<Api, KitProps, O>;

/**
 * A3-28: a `fixed` key that is not a hidden prop of the kit facade gets a message type, so the
 * compiler names the key and the fix instead of an anonymous arity error (the facade's `Pick<…>`
 * decides which kit props exist for `passthrough`).
 */
export type FixedKeyCheck<Api extends ComponentApi, KitProps, O> = O extends {
  readonly fixed: infer F;
}
  ? {
      readonly fixed?: {
        readonly [K in keyof F]?: K extends HiddenKey<Api, KitProps>
          ? unknown
          : K extends keyof Contract<Api>
            ? {
                readonly [M in `fixed key "${K & string}" is a contract prop: it cannot be fixed`]: true;
              }
            : {
                readonly [M in `fixed key "${K & string}" is not a prop of the kit facade: add it to the facade's Pick<...> list (src/kit/)`]: true;
              };
      };
    }
  : unknown;

/** Compile-time proof: `[]` when sound, otherwise a required `never` argument (a type error). */
export type PassthroughProof<Api extends ComponentApi, KitProps, O> = [
  PassthroughProblem<Api, KitProps, O>,
] extends [never]
  ? []
  : [never];
