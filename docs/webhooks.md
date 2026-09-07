# Réception des webhooks

La page authentifiée `/webhooks` est accessible dans le menu **Webhooks**.
Créez une URL personnelle puis copiez-la dans le service émetteur. Le bouton
**Envoyer un test** effectue une vraie requête POST et confirme son enregistrement.

## Mise en service

1. Appliquer `supabase/migrations/20260908120000_add_webhook_inbox.sql` au projet
   Supabase (migration via votre procédure habituelle ou éditeur SQL Supabase).
2. Déployer l’application avec son serveur TanStack Start. Le serveur utilise les
   variables existantes `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` (ou leurs
   équivalents `VITE_SUPABASE_*`). Aucune clé service-role supplémentaire.
3. Ouvrir **Webhooks**, créer l’URL et envoyer un test. Pour un service externe,
   copier l’URL depuis l’application déployée sur une adresse HTTPS publique.

L’endpoint `POST /api/webhooks/<jeton>` fonctionne même lorsque la page est fermée.
Une réponse HTTP 200 contient `received: true`, `id` et `received_at` uniquement
après sauvegarde en base. Aucun accès à l’historique n’est accordé par le jeton.
Les autres méthodes ne servent pas à recevoir des messages.

## Contenu et limites

- JSON, texte, XML ou formulaire encodé, en UTF-8 sans caractère nul ; les corps
  JSON invalides restent consultables comme texte brut.
- Maximum 256 Kio par corps, 60 messages par minute et par URL.
- Métadonnées limitées en taille ; en-têtes/paramètres contenant authorization,
  cookie, token, secret, api-key, password ou signature masqués avant sauvegarde
  via l’endpoint HTTP. Le corps lui-même est conservé tel quel.
- Codes d’erreur : 400 (contenu invalide), 404 (jeton inconnu), 413 (taille),
  429 (débit, Retry-After: 60), 503 (stockage/configuration indisponible).
- Chaque livraison est conservée séparément, y compris les tentatives répétées
  d’un émetteur. L’historique montre les 50 derniers messages et actualise leurs
  métadonnées toutes les 5 secondes lorsque la page est visible. Le contenu
  complet est chargé seulement à la sélection.
- La sécurité par ligne (RLS) isole les URL et messages par utilisateur.
  La fonction SQL de réception déduit le propriétaire du jeton, contrôle la
  taille et le débit, et ne permet aucune lecture anonyme de l’historique.
- Conserver l’URL secrète. Utiliser l’URL publiée, car localhost et les aperçus
  protégés ne sont pas forcément accessibles aux services externes.

## Vérifications

`node --experimental-strip-types --test tests/webhook-receiver.test.mjs`

Après migration/déploiement : vérifier la réception depuis un outil externe,
les onglets du détail, la persistance après rechargement et l’isolation en se
connectant avec un deuxième compte.

Implémentation HTTP conforme aux
[routes serveur TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes).
