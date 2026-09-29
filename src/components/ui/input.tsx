import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "number" &&
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0",
          className,
        )}
        onWheel={(e) => {
          // Chrome/Firefox: wheel over a focused number input changes its value; blur first.
          if (type === "number") e.currentTarget.blur();
          onWheel?.(e);
        }}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
