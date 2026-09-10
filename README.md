# MisterClean — site, réservation et administration

## Présentation

Ce dépôt contient le site public de MisterClean Adelaide, son système de réservation en ligne et un espace privé permettant au client de gérer ses disponibilités.

Le projet est volontairement simple : le frontend est statique, sans Next.js ni framework côté navigateur. Les opérations sensibles sont exécutées par des fonctions serverless Vercel en TypeScript. Supabase/PostgreSQL reste la source de vérité pour les horaires, les réservations et la prévention des conflits.

Fonctionnalités actuellement disponibles :

- site vitrine responsive avec services, tarifs, photos du gérant, résultats avant/après, avis et carte ;
- réservation d’une ou plusieurs prestations lors d’une même visite ;
- calcul des créneaux selon la durée totale de la visite ;
- réservation atomique et protection contre les doubles réservations ;
- confirmations et annulations par email via Resend ;
- création et suppression best-effort des événements Google Calendar ;
- espace `/admin` protégé par lien magique pour modifier les horaires ;
- tableau de bord des rendez-vous confirmés à venir, actualisé automatiquement ;
- création manuelle d’une réservation depuis l’administration avec contrôle des créneaux ;
- vue calendrier mensuelle des rendez-vous avec navigation et accès aux fiches détaillées ;
- annulation d’un rendez-vous par le cleaner avec notifications email ;
- horaires hebdomadaires, fermetures et horaires exceptionnels par date ;
- plusieurs administrateurs autorisés ;
- journal d’audit des modifications de disponibilités.

Le paiement n’est pas effectué en ligne. Le client paie directement après la prestation.

## Architecture

```text
.
├── index.html                    Site public
├── styles.css                   Styles globaux et page publique
├── script.js                    Navigation, galerie et carte
├── Images/                      Photos, logo et illustrations utilisées
├── assets/                      Autres médias publics
├── booking/
│   ├── index.html               Parcours de réservation
│   ├── booking.css
│   ├── booking.js
│   └── cancel/                  Page d’annulation par token
├── admin/
│   ├── index.html               Tableau de bord privé du cleaner
│   ├── admin.css
│   └── admin.js
├── api/
│   ├── booking/                 Configuration, disponibilité, création, annulation
│   ├── admin/                   Authentification, rendez-vous et gestion des horaires
│   └── cron/                    Relance des emails en attente
├── lib/server/                  Validation, Supabase, emails, auth et Calendar
├── supabase/migrations/         Schéma PostgreSQL versionné
├── supabase/tests/              Tests SQL nécessitant PostgreSQL/Supabase local
├── tests/                       Tests Vitest
├── scripts/build-static.mjs     Construction du dossier dist/
├── vercel.json                  Configuration Vercel
└── .vercelignore               Liste des sources exclues du déploiement
```

Technologies principales :

- Node.js 24.x ;
- TypeScript 5.9 ;
- modules ES (`"type": "module"`) ;
- Supabase/PostgreSQL ;
- Resend ;
- Google Calendar API ;
- Vercel Functions dans la région `syd1` ;
- Vitest et Zod.

## Site public

La page publique est construite à partir de `index.html`, `styles.css` et `script.js`.

Elle contient notamment :

- un hero avec un carrousel automatique de résultats avant/après ;
- une section personnelle présentant l’approche locale et pratique de MisterClean ;
- les services et tarifs ;
- une photo de présentation du cleaner en première position, puis cinq comparaisons avant/après (onze photos au total) dans le carrousel d’accueil, avec flèches, pause, navigation au clavier et balayage tactile ;
- une galerie de trois comparaisons près des tarifs sofa (`#before-after`), avec agrandissement des photos au clic ;
- un guide des tailles ;
- les avis Google via Elfsight ;
- une carte Leaflet centrée sur Adelaide ;
- un formulaire de demande pour les prestations sur devis.

