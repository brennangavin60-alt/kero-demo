"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Clipboard,
  Download,
  FileText,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneOff,
  Plus,
  Printer,
  Radio,
  Search,
  Send,
  UserRound,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { KeroLogo } from "@/components/kero-logo";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/billing";
import { formatEventTime, timeKey } from "@/lib/calendar";
import { formatDisplayDate, isWithinMonths } from "@/lib/dates";
import { buildDefaultMatterChecklist } from "@/lib/matter-checklists";
import { getKeroAiGreeting } from "@/lib/personalisation";
import { KERO_AI_VOICE_OPTIONS } from "@/lib/settings";
import { getCurrentStage, getMatterTitle, getStages, MATTER_LABELS } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import { getAmlStatus, getLetters, makeLetterVariables } from "@/lib/templates";
import type {
  CalendarEventType,
  Client,
  InvoiceStatus,
  KeroState,
  LetterStatus,
  Matter,
  MatterStatus
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  buildFilledWordTemplateHtml,
  downloadHtmlAsPdf,
  letterTextToHtml,
  pdfFileName,
  printHtmlAsPdf
} from "@/lib/word-templates";

type ActionProposal = {
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
    letterStatus?: LetterStatus;
    calendarTitle?: string;
    calendarType?: CalendarEventType;
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
    invoiceStatus?: InvoiceStatus;
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: "text" | "voice";
  proposal?: ActionProposal;
  proposalStatus?: "pending" | "confirmed" | "cancelled";
  documentAttachment?: DocumentAttachment;
};

type DocumentAttachment = {
  matterId: string;
  clientId: string;
  letterId: string;
  letterTitle: string;
  clientName: string;
  fileReference: string;
  matterTitle: string;
  createdAt: string;
};

type BriefingApiResponse =
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
      proposal: ActionProposal;
    }
  | {
      error: string;
    };

const suggestedPrompts = [
  {
    label: "Give me a briefing on all urgent matters",
    prompt: "Give me a briefing on all urgent matters",
    action: "send"
  },
  {
    label: "What's outstanding across my active files?",
    prompt: "What's outstanding across my active files?",
    action: "send"
  },
  {
    label: "Summarise [client name]'s file",
    prompt: "Summarise [client name]'s file",
    action: "fill"
  },
  {
    label: "What do I need to do today?",
    prompt: "What do I need to do today?",
    action: "send"
  },
  {
    label: "Any matters with AML or limitation date issues?",
    prompt: "Any matters with AML or limitation date issues?",
    action: "send"
  }
] as const;

const AI_LEGACY_CHAT_STORAGE_KEY = "kero-ai-chat-v1";
const AI_CONVERSATIONS_STORAGE_KEY = "kero-ai-conversations-v1";
const MAX_SAVED_MESSAGES = 40;
const MAX_SAVED_CONVERSATIONS = 50;

type KeroAiChatProps = {
  variant?: "page" | "panel";
};

type RealtimeVoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
type ProposalCommand = "confirm" | "cancel";
type ProposalCommandResult =
  | { handled: false }
  | { handled: true; command: ProposalCommand };

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex?: number;
        results: ArrayLike<{
          isFinal: boolean;
          0?: { transcript?: string };
        }>;
      }) => void)
    | null;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type SavedConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export function AiBriefing() {
  return <KeroAiChat />;
}

function createWelcomeMessage(content?: string): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content:
      content ??
      "Hi, what can I help with?\n\nAsk me about your Kero matters or ask me to prepare changes. I can brief you on files, find risks, and propose updates to notes, AML, stages, dates, or client contact details for you to confirm."
  };
}

