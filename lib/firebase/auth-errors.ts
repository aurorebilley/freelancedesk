import { FirebaseError } from "firebase/app";

const messages: Record<string, string> = {
  "auth/invalid-email": "Saisis une adresse e-mail valide.",
  "auth/invalid-credential": "L’adresse e-mail ou le mot de passe est incorrect.",
  "auth/user-not-found": "L’adresse e-mail ou le mot de passe est incorrect.",
  "auth/wrong-password": "L’adresse e-mail ou le mot de passe est incorrect.",
  "auth/email-already-in-use": "Un compte utilise déjà cette adresse e-mail.",
  "auth/weak-password": "Choisis un mot de passe plus long ou plus complexe.",
  "auth/password-does-not-meet-requirements": "Ce mot de passe ne respecte pas les exigences de sécurité.",
  "auth/user-disabled": "Ce compte est désactivé.",
  "auth/network-request-failed": "La connexion a été interrompue. Vérifie ton accès à Internet et réessaie.",
  "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
  "auth/popup-blocked": "Autorise les fenêtres contextuelles dans ton navigateur pour te connecter avec Google.",
  "auth/popup-closed-by-user": "La fenêtre Google a été fermée. Tu peux relancer la connexion.",
  "auth/unauthorized-domain": "La connexion Google n’est pas autorisée sur cette adresse.",
  "auth/operation-not-allowed": "Cette méthode de connexion est indisponible pour le moment.",
  "auth/account-exists-with-different-credential":
    "Un compte utilise déjà cette adresse. Connecte-toi avec ta méthode habituelle.",
};

export function authErrorMessage(error: unknown, fallback: string) {
  return error instanceof FirebaseError ? (messages[error.code] ?? fallback) : fallback;
}
