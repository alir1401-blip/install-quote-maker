import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { BellRing, Check, Clock, RefreshCw, Save } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuoteReminders } from "@/hooks/use-quote-reminders";
import type { ReminderSettings } from "@/lib/quote-reminders";

export const Route = createFileRoute("/_authenticated/quote-reminders")({ component: QuoteRemindersPage });

function ReminderSettingsForm({ initial, saving, onSave }: {
  initial: ReminderSettings;
  saving: boolean;
  onSave: (value: ReminderSettings) => void;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [delay, setDelay] = useState(String(initial.delayDays));
  const valid = Number.isInteger(Number(delay)) && Number(delay) >= 1 && Number(delay) <= 365;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onSave({ enabled, delayDays: Number(delay) });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Switch id="reminders-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
        <Label htmlFor="reminders-enabled">Activer les rappels de devis</Label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="reminder-delay">Délai sans réponse (jours)</Label>
          <Input id="reminder-delay" type="number" min={1} max={365} step={1}
            value={delay} onChange={(event) => setDelay(event.target.value)}
            disabled={saving} className="w-32" required aria-describedby="reminder-delay-help" />
        </div>
        <Button type="submit" disabled={saving || !valid}>
          <Save className="mr-2 h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      <p id="reminder-delay-help" className="text-sm text-muted-foreground">
        Le rappel apparaît après ce délai à partir de l’envoi, puis de la dernière relance notée.
        Modifier le délai recalcule aussi les rappels des devis déjà envoyés.
      </p>
    </form>
  );
}

function QuoteRemindersPage() {
  const state = useQuoteReminders();
  const [tab, setTab] = useState<"due" | "planned">("due");
  const planned = state.reminders.filter((row) => !row.isDue);
  const visible = tab === "due" ? state.due : planned;
  return (
    <div className="space-y-6">
      <PageHeader title="Relances de devis"
        description="Retrouvez les devis envoyés qui attendent encore une réponse."
        actions={<Button variant="outline" onClick={() => void state.refresh()} disabled={state.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" /> Actualiser
        </Button>} />
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-5 w-5 text-primary" /> Rappels automatiques
        </CardTitle></CardHeader>
        <CardContent>
          {state.settings ? <ReminderSettingsForm
            key={`${state.settings.enabled}-${state.settings.delayDays}`}
            initial={state.settings} saving={state.saveSettings.isPending}
            onSave={(value) => state.saveSettings.mutate(value)} />
            : !state.isError && <p role="status" className="text-sm text-muted-foreground">Chargement des réglages…</p>}
        </CardContent>
      </Card>
      {state.isError ? <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        Impossible de charger les rappels. Réessayez avec « Actualiser ».
      </div> : state.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des devis…</p>
        : !state.settings?.enabled ? <EmptyState title="Rappels désactivés"
          description="Activez les rappels ci-dessus pour retrouver les devis à relancer." />
        : <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" aria-label="Filtrer les rappels">
              <Button variant={tab === "due" ? "default" : "outline"} aria-pressed={tab === "due"} onClick={() => setTab("due")}>
                À relancer ({state.due.length})
              </Button>
              <Button variant={tab === "planned" ? "default" : "outline"} aria-pressed={tab === "planned"} onClick={() => setTab("planned")}>
                À venir ({planned.length})
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">Actualisation toutes les minutes</span>
          </div>
          {visible.length === 0 ? <EmptyState
            title={tab === "due" ? "Aucun devis à relancer" : "Aucun rappel à venir"}
            description={tab === "due"
              ? "Les devis apparaîtront ici lorsque le délai sans réponse sera dépassé."
              : "Les rappels sont planifiés lorsque vous passez un devis au statut « Envoyé »."} />
            : <div className="space-y-3">
              {visible.map((row) => <Card key={row.id} className="p-4">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/quotes/$quoteId" params={{ quoteId: row.id }} className="font-semibold hover:underline">
                        {row.quote_number}
                      </Link>
                      <Badge variant={row.isDue ? "destructive" : "secondary"}>
                        {row.isDue ? row.daysLate > 0 ? `En retard de ${row.daysLate} j` : "À relancer aujourd’hui"
                          : "Rappel programmé"}
                      </Badge>
                    </div>
                    <p className="text-sm">{row.client?.name ?? "Client indisponible"}</p>
                    <p className="text-xs text-muted-foreground">
                      Envoyé le {new Date(row.sent_at!).toLocaleDateString("fr-FR")} · Rappel le {new Date(row.dueAt).toLocaleString("fr-FR")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.reminder_count} relance(s) notée(s)
                      {row.last_reminded_at && ` · Dernière le ${new Date(row.last_reminded_at).toLocaleDateString("fr-FR")}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/quotes/$quoteId" params={{ quoteId: row.id }}>Ouvrir le devis</Link>
                    </Button>
                    {row.isDue && <>
                      <Button variant="outline" size="sm" disabled={state.act.isPending}
                        onClick={() => state.act.mutate({ id: row.id, version: row.reminder_version, action: "snooze" })}>
                        <Clock className="mr-2 h-4 w-4" /> Reporter de 3 jours
                      </Button>
                      <Button size="sm" disabled={state.act.isPending}
                        onClick={() => state.act.mutate({ id: row.id, version: row.reminder_version, action: "done" })}>
                        <Check className="mr-2 h-4 w-4" /> Relance effectuée
                      </Button>
                    </>}
                  </div>
                </div>
              </Card>)}
            </div>}
          <p className="text-xs text-muted-foreground">
            Après avoir contacté le client, utilisez « Relance effectuée » pour programmer le rappel suivant.
            Les devis acceptés, refusés ou passés à l’étape suivante sortent automatiquement des rappels.
          </p>
        </>}
    </div>
  );
}
