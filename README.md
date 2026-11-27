# FreelanceDesk

FreelanceDesk permet à un freelance de gérer ses clients, ses projets et ses factures dans un espace personnel. Le tableau de bord présente les projets en cours, les montants encaissés et à encaisser, ainsi que les factures en retard.

La page **Finances** (`/finances`) analyse les données du compte connecté. Elle présente le chiffre d’affaires facturé et encaissé, les factures à encaisser ou en retard, le délai et le panier moyens, le taux de paiement et le nombre de factures encaissées.

L’application utilise Next.js App Router, React, TypeScript, Tailwind CSS, Lucide React, Recharts, Firebase Authentication et Cloud Firestore. Git suit les sources et le fichier de verrouillage npm.

## Collaboration par client

Dans **Clients**, utilise **Partager** sur un client que tu possèdes et saisis l’adresse d’un compte FreelanceDesk existant. La fiche client permet de modifier ou de révoquer l’accès dans **Gestion des accès**.

| Accès | Actions |
|---|---|
| **Propriétaire** | Gérer le client, les projets, les factures et les accès |
| **Lecture seule** (`read`) | Consulter le client, ses projets et ses factures |
| **Modification** (`edit`) | Consulter le client et ses projets, créer et modifier les factures du client |

Les clients reçus figurent dans **Clients partagés avec moi**. Les listes de projets et factures indiquent les accès. Les deux tableaux de bord et l’import CSV utilisent les données personnelles. Les écritures collaboratives alimentent les indicateurs du propriétaire de la facture.

## Tableau de bord financier

- Le filtre couvre **3, 6 ou 12 mois calendaires**, mois en cours compris, dans le fuseau `Europe/Paris`. La période par défaut est de 6 mois.
- Recharts affiche les montants facturés et encaissés par mois, la répartition des factures émises par statut, les cinq premiers clients par encaissements et le délai moyen mensuel. Les graphiques mensuels donnent aussi accès aux valeurs sous forme de tableau.
- Les cartes « Montant en attente de paiement » et « Montant en retard », ainsi que le tableau des retards, décrivent la situation actuelle. La carte « Encaissé le mois précédent » affiche le total du dernier mois calendaire terminé, indépendamment du filtre choisi.
- Les factures payées sans date exploitable contribuent au total encaissé toutes périodes. Elles sont exclues des calculs qui utilisent la date d’encaissement et sont signalées dans « Qualité des données de paiement ». Ouvre leur fiche et utilise **Modifier** pour compléter la date réelle.

## Installation et lancement

Node.js 24 et npm sont requis. Depuis la racine du projet, installe les dépendances avec `npm ci` et prépare la configuration à partir de `.env.example` si `.env.local` est absent.

```sh
npm ci
cp -n .env.example .env.local
npm run dev
```

L’application de développement est disponible à l’adresse `http://localhost:3000`. Pour lancer localement la version de production, utilise `npm run build`, puis `npm start`. Le build utilise webpack. Le serveur de développement utilise Turbopack par défaut.

### Variables d’environnement

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Clé API de l’application Web Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Domaine Auth de l’application Web |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Identifiant du projet Firebase |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket fourni par la configuration Web, facultatif pour FreelanceDesk |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Identifiant d’expéditeur de la configuration Web, facultatif pour FreelanceDesk |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Identifiant de l’application Web |
| `FIREBASE_PROJECT_ID` | Identifiant du projet côté serveur, identique à celui du SDK Web |
| `GOOGLE_APPLICATION_CREDENTIALS` | Si nécessaire, chemin absolu vers les identifiants Admin stockés hors dépôt |

