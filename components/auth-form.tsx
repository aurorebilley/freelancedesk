"use client";

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { authErrorMessage } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Mode = "login" | "register" | "reset";
type Notice = { kind: "error" | "success"; message: string };

const copy = {
  login: {
    title: "Connexion",
    description: "Connecte-toi pour retrouver ton espace de travail.",
    submit: "Se connecter",
    error: "Impossible de te connecter pour le moment.",
  },
  register: {
    title: "Créer un compte",
    description: "Crée ton espace de travail FreelanceDesk.",
    submit: "Créer mon compte",
    error: "Impossible de créer ton compte pour le moment.",
  },
  reset: {
    title: "Mot de passe oublié",
    description: "Saisis l’adresse e-mail de ton compte pour recevoir un lien de réinitialisation.",
    submit: "Envoyer le lien",
    error: "Impossible d’envoyer le lien pour le moment.",
  },
} satisfies Record<Mode, Record<string, string>>;

const resetMessage = "Si un compte correspond à cette adresse, un e-mail de réinitialisation a été envoyé.";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const submitting = useRef(false);

  const currentMode = reset ? "reset" : mode;
  const { title, description, submit, error } = copy[currentMode];

  function changeReset(value: boolean) {
    setNotice(null);
    setReset(value);
  }

  async function run(operation: "email" | "google", action: () => Promise<void>, fallback: string) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(operation);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice({ kind: "error", message: authErrorMessage(error, fallback) });
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const form = new FormData(event.currentTarget);
    const address = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (currentMode === "register" && password !== form.get("confirmation")) {
      setNotice({ kind: "error", message: "Les deux mots de passe doivent être identiques." });
      event.currentTarget.querySelector<HTMLInputElement>("#confirmation")?.focus();
      return;
    }

    void run("email", async () => {
      const auth = getFirebaseAuth();
      switch (currentMode) {
        case "login":
          await signInWithEmailAndPassword(auth, address, password);
          break;
        case "register":
          await createUserWithEmailAndPassword(auth, address, password);
          break;
        case "reset":
          try {
            await sendPasswordResetEmail(auth, address);
          } catch (error) {
            if (!(error instanceof FirebaseError) || error.code !== "auth/user-not-found") throw error;
          }
          setNotice({ kind: "success", message: resetMessage });
          break;
      }
    }, error);
  }

  function handleGoogle() {
    void run("google", async () => {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    }, "Impossible de te connecter avec Google pour le moment.");
  }

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 leading-relaxed text-slate-600">{description}</p>

      {!reset && (
        <>
          <button className="button-secondary mt-7 w-full" type="button" disabled={!!pending} onClick={handleGoogle}>
            {pending === "google" ? "Connexion à Google…" : "Continuer avec Google"}
          </button>
          <div className="my-6 flex items-center gap-4 text-sm text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            ou par e-mail
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className={reset ? "mt-7" : undefined} aria-busy={!!pending}>
        <label htmlFor="email" className="field-label">Adresse e-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
          value={email}
          disabled={!!pending}
          onChange={(event) => setEmail(event.target.value)}
        />

        {!reset && (
          <div className="mt-4">
            <label htmlFor="password" className="field-label">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={mode === "register" ? 6 : undefined}
              aria-describedby={mode === "register" ? "password-help" : undefined}
              required
              className="field"
              disabled={!!pending}
            />
            {mode === "register" && (
              <p id="password-help" className="mt-1.5 text-sm text-slate-600">6 caractères minimum.</p>
            )}
          </div>
        )}

        {currentMode === "register" && (
          <div className="mt-4">
            <label htmlFor="confirmation" className="field-label">Confirme ton mot de passe</label>
            <input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              className="field"
              disabled={!!pending}
            />
          </div>
        )}

        {currentMode === "login" && (
          <button
            type="button"
            className="text-action mt-3 block"
            disabled={!!pending}
            onClick={() => changeReset(true)}
          >
            Mot de passe oublié ?
          </button>
        )}

        {notice && (
          <p
            className={notice.kind === "error" ? "notice-error mt-5" : "notice-success mt-5"}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.message}
          </p>
        )}

        <button className="button-primary mt-5 w-full" type="submit" disabled={!!pending}>
          {pending === "email" ? "En cours…" : submit}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>

      {reset ? (
        <button
          type="button"
          className="text-action mt-6 inline-flex items-center gap-2 self-start"
          disabled={!!pending}
          onClick={() => changeReset(false)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Retour à la connexion
        </button>
      ) : (
        <p className="mt-6 text-center text-sm text-slate-600">
          {mode === "login" ? "Tu n’as pas encore de compte ?" : "Tu as déjà un compte ?"}{" "}
          <Link className="text-action" href={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Créer un compte" : "Se connecter"}
          </Link>
        </p>
      )}
    </>
  );
}
