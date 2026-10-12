"use client";

import { useActionState } from "react";
import { sendLoginLink, type LoginState } from "./actions";

const initial: LoginState = { sent: false, error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendLoginLink, initial);

  if (state.sent) {
    return (
      <p className="mt-6 rounded-lg bg-booked-bg px-3 py-3 text-sm text-booked-fg">
        Wenn diese Adresse freigeschaltet ist, ist der Anmeldelink unterwegs. Bitte Postfach prüfen und den Link im
        selben Browser öffnen.
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <label htmlFor="email" className="text-xs font-semibold text-muted">
        E-Mail-Adresse
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="h-11 rounded-lg border border-line-strong px-3 text-sm"
      />
      {state.error && <p className="text-sm text-review-fg">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-lg bg-accent text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Wird gesendet …" : "Anmeldelink senden"}
      </button>
    </form>
  );
}
