import "server-only";

import { FirebaseAuthError } from "firebase-admin/auth";

import { isCollection, isDocumentId, notFoundMessage, type Collection } from "@/lib/domain/model";
import { BusinessError } from "@/lib/domain/validation";
import { getAdminAuth } from "@/lib/firebase/admin";

interface RouteParams {
  collection: string;
  id?: string;
}

const authenticationRequired = "Connecte-toi pour continuer.";
const invalidTokenCodes = new Set([
  "auth/argument-error",
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/user-disabled",
  "auth/user-not-found",
]);

async function authenticatedUser(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8192) throw new BusinessError(authenticationRequired, 401);
  try {
    return (await getAdminAuth().verifyIdToken(token, true)).uid;
  } catch (error) {
    if (error instanceof FirebaseAuthError && invalidTokenCodes.has(error.code)) {
      throw new BusinessError(authenticationRequired, 401);
    }
    throw error;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new BusinessError("Le formulaire est invalide.");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new BusinessError("Le formulaire est vide.");
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new BusinessError("Le formulaire est trop volumineux.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch {
    throw new BusinessError("Le formulaire est invalide.");
  }
}

export async function mutationResponse(
  request: Request,
  params: RouteParams,
  handler: (collection: Collection, userId: string) => Promise<Response>,
) {
  try {
    const userId = await authenticatedUser(request);
    if (!isCollection(params.collection) || (params.id !== undefined && !isDocumentId(params.id))) {
      throw new BusinessError(notFoundMessage, 404);
    }
    return await handler(params.collection, userId);
  } catch (error) {
    if (error instanceof BusinessError) return Response.json({ error: error.message }, { status: error.status });
    const details = error instanceof Error ? {
      name: error.name,
      code: "code" in error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : undefined,
      frames: error.stack?.split("\n").filter(line => /^\s+at /.test(line)).slice(0, 5),
    } : { name: typeof error };
    console.error(`Écriture Firestore impossible ${JSON.stringify(details)}`);
    return Response.json({ error: "L’opération a échoué. Réessaie dans un instant." }, { status: 503 });
  }
}
