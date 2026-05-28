"use client";

import { Suspense, useState } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoginHashSessionBridge } from "@/components/auth/LoginHashSessionBridge";
import type { LoginFormState } from "@/lib/auth/login-form-state";

type LoginPanelProps = {
  sendMagicLink: (
    prevState: LoginFormState,
    formData: FormData,
  ) => Promise<LoginFormState>;
  isExtension: boolean;
  safeNext: string | null;
  authCallbackError?: string;
};

function LoginPanelContent({
  sendMagicLink,
  isExtension,
  safeNext,
  authCallbackError,
}: LoginPanelProps) {
  const [hashBridgeError, setHashBridgeError] = useState<string | null>(null);
  const [hashBridgeProcessing, setHashBridgeProcessing] = useState(false);

  return (
    <>
      <LoginHashSessionBridge
        onProcessingChange={setHashBridgeProcessing}
        onError={setHashBridgeError}
      />
      <LoginForm
        sendMagicLink={sendMagicLink}
        isExtension={isExtension}
        safeNext={safeNext}
        authCallbackError={authCallbackError}
        hashBridgeError={hashBridgeError}
        hashBridgeProcessing={hashBridgeProcessing}
      />
    </>
  );
}

export function LoginPanel(props: LoginPanelProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm animate-fade-up space-y-7">
          <div className="space-y-2">
            <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-3" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-3" />
          </div>
          <div className="h-12 w-full animate-pulse rounded-xl bg-surface-3" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-surface-3" />
        </div>
      }
    >
      <LoginPanelContent {...props} />
    </Suspense>
  );
}
