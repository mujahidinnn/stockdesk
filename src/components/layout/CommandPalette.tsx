import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Sun,
  Moon,
  UserCog,
  LogOut,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useAuth } from "@/context/auth";
import { useTheme } from "@/context/theme";
import { useNavGroups } from "@/lib/navigation";

interface CommandPaletteProps {
  /** Opens the sign-out confirmation; signOut() itself isn't called here. */
  onRequestSignOut: () => void;
}

export function CommandPalette({ onRequestSignOut }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canRead } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navGroups = useNavGroups();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  const navItems = navGroups
    .flatMap((g) => g.items)
    .filter((item) => !item.featureKey || canRead(item.featureKey) || !!item.alsoFeatureKeys?.some(canRead));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("commandPalette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("commandPalette.empty")}</CommandEmpty>

        <CommandGroup heading={t("commandPalette.navigateGroup")}>
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              value={`${item.label} ${item.description}`}
              onSelect={() => go(item.href)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading={t("commandPalette.actionsGroup")}>
          <CommandItem
            value={t("commandPalette.toggleTheme")}
            onSelect={() => {
              toggleTheme();
              setOpen(false);
            }}
          >
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            {t("commandPalette.toggleTheme")}
          </CommandItem>
          <CommandItem
            value={t("commandPalette.profileSettings")}
            onSelect={() => go("/settings/profile")}
          >
            <UserCog className="mr-2 h-4 w-4" />
            {t("commandPalette.profileSettings")}
          </CommandItem>
          <CommandItem
            value={t("commandPalette.signOut")}
            onSelect={() => {
              setOpen(false);
              onRequestSignOut();
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("commandPalette.signOut")}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