La carte affiche un cercle indicatif de `17 500` mètres autour d’Adelaide. Ce cercle est uniquement visuel : il ne constitue pas une validation géographique dans l’API. Le texte public mentionne seulement « Adelaide and surrounding areas » et ne maintient plus de liste exhaustive de quartiers.

Les fichiers réellement envoyés à Vercel sont explicitement sélectionnés dans `.vercelignore` et dans `scripts/build-static.mjs`. Toute nouvelle image référencée dans le HTML ou le booking doit être ajoutée aux deux listes.

Les images du carrousel et de la galerie utilisent des copies WebP de 600 et 1200 pixels de large (qualité 84), avec le cadrage complet et les couleurs des photos fournies. Les originaux sont conservés dans `Images/`. Le carrousel charge une taille adaptée à l’écran et prépare la photo suivante ; les photos de la galerie sont chargées à l’approche de la section. L’animation s’arrête hors écran, pendant une interaction et quand la réduction des animations est demandée ; le bouton Play permet une reprise explicite.

Correspondance des copies `*-600.webp` / `*-1200.webp` avec les originaux :

La photo de présentation `Images/thibault-cleaning.jpg` provient du fichier fourni `thibo.jpg`. Son affichage est recadré en CSS sur le cleaner, centré dans la diapositive, pour masquer l’interface et les bords de l’écran présents dans la source. Le fichier photo lui-même est conservé tel quel.

| Préfixe | Avant | Après |
|---|---|---|
| `light-sofa` | `Sofa dirty1_2.jpg` | `Sofa clean 08.jpg` |
| `grey-sofa` | `dirty sofa alex 1_2.jpg` | `Sofa Alex lean.png` |
| `four-seat-sofa` | `Couch 4 places dirty .jpg` | `Couch 4 places clean.jpg` |
| `grey-chaise` | `dirty sofa 2_2.jpg` | `Sofa alex clean.png` |
| `sofa-stains` | `Couch 4 places sales.jpg` | `1000014781.jpg` |

## Parcours de réservation

Le parcours client comporte sept étapes :

1. sélectionner une ou plusieurs prestations ;
2. renseigner l’adresse ;
3. choisir une date ;
4. choisir un créneau encore disponible ;
5. renseigner les coordonnées et les notes ;
6. vérifier le récapitulatif, la durée et le prix total ;
7. recevoir la référence de confirmation.

Chaque prestation peut être réservée avec une quantité de 1 à 10. Une visite accepte au maximum 12 éléments au total. La durée et le prix de chaque prestation sont multipliés par sa quantité avant le calcul des créneaux.

Les liens du site peuvent présélectionner une prestation avec :

```text
/booking?service=sofa-up-to-3-seats
```

Le navigateur ne contacte jamais Supabase directement. Il utilise uniquement les routes `/api/booking/*`.

## Prestations et tarifs

Les prestations sont semées dans `supabase/migrations/003_booking_seed.sql`.

| Slug | Prestation | Durée | Prix |
|---|---|---:|---:|
| `sofa-up-to-3-seats` | Sofa jusqu’à 3 places | 75 min | $110 |
| `sofa-4-seats` | Sofa 4 places | 80 min | $135 |
| `sofa-5-seats-plus` | Sofa 5 places et plus | 120 min | $170 |
| `dining-chair` | Chaise de salle à manger | 20 min | $30 |
| `arm-chair` | Fauteuil | 40 min | $60 |
| `rug` | Tapis | 45 min | $50 |
| `carpet-room` | Moquette — pièce jusqu’à 15 m² | 60 min | $89 |
| `carpet-lounge` | Moquette — lounge de plus de 15 m² | 80 min | $120 |
| `mattress-single` | Matelas simple | 60 min | $99 |
| `mattress-queen` | Matelas queen | 60 min | $140 |
| `mattress-king` | Matelas king | 80 min | $170 |

Le nettoyage d’escaliers est présent dans le catalogue avec `requires_quote = true` et reste orienté vers le formulaire de contact. Les prestations extérieures sont également sur devis.

## Calcul des disponibilités

