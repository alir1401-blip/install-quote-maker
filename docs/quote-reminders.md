# Rappels de devis dans l’application

La rubrique **Relances devis** et la cloche dans l’en-tête affichent les devis
envoyés sans réponse après un délai réglable (7 jours par défaut, de 1 à 365 jours).
Les réglages et les dates sont propres au compte connecté.

Appliquer `supabase/migrations/20260908130000_add_quote_reminders.sql`, puis
déployer l’application. Aucun planificateur ni service externe n’est requis :
les échéances sont calculées depuis les dates persistées au chargement, au retour
dans l’onglet et toutes les minutes. Les rappels échus pendant une fermeture
apparaissent à la prochaine ouverture.

- Le passage à **Envoyé** (`envoye` ou ancien statut `sent`) enregistre la date
  d’envoi côté base. Une simple modification du devis ne remet pas le délai à zéro.
- Pour les devis déjà envoyés avant cette migration, la date d’émission est
  utilisée comme approximation de la date d’envoi (minuit, Europe/Paris).
- **Relance effectuée** enregistre la date et incrémente le compteur ; un nouveau
  rappel suit après le délai configuré.
- **Reporter de 3 jours** décale le rappel de 72 heures sans comptabiliser de relance.
- Les devis acceptés, refusés, brouillons ou à l’étape suivante sont exclus.
  Repasser un devis à Envoyé démarre une nouvelle période et retire son report.
- Désactiver les rappels masque les alertes ; les dates restent conservées.
  Modifier le délai recalcule les échéances des devis en attente.
- Les actions sont atomiques et vérifient le propriétaire, le statut et une
  version pour éviter les doubles validations depuis des onglets concurrents.
- Ces rappels sont internes : aucun e-mail n’est envoyé.

Vérification de la logique de dates :
`node --experimental-strip-types --test tests/quote-reminders.test.mjs`.
