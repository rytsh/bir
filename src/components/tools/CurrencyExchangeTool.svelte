<script lang="ts">
  import { createChart, AreaSeries, type IChartApi, type ISeriesApi, ColorType } from "lightweight-charts";

  // --- Types ---
  interface CurrencyMap {
    [code: string]: string;
  }

  interface RatesResponse {
    base: string;
    date: string;
    rates: { [code: string]: number };
  }

  interface TimeSeriesResponse {
    base: string;
    start_date: string;
    end_date: string;
    rates: { [date: string]: { [code: string]: number } };
  }

  interface ChartPoint {
    time: string;
    value: number;
  }

  type Period = "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";

  // --- Constants ---
  const API_BASE = "https://api.frankfurter.dev/v1";

  const POPULAR_CURRENCIES = [
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "INR", "KRW",
    "BRL", "MXN", "SGD", "HKD", "NOK", "SEK", "DKK", "NZD", "ZAR", "TRY",
  ];

  const PERIOD_DAYS: Record<Period, number> = {
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    "5Y": 1825,
  };

  // --- State ---
  let currencies = $state<CurrencyMap>({});
  let currencyList = $state<string[]>([]);
  let amount = $state("1");
  let fromCurrency = $state("USD");
  let toCurrency = $state("EUR");
  let convertedAmount = $state<number | null>(null);
  let currentRate = $state<number | null>(null);
  let rateDate = $state("");
  let multiRates = $state<{ code: string; name: string; rate: number }[]>([]);
  let selectedPeriod = $state<Period>("1M");
  let selectedDate = $state("");
  let initialLoading = $state(true);
  let chartLoading = $state(false);
  let errorMessage = $state("");
  let chartError = $state("");
  let isDark = $state(false);
  let chartContainer = $state<HTMLDivElement | null>(null);
  let chart: IChartApi | null = null;
  let areaSeries: ISeriesApi<"Area"> | null = null;
  let lastChartData: ChartPoint[] | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let initialized = false;
  let fromSearch = $state("");
  let toSearch = $state("");
  let fromDropdownOpen = $state(false);
  let toDropdownOpen = $state(false);

  // --- Derived ---
  let numericAmount = $derived(parseFloat(amount) || 0);
  let isHistorical = $derived(selectedDate !== "");

  let filteredFromCurrencies = $derived(
    currencyList.filter((code) => {
      if (!fromSearch) return true;
      const search = fromSearch.toLowerCase();
      return code.toLowerCase().includes(search) || (currencies[code]?.toLowerCase().includes(search) ?? false);
    })
  );

  let filteredToCurrencies = $derived(
    currencyList.filter((code) => {
      if (!toSearch) return true;
      const search = toSearch.toLowerCase();
      return code.toLowerCase().includes(search) || (currencies[code]?.toLowerCase().includes(search) ?? false);
    })
  );

  // --- API helpers ---
  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  function formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  /** Returns the API date path segment — either a specific date or "latest" */
  function getDateEndpoint(): string {
    return selectedDate || "latest";
  }

  // --- Core functions ---
  async function loadCurrencies(): Promise<void> {
    try {
      const data = await fetchJson<CurrencyMap>(`${API_BASE}/currencies`);
      currencies = data;
      currencyList = Object.keys(data).sort();
    } catch (e) {
      errorMessage = "Failed to load currencies. Please try again.";
    }
  }

  async function convert(): Promise<void> {
    if (numericAmount <= 0 || fromCurrency === toCurrency) {
      if (fromCurrency === toCurrency) {
        convertedAmount = numericAmount;
        currentRate = 1;
        rateDate = selectedDate || formatDate(new Date());
      }
      return;
    }

    errorMessage = "";

    try {
      const data = await fetchJson<RatesResponse>(
        `${API_BASE}/${getDateEndpoint()}?base=${fromCurrency}&symbols=${toCurrency}`
      );
      currentRate = data.rates[toCurrency];
      convertedAmount = numericAmount * currentRate;
      rateDate = data.date;
    } catch (e) {
      errorMessage = "Failed to fetch exchange rate. Please try again.";
      convertedAmount = null;
      currentRate = null;
    } finally {
      initialLoading = false;
    }
  }

  async function loadMultiRates(): Promise<void> {
    try {
      const data = await fetchJson<RatesResponse>(
        `${API_BASE}/${getDateEndpoint()}?base=${fromCurrency}`
      );
      const available = POPULAR_CURRENCIES.filter(
        (c) => c !== fromCurrency && data.rates[c] !== undefined
      );
      multiRates = available.map((code) => ({
        code,
        name: currencies[code] || code,
        rate: data.rates[code],
      }));
    } catch {
      multiRates = [];
    }
  }

  async function loadChart(): Promise<void> {
    if (!chartContainer) return;

    chartLoading = true;
    chartError = "";

    const days = PERIOD_DAYS[selectedPeriod];
    const endDate = selectedDate ? new Date(selectedDate) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    try {
      const data = await fetchJson<TimeSeriesResponse>(
        `${API_BASE}/${formatDate(startDate)}..${formatDate(endDate)}?base=${fromCurrency}&symbols=${toCurrency}`
      );

      const dates = Object.keys(data.rates).sort();
      if (dates.length === 0) {
        chartError = "No data available for this period.";
        chartLoading = false;
        return;
      }

      const points: ChartPoint[] = dates.map((d) => ({
        time: d,
        value: data.rates[d][toCurrency],
      }));

      lastChartData = points;
      renderChart(points);
    } catch (e) {
      chartError = "Failed to load chart data.";
    } finally {
      chartLoading = false;
    }
  }

  function renderChart(points: ChartPoint[]): void {
    if (!chartContainer) return;

    const lightColors = {
      background: "#ffffff",
      text: "#1a1a1a",
      grid: "#e5e5e5",
      line: "#1a1a1a",
      areaTop: "rgba(26, 26, 26, 0.12)",
      areaBottom: "rgba(26, 26, 26, 0.02)",
      crosshairLabel: "#1a1a1a",
    };

    const darkColors = {
      background: "#141414",
      text: "#f1f1f1",
      grid: "#2a2a2a",
      line: "#f1f1f1",
      areaTop: "rgba(241, 241, 241, 0.12)",
      areaBottom: "rgba(241, 241, 241, 0.02)",
      crosshairLabel: "#f1f1f1",
    };

    const colors = isDark ? darkColors : lightColors;

    // If chart already exists, just update data and colors without recreating
    if (chart && areaSeries) {
      chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: colors.background },
          textColor: colors.text,
        },
        grid: {
          vertLines: { color: colors.grid },
          horzLines: { color: colors.grid },
        },
        timeScale: { borderColor: colors.grid },
        rightPriceScale: { borderColor: colors.grid },
        crosshair: {
          vertLine: { labelBackgroundColor: colors.crosshairLabel },
          horzLine: { labelBackgroundColor: colors.crosshairLabel },
        },
      });
      areaSeries.applyOptions({
        lineColor: colors.line,
        topColor: colors.areaTop,
        bottomColor: colors.areaBottom,
        crosshairMarkerBorderColor: colors.line,
        crosshairMarkerBackgroundColor: colors.background,
      });
      areaSeries.setData(points as any);
      chart.timeScale().fitContent();
      return;
    }

    // First time: create chart
    if (chart) {
      chart.remove();
      chart = null;
      areaSeries = null;
    }

    chart = createChart(chartContainer, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "'Inter', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      width: chartContainer.clientWidth,
      height: 350,
      timeScale: {
        borderColor: colors.grid,
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: colors.grid,
      },
      crosshair: {
        vertLine: { labelBackgroundColor: colors.crosshairLabel },
        horzLine: { labelBackgroundColor: colors.crosshairLabel },
      },
    });

    areaSeries = chart.addSeries(AreaSeries, {
      lineColor: colors.line,
      lineWidth: 2,
      topColor: colors.areaTop,
      bottomColor: colors.areaBottom,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBorderColor: colors.line,
      crosshairMarkerBackgroundColor: colors.background,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    areaSeries.setData(points as any);
    chart.timeScale().fitContent();
  }

  function swapCurrencies(): void {
    const temp = fromCurrency;
    fromCurrency = toCurrency;
    toCurrency = temp;
    fromSearch = "";
    toSearch = "";
    debouncedUpdate();
  }

  function debouncedUpdate(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      convert();
      loadMultiRates();
      loadChart();
    }, 300);
  }

  function onDateChange(): void {
    debouncedUpdate();
  }

  function clearDate(): void {
    selectedDate = "";
    debouncedUpdate();
  }

  function formatNumber(n: number, decimals: number = 4): string {
    if (Math.abs(n) >= 1) {
      return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: decimals,
      });
    }
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  function selectFromCurrency(code: string): void {
    fromCurrency = code;
    fromSearch = "";
    fromDropdownOpen = false;
    debouncedUpdate();
  }

  function selectToCurrency(code: string): void {
    toCurrency = code;
    toSearch = "";
    toDropdownOpen = false;
    debouncedUpdate();
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest(".from-dropdown")) fromDropdownOpen = false;
    if (!target.closest(".to-dropdown")) toDropdownOpen = false;
  }

  function getInitialDarkMode(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  }

  // --- Effects ---

  // Dark mode observer
  $effect(() => {
    isDark = getInitialDarkMode();
    const observer = new MutationObserver(() => {
      const newDark = document.documentElement.classList.contains("dark");
      if (newDark !== isDark) isDark = newDark;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  });

  // Re-render chart on theme change (no refetch, just re-render cached data)
  $effect(() => {
    isDark;
    if (lastChartData && chartContainer) {
      renderChart(lastChartData);
    }
  });

  // Resize chart on container resize
  $effect(() => {
    if (!chartContainer || !chart) return;
    const container = chartContainer;
    const chartRef = chart;
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef && container) {
        chartRef.applyOptions({ width: container.clientWidth });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  });

  // Initial load
  $effect(() => {
    loadCurrencies().then(() => {
      initialized = true;
      convert();
      loadMultiRates();
      requestAnimationFrame(() => loadChart());
    });

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      if (chart) {
        chart.remove();
        chart = null;
      }
    };
  });

  // React to period changes
  $effect(() => {
    selectedPeriod;
    if (initialized && chartContainer) {
      loadChart();
    }
  });

  // Local recalculation when amount changes
  $effect(() => {
    amount;
    if (initialized && currentRate !== null) {
      convertedAmount = numericAmount * currentRate;
    }
  });
</script>

<div class="h-full flex flex-col overflow-y-auto">
  <header class="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
    <p class="text-sm text-(--color-text-muted)">
      Convert between currencies using live exchange rates from the European Central Bank.
    </p>
    <div class="flex items-center gap-2 shrink-0">
      <label class="text-xs text-(--color-text-muted) whitespace-nowrap" for="rate-date">Date</label>
      <input
        id="rate-date"
        type="date"
        bind:value={selectedDate}
        onchange={onDateChange}
        max={formatDate(new Date())}
        min="1999-01-04"
        class="px-2 py-1 text-sm bg-(--color-bg-alt) border border-(--color-border) text-(--color-text) focus:border-(--color-accent) outline-none"
      />
      {#if isHistorical}
        <button
          type="button"
          onclick={clearDate}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          title="Reset to latest rates"
        >
          Clear
        </button>
      {/if}
    </div>
  </header>

  {#if errorMessage}
    <div class="mb-4 p-3 border border-(--color-error-border) bg-(--color-error-bg) text-(--color-error-text) text-sm">
      {errorMessage}
    </div>
  {/if}

  <!-- Conversion Section -->
  <div class="mb-4 p-4 border border-(--color-border) bg-(--color-bg-alt)">
    <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_1fr] gap-3 items-end">
      <!-- Amount -->
      <div>
        <label class="block text-xs font-medium text-(--color-text-muted) mb-1" for="amount">Amount</label>
        <input
          id="amount"
          type="number"
          min="0"
          step="any"
          bind:value={amount}
          class="w-full h-[38px] px-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm font-mono focus:border-(--color-accent) outline-none"
        />
      </div>

      <!-- From Currency -->
      <div class="from-dropdown relative">
        <label class="block text-xs font-medium text-(--color-text-muted) mb-1">From</label>
        <button
          type="button"
          onclick={() => { fromDropdownOpen = !fromDropdownOpen; toDropdownOpen = false; }}
          class="w-full h-[38px] px-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-left flex items-center gap-2 hover:border-(--color-accent) outline-none"
        >
          <span class="font-mono text-sm font-semibold">{fromCurrency}</span>
          <span class="text-xs text-(--color-text-muted) truncate">{currencies[fromCurrency] || ""}</span>
          <svg class="w-4 h-4 ml-auto shrink-0 text-(--color-text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {#if fromDropdownOpen}
          <div class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto border border-(--color-border) bg-(--color-bg-alt)">
            <div class="sticky top-0 p-2 bg-(--color-bg-alt) border-b border-(--color-border)">
              <input
                type="text"
                placeholder="Search..."
                bind:value={fromSearch}
                class="w-full px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:border-(--color-accent) outline-none"
              />
            </div>
            {#each filteredFromCurrencies as code}
              <button
                type="button"
                onclick={() => selectFromCurrency(code)}
                class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-(--color-border) text-sm {code === fromCurrency ? 'bg-(--color-border) font-semibold' : ''}"
              >
                <span class="font-mono">{code}</span>
                <span class="text-(--color-text-muted) truncate">{currencies[code]}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Swap Button -->
      <button
        type="button"
        onclick={swapCurrencies}
        title="Swap currencies"
        class="h-[38px] w-[38px] flex items-center justify-center border border-(--color-border) bg-(--color-bg) hover:bg-(--color-border) text-(--color-text) transition-colors"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      </button>

      <!-- To Currency -->
      <div class="to-dropdown relative">
        <label class="block text-xs font-medium text-(--color-text-muted) mb-1">To</label>
        <button
          type="button"
          onclick={() => { toDropdownOpen = !toDropdownOpen; fromDropdownOpen = false; }}
          class="w-full h-[38px] px-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-left flex items-center gap-2 hover:border-(--color-accent) outline-none"
        >
          <span class="font-mono text-sm font-semibold">{toCurrency}</span>
          <span class="text-xs text-(--color-text-muted) truncate">{currencies[toCurrency] || ""}</span>
          <svg class="w-4 h-4 ml-auto shrink-0 text-(--color-text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {#if toDropdownOpen}
          <div class="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto border border-(--color-border) bg-(--color-bg-alt)">
            <div class="sticky top-0 p-2 bg-(--color-bg-alt) border-b border-(--color-border)">
              <input
                type="text"
                placeholder="Search..."
                bind:value={toSearch}
                class="w-full px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text) focus:border-(--color-accent) outline-none"
              />
            </div>
            {#each filteredToCurrencies as code}
              <button
                type="button"
                onclick={() => selectToCurrency(code)}
                class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-(--color-border) text-sm {code === toCurrency ? 'bg-(--color-border) font-semibold' : ''}"
              >
                <span class="font-mono">{code}</span>
                <span class="text-(--color-text-muted) truncate">{currencies[code]}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Result Display -->
    <div class="mt-4 pt-4 border-t border-(--color-border)">
      {#if initialLoading}
        <div class="flex items-center gap-2 text-(--color-text-muted) text-sm">
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Fetching rates...
        </div>
      {:else if convertedAmount !== null && currentRate !== null}
        <div class="flex flex-col gap-1">
          <div class="text-2xl font-semibold text-(--color-text) font-mono">
            {formatNumber(numericAmount, 2)} {fromCurrency} = {formatNumber(convertedAmount)} {toCurrency}
          </div>
          <div class="text-sm text-(--color-text-muted)">
            1 {fromCurrency} = {formatNumber(currentRate)} {toCurrency}
            <span class="mx-1">&middot;</span>
            1 {toCurrency} = {formatNumber(1 / currentRate)} {fromCurrency}
            <span class="mx-1">&middot;</span>
            <span class="text-(--color-text-light)">{isHistorical ? `as of ${rateDate}` : `latest (${rateDate})`}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Multi-Currency Output -->
  {#if multiRates.length > 0}
    <div class="mb-4">
      <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium mb-2">
        {formatNumber(numericAmount, 2)} {fromCurrency} in other currencies
      </h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {#each multiRates as rate}
          <div class="p-2.5 border border-(--color-border) bg-(--color-bg-alt)">
            <div class="text-xs text-(--color-text-muted) truncate">{rate.name}</div>
            <div class="font-mono text-sm font-semibold text-(--color-text)">
              {formatNumber(rate.rate * numericAmount)} <span class="text-xs text-(--color-text-muted)">{rate.code}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Chart Section -->
  <div class="mb-4">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
      <h2 class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
        {fromCurrency}/{toCurrency} Exchange Rate
      </h2>
      <div class="flex gap-1">
        {#each Object.keys(PERIOD_DAYS) as period}
          <button
            type="button"
            onclick={() => { selectedPeriod = period as Period; }}
            class="px-2.5 py-1 text-xs font-medium transition-colors {
              selectedPeriod === period
                ? 'bg-(--color-text) text-(--color-btn-text)'
                : 'bg-(--color-bg-alt) text-(--color-text-muted) border border-(--color-border) hover:bg-(--color-border)'
            }"
          >
            {period}
          </button>
        {/each}
      </div>
    </div>

    <div class="border border-(--color-border) overflow-hidden bg-(--color-bg-alt) relative">
      {#if chartLoading}
        <div class="absolute inset-0 flex items-center justify-center bg-(--color-bg-alt)/80 z-10">
          <div class="flex items-center gap-2 text-sm text-(--color-text-muted)">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading chart...
          </div>
        </div>
      {/if}
      {#if chartError}
        <div class="p-8 text-center text-sm text-(--color-error-text)">{chartError}</div>
      {/if}
      <div bind:this={chartContainer} class="w-full" style="height: 350px;"></div>
    </div>

    <div class="mt-1 text-xs text-(--color-text-light)">
      {isHistorical ? `Showing daily ECB rates ending ${rateDate}` : "Showing daily ECB reference rates"}
    </div>
  </div>

  <!-- Footer -->
  <div class="text-xs text-(--color-text-light) mt-auto pt-2">
    Rates provided by the <a href="https://www.ecb.europa.eu" target="_blank" rel="noopener noreferrer" class="underline hover:text-(--color-text-muted)">European Central Bank</a> via
    <a href="https://frankfurter.app" target="_blank" rel="noopener noreferrer" class="underline hover:text-(--color-text-muted)">Frankfurter API</a>.
    Rates are reference rates, not transaction rates.
  </div>
</div>