Fuseau métier : `Australia/Adelaide`.

Horaires hebdomadaires semés initialement :

- lundi : 07:00–19:30 ;
- mardi : 07:00–13:30 ;
- mercredi à dimanche : 07:00–12:00.

Ces valeurs peuvent ensuite être remplacées depuis `/admin`.

Règles globales :

- intervalle entre les départs de créneau : 30 minutes ;
- préavis minimum : 24 heures ;
- horizon de réservation : 90 jours ;
- délai minimum d’annulation : 24 heures ;
- buffer : 30 minutes après la visite complète.

Pour une réservation multi-prestations :

- la durée de service est la somme des durées sélectionnées ;
- le prix est la somme des prix sélectionnés ;
- le buffer est appliqué une seule fois à la fin de la visite ;
- un unique bloc d’occupation couvre toute la visite et son buffer.

Ordre de résolution des horaires pour une date :

1. si une exception existe pour la date, elle remplace l’horaire hebdomadaire ;
2. une exception fermée ne produit aucun créneau ;
3. une exception ouverte utilise sa plage spéciale ;
4. sans exception, la plage de `opening_hours` correspondant au jour est utilisée ;
5. les blocs actifs de `schedule_blocks` retirent les périodes déjà occupées ;
6. le préavis, l’horizon maximal et la durée cumulée sont appliqués.

## Base de données Supabase

Projet lié :

- nom : `misterclean-booking` ;
- région : Sydney ;
- référence : `txtltesmayuqondikpvr`.

### Tables principales

- `services` : catalogue, durée, buffer, prix, ordre et statut bookable ;
- `business_settings` : fuseau et règles globales ;
- `opening_hours` : horaires hebdomadaires ;
- `availability_exceptions` : fermeture ou plage spéciale pour une date ;
- `schedule_blocks` : réservations et indisponibilités ;
- `bookings` : réservation, client, adresse, snapshots financiers et statut ;
- `booking_services` : détail des prestations rattachées à une réservation ;
- `email_outbox` : emails à envoyer ou à retenter ;
- `admin_users` : adresses autorisées à ouvrir l’administration ;
- `admin_availability_audit` : journal des connexions demandées et modifications d’horaires.

Toutes les tables exposées utilisent RLS. Les rôles `anon` et `authenticated` n’ont pas d’accès direct aux données métier sensibles. La clé service role est utilisée uniquement dans les fonctions serveur.

### Fonctions PostgreSQL importantes

- `get_booking_availability_quantities(jsonb, date)` calcule les créneaux multi-prestations avec quantités ;
- `create_booking_quantities(...)` crée atomiquement le booking, son bloc, ses prestations quantifiées et les jobs email ;
- `get_booking_availability_multi(uuid[], date)` et `create_booking_multi(...)` restent disponibles pour compatibilité ;
- `cancel_booking(text, text)` annule et libère le bloc ;
- `cancel_booking_as_admin(uuid, text)` permet au cleaner d’annuler sans délai minimal ;
- `replace_opening_hours(jsonb)` remplace transactionnellement la semaine complète ;
- `set_availability_exception(date, boolean, time, time)` crée ou remplace une exception datée.

Les anciennes fonctions mono-prestation sont conservées pour compatibilité, mais les API publiques actuelles utilisent les fonctions `*_multi`.

### Migrations

Appliquer dans cet ordre :

1. `001_booking_schema.sql` — tables initiales, RLS, index et exclusion anti-conflit ;
2. `002_booking_functions.sql` — fonctions initiales de disponibilité, création et annulation ;
3. `003_booking_seed.sql` — réglages, horaires et services ;
4. `004_google_calendar.sql` — identifiant d’événement Calendar dans `bookings` ;
5. `005_multi_service_bookings.sql` — `booking_services` et fonctions multi-prestations ;
6. `006_admin_availability.sql` — exceptions, audit et fonctions d’administration ;
7. `007_admin_users.sql` — liste multi-administrateurs ;
8. `008_fix_opening_hours_replace.sql` — remplacement des horaires compatible avec la protection safe-update Supabase ;
9. `009_admin_booking_cancellation.sql` — annulation transactionnelle d’un rendez-vous par le cleaner.
10. `010_booking_service_quantities.sql` — quantités par prestation et fonctions de réservation associées.
11. `011_customers.sql` — table `customers` pour les notes internes ; fonctions `search_customers` et `get_customer_bookings`.
12. `012_customers_manual.sql` — colonnes `first_name / last_name / phone` dans `customers` ; `search_customers()` étendue aux contacts sans réservation.

