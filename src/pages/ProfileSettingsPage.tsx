import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Shield,
  Camera,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  Globe,
  Clock,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import i18n, { SUPPORTED_LANGUAGES, type LangCode } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const roleBadge: Record<string, string> = {
  Admin:
    "bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-900/40",
  "Warehouse Manager":
    "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900/40",
  "Warehouse Worker":
    "bg-sky-100 text-sky-700 border border-sky-300 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-900/40",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SettingsCard({
  title,
  description,
  dataTour,
  children,
}: {
  title: string;
  description: string;
  dataTour?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-tour={dataTour}
      className="glass-card rounded-2xl border border-border p-4 sm:p-6 flex flex-col gap-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Separator className="bg-border/60" />
      {children}
    </div>
  );
}

function ReadField({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/60 border border-border/60">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm text-foreground flex-1 truncate">{value}</span>
        {badge && (
          <span
            className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full",
              roleBadge[badge] ??
                "bg-secondary text-muted-foreground border border-border",
            )}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ProfileSettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number ?? "");
  const [profileSaving, setProfileSaving] = useState(false);

  const [newEmail, setNewEmail] = useState(user?.email ?? "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [langSaving, setLangSaving] = useState(false);
  const currentLang = (profile?.language_preference ??
    i18n.language) as LangCode;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const roleName = profile?.role?.role_name ?? "-";
  const email = user?.email ?? "-";
  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const avatarUrl = profile?.avatar_url ?? null;

  useEffect(() => {
    if (!user?.id) return;
    const key = `email_pending_${user.id}`;
    const stored = localStorage.getItem(key);
    if (stored && stored !== user.email) {
      setPendingEmail(stored);
    } else if (stored && stored === user.email) {
      setPendingEmail(null);
      localStorage.removeItem(key);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!pendingEmail || !user?.id) return;
    if (user.email === pendingEmail) {
      setPendingEmail(null);
      localStorage.removeItem(`email_pending_${user.id}`);
    }
  }, [user?.email, user?.id, pendingEmail]);

  const handleProfileSave = useCallback(async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone_number: phoneNumber.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t("profile.actions.updated"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update profile",
      );
    } finally {
      setProfileSaving(false);
    }
  }, [user, fullName, phoneNumber, refreshProfile, t]);

  const handleEmailUpdate = useCallback(async () => {
    if (!user) return;
    if (!EMAIL_RE.test(newEmail)) {
      toast.error(t("profile.email.invalidFormat"));
      return;
    }
    if (newEmail === user.email) return;
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: `${window.location.origin}/` },
      );
      if (error) throw error;
      setPendingEmail(newEmail);
      localStorage.setItem(`email_pending_${user.id}`, newEmail);
      toast.success(t("profile.email.confirmationSent"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("already registered")) {
        toast.error(t("profile.email.alreadyInUse"));
      } else if (
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("for security")
      ) {
        toast.error(t("profile.email.rateLimited"));
      } else {
        toast.error(msg || "Failed to update email");
      }
    } finally {
      setEmailSaving(false);
    }
  }, [user, newEmail, t]);

  const handleCancelEmailChange = useCallback(async () => {
    if (!user?.email || !user?.id) return;
    try {
      await supabase.auth.updateUser({ email: user.email });
    } catch {
      // Best-effort: always clear local state
    } finally {
      setPendingEmail(null);
      setNewEmail(user.email);
      localStorage.removeItem(`email_pending_${user.id}`);
      toast.success(t("profile.email.cancelSuccess"));
    }
  }, [user, t]);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !user) return;

      const MAX_MB = 1; // avatars bucket limit
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`Image must be under ${MAX_MB} MB`);
        return;
      }

      setAvatarUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/avatar.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, file, { upsert: true, contentType: file.type });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(path);

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: `${publicUrl}?t=${Date.now()}` })
          .eq("id", user.id);

        if (updateError) throw updateError;
        await refreshProfile();
          toast.success(t("profile.actions.avatarUpdated"));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to upload avatar",
        );
      } finally {
        setAvatarUploading(false);
        e.target.value = "";
      }
    },
    [user, refreshProfile, t],
  );

  const handleLanguageChange = useCallback(
    async (lang: LangCode) => {
      if (!user || lang === currentLang) return;
      setLangSaving(true);
      try {
        const { error } = await supabase
          .from("profiles")
          .update({ language_preference: lang })
          .eq("id", user.id);
        if (error) throw error;
        await i18n.changeLanguage(lang);
        await refreshProfile();
        toast.success(t("profile.actions.languageUpdated"));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update language",
        );
      } finally {
        setLangSaving(false);
      }
    },
    [user, currentLang, refreshProfile, t],
  );

  const handlePasswordChange = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (newPassword !== confirmPassword) {
        toast.error(t("profile.security.passwordMismatch"));
        return;
      }
      if (newPassword.length < 8) {
        toast.error("Password must be at least 8 characters");
        return;
      }
      setPasswordSaving(true);
      try {
        // Supabase allows password change without the old one; re-auth so a
        // stolen session can't take over the account.
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user?.email ?? "",
          password: currentPassword,
        });
        if (reauthError) {
          toast.error(t("profile.security.currentPasswordWrong"));
          return;
        }

        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) throw error;
        toast.success(t("profile.actions.passwordUpdated"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to change password",
        );
      } finally {
        setPasswordSaving(false);
      }
    },
    [user, currentPassword, newPassword, confirmPassword, t],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex w-full flex-col gap-6 pb-12"
    >
      <div
        data-tour="profile-avatar"
        className="glass-card rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-border cursor-pointer group"
              onClick={handleAvatarClick}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-brand flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {initials}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                {avatarUploading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">
              {profile?.full_name ?? "-"}
            </h1>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {email}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className={cn(
                  "text-[10px] font-semibold px-2.5 py-1 rounded-full",
                  roleBadge[roleName] ??
                    "bg-secondary text-muted-foreground border border-border",
                )}
              >
                <Shield className="w-2.5 h-2.5 inline mr-1" />
                {roleName}
              </span>
            </div>
          </div>

          <button
            onClick={handleAvatarClick}
            disabled={avatarUploading}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary border border-border transition-colors"
          >
            {avatarUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("profile.uploading")}
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                {t("profile.changePhoto")}
              </>
            )}
          </button>
        </div>
      </div>

      <SettingsCard
        dataTour="profile-account"
        title={t("profile.accountInfo.title")}
        description={t("profile.accountInfo.description")}
      >
        <ReadField
          icon={Shield}
          label={t("profile.fields.role")}
          value={roleName}
          badge={roleName}
        />
      </SettingsCard>

      <SettingsCard
        dataTour="profile-email"
        title={t("profile.email.title")}
        description={t("profile.email.description")}
      >
        {pendingEmail && (
          <div className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/30">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                {t("profile.email.pendingTitle")}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {t("profile.email.pendingDesc", { email: pendingEmail })}
              </p>
            </div>
            <button
              onClick={handleCancelEmailChange}
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap mt-0.5 flex-shrink-0"
            >
              {t("profile.email.cancelChange")}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="new-email"
            className="text-xs font-medium text-foreground"
          >
            {t("profile.email.newEmail")}
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t("profile.email.newEmailPlaceholder")}
              className="pl-9 bg-secondary border-border text-sm"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("profile.email.currentEmail")}:{" "}
            <span className="text-foreground font-medium">{user?.email}</span>
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleEmailUpdate}
            loading={emailSaving}
            disabled={
              !newEmail.trim() ||
              newEmail === user?.email ||
              !EMAIL_RE.test(newEmail)
            }
          >
            <Mail className="w-3.5 h-3.5 mr-1.5" />
            {emailSaving ? t("profile.email.updating") : t("profile.email.updateEmail")}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        dataTour="profile-personal"
        title={t("profile.personalInfo.title")}
        description={t("profile.personalInfo.description")}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="full-name"
              className="text-xs font-medium text-foreground"
            >
              {t("profile.fields.fullName")}
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("profile.fields.fullNamePlaceholder")}
                className="pl-9 bg-secondary border-border text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="phone-number"
              className="text-xs font-medium text-foreground"
            >
              {t("profile.fields.phoneNumber")}
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="phone-number"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t("profile.fields.phoneNumberPlaceholder")}
                className="pl-9 bg-secondary border-border text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleProfileSave}
              loading={profileSaving}
              disabled={
                (fullName.trim() === (profile?.full_name ?? "") &&
                  phoneNumber.trim() === (profile?.phone_number ?? "")) ||
                !fullName.trim()
              }
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {profileSaving ? t("profile.actions.saving") : t("profile.actions.saveChanges")}
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        dataTour="profile-language"
        title={t("profile.language.title")}
        description={t("profile.language.description")}
      >
        <div className="flex items-center gap-4">
          <div className="flex-1 flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              {t("profile.language.label")}
            </Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
              <Select
                value={currentLang}
                onValueChange={(v) => handleLanguageChange(v as LangCode)}
                disabled={langSaving}
              >
                <SelectTrigger className="pl-9 bg-secondary border-border text-sm text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem
                      key={lang.code}
                      value={lang.code}
                      className="text-sm"
                    >
                      {lang.code === "en"
                        ? t("profile.language.english")
                        : t("profile.language.indonesian")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {langSaving && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mt-5" />
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        dataTour="profile-security"
        title={t("profile.security.title")}
        description={t("profile.security.description")}
      >
        <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="current-pwd"
              className="text-xs font-medium text-foreground"
            >
              {t("profile.security.currentPassword")}{" "}
              <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="current-pwd"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("profile.security.currentPassword")}
                required
                className="pl-9 bg-secondary border-border text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="new-pwd"
              className="text-xs font-medium text-foreground"
            >
              {t("profile.security.newPassword")}{" "}
              <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="new-pwd"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("profile.security.newPassword")}
                minLength={8}
                required
                className="pl-9 pr-9 bg-secondary border-border text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNew ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="confirm-pwd"
              className="text-xs font-medium text-foreground"
            >
              {t("profile.security.confirmPassword")}{" "}
              <span className="text-rose-600 dark:text-rose-400">*</span>
            </Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="confirm-pwd"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("profile.security.repeatPassword")}
                minLength={8}
                required
                className={cn(
                  "pl-9 pr-9 bg-secondary border-border text-sm",
                  confirmPassword && newPassword !== confirmPassword
                    ? "border-rose-500/60 focus-visible:ring-rose-500/30"
                    : "",
                )}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirm ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                {t("profile.security.passwordMismatch")}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={passwordSaving}
              disabled={
                !newPassword ||
                !confirmPassword ||
                newPassword !== confirmPassword
              }
            >
              <KeyRound className="w-3.5 h-3.5 mr-1.5" />
              {passwordSaving ? t("profile.security.updating") : t("profile.security.updatePassword")}
            </Button>
          </div>
        </form>
      </SettingsCard>

    </motion.div>
  );
}
