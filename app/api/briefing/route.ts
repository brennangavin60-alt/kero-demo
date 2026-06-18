import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type BriefingResponse =
  | {
      type: "answer";
      answer: string;
    }
  | {
      type: "clarification";
      message: string;
    }
  | {
      type: "proposal";
      message: string;
      proposal: {
        action:
          | "add_note"
          | "update_aml"
          | "advance_stage"
          | "set_stage"
          | "update_key_date"
          | "update_client"
          | "set_letter_status"
          | "add_calendar_event"
          | "add_time_entry"
          | "add_expense"
          | "generate_invoice"
          | "update_invoice_status"
          | "toggle_matter_checklist"
          | "add_matter_checklist_item"
          | "add_timeline_entry"
          | "run_conflict_check";
        targetType: "matter" | "client" | "invoice" | "calendar" | "timeline" | "conflict";
        targetId: string;
        targetLabel: string;
        field: string;
        fieldLabel: string;
        currentValue: string;
        newValue: string;
        payload: {
          noteBody?: string;
          amlField?:
            | "photoIdReceived"
            | "proofOfAddressReceived"
            | "sourceOfFundsReceived"
            | "verified";
          amlValue?: boolean;
          stageIndex?: number;
          keyDateField?: "closingDate" | "limitationDate";
          dateValue?: string;
          clientField?: "address" | "phone" | "email";
          clientValue?: string;
          letterId?: string;
          letterTitle?: string;
          letterStatus?: "Drafted" | "Sent" | "Awaiting Response";
          calendarTitle?: string;
          calendarType?: "closing" | "limitation" | "court" | "invoice" | "custom";
          calendarDate?: string;
          calendarTime?: string;
          calendarNotes?: string;
          calendarMatterId?: string;
          timeDescription?: string;
          timeDate?: string;
          durationHours?: number;
          hourlyRate?: number;
          billable?: boolean;
          expenseDescription?: string;
          expenseDate?: string;
          expenseAmount?: number;
          invoiceId?: string;
          invoiceStatus?: "Draft" | "Sent" | "Paid" | "Overdue";
          vatEnabled?: boolean;
          dueDate?: string;
          matterChecklistItemId?: string;
          matterChecklistLabel?: string;
          matterChecklistCompleted?: boolean;
          customChecklistLabel?: string;
          timelineDescription?: string;
          conflictQueries?: string[];
        };
      };
    };

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured in .env.local." },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    question?: string;
    messages?: ChatMessage[];
    context?: unknown;
  };
  const question = body.question?.trim();

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  const contextJson = JSON.stringify(body.context ?? {}, null, 2);
  const previousMessages = (body.messages ?? [])
    .slice(-8)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are Kero AI, an assistant for an Irish solicitor using Kero.

You can do two things:
1. Answer natural language questions using only the Kero context provided.
2. If the solicitor asks for a supported data change, propose the change for confirmation. Never claim you changed data yourself.

Matter priority:
- Treat active matters as the default priority. In Kero, active means any matter whose status is not "Closed".
- When the solicitor asks about a client, that client's file, outstanding work, what needs attention, or "their matters", focus on active matters first and do not mention closed matters unless the solicitor explicitly asks for closed/old/all matters, asks about history, or appears confused because there are multiple possible files.
- If a client has active and closed matters, answer from the active matters and briefly say there are closed matters available if they want the full history.
- If a client has no active matters, say there are no active matters and then summarise the most relevant closed matter only if useful.
- For change requests, prefer matching active matters over closed matters when a client name or file description could match more than one matter. Ask a clarification if multiple active matters match.

Supported changes:
- add_note: add a note to a matter
- update_aml: set photoIdReceived, proofOfAddressReceived, sourceOfFundsReceived, or verified on a matter AML checklist
- advance_stage: advance a matter to its next stage
- set_stage: change a matter to a specific stage by index
- update_key_date: update a conveyancing/purchase closingDate or litigation limitationDate
- update_client: update a client address, phone, or email
- set_letter_status: mark a generated letter Drafted, Sent, or Awaiting Response
- add_calendar_event: add a manual calendar event, optionally linked to a matter
- add_time_entry: log time on a matter
- add_expense: log an expense on a matter
- generate_invoice: generate a draft invoice for a matter from billable time/expenses
- update_invoice_status: mark an invoice Draft, Sent, Paid, or Overdue
- toggle_matter_checklist: tick or untick a practical matter checklist item
- add_matter_checklist_item: add a custom practical matter checklist item to a matter
- add_timeline_entry: add a read-only audit/timeline entry to a matter
- run_conflict_check: run a conflict check for a matter using client, counterpart, opponent, vendor, buyer, solicitor, property, and third-party search terms