Les migrations `001` à `010` ont été appliquées au projet Supabase lié au moment de cette mise à jour. La migration `011` est à appliquer pour activer le mini-CRM.

## Anti-conflit et idempotence

`schedule_blocks.occupied_period` est une plage PostgreSQL `tstzrange`. Une contrainte d’exclusion GiST interdit tout chevauchement entre blocs actifs.

Lors de la création :

1. PostgreSQL recalcule le créneau demandé ;
2. le bloc est inséré dans la même transaction que la réservation ;
3. une collision concurrente déclenche une `exclusion_violation` ;
4. l’API traduit ce conflit en `SLOT_NOT_AVAILABLE` avec HTTP 409.

Chaque soumission possède également une `idempotency_key` UUID. Une nouvelle tentative réseau avec la même clé retourne la réservation existante au lieu d’en créer une seconde.

## Annulation

La confirmation contient un lien `/booking/cancel?token=...`.

- le token aléatoire contient 32 octets ;
- seul son hash SHA-256 est stocké dans PostgreSQL ;
- une annulation trop tardive retourne `CANCELLATION_TOO_LATE` ;
- une annulation réussie passe le booking à `cancelled` ;
- le `schedule_block` devient inactif et le créneau est immédiatement libéré ;
- deux emails d’annulation sont ajoutés à l’outbox ;
- l’événement Google Calendar est supprimé en best-effort.

## Emails Resend

Une réservation crée :

- `booking_customer_confirmation` pour le client ;
- `booking_business_notification` pour l’entreprise.

Une annulation crée :

- `booking_customer_cancellation` pour le client ;
- `booking_business_cancellation` pour l’entreprise.

Les emails affichent le logo MisterClean avec une URL absolue. Ils récapitulent les prestations, la date, le prix, l’adresse et la référence. La confirmation client contient le lien d’annulation.

Configuration actuelle :

- domaine : `bookings.misterclean.com.au` ;
- expéditeur : `booking@bookings.misterclean.com.au` ;
- SPF, DKIM et DMARC configurés ;
- clé Resend limitée à l’envoi.

L’API tente l’envoi immédiatement. En cas d’échec, le job reste dans `email_outbox` avec un backoff exponentiel plafonné à 360 minutes. Le cron Vercel appelle quotidiennement `/api/cron/send-booking-emails` et peut traiter jusqu’à 25 jobs par passage. L’endpoint exige `Authorization: Bearer <CRON_SECRET>`.

Les clés d’idempotence Resend utilisent l’identifiant du job : `booking/<email_outbox.id>`.

Sur une Preview Vercel, les liens et le logo utilisent l’URL de la deployment courante via `VERCEL_URL`. En production, ils utilisent `PUBLIC_SITE_URL`.

## Google Calendar

L’intégration est volontairement best-effort : une erreur Google ne doit pas annuler une réservation valide dans Supabase.

Après une réservation :

1. l’API obtient un access token avec le refresh token OAuth ;
2. elle crée un événement couvrant `starts_at` à `ends_at` ;
3. le titre contient la référence et les prestations ;
4. la description contient le client, le téléphone, l’email, l’adresse, les notes et la référence ;
5. l’identifiant Google est enregistré dans `bookings.google_calendar_event_id`.

Lors d’une annulation, l’événement correspondant est supprimé. Une réponse Google 404 est considérée comme un succès, car l’événement est déjà absent.

