# Migration Firestore 003 — Partage des clients

## Objectif et rétrocompatibilité

Le propriétaire peut partager un client avec un compte Firebase Authentication existant. Le partage donne accès au client, à ses projets et à leurs factures à partir des documents originaux. Les clients existants restent privés jusqu’au premier partage. Aucun backfill des clients, projets ou factures n’est requis.

Avant cette évolution, `clients`, `projects` et `invoices` étaient lus uniquement par leur propriétaire. Le champ `userId` désigne toujours ce propriétaire. Les projets référencent `clients` via `client_id`. Les factures référencent `projects` via `project_id`. Les transactions maintiennent `projectCount`, `invoiceCount` et `invoiceNumberReservations`. Les factures payées antérieures à l’introduction de `paid_on` restent compatibles.

## Documents introduits

Une autorisation est stockée à `client_shares/{clientId}/client_share_members/{sharedUserId}`. Le document parent du chemin est implicite. L’identifiant natif du document est l’UID de l’associé. Le chemin entier identifie de manière déterministe le couple client et associé.

| Champ | Type | Rôle |
|---|---|---|
| `clientId` | string | Client auquel s’applique le partage |
| `ownerId` | string | UID du véritable propriétaire |
| `sharedUserId` | string | UID Firebase Auth du destinataire |
| `ownerEmail` | string | Adresse du propriétaire affichée à l’associé |
| `sharedUserEmail` | string | Adresse de l’associé affichée au propriétaire |
| `permission` | string | `read` ou `edit` |
| `createdAt`, `updatedAt` | timestamp | Horodatages générés par Firestore |

Un client peut avoir plusieurs associés. Un associé peut recevoir plusieurs clients. Les adresses correspondent aux coordonnées saisies dans Firebase Auth au moment du partage. Un propriétaire peut révoquer puis recréer le partage après un changement d’adresse. L’accès suit l’UID du compte.

Le premier partage renseigne `clients.sharingUpdatedAt`. Les créations suivantes actualisent ce champ afin de sérialiser le partage et la suppression du client. Un client sans projet et ses autorisations sont supprimés dans la même transaction. Le document serveur `client_share_rate_limits/{ownerId}` conserve la fenêtre horaire de recherche par propriétaire avec `startedAt` en millisecondes Unix et `attempts`. La recherche d’adresse n’est disponible que pour un propriétaire identifié, dans la limite de 20 recherches par heure, tous ses clients confondus.

## Règles et index

- Les lectures personnelles continuent de filtrer sur `userId`. Un associé lit le client par identifiant, ses projets par `userId` et `client_id`, et ses factures par `userId` et `project_id`. Pour un associé, les règles remontent les relations et vérifient que le client existe, que les propriétaires concordent et que le partage est actif.
- L’associé écoute le groupe `client_share_members` filtré sur son `sharedUserId`. Le propriétaire écoute la sous-collection du client qu’il possède. L’index simple de portée **Collection group** sur `sharedUserId` est déclaré dans `firestore.indexes.json`. Les doubles contraintes d’égalité des requêtes métier utilisent la fusion des index simples Firestore. [Règles et requêtes Firestore](https://firebase.google.com/docs/firestore/security/rules-query) · [Gestion des index](https://firebase.google.com/docs/firestore/query-data/index-overview)
- Les écritures passent par les routes Next.js authentifiées. Les règles refusent toute écriture Web directe, ainsi que les lectures des quotas et réservations. Les routes de partage revérifient la propriété. Une transaction de facturation lit l’autorisation du client et la chaîne facture → projet → client. La révocation ou le passage en lecture seule empêche les écritures ultérieures.
- Le rôle `edit` permet la création et la modification de factures dans le client partagé. Il permet un déplacement entre projets de ce même client. Les suppressions et la gestion des clients, projets et accès restent réservées au propriétaire.
- La réservation du numéro utilise l’UID issu des relations et le numéro normalisé. Une recherche filtrée protège aussi les anciens numéros dépourvus de réservation. Une modification complète crée une réservation manquante si le numéro est disponible. L’import CSV et les deux tableaux de bord utilisent les données personnelles.

## Déploiement autorisé

Depuis la racine, avec un compte CLI autorisé sur le projet existant, lance les commandes suivantes après validation. Conserve les éventuels index de production qui servent à d’autres requêtes si la CLI propose de les supprimer. Attends que l’index soit actif dans **Firestore Database → Index** avant de publier la version Vercel. L’identité d’exécution Admin doit avoir les droits de lecture Firebase Auth et de lecture/écriture Firestore décrits dans le README.

```sh
firebase login
firebase deploy --only firestore:indexes --project freelancedesk-c98d2
firebase deploy --only firestore:rules --project freelancedesk-c98d2
```

Vérifie ensuite les trois comptes, la visibilité en lecture et modification, la révocation sur une page ouverte et le tableau Finances. La mise à jour de l’application Vercel dépend du dépôt et de la branche de production configurés sur Vercel. [Procédure de recette](../bonus/comptes-de-test.md)

## Retour arrière

Pour suspendre les accès collaboratifs, replie Vercel vers le déploiement précédent pour interrompre les écritures, puis restaure les règles Firestore précédentes pour retirer les lectures collaboratives. Les documents métier, factures créées en collaboration et réservations restent sur les comptes propriétaires et sont lisibles par ceux-ci. Les autorisations restent stockées et redeviendront actives si les règles collaboratives sont rétablies. Avant de réactiver la fonctionnalité, le propriétaire peut réexaminer les décisions de révocation et l’équipe peut vérifier les accès stockés, y compris pour les clients supprimés pendant le retour arrière. L’index de groupe peut rester déployé.
