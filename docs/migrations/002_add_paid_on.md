# Évolution Firestore 002 · Date de paiement des factures

Le champ `paid_on` permet de dater les encaissements et de mesurer le délai entre l’émission et le paiement.

## Modèle de données

| Version | Champs de la collection `invoices` |
|---|---|
| Ancienne | `userId`, `project_id`, `number`, `amount`, `issued_on`, `due_on`, `status` |
| Actuelle | Les mêmes champs, avec `paid_on` facultatif |

`paid_on` est une **chaîne Firestore au format `AAAA-MM-JJ`**, comme les dates d’émission et d’échéance. Elle représente un jour civil. Pour un paiement marqué comme reçu sans date explicite, le serveur détermine le jour courant dans le fuseau `Europe/Paris`.

## Validation et transitions

| Opération | Date stockée |
|---|---|
| Création manuelle payée ou transition vers `paid` | Date saisie ou, à défaut, jour courant à Paris |
| Modification d’une facture déjà payée | Date existante conservée si aucune correction n’est fournie |
| Transition depuis `paid` vers un autre statut | Champ retiré dans la même transaction que le changement de statut |
| Nouveau passage à `paid` | Date du nouveau paiement saisie ou calculée par défaut |
| Import CSV d’une facture payée | Date fournie si elle est valide, champ absent si la date est vide ou absente |
| Facture avec un autre statut | Champ absent, saisie d’une date refusée |

La validation vérifie l’existence du jour dans le calendrier et impose une date de paiement égale ou postérieure à l’émission. Cette contrainte s’applique aussi à une date conservée quand la date d’émission change. Les transactions existantes maintiennent les références aux projets et les réservations de numéros.

## Documents historiques et déploiement

Les documents historiques sans le champ restent lisibles et modifiables. Une facture déjà payée conserve sa date inconnue lors d’une modification ordinaire. Elle contribue au total encaissé toutes périodes, apparaît dans les données à compléter et est exclue des calculs fondés sur une date de paiement, dont le délai moyen. L’utilisateur peut renseigner sa date réelle depuis la fiche facture.

Le schéma de document Firestore accepte ce champ facultatif sans reprise de données. Les règles existantes limitent la lecture au propriétaire et interdisent les écritures directes. Les routes serveur vérifient le jeton et le propriétaire avant de valider puis d’écrire avec le SDK Admin. Finances réutilise les requêtes filtrées sur `userId`. L’installation de cette version ne requiert aucun déploiement de règles ou d’index et aucune manipulation dans la console Firebase.