Cette intégration est actuellement sortante : les indisponibilités saisies directement dans Google Calendar ne sont pas importées dans Supabase. La source de vérité reste PostgreSQL.

## Administration du cleaner

URL : `/admin`.

L’interface reprend une organisation de type logiciel métier avec une barre latérale pour le Dashboard, le planning et les disponibilités. Elle conserve les couleurs MisterClean et reste responsive sur mobile.

### Connexion

1. l’utilisateur saisit son email ;
2. l’API vérifie qu’il existe et qu’il est actif dans `admin_users` ;
3. la réponse reste volontairement générique pour ne pas révéler les administrateurs autorisés ;
4. un maximum d’un lien toutes les deux minutes par adresse est appliqué ;
5. Supabase Auth génère un token magique à usage unique ;
6. Resend envoie le lien vers `/api/admin/auth/verify` ;
7. après vérification Supabase, un cookie `mc_admin_session` est créé ;
8. le cookie est `HttpOnly`, `Secure`, `SameSite=Lax` et expire avec la session Supabase.

Deux adresses administrateur sont actuellement actives. Les emails ne sont pas documentés dans le dépôt ; ils sont stockés dans `admin_users` et leurs identités existent dans Supabase Auth.

Pour ajouter un administrateur :

1. créer ou confirmer son identité dans Supabase Auth ;
2. insérer son email en minuscules dans `admin_users` avec `is_active = true` ;
3. vérifier la connexion depuis `/admin` ;
4. ne jamais ajouter de liste d’emails autorisés dans le JavaScript public.

Pour révoquer un administrateur, passer `is_active` à `false`. Les appels API suivants seront refusés même si un ancien cookie existe encore.

### Gestion des horaires

L’interface permet :

- d’ouvrir ou fermer chacun des sept jours récurrents ;
- de définir une heure d’ouverture et de fermeture par jour ;
- de fermer entièrement une date future ;
- de remplacer l’horaire normal d’une date par une plage spéciale ;
- de supprimer une exception.

Chaque sauvegarde est validée côté navigateur, côté API avec Zod, puis côté PostgreSQL. Les heures doivent utiliser `HH:MM` et l’ouverture doit précéder la fermeture.

Les modifications n’annulent et ne déplacent jamais les réservations existantes. Celles-ci continuent à bloquer leur période grâce à `schedule_blocks`.

### Vue d’ensemble des rendez-vous

Une fois connecté, le cleaner voit les rendez-vous confirmés en cours ou à venir, regroupés par date et affichés dans le fuseau horaire d’Adelaide. Chaque fiche présente :

- les heures de début et de fin ;
- la ou les prestations et la durée totale ;
- le nom, le téléphone et l’email du client ;
- l’adresse, avec un lien direct vers Google Maps ;
- les notes éventuelles et la référence de réservation.

La liste est rechargée automatiquement toutes les 2 minutes lorsque l’onglet est visible. Elle se met également à jour au retour sur l’onglet et peut être actualisée avec le bouton `Refresh`. Seules les réservations au statut `confirmed` dont l’heure de fin n’est pas passée sont retournées. La route utilise la même session sécurisée que la gestion des horaires et ne transmet aucune donnée de rendez-vous à un utilisateur non authentifié.

La vue calendrier regroupe les mêmes rendez-vous par mois. Les boutons précédent, suivant et `Today` permettent de naviguer, et un clic sur un rendez-vous fait défiler la page jusqu’à sa carte détaillée. Le calendrier est responsive avec défilement horizontal sur petit écran et utilise toujours le fuseau horaire d’Adelaide.

Le bouton `New booking` ouvre un formulaire dans le tableau de bord. L’administrateur peut sélectionner plusieurs prestations, une date et un créneau encore disponible, puis renseigner le client et son adresse. La création utilise la même transaction anti-conflit que le parcours public, envoie les confirmations et tente d’ajouter l’événement Google Calendar. La route de création manuelle exige une session administrateur valide.

