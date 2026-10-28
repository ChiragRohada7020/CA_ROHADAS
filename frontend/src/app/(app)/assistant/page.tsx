"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceAssistant } from "@/components/VoiceAssistant";

import { AssistantActivity, type ActivityStep, toolLabel } from "@/components/AssistantActivity";
import { ActionButtons, StructuredCard, type AssistantAction } from "@/components/AssistantCards";
import { AssistantMarkdown } from "@/components/AssistantMarkdown";
import {
  AssistantRequestError,
  streamAssistantTurn,
  type AssistantEvent,
} from "@/lib/assistantStream";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  structured?: any;
  actions?: AssistantAction[];
  pending_confirmation?: {
    tool: string;
    arguments: Record<string, unknown>;
    message: string;
  } | null;
  /** Set when this assistant bubble is a failure, not an answer. */
  error?: boolean;
  /** What to resend when the user clicks Retry. */
  retry?: { text: string; args?: Record<string, unknown>; confirm: boolean };
  /** How the answer was produced, for the muted footer. */
  trace?: { tools: string[]; seconds: number };
}

const QUICK_COMMANDS = [
  { label: "My tasks", cmd: "show me my tasks" },
  { label: "Overdue", cmd: "show me overdue tasks" },
  { label: "Review queue", cmd: "show me tasks awaiting my review" },
  { label: "Clients", cmd: "show me all clients with pending compliance tasks" },
];

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-[10px] font-semibold text-white shadow-sm">
        You
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shadow-sm">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">
        <path d="M12 2 4 6v6c0 5 3.4 9.3 8 10 4.6-.7 8-5 8-10V6l-8-4Zm0 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 11c-2 0-3.8-1-5-2.6.1-1.6 2.5-2.4 5-2.4s4.9.8 5 2.4A6.2 6.2 0 0 1 12 18Z" />
      </svg>
    </span>
  );
}

