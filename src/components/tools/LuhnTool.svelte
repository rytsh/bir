<script lang="ts">
  let input = $state("");
  let copied = $state(false);

  interface ValidationResult {
    isValid: boolean;
    cleaned: string;
    checkDigit: number;
    cardType: string | null;
  }

  const cardPatterns: { name: string; pattern: RegExp }[] = [
    // Major networks
    { name: "Visa", pattern: /^4[0-9]{12}(?:[0-9]{3,6})?$/ },
    { name: "Mastercard", pattern: /^(5[1-5][0-9]{14}|2(2[2-9][1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)[0-9]{12})$/ },
    { name: "American Express", pattern: /^3[47][0-9]{13}$/ },
    { name: "Discover", pattern: /^(6011|64[4-9]|65)[0-9]{12,15}$/ },
    { name: "JCB", pattern: /^35(2[89]|[3-8][0-9])[0-9]{12,15}$/ },
    // Diners Club
    { name: "Diners Club", pattern: /^3(0[0-5]|[68][0-9]|9[0-9])[0-9]{11,16}$/ },
    // Regional networks
    { name: "Troy", pattern: /^(9792|65)[0-9]{12,15}$/ },
    { name: "UnionPay", pattern: /^62[0-9]{14,17}$/ },
    { name: "Mir", pattern: /^220[0-4][0-9]{12,15}$/ },
    { name: "RuPay", pattern: /^(60|65|81|82|508|353|356)[0-9]{12,16}$/ },
    { name: "Verve", pattern: /^(506[01]|507[89]|6500)[0-9]{12,15}$/ },
    { name: "Maestro", pattern: /^(5018|5020|5038|5893|6304|6759|676[1-3])[0-9]{8,15}$/ },
    { name: "Dankort", pattern: /^(5019|4571)[0-9]{12}$/ },
    { name: "UATP", pattern: /^1[0-9]{14}$/ },
    { name: "LankaPay", pattern: /^357111[0-9]{10}$/ },
    { name: "GPN", pattern: /^(1946|50|56|58|60|61|62|63)[0-9]{14,17}$/ },
    { name: "Napas", pattern: /^9704[0-9]{12,15}$/ },
    { name: "Uzcard", pattern: /^(8600|5614)[0-9]{12}$/ },
    { name: "HUMO", pattern: /^9860[0-9]{12}$/ },
    { name: "BORICA", pattern: /^2205[0-9]{12}$/ },
  ];

  const detectCardType = (number: string): string | null => {
    for (const card of cardPatterns) {
      if (card.pattern.test(number)) {
        return card.name;
      }
    }
    return null;
  };

  const luhnCheck = (number: string): boolean => {
    if (number.length === 0) return false;

    let sum = 0;
    let isSecond = false;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number[i], 10);

      if (isSecond) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isSecond = !isSecond;
    }

    return sum % 10 === 0;
  };

  const calculateCheckDigit = (number: string): number => {
    let sum = 0;
    let isSecond = true;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number[i], 10);

      if (isSecond) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isSecond = !isSecond;
    }

    return (10 - (sum % 10)) % 10;
  };

  let result: ValidationResult | null = $derived.by(() => {
    const cleaned = input.replace(/[\s\-]/g, "");

    if (cleaned.length === 0) return null;

    if (!/^\d+$/.test(cleaned)) {
      return {
        isValid: false,
        cleaned,
        checkDigit: 0,
        cardType: null,
      };
    }

    const isValid = luhnCheck(cleaned);
    const cardType = detectCardType(cleaned);
    const checkDigit = isValid ? parseInt(cleaned[cleaned.length - 1], 10) : calculateCheckDigit(cleaned);

    return {
      isValid,
      cleaned,
      checkDigit,
      cardType,
    };
  });

  const generateCheckDigit = () => {
    const cleaned = input.replace(/[\s\-]/g, "");
    if (cleaned.length === 0 || !/^\d+$/.test(cleaned)) return;

    const checkDigit = calculateCheckDigit(cleaned);
    input = cleaned + checkDigit;
  };

  const formatNumber = () => {
    const cleaned = input.replace(/[\s\-]/g, "");
    if (cleaned.length === 0) return;

    // Format in groups of 4
    const formatted = cleaned.match(/.{1,4}/g)?.join(" ") || cleaned;
    input = formatted;
  };

  const handleClear = () => {
    input = "";
  };

  const handleCopy = () => {
    const cleaned = input.replace(/[\s\-]/g, "");
    if (cleaned) {
      navigator.clipboard.writeText(cleaned);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      input = text;
    });
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Validate credit card numbers using the Luhn algorithm (mod 10).
    </p>
  </header>

  <!-- Input Section -->
  <div class="mb-4">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
        Card Number
      </span>
      <div class="flex gap-3">
        <button
          onclick={handlePaste}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Paste
        </button>
        <button
          onclick={handleClear}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
    <input
      type="text"
      bind:value={input}
      placeholder="Enter credit card number..."
      class="w-full p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-lg font-mono tracking-wider focus:outline-none focus:border-(--color-accent)"
    />
  </div>

  <!-- Actions -->
  <div class="mb-4 flex gap-2 flex-wrap">
    <button
      onclick={formatNumber}
      class="px-3 py-1.5 text-sm bg-(--color-border) text-(--color-text) hover:bg-(--color-accent) hover:text-(--color-btn-text) transition-colors"
    >
      Format
    </button>
    <button
      onclick={generateCheckDigit}
      class="px-3 py-1.5 text-sm bg-(--color-border) text-(--color-text) hover:bg-(--color-accent) hover:text-(--color-btn-text) transition-colors"
    >
      Add Check Digit
    </button>
    <button
      onclick={handleCopy}
      class="px-3 py-1.5 text-sm bg-(--color-border) text-(--color-text) hover:bg-(--color-accent) hover:text-(--color-btn-text) transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  </div>

  <!-- Result Section -->
  {#if result}
    <div class="flex-1 flex flex-col gap-4">
      <!-- Validation Status -->
      <div
        class="p-4 border {result.isValid
          ? 'border-green-500 bg-green-500/10'
          : 'border-red-500 bg-red-500/10'}"
      >
        <div class="flex items-center gap-3">
          <span class="text-2xl">{result.isValid ? "✓" : "✗"}</span>
          <div>
            <p class="font-medium text-(--color-text)">
              {result.isValid ? "Valid" : "Invalid"} Luhn Checksum
            </p>
            {#if !result.isValid && /^\d+$/.test(result.cleaned)}
              <p class="text-sm text-(--color-text-muted)">
                Expected check digit: {calculateCheckDigit(result.cleaned.slice(0, -1))}
              </p>
            {/if}
            {#if !/^\d+$/.test(result.cleaned)}
              <p class="text-sm text-(--color-text-muted)">
                Input contains non-numeric characters
              </p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Details -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 border border-(--color-border)">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Card Type
          </span>
          <p class="mt-1 text-(--color-text) font-medium">
            {result.cardType || "Unknown"}
          </p>
        </div>
        <div class="p-4 border border-(--color-border)">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Length
          </span>
          <p class="mt-1 text-(--color-text) font-medium">
            {result.cleaned.length} digits
          </p>
        </div>
        <div class="p-4 border border-(--color-border)">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Check Digit
          </span>
          <p class="mt-1 text-(--color-text) font-medium">
            {result.cleaned.length > 0 ? result.cleaned[result.cleaned.length - 1] : "-"}
          </p>
        </div>
        <div class="p-4 border border-(--color-border)">
          <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
            Cleaned Number
          </span>
          <p class="mt-1 text-(--color-text) font-mono text-sm break-all">
            {result.cleaned}
          </p>
        </div>
      </div>

      <!-- Algorithm Info -->
      <div class="p-4 border border-(--color-border) bg-(--color-bg)">
        <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
          About Luhn Algorithm
        </span>
        <p class="mt-2 text-sm text-(--color-text-muted)">
          The Luhn algorithm (also known as mod 10) is a checksum formula used to validate credit card numbers, 
          IMEI numbers, and other identification numbers. It detects single-digit errors and most transpositions 
          of adjacent digits.
        </p>
      </div>
    </div>
  {:else}
    <div class="flex-1 flex items-center justify-center text-(--color-text-muted)">
      <p>Enter a card number to validate</p>
    </div>
  {/if}
</div>
