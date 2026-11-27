# Retour d’expérience sur les règles de sécurité

- Les règles ont satisfait les premiers tests d’isolement. Les requêtes ciblées par client ou projet étaient autorisées et les requêtes élargies au compte du propriétaire étaient refusées.
- La suite à trois comptes a vérifié les relations, les tentatives de changement de droit, les écritures Web directes et le refus des mutations après révocation.
- La recette navigateur a révélé deux défauts de test, des rechargements en développement et un sélecteur ambigu pour l’encaissement. Le scénario lance désormais un build optimisé et cible la valeur chiffrée de la carte.
