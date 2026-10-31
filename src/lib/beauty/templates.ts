"use client";

// YouCam's hairstyle catalog, fetched once per page load through our API route.

import { useEffect, useState } from "react";
import type { HairTemplate } from "./hairstyles";

let pending: Promise<HairTemplate[]> | null = null;

function loadTemplates(): Promise<HairTemplate[]> {
  pending ??= fetch("/api/youcam/hair-templates")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`http_${r.status}`))))
    .then((d: { templates?: HairTemplate[] }) => d.templates ?? [])
    .catch((e) => {
      pending = null; // let a later visit try again
      throw e;
    });
  return pending;
}

export function useHairTemplates(): { templates: HairTemplate[] | null; failed: boolean } {
  const [state, setState] = useState<{ templates: HairTemplate[] | null; failed: boolean }>({ templates: null, failed: false });
  useEffect(() => {
    let alive = true;
    loadTemplates()
      .then((templates) => alive && setState({ templates, failed: false }))
      .catch(() => alive && setState({ templates: null, failed: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
