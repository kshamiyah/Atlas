"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { LoginFormState } from "@/lib/auth/login-form-state";
import { initialLoginFormState } from "@/lib/auth/login-form-state";

type LoginFormProps = {
  sendMagicLink: (
    prevState: LoginFormState,
    formData: FormData,
  ) => Promise<LoginFormState>;
  isExtension: boolean;
  safeNext: string | null;
  authCallbackError?: string;
  hashBridgeError?: string | null;
  hashBridgeProcessing?: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-[15px] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Sending link…
        </>
      ) : (
        "Send magic link →"
      )}
    </button>
  );
}

function LoginAlert({
  tone,
  title,
  body,
}: {
  tone: "error" | "success" | "info";
  title: string;
  body: ReactNode;
}) {
  const styles =
    tone === "error"
      ? {
          border: "rgba(220,38,38,0.35)",
          background: "rgba(220,38,38,0.08)",
          title: "var(--accent-red)",
        }
      : tone === "success"
        ? {
            border: "rgba(22,163,74,0.35)",
            background: "rgba(22,163,74,0.08)",
            title: "var(--accent-green)",
          }
        : {
            border: "var(--border-subtle)",
            background: "var(--surface-2)",
            title: "var(--text-primary)",
          };

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="rounded-xl border px-4 py-3.5"
      style={{
        borderColor: styles.border,
        backgroundColor: styles.background,
      }}
    >
      <p className="text-sm font-semibold" style={{ color: styles.title }}>
        {title}
      </p>
      <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {body}
      </div>
    </div>
  );
}

export function LoginForm({
  sendMagicLink,
  isExtension,
  safeNext,
  authCallbackError,
  hashBridgeError,
  hashBridgeProcessing = false,
}: LoginFormProps) {
  const [state, formAction] = useActionState(sendMagicLink, initialLoginFormState);

  const callbackErrorMessage =
    authCallbackError === "auth"
      ? "We couldn't complete sign-in. The link may have expired or already been used. Request a new magic link below."
      : null;

  const showSuccess = state.status === "success";
  const formError = state.status === "error" ? state.message : null;
  const showCallbackError =
    Boolean(callbackErrorMessage) &&
    state.status === "idle" &&
    !hashBridgeError &&
    !hashBridgeProcessing;

  return (
    <div className="w-full max-w-sm animate-fade-up space-y-7">
      <div className="space-y-2">
        <h1
          className="text-[34px] font-bold leading-tight"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.022em" }}
        >
          Welcome back
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Enter your email and we&apos;ll send you a sign-in link instantly.
        </p>
      </div>

      {hashBridgeProcessing ? (
        <LoginAlert
          tone="info"
          title="Signing you in…"
          body="Finishing your magic link sign-in. This usually takes a moment."
        />
      ) : null}

      {showCallbackError && callbackErrorMessage ? (
        <LoginAlert tone="error" title="Sign-in link failed" body={callbackErrorMessage} />
      ) : null}

      {hashBridgeError ? (
        <LoginAlert tone="error" title="Sign-in link failed" body={hashBridgeError} />
      ) : null}

      {formError ? (
        <LoginAlert tone="error" title="Couldn't send magic link" body={formError} />
      ) : null}

      {showSuccess ? (
        <LoginAlert
          tone="success"
          title="Check your email"
          body={
            <>
              We sent a sign-in link to{" "}
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {state.email}
              </span>
              . Open it on this device to continue. Links expire after a short time — check spam if
              you don&apos;t see it within a minute.
            </>
          }
        />
      ) : null}

      <form action={formAction} className="space-y-3">
        {isExtension ? <input type="hidden" name="source" value="extension" /> : null}
        {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}

        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={showSuccess ? state.email : undefined}
          className="login-input w-full rounded-xl px-4 py-3.5 text-[15px] outline-none transition"
          placeholder="you@nhs.net"
        />

        <SubmitButton />
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          No password needed
        </span>
        <div className="h-px flex-1" style={{ background: "var(--border-subtle)" }} />
      </div>

      <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
        For RCOG trainees only.{" "}
        <span style={{ color: "var(--text-secondary)" }}>
          {showSuccess ? "Didn't get it? Submit again to resend." : "Check your inbox after submitting."}
        </span>
      </p>
    </div>
  );
}
