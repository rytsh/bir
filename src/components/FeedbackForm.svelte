<script module lang="ts">
  // The ALTCHA widget injects a global <style id="altcha-css"> into <head> once,
  // at module-eval time. Astro's ClientRouter swaps <head> on client-side
  // navigation, removing that runtime-injected style; since the altcha module is
  // already cached it is never re-injected, so the widget loses its CSS when you
  // navigate away and back. We cache the CSS the first time and re-inject it on
  // every mount if it is missing. (Module scope persists across client nav.)
  const ALTCHA_STYLE_ID = "altcha-css";
  let cachedAltchaCss = "";

  function ensureAltchaStyles(): void {
    if (typeof document === "undefined") return;

    const existing = document.getElementById(ALTCHA_STYLE_ID);
    if (existing) {
      cachedAltchaCss = existing.textContent ?? cachedAltchaCss;
      return;
    }

    if (!cachedAltchaCss) return;

    const style = document.createElement("style");
    style.id = ALTCHA_STYLE_ID;
    style.textContent = cachedAltchaCss;
    document.head.appendChild(style);
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.1.tools";
  const challengeUrl = `${API_URL}/feedback/challenge`;
  const submitUrl = `${API_URL}/feedback`;

  const MAX_NAME_LENGTH = 80;
  const MAX_MESSAGE_LENGTH = 800;
  const MIN_MESSAGE_LENGTH = 2;
  const NAME_STORAGE_KEY = "feedback.name";

  type StatusKind = "idle" | "info" | "error" | "success";

  let name = $state("");
  let message = $state("");
  let captchaPayload = $state("");
  let sending = $state(false);
  let status = $state<{ kind: StatusKind; text: string }>({
    kind: "idle",
    text: "",
  });

  let widgetEl = $state<HTMLElement & { reset?: () => void }>();

  const trimmedName = $derived(name.trim());
  const trimmedMessage = $derived(message.trim());
  const nameValid = $derived(
    trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH,
  );
  const messageValid = $derived(
    trimmedMessage.length >= MIN_MESSAGE_LENGTH &&
      trimmedMessage.length <= MAX_MESSAGE_LENGTH,
  );
  const captchaSolved = $derived(captchaPayload !== "");
  const canSubmit = $derived(
    nameValid && messageValid && captchaSolved && !sending,
  );
  const statusColor = $derived(
    status.kind === "error"
      ? "text-(--color-error-text)"
      : status.kind === "success"
        ? "text-(--color-diff-added-text)"
        : "text-(--color-text-muted)",
  );

  function readWidgetPayload(): string {
    const input = widgetEl?.querySelector<HTMLInputElement>(
      'input[name="altcha"]',
    );
    return input?.value ?? "";
  }

  function resetCaptcha(): void {
    captchaPayload = "";
    widgetEl?.reset?.();
  }

  onMount(() => {
    try {
      name = localStorage.getItem(NAME_STORAGE_KEY) ?? "";
    } catch {
      // ignore storage failures
    }

    // If we returned to this page via client-side navigation, the cached CSS
    // (if any) was stripped from <head> during the swap — restore it now.
    ensureAltchaStyles();

    let cleanup = () => {};

    (async () => {
      // Load the ALTCHA widget only in the browser (registers <altcha-widget>).
      await import("altcha");

      // First load injects the global stylesheet; capture it for later visits.
      ensureAltchaStyles();

      const onStateChange = (event: Event) => {
        const detail = (event as CustomEvent<{ state?: string; payload?: string }>)
          .detail;

        if (detail?.state === "verified") {
          captchaPayload = readWidgetPayload() || detail.payload || "";
        } else {
          captchaPayload = "";
        }
      };

      widgetEl?.addEventListener("statechange", onStateChange);
      cleanup = () => widgetEl?.removeEventListener("statechange", onStateChange);

      // In case it solved (auto="onload") before the listener was attached.
      const existing = readWidgetPayload();
      if (existing) captchaPayload = existing;
    })();

    return () => cleanup();
  });

  $effect(() => {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, trimmedName);
    } catch {
      // ignore storage failures
    }
  });

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!nameValid) {
      status = { kind: "error", text: "Please enter your name." };
      return;
    }
    if (!messageValid) {
      status = {
        kind: "error",
        text: `Message must be between ${MIN_MESSAGE_LENGTH} and ${MAX_MESSAGE_LENGTH} characters.`,
      };
      return;
    }

    // Re-read the payload from the widget as the source of truth.
    const payload = readWidgetPayload() || captchaPayload;
    if (!payload) {
      status = {
        kind: "error",
        text: "Please complete the verification (it runs automatically — give it a moment).",
      };
      return;
    }
    captchaPayload = payload;

    sending = true;
    status = { kind: "info", text: "Sending…" };

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          message: trimmedMessage,
          page: window.location.href,
          altcha: payload,
        }),
        signal: controller.signal,
      });

      let body: { ok?: boolean; error?: string } = {};
      try {
        body = await response.json();
      } catch {
        body = {};
      }

      if (!response.ok) {
        status = {
          kind: "error",
          text: `Failed to send: ${body.error || response.statusText}`,
        };
        resetCaptcha();
        return;
      }

      status = {
        kind: "success",
        text: "Thanks! Your feedback has been sent.",
      };
      message = "";
      resetCaptcha();
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === "AbortError";
      status = {
        kind: "error",
        text: timedOut ? "Request timed out. Please try again." : "Network error.",
      };
      resetCaptcha();
    } finally {
      window.clearTimeout(timeoutId);
      sending = false;
    }
  }
