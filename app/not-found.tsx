import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-6 text-center">
      <div className="panel">
        <h1 className="text-2xl font-bold">Page introuvable</h1>
        <Link href="/" className="button-primary mt-5">Revenir à l’accueil</Link>
      </div>
    </main>
  );
}
