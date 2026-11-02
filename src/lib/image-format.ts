/** Recognize raster image signatures; never serve HTML/SVG as same-origin images. */
export function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** Store photos may also use GIF or AVIF. Keep these out of the YouCam upload formats. */
export function storeImageType(bytes: Uint8Array) {
  const type = imageType(bytes);
  if (type) return type;
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  // AVIF uses an ISO BMFF file-type box; avif/avis can be a major or compatible brand.
  if (bytes.length >= 16 && ascii(4, 8) === "ftyp") {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (size >= 16 && size <= bytes.length && size <= 256) {
      for (let i = 8; i + 4 <= size; i += 4) {
        if (i !== 12 && ["avif", "avis"].includes(ascii(i, i + 4))) return "image/avif";
      }
    }
  }
  return null;
}