For change requests:
- Identify the target matter/client/invoice/letter by matching the user's name, file reference, invoice number, or letter title against the context.
- Identify the exact field and current value.
- If the target, field, or new value is ambiguous, return a clarification instead of guessing.
- If context.settings.keroAi.canPerformActions is false, do not return a proposal. Answer that action changes are disabled in Settings and provide read-only guidance instead.
- For dates, output payload.dateValue in YYYY-MM-DD format. If the date is ambiguous, ask a clarification.
- For set_stage, output payload.stageIndex using the allStages array from context.
- For advance_stage, set targetType to "matter" and field to "stage".
- For letter status changes, use the exact letter id from matter.letters as payload.letterId.
- For invoice status changes, use the exact invoice id as payload.invoiceId and targetType "invoice".
- For matter checklist item changes, use the exact item id from matter.matterChecklist.items as payload.matterChecklistItemId.
- For custom checklist items, use targetType "matter" and payload.customChecklistLabel.
- For calendar events, use payload.calendarDate in YYYY-MM-DD, payload.calendarTime in 24-hour HH:MM when the solicitor gives a time, payload.calendarType as closing|limitation|court|invoice|custom, and payload.calendarMatterId when linked to a matter.
- For time and expense logging, use targetType "matter" and the exact matter id.
- For timeline entries, use targetType "matter", targetId as the exact matter id, and payload.timelineDescription.
- For conflict checks, use targetType "matter", targetId as the exact matter id, and payload.conflictQueries when the user specifies names/terms. If the user just asks to run the matter conflict check, use the matter id and let the app derive search terms from the matter data.
- Do not propose unsupported changes.

Payload requirements:
- add_note: payload.noteBody must contain the exact note text to add.
- update_aml: payload.amlField must be one of photoIdReceived, proofOfAddressReceived, sourceOfFundsReceived, verified; payload.amlValue must be true or false.
- advance_stage: payload may be empty.
- set_stage: payload.stageIndex must be the zero-based target stage index.
- update_key_date: payload.keyDateField must be closingDate or limitationDate; payload.dateValue must be YYYY-MM-DD.
- update_client: payload.clientField must be address, phone, or email; payload.clientValue must contain the new value.
- set_letter_status: payload.letterId must be the generated letter id; payload.letterStatus must be Drafted, Sent, or Awaiting Response.
- add_calendar_event: payload.calendarTitle, payload.calendarType, and payload.calendarDate are required; payload.calendarTime, payload.calendarMatterId, and payload.calendarNotes are optional.
- add_time_entry: payload.timeDescription and payload.durationHours are required; payload.timeDate, payload.hourlyRate, and payload.billable are optional.
- add_expense: payload.expenseDescription and payload.expenseAmount are required; payload.expenseDate and payload.billable are optional.
- generate_invoice: targetId must be the matter id; payload.vatEnabled and payload.dueDate are optional.
- update_invoice_status: payload.invoiceId and payload.invoiceStatus are required.
- toggle_matter_checklist: targetId must be the matter id; payload.matterChecklistItemId and payload.matterChecklistCompleted are required.
- add_matter_checklist_item: targetId must be the matter id; payload.customChecklistLabel is required.
- add_timeline_entry: payload.timelineDescription is required.
- run_conflict_check: targetId must be the matter id; payload.conflictQueries is optional.

Current Kero context may include:
- settings, including dashboard widget settings, Kero AI read-only/action settings, notification warning periods, letter defaults, matter defaults, billing defaults, and appearance
- clients, matters, stages, AML checklist status, practical matter checklist status/items, notes, generated letter statuses/sent timestamps, custom templates
- time entries, expenses, invoices and invoice due dates/statuses
- calendar events, including manually added court dates, scheduled meeting times, and linked matter dates
- timeline events and conflict check logs
- recently viewed matters

Use this context for both answers and proposals. For informational requests, summarise the real data and reference file references, client names, stages, dates, event times, AML status, notes, letter sent status, conflict-check results, time/billing data, calendar events, and timeline events where relevant.

Return JSON only. Use one of these shapes:
{"type":"answer","answer":"concise useful answer"}
{"type":"clarification","message":"specific question to resolve ambiguity"}
{"type":"proposal","message":"brief explanation","proposal":{"action":"add_note|update_aml|advance_stage|set_stage|update_key_date|update_client|set_letter_status|add_calendar_event|add_time_entry|add_expense|generate_invoice|update_invoice_status|toggle_matter_checklist|add_matter_checklist_item|add_timeline_entry|run_conflict_check","targetType":"matter|client|invoice|calendar|timeline|conflict","targetId":"exact id from context","targetLabel":"client, matter, invoice, timeline, or conflict-check label","field":"machine field name","fieldLabel":"human field name","currentValue":"current value","newValue":"new value","payload":{}}}

Be conversational, concise, and practical. Do not invent facts. If the data does not contain the answer, say what is missing.`
        },
        {
          role: "user",
          content: `Current date: ${new Date().toISOString().slice(0, 10)}\n\nFull Kero context from localStorage:\n${contextJson}`
        },
        ...previousMessages,
        {
          role: "user",
          content: question
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? "OpenAI Kero AI request failed." },
      { status: response.status }
    );
  }

  const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
  return NextResponse.json(parseBriefingResponse(content));
}

function parseBriefingResponse(content: string): BriefingResponse {
  try {
    const parsed = JSON.parse(content) as Partial<BriefingResponse>;

    if (parsed.type === "proposal" && parsed.proposal) {
      return {
        type: "proposal",
        message: parsed.message || "I found a supported change. Please confirm it first.",
        proposal: parsed.proposal
      } as BriefingResponse;
    }

    if (parsed.type === "clarification") {
      return {
        type: "clarification",
        message: parsed.message || "Could you clarify what you want changed?"
      };
    }

    if (parsed.type === "answer") {
      return {
        type: "answer",
        answer: parsed.answer || ""
      };
    }
  } catch {
    return {
      type: "answer",
      answer: content
    };
  }

  return {
    type: "answer",
    answer: content
  };
}
