<script lang="ts">
  let showExtended = $state(false);
  let selectedCode = $state<number | null>(null);
  let copiedField = $state<string | null>(null);

  const controlCharNames: Record<number, { name: string; escape: string; abbr: string }> = {
    0: { name: "NUL (Null)", escape: "\\0", abbr: "NUL" },
    1: { name: "SOH (Start of Heading)", escape: "", abbr: "SOH" },
    2: { name: "STX (Start of Text)", escape: "", abbr: "STX" },
    3: { name: "ETX (End of Text)", escape: "", abbr: "ETX" },
    4: { name: "EOT (End of Transmission)", escape: "", abbr: "EOT" },
    5: { name: "ENQ (Enquiry)", escape: "", abbr: "ENQ" },
    6: { name: "ACK (Acknowledge)", escape: "", abbr: "ACK" },
    7: { name: "BEL (Bell)", escape: "\\a", abbr: "BEL" },
    8: { name: "BS (Backspace)", escape: "\\b", abbr: "BS" },
    9: { name: "HT (Horizontal Tab)", escape: "\\t", abbr: "HT" },
    10: { name: "LF (Line Feed)", escape: "\\n", abbr: "LF" },
    11: { name: "VT (Vertical Tab)", escape: "\\v", abbr: "VT" },
    12: { name: "FF (Form Feed)", escape: "\\f", abbr: "FF" },
    13: { name: "CR (Carriage Return)", escape: "\\r", abbr: "CR" },
    14: { name: "SO (Shift Out)", escape: "", abbr: "SO" },
    15: { name: "SI (Shift In)", escape: "", abbr: "SI" },
    16: { name: "DLE (Data Link Escape)", escape: "", abbr: "DLE" },
    17: { name: "DC1 (Device Control 1)", escape: "", abbr: "DC1" },
    18: { name: "DC2 (Device Control 2)", escape: "", abbr: "DC2" },
    19: { name: "DC3 (Device Control 3)", escape: "", abbr: "DC3" },
    20: { name: "DC4 (Device Control 4)", escape: "", abbr: "DC4" },
    21: { name: "NAK (Negative Acknowledge)", escape: "", abbr: "NAK" },
    22: { name: "SYN (Synchronous Idle)", escape: "", abbr: "SYN" },
    23: { name: "ETB (End of Trans. Block)", escape: "", abbr: "ETB" },
    24: { name: "CAN (Cancel)", escape: "", abbr: "CAN" },
    25: { name: "EM (End of Medium)", escape: "", abbr: "EM" },
    26: { name: "SUB (Substitute)", escape: "", abbr: "SUB" },
    27: { name: "ESC (Escape)", escape: "\\e", abbr: "ESC" },
    28: { name: "FS (File Separator)", escape: "", abbr: "FS" },
    29: { name: "GS (Group Separator)", escape: "", abbr: "GS" },
    30: { name: "RS (Record Separator)", escape: "", abbr: "RS" },
    31: { name: "US (Unit Separator)", escape: "", abbr: "US" },
    32: { name: "Space", escape: "", abbr: "SP" },
    127: { name: "DEL (Delete)", escape: "", abbr: "DEL" },
  };

  const getCompactChar = (code: number): string => {
    if (code < 32) {
      return controlCharNames[code]?.abbr || "??";
    } else if (code === 32) {
      return "SP";
    } else if (code === 127) {
      return "DEL";
    } else if (code >= 128) {
      return String.fromCharCode(code);
    }
    return String.fromCharCode(code);
  };

  const getCompactTooltip = (code: number): string => {
    const hex = code.toString(16).toUpperCase().padStart(2, "0");
    if (code < 32 || code === 127) {
      const info = controlCharNames[code];
      return `${code} (0x${hex}) - ${info?.name || "Control"}`;
    } else if (code === 32) {
      return `${code} (0x${hex}) - Space`;
    }
    return `${code} (0x${hex}) - "${String.fromCharCode(code)}"`;
  };

  const getCellColor = (code: number): string => {
    if (code < 32 || code === 127) {
      return "rgba(239, 68, 68, 0.15)";
    } else if (code === 32) {
      return "rgba(107, 114, 128, 0.15)";
    } else if (code >= 48 && code <= 57) {
      return "rgba(59, 130, 246, 0.15)";
    } else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      return "rgba(34, 197, 94, 0.15)";
    } else if (code >= 128) {
      return "rgba(168, 85, 247, 0.15)";
    } else {
      return "rgba(234, 179, 8, 0.15)";
    }
  };

  const selectChar = (code: number) => {
    selectedCode = code;
  };

  const getSelectedCharInfo = (code: number) => {
    const isControl = code < 32 || code === 127;
    const hex = code.toString(16).toUpperCase().padStart(2, "0");
    const oct = code.toString(8).padStart(3, "0");
    const bin = code.toString(2).padStart(8, "0");
    
    let char = "";
    let displayChar = "";
    let name = "";
    let escapeSeq = "";
    
    if (isControl) {
      const info = controlCharNames[code];
      name = info?.name || `Control (${code})`;
      escapeSeq = info?.escape || "";
      displayChar = code < 32 ? String.fromCharCode(0x2400 + code) : "\u2421";
      char = "";
    } else if (code === 32) {
      name = "Space";
      displayChar = "\u2423";
      char = " ";
    } else {
      char = String.fromCharCode(code);
      displayChar = char;
      name = code >= 128 ? `Extended (${code})` : char;
    }
    
    return {
      code,
      char,
      displayChar,
      name,
      dec: code.toString(),
      hex: `0x${hex}`,
      oct,
      bin,
      escape: escapeSeq,
      url: `%${hex}`,
      isControl,
    };
  };

  const selectedInfo = $derived(selectedCode !== null ? getSelectedCharInfo(selectedCode) : null);

  const copyField = (value: string, fieldName: string) => {
    if (value) {
      navigator.clipboard.writeText(value);
      copiedField = fieldName;
      setTimeout(() => {
        copiedField = null;
      }, 300);
    }
  };

  const closeDetail = () => {
    selectedCode = null;
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      ASCII character reference table with decimal, hex, octal, and binary codes.
    </p>
  </header>

  <!-- Options -->
  <div class="flex flex-wrap gap-3 items-center mb-4">
    <label class="flex items-center gap-2 text-sm text-(--color-text-muted) cursor-pointer">
      <input
        type="checkbox"
        bind:checked={showExtended}
        class="accent-(--color-accent)"
      />
      Extended (128-255)
    </label>
  </div>

  <!-- Compact Grid View -->
  <div class="flex-1 overflow-auto min-h-0">
    <div class="border border-(--color-border) overflow-auto">
      <table class="w-full text-sm font-mono border-collapse">
        <thead class="sticky top-0 bg-(--color-bg-alt)">
          <tr>
            <th class="px-2 py-1.5 text-left font-medium text-(--color-text-light) border-b border-r border-(--color-border)"></th>
            {#each Array(16) as _, col}
              <th class="px-2 py-1.5 text-center font-medium text-(--color-text-light) border-b border-(--color-border) min-w-10">
                x{col.toString(16).toUpperCase()}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each Array(showExtended ? 16 : 8) as _, row}
            <tr>
              <td class="px-2 py-1.5 text-right font-medium text-(--color-text-light) bg-(--color-bg-alt) border-r border-b border-(--color-border)">
                {row.toString(16).toUpperCase()}x
              </td>
              {#each Array(16) as _, col}
                {@const code = row * 16 + col}
                {@const isControl = code < 32 || code === 127}
                {@const char = getCompactChar(code)}
                {@const cellColor = getCellColor(code)}
                {@const isSelected = selectedCode === code}
                <td
                  class="px-1 py-1.5 text-center border-b border-(--color-border) cursor-pointer transition-colors hover:brightness-90 {isControl ? 'text-(--color-text-muted) text-xs' : 'text-base'} {isSelected ? 'ring-2 ring-(--color-accent) ring-inset' : ''}"
                  style="background-color: {isSelected ? 'var(--color-accent)' : cellColor}; {isSelected ? 'color: var(--color-btn-text)' : ''}"
                  onclick={() => selectChar(code)}
                  title={getCompactTooltip(code)}
                >
                  {char}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Detail Panel -->
    {#if selectedInfo}
      <div class="mt-4 border border-(--color-border) bg-(--color-bg-alt) p-4">
        <div class="flex justify-between items-start mb-3">
          <div class="flex items-center gap-4">
            <div
              class="w-16 h-16 flex items-center justify-center text-4xl font-mono border border-(--color-border) bg-(--color-bg)"
              style="background-color: {getCellColor(selectedInfo.code)}"
            >
              {selectedInfo.displayChar}
            </div>
            <div>
              <div class="text-lg font-medium">{selectedInfo.name}</div>
              <div class="text-sm text-(--color-text-muted)">
                {selectedInfo.isControl ? "Control Character" : selectedInfo.code >= 128 ? "Extended ASCII" : "Printable Character"}
              </div>
            </div>
          </div>
          <button
            onclick={closeDetail}
            class="text-(--color-text-muted) hover:text-(--color-text) text-xl leading-none px-2"
          >
            &times;
          </button>
        </div>
        
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div
            class="p-2 border border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-all duration-150"
            style="background-color: {copiedField === 'dec' ? 'var(--color-accent)' : 'var(--color-bg)'}; color: {copiedField === 'dec' ? 'var(--color-btn-text)' : 'inherit'}"
            onclick={() => copyField(selectedInfo.dec, "dec")}
            title="Click to copy"
          >
            <div class="text-xs text-(--color-text-muted) mb-1" style="color: {copiedField === 'dec' ? 'var(--color-btn-text)' : ''}">Decimal</div>
            <div class="font-mono">{selectedInfo.dec}</div>
          </div>
          <div
            class="p-2 border border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-all duration-150"
            style="background-color: {copiedField === 'hex' ? 'var(--color-accent)' : 'var(--color-bg)'}; color: {copiedField === 'hex' ? 'var(--color-btn-text)' : 'inherit'}"
            onclick={() => copyField(selectedInfo.hex, "hex")}
            title="Click to copy"
          >
            <div class="text-xs text-(--color-text-muted) mb-1" style="color: {copiedField === 'hex' ? 'var(--color-btn-text)' : ''}">Hexadecimal</div>
            <div class="font-mono">{selectedInfo.hex}</div>
          </div>
          <div
            class="p-2 border border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-all duration-150"
            style="background-color: {copiedField === 'oct' ? 'var(--color-accent)' : 'var(--color-bg)'}; color: {copiedField === 'oct' ? 'var(--color-btn-text)' : 'inherit'}"
            onclick={() => copyField(selectedInfo.oct, "oct")}
            title="Click to copy"
          >
            <div class="text-xs text-(--color-text-muted) mb-1" style="color: {copiedField === 'oct' ? 'var(--color-btn-text)' : ''}">Octal</div>
            <div class="font-mono">{selectedInfo.oct}</div>
          </div>
          <div
            class="p-2 border border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-all duration-150"
            style="background-color: {copiedField === 'bin' ? 'var(--color-accent)' : 'var(--color-bg)'}; color: {copiedField === 'bin' ? 'var(--color-btn-text)' : 'inherit'}"
            onclick={() => copyField(selectedInfo.bin, "bin")}
            title="Click to copy"
          >
            <div class="text-xs text-(--color-text-muted) mb-1" style="color: {copiedField === 'bin' ? 'var(--color-btn-text)' : ''}">Binary</div>
            <div class="font-mono text-xs">{selectedInfo.bin}</div>
          </div>
          <div
            class="p-2 border border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-all duration-150"
            style="background-color: {copiedField === 'url' ? 'var(--color-accent)' : 'var(--color-bg)'}; color: {copiedField === 'url' ? 'var(--color-btn-text)' : 'inherit'}"
            onclick={() => copyField(selectedInfo.url, "url")}
            title="Click to copy"
          >
            <div class="text-xs text-(--color-text-muted) mb-1" style="color: {copiedField === 'url' ? 'var(--color-btn-text)' : ''}">URL</div>
            <div class="font-mono">{selectedInfo.url}</div>
          </div>
          {#if selectedInfo.escape}
            <div
              class="p-2 border border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-all duration-150"
              style="background-color: {copiedField === 'escape' ? 'var(--color-accent)' : 'var(--color-bg)'}; color: {copiedField === 'escape' ? 'var(--color-btn-text)' : 'inherit'}"
              onclick={() => copyField(selectedInfo.escape, "escape")}
              title="Click to copy"
            >
              <div class="text-xs text-(--color-text-muted) mb-1" style="color: {copiedField === 'escape' ? 'var(--color-btn-text)' : ''}">Escape</div>
              <div class="font-mono">{selectedInfo.escape}</div>
            </div>
          {/if}
          {#if !selectedInfo.isControl}
            <div
              class="p-2 border border-(--color-border) cursor-pointer hover:border-(--color-accent) transition-all duration-150"
              style="background-color: {copiedField === 'char' ? 'var(--color-accent)' : 'var(--color-bg)'}; color: {copiedField === 'char' ? 'var(--color-btn-text)' : 'inherit'}"
              onclick={() => copyField(selectedInfo.char, "char")}
              title="Click to copy character"
            >
              <div class="text-xs text-(--color-text-muted) mb-1" style="color: {copiedField === 'char' ? 'var(--color-btn-text)' : ''}">Character</div>
              <div class="font-mono">"{selectedInfo.char}"</div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
    
    <!-- Legend -->
    <div class="mt-4 flex flex-wrap gap-4 text-xs text-(--color-text-muted)">
      <div class="flex items-center gap-2">
        <span class="w-4 h-4 border border-(--color-border)" style="background-color: rgba(239, 68, 68, 0.15)"></span>
        <span>Control</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-4 h-4 border border-(--color-border)" style="background-color: rgba(107, 114, 128, 0.15)"></span>
        <span>Space</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-4 h-4 border border-(--color-border)" style="background-color: rgba(59, 130, 246, 0.15)"></span>
        <span>Digits</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-4 h-4 border border-(--color-border)" style="background-color: rgba(34, 197, 94, 0.15)"></span>
        <span>Letters</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-4 h-4 border border-(--color-border)" style="background-color: rgba(234, 179, 8, 0.15)"></span>
        <span>Symbols</span>
      </div>
      {#if showExtended}
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 border border-(--color-border)" style="background-color: rgba(168, 85, 247, 0.15)"></span>
          <span>Extended</span>
        </div>
      {/if}
      <span class="ml-auto">Click any cell for details</span>
    </div>
  </div>
</div>
