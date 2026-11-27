import { saveRecord } from "@/lib/server/mutations";
import { mutationResponse, readJson } from "@/lib/server/route";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/[collection]">) {
  return mutationResponse(request, await context.params, async (collection, userId) => {
    const id = await saveRecord(collection, userId, await readJson(request));
    return Response.json({ id }, { status: 201 });
  });
}
