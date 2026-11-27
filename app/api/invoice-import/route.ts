import { importInvoice } from "@/lib/server/mutations";
import { mutationResponse, readJson } from "@/lib/server/route";

export const runtime = "nodejs";

export function POST(request: Request) {
  return mutationResponse(request, { collection: "invoices" }, async (_, userId) => {
    const id = await importInvoice(userId, await readJson(request));
    return Response.json({ id }, { status: 201 });
  });
}
