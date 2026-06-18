import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured in .env.local." },
      { status: 500 }
    );
  }

  const body = (await request.json()) as { matterDescription?: string };
  const matterDescription = body.matterDescription?.trim();

  if (!matterDescription) {
    return NextResponse.json({ error: "Matter description is required." }, { status: 400 });
  }

  const prompt = `You are an Irish solicitor's legal research assistant. The solicitor has received the following instruction from a client: ${matterDescription}. Research and summarise in plain English: the relevant Irish law, applicable legislation, legal remedies available to the client, and likely outcome. Keep it concise and practical.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? "OpenAI research request failed." },
      { status: response.status }
    );
  }

  const summary = data?.choices?.[0]?.message?.content?.trim() ?? "";
  return NextResponse.json({ summary });
}
