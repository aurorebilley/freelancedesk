# TP 3 · Observations de la première version

## Fichier généré à partir du premier prompt

Le premier CSV contient 10 factures. Ses en-têtes `invoice_number`, `issue_date`, `due_date` et `total` correspondent aux champs `number`, `issued_on`, `due_on` et `amount` de FreelanceDesk. Les dates sont déjà au format `YYYY-MM-DD` et les montants utilisent déjà un point décimal.

Le fichier indique `customer_name` et `currency`, deux champs absents des documents facture. Il manque la référence au projet (`project_id` en base, `project_title` dans le fichier d’import) et le propriétaire (`userId` en base, déterminé par la session lors de l’import). Le statut `overdue` d’une ligne ne correspond à aucune valeur stockée. FreelanceDesk calcule le retard à partir du statut `sent` et de l’échéance. Les autres valeurs de statut sont compatibles.

## Essais de l’import initial

Essai du 27 novembre 2026 dans Chrome avec les émulateurs Auth et Firestore, sur un compte neuf. Un client et les deux projets de démonstration ont été créés via l’API existante. Le fichier correct a importé 12 factures sur 12. Le filtre de retard en affichait 3. Le fichier piégé a importé les 3 lignes correctes et refusé les 5 lignes ci-dessous.

| Anomalie | Résultat attendu | Résultat réellement observé | Problème identifié |
|---|---|---|---|
| Ligne 5, statut `Payée` | Convertir en `paid` et importer | Refusée à l’enregistrement (HTTP 400), « Le statut sélectionné est invalide. » | Le CSV envoyait directement le libellé français au validateur. |
| Ligne 6, montant négatif | Refuser la ligne et indiquer la cause | Refusée à l’enregistrement (HTTP 400), « Le montant doit être supérieur à zéro. » | L’erreur n’était visible qu’après avoir lancé les écritures. |
| Ligne 7, projet inexistant | Refuser sans révéler les projets d’autres comptes | Refusée dans le navigateur, « Ce projet est introuvable dans ton espace. » Aucune requête de création pour cette ligne. | Le message n’apparaissait que dans le bilan final. |
| Ligne 8, échéance antérieure | Refuser la ligne en indiquant les dates incohérentes | Refusée à l’enregistrement (HTTP 400), « La date d’échéance ne peut pas être antérieure à la date d’émission. » | L’erreur n’était visible qu’après avoir lancé les écritures. |
| Ligne 9, doublon interne | Garder la première ligne valide et refuser la suivante | La première ligne a été créée (HTTP 201). La seconde a été refusée (HTTP 409), « Ce numéro de facture est déjà utilisé. » | Le message confondait doublon interne et numéro déjà présent avant l’import. |

Les trois réponses HTTP 400 et la réponse HTTP 409 apparaissaient dans le terminal et la console Chrome. Aucune exception JavaScript non interceptée n’a été relevée. Chrome a également signalé une ressource en HTTP 404 pendant le parcours. Le relevé initial ne permet pas d’identifier son URL. Ce signalement n’a pas bloqué les essais.

## Plan de correction

- Prévisualiser chaque ligne et son motif de refus, puis demander une confirmation avant le premier enregistrement.
- Convertir les statuts français connus, signaler les conversions et valider les montants et les dates avec les règles du projet.
- Associer les titres uniquement parmi les projets du compte. Refuser les titres absents et ambigus.
- Signaler séparément les doublons dans le fichier et dans le compte. Vérifier de nouveau les données à l’enregistrement et conserver les réservations transactionnelles.
- Afficher le nombre de factures réellement enregistrées, les conversions appliquées et les motifs de refus.

## Vérifications de la version améliorée

| Essai | Résultat observé sur émulateurs |
|---|---|
| Fichier correct | 12 lignes valides. La liste était vide pendant l’aperçu. Les 12 factures sont apparues après confirmation. Le filtre a affiché 3 factures en retard. |
| Fichier piégé | 3 lignes valides, 1 statut converti de `Payée` vers `paid` et 4 refus avant confirmation. Quatre factures ont été enregistrées. |
| Fichiers et commandes | Modèle CSV téléchargé, glisser-déposer reconnu, fichier vide, données UTF-8 invalides, guillemets non fermés et colonne manquante refusés. Avec un BOM, des points-virgules, un champ entre guillemets sur deux lignes et une ligne trop courte, les numéros de ligne et les motifs restaient corrects. |
| Validation et confirmation | Le statut inconnu, le titre ambigu et les 12 doublons à la réimportation ont été signalés en aperçu. L’annulation n’a créé aucune facture. Un numéro pris après l’aperçu a entraîné un HTTP 409 et la facture suivante a tout de même été créée. |
| Sécurité | Le compte B a vu 12 messages de projet introuvable et n’a créé aucune facture. Les requêtes modifiées avec un autre `userId` ou un `project_id` ont été rejetées. Deux imports simultanés du même numéro ont obtenu un HTTP 201 et un HTTP 409. |
| Affichage | Les factures importées sont apparues sans rechargement dans la liste, la fiche projet et le tableau des retards. |
| TP 2 | Les tests sur les dates, l’API et les règles Firestore ont réussi. Le parcours Chrome a vérifié la gestion des clients, projets et factures, les listes et indicateurs, l’accès aux fiches, l’inscription, la connexion e-mail, la déconnexion et la fenêtre Google de l’émulateur Auth. |

Le relevé Chrome de la version améliorée a identifié le HTTP 404 sur `/favicon.ico`. Le HTTP 409 restant correspond au conflit de numéro provoqué entre l’aperçu et la confirmation. Aucune exception JavaScript non interceptée n’a été relevée pendant les essais automatisés sur émulateurs.

## Essai sur le projet Firebase cible

Le premier essai sur le projet Firebase cible a renvoyé un HTTP 503. Le journal serveur a situé l’erreur dans l’appel à la fonction d’import, que le serveur Next.js de développement n’avait pas rechargée. Après redémarrage de Next.js, l’utilisatrice a confirmé que l’import fonctionnait et que les lignes piégées étaient correctement refusées. Les décomptes du tableau proviennent des essais sur émulateurs.
