import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

export { default as Alert } from "./Alert.vue";
export { default as AlertAction } from "./AlertAction.vue";
export { default as AlertDescription } from "./AlertDescription.vue";
export { default as AlertTitle } from "./AlertTitle.vue";

export const alertVariants = cva(
  "grid gap-0.5 rounded-lg border px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*=size-])]:size-4 group/alert relative w-full",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "border-destructive/20 bg-destructive/8 text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current",
        info: "border-info/20 bg-info/8 text-info *:data-[slot=alert-description]:text-info/90",
        success: "border-success/20 bg-success/8 text-success *:data-[slot=alert-description]:text-success/90",
        warning:
          "border-warning/30 bg-warning/10 text-warning-foreground *:data-[slot=alert-description]:text-warning-foreground/90",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type AlertVariants = VariantProps<typeof alertVariants>;
