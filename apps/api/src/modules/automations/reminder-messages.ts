import { ReminderMessageKind } from '../../generated/prisma/enums.js';

/** Words an admin message may use, in braces: {name} first name, {drop} the place, {time} usual time, {vehicle} "an Auto". */
export const PLACEHOLDERS = ['name', 'drop', 'time', 'vehicle'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

/** The placeholders each reminder can fill ({time} and {vehicle} come from a usual trip). */
export const KIND_PLACEHOLDERS: Record<ReminderMessageKind, readonly Placeholder[]> = {
  [ReminderMessageKind.SEARCH_LOCAL]: ['name', 'drop'],
  [ReminderMessageKind.SEARCH_OUTSTATION]: ['name', 'drop'],
  [ReminderMessageKind.ROUTINE]: ['name', 'drop', 'time', 'vehicle'],
};

/** A push title and text, as campaigns allow. */
export const MESSAGE_TITLE_MAX = 65;
export const MESSAGE_BODY_MAX = 180;

const BRACED = /\{([a-zA-Z]+)\}/g;

/** The {words} in [text], in order. */
export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(BRACED)].map((m) => m[1]);
}

/** The first problem with a message for [kind], or null. */
export function messageError(kind: ReminderMessageKind, title: string, body: string): string | null {
  if (!title.trim()) return 'Write a title';
  if (!body.trim()) return 'Write a message';
  if (title.trim().length > MESSAGE_TITLE_MAX) return `Keep the title within ${MESSAGE_TITLE_MAX} characters`;
  if (body.trim().length > MESSAGE_BODY_MAX) return `Keep the message within ${MESSAGE_BODY_MAX} characters`;
  const allowed = KIND_PLACEHOLDERS[kind] as readonly string[];
  const unknown = [...placeholdersIn(title), ...placeholdersIn(body)].find((p) => !allowed.includes(p));
  return unknown ? `{${unknown}} can't be used here: use ${allowed.map((p) => `{${p}}`).join(', ')}` : null;
}

/** [text] with each {placeholder} replaced from [values]; null when one has no value (empty counts as none). */
export function fillMessage(text: string, values: Partial<Record<Placeholder, string>>): string | null {
  let missing = false;
  const out = text.replace(BRACED, (_, key: string) => {
    const v = values[key as Placeholder]?.trim();
    if (!v) missing = true;
    return v ?? '';
  });
  return missing ? null : out.trim();
}

/**
 * One of [messages] at random among those [values] can fill (a message naming {name} is left out for a rider
 * without a name), with its filled title and body; null when none fits.
 */
export function pickMessage<T extends { title: string; body: string }>(
  messages: readonly T[],
  values: Partial<Record<Placeholder, string>>,
  random: () => number = Math.random,
): { message: T; title: string; body: string } | null {
  const fits = messages.flatMap((message) => {
    const title = fillMessage(message.title, values);
    const body = fillMessage(message.body, values);
    return title && body ? [{ message, title, body }] : [];
  });
  return fits.length ? fits[Math.min(fits.length - 1, Math.floor(random() * fits.length))] : null;
}
