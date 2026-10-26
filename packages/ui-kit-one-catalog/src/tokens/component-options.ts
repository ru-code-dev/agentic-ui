/**
 * Component options: the enum values of component props (variants, sizes, alignments). Values are
 * the kit's own prop values (DEC-005), so the renderer passes them through unchanged.
 */

/** Source: src/components/button.ts → sizes (also used by Tag and Table; xs is not exposed) */
export const controlSizes = ["sm", "md", "lg"] as const;
/** Source: src/components/modal.ts → sizes */
export const modalSizes = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "full",
] as const;
/** Source: src/components/heading.ts → sizes */
export const headingSizes = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] as const;
/** Elements a Heading renders as (`as`). */
export const headingElements = ["h1", "h2", "h3", "h4"] as const;
/** Source: src/components/button.ts → variants (unstyled is not exposed) */
export const buttonVariants = ["solid", "outline", "ghost", "link"] as const;
/** Source: src/components/tag.ts → variants */
export const tagVariants = ["solid", "subtle", "outline"] as const;
/** Source: src/components/table.ts → variants (unstyled is not exposed) */
export const tableVariants = ["simple", "striped"] as const;
/** Source: src/components/tabs.ts → variants (subset) */
export const tabsVariants = ["line", "enclosed", "soft-rounded"] as const;
/** List markers: bullets, numbers, or none. */
export const listVariants = ["unordered", "ordered", "plain"] as const;
/** Horizontal text alignment (Text, Heading, StyleProps, Table columns). */
export const textAligns = ["left", "center", "right"] as const;
/** Main axis of a Flex or RadioGroup. */
export const directions = ["row", "column"] as const;
/** Cross-axis alignment of Flex children (CSS align-items). */
export const flexAligns = ["flex-start", "center", "flex-end", "stretch", "baseline"] as const;
/** Main-axis distribution of Flex children (CSS justify-content). */
export const flexJustifies = [
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
] as const;
/** Whether Flex children wrap onto new lines (CSS flex-wrap). */
export const flexWraps = ["nowrap", "wrap"] as const;
/** HTML input types an Input may use. */
export const inputTypes = ["text", "email", "password", "number", "tel"] as const;
/** How a Table column formats its cell values. */
export const tableColumnFormats = ["text", "number", "currency", "date"] as const;
/** Largest number of Grid columns. */
export const maxGridColumns = 6;
