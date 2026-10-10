import sharp from "sharp";

/** Turn Gemini's aligned grayscale matte into real alpha, not a painted background. */
export async function buildAlphaMask(mask: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(mask, { limitInputPixels: 16_777_216 })
    .removeAlpha()
    .toColourspace("srgb")
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(width * height);
  let foreground = 0;
  let background = 0;
  let colored = 0;
  for (let i = 0; i < alpha.length; i++) {
    const offset = i * info.channels;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 35) colored++;
    const gray = (red + green + blue) / 3;
    alpha[i] = Math.max(0, Math.min(255, Math.round((gray - 64) * 255 / 128)));
    if (alpha[i]! >= 128) foreground++;
    if (alpha[i]! < 32) background++;
  }
  if (colored / alpha.length > 0.12 || foreground / alpha.length < 0.005
    || background / alpha.length < 0.01) {
    throw new Error("Gemini could not isolate a clear subject. Try a photo with a more distinct foreground.");
  }
  return alpha;
}
