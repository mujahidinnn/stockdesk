import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayButton, DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  /** Override today's highlight (defaults to the neutral "bg-accent" look). */
  todayClassName?: string;
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  todayClassName,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        nav: "flex items-center justify-between absolute inset-x-1 top-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_caption: "flex justify-center items-center h-9",
        caption_label: "text-sm font-medium text-foreground",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        range_start: "rounded-l-md",
        range_end: "rounded-r-md",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" {...chevronProps} />
          ) : (
            <ChevronRight className="h-4 w-4" {...chevronProps} />
          ),
        DayButton: (buttonProps) => (
          <CalendarDayButton {...buttonProps} todayClassName={todayClassName} />
        ),
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  todayClassName,
  ...props
}: React.ComponentProps<typeof DayButton> & { todayClassName?: string }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-9 w-9 p-0 font-normal",
        modifiers.range_middle &&
          "rounded-none bg-accent text-accent-foreground",
        modifiers.today &&
          !modifiers.selected &&
          (todayClassName ?? "bg-accent text-accent-foreground"),
        modifiers.selected &&
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
