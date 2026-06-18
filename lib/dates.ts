export function formatDisplayDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function todayIso() {
  return new Date().toISOString();
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function addYears(inputDate: string, years: number) {
  if (!inputDate) return "";
  const [year, month, day] = inputDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${year + years}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isWithinMonths(inputDate: string, months: number) {
  if (!inputDate) return false;
  const date = new Date(`${inputDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const limit = new Date();
  limit.setHours(23, 59, 59, 999);
  limit.setMonth(limit.getMonth() + months);
  return date >= now && date <= limit;
}

export function relativeTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