</script>

<div class="mx-auto w-full max-w-2xl">
  <header class="mb-4">
    <h1 class="text-xl font-semibold text-(--color-text)">Send Feedback</h1>
    <p class="mt-1 text-sm text-(--color-text-muted)">
      Found a bug, have an idea, or want to request a tool? Let me know. Only
      coarse, non-identifying info (country, browser, OS) is attached — no IP
      address.
    </p>
    <hr class="border-(--color-border) my-3" />
  </header>

  <form
    class="space-y-4 border border-(--color-border) bg-(--color-bg-alt) p-4"
    onsubmit={handleSubmit}
    novalidate
  >
    <div>
      <label
        for="feedback-name"
        class="mb-1 block text-xs text-(--color-text-light)"
      >
        Name
      </label>
      <input
        id="feedback-name"
        type="text"
        bind:value={name}
        maxlength={MAX_NAME_LENGTH}
        placeholder="Your name"
        autocomplete="name"
        class="w-full border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) focus:border-(--color-accent) focus:outline-none"
      />
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between">
        <label
          for="feedback-message"
          class="block text-xs text-(--color-text-light)"
        >
          Message
        </label>
        <span class="text-xs text-(--color-text-light)">
          {trimmedMessage.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
      <textarea
        id="feedback-message"
        bind:value={message}
        maxlength={MAX_MESSAGE_LENGTH}
        rows="6"
        placeholder="Describe your feedback…"
        class="w-full resize-y border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) focus:border-(--color-accent) focus:outline-none"
      ></textarea>
    </div>

    <altcha-widget
      bind:this={widgetEl}
      challenge={challengeUrl}
      auto="onload"
      name="altcha"
    ></altcha-widget>

    {#if status.text}
      <p class={`text-sm ${statusColor}`} role="status" aria-live="polite">
        {status.text}
      </p>
    {/if}

    <div class="flex items-center gap-3">
      <button
        type="submit"
        disabled={!canSubmit}
        class="bg-(--color-accent) px-4 py-2 text-sm text-(--color-btn-text) transition-colors hover:bg-(--color-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send Feedback"}
      </button>
      <a
        href="/"
        class="text-sm text-(--color-text-muted) hover:text-(--color-text)"
      >
        Back to tools
      </a>
    </div>
  </form>
</div>

<style>
  altcha-widget {
    display: block;
    --altcha-max-width: 100%;
  }
</style>
