# TP 6 · Validation du tableau de bord financier

## Fonctionnalités

- Page privée Finances avec filtres de 3, 6 et 12 mois calendaires. La période par défaut est de 6 mois.
- Saisie et correction de la date réelle de paiement depuis la fiche facture, enregistrement automatique lors du passage à « Payée » et import CSV avec date facultative.
- Quatre graphiques Recharts, classement des cinq clients les plus importants par encaissements et tableau des factures en retard avec liens vers les fiches.
- Signalement des factures payées sans date exploitable et accès aux factures à compléter.

## Calcul des indicateurs

Le mois en cours est inclus. Les bornes vont du premier jour du premier mois inclus au premier jour du mois suivant exclu. Le jour courant est celui de Paris. Chaque montant en euros est converti en centimes, avec arrondi au centime le plus proche et demi-centime arrondi au centime supérieur. Les totaux sont calculés sur ces centimes.

| Indicateur | Règle de calcul |
|---|---|
| Chiffre d’affaires encaissé | Somme des factures `paid` dont la date de paiement valide appartient à la période |
| Chiffre d’affaires facturé | Somme des factures `sent` et `paid` émises pendant la période |
| Montant en attente | Somme de toutes les factures `sent`, retards inclus |
| Montant et nombre de factures en retard | Factures `sent` dont l’échéance est strictement antérieure au jour courant. Les jours de retard sont la différence entre le jour courant et l’échéance. |
| Délai moyen de paiement | Somme des jours entre émission et paiement, divisée par le nombre de factures encaissées pendant la période. Le graphique mensuel applique cette formule à chaque mois de paiement. |
| Taux de paiement | Nombre de factures `paid` émises sur la période ÷ nombre de factures `sent` ou `paid` émises sur la période × 100 |
| Panier moyen | Chiffre d’affaires encaissé sur la période ÷ nombre de factures encaissées, arrondi au centime |
| Nombre de factures encaissées | Nombre de factures `paid` avec date de paiement valide dans la période |
| Encaissé le mois précédent | Encaissements datés pendant le dernier mois calendaire terminé |
| Total encaissé | Somme de toutes les factures `paid`, dates inconnues incluses |
| Données à compléter | Factures `paid` dont la date de paiement est manquante ou invalide, toutes périodes |
| Répartition des statuts | Effectif par statut actuel des factures émises sur la période, rapporté au nombre total de factures émises sur cette période |
| Top 5 des clients | Somme des encaissements datés pour chaque client, via les projets du compte, triée par montant décroissant |

Quand un dénominateur est nul, le taux ou la moyenne s’affiche « Non disponible ». Les montants agrégés et les compteurs valent zéro sur un compte vide. Un mois sans encaissement affiche un montant de zéro et un délai moyen indisponible. En cas de relation facture–projet–client manquante, le montant est inclus dans le chiffre d’affaires et omis du classement.

## Tests exécutés

