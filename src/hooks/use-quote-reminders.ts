import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  getQuoteReminder,
  parseReminderSettings,
  REMINDER_SETTING_KEY,
  type ReminderSettings,
} from "@/lib/quote-reminders";

export function useQuoteReminders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const settingsQuery = useQuery({
    queryKey: ["app_settings", REMINDER_SETTING_KEY, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("owner_id", user!.id)
        .eq("key", REMINDER_SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseReminderSettings(data?.value);
    },
    refetchInterval: 60_000,
  });
  const quotesQuery = useQuery({
    queryKey: ["quotes", "reminders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const page = async (offset: number) => {
        const { data, error } = await supabase
          .from("quotes")
          .select(
            "id, quote_number, status, sent_at, last_reminded_at, reminder_snoozed_until, reminder_count, reminder_version, client:clients(name)",
          )
          .eq("owner_id", user!.id)
          .in("status", ["envoye", "sent"])
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        return data;
      };
      const rows = await page(0);
      let count = rows.length;
      while (count === 500) {
        const next = await page(rows.length);
        rows.push(...next);
        count = next.length;
      }
      return rows;
    },
    refetchInterval: 60_000,
  });
  const settings = settingsQuery.data;
  const reminders = settings
    ? (quotesQuery.data ?? [])
        .flatMap((quote) => {
          const reminder = getQuoteReminder(quote, settings, now);
          return reminder ? [{ ...quote, ...reminder }] : [];
        })
        .sort((a, b) => a.dueAt - b.dueAt)
    : [];
  const due = reminders.filter((reminder) => reminder.isDue);

  const saveSettings = useMutation({
    mutationFn: async (value: ReminderSettings) => {
      if (!user) throw new Error("Reconnectez-vous pour enregistrer les réglages.");
      if (!Number.isInteger(value.delayDays) || value.delayDays < 1 || value.delayDays > 365) {
        throw new Error("Choisissez un délai entier entre 1 et 365 jours.");
      }
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { owner_id: user.id, key: REMINDER_SETTING_KEY, value },
          { onConflict: "owner_id,key" },
        );
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success("Réglages des rappels enregistrés.");
    },
    onError: () => toast.error("Impossible d’enregistrer les réglages des rappels."),
  });
  const act = useMutation({
    mutationFn: async ({
      id,
      version,
      action,
    }: {
      id: string;
      version: number;
      action: "done" | "snooze";
    }) => {
      const { error } = await supabase.rpc("handle_quote_reminder", {
        p_quote_id: id,
        p_action: action,
        p_expected_version: version,
      });
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success(
        variables.action === "done"
          ? "Relance notée. Le prochain rappel est programmé."
          : "Rappel reporté de 3 jours.",
      );
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.error(
        "Action impossible. Le devis a peut-être changé ; réessayez après actualisation.",
      );
    },
  });
  return {
    settings,
    reminders,
    due,
    saveSettings,
    act,
    isPending: settingsQuery.isPending || quotesQuery.isPending,
    isError: settingsQuery.isError || quotesQuery.isError,
    isFetching: settingsQuery.isFetching || quotesQuery.isFetching,
    refresh: () => Promise.all([settingsQuery.refetch(), quotesQuery.refetch()]),
  };
}