Les variables `NEXT_PUBLIC_` sont incorporées au code livré au navigateur. Le projet charge les identifiants Admin uniquement côté serveur, via les identifiants applicatifs par défaut de Google (ADC). Sur un hébergement Google Cloud, privilégie l’identité du service d’exécution. En local, si tu utilises un fichier de clé d’un compte de service créé dans **Google Cloud → IAM et administration → Comptes de service**, garde le fichier hors du dépôt et indique son chemin absolu dans `.env.local`. [Configuration de l’Admin SDK](https://firebase.google.com/docs/admin/setup)

Pour l’identité serveur, le rôle `roles/datastore.user` couvre les lectures et écritures Firestore. Le rôle `roles/firebaseauth.viewer` couvre la lecture des comptes Firebase Authentication lors de la vérification de la révocation des jetons. Les comptes qui lancent le déploiement des règles peuvent utiliser des droits distincts. [Rôles Firestore](https://firebase.google.com/docs/firestore/security/iam) · [Rôles Firebase Authentication](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth)

### Configuration dans Firebase

1. Ouvre le projet Firebase existant. Dans les paramètres du projet, récupère les valeurs de l’application Web pour `.env.local`.
2. Dans **Authentication → Mode de connexion**, active **E-mail/Mot de passe** et **Google** si nécessaire. Pour Google, renseigne l’adresse e-mail d’assistance demandée par la console.
3. Dans **Authentication → Paramètres → Domaines autorisés**, vérifie le domaine utilisé pour tes essais et ton futur domaine de production. Si tu choisis de tester Google sur le projet Firebase depuis la même machine, vérifie que `localhost` est autorisé.
4. Dans **Firestore Database**, vérifie que la base par défaut existe en mode natif. Si elle doit être créée, utilise des règles fermées jusqu’au déploiement de celles du projet.
5. Configure les identifiants Admin du serveur, déploie les règles selon la procédure ci-dessous, puis relance Next.js après toute modification de `.env.local`.

Le bouton Google ouvre la fenêtre de connexion Firebase. Firebase Authentication gère aussi l’envoi et le traitement des liens de réinitialisation. L’inscription par e-mail ne requiert aucune validation d’adresse. [Connexion Google](https://firebase.google.com/docs/auth/web/google-signin) · [Domaines autorisés](https://firebase.google.com/docs/auth/faq-and-troubleshooting) · [Démarrage avec Firestore](https://firebase.google.com/docs/firestore/quickstart)

### Connexion Google sur Vercel et Safari

Le bouton Google ouvre une fenêtre depuis le clic, y compris sur iPhone. Pour que Safari puisse accéder aux pages d’authentification sur le même domaine que l’application, configure le proxy Firebase en production. [Bonnes pratiques Firebase, option 3](https://firebase.google.com/docs/auth/web/redirect-best-practices) · [Rewrites Vercel](https://vercel.com/docs/routing/rewrites)

1. Dans **Firebase Authentication → Paramètres → Domaines autorisés**, vérifie que `freelancedesk-xi.vercel.app` est autorisé.
2. Dans Google Cloud, ouvre le client OAuth Web utilisé par le fournisseur Google de Firebase. Ajoute `https://freelancedesk-xi.vercel.app/__/auth/handler` aux URI de redirection autorisés et conserve l’URI Firebase existante.
3. Dans **Vercel → Settings → Environment Variables**, définis `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=freelancedesk-xi.vercel.app` pour l’environnement **Production**, puis déploie cette version. Le fichier `next.config.ts` relaie `/__/auth/*` vers le domaine Firebase Hosting du projet. En local et sur les autres environnements, utilise le domaine d’authentification correspondant à l’origine de test.
4. Sur iPhone, ouvre l’adresse Vercel dans Safari et teste le bouton Google, puis recharge le tableau de bord pour vérifier la restauration de la session.

### Déploiement des règles et des index

Depuis la racine du dépôt, avec la CLI Firebase connectée et un compte autorisé, utilise l’identifiant du projet concerné. Remplace `TON_ID_PROJET` par sa valeur réelle.

Si la commande `firebase` est absente, tu peux utiliser `npx firebase-tools@15.37.0` à sa place.

```sh
firebase login
firebase deploy --only firestore:indexes --project TON_ID_PROJET
firebase deploy --only firestore:rules --project TON_ID_PROJET
```

Attends l’activation de l’index de groupe avant de publier le code Vercel. Configure le même projet Firebase pour le SDK Web et l’Admin SDK. L’identité serveur doit pouvoir lire les comptes Auth par UID et par adresse. Les étapes spécifiques au projet et le retour arrière sont détaillés dans la migration. [Migration Firestore du partage](docs/migrations/003_add_client_shares.md) · [Déploiement des règles](https://firebase.google.com/docs/rules/manage-deploy) · [Gestion des index](https://firebase.google.com/docs/firestore/query-data/indexing)

## Modèle de données

Les identifiants des documents sont natifs. Les clients, projets et factures possèdent un `userId` égal à l’UID Firebase Authentication du propriétaire.

| Collection | Champs métier | Champ technique |
|---|---|---|
| `clients` | `userId`, `name`, `email` et `city` facultatifs | `projectCount`, `sharingUpdatedAt` facultatif |
| `projects` | `userId`, `client_id`, `title`, `status`, `daily_rate`, `start_date` | `invoiceCount` |
| `invoices` | `userId`, `project_id`, `number`, `amount`, `issued_on`, `due_on`, `status`, `paid_on` facultatif | |
| `client_shares/{clientId}/client_share_members` | `clientId`, `ownerId`, `sharedUserId`, `permission`, coordonnées et horodatages | Identifiant natif égal à l’UID de l’associé |
| `client_share_rate_limits` | | Compteur horaire des recherches par propriétaire |
| `invoiceNumberReservations` | | Réservation de numéro par propriétaire |

[Schéma Mermaid et emplacement des documents](docs/bonus/schema-donnees.md) · [Schéma PlantUML](docs/bonus/schema-donnees.puml)

Les dates sont des chaînes de calendrier `AAAA-MM-JJ` en base et s’affichent en `JJ/MM/AAAA`. Les jours de retard se calculent à partir de la date civile en `Europe/Paris`. Une facture est en retard uniquement si son statut vaut `sent` et si son échéance est strictement antérieure à cette date.

`paid_on` enregistre la date réelle de paiement. La date du jour à Paris est enregistrée par défaut lors de la saisie manuelle d’un nouveau paiement. La date peut être corrigée depuis la facture et doit être égale ou postérieure à sa date d’émission. L’évolution est détaillée dans [la note de migration Firestore](docs/migrations/002_add_paid_on.md).

Le CSV conserve les colonnes obligatoires `project_title,number,amount,issued_on,due_on,status`. La colonne facultative `paid_on` accepte une date `AAAA-MM-JJ` pour une facture payée. Les fichiers à six colonnes restent compatibles. À l’import, une facture payée dont la date est vide ou absente conserve une date inconnue.

| Donnée | Statuts et libellés |
|---|---|
| Projet | `prospect` Prospect, `active` En cours, `done` Terminé, `cancelled` Annulé |
| Facture | `draft` Brouillon, `sent` Envoyée, `paid` Payée, `cancelled` Annulée |

Le nom du client, le titre du projet et le numéro de facture sont obligatoires. Une adresse e-mail de client renseignée doit être valide. Tarifs et montants sont strictement positifs. L’échéance est égale ou postérieure à l’émission. Les références doivent viser un parent du même propriétaire. La suppression d’un parent exige qu’il n’ait plus de dépendances directes. Chaque suppression est confirmée dans l’interface.

### Sécurité des lectures et des écritures

- Les requêtes Firestore personnelles filtrent par UID. Chaque lecture collaborative remonte au client autorisé à partir du projet. La découverte des partages filtre par UID de l’associé et les requêtes métier ciblent un client ou projet précis avec son propriétaire. Firestore refuse toute écriture directe depuis le navigateur.
- L’API vérifie le jeton et la révocation Firebase Auth. Les mutations autorisent les champs métier attendus et résolvent les propriétaires depuis les documents Firestore. L’API de partage contrôle la propriété avant chaque recherche Auth et limite les recherches par propriétaire. Les accès directs sont soumis aux règles Firestore et affichent le même message pour une ressource absente ou inaccessible.
- Les écritures utilisent des transactions. Un changement de parent met à jour ses deux compteurs avec l’enfant. Une suppression et l’ajout d’un enfant lisent ou écrivent le même parent, empêchant les données orphelines lors de requêtes simultanées.
- La réservation utilise le véritable propriétaire du projet et du client, y compris quand un associé crée la facture. Une création ou renumérotation tient compte des numéros utilisés par les anciennes factures. La transaction transfère la réservation lors d’une renumérotation et la libère lors d’une suppression. Les espaces aux extrémités sont retirés et la casse est conservée.
- Le changement de droit et la révocation prennent effet sur les nouvelles opérations. Les écritures collaboratives relisent le partage dans la transaction. L’interface se désabonne des données révoquées et retire leurs fiches et formulaires. Les données que l’associé avait copiées restent sous son contrôle.
- Le SDK Admin contourne les règles Firestore. Réserve ses identifiants à l’application serveur. Si des documents métier existent déjà, vérifie leurs propriétaires, références, dates et doublons, puis initialise les compteurs et les réservations avant d’autoriser les écritures de l’application.

Les listes chargent les documents personnels et les périmètres associés en temps réel. Les clients partagés ouvrent une requête de projets par client et une requête de factures par projet. Cette approche vise le volume de données du TP. [Règles et requêtes Firestore](https://firebase.google.com/docs/firestore/security/rules-query) · [Isolation des transactions](https://firebase.google.com/docs/firestore/transaction-data-contention)

## Tests

```sh
npm run lint
npm run typecheck
npm run build
npm test
firebase emulators:exec --project demo-freelancedesk --only auth,firestore "npm run test:emulator"
```

Le test navigateur facultatif nécessite Playwright et ses navigateurs. Installe Playwright dans un répertoire de test dédié, puis lance la recette depuis la racine du projet. Le scénario construit et lance une version optimisée pour les émulateurs.

```sh
npm install --prefix /tmp/freelancedesk-playwright playwright@1.65.1
/tmp/freelancedesk-playwright/node_modules/.bin/playwright install chromium webkit
NODE_PATH=/tmp/freelancedesk-playwright/node_modules \
  firebase emulators:exec --project demo-freelancedesk --only auth,firestore "node tests/client-sharing.browser.cjs"
```

La suite Firebase requiert la CLI Firebase et un JDK 21. Elle démarre un serveur Next.js de test sur le port 3100 et utilise les émulateurs locaux sur 9099 et 8080. Le projet de démonstration ne requiert aucun identifiant Admin réel. [Configuration des émulateurs Firebase](https://firebase.google.com/docs/emulator-suite/install_and_configure)

Les tests incluent les périodes, les calculs financiers de référence, la compatibilité des anciennes factures et les transitions de `paid_on`. Les scénarios Firebase couvrent aussi l’isolation entre comptes et les transactions concurrentes. Les résultats du TP 6 figurent dans [le compte rendu de validation](docs/TP6-validation.md).

La recette à trois comptes et les résultats détaillés du TP bonus sont disponibles dans le dossier de livraison. [Comptes de test](docs/bonus/comptes-de-test.md) · [Tableau des tests](docs/bonus/tableau-tests.md) · [Retour d’expérience](docs/bonus/retour-experience.md)

La vérification du lien de réinitialisation et la recette sur le projet Firebase cible figurent dans [la checklist de recette](docs/TESTS.md).

### Recalculer les encaissements du mois précédent

Depuis la racine du projet, utilise un compte Firebase Authentication avec connexion par e-mail et mot de passe. Le script demande le mot de passe en saisie masquée et lit uniquement les factures de ce compte. Compare le total obtenu à la carte **Encaissé le mois précédent** de la page Finances, en utilisant le même compte et le même projet Firebase.

```sh
node --env-file=.env.local scripts/verify-financial-dashboard.ts compte@example.test
```

Pour un compte créé sur les émulateurs, exécute cette commande pendant que les services Auth et Firestore locaux sont actifs.

```sh
env FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  npm run verify:finances -- --emulator compte@example.test
```

Le script utilise le SDK Web et les règles Firestore du compte. Il affiche le mois analysé, les numéros et montants des factures retenues, leur nombre et le total en euros. Il fonctionne sans identifiants Admin.

## Différences avec le TP Supabase

| Supabase et PostgreSQL | FreelanceDesk avec Firebase |
|---|---|
| Supabase Auth | Firebase Authentication pour l’identité et les jetons |
| Tables et clés primaires | Collections et identifiants natifs Firestore |
| RLS sur les lignes | Règles Firestore sur les lectures du client et contrôle d’identité dans l’API serveur |
| Contraintes SQL `CHECK`, clés étrangères et `UNIQUE` | Validations serveur, compteurs et réservations dans des transactions |
| Jointures SQL | Rapprochement des documents du compte à partir des identifiants client et projet |
