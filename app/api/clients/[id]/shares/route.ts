import { createShare } from "@/lib/server/client-shares";
import { mutationResponse, readJson } from "@/lib/server/route";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/clients/[id]/shares">) {
  const { id } = await context.params;
  return mutationResponse(request, { collection: "clients", id }, async (_, userId) => {
    await createShare(id, userId, await readJson(request));
    return Response.json({}, { status: 201 });
  });
}
