import { useState } from "react";

interface Validated {
  readonly isValid?: boolean;
  readonly validationErrors?: readonly string[];
}

/**
 * Validation display for an input: errors appear once the user has changed the field, so a fresh
 * form is not red. Returns the first failing check message to show, or undefined.
 */
export function useFieldError(props: Validated): {
  error: string | undefined;
  markTouched: () => void;
} {
  const [touched, setTouched] = useState(false);
  const error = touched && props.isValid === false ? props.validationErrors?.[0] : undefined;
  return { error, markTouched: () => setTouched(true) };
}
