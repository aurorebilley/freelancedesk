# Schéma de données FreelanceDesk

`FirebaseAuthUser` représente un compte Firebase Authentication. Les identifiants `id` des documents Firestore proviennent de leur chemin. Les dates d’émission, d’échéance et de paiement sont des chaînes au format `AAAA-MM-JJ`. Les horodatages des partages sont des timestamps Firestore.

```mermaid
erDiagram
    FirebaseAuthUser ||--o{ Client : owns
    FirebaseAuthUser ||--o{ Project : owns
    FirebaseAuthUser ||--o{ Invoice : owns
    FirebaseAuthUser ||--o{ ClientShare : grants
    FirebaseAuthUser ||--o{ ClientShare : receives
    FirebaseAuthUser ||--o| ClientShareRateLimit : "owns lookup counter"
    Client ||--o{ Project : contains
    Project ||--o{ Invoice : contains
    Client ||--o{ ClientShare : "has grants"
    Invoice ||--o| InvoiceNumberReservation : reserves

    FirebaseAuthUser {
        string uid PK
        string email
    }
    Client {
        string id PK
        string userId FK
        string name
        string email "optional"
        string city "optional"
        integer projectCount
        timestamp sharingUpdatedAt "optional"
    }
    Project {
        string id PK
        string userId FK
        string client_id FK
        string title
        string status
        number daily_rate
        string start_date
        integer invoiceCount
    }
    Invoice {
        string id PK
        string userId FK
        string project_id FK
        string number
        number amount
        string issued_on
        string due_on
        string status
        string paid_on "optional"
    }
    ClientShare {
        string clientId PK, FK
        string sharedUserId PK, FK
        string ownerId FK
        string ownerEmail
        string sharedUserEmail
        string permission "read or edit"
        timestamp createdAt
        timestamp updatedAt
    }
    InvoiceNumberReservation {
        string id PK
        string userId FK
        string invoiceId FK
    }
    ClientShareRateLimit {
        string id PK, FK
        integer startedAt "epoch milliseconds"
        integer attempts
    }
```

| Entité | Emplacement réel |
|---|---|
| FirebaseAuthUser | Firebase Authentication |
| Client | `clients/{id}` |
| Project | `projects/{id}` |
| Invoice | `invoices/{id}` |
| ClientShare | `client_shares/{clientId}/client_share_members/{sharedUserId}` |
| InvoiceNumberReservation | `invoiceNumberReservations/{id}` |
| ClientShareRateLimit | `client_share_rate_limits/{ownerId}` |

Le segment `client_shares/{clientId}` sert de chemin parent. Les documents d’autorisation résident dans la sous-collection. Le chemin complet est unique par couple client et associé. Le quota concerne l’UID du propriétaire et toutes les recherches par e-mail sur ses clients. Le numéro de facture est unique par propriétaire.
