# Checklist de recette FreelanceDesk

Les vérifications Firebase métier sont réalisées sur le projet local `demo-freelancedesk`. Les manœuvres qui exigent une configuration de la console Firebase sont indiquées séparément.

## Commandes reproductibles

```sh
npm run lint
npm run typecheck
npm run build
npm test
firebase emulators:exec --project demo-freelancedesk --only auth,firestore "npm run test:emulator"
```

## Authentification et accès

- [x] L’utilisateur a confirmé que l’inscription et la connexion fonctionnent sur son projet Firebase après l’étape d’authentification.
- [x] Chrome avec réponses Firebase simulées a couvert la confirmation du mot de passe, l’inscription, la connexion, la demande de réinitialisation, la restauration de session, la déconnexion et la redirection hors connexion.
- [ ] Refaire sur le projet Firebase la recette détaillée par fournisseur (e-mail et Google) et vérifier la réception puis l’utilisation du lien de réinitialisation.
- [ ] Vérifier les erreurs Firebase Auth dans le navigateur en conditions réelles et la présence d’un focus clavier visible.

## Métier et données

- [x] Deux tests unitaires couvrent la validité des dates, le passage à minuit à Paris et l’exclusion des factures payées, annulées, brouillons ou à échéance du jour du calcul des retards.
- [x] Le parcours Chrome sur émulateurs a couvert la création, la consultation, la modification d’un client et les recherches par nom, e-mail et ville.
- [x] Le parcours Chrome a couvert la création d’un projet depuis sa fiche client, la consultation, les filtres par statut et client, et le tri par statut. Le changement de statut et la suppression d’un projet sans facture sont vérifiés par l’API.
- [x] Le parcours Chrome a couvert la création d’une facture depuis la fiche projet, le changement de statut, la renumérotation, la suppression confirmée, la recherche par numéro, le filtre de retard et les tris par montant décroissant et échéance croissante.
- [x] Le parcours Chrome a constaté le blocage de la suppression d’un client associé à un projet ainsi que le message de conflit.
- [x] Les six indicateurs, le lien vers la facture en retard, le client et le projet associés et le format français des montants et des dates ont été comparés aux données de l’émulateur dans Chrome.
- [x] Le statut modifié en français est resté visible après actualisation. La liste des factures a été testée sans débordement général à 390, 768 et 1 440 pixels.
- [ ] Refaire la recette sur le projet Firebase cible et vérifier les variantes de tri et de filtres non exercées individuellement dans Chrome, ainsi que les écrans sur téléphone réel.

## Sécurité et concurrence

Les six tests de `tests/firestore.test.mjs` ont réussi sur Firebase Emulator Suite.

- [x] Isolation des trois collections entre deux comptes, protection des lectures individuelles et des requêtes, blocage des écritures directes.
- [x] Refus des jetons absents ou invalides, des modifications d’un autre compte, du changement de propriétaire et des relations intercomptes.
- [x] Validation des champs obligatoires, de l’adresse e-mail, des tarifs, des montants, des dates et des statuts. Statuts valides persistés en anglais.
- [x] Unicité par compte, coexistence du même numéro pour deux comptes, refus d’une création concurrente en doublon et libération lors d’une renumérotation ou suppression.
- [x] Blocage des suppressions de parents, mise à jour des dépendances lors d’un déplacement et absence de données orphelines entre une création et une suppression simultanées.
- [x] Dans Chrome, les URL des trois types de documents d’un autre compte et l’URL d’un document inexistant ont affiché le même message générique.

## Vérifications techniques

- [x] Le lint, TypeScript et le build de production se terminent sans erreur.
- [x] Le serveur de développement démarre. Aucune exception JavaScript non interceptée n’a été relevée pendant le parcours métier Chrome.
- [ ] Déployer les règles sur le projet Firebase cible et refaire une recette avec des comptes de test.