function makeConversationId() {
  return `conversation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getSavableMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.id !== "welcome")
    .slice(-MAX_SAVED_MESSAGES);
}

function sanitiseMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (message): message is ChatMessage =>
        message?.id !== "welcome" &&
        typeof message?.id === "string" &&
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message.content === "string"
    )
    .slice(-MAX_SAVED_MESSAGES);
}

function getConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const source = firstUserMessage?.content || messages[0]?.content || "New conversation";
  const singleLine = source.replace(/\s+/g, " ").trim();
  if (!singleLine) return "New conversation";
  return singleLine.length > 54 ? `${singleLine.slice(0, 54)}...` : singleLine;
}

function createConversation(messages: ChatMessage[], createdAt = new Date().toISOString()): SavedConversation {
  const savableMessages = getSavableMessages(messages);
  return {
    id: makeConversationId(),
    title: getConversationTitle(savableMessages),
    createdAt,
    updatedAt: createdAt,
    messages: savableMessages
  };
}

function savedDataEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortConversations(conversations: SavedConversation[]) {
  return [...conversations]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_SAVED_CONVERSATIONS);
}

function saveConversations(conversations: SavedConversation[]) {
  const sortedConversations = sortConversations(conversations);
  console.log("[Kero AI] saving chat history to localStorage", {
    key: AI_CONVERSATIONS_STORAGE_KEY,
    conversations: sortedConversations.length,
    voiceConversations: sortedConversations.filter(conversationHasVoice).length
  });
  window.localStorage.setItem(
    AI_CONVERSATIONS_STORAGE_KEY,
    JSON.stringify(sortedConversations)
  );
}

function loadSavedConversations() {
  try {
    const stored = window.localStorage.getItem(AI_CONVERSATIONS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as SavedConversation[];
      if (Array.isArray(parsed)) {
        return sortConversations(
          parsed
            .map((conversation) => ({
              id: typeof conversation?.id === "string" ? conversation.id : makeConversationId(),
              title:
                typeof conversation?.title === "string" && conversation.title.trim()
                  ? conversation.title.trim()
                  : getConversationTitle(sanitiseMessages(conversation?.messages)),
              createdAt:
                typeof conversation?.createdAt === "string"
                  ? conversation.createdAt
                  : new Date().toISOString(),
              updatedAt:
                typeof conversation?.updatedAt === "string"
                  ? conversation.updatedAt
                  : new Date().toISOString(),
              messages: sanitiseMessages(conversation?.messages)
            }))
            .filter((conversation) => conversation.messages.length > 0)
        );
      }
    }

    const legacyStored = window.localStorage.getItem(AI_LEGACY_CHAT_STORAGE_KEY);
    const legacyMessages = sanitiseMessages(legacyStored ? JSON.parse(legacyStored) : []);
    if (legacyMessages.length > 0) {
      const migrated = [
        createConversation(legacyMessages, new Date().toISOString())
      ];
      saveConversations(migrated);
      window.localStorage.removeItem(AI_LEGACY_CHAT_STORAGE_KEY);
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

function getConversationPreview(conversation: SavedConversation) {
  const lastMessage = [...conversation.messages].reverse().find((message) => message.content.trim());
  return lastMessage?.content.replace(/\s+/g, " ").trim() || "No messages yet";
}

function conversationHasVoice(conversation: SavedConversation) {
  return conversation.messages.some((message) => message.mode === "voice");
}

function conversationMatchesSearch(conversation: SavedConversation, query: string) {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  const haystack = [
    conversation.title,
    conversationHasVoice(conversation) ? "voice microphone spoken transcript" : "text chat",
    conversation.createdAt,
    conversation.updatedAt,
    ...conversation.messages.flatMap((message) => [
      message.content,
      message.proposal?.targetLabel,
      message.proposal?.fieldLabel,
      message.proposal?.newValue,
      message.documentAttachment?.letterTitle,
      message.documentAttachment?.clientName,
      message.documentAttachment?.fileReference,
      message.documentAttachment?.matterTitle
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved conversation";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function upsertConversation(
  conversations: SavedConversation[],
  activeConversationId: string,
  messages: ChatMessage[]
) {
  const savableMessages = getSavableMessages(messages);
  if (savableMessages.length === 0) {
    return conversations.filter((conversation) => conversation.id !== activeConversationId);
  }

  const existing = conversations.find((conversation) => conversation.id === activeConversationId);
  if (existing && savedDataEqual(existing.messages, savableMessages)) return conversations;

  const now = new Date().toISOString();
  const conversation: SavedConversation = {
    id: activeConversationId,
    title: getConversationTitle(savableMessages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    messages: savableMessages
  };

  return sortConversations([
    conversation,
    ...conversations.filter((item) => item.id !== activeConversationId)
  ]);
}

function ConversationSidebar({
  conversations,
  activeConversationId,
  search,
  loading,
  onSearch,
  onNewConversation,
  onSelectConversation,
  onClose,
  className
}: {
  conversations: SavedConversation[];
  activeConversationId: string;
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onNewConversation: () => void;
  onSelectConversation: (conversation: SavedConversation) => void;
  onClose?: () => void;
  className?: string;
}) {
  const filteredConversations = conversations.filter((conversation) =>
    conversationMatchesSearch(conversation, search)
  );

  return (
    <aside
      id="kero-ai-conversation-sidebar"
      className={cn("flex min-h-0 flex-col rounded-md border bg-slate-50/80 p-3", className)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Past conversations</h2>
          <p className="text-xs text-muted-foreground">{conversations.length} saved</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={onNewConversation}
            disabled={loading}
            aria-label="Start new Kero AI conversation"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Hide past conversations"
              title="Hide past conversations"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search chats"
          className="pl-9"
        />
      </label>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conversation) => {
            const active = conversation.id === activeConversationId;
            const hasVoice = conversationHasVoice(conversation);
            const ConversationIcon = hasVoice ? Mic : MessageSquareText;
            return (
              <button
                key={conversation.id}
                type="button"
                disabled={loading}
                onClick={() => onSelectConversation(conversation)}
                className={cn(
                  "w-full rounded-md border bg-white p-3 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-60",
                  active && "border-primary bg-primary text-white hover:bg-primary"
                )}
              >
                <span className="flex items-start gap-2">
                  <ConversationIcon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      active ? "text-white/80" : "text-primary"
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {hasVoice ? "Voice: " : ""}
                      {conversation.title}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block line-clamp-2 text-xs leading-5",
                        active ? "text-white/75" : "text-muted-foreground"
                      )}
                    >
                      {getConversationPreview(conversation)}
                    </span>
                    <span
                      className={cn(
                        "mt-2 block text-xs",
                        active ? "text-white/60" : "text-muted-foreground"
                      )}
                    >
                      {formatConversationDate(conversation.updatedAt)}
                    </span>
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed bg-white px-3 py-6 text-center">
            <MessageSquareText className="mx-auto mb-2 h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-slate-950">
              {search.trim() ? "No matching chats" : "No saved chats yet"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {search.trim()
                ? "Try a client name, file reference, or phrase from the conversation."
                : "Ask Kero AI something and it will be saved here."}
            </p>
          </div>
        )
        }
      </div>
    </aside>
  );
}

export function KeroAiChat({ variant = "page" }: KeroAiChatProps) {
  const {
    state,
    hydrated,
    addNote,
    updateAml,
    advanceStage,
    updateMatter,
    updateClient,
    toggleMatterChecklistItem,
    addMatterChecklistItem,
    setLetterStatus,
    addTimeEntry,
    addExpense,
    generateInvoice,
    updateInvoiceStatus,
    addCalendarEvent,
    addTimelineEvent,
    runConflictCheck,
    hasPermission,
    updateSettings
  } = useKeroStore();
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage()]);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState(makeConversationId);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationSidebarOpen, setConversationSidebarOpen] = useState(true);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [realtimeSupported, setRealtimeSupported] = useState(false);
  const [realtimeVoiceActive, setRealtimeVoiceActive] = useState(false);
  const [realtimeVoiceStatus, setRealtimeVoiceStatus] =
    useState<RealtimeVoiceStatus>("idle");
  const [realtimeVoiceError, setRealtimeVoiceError] = useState("");
  const [realtimeUserTranscript, setRealtimeUserTranscript] = useState("");
  const [realtimeAiTranscript, setRealtimeAiTranscript] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const proposalCommandHandlerRef = useRef<
    (text: string, source: "text" | "voice") => ProposalCommandResult
  >(() => ({ handled: false }));
  const voiceTranscriptHandlerRef = useRef<(text: string) => void>(() => undefined);
  const pendingRealtimeAssistantEchoRef = useRef("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const loadedConversationsRef = useRef(false);
  const realtimeAudioRef = useRef<HTMLAudioElement>(null);
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeDataChannelRef = useRef<RTCDataChannel | null>(null);
  const realtimeMicStreamRef = useRef<MediaStream | null>(null);
  const isPanel = variant === "panel";

  useEffect(() => {
    if (isPanel) return;
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const syncSidebar = () => setConversationSidebarOpen(!mediaQuery.matches);
    syncSidebar();
    mediaQuery.addEventListener("change", syncSidebar);
    return () => mediaQuery.removeEventListener("change", syncSidebar);
  }, [isPanel]);

  const briefingContext = useMemo(() => buildBriefingContext(state), [state]);
  const selectedRealtimeVoice =
    KERO_AI_VOICE_OPTIONS.find((voice) => voice.value === state.settings.keroAi.voice) ??
    KERO_AI_VOICE_OPTIONS[0];
  const aiActionsEnabled = state.settings.keroAi.canPerformActions && hasPermission("useKeroAiActions");
  const welcomeContent = useMemo(
    () => {
      const configured = state.settings.keroAi.openingMessage.trim();
      const greeting = configured || getKeroAiGreeting(state.settings);
      const actionText = aiActionsEnabled
        ? "I can brief you on files, find risks, and propose updates to notes, AML, matter checklists, stages, dates, client contact details, letters, calendar events, time, expenses, invoices, conflict checks, and timeline entries for you to confirm."
        : "I can brief you on files and find risks, but action changes are disabled by Settings or your role.";
      return `${greeting}\n\nAsk me about your Kero matters. ${actionText} You can also start Voice Mode for a live spoken briefing.`;
    },
    [aiActionsEnabled, state.settings]
  );

  const stopSpeaking = useCallback(() => {
    if (!speechSynthesisSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [speechSynthesisSupported]);

  const speakText = useCallback(
    (text: string) => {
      if (!speechSynthesisSupported) return;
      const cleanText = cleanTextForSpeech(text);
      if (!cleanText) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "en-IE";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [speechSynthesisSupported]
  );

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !speechRecognitionSupported) {
      setVoiceError("Voice dictation is not supported in this browser.");
      return;
    }
    try {
      if (listening) {
        recognition.stop();
        return;
      }
      setVoiceError("");
      setInterimTranscript("");
      recognition.start();
    } catch {
      setVoiceError("The microphone could not be started. Try again or check browser permissions.");
    }
  }, [listening, speechRecognitionSupported]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    proposalCommandHandlerRef.current = handlePendingProposalCommand;
    voiceTranscriptHandlerRef.current = handleRealtimeUserTranscript;
  });

  useEffect(() => {
    setRealtimeSupported(
      Boolean(
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
          typeof RTCPeerConnection !== "undefined"
      )
    );
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechRecognitionSupported(Boolean(SpeechRecognition));
    setSpeechSynthesisSupported(
      "speechSynthesis" in window && "SpeechSynthesisUtterance" in window
    );

    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IE";
    recognition.onstart = () => {
      setListening(true);
      setVoiceError("");
    };
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };
    recognition.onerror = (event) => {
      setListening(false);
      setInterimTranscript("");
      setVoiceError(getSpeechRecognitionError(event.error));
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText.trim()) {
        const proposalCommand = proposalCommandHandlerRef.current(finalText.trim(), "voice");
        if (proposalCommand.handled) {
          setInterimTranscript("");
          return;
        }
        setQuestion((current) =>
          [current.trim(), finalText.trim()].filter(Boolean).join(" ")
        );
      }
      setInterimTranscript(interimText.trim());
    };
    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!voiceRepliesEnabled || !speechSynthesisSupported) return;
    const lastMessage = messages[messages.length - 1];
    if (
      !lastMessage ||
      lastMessage.id === "welcome" ||
      lastMessage.role !== "assistant" ||
      lastMessage.id === lastSpokenMessageIdRef.current
    ) {
      return;
    }
    lastSpokenMessageIdRef.current = lastMessage.id;
    speakText(lastMessage.content);
  }, [messages, speakText, speechSynthesisSupported, voiceRepliesEnabled]);

  useEffect(() => {
    if (voiceRepliesEnabled || !speechSynthesisSupported) return;
    stopSpeaking();
  }, [speechSynthesisSupported, stopSpeaking, voiceRepliesEnabled]);

  useEffect(() => {
    return () => {
      realtimeDataChannelRef.current?.close();
      realtimePeerRef.current?.close();
      realtimeMicStreamRef.current?.getTracks().forEach((track) => track.stop());
      realtimeDataChannelRef.current = null;
      realtimePeerRef.current = null;
      realtimeMicStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || loadedConversationsRef.current) return;
    loadedConversationsRef.current = true;
    const savedConversations = loadSavedConversations();
    const latestConversation = savedConversations[0];
    setConversations(savedConversations);
    if (latestConversation) {
      setActiveConversationId(latestConversation.id);
      setMessages([createWelcomeMessage(welcomeContent), ...latestConversation.messages]);
      return;
    }
    setActiveConversationId(makeConversationId());
    setMessages([createWelcomeMessage(welcomeContent)]);
  }, [hydrated, welcomeContent]);

  useEffect(() => {
    if (!hydrated) return;
    setMessages((current) =>
      current.map((message) =>
        message.id === "welcome" ? { ...message, content: welcomeContent } : message
      )
    );
  }, [hydrated, welcomeContent]);

  useEffect(() => {
    if (!hydrated || !loadedConversationsRef.current) return;
    setConversations((current) => {
      const next = upsertConversation(current, activeConversationId, messages);
      if (next === current || savedDataEqual(next, current)) return current;
      saveConversations(next);
      return next;
    });
  }, [activeConversationId, hydrated, messages]);

  function commitMessages(
    updater: (current: ChatMessage[]) => ChatMessage[],
    reason: string
  ) {
    const nextMessages = updater(messagesRef.current);
    messagesRef.current = nextMessages;
    setMessages(nextMessages);

    if (!hydrated || !loadedConversationsRef.current) return nextMessages;
    setConversations((current) => {
      const nextConversations = upsertConversation(
        current,
        activeConversationId,
        nextMessages
      );
      if (nextConversations === current || savedDataEqual(nextConversations, current)) {
        return current;
      }
      console.log("[Kero AI] committing chat messages", {
        reason,
        activeConversationId,
        messages: getSavableMessages(nextMessages).length,
        voiceMessages: getSavableMessages(nextMessages).filter(
          (message) => message.mode === "voice"
        ).length
      });
      saveConversations(nextConversations);
      return nextConversations;
    });
    return nextMessages;
  }

  function appendCommittedMessage(message: ChatMessage, reason: string) {
    commitMessages((current) => [...current, message], reason);
  }

  function handlePendingProposalCommand(
    rawText: string,
    source: "text" | "voice"
  ): ProposalCommandResult {
    const command = getProposalCommand(rawText);
    if (!command || loading) return { handled: false };
    const pendingProposal = findLatestPendingProposal(messagesRef.current);
    if (!pendingProposal) return { handled: false };

    const userMessage: ChatMessage = {
      id: makeMessageId("user"),
      role: "user",
      content: command === "confirm" ? "Confirm" : "Cancel",
      mode: source === "voice" ? "voice" : "text"
    };
    if (source === "voice") {
      appendCommittedMessage(userMessage, "voice-proposal-command");
    } else {
      setMessages((current) => [...current, userMessage]);
    }
    setQuestion("");
    if (source === "voice" || listening) recognitionRef.current?.stop();

    if (command === "confirm") {
      confirmProposal(pendingProposal.id, pendingProposal.proposal, source === "voice" ? "voice" : "text");
    } else {
      cancelProposal(pendingProposal.id, source === "voice" ? "voice" : "text");
      const cancelMessage = "Cancelled. No data was changed.";
      const assistantMessage: ChatMessage = {
        id: makeMessageId("assistant"),
        role: "assistant",
        content: cancelMessage,
        mode: source === "voice" ? "voice" : "text"
      };
      if (source === "voice") {
        appendCommittedMessage(assistantMessage, "voice-proposal-cancelled");
      } else {
        setMessages((current) => [...current, assistantMessage]);
      }
    }

    return { handled: true, command };
  }

  async function sendQuestion(rawQuestion: string, mode: "text" | "voice" = "text") {
    const prompt = rawQuestion.trim();
    if (!prompt || loading) return;
    if (handlePendingProposalCommand(prompt, mode).handled) return;
    if (mode === "text" && listening) recognitionRef.current?.stop();
    const previousMessages = messagesRef.current.filter((message) => message.id !== "welcome");

    const userMessage: ChatMessage = {
      id: makeMessageId("user"),
      role: "user",
      content: prompt,
      mode
    };

    const documentFetchMessage = buildDocumentFetchMessage(prompt, state, mode);
    if (documentFetchMessage) {
      commitMessages(
        (current) => [...current, userMessage, documentFetchMessage],
        "document-fetch"
      );
      setQuestion("");
      if (mode === "voice") speakRealtimeText(documentFetchMessage.content);
      return;
    }

    if (mode === "voice") {
      appendCommittedMessage(userMessage, "voice-user-action-request");
    } else {
      setMessages((current) => [...current, userMessage]);
    }
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: prompt,
          messages: previousMessages,
          context: briefingContext
        })
      });
      const data = (await response.json()) as BriefingApiResponse;

      let assistantMessage =
        !aiActionsEnabled && response.ok && "type" in data && data.type === "proposal"
          ? {
              id: makeMessageId("assistant"),
              role: "assistant" as const,
              content:
                "Kero AI action changes are currently disabled by Settings or your role. I can still explain what I found, but I will not propose edits.",
              mode
            }
          : buildAssistantMessage(data, response.ok);
      if (mode === "voice") {
        assistantMessage = {
          ...assistantMessage,
          mode: "voice",
          content:
            response.ok && "type" in data && data.type === "proposal"
              ? getVoiceProposalPrompt(data.proposal, state)
              : assistantMessage.content
        };
        appendCommittedMessage(assistantMessage, "voice-assistant-action-response");
        speakRealtimeText(assistantMessage.content);
      } else {
        setMessages((current) => [...current, assistantMessage]);
      }
    } catch {
      const errorMessage: ChatMessage = {
        id: makeMessageId("assistant"),
        role: "assistant",
        content: "The Kero AI request could not be completed. Please try again.",
        mode
      };
      if (mode === "voice") {
        appendCommittedMessage(errorMessage, "voice-assistant-error");
        speakRealtimeText(errorMessage.content);
      } else {
        setMessages((current) => [...current, errorMessage]);
      }
    } finally {
      setLoading(false);
    }
  }

  function confirmProposal(
    messageId: string,
    proposal: ActionProposal,
    mode: "text" | "voice" = "text"
  ) {
    if (!aiActionsEnabled) {
      const disabledMessage = "Kero AI action changes are disabled by Settings or your role. No data was changed.";
      if (mode === "voice") speakRealtimeText(disabledMessage);
      const assistantMessage: ChatMessage = {
        id: makeMessageId("assistant"),
        role: "assistant",
        content: disabledMessage,
        mode
      };
      if (mode === "voice") {
        appendCommittedMessage(assistantMessage, "voice-actions-disabled");
      } else {
        setMessages((current) => [...current, assistantMessage]);
      }
      return;
    }

    const result = applyActionProposal(proposal, {
      state,
      addNote,
      updateAml,
      advanceStage,
      updateMatter,
      updateClient,
      toggleMatterChecklistItem,
      addMatterChecklistItem,
      setLetterStatus,
      addTimeEntry,
      addExpense,
      generateInvoice,
      updateInvoiceStatus,
      addCalendarEvent,
      addTimelineEvent,
      runConflictCheck
    });

    const nextProposalStatus: ChatMessage["proposalStatus"] = result.ok ? "confirmed" : "pending";
    const updateProposalStatus = (current: ChatMessage[]): ChatMessage[] =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              proposalStatus: nextProposalStatus,
              content: result.ok ? message.content : `${message.content}\n\n${result.message}`
            }
          : message
      );
    if (mode === "voice") {
      commitMessages(updateProposalStatus, "voice-proposal-status");
      if (!result.ok) speakRealtimeText(result.message);
    } else {
      setMessages(updateProposalStatus);
    }

    if (result.ok) {
      getTimelineMatterIdsForProposal(proposal, state).forEach((matterId) => {
        addTimelineEvent({
          matterId,
          type: "kero_ai",
          description: describeKeroAiTimelineAction(proposal)
        });
      });
      const assistantMessage: ChatMessage = {
        id: makeMessageId("assistant"),
        role: "assistant",
        content: result.message,
        mode
      };
      if (mode === "voice") {
        appendCommittedMessage(assistantMessage, "voice-proposal-confirmed");
      } else {
        setMessages((current) => [...current, assistantMessage]);
      }
      if (mode === "voice") speakRealtimeText(result.message);
    }
  }

  function cancelProposal(messageId: string, mode: "text" | "voice" = "text") {
    const updateProposalStatus = (current: ChatMessage[]): ChatMessage[] =>
      current.map((message) =>
        message.id === messageId ? { ...message, proposalStatus: "cancelled" } : message
      );

    if (mode === "voice") {
      commitMessages(updateProposalStatus, "voice-proposal-cancelled-by-card");
      speakRealtimeText("Cancelled. No data was changed.");
      return;
    }

    setMessages(updateProposalStatus);
  }

  function handleRealtimeUserTranscript(rawTranscript: string) {
    const transcript = rawTranscript.trim();
    if (!transcript) return;
    const proposalCommand = proposalCommandHandlerRef.current(transcript, "voice");
    if (proposalCommand.handled) return;

    if (isVoiceActionRequest(transcript)) {
      sendRealtimeEvent({ type: "response.cancel" });
      setRealtimeVoiceStatus("thinking");
      void sendQuestion(transcript, "voice");
      return;
    }

    appendVoiceMessage("user", transcript);
  }

  function appendVoiceMessage(role: "user" | "assistant", content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;
    commitMessages((current) => {
      const lastMessage = current[current.length - 1];
      if (
        lastMessage?.role === role &&
        lastMessage.mode === "voice" &&
        normaliseTranscriptForCompare(lastMessage.content) === normaliseTranscriptForCompare(trimmed)
      ) {
        return current;
      }
      return [
        ...current,
        {
          id: makeMessageId(role),
          role,
          content: trimmed,
          mode: "voice"
        }
      ];
    }, role === "user" ? "voice-user-transcript" : "voice-assistant-transcript");
  }

  function speakRealtimeText(text: string) {
    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;
    pendingRealtimeAssistantEchoRef.current = normaliseTranscriptForCompare(cleanText);
    setRealtimeVoiceStatus("speaking");
    setRealtimeAiTranscript(cleanText);
    sendRealtimeEvent({ type: "response.cancel" });
    const dataChannel = realtimeDataChannelRef.current;
    if (dataChannel?.readyState === "open") {
      sendRealtimeEvent({
        type: "response.create",
        response: {
          instructions: `Say exactly this, briefly: ${cleanText}`
        }
      });
      return;
    }
    speakText(cleanText);
  }

  function fillPrompt(prompt: string) {
    setQuestion(prompt);
    inputRef.current?.focus();
  }

  function startNewConversation() {
    if (loading) return;
    setActiveConversationId(makeConversationId());
    setMessages([createWelcomeMessage(welcomeContent)]);
    setQuestion("");
    inputRef.current?.focus();
  }

  function selectConversation(conversation: SavedConversation) {
    if (loading) return;
    setActiveConversationId(conversation.id);
    setMessages([createWelcomeMessage(welcomeContent), ...conversation.messages]);
    setQuestion("");
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setConversationSidebarOpen(false);
    }
  }

  async function startRealtimeVoiceMode() {
    if (realtimeVoiceActive || realtimeVoiceStatus === "connecting") return;
    if (!realtimeSupported) {
      setRealtimeVoiceStatus("error");
      setRealtimeVoiceError("Realtime voice is unavailable in this browser. Text chat is still available.");
      return;
    }

    try {
      if (listening) recognitionRef.current?.stop();
      stopSpeaking();
      setRealtimeVoiceActive(true);
      setRealtimeVoiceStatus("connecting");
      setRealtimeVoiceError("");
      setRealtimeUserTranscript("");
      setRealtimeAiTranscript("");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      realtimeMicStreamRef.current = stream;

      const peer = new RTCPeerConnection();
      realtimePeerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream || !realtimeAudioRef.current) return;
        realtimeAudioRef.current.srcObject = remoteStream;
        realtimeAudioRef.current.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          setRealtimeVoiceStatus("error");
          setRealtimeVoiceError("Realtime voice connection dropped. Text chat is still available.");
        }
      };

      const dataChannel = peer.createDataChannel("oai-events");
      realtimeDataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        setRealtimeVoiceStatus("listening");
        sendRealtimeEvent({
          type: "response.create",
          response: {
            instructions: "Briefly say that Kero AI voice mode is on, then ask what the solicitor would like to review."
          }
        });
      };
      dataChannel.onmessage = (event) => handleRealtimeVoiceEvent(event.data);
      dataChannel.onerror = () => {
        setRealtimeVoiceStatus("error");
        setRealtimeVoiceError("Realtime voice data channel returned an error.");
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const realtimeForm = new FormData();
      realtimeForm.set("sdp", offer.sdp || "");
      realtimeForm.set("context", JSON.stringify(briefingContext));
      realtimeForm.set("voice", state.settings.keroAi.voice);

      const sdpResponse = await fetch("/api/realtime/session", {
        method: "POST",
        body: realtimeForm
      });
      if (!sdpResponse.ok) {
        throw new Error(await getRealtimeApiError(sdpResponse));
      }

      await peer.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text()
      });
    } catch (error) {
      cleanupRealtimeVoiceConnection();
      setRealtimeVoiceStatus("error");
      setRealtimeVoiceError(getRealtimeVoiceError(error));
    }
  }

  function stopRealtimeVoiceMode() {
    sendRealtimeEvent({ type: "response.cancel" });
    cleanupRealtimeVoiceConnection();
    setRealtimeVoiceActive(false);
    setRealtimeVoiceStatus("idle");
    setRealtimeVoiceError("");
    setRealtimeAiTranscript("");
    setRealtimeUserTranscript("");
  }

  function interruptRealtimeVoice() {
    sendRealtimeEvent({ type: "response.cancel" });
    setRealtimeVoiceStatus("listening");
    setRealtimeAiTranscript("");
  }

  function cleanupRealtimeVoiceConnection() {
    realtimeDataChannelRef.current?.close();
    realtimePeerRef.current?.close();
    realtimeMicStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeDataChannelRef.current = null;
    realtimePeerRef.current = null;
    realtimeMicStreamRef.current = null;
    if (realtimeAudioRef.current) realtimeAudioRef.current.srcObject = null;
    setRealtimeVoiceActive(false);
  }

  function sendRealtimeEvent(event: Record<string, unknown>) {
    const dataChannel = realtimeDataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;
    dataChannel.send(JSON.stringify(event));
  }

  function handleRealtimeVoiceEvent(rawEvent: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawEvent) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = typeof event.type === "string" ? event.type : "";
    if (type === "input_audio_buffer.speech_started") {
      setRealtimeVoiceStatus("listening");
      setRealtimeAiTranscript("");
      setRealtimeUserTranscript("");
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      setRealtimeVoiceStatus("thinking");
      return;
    }
    if (type === "conversation.item.input_audio_transcription.delta") {
      appendRealtimeTranscript("user", event.delta);
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = String(event.transcript || "");
      setRealtimeUserTranscript(transcript);
      voiceTranscriptHandlerRef.current(transcript);
      return;
    }
    if (
      type === "response.created" ||
      type === "response.audio.delta" ||
      type === "response.output_audio.delta" ||
      type === "output_audio_buffer.started"
    ) {
      setRealtimeVoiceStatus("speaking");
      return;
    }
    if (
      type === "response.audio_transcript.delta" ||
      type === "response.output_audio_transcript.delta"
    ) {
      setRealtimeVoiceStatus("speaking");
      appendRealtimeTranscript("assistant", event.delta);
      return;
    }
    if (
      type === "response.audio_transcript.done" ||
      type === "response.output_audio_transcript.done"
    ) {
      if (typeof event.transcript === "string" && event.transcript) {
        handleRealtimeAssistantTranscript(event.transcript);
      }
      return;
    }
    if (
      type === "response.done" ||
      type === "response.audio.done" ||
      type === "response.output_audio.done" ||
      type === "output_audio_buffer.stopped"
    ) {
      const transcript = extractRealtimeResponseTranscript(event);
      if (transcript) handleRealtimeAssistantTranscript(transcript);
      setRealtimeVoiceStatus((current) => (current === "error" ? current : "listening"));
      return;
    }
    if (type === "error") {
      const error = event.error as { message?: string } | undefined;
      setRealtimeVoiceStatus("error");
      setRealtimeVoiceError(error?.message || "Realtime voice returned an error.");
    }
  }

  function appendRealtimeTranscript(kind: "user" | "assistant", delta: unknown) {
    if (typeof delta !== "string" || !delta) return;
    if (kind === "user") setRealtimeUserTranscript((current) => `${current}${delta}`);
    else setRealtimeAiTranscript((current) => `${current}${delta}`);
  }

  function handleRealtimeAssistantTranscript(transcript: string) {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    setRealtimeAiTranscript(trimmed);
    const normalizedTranscript = normaliseTranscriptForCompare(trimmed);
    if (
      pendingRealtimeAssistantEchoRef.current &&
      normalizedTranscript === pendingRealtimeAssistantEchoRef.current
    ) {
      pendingRealtimeAssistantEchoRef.current = "";
      return;
    }
    appendVoiceMessage("assistant", trimmed);
  }

  if (!hydrated) return <PageSkeleton rows={isPanel ? 4 : 5} />;

  const promptButtons = (
    <div
      className={cn(
        "mb-4 flex gap-2 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-1 sm:flex-wrap",
        !isPanel && "sm:mb-3",
        isPanel && "mb-3 flex-nowrap overflow-x-auto pb-1"
      )}
    >
      {isPanel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={startNewConversation}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      ) : null}
      {suggestedPrompts.map((suggestion) => (
        <Button
          key={suggestion.label}
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() =>
            suggestion.action === "send"
              ? sendQuestion(suggestion.prompt)
              : fillPrompt(suggestion.prompt)
          }
          className={cn("max-sm:shrink-0", isPanel && "shrink-0")}
        >
          {suggestion.label}
        </Button>
      ))}
    </div>
  );

  const showFallbackVoiceControls =
    !realtimeVoiceActive &&
    (!realtimeSupported ||
      Boolean(voiceError) ||
      listening ||
      voiceRepliesEnabled ||
      speaking ||
      Boolean(interimTranscript));

  const voiceControls = (
    <div className="mb-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <audio ref={realtimeAudioRef} autoPlay className="hidden" />
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            {realtimeVoiceStatus === "speaking" ? (
              <Volume2 className="h-4 w-4" />
            ) : realtimeVoiceStatus === "listening" ? (
              <Mic className="h-4 w-4" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
          </span>
          <span className="text-sm font-semibold text-slate-950">Voice Mode</span>
          <Badge variant={realtimeVoiceActive ? "open" : realtimeVoiceStatus === "error" ? "danger" : "default"}>
            {realtimeVoiceStatusLabel(realtimeVoiceStatus)}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">
            {selectedRealtimeVoice.label} {selectedRealtimeVoice.description}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only">Kero voice</label>
          <Select
            value={state.settings.keroAi.voice}
            disabled={realtimeVoiceActive || realtimeVoiceStatus === "connecting"}
            onChange={(event) =>
              updateSettings({
                ...state.settings,
                keroAi: {
                  ...state.settings.keroAi,
                  voice: event.target.value as typeof state.settings.keroAi.voice
                }
              })
            }
            className="h-8 w-[13.5rem] rounded-full bg-white/90 py-1 text-xs"
          >
            {KERO_AI_VOICE_OPTIONS.map((voice) => (
              <option key={voice.value} value={voice.value}>
                {voice.label} {voice.description}
              </option>
            ))}
          </Select>
          {realtimeVoiceActive ? (
            <>
              {realtimeVoiceStatus === "speaking" ? (
                <Button type="button" variant="outline" size="sm" onClick={interruptRealtimeVoice}>
                  <Mic className="h-4 w-4" />
                  Interrupt
                </Button>
              ) : null}
              <Button type="button" variant="destructive" size="sm" onClick={stopRealtimeVoiceMode}>
                <PhoneOff className="h-4 w-4" />
                End Voice
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={!realtimeSupported || realtimeVoiceStatus === "connecting"}
              onClick={startRealtimeVoiceMode}
            >
              {realtimeVoiceStatus === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AudioLines className="h-4 w-4" />
              )}
              Start Voice Mode
            </Button>
          )}
        </div>
      </div>

      {realtimeVoiceActive ? (
        <div className="mt-2 grid gap-1 rounded-md border bg-white px-3 py-2 shadow-soft">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-700">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                realtimeVoiceStatus === "listening" && "animate-pulse bg-emerald-500",
                realtimeVoiceStatus === "thinking" && "animate-pulse bg-amber-500",
                realtimeVoiceStatus === "speaking" && "animate-pulse bg-primary",
                realtimeVoiceStatus === "connecting" && "animate-pulse bg-slate-400",
                realtimeVoiceStatus === "idle" && "bg-slate-300",
                realtimeVoiceStatus === "error" && "bg-red-500"
              )}
            />
            {realtimeVoiceStatus === "speaking"
              ? "Kero AI is speaking"
              : realtimeVoiceStatus === "thinking"
                ? "Kero AI is thinking"
                : realtimeVoiceStatus === "connecting"
                  ? "Connecting to OpenAI Realtime"
                  : "Listening"}
          </div>
          {realtimeUserTranscript ? (
            <p className="max-h-10 overflow-hidden text-xs leading-5 text-muted-foreground">
              You: {realtimeUserTranscript}
            </p>
          ) : null}
          {realtimeAiTranscript ? (
            <p className="max-h-10 overflow-hidden text-xs leading-5 text-slate-700">
              Kero AI: {realtimeAiTranscript}
            </p>
          ) : null}
        </div>
      ) : null}

      {realtimeVoiceError ? (
        <p className="mt-2 text-xs text-red-700">{realtimeVoiceError}</p>
      ) : null}
      {!realtimeSupported ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Realtime voice needs microphone access and WebRTC support. Text chat remains available.
        </p>
      ) : null}

      {showFallbackVoiceControls ? (
        <div className="mechanic-panel mt-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
            <Button
              type="button"
              variant={listening ? "default" : "outline"}
              size="sm"
              disabled={!speechRecognitionSupported || loading}
              aria-pressed={listening}
              onClick={toggleListening}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {listening ? "Stop dictation" : "Dictate to text"}
            </Button>
            <Button
              type="button"
              variant={voiceRepliesEnabled ? "default" : "outline"}
              size="sm"
              disabled={!speechSynthesisSupported}
              aria-pressed={voiceRepliesEnabled}
              onClick={() => {
                setVoiceRepliesEnabled((current) => {
                  const next = !current;
                  if (!next) stopSpeaking();
                  return next;
                });
              }}
            >
              {voiceRepliesEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
              Read text replies
            </Button>
            {speaking ? (
              <Button type="button" variant="outline" size="sm" onClick={stopSpeaking}>
                <VolumeX className="h-4 w-4" />
                Stop voice
              </Button>
            ) : null}
          </div>
          {interimTranscript ? (
            <p className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-muted-foreground shadow-soft">
              Transcribing: {interimTranscript}
            </p>
          ) : null}
          {voiceError ? <p className="mt-2 text-xs text-red-700">{voiceError}</p> : null}
        </div>
      ) : null}
    </div>
  );

  const chatWindow = (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-50 shadow-soft",
        isPanel ? "min-h-0 flex-1" : "h-[calc(100svh-21rem)] min-h-[20rem] sm:h-[calc(100vh-24rem)] sm:min-h-[26rem] xl:h-[min(68vh,42rem)]"
      )}
    >
      <div
        className={cn(
          "flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.98))]",
          isPanel ? "p-3" : "p-4"
        )}
      >
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            state={state}
            preview={message.proposal ? getProposalPreview(message.proposal, state) : undefined}
            onConfirm={
              message.proposal
                ? () =>
                    confirmProposal(
                      message.id,
                      message.proposal as ActionProposal,
                      message.mode ?? "text"
                    )
                : undefined
            }
            onCancel={
              message.proposal
                ? () => cancelProposal(message.id, message.mode ?? "text")
                : undefined
            }
          />
        ))}
        {loading ? <LoadingBubble /> : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-slate-200 bg-white p-3 shadow-[0_-6px_20px_rgba(15,23,42,0.04)]"
        onSubmit={(event) => {
          event.preventDefault();
          sendQuestion(question);
        }}
      >
        {voiceControls}
        <div
          className={cn(
            "grid gap-3",
            isPanel ? "grid-cols-1" : "md:grid-cols-[1fr_auto] md:items-end"
          )}
        >
          <Textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Type a briefing request or action. For a pending change, type confirm or cancel..."
            className={cn("min-h-16 sm:min-h-20", isPanel && "min-h-16 text-sm")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                sendQuestion(question);
              }
            }}
          />
          <Button
            type="submit"
            disabled={loading || !question.trim()}
            className={cn(isPanel && "w-full")}
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        isPanel ? "h-full min-h-0 gap-3" : "min-h-[calc(100vh-9rem)]"
      )}
    >
      {!isPanel ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <KeroLogo className="h-8 w-8 border border-primary/10 sm:h-9 sm:w-9" imageClassName="h-[82%] w-[82%]" />
              <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Kero AI</h1>
            </div>
            <p className="section-copy max-w-3xl text-sm sm:text-base">
              Ask questions or request changes across matters, clients, letters, calendars, time, expenses, invoices, conflict checks, and timeline entries.
            </p>
          </div>
          <div className="hidden flex-wrap gap-2 sm:flex">
            <Badge variant="navy">{state.matters.length} matters</Badge>
            <Badge variant="default">{state.clients.length} clients</Badge>
          </div>
        </div>
      ) : null}

      <section
        className={cn(
          "surface-card p-3 sm:p-4",
          isPanel && "flex min-h-0 flex-1 flex-col border-0 p-0 shadow-none"
        )}
      >
        {isPanel ? (
          <>
            {promptButtons}
            {chatWindow}
          </>
        ) : (
          <div
            className={cn(
              "ai-chat-layout min-h-[min(68vh,44rem)]",
              conversationSidebarOpen && "ai-chat-layout-open"
            )}
          >
            <div
              className={cn(
                "ai-sidebar-transition",
                !conversationSidebarOpen && "ai-sidebar-transition-closed"
              )}
              aria-hidden={!conversationSidebarOpen}
            >
              <ConversationSidebar
                conversations={conversations}
                activeConversationId={activeConversationId}
                search={conversationSearch}
                loading={loading}
                onSearch={setConversationSearch}
                onNewConversation={startNewConversation}
                onSelectConversation={selectConversation}
                onClose={() => setConversationSidebarOpen(false)}
                className="h-full w-72 max-w-full max-h-[18rem] lg:max-h-none lg:max-w-none"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConversationSidebarOpen((current) => !current)}
                  aria-expanded={conversationSidebarOpen}
                  aria-controls="kero-ai-conversation-sidebar"
                >
                  {conversationSidebarOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4" />
                  )}
                  {conversationSidebarOpen ? "Hide chats" : "Show chats"}
                </Button>
                {!conversationSidebarOpen ? (
                  <span className="text-xs text-muted-foreground">
                    {conversations.length} saved conversation{conversations.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              {promptButtons}
              {chatWindow}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ChatBubble({
  message,
  state,
  preview,
  onConfirm,
  onCancel
}: {
  message: ChatMessage;
  state: KeroState;
  preview?: ProposalPreview;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const user = message.role === "user";
  const voice = message.mode === "voice";
  return (
    <div className={cn("stagger-in flex gap-3", user && "justify-end")}>
      {!user ? (
        <KeroLogo className="h-8 w-8 border border-primary/10" imageClassName="h-[82%] w-[82%]" />
      ) : null}
      <div
        className={cn(
          "max-w-[min(46rem,85%)] rounded-md border px-3.5 py-2.5 text-sm leading-6 shadow-soft",
          user
            ? "border-primary bg-primary text-white shadow-elevated"
            : "border-slate-200 bg-white text-slate-800"
        )}
      >
        {voice ? (
          <div
            className={cn(
              "mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-normal",
              user ? "text-white/75" : "text-primary"
            )}
          >
            <Mic className="h-3 w-3" />
            Voice
          </div>
        ) : null}
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.proposal && preview ? (
          <ProposalCard
            preview={preview}
            status={message.proposalStatus ?? "pending"}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : null}
        {message.documentAttachment ? (
          <DocumentAttachmentCard
            attachment={message.documentAttachment}
            state={state}
          />
        ) : null}
      </div>
      {user ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-200 text-slate-700">
          {voice ? <Mic className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
        </span>
      ) : null}
    </div>
  );
}

function DocumentAttachmentCard({
  attachment,
  state
}: {
  attachment: DocumentAttachment;
  state: KeroState;
}) {
  const { toast } = useToast();
  const resolved = resolveDocumentAttachment(attachment, state);

  async function copyDocument() {
    if (!resolved) return;
    await navigator.clipboard.writeText(resolved.letter.text);
    toast("Document copied");
  }

  async function htmlForDocument() {
    if (!resolved) return "";
    const template =
      resolved.matter.customTemplates[resolved.letter.id] ??
      state.globalTemplates[resolved.letter.id];
    if (!template) return letterTextToHtml(resolved.letter);
    return buildFilledWordTemplateHtml(
      template,
      makeLetterVariables(resolved.matter, resolved.client, state.settings)
    );
  }

  async function downloadDocument() {
    if (!resolved) return;
    try {
      await downloadHtmlAsPdf(
        await htmlForDocument(),
        pdfFileName(resolved.letter, resolved.matter, resolved.client)
      );
      toast("PDF downloaded");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download PDF");
    }
  }

  async function printDocument() {
    if (!resolved) return;
    try {
      await printHtmlAsPdf(
        await htmlForDocument(),
        pdfFileName(resolved.letter, resolved.matter, resolved.client)
      );
      toast("PDF print preview opened");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not print PDF");
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-primary/15 bg-slate-50 text-slate-800 shadow-elevated">
      <div className="flex items-start gap-3 border-b border-slate-200 bg-white p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileText className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-950">
            {resolved?.letter.title ?? attachment.letterTitle}
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            {attachment.fileReference} · {attachment.clientName}
          </span>
          <span className="block text-xs leading-5 text-muted-foreground">
            {attachment.matterTitle}
          </span>
        </span>
      </div>
      {resolved ? (
        <>
          <div className="max-h-44 overflow-auto border-b border-slate-200 bg-white p-3">
            <pre className="whitespace-pre-wrap font-serif text-xs leading-5 text-slate-700">
              {resolved.letter.text}
            </pre>
          </div>
          <div className="flex flex-wrap gap-2 bg-slate-50 p-3">
            <Button type="button" variant="outline" size="sm" onClick={printDocument}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={copyDocument}>
              <Clipboard className="h-4 w-4" />
              Copy
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadDocument}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </>
      ) : (
        <div className="p-3 text-sm text-red-700">
          This document could not be found in the current Kero data. It may have been deleted or renamed.
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  preview,
  status,
  onConfirm,
  onCancel
}: {
  preview: ProposalPreview;
  status: "pending" | "confirmed" | "cancelled";
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-primary/20 bg-white p-3 text-slate-800 shadow-elevated">
      <div className="flex items-center gap-2 font-semibold text-slate-950">
        <span className="h-2 w-2 rounded-full bg-primary" />
        Confirm change
      </div>
      <p className="mt-1 text-sm">
        {preview.targetLabel}: {preview.fieldLabel} will change from{" "}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">{preview.currentValue}</span> to{" "}
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{preview.newValue}</span>
      </p>
      {preview.error ? (
        <p className="mt-2 text-sm text-red-700">{preview.error}</p>
      ) : null}
      {status === "pending" ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            You can also type or say &quot;confirm&quot; or &quot;cancel&quot;.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" onClick={onConfirm} disabled={Boolean(preview.error)}>
              Confirm
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {status === "confirmed"
            ? "Confirmed. Kero has applied this change."
            : "Cancelled. No data was changed."}
        </p>
      )}
    </div>
  );
}

function LoadingBubble() {
  return (
    <div className="stagger-in flex gap-3">
      <KeroLogo className="h-8 w-8 border border-primary/10" imageClassName="h-[82%] w-[82%]" />
      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-muted-foreground shadow-soft">
        <span className="mr-2 align-middle">Kero AI is thinking</span>
        <span className="inline-flex items-center gap-1 align-middle">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/50" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/50 [animation-delay:120ms]" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary/50 [animation-delay:240ms]" />
        </span>
      </div>
    </div>
  );
}

function buildBriefingContext(state: KeroState) {
  const clientsById = new Map(state.clients.map((client) => [client.id, client]));

  return {
    generatedAt: new Date().toISOString(),
    settings: state.settings,
    clients: state.clients.map((client) => {
      const clientMatters = state.matters.filter((matter) => matter.clientId === client.id);
      const activeMatters = clientMatters.filter((matter) => matter.status !== "Closed");
      const closedMatters = clientMatters.filter((matter) => matter.status === "Closed");
      return {
        ...client,
        matterReferences: clientMatters.map((matter) => matter.fileReference),
        activeMatterReferences: activeMatters.map((matter) => matter.fileReference),
        closedMatterReferences: closedMatters.map((matter) => matter.fileReference),
        activeMatterCount: activeMatters.length,
        closedMatterCount: closedMatters.length
      };
    }),
    matters: state.matters.map((matter) => {
      const client = clientsById.get(matter.clientId);
      const letters = client
        ? getLetters(matter, client, state.settings, {
            globalTemplates: state.globalTemplates,
            customLetterTemplates: state.customLetterTemplates
          }).map((letter) => ({
            id: letter.id,
            title: letter.title,
            status: getDocumentStatus(state, matter.id, letter.id),
            sentAt: state.documentSentAt[getDocumentKey(matter.id, letter.id)] ?? ""
          }))
        : [];
      const timeEntries = state.timeEntries.filter((entry) => entry.matterId === matter.id);
      const expenses = state.expenses.filter((expense) => expense.matterId === matter.id);
      const invoices = state.invoices.filter((invoice) => invoice.matterId === matter.id);
      const calendarEvents = state.calendarEvents.filter((event) => event.matterId === matter.id);
      const matterChecklist = getMatterChecklistItems(state, matter);
      const timelineEvents = state.timelineEvents
        .filter((event) => event.matterId === matter.id)
        .slice(0, 25);
      const conflictCheckLogs = state.conflictCheckLogs
        .filter((log) => log.matterId === matter.id)
        .slice(0, 10);
      return {
        id: matter.id,
        fileReference: matter.fileReference,
        client,
        type: matter.type,
        typeLabel: MATTER_LABELS[matter.type],
        title: getMatterTitle(matter),
        status: matter.status,
        stage: {
          current: getCurrentStage(matter),
          index: matter.stageIndex,
          total: getStages(matter.type).length,
          allStages: getStages(matter.type)
        },
        aml: {
          status: getAmlStatus(matter.aml),
          checklist: matter.aml
        },
        keyDates: getKeyDates(matter, state.settings),
        fields: matter.fields,
        notes: matter.notes,
        aiResearch: matter.aiResearch,
        customTemplates: matter.customTemplates,
        letters,
        matterChecklist: {
          complete:
            matterChecklist.length > 0 &&
            matterChecklist.every((item) => Boolean(item.completedAt)),
          completedCount: matterChecklist.filter((item) => item.completedAt).length,
          totalCount: matterChecklist.length,
          items: matterChecklist
        },
        timeEntries,
        expenses,
        invoices,
        calendarEvents,
        timelineEvents,
        conflictCheckLogs
      };
    }),
    invoices: state.invoices,
    calendarEvents: state.calendarEvents,
    timelineEvents: state.timelineEvents,
    conflictCheckLogs: state.conflictCheckLogs,
    recentMatterViews: state.recentMatterViews,
    documentStatuses: state.documentStatuses,
    documentSentAt: state.documentSentAt
  };
}

function getKeyDates(matter: Matter, settings: KeroState["settings"]) {
  const dates: Record<string, string | number | boolean> = {
    dateOpened: matter.dateOpened,
    dateOpenedDisplay: formatDisplayDate(matter.dateOpened),
    updatedAt: matter.updatedAt,
    updatedAtDisplay: formatDisplayDate(matter.updatedAt)
  };

  if (matter.type === "conveyancing") {
    dates.closingDate = matter.fields.closingDate;
    dates.closingDateDisplay = formatDisplayDate(matter.fields.closingDate);
  }

  if (matter.type === "purchase") {
    dates.closingDate = matter.fields.closingDate;
    dates.closingDateDisplay = formatDisplayDate(matter.fields.closingDate);
  }

  if (matter.type === "litigation") {
    dates.dateDisputeArose = matter.fields.dateDisputeArose;
    dates.dateDisputeAroseDisplay = formatDisplayDate(matter.fields.dateDisputeArose);
    dates.limitationDate = matter.fields.limitationDate;
    dates.limitationDateDisplay = formatDisplayDate(matter.fields.limitationDate);
    dates.limitationWarningMonths = settings.notifications.limitationWarningMonths;
    dates.limitationWithinWarningPeriod = isWithinMonths(
      matter.fields.limitationDate,
      settings.notifications.limitationWarningMonths
    );
  }

  return dates;
}

function cleanTextForSpeech(value: string) {
  return value
    .replace(/\{\{.*?\}\}/g, "")
    .replace(/[`*_#>~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function isVoiceActionRequest(value: string) {
  const text = normaliseTranscriptForCompare(value);
  const actionPatterns = [
    /^(please )?(add|create|make|draft|prepare|write) .+/,
    /^(please )?(tick|untick|check|uncheck) .+/,
    /^(please )?(mark|set) .+/,
    /^(please )?(verify|advance|move|update|change|edit|log|record|book|schedule|send|generate|run) .+/,
    /^(can you|could you|will you|would you) (add|create|make|draft|prepare|write|tick|untick|check|uncheck|mark|set|verify|advance|move|update|change|edit|log|record|book|schedule|send|generate|run) .+/,
    /^(i want to|i need to|let's|lets) (add|create|make|draft|prepare|write|tick|untick|check|uncheck|mark|set|verify|advance|move|update|change|edit|log|record|book|schedule|send|generate|run) .+/
  ];
  return actionPatterns.some((pattern) => pattern.test(text));
}

function getVoiceProposalPrompt(proposal: ActionProposal, state: KeroState) {
  const preview = getProposalPreview(proposal, state);
  if (preview.error) {
    return `I found the change, but I need one thing fixed first: ${preview.error}`;
  }
  return `I'd like to make this change: ${preview.targetLabel}, ${preview.fieldLabel} from ${preview.currentValue} to ${preview.newValue}. Shall I go ahead?`;
}

function extractRealtimeResponseTranscript(event: Record<string, unknown>) {
  if (typeof event.transcript === "string") return event.transcript.trim();
  const response = isRecord(event.response) ? event.response : undefined;
  const output = Array.isArray(response?.output) ? response.output : [];
  const pieces: string[] = [];
  output.forEach((item) => {
    if (!isRecord(item)) return;
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (!isRecord(part)) return;
      if (typeof part.transcript === "string") pieces.push(part.transcript);
      else if (typeof part.text === "string") pieces.push(part.text);
    });
  });
  return pieces.join(" ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normaliseTranscriptForCompare(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSpeechRecognitionError(error?: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone access was blocked. Allow microphone access in the browser to use voice input.";
  }
  if (error === "audio-capture") {
    return "No microphone was found. Check the input device and try again.";
  }
  if (error === "network") {
    return "Voice dictation could not connect. Try again in a moment.";
  }
  if (error === "no-speech") {
    return "No speech was detected. Try dictation again or use Voice Mode.";
  }
  return "Voice dictation stopped. Try again or type your request.";
}

