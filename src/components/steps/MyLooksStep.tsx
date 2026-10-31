"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { deleteLook, listLooks, lookImagePaths, type SavedLook } from "@/lib/account/looks";
import { signedUrls } from "@/lib/account/storage";
import { Button, Card, ErrorNote, EvidenceList, Note, OutfitPill, Spinner, StepHeader, VerdictPill } from "../ui";

function LookDetail({ look, urls }: { look: SavedLook; urls: Record<string, string> }) {
  const { t, tl, ev, locale } = useI18n();
  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div className="grid grid-cols-2 gap-3">
        {look.outfitPath && urls[look.outfitPath] && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[look.outfitPath]} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
            <figcaption className="mt-1.5 text-center text-xs text-muted">{t("look.outfit")}</figcaption>
          </figure>
        )}
        {look.facePath && urls[look.facePath] && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[look.facePath]} alt="" className="aspect-[4/5] w-full rounded-2xl bg-cream object-cover" />
            <figcaption className="mt-1.5 text-center text-xs text-muted">{t("looks.portrait")}</figcaption>
          </figure>
        )}
      </div>
      <ul className="space-y-2">
        {look.pieces.map((p, i) => (
          <li key={i} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {urls[p.garmentPath] && <img src={urls[p.garmentPath]} alt="" className="h-12 w-12 shrink-0 rounded-xl object-contain" />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm text-ink">
                {t(`attr.category.${p.attrs.category}`)} · {t(`colors.${p.color.name}`)}
              </p>
              {p.result && (
                <div className="flex flex-wrap gap-1">
                  <VerdictPill verdict={p.result.cut.verdict} size="sm" />
                  <VerdictPill verdict={p.result.color.verdict} size="sm" />
                </div>
              )}
              {p.draft && p.draftLocale === locale && <p className="text-xs text-ink/80">{p.draft.cut.headline}</p>}
            </div>
          </li>
        ))}
      </ul>
      {look.outfit && (
        <div className="space-y-2 rounded-2xl bg-cream px-4 py-3">
          <OutfitPill verdict={look.outfit.verdict} />
          <EvidenceList items={look.outfit.evidence} render={(e) => ev(e.code, e.params)} />
        </div>
      )}
      {look.hairstyle && (
        <p className="text-sm text-ink">
          <span className="font-semibold">{look.hairstyle.title}</span>
          {look.hairstyle.code && <> · {tl(`beauty.hairWhy.${look.hairstyle.code}`, look.hairstyle.params)}</>}
        </p>
      )}
      {look.makeup && look.makeup.length > 0 && (
        <ul className="space-y-1.5">
          {look.makeup.map((s) => (
            <li key={s.category} className="flex items-start gap-2 text-sm text-ink/85">
              <span className="mt-0.5 flex shrink-0 gap-1">
                {s.colors.map((c) => (
                  <span key={c} className="block h-4 w-4 rounded-full border border-black/10" style={{ background: c }} aria-hidden />
                ))}
              </span>
              {tl(`beauty.why.${s.code}`, s.params)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The looks saved in the person's account. */
export function MyLooksStep({ onBack }: { onBack: () => void }) {
  const { t, locale } = useI18n();
  const [looks, setLooks] = useState<SavedLook[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listLooks()
      .then(async (list) => {
        const signed = await signedUrls([...new Set(list.flatMap(lookImagePaths))]);
        if (!alive) return;
        setLooks(list);
        setUrls(signed);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const remove = async (look: SavedLook) => {
    if (!window.confirm(t("looks.confirmDelete"))) return;
    try {
      await deleteLook(look);
      setLooks((ls) => ls?.filter((l) => l.id !== look.id) ?? null);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="space-y-5">
      <StepHeader title={t("looks.title")} subtitle={t("looks.subtitle")} />
      {!looks && !failed && <Spinner label={t("looks.loading")} />}
      {failed && <ErrorNote>{t("account.errors.generic")}</ErrorNote>}
      {looks?.length === 0 && <Note>{t("looks.empty")}</Note>}
      {looks?.map((look) => {
        const cover = look.outfitPath ?? look.pieces[0]?.tryOnPath ?? look.pieces[0]?.garmentPath;
        return (
          <Card key={look.id} className="space-y-3">
            <button className="flex w-full items-center gap-4 text-left" onClick={() => setOpen(open === look.id ? null : look.id)} aria-expanded={open === look.id}>
              <span className="relative block w-20 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {cover && urls[cover] && <img src={urls[cover]} alt="" className="aspect-[3/4] w-full rounded-xl bg-cream object-cover" />}
                {look.facePath && urls[look.facePath] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[look.facePath]} alt="" className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full border-2 border-paper object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block text-sm text-ink">
                  {look.pieces.map((p) => t(`attr.category.${p.attrs.category}`)).join(" + ")}
                </span>
                <span className="block text-xs text-muted">
                  {t("looks.savedOn", { date: new Date(look.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) })}
                </span>
                {look.outfit && <OutfitPill verdict={look.outfit.verdict} />}
              </span>
              <span aria-hidden className="text-muted">
                {open === look.id ? "−" : "+"}
              </span>
            </button>
            {open === look.id && (
              <>
                <LookDetail look={look} urls={urls} />
                <div className="flex justify-end">
                  <Button variant="ghost" onClick={() => remove(look)}>
                    {t("looks.delete")}
                  </Button>
                </div>
              </>
            )}
          </Card>
        );
      })}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onBack}>
          {t("looks.back")}
        </Button>
      </div>
    </div>
  );
}
