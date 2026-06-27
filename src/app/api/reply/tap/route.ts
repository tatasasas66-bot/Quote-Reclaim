import { type NextRequest, NextResponse } from "next/server";
import { submitOneTapReply } from "@/app/reply/[token]/actions";
import { ONE_TAP_CHOICES } from "@/lib/quotes/one-tap-choices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { token?: unknown; option?: unknown };
  try {
    body = (await request.json()) as { token?: unknown; option?: unknown };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  const option = typeof body.option === "string" ? body.option : "";
  const choice = ONE_TAP_CHOICES.find((item) => item.id === option);
  if (!token || !choice) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await submitOneTapReply({
    token,
    answerType: choice.answerType,
    questionText: choice.questionText,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
