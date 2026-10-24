"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, api } from "@/lib/api";
import { useSignIn } from "@/lib/session";
import type { TokenResponse } from "@/lib/types";

type Mode = "sign_in" | "create_firm";

export default function LoginPage() {
  const router = useRouter();
  const signIn = useSignIn();
  const [mode, setMode] = useState<Mode>("sign_in");
  const [firmName, setFirmName] = useState("");
  const [firmSlug, setFirmSlug] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = signIn.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "create_firm") {
        // The backend refuses a second firm on a deployment. That rule lives in one
        // place — the endpoint — so this form surfaces the refusal rather than
        // trying to predict it.
        await api.post<TokenResponse>("/auth/onboarding", {
          firm_name: firmName,
          firm_slug: firmSlug,
          owner_full_name: fullName,
          owner_email: email,
          owner_password: password,
        });
        // Onboarding signs the owner in, so go straight to the dashboard.
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Rohadas CA
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {mode === "sign_in"
              ? "Sign in to your firm."
              : "Set up your firm. This can only be done once."}
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "create_firm" && (
              <>
                <Field label="Firm name">
                  <input
                    className="input"
                    value={firmName}
                    onChange={(event) => setFirmName(event.target.value)}
                    placeholder="Rohada & Associates"
                    required
                    minLength={2}
                    autoComplete="organization"
                  />
                </Field>
                <Field
                  label="Firm slug"
                  hint="Lowercase letters, numbers and hyphens. Used to tell firms apart."
                >
                  <input
                    className="input"
                    value={firmSlug}
                    onChange={(event) =>
                      setFirmSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                    }
                    placeholder="rohada"
                    required
                    minLength={2}
                    pattern="[a-z0-9][a-z0-9-]*"
                  />
                </Field>
                <Field label="Your name">
                  <input
                    className="input"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Rohit Rohada"
                    required
                    minLength={2}
                    autoComplete="name"
                  />
                </Field>
              </>
            )}

            <Field label="Email">
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="partner@example.com"
                required
                autoComplete="username"
              />
            </Field>

            <Field
              label="Password"
              hint={mode === "create_firm" ? "At least 12 characters." : undefined}
            >
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "create_firm" ? 12 : 1}
                autoComplete={mode === "create_firm" ? "new-password" : "current-password"}
              />
            </Field>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200"
              >
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Working…" : mode === "sign_in" ? "Sign in" : "Create firm"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-600">
          {mode === "sign_in" ? (
            <>
              First time here?{" "}
              <button
                type="button"
                className="font-medium text-slate-900 underline underline-offset-2"
                onClick={() => {
                  setMode("create_firm");
                  setError(null);
                }}
              >
                Set up your firm
              </button>
            </>
          ) : (
            <>
              Already set up?{" "}
              <button
                type="button"
                className="font-medium text-slate-900 underline underline-offset-2"
                onClick={() => {
                  setMode("sign_in");
                  setError(null);
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