| Vérification | Résultat |
|---|---|
| `npm test` | 6 tests réussis. Calculs de référence, arrondis, changements de mois et d’année à Paris, périodes, mois sans activité et dates historiques. |
| `npm run test:emulator` | 10 scénarios réussis. Cycle de `paid_on`, dates rejetées, compatibilité CSV, transactions, unicité et contrôle d’accès. |
| Compte vide dans Chrome et WebKit, profil iPhone 13 | Montants à 0,00 €, compteurs à zéro et taux et moyennes indisponibles. Les quatre graphiques, le classement et les retards affichent leurs états vides. Aucune exception JavaScript et aucune valeur `NaN` ou `Infinity` dans l’interface. |
| Deux comptes dans Chrome et WebKit, profil iPhone 13 | Encaissements et classements propres à chaque compte. Les montants de 100,31 € et de 999,00 € restent séparés après déconnexion et changement de compte. Accès anonyme redirigé vers la connexion. |
| Graphiques et navigation | Filtres 3, 6 et 12 mois, lecture des valeurs mensuelles, infobulle au survol dans Chrome et au toucher dans WebKit, absence de débordement horizontal sur les écrans testés. |
| Édition et import avec `paid_on` dans Chrome | Correction de la date d’une facture historique, refus d’une date antérieure à l’émission, réinitialisation puis nouveau paiement par statut. Le CSV à sept colonnes a importé deux lignes sur quatre et affiché le résultat de chaque ligne. |
| Parcours métier précédents dans Chrome | Inscription, gestion des clients, projets et factures, recherches, tris, retards, tableau de bord général, persistance et protection des liens directs, avec contrôles de largeur sur mobile, tablette et ordinateur. |
| Fichiers CSV du TP 3 dans Chrome | 12 lignes sur 12 importées pour le fichier correct. 4 lignes sur 8 importées pour le fichier piégé. Un doublon créé après la prévisualisation a été refusé et l’autre ligne a été importée. Le second compte a obtenu zéro import pour les projets du premier. |
| Connexion dans Chrome et WebKit, profil iPhone | Parcours e-mail, fenêtre Google de l’émulateur, message en cas de blocage et restauration de la session après rechargement. |
| Pied de page dans Chrome et WebKit, profil iPhone | Un seul pied de page « FreelanceDesk — v1.1 », en bas du contenu, sur l’authentification, la page introuvable, le tableau de bord et les listes métier. Sa présence a aussi été vérifiée sur Finances lors de la recette de la nouvelle page. |
| Lint et compilation TypeScript | `npm run lint` et `npm run typecheck` terminés avec succès. |
| Build de production | `npm run build` terminé avec succès. Next.js génère la route `/finances`. |

La recette navigateur a relevé une requête de favicon en 404 dans Chrome et deux signalements réseau du canal d’écoute Firestore local pendant le changement de compte dans WebKit. Les écrans se sont chargés et les données du second compte ont été actualisées après reconnexion. Le test historique du téléchargement a été adapté pour vérifier la nouvelle colonne facultative `paid_on`. Les deux fichiers historiques conservent leurs six colonnes.

## Vérification indépendante du mois précédent

Vérification exécutée le **27/11/2026** sur le projet local `demo-freelancedesk`. Le navigateur et le script étaient connectés au même compte de test. La carte Finances et le script ont tous deux affiché **100,31 € pour octobre 2026**, pour deux factures.

| Facture de test | Montant |
|---|---:|
| `ALPHA-PREV-01` | 100,11 € |
| `ALPHA-PREV-02` | 0,20 € |
| Total affiché par Finances | **100,31 €** |
| Total affiché par le script | **100,31 €** |

Une facture payée sans date, une facture payée hors période et une facture de 999,00 € liée au second compte n’entrent pas dans ce résultat. Le script est exécuté avec le SDK Web et l’authentification du compte de test, en lecture seule. Les commandes figurent dans le [README](../README.md#recalculer-les-encaissements-du-mois-précédent).

## Commandes de publication

À utiliser sur la branche de travail après autorisation de publication et après vérification de l’état des changements. La liste explicite des fichiers limite la préparation du commit au TP 6. La fusion en avance rapide et le push standard préservent l’historique distant.

```sh
git fetch origin &&
git merge --ff-only origin/main &&
git diff --cached --quiet &&
git add -- README.md 'app/(private)/finances/page.tsx' \
  components/workspace/detail.tsx components/workspace/finances.tsx \
  components/workspace/financial-charts.tsx components/workspace/invoice-import.tsx \
  components/workspace/resources.tsx components/workspace/shell.tsx \
  docs/TP6-validation.md docs/migrations/002_add_paid_on.md \
  lib/domain/finance.ts lib/domain/format.ts lib/domain/invoice-csv.ts \
  lib/domain/invoice-import.ts lib/domain/model.ts lib/domain/validation.ts \
  lib/server/mutations.ts package.json package-lock.json \
  scripts/verify-financial-dashboard.ts tests/finance.test.mjs tests/firestore.test.mjs tsconfig.json &&
git diff --cached --check &&
git commit -m "Add financial dashboard" &&
git push origin HEAD:main
```

L’application utilise les règles et les index Firestore existants. `.env.local` est ignoré par Git et les commandes ci-dessus ajoutent uniquement les fichiers du TP. Après le déploiement Vercel, vérifier `/finances` sur ordinateur et sur iPhone physique, ainsi que la connexion à Google sur les deux appareils. Si le script est utilisé sur le projet réel, comparer ses résultats avec le même compte dans Finances.
