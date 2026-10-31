"use client";

import { Button, ClaraAvatar } from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <ClaraAvatar size={64} />
      <p role="alert" className="text-sm text-ink">{t("errors.generic")}</p>
      <Button onClick={retry}>{t("common.retry")}</Button>
    </main>
  );
}
