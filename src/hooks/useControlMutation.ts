import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";

const KEYS = ["stock-transfers", "stock-counts", "stock-balances", "movements", "putaway-tasks", "sidebar-counts", "locations"];

/** Transfers and counts move stock and lock bins, so they refresh everything stock-shaped. */
export function useControlMutation<V, R = unknown>(fn: (v: V) => Promise<R>, message = "common.saved") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(i18n.t(message));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}
