"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useI18n } from "@/lib/i18n/context";

type Pt = { x: number; y: number };
type View = { s: number; x: number; y: number };

const MAX_ZOOM = 5;
const TAP_ZOOM = 2.5;
const ONE: View = { s: 1, x: 0, y: 0 };

const mid = (pts: Pt[]): Pt => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });
const dist = (pts: Pt[]) => (pts.length < 2 ? 0 : Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));

/**
 * The photo full screen: pinch, scroll or double-tap to zoom in, drag to move around.
 * Gestures are handled here (touch-action: none) so the page itself never zooms.
 */
function Viewer({ src, onClose }: { src: string; onClose: () => void }) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [view, setView] = useState({ ...ONE, animate: false });
  const current = useRef<View>(ONE);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ view: View; mid: Pt; dist: number; moved: boolean }>({ view: ONE, mid: { x: 0, y: 0 }, dist: 0, moved: false });
  const lastTap = useRef<{ at: number } & Pt>(null);

  // Keeps the scale in range and the photo's edges from coming inside the screen.
  const fit = (v: View): View => {
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
    if (!stage.current || !img.current) return { ...v, s };
    const mx = Math.max(0, (img.current.offsetWidth * s - stage.current.clientWidth) / 2);
    const my = Math.max(0, (img.current.offsetHeight * s - stage.current.clientHeight) / 2);
    return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };
  const apply = (v: View, animate = false) => {
    current.current = fit(v);
    setView({ ...current.current, animate });
  };
  // Zooms to scale `s` keeping the point under `q` (screen coordinates) in place.
  const zoomAt = (v: View, s: number, q: Pt): View => {
    const r = stage.current!.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const k = Math.min(MAX_ZOOM, Math.max(1, s)) / v.s;
    return { s: v.s * k, x: q.x - c.x - (q.x - c.x - v.x) * k, y: q.y - c.y - (q.y - c.y - v.y) * k };
  };
  // Every finger down or up starts the gesture again from where the photo is.
  const restart = () => {
    const pts = [...pointers.current.values()];
    gesture.current = { view: current.current, mid: mid(pts), dist: dist(pts), moved: gesture.current.moved || pts.length > 1 };
  };

  useEffect(() => {
    const el = stage.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      // A trackpad pinch arrives as a wheel with ctrlKey, in small steps.
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      apply(zoomAt(current.current, current.current.s * k, { x: e.clientX, y: e.clientY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!pointers.current.size) gesture.current.moved = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    restart();
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    const m = mid(pts);
    if (Math.hypot(m.x - g.mid.x, m.y - g.mid.y) > 8) g.moved = true;
    const v = pts.length > 1 && g.dist ? zoomAt(g.view, (g.view.s * dist(pts)) / g.dist, g.mid) : g.view;
    if (pts.length > 1 || v.s > 1) apply({ s: v.s, x: v.x + m.x - g.mid.x, y: v.y + m.y - g.mid.y });
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size) return restart();
    if (gesture.current.moved || e.type !== "pointerup") return;
    const tap = { at: e.timeStamp, x: e.clientX, y: e.clientY };
    const prev = lastTap.current;
    if (prev && tap.at - prev.at < 300 && Math.hypot(tap.x - prev.x, tap.y - prev.y) < 30) {
      lastTap.current = null;
      apply(current.current.s > 1 ? ONE : zoomAt(current.current, TAP_ZOOM, tap), true);
      return;
    }
    lastTap.current = tap;
    // A tap beside the photo closes, as long as it isn't zoomed in.
    const r = img.current!.getBoundingClientRect();
    const onPhoto = tap.x >= r.left && tap.x <= r.right && tap.y >= r.top && tap.y <= r.bottom;
    if (!onPhoto && current.current.s === 1) onClose();
  };

  return (
    <div
      ref={stage}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="flex h-full w-full touch-none select-none items-center justify-center overflow-hidden p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt=""
        draggable={false}
        className={view.s > 1 ? "max-h-full max-w-full cursor-grab active:cursor-grabbing" : "max-h-full max-w-full cursor-zoom-in"}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
          transition: view.animate ? "transform 200ms ease-out" : "none",
        }}
      />
      {view.s === 1 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs text-white/70">{t("zoom.hint")}</p>
      )}
    </div>
  );
}

/** A photo that opens full screen on tap, to look at the try-on up close. */
export function ZoomableImage({ src, className }: { src: string; className?: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("zoom.open")}
        className="group relative block w-full cursor-zoom-in rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className={className} />
        <span
          aria-hidden
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/55 text-cream transition group-hover:bg-ink/75"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" />
          </svg>
        </span>
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label={t("zoom.open")}
        className="m-0 h-dvh max-h-none w-full max-w-none overscroll-contain border-0 bg-black/90 p-0 backdrop:bg-black/60"
      >
        {open && <Viewer src={src} onClose={() => dialog.current?.close()} />}
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={t("zoom.close")}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </dialog>
    </>
  );
}
