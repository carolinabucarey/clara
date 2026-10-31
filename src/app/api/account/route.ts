// DELETE /api/account: deletes the signed-in person's account. Their files go first
// (storage has no cascade); deleting the auth user cascades to every row.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { removeUserFiles } from "@/lib/account/files";

const BUCKET = "clara";

export async function DELETE(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "accounts_disabled" }, { status: 501 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await removeUserFiles(admin, BUCKET, data.user.id);
    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account:delete]", (err as Error).message);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