function realtimeVoiceStatusLabel(status: RealtimeVoiceStatus) {
  if (status === "connecting") return "Connecting";
  if (status === "listening") return "Listening";
  if (status === "thinking") return "Thinking";
  if (status === "speaking") return "Speaking";
  if (status === "error") return "Needs attention";
  return "Off";
}

function getRealtimeVoiceError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied. You can keep using text chat or allow microphone access and try Voice Mode again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found. Text chat is still available.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Realtime voice could not start. Text chat is still available.";
}

async function getRealtimeApiError(response: Response) {
  const fallback = `Realtime voice could not connect. Text chat is still available.`;
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return data?.error || fallback;
  }
  const text = await response.text().catch(() => "");
  return text.trim() || fallback;
}

function makeMessageId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function findLatestPendingProposal(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.proposal && (message.proposalStatus ?? "pending") === "pending") {
      return { id: message.id, proposal: message.proposal };
    }
  }
  return undefined;
}

function getProposalCommand(value: string): ProposalCommand | undefined {
  const command = normaliseProposalCommand(value);
  if (!command) return undefined;

  const confirmPatterns = [
    /^(confirm|approve|apply|accept|proceed)$/,
    /^(confirm|approve|apply|accept|proceed) (it|this|that|change|update|action|proposal)$/,
    /^(yes|yeah|yep|yup)( please)?$/,
    /^(ok|okay)$/,
    /^(go ahead|do it)$/
  ];
  if (confirmPatterns.some((pattern) => pattern.test(command))) return "confirm";

  const cancelPatterns = [
    /^(cancel|discard|reject|stop)$/,
    /^(cancel|discard|reject) (it|this|that|change|update|action|proposal)$/,
    /^no( thanks| thank you)?$/,
    /^(do not|don't|dont) (change|update|apply|confirm|do it|proceed)$/
  ];
  if (cancelPatterns.some((pattern) => pattern.test(command))) return "cancel";

  return undefined;
}

function normaliseProposalCommand(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAssistantMessage(data: BriefingApiResponse, ok: boolean): ChatMessage {
  if (!ok || "error" in data) {
    return {
      id: makeMessageId("assistant"),
      role: "assistant",
      content: "error" in data ? data.error : "The Kero AI request failed."
    };
  }

  if (data.type === "proposal") {
    return {
      id: makeMessageId("assistant"),
      role: "assistant",
      content: data.message || "I found a supported change. Please confirm it first.",
      proposal: data.proposal,
      proposalStatus: "pending"
    };
  }

  if (data.type === "clarification") {
    return {
      id: makeMessageId("assistant"),
      role: "assistant",
      content: data.message
    };
  }

  return {
    id: makeMessageId("assistant"),
    role: "assistant",
    content: data.answer || "I could not generate a response from the available data."
  };
}

function buildDocumentFetchMessage(
  prompt: string,
  state: KeroState,
  mode: "text" | "voice"
): ChatMessage | undefined {
  if (!isDocumentFetchRequest(prompt)) return undefined;
  const matches = findDocumentMatches(prompt, state);

  if (matches.length === 0) {
    return {
      id: makeMessageId("assistant"),
      role: "assistant",
      mode,
      content:
        'I could not confidently find that document. Try asking with the document name and either the client name or file reference, for example: "Fetch the Client Care Letter for KER-003".'
    };
  }

  const [best, second] = matches;
  if (second && best.score - second.score < 8) {
    const options = matches
      .slice(0, 4)
      .map(
        (match) =>
          `- ${match.letter.title} · ${match.matter.fileReference} · ${match.client.fullName}`
      )
      .join("\n");
    return {
      id: makeMessageId("assistant"),
      role: "assistant",
      mode,
      content: `I found a few possible documents. Which one do you want?\n\n${options}`
    };
  }

  return {
    id: makeMessageId("assistant"),
    role: "assistant",
    mode,
    content: `I found ${best.letter.title} for ${best.client.fullName} on ${best.matter.fileReference}. I've attached it here for print, copy or download.`,
    documentAttachment: {
      matterId: best.matter.id,
      clientId: best.client.id,
      letterId: best.letter.id,
      letterTitle: best.letter.title,
      clientName: best.client.fullName,
      fileReference: best.matter.fileReference,
      matterTitle: getMatterTitle(best.matter),
      createdAt: new Date().toISOString()
    }
  };
}

function isDocumentFetchRequest(value: string) {
  const text = normaliseSearchText(value);
  if (!/\b(fetch|get|show|open|pull|find|bring|retrieve)\b/.test(text)) return false;
  return (
    /\b(document|documents|letter|letters|pdf|template|client care|aml|contract|contracts|requisitions|closing statement|file closure|mortgage offer|pre contract|enquiries)\b/.test(
      text
    )
  );
}

type DocumentMatch = {
  matter: Matter;
  client: Client;
  letter: ReturnType<typeof getLetters>[number];
  score: number;
};

function findDocumentMatches(prompt: string, state: KeroState): DocumentMatch[] {
  const search = normaliseSearchText(prompt);
  const promptTokens = usefulSearchTokens(search);
  const matches: DocumentMatch[] = [];

  state.matters.forEach((matter) => {
    const client = state.clients.find((item) => item.id === matter.clientId);
    if (!client) return;
    const letters = getLetters(matter, client, state.settings, {
      globalTemplates: state.globalTemplates,
      customLetterTemplates: state.customLetterTemplates
    });

    letters.forEach((letter) => {
      const letterTitle = normaliseSearchText(letter.title);
      const clientName = normaliseSearchText(client.fullName);
      const fileReference = normaliseSearchText(matter.fileReference);
      const matterTitle = normaliseSearchText(getMatterTitle(matter));
      const letterTokens = usefulSearchTokens(letterTitle);
      const clientTokens = usefulSearchTokens(clientName);
      const matterTokens = usefulSearchTokens(`${fileReference} ${matterTitle}`);

      let score = 0;
      if (search.includes(letterTitle)) score += 45;
      if (search.includes(clientName)) score += 36;
      if (search.includes(fileReference)) score += 42;
      if (matter.status !== "Closed") score += 4;

      score += countTokenMatches(promptTokens, letterTokens) * 9;
      score += countTokenMatches(promptTokens, clientTokens) * 12;
      score += countTokenMatches(promptTokens, matterTokens) * 6;

      const titleMatched = search.includes(letterTitle) || countTokenMatches(promptTokens, letterTokens) > 0;
      const targetMatched =
        search.includes(clientName) ||
        search.includes(fileReference) ||
        countTokenMatches(promptTokens, clientTokens) > 0 ||
        countTokenMatches(promptTokens, matterTokens) > 0;

      if (titleMatched && targetMatched && score >= 18) {
        matches.push({ matter, client, letter, score });
      }
    });
  });

  return matches.sort((left, right) => right.score - left.score);
}

function resolveDocumentAttachment(attachment: DocumentAttachment, state: KeroState) {
  const matter = state.matters.find((item) => item.id === attachment.matterId);
  const client = state.clients.find((item) => item.id === attachment.clientId);
  if (!matter || !client) return undefined;
  const letters = getLetters(matter, client, state.settings, {
    globalTemplates: state.globalTemplates,
    customLetterTemplates: state.customLetterTemplates
  });
  const letter =
    letters.find((item) => item.id === attachment.letterId) ??
    letters.find(
      (item) =>
        normaliseSearchText(item.title) === normaliseSearchText(attachment.letterTitle)
    );
  if (!letter) return undefined;
  return { matter, client, letter };
}

function normaliseSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulSearchTokens(value: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "attach",
    "bring",
    "can",
    "client",
    "document",
    "documents",
    "download",
    "fetch",
    "file",
    "find",
    "for",
    "from",
    "get",
    "letter",
    "letters",
    "me",
    "open",
    "pdf",
    "please",
    "pull",
    "retrieve",
    "show",
    "the",
    "to",
    "you"
  ]);
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function countTokenMatches(sourceTokens: string[], targetTokens: string[]) {
  const source = new Set(sourceTokens);
  return targetTokens.filter((token) => source.has(token)).length;
}

type ProposalPreview = {
  targetLabel: string;
  fieldLabel: string;
  currentValue: string;
  newValue: string;
  error?: string;
};

type ApplyHelpers = {
  state: KeroState;
  addNote: (matterId: string, body: string) => void;
  updateAml: (matterId: string, patch: Partial<Matter["aml"]>) => void;
  advanceStage: (matterId: string) => Matter | undefined;
  updateMatter: (matterId: string, updater: (matter: Matter) => Matter) => void;
  updateClient: (clientId: string, patch: Partial<Client>) => void;
  toggleMatterChecklistItem: (matterId: string, itemId: string, completed: boolean) => void;
  addMatterChecklistItem: (matterId: string, label: string) => unknown;
  setLetterStatus: (
    matterId: string,
    letterId: string,
    status: LetterStatus,
    letterTitle?: string
  ) => void;
  addTimeEntry: (input: {
    matterId: string;
    date: string;
    description: string;
    durationHours: number;
    hourlyRate: number;
    billable: boolean;
  }) => unknown;
  addExpense: (input: {
    matterId: string;
    date: string;
    description: string;
    amount: number;
    billable: boolean;
    receiptName?: string;
  }) => unknown;
  generateInvoice: (
    matterId: string,
    options?: { vatEnabled?: boolean; dueDate?: string }
  ) => { invoiceNumber: string } | undefined;
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void;
  addCalendarEvent: (input: {
    title: string;
    type: CalendarEventType;
    date: string;
    time?: string;
    matterId?: string;
    notes?: string;
  }) => unknown;
  addTimelineEvent: (input: {
    matterId: string;
    type: "matter_updated" | "conflict_check" | "kero_ai";
    description: string;
    metadata?: Record<string, string | number | boolean>;
  }) => unknown;
  runConflictCheck: (input: {
    matterId?: string;
    queries: string[];
    source?: "matter_creation" | "manual" | "kero_ai";
  }) => { resultCount: number };
};

function applyActionProposal(proposal: ActionProposal, helpers: ApplyHelpers) {
  const preview = getProposalPreview(proposal, helpers.state);
  if (preview.error) return { ok: false, message: preview.error };

  const matter = helpers.state.matters.find((item) => item.id === proposal.targetId);
  const client =
    proposal.targetType === "client"
      ? helpers.state.clients.find((item) => item.id === proposal.targetId)
      : undefined;

  if (proposal.action === "add_note") {
    const noteBody = proposal.payload.noteBody || proposal.newValue;
    if (!matter || !noteBody?.trim()) {
      return { ok: false, message: "Could not add the note because the matter or note text was missing." };
    }
    helpers.addNote(matter.id, noteBody);
    return { ok: true, message: `Confirmed. Note added to ${matter.fileReference}.` };
  }

  if (proposal.action === "update_aml") {
    const amlField = getAmlField(proposal);
    const amlValue = getBooleanValue(proposal);
    if (!matter || !amlField || typeof amlValue !== "boolean") {
      return { ok: false, message: "Could not update AML because the field or value was missing." };
    }
    helpers.updateAml(matter.id, { [amlField]: amlValue });
    return { ok: true, message: `Confirmed. AML updated on ${matter.fileReference}.` };
  }

  if (proposal.action === "toggle_matter_checklist") {
    const checklistItem = matter ? findMatterChecklistItem(helpers.state, matter, proposal) : undefined;
    const completed = getMatterChecklistCompletedValue(proposal);
    if (!matter || !checklistItem || typeof completed !== "boolean") {
      return { ok: false, message: "Could not update the matter checklist because the matter, item, or value was missing." };
    }
    helpers.toggleMatterChecklistItem(matter.id, checklistItem.id, completed);
    return {
      ok: true,
      message: `Confirmed. Matter checklist updated on ${matter.fileReference}.`
    };
  }

  if (proposal.action === "add_matter_checklist_item") {
    const label =
      proposal.payload.customChecklistLabel ||
      proposal.payload.matterChecklistLabel ||
      proposal.newValue;
    if (!matter || !label?.trim()) {
      return { ok: false, message: "Could not add the checklist item because the matter or item text was missing." };
    }
    helpers.addMatterChecklistItem(matter.id, label);
    return {
      ok: true,
      message: `Confirmed. Checklist item added to ${matter.fileReference}.`
    };
  }

  if (proposal.action === "advance_stage") {
    if (!matter) return { ok: false, message: "Could not advance the stage because the matter was not found." };
    if (helpers.state.settings.matterDefaults.amlMandatoryBeforeStageAdvance && !matter.aml.verified) {
      return { ok: false, message: "Could not advance the stage because AML must be verified first." };
    }
    const updated = helpers.advanceStage(matter.id);
    if (!updated) {
      return { ok: false, message: "Could not advance the stage." };
    }
    return { ok: true, message: `Confirmed. ${matter.fileReference} advanced to the next stage.` };
  }

  if (proposal.action === "set_stage") {
    const stageIndex = getStageIndex(proposal, matter);
    if (!matter || typeof stageIndex !== "number") {
      return { ok: false, message: "Could not change stage because the matter or stage was missing." };
    }
    const stages = getStages(matter.type);
    if (stageIndex < 0 || stageIndex >= stages.length) {
      return { ok: false, message: "Could not change stage because the requested stage is invalid." };
    }
    if (
      stageIndex > matter.stageIndex &&
      helpers.state.settings.matterDefaults.amlMandatoryBeforeStageAdvance &&
      !matter.aml.verified
    ) {
      return { ok: false, message: "Could not advance the stage because AML must be verified first." };
    }
    helpers.updateMatter(matter.id, (current) =>
      current.id === matter.id
        ? {
            ...current,
            stageIndex,
            status: statusForStage(current, stageIndex)
          }
        : current
    );
    return { ok: true, message: `Confirmed. ${matter.fileReference} stage changed to ${stages[stageIndex]}.` };
  }

  if (proposal.action === "update_key_date") {
    const keyDateField = getKeyDateField(proposal);
    const dateValue = getDateValue(proposal);
    if (!matter || !keyDateField || !dateValue) {
      return { ok: false, message: "Could not update the date because the matter, date field, or date value was missing." };
    }
    helpers.updateMatter(matter.id, (current) => updateMatterDate(current, keyDateField, dateValue));
    return { ok: true, message: `Confirmed. ${keyDateField} updated on ${matter.fileReference}.` };
  }

  if (proposal.action === "update_client") {
    const clientField = getClientField(proposal);
    const clientValue = proposal.payload.clientValue || proposal.newValue;
    if (!client || !clientField || !clientValue?.trim()) {
      return { ok: false, message: "Could not update the client because the client, field, or value was missing." };
    }
    helpers.updateClient(client.id, {
      [clientField]: clientValue
    });
    return { ok: true, message: `Confirmed. ${client.fullName}'s ${clientField} was updated.` };
  }

  if (proposal.action === "set_letter_status") {
    const letterId = getLetterId(proposal);
    const letter = matter ? findLetterForMatter(helpers.state, matter, letterId) : undefined;
    const letterStatus = getLetterStatusValue(proposal);
    if (!matter || !letter || !letterStatus) {
      return { ok: false, message: "Could not update the letter because the matter, letter, or status was missing." };
    }
    helpers.setLetterStatus(matter.id, letter.id, letterStatus, letter.title);
    return { ok: true, message: `Confirmed. ${letter.title} updated on ${matter.fileReference}.` };
  }

  if (proposal.action === "add_calendar_event") {
    const title = proposal.payload.calendarTitle || proposal.newValue;
    const date = proposal.payload.calendarDate || getDateValue(proposal);
    const time = timeKey(proposal.payload.calendarTime);
    const type = proposal.payload.calendarType || inferCalendarType(proposal);
    const matterId =
      proposal.payload.calendarMatterId ||
      (proposal.targetType === "matter" && matter ? matter.id : undefined);
    if (!title?.trim() || !date || !type) {
      return { ok: false, message: "Could not add the calendar event because the title, date, or type was missing." };
    }
    helpers.addCalendarEvent({
      title,
      type,
      date,
      time: time || undefined,
      matterId,
      notes: proposal.payload.calendarNotes
    });
    return { ok: true, message: `Confirmed. Calendar event added${matter ? ` to ${matter.fileReference}` : ""}.` };
  }

  if (proposal.action === "add_time_entry") {
    const description = proposal.payload.timeDescription || proposal.newValue;
    const durationHours = Number(proposal.payload.durationHours);
    if (!matter || !description?.trim() || !durationHours || durationHours <= 0) {
      return { ok: false, message: "Could not log time because the matter, description, or duration was missing." };
    }
    helpers.addTimeEntry({
      matterId: matter.id,
      date: proposal.payload.timeDate || todayInput(),
      description,
      durationHours,
      hourlyRate:
        Number(proposal.payload.hourlyRate) || helpers.state.settings.billing.defaultHourlyRate,
      billable: proposal.payload.billable ?? true
    });
    return { ok: true, message: `Confirmed. Time logged on ${matter.fileReference}.` };
  }

  if (proposal.action === "add_expense") {
    const description = proposal.payload.expenseDescription || proposal.newValue;
    const amount = Number(proposal.payload.expenseAmount);
    if (!matter || !description?.trim() || !amount || amount <= 0) {
      return { ok: false, message: "Could not log the expense because the matter, description, or amount was missing." };
    }
    helpers.addExpense({
      matterId: matter.id,
      date: proposal.payload.expenseDate || todayInput(),
      description,
      amount,
      billable: proposal.payload.billable ?? true
    });
    return { ok: true, message: `Confirmed. Expense logged on ${matter.fileReference}.` };
  }

  if (proposal.action === "generate_invoice") {
    if (!matter) return { ok: false, message: "Could not generate an invoice because the matter was not found." };
    const invoice = helpers.generateInvoice(matter.id, {
      vatEnabled: proposal.payload.vatEnabled,
      dueDate: proposal.payload.dueDate
    });
    if (!invoice) {
      return { ok: false, message: "Could not generate an invoice because there are no billable time entries or expenses on that matter." };
    }
    return { ok: true, message: `Confirmed. ${invoice.invoiceNumber} generated for ${matter.fileReference}.` };
  }

  if (proposal.action === "update_invoice_status") {
    const invoiceId = proposal.payload.invoiceId || proposal.targetId;
    const invoiceStatus = getInvoiceStatusValue(proposal);
    const invoice = findInvoice(helpers.state, invoiceId);
    if (!invoice || !invoiceStatus) {
      return { ok: false, message: "Could not update the invoice because the invoice or status was missing." };
    }
    helpers.updateInvoiceStatus(invoice.id, invoiceStatus);
    return { ok: true, message: `Confirmed. ${invoice.invoiceNumber} marked ${invoiceStatus}.` };
  }

  if (proposal.action === "add_timeline_entry") {
    const description = proposal.payload.timelineDescription || proposal.newValue;
    if (!matter || !description?.trim()) {
      return { ok: false, message: "Could not add the timeline entry because the matter or description was missing." };
    }
    helpers.addTimelineEvent({
      matterId: matter.id,
      type: "matter_updated",
      description: description.trim()
    });
    return { ok: true, message: `Confirmed. Timeline entry added to ${matter.fileReference}.` };
  }

  if (proposal.action === "run_conflict_check") {
    if (!matter) return { ok: false, message: "Could not run the conflict check because the matter was not found." };
    const queries = getConflictQueries(
      proposal,
      matter,
      helpers.state.clients.find((item) => item.id === matter.clientId)
    );
    if (queries.length === 0) {
      return { ok: false, message: "Could not run the conflict check because no search terms were supplied." };
    }
    const log = helpers.runConflictCheck({
      matterId: matter.id,
      queries,
      source: "kero_ai"
    });
    return { ok: true, message: `Confirmed. Conflict check run on ${matter.fileReference}: ${log.resultCount} potential match${log.resultCount === 1 ? "" : "es"}.` };
  }

  return { ok: false, message: "That proposed action is not supported." };
}

function getTimelineMatterIdsForProposal(proposal: ActionProposal, state: KeroState) {
  if (proposal.action === "add_timeline_entry" || proposal.action === "run_conflict_check") {
    const matter = state.matters.find((item) => item.id === proposal.targetId);
    return matter ? [matter.id] : [];
  }

  if (proposal.action === "add_calendar_event") {
    const matterId =
      proposal.payload.calendarMatterId ||
      (proposal.targetType === "matter" ? proposal.targetId : "");
    return matterId ? [matterId] : [];
  }

  if (proposal.action === "update_invoice_status") {
    const invoiceId = proposal.payload.invoiceId || proposal.targetId;
    const invoice = findInvoice(state, invoiceId);
    return invoice ? [invoice.matterId] : [];
  }

  if (proposal.targetType === "matter") return [proposal.targetId];

  if (proposal.targetType === "client") {
    return state.matters
      .filter((matter) => matter.clientId === proposal.targetId)
      .map((matter) => matter.id);
  }

  return [];
}

function describeKeroAiTimelineAction(proposal: ActionProposal) {
  const field = proposal.fieldLabel || proposal.field || proposal.action.replaceAll("_", " ");
  const currentValue = proposal.currentValue || "blank";
  const newValue = proposal.newValue || "blank";
  return `Kero AI action confirmed: ${field} changed from ${currentValue} to ${newValue}`;
}

function getProposalPreview(proposal: ActionProposal, state: KeroState): ProposalPreview {
  const matter = state.matters.find((item) => item.id === proposal.targetId);
  const client =
    proposal.targetType === "client"
      ? state.clients.find((item) => item.id === proposal.targetId)
      : undefined;

  const fallback: ProposalPreview = {
    targetLabel: proposal.targetLabel || proposal.targetId,
    fieldLabel: proposal.fieldLabel || proposal.field,
    currentValue: proposal.currentValue || "current value",
    newValue: proposal.newValue || "new value"
  };

  if (proposal.action === "add_note") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const noteBody = proposal.payload.noteBody || proposal.newValue;
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Notes",
      currentValue: `${matter.notes.length} notes`,
      newValue: noteBody || "new note"
    };
  }

  if (proposal.action === "update_aml") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const amlField = getAmlField(proposal);
    const amlValue = getBooleanValue(proposal);
    if (!amlField) return { ...fallback, error: "AML field missing." };
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: amlFieldLabel(amlField),
      currentValue: formatBoolean(matter.aml[amlField]),
      newValue: typeof amlValue === "boolean" ? formatBoolean(amlValue) : proposal.newValue || "new value"
    };
  }

  if (proposal.action === "toggle_matter_checklist") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const items = getMatterChecklistItems(state, matter);
    const complete = items.length > 0 && items.every((item) => item.completedAt);
    const checklistItem = findMatterChecklistItem(state, matter, proposal);
    const completed = getMatterChecklistCompletedValue(proposal);
    if (!checklistItem) return { ...fallback, error: "Checklist item not found." };
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Matter checklist",
      currentValue: checklistItem.completedAt
        ? `Completed ${formatDisplayDate(checklistItem.completedAt)}`
        : "Outstanding",
      newValue:
        typeof completed === "boolean"
          ? completed
            ? "Completed"
            : "Outstanding"
          : proposal.newValue || "new value",
      error: complete ? "This matter checklist is already complete and read-only." : undefined
    };
  }

  if (proposal.action === "add_matter_checklist_item") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const items = getMatterChecklistItems(state, matter);
    const complete = items.length > 0 && items.every((item) => item.completedAt);
    const label =
      proposal.payload.customChecklistLabel ||
      proposal.payload.matterChecklistLabel ||
      proposal.newValue;
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Matter checklist",
      currentValue: `${items.length} checklist items`,
      newValue: label || "new checklist item",
      error: complete
        ? "This matter checklist is already complete and read-only."
        : !label?.trim()
          ? "Checklist item text missing."
          : undefined
    };
  }

  if (proposal.action === "advance_stage") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const stages = getStages(matter.type);
    const nextStageIndex = Math.min(matter.stageIndex + 1, stages.length - 1);
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Stage",
      currentValue: getCurrentStage(matter),
      newValue: stages[nextStageIndex] ?? getCurrentStage(matter)
    };
  }

  if (proposal.action === "set_stage") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const stages = getStages(matter.type);
    const stageIndex = getStageIndex(proposal, matter);
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Stage",
      currentValue: getCurrentStage(matter),
      newValue:
        typeof stageIndex === "number" && stages[stageIndex]
          ? stages[stageIndex]
          : proposal.newValue || "requested stage",
      error:
        typeof stageIndex === "number" && stages[stageIndex]
          ? undefined
          : "Requested stage is invalid."
    };
  }

  if (proposal.action === "update_key_date") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const field = getKeyDateField(proposal);
    const dateValue = getDateValue(proposal);
    if (!field) return { ...fallback, error: "Date field missing." };
    const currentValue = getMatterDateValue(matter, field);
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: field === "closingDate" ? "Closing date" : "Limitation date",
      currentValue: currentValue ? formatDisplayDate(currentValue) : "blank",
      newValue: dateValue
        ? formatDisplayDate(dateValue)
        : proposal.newValue || "new date"
    };
  }

  if (proposal.action === "update_client") {
    if (!client) return { ...fallback, error: "Client not found." };
    const field = getClientField(proposal);
    const clientValue = proposal.payload.clientValue || proposal.newValue;
    if (!field) return { ...fallback, error: "Client field missing." };
    return {
      targetLabel: client.fullName,
      fieldLabel: fieldLabel(field),
      currentValue: client[field] || "blank",
      newValue: clientValue || "new value"
    };
  }

  if (proposal.action === "set_letter_status") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const letterId = getLetterId(proposal);
    const letter = findLetterForMatter(state, matter, letterId);
    const letterStatus = getLetterStatusValue(proposal);
    if (!letterId || !letter) return { ...fallback, error: "Letter not found on this matter." };
    if (!letterStatus) return { ...fallback, error: "Letter status missing." };
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: letter.title,
      currentValue: getDocumentStatus(state, matter.id, letter.id),
      newValue: letterStatus
    };
  }

  if (proposal.action === "add_calendar_event") {
    const title = proposal.payload.calendarTitle || proposal.newValue;
    const date = proposal.payload.calendarDate || getDateValue(proposal);
    const time = timeKey(proposal.payload.calendarTime);
    const type = proposal.payload.calendarType || inferCalendarType(proposal);
    return {
      targetLabel: matter
        ? `${matter.fileReference} · ${getMatterTitle(matter)}`
        : "Calendar",
      fieldLabel: "Calendar event",
      currentValue: "No event",
      newValue: [
        title,
        type,
        date ? formatDisplayDate(date) : "",
        time ? formatEventTime(time) : ""
      ].filter(Boolean).join(" · "),
      error: !title?.trim() || !date || !type ? "Event title, type, or date missing." : undefined
    };
  }

  if (proposal.action === "add_time_entry") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const description = proposal.payload.timeDescription || proposal.newValue;
    const durationHours = Number(proposal.payload.durationHours);
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Time log",
      currentValue: `${state.timeEntries.filter((entry) => entry.matterId === matter.id).length} entries`,
      newValue: `${description || "time entry"} · ${durationHours || 0}h`,
      error: !description?.trim() || !durationHours || durationHours <= 0 ? "Description or duration missing." : undefined
    };
  }

  if (proposal.action === "add_expense") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const description = proposal.payload.expenseDescription || proposal.newValue;
    const amount = Number(proposal.payload.expenseAmount);
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Expenses",
      currentValue: `${state.expenses.filter((expense) => expense.matterId === matter.id).length} entries`,
      newValue: `${description || "expense"} · ${formatCurrency(amount || 0)}`,
      error: !description?.trim() || !amount || amount <= 0 ? "Description or amount missing." : undefined
    };
  }

  if (proposal.action === "generate_invoice") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const billableTime = state.timeEntries.filter((entry) => entry.matterId === matter.id && entry.billable);
    const billableExpenses = state.expenses.filter((expense) => expense.matterId === matter.id && expense.billable);
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Invoice",
      currentValue: `${state.invoices.filter((invoice) => invoice.matterId === matter.id).length} invoices`,
      newValue: "New draft invoice",
      error:
        billableTime.length + billableExpenses.length > 0
          ? undefined
          : "No billable time or expenses are available for this matter."
    };
  }

  if (proposal.action === "update_invoice_status") {
    const invoiceId = proposal.payload.invoiceId || proposal.targetId;
    const invoice = findInvoice(state, invoiceId);
    const invoiceStatus = getInvoiceStatusValue(proposal);
    if (!invoice) return { ...fallback, error: "Invoice not found." };
    if (!invoiceStatus) return { ...fallback, error: "Invoice status missing." };
    return {
      targetLabel: invoice.invoiceNumber,
      fieldLabel: "Invoice status",
      currentValue: invoice.status,
      newValue: invoiceStatus
    };
  }

  if (proposal.action === "add_timeline_entry") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const description = proposal.payload.timelineDescription || proposal.newValue;
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Timeline",
      currentValue: `${state.timelineEvents.filter((event) => event.matterId === matter.id).length} entries`,
      newValue: description || "new timeline entry",
      error: !description?.trim() ? "Timeline entry description missing." : undefined
    };
  }

  if (proposal.action === "run_conflict_check") {
    if (!matter) return { ...fallback, error: "Matter not found." };
    const matterClient = state.clients.find((item) => item.id === matter.clientId);
    const queries = getConflictQueries(proposal, matter, matterClient);
    return {
      targetLabel: `${matter.fileReference} · ${getMatterTitle(matter)}`,
      fieldLabel: "Conflict check",
      currentValue: `${state.conflictCheckLogs.filter((log) => log.matterId === matter.id).length} checks logged`,
      newValue: `Run check for ${queries.join(", ") || "matter parties"}`,
      error: queries.length === 0 ? "Conflict check search terms missing." : undefined
    };
  }

  return { ...fallback, error: "Unsupported action." };
}

