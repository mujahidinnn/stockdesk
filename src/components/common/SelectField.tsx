import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix Select cannot hold an empty-string value; "" (the "none" choice) maps to this.
const NONE = "__none__";

type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };

/** shadcn Select with the native <select> contract (<option> children, onChange({ target: { value } })). */
export function SelectField({
  value,
  onChange,
  children,
  disabled,
  className,
  placeholder,
  id,
  "aria-label": ariaLabel,
}: {
  /** Anything stringifiable; react-hook-form watch() values are loosely typed. */
  value: unknown;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const options = Children.toArray(children)
    .filter((c): c is ReactElement<OptionProps> => isValidElement(c) && c.type === "option")
    .map((o) => ({ value: String(o.props.value ?? ""), label: o.props.children, disabled: o.props.disabled }));
  const current = value == null ? "" : String(value);

  return (
    <Select
      value={current === "" ? (options.some((o) => o.value === "") ? NONE : undefined) : current}
      onValueChange={(v) => onChange({ target: { value: v === NONE ? "" : v } })}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("h-9 text-sm", className)}>
        <SelectValue placeholder={placeholder ?? "-"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || NONE} value={o.value || NONE} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
