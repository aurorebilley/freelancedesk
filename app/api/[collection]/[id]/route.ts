import { deleteRecord, saveRecord, updateStatus } from "@/lib/server/mutations";
import { mutationResponse, readJson } from "@/lib/server/route";

export const runtime = "nodejs";

export async function PUT(request: Request, context: RouteContext<"/api/[collection]/[id]">) {
  const params = await context.params;
  return mutationResponse(request, params, async (collection, userId) => {
    const id = await saveRecord(collection, userId, await readJson(request), params.id);
    return Response.json({ id });
  });
}

export async function PATCH(request: Request, context: RouteContext<"/api/[collection]/[id]">) {
  const params = await context.params;
  return mutationResponse(request, params, async (collection, userId) => {
    await updateStatus(collection, userId, params.id, await readJson(request));
    return new Response(null, { status: 204 });
  });
}

export async function DELETE(request: Request, context: RouteContext<"/api/[collection]/[id]">) {
  const params = await context.params;
  return mutationResponse(request, params, async (collection, userId) => {
    await deleteRecord(collection, userId, params.id);
    return new Response(null, { status: 204 });
  });
}
