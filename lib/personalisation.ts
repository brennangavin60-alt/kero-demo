import { isWithinMonths } from "@/lib/dates";
import type { Matter, Settings } from "@/lib/types";

function clean(value?: string) {
  return value?.trim() ?? "";
}

export function getSolicitorName(settings: Settings) {
  return clean(settings.solicitorName);
}

export function getFirmName(settings: Settings) {
  return clean(settings.firmName) || "your firm";
}

export function getFirmTitle(settings: Settings) {
  const firmName = getFirmName(settings);
  return `${firmName} — Kero`;
}

export function getFirmSolicitorsName(settings: Settings) {
  const firmName = getFirmName(settings);
  return /\bsolicitors\b/i.test(firmName) ? firmName : `${firmName} Solicitors`;
}

export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function getDashboardGreeting(settings: Settings, date = new Date()) {
  const solicitorName = getSolicitorName(settings);
  const greeting = getTimeGreeting(date);
  return solicitorName ? `${greeting}, ${solicitorName}` : greeting;
}

export function getKeroAiGreeting(settings: Settings) {
  const solicitorName = getSolicitorName(settings);
  return solicitorName
    ? `Hi ${solicitorName}, what can I help with?`
    : "Hi, what can I help with?";
}

export function getFirstMatterPrompt(settings: Settings) {
  const solicitorName = getSolicitorName(settings);
  return solicitorName
    ? `${solicitorName}, create your first matter to get started`
    : "Create your first matter to get started";
}

export function getActiveMatterCount(matters: Matter[]) {
  return matters.filter((matter) => matter.status !== "Closed").length;
}

export function needsAttentionToday(matter: Matter) {
  if (matter.status === "Closed") return false;
  const amlNeedsAttention = !matter.aml.verified;
  const limitationNeedsAttention =
    matter.type === "litigation" && isWithinMonths(matter.fields.limitationDate, 3);
  return amlNeedsAttention || limitationNeedsAttention;
}

export function getAttentionMatterCount(matters: Matter[]) {
  return matters.filter(needsAttentionToday).length;
}
