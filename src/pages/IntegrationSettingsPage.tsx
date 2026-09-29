import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiKeysPanel } from "@/components/integration/ApiKeysPanel";
import { WebhooksPanel } from "@/components/integration/WebhooksPanel";
import { UsersPanel } from "@/components/integration/UsersPanel";
import { useAuth } from "@/context/auth";
import { useTabParam } from "@/hooks/useTabParam";

const TABS = ["keys", "webhooks", "users"] as const;

export default function IntegrationSettingsPage() {
  const { t } = useTranslation();
  const { canRead } = useAuth();
  const integration = canRead("integration");
  const users = canRead("users");
  const tabs = TABS.filter((k) => (k === "users" ? users : integration));
  const [tab, setTab] = useTabParam(tabs, tabs[0] ?? "keys");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex w-full flex-col gap-4">
      <TabsList data-tour="integration-tabs" className="w-full justify-start">
        {integration && <TabsTrigger value="keys" className="text-xs">{t("integration.tabs.keys")}</TabsTrigger>}
        {integration && <TabsTrigger value="webhooks" className="text-xs">{t("integration.tabs.webhooks")}</TabsTrigger>}
        {users && <TabsTrigger value="users" className="text-xs">{t("integration.tabs.users")}</TabsTrigger>}
      </TabsList>
      {integration && <TabsContent value="keys"><ApiKeysPanel /></TabsContent>}
      {integration && <TabsContent value="webhooks"><WebhooksPanel /></TabsContent>}
      {users && <TabsContent value="users"><UsersPanel /></TabsContent>}
    </Tabs>
  );
}
