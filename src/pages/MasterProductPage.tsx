import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Download, Plus, Printer, Ruler, Tags, Truck, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessControl } from "@/components/auth/AccessControl";
import { SearchInput, SectionHeader, Toolbar } from "@/components/common/MasterSection";
import { FilterSelect } from "@/components/common/FilterSelect";
import { MasterListPanel } from "@/components/master-product/MasterListPanel";
import { ProductsTable } from "@/components/master-product/ProductsTable";
import { ProductFormDialog } from "@/components/master-product/ProductFormDialog";
import { SkuFormDialog } from "@/components/master-product/SkuFormDialog";
import { LabelPrintDialog } from "@/components/common/LabelPrintDialog";
import { ProductImportDialog } from "@/components/master-product/ProductImportDialog";
import { useTabParam } from "@/hooks/useTabParam";
import { useProducts, type Product, type Sku } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useOwners } from "@/hooks/useOwners";
import { useUoms } from "@/hooks/useUoms";
import { attributeValues } from "@/lib/variants";
import { exportProducts } from "@/lib/productSheet";
import { useSettings } from "@/hooks/useSettings";
import { errorMessage } from "@/lib/errorMessage";

const TABS = ["products", "categories", "uoms", "owners", "suppliers", "customers"] as const;

export default function MasterProductPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TABS, "products");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex flex-col gap-4">
      <TabsList data-tour="products-tabs" className="w-full justify-start overflow-x-auto">
        {TABS.map((k) => (
          <TabsTrigger key={k} value={k} className="text-xs">
            {t(`products.tabs.${k}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="products">
        <ProductsTab />
      </TabsContent>
      <TabsContent value="categories">
        <MasterListPanel table="m_categories" icon={Tags} title={t("products.tabs.categories")} subtitle={t("master.subtitles.categories")} fields={[]} />
      </TabsContent>
      <TabsContent value="uoms">
        <MasterListPanel table="m_uoms" icon={Ruler} title={t("products.tabs.uoms")} subtitle={t("master.subtitles.uoms")} fields={[]} />
      </TabsContent>
      <TabsContent value="owners">
        <MasterListPanel
          table="m_owners"
          icon={Building2}
          title={t("products.tabs.owners")}
          subtitle={t("master.subtitles.owners")}
          fields={["owner_type", "contact_name", "phone", "email"]}
        />
      </TabsContent>
      <TabsContent value="suppliers">
        <MasterListPanel
          table="m_suppliers"
          icon={Truck}
          title={t("products.tabs.suppliers")}
          subtitle={t("master.subtitles.suppliers")}
          fields={["contact_name", "phone", "email", "address"]}
        />
      </TabsContent>
      <TabsContent value="customers">
        <MasterListPanel
          table="m_customers"
          icon={Users}
          title={t("products.tabs.customers")}
          subtitle={t("master.subtitles.customers")}
          fields={["contact_name", "phone", "email", "address"]}
        />
      </TabsContent>
    </Tabs>
  );
}

function ProductsTab() {
  const { t } = useTranslation();
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: owners = [] } = useOwners();
  const { data: uoms = [] } = useUoms();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>();
  const [owner, setOwner] = useState<string>();
  const [status, setStatus] = useState<"active" | "inactive">();
  const [productDialog, setProductDialog] = useState<{ product: Product | null } | null>(null);
  const [skuDialog, setSkuDialog] = useState<{ product: Product; sku: Sku | null } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: settings } = useSettings();

  const uomCode = (id: number) => uoms.find((u) => u.id === id)?.code ?? "?";
  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? "-";
  const ownerName = (id: number) => owners.find((o) => o.id === id)?.name ?? "-";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || String(p.category_id) === category) &&
        (!owner || String(p.owner_id) === owner) &&
        (!status || p.is_active === (status === "active")) &&
        (!q ||
          `${p.code} ${p.name}`.toLowerCase().includes(q) ||
          p.m_skus.some((s) => `${s.sku_code} ${s.barcode ?? ""}`.toLowerCase().includes(q))),
    );
  }, [products, search, category, owner, status]);

  const labelItems = products.flatMap((p) =>
    p.m_skus
      .filter((s) => selected.has(s.id))
      .map((s) => ({
        value: s.barcode ?? s.sku_code,
        title: p.name,
        subtitle: [s.sku_code, ...attributeValues(p.variant_attributes, s.attributes)].join(" · "),
      })),
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("products.tabs.products")}
        count={products.length}
        subtitle={t("master.subtitles.products")}
        tour="products-actions"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!selected.size}
              onClick={() => setLabelsOpen(true)}
              className="h-8 gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              {t("labels.printCount", { count: selected.size })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!products.length}
              className="h-8 gap-1.5"
              onClick={() =>
                exportProducts(
                  products,
                  { category: (id) => categories.find((c) => c.id === id)?.code ?? "", owner: (id) => owners.find((o) => o.id === id)?.code ?? "", uom: uomCode },
                  settings?.company_name ?? "StockDesk",
                ).catch((e: Error) => toast.error(errorMessage(e)))
              }
            >
              <Download className="w-3.5 h-3.5" />
              {t("common.export")}
            </Button>
            <AccessControl feature="master-product" action="create">
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-8 gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {t("products.import.button")}
              </Button>
              <Button size="sm" onClick={() => setProductDialog({ product: null })} className="h-8 gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {t("products.new")}
              </Button>
            </AccessControl>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("products.searchPlaceholder")} tour="products-search" />
        <FilterSelect
          value={category}
          onChange={setCategory}
          allLabel={t("products.allCategories")}
          options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
        />
        <FilterSelect
          value={owner}
          onChange={setOwner}
          allLabel={t("products.allOwners")}
          options={owners.map((o) => ({ value: String(o.id), label: o.name }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel={t("common.allStatus")}
          options={[
            { value: "active", label: t("common.active") },
            { value: "inactive", label: t("common.inactive") },
          ]}
        />
      </Toolbar>

      <ProductsTable
        products={filtered}
        uomCode={uomCode}
        categoryName={categoryName}
        ownerName={ownerName}
        selected={selected}
        onSelectedChange={setSelected}
        onEditProduct={(product) => setProductDialog({ product })}
        onAddSku={(product) => setSkuDialog({ product, sku: null })}
        onEditSku={(product, sku) => setSkuDialog({ product, sku })}
      />

      <ProductFormDialog
        open={productDialog != null}
        product={productDialog?.product ?? null}
        onOpenChange={(o) => !o && setProductDialog(null)}
      />
      <SkuFormDialog
        open={skuDialog != null}
        product={skuDialog?.product ?? null}
        sku={skuDialog?.sku ?? null}
        onOpenChange={(o) => !o && setSkuDialog(null)}
      />
      <ProductImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <LabelPrintDialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        items={labelItems}
        defaultKind="barcode"
        fileName="label-sku.pdf"
      />
    </div>
  );
}
