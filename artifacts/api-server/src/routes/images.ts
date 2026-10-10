import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { RemoveBackgroundBody } from "@workspace/api-zod";
import { buildAlphaMask } from "../lib/subject-mask";

const router: IRouter = Router();
let active = 0;
const hourlyRequests: number[] = [];
const requestsByIp = new Map<string, number[]>();

function allowRequest(ip: string): boolean {
  const now = Date.now();
  while (hourlyRequests.length && hourlyRequests[0]! < now - 3_600_000) hourlyRequests.shift();
  for (const [key, times] of requestsByIp) {
    const current = times.filter((time) => time > now - 300_000);
    if (current.length) requestsByIp.set(key, current);
    else requestsByIp.delete(key);
  }
  const times = requestsByIp.get(ip) ?? [];
  if (active >= 2 || times.length >= 3 || hourlyRequests.length >= 20) return false;
  hourlyRequests.push(now);
  requestsByIp.set(ip, [...times, now]);
  return true;
}

router.post("/images/remove-background", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = RemoveBackgroundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid photo under 2 MB." });
    return;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(503).json({ error: "Gemini is not configured. Add GEMINI_API_KEY in project Secrets." });
    return;
  }
  const input = Buffer.from(parsed.data.imageBase64, "base64");
  let width: number;
  let height: number;
  try {
    const metadata = await sharp(input, { limitInputPixels: 1_048_576 }).metadata();
    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height
      || metadata.width > 1024 || metadata.height > 1024 || input.length > 2_000_000) {
      throw new Error("Invalid image");
    }
    width = metadata.width;
    height = metadata.height;
  } catch {
    res.status(400).json({ error: "The photo could not be read. Choose another image." });
    return;
  }
  if (!allowRequest(req.ip ?? "unknown")) {
    res.setHeader("Retry-After", "300");
    res.status(429).json({ error: "Background removal is busy or its safety limit was reached. Try again later." });
    return;
  }
  active++;
  try {
    const ai = new GoogleGenAI({
      apiKey: key,
      vertexai: false,
      httpOptions: {
        baseUrl: "https://generativelanguage.googleapis.com",
        apiVersion: "v1beta",
        timeout: 90_000,
      },
    });
    const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
    const aspectRatio = ratios.reduce((closest, ratio) => {
      const numeric = (value: string) => {
        const parts = value.split(":").map(Number);
        return parts[0]! / parts[1]!;
      };
      return Math.abs(Math.log(numeric(ratio) / (width / height)))
        < Math.abs(Math.log(numeric(closest) / (width / height))) ? ratio : closest;
    });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: parsed.data.imageBase64 } },
          { text: "Edit this image into an accurately aligned subject-segmentation mask. Keep the main focused foreground object, person, or animal. Output a BLACK AND WHITE MASK ONLY: the entire subject is a solid pure-white silhouette, all background and holes are pure black. Do not include the subject's colors, textures, facial details, shadows, or lighting. Only narrow antialiased edges may be gray. Preserve exactly the original framing, aspect ratio, subject position, pose, outline and size. Do not crop, move, invent or redraw objects. No checkerboard, no text, no border. This mask will be applied to the original photo to remove its background, so accurate alignment is essential." },
        ],
      }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio },
      },
    });
    const image = result.candidates?.[0]?.content?.parts?.find((part) =>
      part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data)?.inlineData;
    if (!image?.data) {
      res.status(422).json({ error: "Gemini did not return a subject mask. Try a different photo." });
      return;
    }
    const alpha = await buildAlphaMask(Buffer.from(image.data, "base64"), width, height);
    res.json({ width, height, alphaBase64: alpha.toString("base64") });
  } catch (error) {
    const providerStatus = typeof error === "object" && error !== null && "status" in error
      ? Number(error.status) : undefined;
    req.log.warn({ providerStatus, failureType: error instanceof Error ? error.name : "unknown" },
      "Gemini background removal failed");
    if (error instanceof Error && error.message.startsWith("Gemini could not isolate")) {
      res.status(422).json({ error: error.message });
    } else if (providerStatus === 402) {
      res.status(503).json({ error: "Gemini image generation is blocked by a billing or credit limit. Check billing for your API account, then try again." });
    } else if (providerStatus === 429) {
      res.status(429).json({ error: "Your Gemini account reached its quota or rate limit. Check your Google API account, then try again." });
    } else if (providerStatus === 401 || providerStatus === 403) {
      res.status(503).json({ error: "Gemini rejected this API key or model access. Check the key and permissions in your Google API account." });
    } else {
      res.status(503).json({ error: "Gemini could not process this photo. Check that your API account supports Nano Banana image generation, or try again later." });
    }
  } finally {
    active--;
  }
});

export default router;
