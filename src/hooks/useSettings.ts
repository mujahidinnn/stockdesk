import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("m_settings").select("*").single();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60_000,
  });
}
