// Every file a person stored, found by walking their folder in the bucket
// (shared by "delete my data" in the browser and account deletion on the server).

import type { SupabaseClient } from "@supabase/supabase-js";

export async function listUserFiles(client: SupabaseClient, bucket: string, userId: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (prefix: string, depth: number) => {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      // Folders come back without an id.
      if (item.id === null) {
        if (depth < 3) await walk(path, depth + 1);
      } else {
        out.push(path);
      }
    }
  };
  await walk(userId, 0);
  return out;
}

export async function removeUserFiles(client: SupabaseClient, bucket: string, userId: string) {
  const paths = await listUserFiles(client, bucket, userId);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}