Le bouton `Cancel booking` demande une confirmation avant d’appeler la route d’annulation administrateur. L’opération change atomiquement le statut de la réservation, libère son bloc horaire et ajoute deux messages à la file d’envoi : un pour le client et un pour le cleaner. Elle tente ensuite de supprimer l’événement Google Calendar. Contrairement à l’annulation publique, l’annulation par le cleaner n’est pas soumise au délai minimal configuré pour le client. Les emails en échec restent dans l’outbox et seront retentés par le cron.

## API

### Booking public

#### `GET /api/booking/config`

Retourne les prestations actives bookables et les paramètres publics.

#### `GET /api/booking/availability`

Paramètres répétés :

```text
/api/booking/availability?date=2026-09-14&serviceId=<uuid>&quantity=2&serviceId=<uuid>&quantity=1
```

Retourne `{ "slots": [{ "starts_at": "...", "ends_at": "..." }] }`.

#### `POST /api/booking/reservations`

Payload principal :

```json
{
  "services": [
    { "serviceId": "uuid-1", "quantity": 2 },
    { "serviceId": "uuid-2", "quantity": 1 }
  ],
  "startsAt": "2026-09-14T07:00:00+09:30",
  "idempotencyKey": "uuid",
  "customer": {
    "firstName": "Alex",
    "lastName": "Smith",
    "email": "alex@example.com",
    "phone": "0412345678"
  },
  "address": {
    "line1": "1 King William Street",
    "line2": "",
    "suburb": "Adelaide",
    "state": "SA",
    "postcode": "5000"
  },
  "notes": "",
  "website": ""
}
```

`website` est un honeypot anti-spam et doit rester vide.

#### `POST /api/booking/cancel`

```json
{ "token": "token-reçu-par-email" }
```

### Administration

- `POST /api/admin/auth/request` — demande un lien magique ;
- `GET /api/admin/auth/verify?token_hash=...` — vérifie le token et crée le cookie ;
- `GET /api/admin/auth/session` — vérifie la session courante ;
- `POST /api/admin/auth/logout` — supprime le cookie ;
- `GET /api/admin/bookings` — retourne les rendez-vous confirmés en cours ou à venir ;
- `POST /api/admin/bookings` — crée manuellement une réservation après authentification ;
- `POST /api/admin/bookings/cancel` — annule un rendez-vous et déclenche les notifications ;
- `GET /api/admin/customers` — liste des clients avec stats (param `?q=`) ou historique d'un client (param `?email=`) ;
- `PATCH /api/admin/customers` — crée ou met à jour les notes internes d'un client ;
- `GET /api/admin/availability` — retourne horaires et exceptions ;
- `PUT /api/admin/availability` — remplace la semaine ;
- `POST /api/admin/availability` — crée ou remplace une exception ;
- `DELETE /api/admin/availability?date=YYYY-MM-DD` — supprime une exception.

Toutes les routes d’administration exigent une session valide et une adresse encore active dans `admin_users`.

Les handlers Vercel exportent un objet `default` avec une méthode `fetch(request)`.

## Variables d’environnement

Voir `.env.example`.

Variables obligatoires :

| Variable | Usage |
|---|---|
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | accès serveur privilégié ; ne jamais exposer au navigateur |
| `RESEND_API_KEY` | envoi des emails transactionnels et liens admin |
| `RESEND_FROM` | expéditeur complet Resend |
| `BUSINESS_EMAIL` | destinataire des notifications entreprise |
| `PUBLIC_SITE_URL` | URL publique utilisée hors Preview |
| `CRON_SECRET` | protection du cron email |

Variables Google Calendar optionnelles :

| Variable | Usage |
|---|---|
| `GOOGLE_CLIENT_ID` | client OAuth Google |
| `GOOGLE_CLIENT_SECRET` | secret OAuth Google |
| `GOOGLE_REFRESH_TOKEN` | renouvellement des access tokens |
| `GOOGLE_CALENDAR_ID` | calendrier cible, `primary` par défaut |

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `GOOGLE_REFRESH_TOKEN` doivent être présents ensemble pour activer l’intégration.

