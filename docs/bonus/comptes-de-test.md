# Comptes de test du TP bonus

L’URL de production est **https://freelancedesk-xi.vercel.app**. Utiliser les émulateurs pour la première recette. La préparation en ligne commence après autorisation de la propriétaire du projet et publication des règles, de l’index et de l’application.

| Compte | Rôle | Client Lecture | Client Modification | Client Privé |
|---|---|---|---|---|
| A | Propriétaire | Tous droits | Tous droits | Tous droits |
| B | Associé en lecture | Lecture du client, des projets et des factures | Aucun accès | Aucun accès |
| C | Associé en modification | Aucun accès | Lecture et création/modification de factures | Aucun accès |

## Préparation

1. Réserver trois adresses de démonstration contrôlées pour A, B et C et générer trois mots de passe distincts dans un gestionnaire. Utiliser trois profils de navigateur distincts et créer les comptes via **Créer un compte**.
2. Avec A, créer trois clients fictifs, **Client Lecture**, **Client Modification** et **Client Privé**. Ajouter un projet et une facture « Envoyée » sous chaque client. Choisir des numéros distincts et des dates récentes. Définir un montant simple et différent pour chaque facture.
3. Avec A, partager Client Lecture avec l’adresse de B en **Lecture seule**. Partager Client Modification avec C en **Modification**. Vérifier l’adresse, le droit et la date dans **Gestion des accès**.
4. Avec B et C, créer éventuellement un client, un projet et une facture personnels chacun. Utiliser le même numéro de facture chez A et C pour tester la séparation des propriétaires.
5. Conserver les adresses, mots de passe et URL directes dans un coffre partagé avec le professeur. Communiquer le lien au coffre via le canal pédagogique convenu. Réserver les documents Git aux rôles, étapes et résultats sans identifiants sensibles.

## Recette du professeur

1. Ouvrir les listes **Clients**, **Projets** et **Factures** avec B. Vérifier la présence du client Lecture et l’absence des deux autres clients. Ouvrir ses trois fiches et vérifier les droits de consultation. Essayer les URL directes des clients Modification et Privé, d’un de leurs projets et d’une de leurs factures. Vérifier le message « Ressource introuvable » et le lien de retour.
2. Avec C, vérifier que le formulaire de facture propose le projet partagé en modification et les projets personnels. Créer une facture pour le projet partagé, essayer un numéro déjà utilisé par A, puis choisir un nouveau numéro. Modifier et marquer la facture payée. Vérifier la date de paiement et l’absence de commande de suppression.
3. Vérifier que l’encaissement de cette facture apparaît dans **Finances** pour A. Avec C, vérifier que son total personnel reste identique. Comparer les filtres 3, 6 et 12 mois avec des dates de facture dans chaque période.
4. Avec C, ouvrir une fiche de facture partagée et son formulaire de modification. Avec A, passer C en **Lecture seule**. Le formulaire de C doit se fermer et sa fiche rester accessible. Remettre **Modification**, puis choisir **Révoquer** et confirmer. Vérifier que la fiche ouverte disparaît et que les listes et URL directes refusent l’accès. Vérifier que la facture reste accessible pour A et que B garde son accès de lecture.
5. Sur un iPhone, répéter la connexion Google et le parcours de consultation avec Safari. Utiliser les données fictives de recette pour le test de partage en ligne.

## Recette locale automatisée

```sh
firebase emulators:exec --project demo-freelancedesk --only auth,firestore "npm run test:emulator"
```

Le scénario « Partage de clients avec trois comptes » crée A, B et C dans l’émulateur Auth et installe ses données via l’API locale. La suite navigateur reproduit le parcours visible sur Chromium et WebKit avec un profil iPhone. [Commandes de recette navigateur](../../README.md#tests)
