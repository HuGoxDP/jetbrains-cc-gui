import { useSyncExternalStore } from 'react';
import { sendBridgeEvent } from './bridge';

/**
 * `/btw` and `/reload-plugins` (ported from Swttch): commands the terminal runs on the
 * live Claude process without adding a turn to the conversation. The IDE hands them to
 * the conversation's runtime (the SDK's query) and answers through
 * `window.onSideQuestionResult` and `window.onReloadPluginsResult`.
 *
 * A side question's answer is shown beside the chat, never in it: the chat is redrawn
 * from the conversation, and the answer is not part of the conversation.
 */

/** Why a side command did not run, as the IDE reports it. */
export type SideCommandFailure =
  | 'empty' | 'no-session' | 'no-runtime' | 'unsupported' | 'unsupported-provider'
  | 'no-answer' | 'timeout' | string;

export interface SideQuestion {
  requestId: string;
  question: string;
  status: 'pending' | 'answered' | 'failed';
  /** The answer as the SDK gave it ({response, synthetic, ...}). */
  answer?: { response: string; [key: string]: unknown };
  reason?: SideCommandFailure;
}

export interface ReloadPluginsOutcome {
  ok: boolean;
  /** The SDK's reloadPlugins() answer as it came. */
  result?: { plugins?: unknown[]; error_count?: number; [key: string]: unknown };
  reason?: SideCommandFailure;
}

/** The IDE gives up on a side question after 180 s (plus starting the process). */
const SIDE_QUESTION_TIMEOUT_MS = 240_000;
const RELOAD_TIMEOUT_MS = 75_000;

let current: SideQuestion | null = null;
let sideQuestionTimer: number | null = null;
const listeners = new Set<() => void>();
const reloadWaiters = new Map<string, (outcome: ReloadPluginsOutcome) => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setCurrent(next: SideQuestion | null): void {
  current = next;
  emit();
}

function newRequestId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parse(json: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(json);
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function ensureCallbacks(): void {
  if (typeof window === 'undefined') return;
  if (!window.onSideQuestionResult) {
    window.onSideQuestionResult = (json: string) => {
      const payload = parse(json);
      if (!payload || !current || payload.requestId !== current.requestId) return;
      const answer = payload.answer as SideQuestion['answer'] | undefined;
      if (payload.ok === true && answer && typeof answer.response === 'string') {
        settleSideQuestion({ ...current, status: 'answered', answer });
      } else {
        settleSideQuestion({ ...current, status: 'failed', reason: String(payload.reason ?? 'failed') });
      }
    };
  }
  if (!window.onReloadPluginsResult) {
    window.onReloadPluginsResult = (json: string) => {
      const payload = parse(json);
      const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null;
      const resolve = requestId ? reloadWaiters.get(requestId) : undefined;
      if (!payload || !requestId || !resolve) return;
      reloadWaiters.delete(requestId);
      resolve(payload.ok === true
        ? { ok: true, result: (payload.result ?? {}) as ReloadPluginsOutcome['result'] }
        : { ok: false, reason: String(payload.reason ?? 'failed') });
    };
  }
}

function settleSideQuestion(next: SideQuestion | null): void {
  if (sideQuestionTimer !== null) {
    window.clearTimeout(sideQuestionTimer);
    sideQuestionTimer = null;
  }
  setCurrent(next);
}

/** Ask `question` about the conversation; the latest question replaces the one shown. */
export function askSideQuestion(question: string): void {
  ensureCallbacks();
  const requestId = newRequestId('btw');
  settleSideQuestion({ requestId, question, status: 'pending' });
  sideQuestionTimer = window.setTimeout(() => {
    if (current?.requestId === requestId && current.status === 'pending') {
      settleSideQuestion({ ...current, status: 'failed', reason: 'timeout' });
    }
  }, SIDE_QUESTION_TIMEOUT_MS);
  if (!sendBridgeEvent('ask_side_question', JSON.stringify({ requestId, question }))) {
    settleSideQuestion({ requestId, question, status: 'failed', reason: 'failed' });
  }
}

/** Put the side question away. */
export function dismissSideQuestion(): void {
  settleSideQuestion(null);
}

export function getSideQuestion(): SideQuestion | null {
  return current;
}

export function subscribeSideQuestion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The side question on show, for components. */
export function useSideQuestion(): SideQuestion | null {
  return useSyncExternalStore(subscribeSideQuestion, getSideQuestion, getSideQuestion);
}

/** Activate pending plugin changes in this conversation's Claude process. */
export function reloadPlugins(): Promise<ReloadPluginsOutcome> {
  ensureCallbacks();
  const requestId = newRequestId('reload');
  return new Promise<ReloadPluginsOutcome>((resolve) => {
    const timer = window.setTimeout(() => {
      reloadWaiters.delete(requestId);
      resolve({ ok: false, reason: 'timeout' });
    }, RELOAD_TIMEOUT_MS);
    reloadWaiters.set(requestId, (outcome) => {
      window.clearTimeout(timer);
      resolve(outcome);
    });
    if (!sendBridgeEvent('reload_plugins', JSON.stringify({ requestId }))) {
      reloadWaiters.delete(requestId);
      window.clearTimeout(timer);
      resolve({ ok: false, reason: 'failed' });
    }
  });
}

/** Test hook. */
export function resetSideCommandsForTests(): void {
  if (sideQuestionTimer !== null) window.clearTimeout(sideQuestionTimer);
  sideQuestionTimer = null;
  current = null;
  reloadWaiters.clear();
  listeners.clear();
  if (typeof window !== 'undefined') {
    delete window.onSideQuestionResult;
    delete window.onReloadPluginsResult;
  }
}
