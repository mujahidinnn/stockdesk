import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/Field";
import { useDispatchShipment, type Shipment } from "@/hooks/useShipments";
import { COURIERS } from "@/lib/couriers";

// Stock leaves the warehouse when this is confirmed.
export function DispatchFormDialog({ shipment, onClose, onDispatched }: { shipment: Shipment | null; onClose: () => void; onDispatched: (s: Shipment) => void }) {
  const { t } = useTranslation();
  const dispatch = useDispatchShipment();
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");

  useEffect(() => {
    setCourier("");
    setTracking("");
  }, [shipment?.id]);

  return (
    <Dialog open={!!shipment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{t("dispatch.dispatchTitle", { no: shipment?.do_no })}</DialogTitle>
        </DialogHeader>
        <Field label={t("dispatch.courier")}>
          <Input list="couriers" value={courier} onChange={(e) => setCourier(e.target.value)} className="h-11" autoFocus />
          <datalist id="couriers">
            {COURIERS.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label={t("dispatch.trackingNo")}>
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} className="h-11 font-mono" />
        </Field>
        <p className="text-xs text-muted-foreground">{t("dispatch.dispatchHint")}</p>
        <DialogFooter>
          <Button
            className="h-12 w-full gap-2 text-base"
            loading={dispatch.isPending}
            disabled={!courier.trim()}
            onClick={() =>
              dispatch.mutate(
                { id: shipment!.id, courier: courier.trim(), trackingNo: tracking.trim() },
                { onSuccess: () => onDispatched({ ...shipment!, status: "dispatched", courier: courier.trim(), tracking_no: tracking.trim() || null }) },
              )
            }
          >
            <Truck className="h-5 w-5" />
            {t("dispatch.dispatch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
