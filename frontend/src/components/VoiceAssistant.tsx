"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "connecting" | "error";

export function VoiceAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isActiveRef = useRef(false);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported");
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      setState("listening");
      setTranscript("");
      setError(null);
    };
    
    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      setTranscript(final || interim);
      if (final) {
        handleUserSpeech(final);
      }
    };
    
    recognition.onerror = (e: any) => {
      setError(e.error);
      if (isActiveRef.current && e.error !== "no-speech") {
        setTimeout(() => startListening(), 1000);
      }
    };
    
    recognition.onend = () => {
      if (isActiveRef.current && state === "listening") {
        setTimeout(() => {
          if (isActiveRef.current && state === "listening") {
            try { recognition.start(); } catch {}
          }
        }, 200);
      }
    };
    
    try {
      recognition.start();
    } catch (e: any) {
      setError(e.message);
    }
  }, [state]);

  const handleUserSpeech = async (text: string) => {
    if (!text.trim() || !isActiveRef.current) return;
    setState("thinking");
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const answer = data.response || data.error || "I didn't catch that.";
      setResponse(answer);
      speak(answer);
    } catch (e: any) {
      setError(e.message);
      setState("listening");
      setTimeout(() => startListening(), 1000);
    }
  };

  const speak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setState("listening");
      setTimeout(() => startListening(), 500);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = text.replace(/\[\[.*?\]\]/g, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/#{1,6}\s+/g, "").replace(/\n+/g, ". ").replace(/\s+/g, " ").trim().slice(0, 250);
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "en-IN";
    utter.rate = 0.92;
    utter.pitch = 0.98;
    utter.volume = 0.7;
    utter.onstart = () => setState("speaking");
    utter.onend = () => {
      setState("listening");
      if (isActiveRef.current) {
        setTimeout(() => startListening(), 400);
      }
    };
    synthRef.current = utter;
    window.speechSynthesis.speak(utter);
  };

  useEffect(() => {
    if (open) {
      isActiveRef.current = true;
      setState("connecting");
      setTimeout(() => {
        startListening();
      }, 500);
    } else {
      isActiveRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setState("idle");
      setTranscript("");
      setResponse("");
    }
    return () => {
      isActiveRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [open, startListening]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center"
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-white/60 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col items-center gap-8 max-w-md w-full px-6">
          <div className="relative">
            {(state === "listening" || state === "speaking") && (
              <>
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500"
                  animate={{ scale: [1, 1.6, 1], opacity: [0.2, 0, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                />
              </>
            )}
            <motion.div
              className={`relative w-32 h-32 rounded-full flex items-center justify-center ${
                state === "speaking"
                  ? "bg-gradient-to-br from-emerald-400 to-teal-500"
                  : state === "thinking"
                  ? "bg-gradient-to-br from-amber-400 to-orange-500"
                  : state === "listening"
                  ? "bg-gradient-to-br from-sky-400 to-indigo-500"
                  : "bg-slate-600"
              }`}
              animate={state === "speaking" ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </motion.div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-xl text-white font-medium">
              {state === "listening" && "Listening..."}
              {state === "thinking" && "Thinking..."}
              {state === "speaking" && "Speaking..."}
              {state === "connecting" && "Connecting..."}
              {state === "idle" && "Tap to start"}
              {state === "error" && "Error"}
            </p>
            {transcript && state === "listening" && (
              <p className="text-white/70 text-sm max-w-xs">{transcript}</p>
            )}
            {response && state === "speaking" && (
              <p className="text-white/80 text-sm max-w-xs line-clamp-3">{response}</p>
            )}
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          <button
            onClick={() => {
              if (isActiveRef.current) {
                isActiveRef.current = false;
                if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
                if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
                setState("idle");
              } else {
                isActiveRef.current = true;
                startListening();
              }
            }}
            className="px-6 py-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          >
            {isActiveRef.current ? "End" : "Start"}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
