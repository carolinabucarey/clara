"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { deleteLook, listLooks, lookImagePaths, renameLook, type SavedLook, type SavedPiece } from "@/lib/account/looks";
import { signedUrls } from "@/lib/account/storage";
import { renderBeforeAfterCard, renderLookCard } from "@/lib/share";
import { Button, Card, ErrorNote, EvidenceList, Note, OutfitPill, ShareButton, Spinner, StepHeader, VerdictPill } from "../ui";
import { ZoomableImage } from "../ZoomableImage";

function LookDetail({ look, urls }: { look: SavedLook; urls: Record<string, string> }) {
  const { t, tl, ev, locale } = useI18n();
  // The piece as chosen, next to it in the person's color (as on the look step).
  const yoursUrl = (p: SavedPiece) => (p.tryOnPath && urls[p.tryOnPath]) || urls[p.garmentPath];
  const shareBetter = (p: SavedPiece) =>
    renderBeforeAfterCard({
      before: { imageUrl: yoursUrl(p), label: t("rescue.yours"), hex: p.color.hex },
      after: { imageUrl: urls[p.better!.tryOnPath], label: t("rescue.inYourColor"), hex: p.better!.hex },
      text: t("rescue.betterBody"),
      palette: p.result?.palette ?? [],
      labels: { title: t("rescue.betterTitle"), footer: t("privacy") },
    });
  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div className="grid grid-cols-2 gap-3">
        {look.fullPath && urls[look.fullPath] && (
          <figure>
            <ZoomableImage src={urls[look.fullPath]} className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
            <figcaption className="mt-1.5 text-center text-xs text-muted">{t("looks.full")}</figcaption>
          </figure>
        )}
        {!look.fullPath && look.outfitPath && urls[look.outfitPath] && (
          <figure>
            <ZoomableImage src={urls[look.outfitPath]} className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
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
        {look.pieces.map((p, i) => p.better && urls[p.better.tryOnPath] && (
          <figure key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[p.better.tryOnPath]} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
            <figcaption className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: p.better.hex }} aria-hidden />
              {t("rescue.inYourColor")}
              {look.pieces.length > 1 && <> · {t(`attr.category.${p.attrs.category}`)}</>}
            </figcaption>
            {yoursUrl(p) && (
              <div className="flex flex-wrap justify-center">
                <ShareButton variant="ghost" render={() => shareBetter(p)} filename="clara-in-your-color.png" />
              </div>
            )}
          </figure>
        ))}
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
              {p.source && (
                <a href={p.source.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-clay underline-offset-4 hover:underline">
                  {t("look.store")}
                </a>
              )}
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
export function MyLooksStep({
  canEdit,
  onEdit,
  onRenamed,
  onBack,
}: {
  /** Editing needs the person's photos (restored from the account or taken this session). */
  canEdit: boolean;
  onEdit: (look: SavedLook) => Promise<void>;
  /** The look in progress may be this one: it keeps the new name. */
  onRenamed: (look: SavedLook) => void;
  onBack: () => void;
}) {
  const { t, locale } = useI18n();
  const [looks, setLooks] = useState<SavedLook[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

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

  const edit = async (look: SavedLook) => {
    setOpening(look.id);
    try {
      await onEdit(look);
    } catch {
      setFailed(true);
      setOpening(null);
    }
  };

  const shareCard = (look: SavedLook, cover: string) =>
    renderLookCard({
      imageUrl: urls[cover],
      portraitUrl: look.facePath ? urls[look.facePath] : undefined,
      pieces: look.pieces.map((p) => ({
        imageUrl: urls[p.garmentPath],
        hex: p.color.hex,
        label: `${t(`attr.category.${p.attrs.category}`)} · ${t(`colors.${p.color.name}`)}`,
      })),
      outfit: look.outfit ? { verdict: look.outfit.verdict, label: t(`look.levels.${look.outfit.verdict}`) } : undefined,
      palette: look.pieces.find((p) => p.result)?.result?.palette ?? [],
      labels: { title: look.name ?? t("look.title"), footer: t("privacy") },
    });

  const rename = async (look: SavedLook) => {
    const name = window.prompt(t("looks.renamePrompt"), look.name ?? "");
    if (name === null) return;
    try {
      const renamed = await renameLook(look, name);
      setLooks((ls) => ls?.map((l) => (l.id === look.id ? renamed : l)) ?? null);
      onRenamed(renamed);
    } catch {
      setFailed(true);
    }
  };

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
        const cover = look.fullPath ?? look.outfitPath ?? look.pieces[0]?.tryOnPath ?? look.pieces[0]?.garmentPath;
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
                {look.name && <span className="block truncate font-display text-lg leading-tight text-ink">{look.name}</span>}
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
                {!canEdit && <Note>{t("looks.needPhotos")}</Note>}
                <div className="flex flex-wrap justify-end gap-3">
                  <Button variant="ghost" onClick={() => rename(look)}>
                    {look.name ? t("looks.rename") : t("looks.addName")}
                  </Button>
                  <Button variant="ghost" onClick={() => remove(look)}>
                    {t("looks.delete")}
                  </Button>
                  {cover && urls[cover] && <ShareButton render={() => shareCard(look, cover)} filename="clara-look.png" />}
                  <Button variant="secondary" disabled={!canEdit || opening !== null} onClick={() => edit(look)}>
                    {opening === look.id ? t("looks.opening") : t("looks.edit")}
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
