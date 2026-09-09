# Création d'un ticket « devis à créer » depuis un outil terrain

Appliquer `supabase/migrations/20260909140000_add_quote_ticket_import.sql` après les
migrations existantes, puis déployer.

Dans **Webhooks**, activer **Autoriser la création de tickets par POST**. Copier l'URL
affichée : `POST https://votre-application/api/webhooks/tickets/<jeton>`.

Le jeton est celui de votre compte (le même que pour la réception de webhooks et l'import
client/site/installation) ; cette création est activable et désactivable indépendamment.

Envoyer `Content-Type: application/json` avec un objet contenant `event` (doit valoir
`status_en_attente_devis`), `ticket`, `client` et `site` ; `problem`, `equipment`,
`equipment_checks`, `work_type` et `technician` sont optionnels :

```json
{
  "event": "status_en_attente_devis",
  "ticket": {
    "id": "uuid", "number": "T-1042", "title": "Porte sectionnelle bloquée",
    "description": "..."
  },
  "problem": {
    "panne_description": "Ressort de torsion cassé",
    "actions_done": "Mise en sécurité",
    "recommendation": "Remplacement du jeu de ressorts"
  },
  "client": { "name": "Société Dupont" },
  "site": { "name": "Agence Paris", "address": "10 rue de Paris", "postal_code": "75001", "city": "Paris" },
  "equipment": { "code": "P-03", "equipment_type": "Porte sectionnelle", "serial_number": "..." }
}
```

## Recherche des fiches

`client` et `site` acceptent `id` (UUID existant) ou `name`. L'identifiant a priorité. Sans
identifiant, le site est en plus recherché par `address` + `postal_code` lorsqu'aucun nom ne
correspond. Une correspondance ambiguë (id introuvable ou plusieurs fiches candidates) produit
une erreur 404 ou 409 : fournir alors l'UUID voulu. Sans correspondance, la fiche est créée.

`equipment` (l'installation concernée) est recherché par `id`, puis `serial_number`, puis
`code`, au sein du site retrouvé ou créé. Sans correspondance, une installation est créée avec
`equipment_type` et `code` comme nom ; la marque, le modèle et l'état reçus sont ajoutés en
note. `equipment` est optionnel : sans lui, le ticket est créé sans installation.

## Ticket créé

Le ticket local est créé avec le statut `devis_a_creer` et une description qui reprend
`ticket.description` ainsi que les champs de `problem` (panne constatée, actions déjà
réalisées, recommandation), afin de préparer le devis directement depuis la fiche ticket
existante (bouton « Créer le devis »). Il apparaît dans la liste **Tickets** comme tout autre
ticket.

Rejouer la même requête (même `ticket.id`) réutilise le ticket déjà créé plutôt que d'en créer
un second.

Erreurs : 400 (JSON/évènement invalide), 403 (création désactivée), 404 (URL ou référence
introuvable), 409 (nom ambigu ou conflit concurrent), 413 (taille), 415 (type de contenu), 429
(quota partagé de 60 requêtes réussies/minute avec les autres webhooks), 503
(configuration/stockage indisponible).

## Vérification

`node --experimental-strip-types --test tests/quote-ticket-import.test.mjs`
