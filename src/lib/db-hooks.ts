import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TableName =
  | "grand_accounts"
  | "grand_account_bpu_items"
  | "clients"
  | "sites"
  | "site_contacts"
  | "documents"
  | "installations"
  | "installation_types"
  | "part_categories"
  | "brands"
  | "models"
  | "parts"
  | "part_model_compat"
  | "part_type_compat"
  | "part_components"
  | "part_equivalences"
  | "contract_kit_prices"
  | "contract_pricing_tiers"
  | "contract_client_pricing"
  | "installation_requirements"
  | "installation_parts"
  | "installation_type_default_parts"
  | "model_default_parts"
  | "quote_installations"
  | "quote_tickets"
  | "app_settings"
  | "suppliers"
  | "supplier_parts"
  | "subcontractors"
  | "subcontractor_installation_types"
  | "contracts"
  | "interventions"
  | "quotes"
  | "quote_items"
  | "tickets"
  | "ticket_groups"
  | "ticket_group_tickets"
  | "history_events"
  | "intervention_reports"
  | "purchase_orders"
  | "part_orders"
  | "part_order_items"
  | "storage_locations"
  | "storage_location_stocks"
  | "stock_movements"
  | "stock_tickets"
  | "part_family_fields"
  | "calculation_formulas"
  | "business_rules"
  | "bom_templates"
  | "bom_template_items"
  | "part_compatibilities"
  | "quote_calculation_logs"
  | "cost_settings"
  | "technician_cost_profiles"
  | "vehicles"
  | "intervention_technician_times"
  | "intervention_parts_costs"
  | "intervention_shipments"
  | "intervention_subcontractors"
  | "intervention_equipments"
  | "intervention_type_admin_settings"
  | "invoices"
  | "invoice_items";

export function useList<T = any>(
  table: TableName,
  options?: {
    filter?: (q: any) => any;
    orderBy?: string;
    ascending?: boolean;
    enabled?: boolean;
    key?: QueryKey;
  },
) {
  return useQuery({
    queryKey: options?.key ?? [table, options?.filter?.toString(), options?.orderBy],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const build = (withOrder: boolean) => {
        let q: any = (supabase as any).from(table).select("*");
        if (options?.filter) q = options.filter(q);
        if (withOrder)
          q = q.order(options?.orderBy ?? "created_at", { ascending: options?.ascending ?? false });
        return q;
      };
      let { data, error } = await build(true);
      // Some tables (junction tables, stocks) have no created_at column:
      // retry without ordering instead of failing silently.
      if (error && !options?.orderBy) {
        ({ data, error } = await build(false));
      }
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useOne<T = any>(table: TableName, id: string | undefined) {
  return useQuery({
    queryKey: [table, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await ((supabase as any).from(table) as any)
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as T | null;
    },
  });
}

export function useOneByRouteParam<T = any>(
  table: TableName,
  param: string | undefined,
  numberColumn: string,
) {
  return useQuery({
    queryKey: [table, "route-param", param, numberColumn],
    enabled: !!param,
    queryFn: async () => {
      const value = decodeURIComponent(param!);
      const numberValues = Array.from(new Set([value, value.replace("-", "/")]));
      const idQuery = ((supabase as any).from(table) as any).select("*").eq("id", value).maybeSingle();
      const numberQuery = ((supabase as any).from(table) as any)
        .select("*")
        .in(numberColumn, numberValues)
        .maybeSingle();
      const [{ data: byId, error: idError }, { data: byNumber, error: numberError }] =
        await Promise.all([idQuery, numberQuery]);
      if (idError && idError.code !== "22P02") throw idError;
      if (numberError) throw numberError;
      return (byId ?? byNumber) as T | null;
    },
  });
}

async function getOwnerId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Non authentifié");
  return data.user.id;
}

export function useUpsert(table: TableName, invalidate: QueryKey[] = [[table]]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: any) => {
      const owner_id = await getOwnerId();
      const payload = { ...row, owner_id };
      const client = (supabase as any).from(table) as any;
      if (row.id) {
        const { data, error } = await client.update(payload).eq("id", row.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await client.insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success("Enregistré");
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur d'enregistrement"),
  });
}

export function useRemove(table: TableName, invalidate: QueryKey[] = [[table]]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await ((supabase as any).from(table) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success("Supprimé");
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });
}
