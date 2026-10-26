"use client";

import * as React from "react";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "~/lib/utils";

export const Label = React.forwardRef<HTMLElement, useRender.ComponentProps<"label">>(
  function Label({ className, render, ...props }, ref): React.ReactElement {
    const defaultProps = {
      className: cn(
        "inline-flex items-center gap-2 font-medium text-base/4.5 text-foreground sm:text-sm/4",
        className,
      ),
      "data-slot": "label",
    };

    return useRender({
      ref,
      defaultTagName: "label",
      props: mergeProps<"label">(defaultProps, props),
      render,
    });
  },
);
