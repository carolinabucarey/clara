// Maps YouCam error codes to friendly, actionable messages (i18n keys under `errors`).
// Clara admits what it cannot read and says how to retake the photo.

const MAP: Array<[RegExp, string]> = [
  [/^error_no_face$|face_parsing/, "noFace"],
  [/face_position_too_small|below_min_image_size/, "faceTooSmall"],
  [/face_position_(invalid|out_of_boundary)/, "faceFraming"],
  [/face_angle|not_forward_facing|large_face_angle/, "faceAngle"],
  [/multiple_people/, "multiplePeople"],
  [/no_shoulder|hair_too_short|insufficient_landmarks|face_pose/, "hairPhoto"],
  [/error_pose|apply_region_mismatch|error_invalid_src|unsupport_ratio/, "bodyPose"],
  [/invalid_ref/, "garmentImage"],
  [/exceed_max_filesize|exceed_max_image_size/, "fileTooBig"],
  [/nsfw/, "nsfw"],
  [/download_image|decode_image|invalid_image/, "imageUnreadable"],
  [/CreditInsufficiency/i, "credits"],
  [/rate_limited|429/, "rateLimited"],
  [/missing_api_key|InvalidApiKey|InactiveApiKey|ExpiredApiKey|missing_anthropic_key/, "config"],
  [/timeout/i, "timeout"],
];

export function errorKey(code: string | undefined | null): string {
  if (!code) return "generic";
  for (const [re, key] of MAP) if (re.test(code)) return key;
  return "generic";
}