`.env.local` est ignoré par Git. Ne jamais afficher, copier, journaliser ou committer son contenu. Les variables nécessaires doivent être configurées séparément dans Vercel pour Preview et Production.

## Installation et vérifications locales

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm run build` recrée entièrement `dist/` avec les fichiers statiques publics. Le dossier `dist/` n’est pas une source à modifier manuellement.

Le champ `allowScripts` de `package.json` autorise explicitement le script d’installation d’`esbuild@0.28.2`, dépendance indirecte de Vitest/Vite. Cette autorisation est volontairement liée à la version verrouillée afin que npm puisse préparer son binaire sans autoriser globalement les scripts des dépendances. Après une mise à jour d’`esbuild`, examiner le nouveau script avant d’actualiser cette entrée.

État actuel de la suite standard :

- `tests/http.test.ts` : 2 tests ;
- `tests/booking-email.test.ts` : 5 tests ;
- `tests/booking-validation.test.ts` : 10 tests ;
- `tests/admin-bookings.test.ts` : 3 tests ;
- total : 20 tests.

Le test SQL `supabase/tests/booking_concurrency.sql` vérifie la contrainte d’exclusion, mais nécessite un environnement Supabase/PostgreSQL local.

`tests/live-booking-e2e.ts` est protégé par `LIVE_E2E=1`. Il crée une réservation réelle, envoie un email, puis annule immédiatement la réservation. Ne jamais l’exécuter par défaut.

## Déploiement

Projet Vercel lié : `thibault-clean5010/mister-clean-particulier`.

Déployer une Preview :

```sh
npx vercel@latest deploy --yes
```

Dernière Preview créée lors de cette mise à jour :

```text
https://mister-clean-particulier-1m8y1mqvn-thibault-clean5010.vercel.app
```

Version actuellement deployee en production :

```text
https://www.misterclean.com.au
```

Cette URL peut être remplacée par une Preview ultérieure. La protection SSO des Previews a été désactivée pour permettre les tests externes des liens d’annulation et de connexion admin. Réévaluer ce choix avant une utilisation durable.

Ne jamais lancer `vercel deploy --prod`, promouvoir une Preview ou modifier le domaine de production sans validation explicite du propriétaire du projet.

Après un déploiement, vérifier au minimum :

- `/` ;
- `/booking` ;
- `/admin` ;
- `/api/booking/config` ;
- une disponibilité avec une puis deux prestations ;
- HTTP 401 sur `/api/admin/availability` sans cookie ;
- HTTP 401 sur `/api/admin/bookings` sans cookie ;
- HTTP 401 sur `/api/admin/bookings/cancel` sans cookie ;
- chargement des nouvelles images publiques.

Ne pas créer de réservation réelle pour un simple smoke test.

## Exploitation courante

### Modifier les disponibilités

1. ouvrir `/admin` ;
2. saisir une adresse présente dans `admin_users` ;
3. ouvrir le lien reçu par email ;
4. modifier la semaine ou ajouter une exception ;
5. contrôler ensuite une date dans `/booking`.

### Annuler un rendez-vous en tant que cleaner

1. ouvrir `/admin` et se connecter ;
2. repérer le rendez-vous dans `Upcoming appointments` ;
3. cliquer sur `Cancel booking` ;
4. vérifier la référence dans la boîte de confirmation puis valider ;
5. la carte disparaît du planning et les deux emails d’annulation sont ajoutés à l’outbox.

### Bloquer manuellement une période en base

Pour une indisponibilité qui ne passe pas par les exceptions journalières, créer un `schedule_blocks` actif avec :

- `kind = 'unavailability'` ;
- `service_starts_at` et `service_ends_at` ;
- `occupied_starts_at` et `occupied_ends_at` ;
- une raison explicite.

Une désactivation avec `active = false` libère la période.

### Avant un remplacement complet de Zenbooker

Importer tous les rendez-vous futurs existants dans `schedule_blocks`. Sans cet import, Supabase ne peut pas connaître les occupations provenant de l’ancien système.

## Mini-CRM clients

La vue `Customers` est intégrée à `/admin` (section `#customers` dans la barre latérale).

