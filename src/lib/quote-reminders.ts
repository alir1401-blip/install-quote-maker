export const REMINDER_SETTING_KEY = "quote_reminders";
export const DAY_MS = 24 * 60 * 60 * 1000;
export type ReminderSettings = { enabled: boolean; delayDays: number };
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, delayDays: 7 };

export function parseReminderSettings(value: unknown): ReminderSettings {
  const data = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    delayDays: typeof data.delayDays === "number" && Number.isInteger(data.delayDays)
      && data.delayDays >= 1 && data.delayDays <= 365 ? data.delayDays : 7,
  };
}

type ReminderQuote = {
  status: string;
  sent_at: string | null;
  last_reminded_at: string | null;
  reminder_snoozed_until: string | null;
};

export function getQuoteReminder(quote: ReminderQuote, settings: ReminderSettings, now: number) {
  if (!settings.enabled || !["envoye", "sent"].includes(quote.status) || !quote.sent_at) return null;
  const sentAt = Date.parse(quote.sent_at);
  if (!Number.isFinite(sentAt)) return null;
  const lastReminded = quote.last_reminded_at ? Date.parse(quote.last_reminded_at) : sentAt;
  const base = Math.max(sentAt, Number.isFinite(lastReminded) ? lastReminded : sentAt);
  const snoozed = quote.reminder_snoozed_until ? Date.parse(quote.reminder_snoozed_until) : 0;
  const dueAt = Math.max(base + settings.delayDays * DAY_MS, Number.isFinite(snoozed) ? snoozed : 0);
  return { dueAt, isDue: dueAt <= now, daysLate: Math.max(0, Math.floor((now - dueAt) / DAY_MS)) };
}
