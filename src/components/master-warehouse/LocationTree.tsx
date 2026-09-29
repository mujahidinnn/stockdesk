import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { AccessControl } from "@/components/auth/AccessControl";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { Location } from "@/hooks/useLocations";
import type { LocationLevel } from "./BinFormDialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const CHILD: Record<LocationLevel, LocationLevel | null> = { zone: "aisle", aisle: "rack", rack: "bin", bin: null };
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground";

export function LocationTree({
  locations,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: {
  locations: Location[];
  selectedId: number | null;
  onSelect: (l: Location) => void;
  onAdd: (parent: Location, level: LocationLevel) => void;
  onEdit: (l: Location) => void;
  onDelete: (l: Location) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const children = new Map<number | null, Location[]>();
  for (const l of locations) children.set(l.parent_id, [...(children.get(l.parent_id) ?? []), l]);
  const sorted = (list: Location[] = []) =>
    [...list].sort((a, b) => (a.level === b.level ? a.code.localeCompare(b.code, undefined, { numeric: true }) : a.level === "zone" ? -1 : 1));

  function Node({ l, depth }: { l: Location; depth: number }) {
    const kids = children.get(l.id);
    const expanded = open.has(l.id);
    const child = CHILD[l.level as LocationLevel];
    return (
      <li>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 hover:bg-secondary/60",
            selectedId === l.id && "bg-primary/10",
          )}
          style={{ paddingLeft: depth * 14 }}
        >
          <button
            onClick={() => setOpen((s) => (s.has(l.id) ? new Set([...s].filter((x) => x !== l.id)) : new Set(s).add(l.id)))}
            aria-label={t("warehouses.toggle")}
            aria-expanded={expanded}
            className={cn(iconBtn, !kids?.length && "invisible")}
          >
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-90")} />
          </button>
          <button onClick={() => onSelect(l)} className="flex flex-1 min-w-0 items-center gap-2 py-1.5 text-left">
            <span className={cn("font-mono text-xs", !l.is_active && "line-through text-muted-foreground")}>{l.code}</span>
            <span className="text-[10px] text-muted-foreground">{t(`warehouses.levels.${l.level}`)}</span>
            {l.bin_type && l.bin_type !== "storage" && (
              <StatusBadge tone="info" className="px-1.5 py-0 text-[10px]">
                {t(`warehouses.binTypes.${l.bin_type}`)}
              </StatusBadge>
            )}
            {kids?.length ? <span className="ml-auto text-[10px] text-muted-foreground">{kids.length}</span> : null}
          </button>
          <div className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
            {child && (
              <AccessControl feature="master-warehouse" action="create">
                <Button variant="ghost" size="icon" className={iconBtn} onClick={() => onAdd(l, child)} aria-label={t("warehouses.addNode", { level: t(`warehouses.levels.${child}`) })}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </AccessControl>
            )}
            <AccessControl feature="master-warehouse" action="update">
              <Button variant="ghost" size="icon" className={iconBtn} onClick={() => onEdit(l)} aria-label={t("common.edit")}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </AccessControl>
            <AccessControl feature="master-warehouse" action="delete">
              <Button variant="ghost" size="icon" className={iconBtn} onClick={() => onDelete(l)} aria-label={t("common.delete")}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AccessControl>
          </div>
        </div>
        {expanded && kids?.length ? (
          <ul>
            {sorted(kids).map((k) => (
              <Node key={k.id} l={k} depth={depth + 1} />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <ul className="text-sm">
      {sorted(children.get(null)).map((l) => (
        <Node key={l.id} l={l} depth={0} />
      ))}
    </ul>
  );
}
