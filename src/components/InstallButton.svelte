<script lang="ts">
  let installPrompt: Event | null = $state(null);
  let canInstall = $state(false);
  let platform = $state<"desktop" | "ios-safari" | "ios-chrome" | "other">("other");
  let showInstructions = $state(false);
  let copied = $state(false);

  $effect(() => {
    // Detect platform
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isIOSChrome = /CriOS/.test(ua);
    const isIOSSafari = isIOS && /Safari/.test(ua) && !isIOSChrome && !/(Instagram|FBAN|FBAV)/.test(ua);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;

    if (isStandalone) {
      // Already installed, don't show button
      platform = "other";
      return;
    }

    if (isIOSSafari) {
      platform = "ios-safari";
      canInstall = true;
    } else if (isIOSChrome) {
      platform = "ios-chrome";
      canInstall = true;
    } else {
      platform = "desktop";
    }

    // Listen for install prompt (desktop Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      installPrompt = e;
      canInstall = true;
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  });

  async function handleInstall() {
    if (platform === "desktop" && installPrompt) {
      const promptEvent = installPrompt as any;
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        canInstall = false;
      }
      installPrompt = null;
    } else if (platform === "ios-safari" || platform === "ios-chrome") {
      showInstructions = !showInstructions;
    }
  }

  async function copyUrl() {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }
</script>

{#if canInstall}
  <div class="relative">
    <button
      onclick={handleInstall}
      class="p-2 hover:bg-white/10 transition-colors rounded"
      aria-label="Install app"
      title="Install app"
    >
      <svg
        class="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        ></path>
      </svg>
    </button>

    {#if showInstructions}
      <div
        class="absolute right-0 top-full mt-2 w-64 bg-(--color-sidebar) text-white text-sm p-4 rounded-lg shadow-xl z-50 border border-white/10"
      >
        <button
          onclick={() => (showInstructions = false)}
          class="absolute top-2 right-2 text-white/60 hover:text-white"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        {#if platform === "ios-safari"}
          <div class="space-y-2">
            <p class="font-semibold text-white/90">Install App</p>
            <ol class="space-y-2 text-white/70 text-xs">
              <li class="flex items-start gap-2">
                <span class="text-white/50">1.</span>
                <span>Tap the Share button <svg class="w-4 h-4 inline" fill="currentColor" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg></span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-white/50">2.</span>
                <span>Select "Add to Home Screen"</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-white/50">3.</span>
                <span>Tap "Add"</span>
              </li>
            </ol>
          </div>
        {:else if platform === "ios-chrome"}
          <div class="space-y-2">
            <p class="font-semibold text-white/90">Install App</p>
            <p class="text-white/70 text-xs">Chrome on iOS doesn't support app installation.</p>
            <p class="text-white/70 text-xs mt-2">Please open this site in <strong class="text-white">Safari</strong> to install it as an app.</p>
            <button
              onclick={copyUrl}
              class="mt-3 w-full text-white text-xs py-2 px-3 rounded transition-all duration-300 {copied ? 'bg-green-600' : 'bg-white/10 hover:bg-white/20'}"
            >
              {copied ? "Copied!" : "Copy URL"}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