function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
  disabled,
}: {
  confirmation: { tool: string; arguments: Record<string, unknown>; message: string };
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white shadow-[0_12px_32px_-20px_rgba(180,83,9,0.35)]">
      <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-400" />
      <div className="px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs">
            !
          </span>
          Confirm before I change anything
        </p>
        <p className="mt-1.5 text-sm text-amber-900/90">{confirmation.message}</p>
        <div className="mt-2 rounded-lg border border-amber-100 bg-white/70 px-3 py-2">
          <p className="font-mono text-xs text-amber-800">{toolLabel(confirmation.tool)}</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-slate-600">
            {JSON.stringify(confirmation.arguments, null, 2)}
          </pre>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-lg border border-amber-200 bg-white px-3.5 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hey there. I can help you with clients, tasks, invoices, compliance... just talk to me naturally.",
    },
  ]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<ActivityStep[]>([]);
  const [headline, setHeadline] = useState("Thinking about your question…");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [expandedTrace, setExpandedTrace] = useState<number | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(0);
  const stepCounter = useRef(0);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, steps]);

  // A live clock while a turn runs, so a 30-second wait never looks like a hang.
  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now();
    setElapsedMs(0);
    const timer = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt.current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [running]);

  function handleEvent(event: AssistantEvent) {
    if (event.type === "thinking") {
      setHeadline("Thinking about your question…");
      return;
    }
    if (event.type === "tool_start") {
      setHeadline(`${toolLabel(event.tool)}…`);
      stepCounter.current += 1;
      setSteps((prev) => [
        ...prev,
        { id: `step-${stepCounter.current}`, tool: event.tool, status: "running" },
      ]);
      return;
    }
    if (event.type === "tool_end") {
      setSteps((prev) => {
        const next = [...prev];
        // Close the most recent still-running entry for this tool.
        for (let index = next.length - 1; index >= 0; index -= 1) {
          if (next[index].tool === event.tool && next[index].status === "running") {
            next[index] = {
              ...next[index],
              status: event.status === "error" ? "error" : "ok",
              detail:
                event.status === "error"
                  ? event.message ?? "failed"
                  : event.count !== undefined
                    ? `${event.count} item${event.count === 1 ? "" : "s"}`
                    : event.title ?? undefined,
            };
            break;
          }
        }
        return next;
      });
    }
  }

  const speakResponse = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Clean markdown and make it conversational
        let cleanText = text.replace(/\[\[.*?\]\]/g, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/#{1,6}\s+/g, "");
    cleanText = cleanText.split("\n").join(". ").replace(/\s+/g, " ").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 200));
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    utterance.pitch = 0.95;
    utterance.volume = 0.6;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsListening(false);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      if (voiceMode) {
        setTimeout(() => startListening(), 300);
      }
    };
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (typeof window === "undefined" || running || isSpeaking) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      if (transcript.trim()) {
        sendMessage(transcript.trim());
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      if (voiceMode && !isSpeaking && !running) {
        setTimeout(() => startListening(), 1000);
      }
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    try {
      recognition.start();
    } catch {}
  };

  async function sendMessage(
    text: string,
    args?: Record<string, unknown>,
    confirm: boolean = false,
    shownAs?: string,
  ) {
    const message = text.trim();
    if (!message || running) return;

    setMessages((prev) => [...prev, { role: "user", content: (shownAs || message).trim() }]);
    setInput("");
    setRunning(true);
    setSteps([]);
    setHeadline("Thinking about your question…");
    stepCounter.current = 0;

    const toolNames: string[] = [];
    const onEvent = (event: AssistantEvent) => {
      if (event.type === "tool_start") toolNames.push(event.tool);
      handleEvent(event);
    };

    try {
      const payload = await streamAssistantTurn(
        {
          message,
          session_id: sessionId,
          confirm,
          ...(args ? { tool_args: args } : {}),
        },
        onEvent,
      );

      if (payload.session_id) setSessionId(payload.session_id);
      if (payload.response && !payload.pending_confirmation && voiceMode) {
        speakResponse(payload.response);
      } else if (payload.response && !payload.pending_confirmation && !voiceMode) {
        // Don't auto-speak in normal mode
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: payload.response || "",
          structured: payload.structured,
          actions: payload.actions,
          pending_confirmation: payload.pending_confirmation || null,
          trace: toolNames.length
            ? {
                tools: [...new Set(toolNames)],
                seconds: (performance.now() - startedAt.current) / 1000,
              }
            : undefined,
        },
      ]);
    } catch (error) {
      const failed = error instanceof AssistantRequestError ? error : null;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            failed?.message ??
            `Could not reach the assistant: ${
              error instanceof Error ? error.message : String(error)
            }`,
          error: true,
          retry: { text: message, args, confirm },
        },
      ]);
    } finally {
      // The activity strip is for work in progress: it goes away with it.
      setRunning(false);
      setSteps([]);
    }
  }

  function retry(message: ChatMessage) {
    if (!message.retry) return;
    const { text, args, confirm } = message.retry;
    sendMessage(text, args, confirm, "Retry");
  }

  function runAction(action: AssistantAction) {
    sendMessage(action.action, action.args, false, action.label);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex items-center gap-3 pb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-[0_8px_20px_-8px_rgba(2,132,199,0.6)]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
            <path d="M12 2 4 6v6c0 5 3.4 9.3 8 10 4.6-.7 8-5 8-10V6l-8-4Zm0 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 11c-2 0-3.8-1-5-2.6.1-1.6 2.5-2.4 5-2.4s4.9.8 5 2.4A6.2 6.2 0 0 1 12 18Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Assistant</h1>
          <p className="truncate text-sm text-slate-500">
            Works on your firm&apos;s records through its own tools, under your permissions.
          </p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live data
        </span>
      </header>

      <div
        ref={chatRef}
        className="flex-1 space-y-5 overflow-y-auto rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/60 px-4 py-5 sm:px-6"
      >
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <div key={index} className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
              <Avatar role={message.role} />
              <div
                className={`flex min-w-0 max-w-[min(46rem,88%)] flex-col gap-2 ${
                  isUser ? "items-end" : "items-start"
                }`}
              >
                {isUser ? (
                  <div className="rounded-2xl rounded-tr-sm bg-gradient-to-br from-sky-600 to-indigo-600 px-4 py-2.5 text-sm text-white shadow-[0_8px_20px_-12px_rgba(2,132,199,0.8)]">
                    {message.content}
                  </div>
                ) : (
                  <AssistantTurn
                    message={message}
                    index={index}
                    running={running}
                    expandedTrace={expandedTrace}
                    onToggleTrace={setExpandedTrace}
                    onAction={runAction}
                    onRetry={retry}
                    onConfirm={() =>
                      sendMessage(
                        "Yes, please proceed with this action", undefined, true, "Confirmed",
                      )
                    }
                    onCancel={() => sendMessage("No, cancel that", undefined, false, "Cancelled")}
                  />
                )}
              </div>
            </div>
          );
        })}

        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pl-10 pt-1">
            {QUICK_COMMANDS.map((quick) => (
              <button
                key={quick.cmd}
                type="button"
                onClick={() => sendMessage(quick.cmd)}
                disabled={running}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-50"
              >
                {quick.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 pt-3">
        {running && <AssistantActivity steps={steps} headline={headline} elapsedMs={elapsedMs} />}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(16,27,61,0.04),0_12px_32px_-24px_rgba(16,27,61,0.35)]"
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage(input);
              }
            }}
            rows={1}
            placeholder="Ask about tasks, clients, compliance, documents… or use voice"
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => {
              setVoiceMode(!voiceMode);
              if (!voiceMode) {
                startListening();
              } else {
                if (recognitionRef.current) {
                  try { recognitionRef.current.stop(); } catch {}
                }
                if (typeof window !== "undefined" && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
                setIsListening(false);
                setIsSpeaking(false);
              }
            }}
            disabled={running && !voiceMode}
            className={`flex h-10 items-center justify-center rounded-xl px-3 transition ${voiceMode ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white animate-pulse' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            title={voiceMode ? "Stop conversation" : "Start voice conversation"}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowVoice(true)}
            className="flex h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"
            title="Voice Assistant"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          <button
            type="submit"
            disabled={running || !input.trim()}
            className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-sky-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
          >
            {running ? "Working…" : "Send"}
          </button>
        </form>
        <p className="pb-1 text-center text-[11px] text-slate-400">
          Answers come from your own records. Anything that changes data asks for confirmation
          first.
        </p>
      </div>
      <VoiceAssistant open={showVoice} onClose={() => setShowVoice(false)} />
    </div>
  );
}

/**
 * One assistant turn: the answer, its card, its actions, its confirmation and
 * the muted trace footer. Split out so the transcript map stays readable.
 */
function AssistantTurn({
  message,
  index,
  running,
  expandedTrace,
  onToggleTrace,
  onAction,
  onRetry,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  index: number;
  running: boolean;
  expandedTrace: number | null;
  onToggleTrace: (index: number | null) => void;
  onAction: (action: AssistantAction) => void;
  onRetry: (message: ChatMessage) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {(message.content || message.error) && (
        <div
          className={`w-full rounded-2xl rounded-tl-sm border px-4 py-3 shadow-[0_1px_2px_rgba(16,27,61,0.04),0_12px_32px_-24px_rgba(16,27,61,0.3)] ${
            message.error ? "border-rose-200 bg-rose-50/80" : "border-slate-200 bg-white"
          }`}
        >
          {message.error ? (
            <p className="whitespace-pre-wrap text-sm text-rose-800">{message.content}</p>
          ) : (
            <AssistantMarkdown content={message.content} />
          )}

          {message.trace && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => onToggleTrace(expandedTrace === index ? null : index)}
                className="text-[11px] text-slate-400 transition hover:text-slate-600"
              >
                {message.trace.tools.length} tool
                {message.trace.tools.length === 1 ? "" : "s"} · {message.trace.seconds.toFixed(1)}s
                {expandedTrace === index ? " · hide" : " · show"}
              </button>
              {expandedTrace === index && (
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  {message.trace.tools.join(" → ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {message.structured && (
        <div className="w-full">
          <StructuredCard
            structured={message.structured}
            actions={message.actions}
            onAction={onAction}
          />
        </div>
      )}

      {!message.structured && message.actions && message.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <ActionButtons actions={message.actions} onAction={onAction} />
        </div>
      )}

      {message.pending_confirmation && (
        <div className="w-full">
          <ConfirmationCard
            confirmation={message.pending_confirmation}
            disabled={running}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        </div>
      )}

      {message.error && message.retry && (
        <button
          type="button"
          onClick={() => onRetry(message)}
          disabled={running}
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          Retry
        </button>
      )}
    </>
  );
}
