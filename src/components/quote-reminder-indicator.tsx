import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuoteReminders } from "@/hooks/use-quote-reminders";

export function QuoteReminderIndicator() {
  const { due, isError, isPending } = useQuoteReminders();
  const count = !isError && !isPending ? due.length : 0;
  return (
    <Button variant="ghost" size="sm" asChild className="ml-auto print:hidden">
      <Link to="/quote-reminders"
        aria-label={isError ? "Relances de devis : chargement indisponible" : `Relances de devis : ${count} à traiter`}>
        <BellRing className="h-4 w-4" />
        <span className="hidden sm:inline">Relances devis</span>
        {count > 0 && <span className="rounded-full bg-destructive px-1.5 text-xs text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>}
        {isError && <span className="text-destructive" aria-hidden="true">!</span>}
      </Link>
    </Button>
  );
}

export function QuoteReminderNotice({ quoteId }: { quoteId: string }) {
  const { reminders, isError, isPending } = useQuoteReminders();
  const reminder = reminders.find((row) => row.id === quoteId);
  if (isError || isPending || !reminder) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 text-sm print:hidden">
      <p>
        {reminder.isDue ? "Ce devis est à relancer." : `Prochain rappel le ${new Date(reminder.dueAt).toLocaleDateString("fr-FR")}.`}
        {reminder.reminder_count > 0 && ` ${reminder.reminder_count} relance(s) déjà notée(s).`}
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link to="/quote-reminders">Gérer les relances</Link>
      </Button>
    </div>
  );
}