function updateMatterDate(matter: Matter, field: "closingDate" | "limitationDate", value: string): Matter {
  if (field === "closingDate" && matter.type === "conveyancing") {
    return { ...matter, fields: { ...matter.fields, closingDate: value } };
  }
  if (field === "closingDate" && matter.type === "purchase") {
    return { ...matter, fields: { ...matter.fields, closingDate: value } };
  }
  if (field === "limitationDate" && matter.type === "litigation") {
    return { ...matter, fields: { ...matter.fields, limitationDate: value } };
  }
  return matter;
}

function getMatterChecklistItems(state: KeroState, matter: Matter) {
  return state.matterChecklists[matter.id] ?? buildDefaultMatterChecklist(matter.type);
}

function findMatterChecklistItem(
  state: KeroState,
  matter: Matter,
  proposal: ActionProposal
) {
  const items = getMatterChecklistItems(state, matter);
  const itemId = proposal.payload.matterChecklistItemId?.trim();
  if (itemId) {
    const byId = items.find((item) => item.id === itemId);
    if (byId) return byId;
  }

  const search = normaliseChecklistSearch(
    proposal.payload.matterChecklistLabel ||
      proposal.fieldLabel ||
      proposal.field ||
      proposal.newValue
  );
  if (!search) return undefined;
  return (
    items.find((item) => normaliseChecklistSearch(item.label) === search) ??
    items.find((item) => normaliseChecklistSearch(item.label).includes(search)) ??
    items.find((item) => search.includes(normaliseChecklistSearch(item.label)))
  );
}

function normaliseChecklistSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMatterChecklistCompletedValue(proposal: ActionProposal) {
  if (typeof proposal.payload.matterChecklistCompleted === "boolean") {
    return proposal.payload.matterChecklistCompleted;
  }
  return getBooleanValue(proposal);
}

function getDocumentKey(matterId: string, letterId: string) {
  return `${matterId}:${letterId}`;
}

function getDocumentStatus(state: KeroState, matterId: string, letterId: string): LetterStatus {
  return state.documentStatuses[getDocumentKey(matterId, letterId)] ?? "Drafted";
}

function getLetterId(proposal: ActionProposal) {
  return proposal.payload.letterId || proposal.payload.letterTitle || proposal.field || "";
}

function findLetterForMatter(state: KeroState, matter: Matter, letterId?: string) {
  const client = state.clients.find((item) => item.id === matter.clientId);
  if (!client) return undefined;
  const letters = getLetters(matter, client, state.settings, {
    globalTemplates: state.globalTemplates,
    customLetterTemplates: state.customLetterTemplates
  });
  const search = (letterId || "").trim().toLowerCase();
  return letters.find(
    (letter) =>
      letter.id === letterId ||
      letter.id.toLowerCase() === search ||
      letter.title.toLowerCase() === search
  );
}

function getLetterStatusValue(proposal: ActionProposal): LetterStatus | undefined {
  if (proposal.payload.letterStatus) return proposal.payload.letterStatus;
  const value = `${proposal.newValue} ${proposal.fieldLabel}`.toLowerCase();
  if (value.includes("await")) return "Awaiting Response";
  if (value.includes("sent") || value.includes("resend")) return "Sent";
  if (value.includes("draft") || value.includes("unsent") || value.includes("unmark")) {
    return "Drafted";
  }
  return undefined;
}

