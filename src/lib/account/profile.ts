"use client";

// The person's profile in their account: the three photos and what Clara measured
// (with their corrections), so a returning visit can skip the photo step.

import type { Me } from "@/components/ClaraApp";
import { removeUserFiles } from "./files";
import { downloadImage, SaveError, signedInClient, uploadImage } from "./storage";
import { BUCKET } from "../supabase/client";
import type { BeautyPrefs, ColorProfile, FaceShapeReading, Goal, Proportions } from "../types";

interface ProfileRow {
  color_profile: ColorProfile;
  measured_profile: ColorProfile;
  proportions: Proportions;
  measured_proportions: Proportions;
  face_shape: FaceShapeReading | null;
  goals: Goal[];
  beauty_prefs: Partial<BeautyPrefs>;
  selfie_path: string;
  selfie_wide_path: string;
  body_path: string;
}

export const DEFAULT_BEAUTY: BeautyPrefs = { makeup: null, hair: "all" };

/** Saves the measurements; the photos too when they changed since the last save. */
export async function saveProfile(me: Me, prefs: { beauty: BeautyPrefs; goals: Goal[] }, withPhotos: boolean) {
  const { sb, uid } = await signedInClient();
  const base = `${uid}/profile`;
  const paths = { selfie_path: `${base}/selfie`, selfie_wide_path: `${base}/selfie-wide`, body_path: `${base}/body` };
  if (withPhotos) {
    await Promise.all([
      uploadImage(paths.selfie_path, me.selfieBlob),
      uploadImage(paths.selfie_wide_path, me.selfieWideBlob),
      uploadImage(paths.body_path, me.bodyBlob),
    ]);
  }
  const row: ProfileRow & { user_id: string; updated_at: string } = {
    user_id: uid,
    color_profile: me.profile,
    measured_profile: me.measuredProfile,
    proportions: me.proportions,
    measured_proportions: me.measuredProportions,
    face_shape: me.faceShape,
    goals: prefs.goals,
    beauty_prefs: prefs.beauty,
    ...paths,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("profiles").upsert(row);
  if (error) throw new SaveError("generic");
}

export async function hasProfile(): Promise<boolean> {
  const { sb, uid } = await signedInClient();
  const { count } = await sb.from("profiles").select("user_id", { count: "exact", head: true }).eq("user_id", uid);
  return (count ?? 0) > 0;
}

export async function loadProfile(): Promise<{ me: Me; beauty: BeautyPrefs; goals: Goal[] } | null> {
  const { sb, uid } = await signedInClient();
  const { data, error } = await sb.from("profiles").select("*").eq("user_id", uid).maybeSingle<ProfileRow>();
  if (error || !data) return null;
  const [selfie, wide, body] = await Promise.all([
    downloadImage(data.selfie_path),
    downloadImage(data.selfie_wide_path),
    downloadImage(data.body_path),
  ]);
  return {
    me: {
      selfieBlob: selfie,
      selfieUrl: URL.createObjectURL(selfie),
      selfieWideBlob: wide,
      selfieWideUrl: URL.createObjectURL(wide),
      bodyBlob: body,
      bodyUrl: URL.createObjectURL(body),
      profile: data.color_profile,
      measuredProfile: data.measured_profile,
      proportions: data.proportions,
      measuredProportions: data.measured_proportions,
      faceShape: data.face_shape,
    },
    beauty: { ...DEFAULT_BEAUTY, ...data.beauty_prefs },
    goals: Array.isArray(data.goals) ? data.goals : [],
  };
}

/** "Delete my photos and looks": every file in the person's folder and every row. */
export async function deleteAllData() {
  const { sb, uid } = await signedInClient();
  await removeUserFiles(sb, BUCKET, uid);
  const [looks, profile] = await Promise.all([
    sb.from("looks").delete().eq("user_id", uid),
    sb.from("profiles").delete().eq("user_id", uid),
  ]);
  if (looks.error || profile.error) throw new SaveError("generic");
}
