"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/Icon";

import { AssistantActivity, type ActivityStep, toolLabel } from "@/components/AssistantActivity";

import { ActionButtons, StructuredCard, type AssistantAction } from "@/components/AssistantCards";

import { AssistantMarkdown } from "@/components/AssistantMarkdown";

import { AssistantUpload } from "@/components/AssistantUpload";

import { AssistantRequestError, streamAssistantTurn, type AssistantEvent } from "@/lib/assistantStream";

import { formatBytes } from "@/lib/format";

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

  error?: boolean;

  retry?: { text: string; args?: Record<string, unknown>; confirm: boolean };

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

      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#5630C9] text-[11px] font-semibold text-white shadow-sm">

        You

      </span>

    );

  }

  return (

    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shadow-sm">

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

  const recognitionRef = useRef<any>(null);

  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [input, setInput] = useState("");

  const [sessionId, setSessionId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);

  const [steps, setSteps] = useState<ActivityStep[]>([]);

  const [headline, setHeadline] = useState("Thinking about your question…");

  const [elapsedMs, setElapsedMs] = useState(0);

  const [expandedTrace, setExpandedTrace] = useState<number | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<

    { id: string; name: string; size_bytes: number; mime_type: string; extracted_chars: number }[]

  >([]);

  const chatRef = useRef<HTMLDivElement>(null);

  const startedAt = useRef<number>(0);

  const stepCounter = useRef(0);

  useEffect(() => {

    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });

  }, [messages, steps]);

  useEffect(() => {

    setAttachedFiles([]);

  }, [sessionId]);

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

  function onFileUploaded(

    file: {

      id: string;

      name: string;

      size_bytes: number;

      mime_type: string;

      extracted_chars: number;

    },

    newSessionId: string,

  ) {

    setAttachedFiles((prev) => [...prev, file]);

    setSessionId(newSessionId);

  }

  function removeAttached(fileId: string) {

    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));

  }

  return (

    <div className="relative h-[calc(100vh-4rem)] w-full flex flex-col overflow-hidden bg-[#F8F7FC] p-0 m-0">

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-15%,rgba(139,92,246,.13),transparent_48%)]" />

      <header className="relative z-10 flex items-center gap-3 border-b border-[#EAE6F4] bg-white/80 px-4 py-3 backdrop-blur-2xl w-full">

        <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#8B5CF6] via-[#7042DE] to-[#4D2AB8] shadow-[0_8px_22px_-8px_rgba(92,57,190,.55)] ring-4 ring-[#F1ECFF]">

          <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">

            <path d="M12 2 4 6v6c0 5 3.4 9.3 8 10 4.6-.7 8-5 8-10V6l-8-4Zm0 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 11c-2 0-3.8-1-5-2.6.1-1.6 2.5-2.4 5-2.4s4.9.8 5 2.4A6.2 6.2 0 0 1 12 18Z" />

          </svg>

        </span>

        <div className="min-w-0 flex-1">

          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-bold tracking-tight text-[#211747]">ROHADAS AI</h1>
            <span className="rounded-md border border-[#E7DFFF] bg-[#F5F0FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.12em] text-[#7543E9]">Assistant</span>
          </div>
          <p className="truncate text-xs text-[#827B98]">Your intelligent workspace for firm operations</p>

        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden flex items-center gap-1.5 rounded-full border border-[#D9F2E5] bg-[#F0FBF5] px-3 py-1.5 text-[11px] font-semibold text-[#218653] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected to firm data
          </span>
          <span className="hidden rounded-xl border border-[#ECE8F4] bg-white px-3 py-2 text-[11px] font-medium text-[#817994] md:inline-flex">Private workspace</span>
        </div>

      </header>

      <div
        ref={chatRef}
        className="relative z-10 flex w-full flex-1 flex-col gap-7 overflow-y-auto px-0 py-6 sm:px-0 sm:py-8"
      >

        {messages.length === 1 && (

          <section className="mx-0 flex w-full max-w-full flex-col items-center pb-2 pt-5 text-center sm:pt-10">

            <div className="mb-5 flex h-[64px] w-[64px] items-center justify-center rounded-[20px] bg-gradient-to-br from-[#8B5CF6] via-[#7042DE] to-[#4D2AB8] shadow-[0_18px_38px_-16px_rgba(91,56,190,.65)] ring-8 ring-[#F0EBFF]">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor"><path d="M12 2 4 6v6c0 5 3.4 9.3 8 10 4.6-.7 8-5 8-10V6l-8-4Zm0 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 11c-2 0-3.8-1-5-2.6.1-1.6 2.5-2.4 5-2.4s4.9.8 5 2.4A6.2 6.2 0 0 1 12 18Z" /></svg>
            </div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[.24em] text-[#8B72C9]">Your firm, connected</p>
            <h2 className="max-w-3xl text-2xl font-semibold tracking-[-.045em] text-[#211747] sm:text-[32px] sm:leading-[1.12]">A smarter way to run your <span className="bg-gradient-to-r from-[#8658E8] to-[#5430BD] bg-clip-text text-transparent">CA practice.</span></h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#817A96] sm:text-[15px]">Ask questions, find information and move work forward. Your assistant works with your firm&apos;s records and asks before making changes.</p>
            <div className="mt-8 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {QUICK_COMMANDS.map((quick, i) => (
                <button key={quick.cmd} type="button" onClick={() => sendMessage(quick.cmd)} disabled={running} className="group flex min-h-[84px] items-center gap-4 rounded-xl border border-[#E9E4F2] bg-white/90 p-4 text-left shadow-[0_5px_18px_rgba(44,29,91,.035)] transition duration-200 hover:-translate-y-1 hover:border-[#CDBCF5] hover:shadow-[0_16px_30px_rgba(75,49,143,.09)] disabled:opacity-50">

                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${i===0?'bg-[#F0EBFF] text-[#7447D5]':i===1?'bg-[#FFF0F1] text-[#D65B70]':i===2?'bg-[#EAF7F0] text-[#31966A]':'bg-[#EDF3FF] text-[#5279CC]'}`}><Icon name={i===0?'tasks':i===1?'alert-triangle':i===2?'shield-check':'users-round'} className="h-4 w-4" /></span>

                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#30264E]">{quick.label}</span><span className="mt-1 block text-xs text-[#928BA4]">{i===0?'See work assigned to you':i===1?'Find tasks past their due date':i===2?'Review work waiting for your input':'Check client compliance status'}</span></span>

                  <Icon name="chevron-right" className="h-4 w-4 text-[#B2A9C4] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#7543E9]" />

                </button>

              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-[#A19AAF]"><span className="inline-flex items-center gap-1.5"><Icon name="shield-check" className="h-3 w-3" /> Permission-aware access</span><span className="inline-flex items-center gap-1.5"><Icon name="shield-check" className="h-3 w-3" /> Confirmation before changes</span><span className="inline-flex items-center gap-1.5"><Icon name="file-text" className="h-3 w-3" /> Firm data, not guesses</span></div>
          </section>

        )}

        {messages.map((message, index) => {

          if (messages.length === 1 && index === 0) return null;

          const isUser = message.role === "user";

          return (

            <div key={index} className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>

              <Avatar role={message.role} />
              <div
                className={`flex min-w-0 max-w-[min(52rem,92%)] flex-col gap-2 ${

                  isUser ? "items-end" : "items-start"

                }`}
              >

                {isUser ? (

                  <div className="rounded-[20px] rounded-tr-md border border-[#6840C8] bg-gradient-to-br from-[#7950DE] to-[#5730BE] px-5 py-3.5 text-sm leading-6 text-white shadow-[0_10px_24px_-14px_rgba(82,48,170,.65)]">

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

      </div>

      <div className="relative z-20 border-t border-[#EAE6F3] bg-white/85 px-2 pb-3 pt-3 shadow-[0_-16px_40px_rgba(42,28,86,.055)] backdrop-blur-2xl w-full">

        <div className="w-full space-y-3 pt-1">

          {running && <AssistantActivity steps={steps} headline={headline} elapsedMs={elapsedMs} />}

          <form
            onSubmit={handleSubmit}
            className="group flex items-end gap-2 rounded-[22px] border border-[#E5DDF2] bg-white p-2 shadow-[0_8px_28px_rgba(55,37,105,.07)] ring-1 ring-white transition focus-within:border-[#BBA5F1] focus-within:shadow-[0_10px_34px_rgba(91,56,190,.12)] w-full"
          >

            <AssistantUpload
              sessionId={sessionId}
              onUploaded={onFileUploaded}
              disabled={running}
            />

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
              className="max-h-32 min-h-[2.9rem] flex-1 resize-none bg-transparent px-3 py-3 text-[14px] leading-6 text-[#29233E] outline-none placeholder:text-[#A39CB5]"
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
              className={`flex h-10 items-center justify-center rounded-xl px-3 transition ${voiceMode ? 'bg-gradient-to-r from-[#E45A83] to-[#C93D75] text-white animate-pulse' : 'border border-[#E8E2F1] text-[#71658D] hover:bg-[#F8F5FF]'}`}

              title={voiceMode ? "Stop conversation" : "Start voice conversation"}
            >

              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>

            </button>

            <button
              type="submit"
              disabled={running || !input.trim()}
              className="flex h-11 items-center gap-2 rounded-[14px] bg-gradient-to-r from-[#7543E9] to-[#5630C9] px-5 text-[13px] font-semibold text-white shadow-[0_7px_16px_rgba(104,62,208,.24)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(104,62,208,.3)] disabled:translate-y-0 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
            >

              {running ? "Working…" : "Send"}

            </button>

          </form>

          <p className="pb-1 text-center text-[10px] tracking-wide text-[#9690A7]">
            Answers come from your own records. Anything that changes data asks for confirmation

            first.
          </p>

          {attachedFiles.length > 0 && (

            <div className="flex flex-wrap gap-1.5 pb-1">

              {attachedFiles.map((file) => (

                <span

                  key={file.id}

                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E5DDF5] bg-[#F7F3FF] pl-2 pr-1 py-1 text-[11px] text-[#6544A4]"

                  title={`${file.name} — ${formatBytes(file.size_bytes)}; ${file.extracted_chars} chars read by the assistant`}

                >

                  <Icon name="file-text" className="h-3 w-3" />

                  <span className="max-w-[14rem] truncate">{file.name}</span>

                  <button

                    type="button"

                    onClick={() => removeAttached(file.id)}

                    disabled={running}

                    className="flex h-4 w-4 items-center justify-center rounded-full text-[#9A83CB] hover:bg-[#E9DFFF] hover:text-[#6032C9] disabled:opacity-50"

                    aria-label={`Remove ${file.name}`}

                  >

                    <Icon name="x" className="h-2.5 w-2.5" />

                  </button>

                </span>

              ))}

            </div>

          )}

        </div>

      </div>

    </div>

  );

}

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

          className={`w-full rounded-[20px] rounded-tl-md border px-5 py-4 shadow-[0_8px_26px_rgba(46,30,94,.045)] ${

            message.error ? "border-rose-200 bg-rose-50/90" : "border-[#EAE6F2] bg-white/95"

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

          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-[#f7f6f3] disabled:opacity-50"

        >

          Retry

        </button>

      )}

    </>

  );

}