Fonctionnalités disponibles :

- ajout manuel d'un contact (prospects, clients directs sans réservation en ligne) via le bouton « New contact » ;
- recherche instantanée par nom, téléphone ou email (debounce 320 ms) ;
- liste paginée à 100 entrées avec nombre de réservations, dernière prestation et prochain rendez-vous ;
- boutons d'appel direct et d'email depuis chaque ligne ;
- fiche client en dialog avec l'historique complet de toutes les réservations (statut, prix, adresse) ;
- notes internes par client, stockées dans la table `customers` et éditables sans recharger la page.

La table `customers` est indexée sur l'email normalisé. Elle ne contient que les notes ; les statistiques et l'historique sont calculés à la volée via les fonctions PostgreSQL `search_customers()` et `get_customer_bookings()` (migration `011`). Les nouvelles réservations y apparaissent automatiquement sans modification du parcours de réservation.

### API

- `GET /api/admin/customers` — liste des clients avec stats agrégées (param `?q=` pour la recherche) ;
- `GET /api/admin/customers?email=...` — historique de réservation d'un client + notes ;
- `PATCH /api/admin/customers` — crée ou met à jour les notes internes d'un client.

Toutes ces routes exigent une session administrateur valide.

### Migration

`011_customers.sql` — table `customers`, fonctions `search_customers` et `get_customer_bookings`.

Les dernieres mises a jour deja realisees incluent le favicon MisterClean sur les interfaces, la navigation Admin corrigee avec un defilement adapte aux en-tetes fixes sur ordinateur et mobile, ainsi que le centrage des pictogrammes `Today` et `Upcoming`.

## Limites connues

Le projet ne gère pas encore :

- paiement en ligne ;
- compte client ;
- SMS ;
- plusieurs cleaners ou ressources parallèles ;
- temps de déplacement entre clients ;
- géocodage ou contrôle strict du rayon de service ;
- import des événements occupés depuis Google Calendar ;
- plusieurs plages horaires séparées pour un même jour dans l’interface admin.

La plage horaire spéciale d’une date remplace entièrement l’horaire hebdomadaire de cette date.

## Règles de sécurité et de maintenance

- Supabase reste la source de vérité ; Google Calendar ne remplace pas les contraintes PostgreSQL.
- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` ou les secrets Google.
- Ne jamais autoriser un administrateur uniquement dans le JavaScript public.
- Toute adresse admin doit exister à la fois dans Supabase Auth et dans `admin_users`.
- Toujours ajouter une migration ; ne pas modifier uniquement la base via le dashboard.
- Toujours exécuter typecheck, tests et build après une modification.
- Préserver les changements non liés déjà présents dans le worktree.
- Ne jamais déployer en production sans confirmation explicite.

## Prompt de reprise pour une autre IA

> Tu reprends le projet MisterClean dans `C:\Users\pldub\Desktop\Thibault`. Lis entièrement `README.md`, puis inspecte le code avant toute modification. Le frontend est statique ; le booking se trouve dans `booking/`, l’administration dans `admin/`, les fonctions Vercel dans `api/` et la logique serveur dans `lib/server/`. Supabase/PostgreSQL est la source de vérité. Le système gère réservation multi-prestations, durée et prix cumulés, anti-conflit GiST, idempotence, annulation, Resend, Google Calendar best-effort, horaires hebdomadaires, exceptions datées et authentification admin par lien magique. Ne révèle jamais les secrets de `.env.local`. Vérifie l’état Git avant d’écrire, utilise des migrations pour la base, puis lance `npm run typecheck`, `npm test` et `npm run build`. Ne lance jamais le test live ou un déploiement production sans autorisation explicite.
