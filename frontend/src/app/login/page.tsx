"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, api } from "@/lib/api";
import { ThemeToggle } from "@/lib/theme";
import { useSignIn } from "@/lib/session";
import type { TokenResponse } from "@/lib/types";
import { cn } from "@/lib/format";

type Mode = "sign_in" | "create_firm";

const FIELD_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut", delay: i * 0.07 },
  }),
  exit: { opacity: 0, y: -14, transition: { duration: 0.2, ease: "easeOut" } },
};

export default function LoginPage() {
  const router = useRouter();
  const signIn = useSignIn();
  const [mode, setMode] = useState<Mode>("sign_in");
  const [firmName, setFirmName] = useState("");
  const [firmSlug, setFirmSlug] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = signIn.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "create_firm") {
        await api.post<TokenResponse>("/auth/onboarding", {
          firm_name: firmName,
          firm_slug: firmSlug,
          owner_full_name: fullName,
          owner_email: email,
          owner_password: password,
        });
        router.replace("/dashboard");
        return;
      }
      await signIn.mutateAsync({ email, password });
      router.replace("/dashboard");
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.",
      );
    }
  }

  function toggleMode() {
    setMode(mode === "sign_in" ? "create_firm" : "sign_in");
    setError(null);
  }

  return (
    <main className="login-root relative flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12 dark:bg-slate-950">
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <motion.div
        className="relative w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <motion.div
            className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-sky-100 via-indigo-50 to-purple-100 p-12 dark:from-sky-950/30 dark:via-indigo-950/30 dark:to-purple-950/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="absolute inset-0 overflow-hidden">
              <motion.div
                className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-gradient-to-br from-sky-300/20 to-indigo-300/20 blur-3xl"
                animate={{
                  x: [0, 20, 0],
                  y: [0, -20, 0],
                  scale: [1, 1.05, 1],
                }}
                transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-gradient-to-br from-purple-300/20 to-pink-300/20 blur-3xl"
                animate={{
                  x: [0, -15, 0],
                  y: [0, 15, 0],
                  scale: [1, 1.1, 1],
                }}
                transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              />
              <motion.div
                className="absolute top-1/2 left-1/3 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-300/15 to-teal-300/15 blur-2xl"
                animate={{
                  x: [0, 10, 0],
                  y: [0, 10, 0],
                  scale: [1, 1.15, 1],
                }}
                transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 4 }}
              />
            </div>

            <motion.div
              className="relative z-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
            >
              <div className="mb-4 flex items-center justify-center gap-3">
                <motion.div
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600"
                  initial={{ scale: 0.8, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.5, ease: "backOut", delay: 0.3 }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-7 w-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M12 2L4 7v10c0 3.5 2.5 6.5 6 7s6-3.5 6-7V7z" />
                    <path d="M12 12v5" />
                    <path d="M9 15l3 3 3-3" />
                  </svg>
                </motion.div>
                <motion.span
                  className="text-3xl font-bold text-slate-900 dark:text-slate-100"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
                >
                  Rohadas
                </motion.span>
              </div>

              <motion.p
                className="text-center text-sm text-slate-600 dark:text-slate-400"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.5 }}
              >
                {mode === "sign_in"
                  ? "Sign in to your firm."
                  : "Set up your firm. This can only be done once."}
              </motion.p>
            </motion.div>
          </motion.div>

          <motion.div
            className="flex flex-col justify-center p-10"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence initial={false}>
                {mode === "create_firm" && (
                  <motion.div
                    key="firm-name"
                    variants={FIELD_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    custom={0}
                  >
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Firm name <span className="text-rose-600">*</span>
                      </span>
                      <input
                        className="input"
                        value={firmName}
                        onChange={(e) => setFirmName(e.target.value)}
                        placeholder="Rohada & Associates"
                        required
                        minLength={2}
                        autoComplete="organization"
                      />
                    </label>
                  </motion.div>
                )}

                {mode === "create_firm" && (
                  <motion.div
                    key="firm-slug"
                    variants={FIELD_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    custom={1}
                  >
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Firm slug <span className="text-rose-600">*</span>
                      </span>
                      <input
                        className="input"
                        value={firmSlug}
                        onChange={(e) =>
                          setFirmSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                        }
                        placeholder="rohada"
                        required
                        minLength={2}
                        pattern="[a-z0-9][a-z0-9-]*"
                      />
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        Lowercase letters, numbers and hyphens. Used to tell firms apart.
                      </span>
                    </label>
                  </motion.div>
                )}

                {mode === "create_firm" && (
                  <motion.div
                    key="full-name"
                    variants={FIELD_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    custom={2}
                  >
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Your name <span className="text-rose-600">*</span>
                      </span>
                      <input
                        className="input"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Rohit Rohada"
                        required
                        minLength={2}
                        autoComplete="name"
                      />
                    </label>
                  </motion.div>
                )}

                <motion.div
                  key="email"
                  variants={FIELD_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  custom={3}
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Email <span className="text-rose-600">*</span>
                    </span>
                    <input
                      className="input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="partner@example.com"
                      required
                      autoComplete="username"
                    />
                  </label>
                </motion.div>

                <motion.div
                  key="password"
                  variants={FIELD_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  custom={4}
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password <span className="text-rose-600">*</span>
                    </span>
                    <div className="relative">
                      <input
                        className={cn("input pr-10")}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={mode === "create_firm" ? 12 : 1}
                        autoComplete={mode === "create_firm" ? "new-password" : "current-password"}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center justify-center rounded-r-md px-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M1 1l22 22M12 12c0-.67-.08-1.32-.21-1.96M15.5 15.5A3.5 3.5 0 0 1 12 18.5 3.5 3.5 0 0 1 8.5 15c0-1.07.43-2.03 1.12-2.75M12 5.42c.5 0 .98.1 1.44.27" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {mode === "create_firm" && (
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        At least 12 characters.
                      </span>
                    )}
                  </label>
                </motion.div>

                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <p
                      role="alert"
                      className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-900/20 dark:ring-rose-800"
                    >
                      {error}
                    </p>
                  </motion.div>
                )}

                <motion.button
                  key="submit"
                  type="submit"
                  className="btn-primary w-full"
                  disabled={busy}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  {busy ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.svg
                        viewBox="0 0 24 24"
                        className="-ml-1 h-4 w-4 animate-spin"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2v4M12 20v2m9-10h-2M5 12H3" />
                      </motion.svg>
                      Working…
                    </span>
                  ) : mode === "sign_in" ? (
                    "Sign in"
                  ) : (
                    "Create firm"
                  )}
                </motion.button>
              </AnimatePresence>
            </form>

            <motion.div
              className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
            >
              {mode === "sign_in" ? (
                <>
                  First time here?{" "}
                  <motion.button
                    type="button"
                    className="font-medium text-sky-700 underline underline-offset-2 hover:text-sky-600 dark:text-sky-400"
                    onClick={toggleMode}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Set up your firm
                  </motion.button>
                </>
              ) : (
                <>
                  Already set up?{" "}
                  <motion.button
                    type="button"
                    className="font-medium text-sky-700 underline underline-offset-2 hover:text-sky-600 dark:text-sky-400"
                    onClick={toggleMode}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Sign in
                  </motion.button>
                </>
              )}
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </main>
  );
}
