import { isDocumentId } from "@/lib/domain/model";
import { missingResource } from "@/lib/server/client-access";
import { changeShare } from "@/lib/server/client-shares";
import { mutationResponse, readJson } from "@/lib/server/route";

export const runtime = "nodejs";

async function handle(request: Request, context: RouteContext<"/api/clients/[id]/shares/[recipientId]">) {
  const { id, recipientId } = await context.params;
  return mutationResponse(request, { collection: "clients", id }, async (_, userId) => {
    if (!isDocumentId(recipientId)) missingResource();
    await changeShare(id, userId, recipientId, request.method === "PATCH" ? await readJson(request) : undefined);
    return new Response(null, { status: 204 });
  });
}

export { handle as PATCH, handle as DELETE };
