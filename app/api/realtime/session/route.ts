import { NextResponse } from "next/server";
import { KERO_AI_VOICE_OPTIONS, validKeroAiVoice } from "@/lib/settings";

export const runtime = "nodejs";

const DEFAULT_REALTIME_MODELS = [
  "gpt-realtime-2",
  "gpt-realtime-1.5",
  "gpt-4o-realtime-preview"
];
const DEFAULT_REALTIME_VOICE = "verse";
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const MAX_CONTEXT_CHARS = 120_000;
const REALTIME_VOICE_LABELS = new Map<string, string>(
  KERO_AI_VOICE_OPTIONS.map((voice) => [voice.value, voice.label])
);

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured in .env.local." },
      { status: 500 }
    );
  }

  const form = await request.formData().catch(() => null);
  const offerSdp = String(form?.get("sdp") || "");
  const context = parseContext(String(form?.get("context") || ""));
  const requestedVoice = String(form?.get("voice") || "");
  if (!offerSdp.trim()) {
    return NextResponse.json(
      { error: "Realtime SDP offer is required." },
      { status: 400 }
    );
  }

  const modelCandidates = getRealtimeModelCandidates();
  const voice = getRealtimeVoice(requestedVoice);

  const modelErrors: string[] = [];
  for (const model of modelCandidates) {
    const session = buildRealtimeSession({ model, voice, context });
    const openAiForm = new FormData();
    openAiForm.set("sdp", offerSdp);
    openAiForm.set("session", JSON.stringify(session));

    const response = await fetch(REALTIME_CALLS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: openAiForm
    });

    const text = await response.text();
    if (response.ok) {
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "application/sdp",
          "X-Kero-Realtime-Model": model,
          "X-Kero-Realtime-Voice": REALTIME_VOICE_LABELS.get(voice) ?? voice
        }
      });
    }

    const errorMessage = getOpenAiErrorMessage(text, response.status);
    if (!isRetryableModelError(errorMessage)) {
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }
    modelErrors.push(`${model}: ${errorMessage}`);
  }

  return NextResponse.json(
    {
      error: `None of the configured Realtime models are available to this API key. Tried: ${modelErrors.join(" | ")}`
    },
    { status: 404 }
  );
}

function getRealtimeModelCandidates() {
  const configuredModels = splitModelList(process.env.OPENAI_REALTIME_MODEL);
  return Array.from(new Set([...configuredModels, ...DEFAULT_REALTIME_MODELS]));
}

function splitModelList(value?: string) {
  if (!value) return [];
  return value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function getRealtimeVoice(requestedVoice: string) {
  const selectedVoice = requestedVoice.trim();
  if (validKeroAiVoice(selectedVoice)) return selectedVoice;

  const configuredVoice = process.env.OPENAI_REALTIME_VOICE?.trim();
  if (configuredVoice) return configuredVoice;

  return DEFAULT_REALTIME_VOICE;
}

function buildRealtimeSession({
  model,
  voice,
  context
}: {
  model: string;
  voice: string;
  context: unknown;
}) {
  return {
    type: "realtime",
    model,
    instructions: buildRealtimeInstructions(context),
    audio: {
      input: {
        transcription: {
          model: "gpt-4o-mini-transcribe"
        },
        turn_detection: {
          type: "server_vad",
          create_response: true,
          interrupt_response: true,
          silence_duration_ms: 650,
          prefix_padding_ms: 300
        }
      },
      output: {
        voice
      }
    }
  };
}

function buildRealtimeInstructions(context: unknown) {
  const contextJson = safeContextJson(context);
  return `You are Kero AI, a real-time voice assistant for an Irish solicitor using Kero.

Speak naturally and concisely. This is voice mode, so prefer short spoken answers, ask one clarifying question at a time, and avoid long lists unless asked.

Use only the Kero context provided below. You may brief the solicitor on matters, clients, stages, AML, matter checklists, notes, key dates, letters, calendar events with dates and scheduled times, time, expenses, invoices, conflict checks, and timeline entries.

Treat active matters as the default priority. In Kero, active means any matter whose status is not "Closed". When the solicitor asks about a client, their file, outstanding work, or their matters, focus on active matters first and do not mention closed matters unless the solicitor explicitly asks for closed, old, historical, or all matters, or seems confused because several files match. If there are active and closed matters for the same client, answer from the active matters and briefly mention that closed matters exist only if that helps. If there are no active matters, say so before summarising any closed matter.

Voice mode can brief the solicitor conversationally. If the solicitor asks you to create a data change by voice, the Kero app will prepare an on-screen confirmation card using the same safe action flow as text mode. You may briefly say that you are preparing the confirmation card and that the solicitor can say confirm or cancel. Do not claim to update data directly unless the app has already confirmed a pending card.

If interrupted, stop and listen.

Current Kero localStorage context:
${contextJson}`;
}

function parseContext(value: string) {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function safeContextJson(context: unknown) {
  const json = JSON.stringify(context ?? {}, null, 2);
  if (json.length <= MAX_CONTEXT_CHARS) return json;
  return `${json.slice(0, MAX_CONTEXT_CHARS)}\n\n...[context truncated for voice session]`;
}

function getOpenAiErrorMessage(text: string, status: number) {
  if (!text.trim()) return `OpenAI Realtime request failed with status ${status}.`;
  try {
    const data = JSON.parse(text) as { error?: { message?: string } };
    if (data.error?.message) return data.error.message;
  } catch {
    return text;
  }
  return text;
}

function isRetryableModelError(message: string) {
  const value = message.toLowerCase();
  return (
    value.includes("model") &&
    (value.includes("does not exist") ||
      value.includes("do not have access") ||
      value.includes("doesn't exist") ||
      value.includes("not found") ||
      value.includes("unsupported"))
  );
}
