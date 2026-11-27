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
  "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google. Réessaie depuis cette page ou connecte-toi par e-mail.",
  "auth/popup-closed-by-user": "La fenêtre Google a été fermée. Tu peux relancer la connexion.",
  "auth/cancelled-popup-request": "La connexion Google a été interrompue par une autre tentative. Réessaie.",
  "auth/web-storage-unsupported": "La fenêtre Google n’a pas pu terminer la connexion dans ce navigateur. Réessaie ou connecte-toi par e-mail.",
  "auth/operation-not-supported-in-this-environment": "La connexion Google est indisponible dans ce navigateur. Tu peux te connecter par e-mail.",
  "auth/unauthorized-domain": "La connexion Google n’est pas autorisée sur cette adresse.",
  "auth/operation-not-allowed": "Cette méthode de connexion est indisponible pour le moment.",
  "auth/account-exists-with-different-credential":
    "Un compte utilise déjà cette adresse. Connecte-toi avec ta méthode habituelle.",
};

export function authErrorMessage(error: unknown, fallback: string) {
  return error instanceof FirebaseError ? (messages[error.code] ?? fallback) : fallback;
}
