import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB (OpenAI's limit)

export async function POST(request: NextRequest) {
  // Require an authenticated session.
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Speech-to-text service not configured" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid FormData" }, { status: 400 });
  }

  const audioFile = formData.get("audio");
  if (!(audioFile instanceof File)) {
    return NextResponse.json(
      { error: "Missing audio file" },
      { status: 400 },
    );
  }

  if (audioFile.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: "Audio file too large (max 25 MB)" },
      { status: 413 },
    );
  }

  try {
    // Call OpenAI Whisper API
    const whisperFormData = new FormData();
    whisperFormData.append("file", audioFile);
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("language", "en");

    const whisperResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: whisperFormData,
      },
    );

    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      console.error(
        `Whisper API error (${whisperResponse.status}):`,
        error,
      );
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 500 },
      );
    }

    const result = (await whisperResponse.json()) as { text: string };
    return NextResponse.json({ transcript: result.text });
  } catch (err) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: "Transcription service error" },
      { status: 500 },
    );
  }
}