function inferCalendarType(proposal: ActionProposal): CalendarEventType | undefined {
  if (proposal.payload.calendarType) return proposal.payload.calendarType;
  const value = `${proposal.field} ${proposal.fieldLabel} ${proposal.newValue}`.toLowerCase();
  if (value.includes("closing")) return "closing";
  if (value.includes("limitation")) return "limitation";
  if (value.includes("court") || value.includes("hearing")) return "court";
  if (value.includes("invoice") || value.includes("payment")) return "invoice";
  if (value.includes("event") || value.includes("diary") || value.includes("calendar")) return "custom";
  return "custom";
}

function getInvoiceStatusValue(proposal: ActionProposal): InvoiceStatus | undefined {
  if (proposal.payload.invoiceStatus) return proposal.payload.invoiceStatus;
  const value = `${proposal.newValue} ${proposal.fieldLabel}`.toLowerCase();
  if (value.includes("paid")) return "Paid";
  if (value.includes("overdue")) return "Overdue";
  if (value.includes("sent")) return "Sent";
  if (value.includes("draft")) return "Draft";
  return undefined;
}

function findInvoice(state: KeroState, idOrNumber: string) {
  const search = idOrNumber.trim().toLowerCase();
  return state.invoices.find(
    (invoice) =>
      invoice.id === idOrNumber ||
      invoice.id.toLowerCase() === search ||
      invoice.invoiceNumber.toLowerCase() === search
  );
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function getMatterDateValue(matter: Matter, field: "closingDate" | "limitationDate") {
  if (field === "closingDate" && matter.type === "conveyancing") return matter.fields.closingDate;
  if (field === "closingDate" && matter.type === "purchase") return matter.fields.closingDate;
  if (field === "limitationDate" && matter.type === "litigation") {
    return matter.fields.limitationDate;
  }
  return "";
}

function statusForStage(matter: Matter, stageIndex: number): MatterStatus {
  const finalStageIndex = getStages(matter.type).length - 1;
  if (stageIndex >= finalStageIndex) return "Closed";
  if (stageIndex > 0) return "In Progress";
  return "Open";
}

function getAmlField(proposal: ActionProposal) {
  if (proposal.payload.amlField) return proposal.payload.amlField;
  const field = `${proposal.field} ${proposal.fieldLabel}`.toLowerCase();
  if (field.includes("photo") || field.includes("id")) return "photoIdReceived";
  if (field.includes("address")) return "proofOfAddressReceived";
  if (field.includes("fund")) return "sourceOfFundsReceived";
  if (field.includes("verified") || field.includes("verify")) return "verified";
  return undefined;
}

function getBooleanValue(proposal: ActionProposal) {
  if (typeof proposal.payload.amlValue === "boolean") return proposal.payload.amlValue;
  const value = proposal.newValue.toLowerCase();
  if (
    ["yes", "true", "received", "verified", "complete", "completed", "tick", "ticked"].some(
      (word) => value.includes(word)
    )
  ) {
    return true;
  }
  if (
    [
      "no",
      "false",
      "missing",
      "incomplete",
      "not received",
      "unverified",
      "untick",
      "unticked",
      "unchecked",
      "outstanding"
    ].some((word) =>
      value.includes(word)
    )
  ) {
    return false;
  }
  return undefined;
}

function getStageIndex(proposal: ActionProposal, matter?: Matter) {
  if (typeof proposal.payload.stageIndex === "number") return proposal.payload.stageIndex;
  if (!matter) return undefined;
  const requestedStage = proposal.newValue.trim().toLowerCase();
  return getStages(matter.type).findIndex((stage) => stage.toLowerCase() === requestedStage);
}

function getKeyDateField(proposal: ActionProposal) {
  if (proposal.payload.keyDateField) return proposal.payload.keyDateField;
  const field = `${proposal.field} ${proposal.fieldLabel}`.toLowerCase();
  if (field.includes("closing")) return "closingDate";
  if (field.includes("limitation")) return "limitationDate";
  return undefined;
}

function getDateValue(proposal: ActionProposal) {
  if (proposal.payload.dateValue) return proposal.payload.dateValue;
  const match = proposal.newValue.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function getClientField(proposal: ActionProposal) {
  if (proposal.payload.clientField) return proposal.payload.clientField;
  const field = `${proposal.field} ${proposal.fieldLabel}`.toLowerCase();
  if (field.includes("address")) return "address";
  if (field.includes("phone") || field.includes("mobile") || field.includes("telephone")) {
    return "phone";
  }
  if (field.includes("email") || field.includes("e-mail")) return "email";
  return undefined;
}

function getConflictQueries(proposal: ActionProposal, matter: Matter, client?: Client) {
  const queries = [
    ...(proposal.payload.conflictQueries ?? []),
    proposal.newValue,
    client?.fullName ?? ""
  ];

  if (matter.type === "conveyancing") {
    queries.push(
      matter.fields.buyerName,
      matter.fields.buyerSolicitorName,
      matter.fields.buyerSolicitorAddress,
      matter.fields.auctioneerName,
      matter.fields.mortgageHolder,
      matter.fields.propertyAddress
    );
  }
  if (matter.type === "purchase") {
    queries.push(
      matter.fields.vendorName,
      matter.fields.vendorSolicitorName,
      matter.fields.vendorSolicitorAddress,
      matter.fields.mortgageLender,
      matter.fields.propertyAddress
    );
  }
  if (matter.type === "litigation") {
    queries.push(
      matter.fields.opponentName,
      matter.fields.opponentSolicitor,
      matter.fields.opponentAddress,
      matter.fields.disputeDescription
    );
  }
  if (matter.type === "adhoc") {
    queries.push(
      matter.fields.thirdPartyName,
      matter.fields.thirdPartyAddress,
      matter.fields.matterDescription
    );
  }

  return Array.from(
    new Set(queries.map((query) => query.trim()).filter((query) => query.length >= 3))
  );
}

function amlFieldLabel(field: NonNullable<ActionProposal["payload"]["amlField"]>) {
  if (field === "photoIdReceived") return "AML photo ID";
  if (field === "proofOfAddressReceived") return "AML proof of address";
  if (field === "sourceOfFundsReceived") return "AML source of funds";
  return "AML verified";
}

function fieldLabel(field: "address" | "phone" | "email") {
  if (field === "address") return "Address";
  if (field === "phone") return "Phone";
  return "Email";
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}
