# Création du client, du site et de l’installation par POST

Appliquer `supabase/migrations/20260908140000_add_installation_import.sql` après
les migrations existantes, notamment celle des webhooks, puis déployer.

Dans **Webhooks**, créer votre URL si nécessaire puis activer **Autoriser la
création par POST**. Copier l’URL affichée :
`POST https://votre-application/api/imports/installations/<jeton>`.

Le jeton détermine le compte propriétaire. La création est désactivée par défaut
et peut être désactivée à tout moment depuis cette page. L’URL habituelle
`/api/webhooks/<jeton>` reste une réception de messages sans création de fiches.

Envoyer `Content-Type: application/json` avec :

```json
{
  "client": {
    "name": "Société Dupont",
    "email": "contact@example.com",
    "phone": "0102030405"
  },
  "site": {
    "name": "Agence Paris",
    "address": "10 rue de Paris, 75001 Paris"
  },
  "installation": {
    "name": "Porte entrée principale",
    "serial_number": "PORTE-001",
    "year": 2024,
    "location": "Accueil",
    "characteristics": { "largeur_mm": 1800 }
  }
}
```

Enregistrer ce contenu dans `payload.json`, puis appeler :

```sh
curl -X POST "URL_COPIÉE" -H "Content-Type: application/json" --data-binary "@payload.json"
```

Sous Windows PowerShell, utiliser `curl.exe`.

## Recherche des fiches

Chaque objet doit contenir un `name` ou un `id` (UUID existant).
L’identifiant a priorité lorsqu’il est fourni. Un identifiant inconnu, appartenant
à un autre compte ou rattaché à un autre parent produit une erreur 404.

Sans identifiant, le nom est comparé sans tenir compte de la casse et des espaces
superflus : client dans le compte, site dans le client trouvé, installation dans
le site trouvé. Les accents restent significatifs. Plusieurs correspondances
produisent une erreur 409 : fournir alors l’UUID voulu.

Le SIRET, l’e-mail et le numéro de série sont des informations de création,
pas des clés de recherche. Les fiches trouvées ne sont pas modifiées.
Pour des installations distinctes portant le même nom, employer des noms distinctifs
lors de la création et utiliser les identifiants retournés pour les appels suivants.

Champs optionnels de création :

- Client : `email`, `phone`, `address`, `contact_name`, `notes`, `siret`.
- Site : `email`, `address`, `contact_name`, `contact_phone`, `notes`.
- Installation : `serial_number`, `year` (entier de 1800 à 2200), `location`,
  `notes`, `characteristics` (objet JSON).

Les noms sont limités à 200 caractères, les autres textes à 10 000 caractères,
et le JSON à 64 Kio. Les champs inconnus sont refusés ; les liens entre fiches,
les propriétaires et les numéros internes sont attribués automatiquement.

## Réponse

HTTP 200 après validation de la transaction :

```json
{
  "received": true,
  "id": "UUID du message enregistré",
  "received_at": "2026-09-08T12:00:00Z",
  "client": { "id": "UUID", "number": "00001", "created": false },
  "site": { "id": "UUID", "number": "00002", "created": true },
  "installation": { "id": "UUID", "number": "00002/001", "created": true }
}
```

Répéter la même requête réutilise les fiches. Les requêtes d’import d’un compte sont
sérialisées pour empêcher les créations en double entre imports simultanés.
Toute erreur annule les créations et l’entrée d’historique de la requête.
Chaque import réussi apparaît dans l’historique Webhooks avec `x-operation:
ensure-installation`. Les tentatives échouées ne sont pas enregistrées.

Erreurs : 400 (JSON/champ invalide), 403 (création désactivée), 404 (URL ou référence
introuvable), 409 (nom ambigu ou conflit concurrent), 413 (taille), 415 (type de
contenu), 429 (quota partagé de 60 requêtes réussies/minute avec les webhooks),
503 (configuration/stockage indisponible).

## Vérification

`node --experimental-strip-types --test tests/installation-import.test.mjs`
