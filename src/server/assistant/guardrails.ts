import 'server-only';
import { REFUSAL_MARKER } from './prompt';

// T070: the streaming output filter. Text deltas pass through it before they reach the browser.
// It holds back the last few characters of each chunk, so a canary split across two deltas is
// still caught before any part of it is sent.

export const BLOCKED_REPLACEMENT_TEXT =
  "Sorry, I can't share that. I can answer questions about Mauricio's projects, skills, experience and how to contact him.";

export interface OutputFilter {
  /** Feed one delta. Returns the text that is safe to send now. */
  push(chunk: string): { safeText: string; blocked: boolean };
  /** End of stream: returns what was held back, unless the answer was blocked. */
  flush(): string;
}

export function createOutputFilter({ canary }: { canary: string }): OutputFilter {
  const hold = Math.max(canary.length, REFUSAL_MARKER.length) - 1;
  let buffer = '';
  let blocked = false;
  let atStart = true;

  return {
    push(chunk) {
      if (blocked) return { safeText: '', blocked };
      buffer += chunk;
      if (buffer.includes(canary)) {
        blocked = true;
        buffer = '';
        return { safeText: '', blocked };
      }
      // Hide the refusal marker if the answer starts with it.
      if (atStart && buffer.trimStart().length >= REFUSAL_MARKER.length) {
        atStart = false;
        if (buffer.trimStart().startsWith(REFUSAL_MARKER)) buffer = buffer.trimStart().slice(REFUSAL_MARKER.length).trimStart();
      }
      if (atStart) return { safeText: '', blocked };
      const cut = Math.max(0, buffer.length - hold);
      const safeText = buffer.slice(0, cut);
      buffer = buffer.slice(cut);
      return { safeText, blocked };
    },
    flush() {
      if (blocked) return '';
      const rest = atStart && buffer.trimStart().startsWith(REFUSAL_MARKER)
        ? buffer.trimStart().slice(REFUSAL_MARKER.length).trimStart()
        : buffer;
      buffer = '';
      return rest;
    },
  };
}

/** A refusal is marked anywhere in the answer: the model sometimes writes the marker late. */
export function isRefusal(text: string): boolean {
  return text.includes(REFUSAL_MARKER);
}

/** Removes every copy of the marker, so the visitor never sees it, wherever the model put it. */
export function stripRefusalMarker(text: string): string {
  if (!isRefusal(text)) return text;
  return text.split(REFUSAL_MARKER).map((part) => part.trim()).filter(Boolean).join(' ');
}
