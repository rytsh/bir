<script lang="ts">
  type Tab = "loan" | "compound" | "savings" | "roi" | "retirement" | "salary";

  let tab = $state<Tab>("loan");

  // -------- Loan / Mortgage --------
  type MortgageType = "annuity" | "linear" | "interest-only";
  let mortgageType = $state<MortgageType>("annuity");
  let loanAmount = $state(250000);
  let loanRate = $state(6.5); // annual %
  let loanYears = $state(30);
  let extraPayment = $state(0);

  // Tax deduction on interest paid (e.g. Netherlands hypotheekrenteaftrek ~36.97%,
  // UK BTL relief, US mortgage interest deduction, etc.).
  let taxDeductionEnabled = $state(false);
  let taxDeductionRate = $state(36.97); // % of interest refunded by govt

  // Common presets for quick selection
  const taxPresets = [
    { label: "🇳🇱 NL hypotheekrenteaftrek (low)", rate: 36.97 },
    { label: "🇳🇱 NL hypotheekrenteaftrek (high)", rate: 49.5 },
    { label: "🇺🇸 US 22% bracket", rate: 22 },
    { label: "🇺🇸 US 24% bracket", rate: 24 },
    { label: "🇺🇸 US 32% bracket", rate: 32 },
    { label: "🇩🇪 DE 30% bracket", rate: 30 },
    { label: "🇧🇪 BE 40% bracket", rate: 40 },
  ];

  function loanCalc() {
    const r = loanRate / 100 / 12;
    const n = loanYears * 12;
    const P = loanAmount;
    if (P <= 0 || n <= 0) return null;

    // Reference annuity payment (for "monthly" headline figure & comparison)
    let annuityMonthly: number;
    if (r === 0) annuityMonthly = P / n;
    else annuityMonthly = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

    // First-month payment for the chosen mortgage type (used as headline)
    let firstMonthly: number;
    if (mortgageType === "annuity") firstMonthly = annuityMonthly;
    else if (mortgageType === "linear") firstMonthly = P / n + P * r; // first month, biggest
    else firstMonthly = P * r; // interest-only

    const totalMonthly = firstMonthly + extraPayment;

    // Build amortization schedule
    let balance = P;
    let totalInterest = 0;
    let totalPrincipal = 0;
    const schedule: { month: number; interest: number; principal: number; balance: number; payment: number; yearlyInterest: number }[] = [];
    let month = 0;
    let yearlyInterestAccum = 0;
    const linearPrincipal = P / n; // fixed principal portion for linear

    while (balance > 0.01 && month < n * 2) {
      month++;
      const interest = balance * r;
      let principal: number;
      let payment: number;

      if (mortgageType === "annuity") {
        payment = annuityMonthly + extraPayment;
        principal = payment - interest;
      } else if (mortgageType === "linear") {
        principal = linearPrincipal + extraPayment;
        payment = principal + interest;
      } else {
        // interest-only: pay only interest; principal at end (balloon)
        principal = extraPayment;
        payment = interest + extraPayment;
        // Force final-month balloon if we've reached term
        if (month >= n) {
          principal = balance;
          payment = interest + balance;
        }
      }

      if (principal > balance) {
        principal = balance;
        payment = principal + interest;
      }
      balance -= principal;
      totalInterest += interest;
      totalPrincipal += principal;
      yearlyInterestAccum += interest;
      schedule.push({ month, interest, principal, balance, payment, yearlyInterest: yearlyInterestAccum });
      if (month % 12 === 0) yearlyInterestAccum = 0;
      if (balance <= 0) break;
    }

    // Last-month payment for context (e.g. linear ends low; IO ends with balloon)
    const lastMonthly = schedule.length > 0 ? schedule[schedule.length - 1].payment : firstMonthly;
    // Average monthly payment over the life of the loan
    const avgMonthly = schedule.reduce((a, s) => a + s.payment, 0) / Math.max(schedule.length, 1);
    // Keep `monthly` for backward-compat with rest of UI = first-month / annuity
    const monthly = firstMonthly;

    // Tax-deduction projections — refund applies to interest paid
    const dedRate = taxDeductionEnabled ? taxDeductionRate / 100 : 0;
    const totalRefund = totalInterest * dedRate;
    const netInterest = totalInterest - totalRefund;
    const effectiveTotalCost = totalPrincipal + netInterest;

    // Effective monthly interest after refund (averaged across all payments)
    const avgMonthlyInterest = totalInterest / month;
    const monthlyRefund = avgMonthlyInterest * dedRate;
    const effectiveMonthly = avgMonthly - monthlyRefund;

    // Year-1 estimate: refund is biggest in early years (interest is front-loaded)
    const year1Interest = schedule.slice(0, 12).reduce((acc, s) => acc + s.interest, 0);
    const year1Refund = year1Interest * dedRate;

    // Effective interest rate (approx) after deduction
    const effectiveRate = loanRate * (1 - dedRate);

    return {
      mortgageType,
      monthly, // first-month / annuity headline
      firstMonthly,
      lastMonthly,
      avgMonthly,
      annuityMonthly,
      totalMonthly,
      totalInterest,
      totalPrincipal,
      payoffMonths: month,
      payoffYears: month / 12,
      saved: extraPayment > 0 ? annuityMonthly * n - (totalPrincipal + totalInterest) : 0,
      schedule,
      // Tax-related
      taxEnabled: taxDeductionEnabled,
      dedRate,
      totalRefund,
      netInterest,
      effectiveTotalCost,
      monthlyRefund,
      effectiveMonthly,
      year1Interest,
      year1Refund,
      effectiveRate,
    };
  }

  let loanResult = $derived(loanCalc());

  // Chart geometry derived state
  const CHART_W = 720;
  const CHART_H = 220;
  let chartMaxPayment = $derived(
    loanResult && loanResult.schedule.length > 0
      ? Math.max(...loanResult.schedule.map((s) => s.payment))
      : 0
  );
  let chartStep = $derived(
    loanResult && loanResult.schedule.length > 0 ? CHART_W / loanResult.schedule.length : 0
  );

  // -------- Compound Interest --------
  let ciPrincipal = $state(10000);
  let ciRate = $state(7);
  let ciYears = $state(20);
  let ciFreq = $state(12); // compounds per year
  let ciContribution = $state(500);
  let ciContribFreq = $state<"monthly" | "yearly">("monthly");

  function compoundCalc() {
    const P = ciPrincipal;
    const r = ciRate / 100;
    const n = ciFreq;
    const t = ciYears;
    const PMT = ciContribFreq === "monthly" ? ciContribution * 12 : ciContribution;

    // Future value of principal: P(1 + r/n)^(nt)
    const fvPrincipal = P * Math.pow(1 + r / n, n * t);
    // Future value of recurring contributions (deposited at period end, period = year for simplicity)
    // Use formula FV = PMT * [((1 + r/n)^(nt) - 1) / (r/n)] adjusted to payment frequency
    let fvContributions = 0;
    if (PMT > 0 && r > 0) {
      const periodsPerYear = ciContribFreq === "monthly" ? 12 : 1;
      const periodicPmt = PMT / periodsPerYear;
      const periodicRate = r / periodsPerYear;
      const totalPeriods = t * periodsPerYear;
      fvContributions = periodicPmt * ((Math.pow(1 + periodicRate, totalPeriods) - 1) / periodicRate);
    } else if (PMT > 0 && r === 0) {
      fvContributions = PMT * t;
    }

    const fv = fvPrincipal + fvContributions;
    const contributed = P + PMT * t;
    const interest = fv - contributed;

    // Year-by-year breakdown
    const yearly: { year: number; balance: number; contributed: number; interest: number }[] = [];
    let balance = P;
    let totalContrib = P;
    for (let y = 1; y <= t; y++) {
      const periodsPerYear = ciContribFreq === "monthly" ? 12 : 1;
      const periodicPmt = PMT / periodsPerYear;
      const periodicRate = r / periodsPerYear;
      for (let p = 0; p < periodsPerYear; p++) {
        balance = balance * (1 + periodicRate) + periodicPmt;
        totalContrib += periodicPmt;
      }
      yearly.push({ year: y, balance, contributed: totalContrib, interest: balance - totalContrib });
    }

    return { fv, contributed, interest, yearly };
  }

  let ciResult = $derived(compoundCalc());

  // -------- Savings Goal --------
  let goalTarget = $state(100000);
  let goalCurrent = $state(5000);
  let goalRate = $state(5);
  let goalYears = $state(10);

  function savingsCalc() {
    // Solve for monthly contribution needed
    const FV = goalTarget;
    const PV = goalCurrent;
    const r = goalRate / 100 / 12;
    const n = goalYears * 12;
    if (n <= 0) return null;
    const fvFromPV = PV * Math.pow(1 + r, n);
    const remaining = FV - fvFromPV;
    let pmt: number;
    if (r === 0) pmt = remaining / n;
    else pmt = (remaining * r) / (Math.pow(1 + r, n) - 1);
    return { monthlyNeeded: Math.max(0, pmt), fvFromPV, remaining: Math.max(0, remaining) };
  }

  let savingsResult = $derived(savingsCalc());

  // -------- ROI --------
  let roiInitial = $state(10000);
  let roiFinal = $state(15000);
  let roiYears = $state(3);

  function roiCalc() {
    if (roiInitial <= 0) return null;
    const totalReturn = roiFinal - roiInitial;
    const roiPct = (totalReturn / roiInitial) * 100;
    const annualized = roiYears > 0 ? (Math.pow(roiFinal / roiInitial, 1 / roiYears) - 1) * 100 : 0;
    return { totalReturn, roiPct, annualized };
  }

  let roiResult = $derived(roiCalc());

  // -------- Retirement --------
  let retCurrentAge = $state(30);
  let retRetireAge = $state(65);
  let retCurrentSavings = $state(20000);
  let retMonthly = $state(1000);
  let retRate = $state(7);
  let retWithdrawalRate = $state(4); // safe withdrawal %

  function retirementCalc() {
    const years = retRetireAge - retCurrentAge;
    if (years <= 0) return null;
    const r = retRate / 100 / 12;
    const n = years * 12;
    const fvSavings = retCurrentSavings * Math.pow(1 + r, n);
    let fvContrib = 0;
    if (r > 0) fvContrib = retMonthly * ((Math.pow(1 + r, n) - 1) / r);
    else fvContrib = retMonthly * n;
    const total = fvSavings + fvContrib;
    const annualWithdrawal = (total * retWithdrawalRate) / 100;
    const monthlyWithdrawal = annualWithdrawal / 12;
    return { years, total, annualWithdrawal, monthlyWithdrawal };
  }

  let retResult = $derived(retirementCalc());

  // -------- Salary Calculator (generic with country presets) --------
  type SalaryInputMode = "hourly" | "monthly" | "yearly";

  interface TaxBracketDef {
    upTo: number; // upper threshold of taxable income (use Infinity for "and above")
    rate: number; // 0..1
  }

  interface SalaryPreset {
    id: string;
    name: string;
    currency: string;
    holidayAllowancePct: number;
    monthsPerYear: number; // some countries pay 13/14 months
    brackets: TaxBracketDef[];
    // Optional flat tax credit (subtracted from tax owed)
    flatCredit: number;
    // Optional flat social-security rate applied on top of income tax (already included in NL preset)
    socialRate: number;
    // Country-specific extras
    has30Ruling: boolean;
    notes: string;
  }

  // Presets are approximations for orientation purposes only — not legal/tax advice.
  const SALARY_PRESETS: SalaryPreset[] = [
    {
      id: "nl",
      name: "🇳🇱 Netherlands (2024 Box 1)",
      currency: "€",
      holidayAllowancePct: 8,
      monthsPerYear: 12,
      brackets: [
        { upTo: 75518, rate: 0.3697 },
        { upTo: Infinity, rate: 0.495 },
      ],
      flatCredit: 0, // we use the dynamic NL credit functions when this preset is active
      socialRate: 0,
      has30Ruling: true,
      notes: "Box 1 brackets include income tax + premiums volksverzekeringen. Algemene heffingskorting and arbeidskorting are computed dynamically.",
    },
    {
      id: "nl-aow",
      name: "🇳🇱 Netherlands AOW age (2024)",
      currency: "€",
      holidayAllowancePct: 8,
      monthsPerYear: 12,
      brackets: [
        { upTo: 38098, rate: 0.1907 },
        { upTo: 75518, rate: 0.3697 },
        { upTo: Infinity, rate: 0.495 },
      ],
      flatCredit: 0,
      socialRate: 0,
      has30Ruling: false,
      notes: "Reduced first-bracket rate at AOW state-pension age.",
    },
    {
      id: "us",
      name: "🇺🇸 USA (2024 federal, single)",
      currency: "$",
      holidayAllowancePct: 0,
      monthsPerYear: 12,
      brackets: [
        { upTo: 11600, rate: 0.10 },
        { upTo: 47150, rate: 0.12 },
        { upTo: 100525, rate: 0.22 },
        { upTo: 191950, rate: 0.24 },
        { upTo: 243725, rate: 0.32 },
        { upTo: 609350, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
      flatCredit: 0,
      socialRate: 0.0765, // FICA approx (SS 6.2 + Medicare 1.45)
      has30Ruling: false,
      notes: "Federal brackets only (single filer). Excludes state/local taxes. Standard deduction is not auto-applied.",
    },
    {
      id: "uk",
      name: "🇬🇧 UK (2024/25, England)",
      currency: "£",
      holidayAllowancePct: 0,
      monthsPerYear: 12,
      brackets: [
        { upTo: 12570, rate: 0 },     // personal allowance
        { upTo: 50270, rate: 0.20 },  // basic
        { upTo: 125140, rate: 0.40 }, // higher
        { upTo: Infinity, rate: 0.45 }, // additional
      ],
      flatCredit: 0,
      socialRate: 0.08, // employee NI (simplified)
      has30Ruling: false,
      notes: "Income tax + employee National Insurance (simplified). Excludes Scotland-specific bands.",
    },
    {
      id: "de",
      name: "🇩🇪 Germany (2024, single, simplified)",
      currency: "€",
      holidayAllowancePct: 0,
      monthsPerYear: 12,
      brackets: [
        { upTo: 11604, rate: 0 },
        { upTo: 17005, rate: 0.14 },
        { upTo: 66760, rate: 0.30 },
        { upTo: 277825, rate: 0.42 },
        { upTo: Infinity, rate: 0.45 },
      ],
      flatCredit: 0,
      socialRate: 0.20, // approx employee social contributions
      has30Ruling: false,
      notes: "Linear progressive zones approximated with flat brackets. Social contributions (~20%) are added separately.",
    },
    {
      id: "tr",
      name: "🇹🇷 Türkiye (2024)",
      currency: "₺",
      holidayAllowancePct: 0,
      monthsPerYear: 12,
      brackets: [
        { upTo: 110000, rate: 0.15 },
        { upTo: 230000, rate: 0.20 },
        { upTo: 870000, rate: 0.27 },
        { upTo: 3000000, rate: 0.35 },
        { upTo: Infinity, rate: 0.40 },
      ],
      flatCredit: 0,
      socialRate: 0.15, // SGK + işsizlik approx
      has30Ruling: false,
      notes: "Gelir vergisi tarifesi 2024 (ücret gelirleri).",
    },
    {
      id: "custom",
      name: "✏ Custom",
      currency: "$",
      holidayAllowancePct: 0,
      monthsPerYear: 12,
      brackets: [{ upTo: Infinity, rate: 0.25 }],
      flatCredit: 0,
      socialRate: 0,
      has30Ruling: false,
      notes: "Define your own brackets.",
    },
  ];

  let salaryInputMode = $state<SalaryInputMode>("yearly");
  let salaryHourly = $state(35);
  let salaryMonthly = $state(5000);
  let salaryYearly = $state(60000);
  let salaryHoursPerWeek = $state(40);
  let salaryWeeksPerYear = $state(52);

  let salaryPresetId = $state<string>("nl");
  let salaryCurrency = $state("€");
  let salaryHolidayAllowance = $state(8);
  let salaryMonthsPerYear = $state(12);
  let salaryFlatCredit = $state(0);
  let salarySocialRate = $state(0); // %
  let salaryBrackets = $state<TaxBracketDef[]>([
    { upTo: 75518, rate: 0.3697 },
    { upTo: Infinity, rate: 0.495 },
  ]);
  // 30% ruling (NL-style expat tax break) — usable on any preset if you want
  let salary30Ruling = $state(false);
  let salary30Pct = $state(30);
  let salary30StartYear = $state(new Date().getFullYear());
  let salary30Phasing = $state(true);
  // Whether to use NL-specific dynamic credits (algemene heffingskorting + arbeidskorting)
  let salaryUseNlCredits = $state(true);

  // Apply preset → fills the editable fields with its defaults
  function applyPreset(id: string) {
    const p = SALARY_PRESETS.find((x) => x.id === id);
    if (!p) return;
    salaryPresetId = id;
    salaryCurrency = p.currency;
    salaryHolidayAllowance = p.holidayAllowancePct;
    salaryMonthsPerYear = p.monthsPerYear;
    salaryBrackets = p.brackets.map((b) => ({ ...b }));
    salaryFlatCredit = p.flatCredit;
    salarySocialRate = p.socialRate * 100;
    salaryUseNlCredits = id === "nl" || id === "nl-aow";
    if (!p.has30Ruling) salary30Ruling = false;
  }

  function addBracket() {
    const next = [...salaryBrackets];
    // Insert before Infinity bracket if present
    const infIdx = next.findIndex((b) => b.upTo === Infinity);
    const newBracket: TaxBracketDef = { upTo: 100000, rate: 0.30 };
    if (infIdx >= 0) next.splice(infIdx, 0, newBracket);
    else next.push(newBracket);
    salaryBrackets = next;
  }

  function removeBracket(i: number) {
    salaryBrackets = salaryBrackets.filter((_, idx) => idx !== i);
  }

  let salaryAnnualGross = $derived.by(() => {
    const hpy = salaryHoursPerWeek * salaryWeeksPerYear;
    if (salaryInputMode === "hourly") return salaryHourly * hpy;
    if (salaryInputMode === "monthly") return salaryMonthly * salaryMonthsPerYear;
    return salaryYearly;
  });

  function calcBracketTax(taxable: number, brackets: TaxBracketDef[]) {
    // Sort by upTo ascending just in case
    const sorted = [...brackets].sort((a, b) => a.upTo - b.upTo);
    const breakdown: { rate: number; amount: number; tax: number }[] = [];
    let total = 0;
    let prevCap = 0;
    let remaining = taxable;
    for (const b of sorted) {
      if (remaining <= 0) break;
      const span = b.upTo - prevCap;
      if (span <= 0) {
        prevCap = b.upTo;
        continue;
      }
      const portion = Math.min(remaining, span);
      const t = portion * b.rate;
      breakdown.push({ rate: b.rate, amount: portion, tax: t });
      total += t;
      remaining -= portion;
      prevCap = b.upTo;
    }
    return { tax: total, brackets: breakdown };
  }

  // NL-specific dynamic credits (kept for the NL preset)
  function nlGeneralCredit(taxable: number): number {
    const max = 3362;
    if (taxable <= 24813) return max;
    if (taxable >= 75518) return 0;
    return Math.max(0, max - (taxable - 24813) * 0.0663);
  }

  function nlLaborCredit(income: number): number {
    if (income <= 0) return 0;
    if (income <= 11491) return income * 0.08425;
    if (income <= 24821) return 968 + (income - 11491) * 0.31433;
    if (income <= 39957) return 5158 + (income - 24821) * 0.02471;
    if (income <= 124935) return Math.max(0, 5532 - (income - 39957) * 0.0651);
    return 0;
  }

  function salaryCalc() {
    const gross = salaryAnnualGross;
    if (gross <= 0) return null;

    const holiday = (gross * salaryHolidayAllowance) / 100;
    const totalGross = gross + holiday;

    let taxFreeRuling = 0;
    let rulingPhase = "";
    if (salary30Ruling) {
      const yearsSince = new Date().getFullYear() - salary30StartYear;
      let pct = salary30Pct;
      if (salary30Phasing) {
        if (yearsSince < 0) pct = salary30Pct;
        else if (yearsSince < 2) { pct = salary30Pct; rulingPhase = `Year 1-2: ${salary30Pct}% tax-free`; }
        else if (yearsSince < 4) { pct = Math.max(0, salary30Pct - 10); rulingPhase = `Year 3-4: ${pct}% tax-free (transition)`; }
        else if (yearsSince < 5) { pct = Math.max(0, salary30Pct - 20); rulingPhase = `Year 5: ${pct}% tax-free`; }
        else { pct = 0; rulingPhase = "Expired (max 5 years)"; }
      } else {
        rulingPhase = `${salary30Pct}% tax-free (no phasing)`;
      }
      taxFreeRuling = (totalGross * pct) / 100;
    }

    const taxable = Math.max(0, totalGross - taxFreeRuling);

    // Income tax via brackets
    const { tax: incomeTax, brackets } = calcBracketTax(taxable, salaryBrackets);

    // Credits
    let generalCredit = 0;
    let laborCredit = 0;
    if (salaryUseNlCredits) {
      generalCredit = nlGeneralCredit(taxable);
      laborCredit = nlLaborCredit(taxable);
    }
    const totalCredits = generalCredit + laborCredit + salaryFlatCredit;
    const netIncomeTax = Math.max(0, incomeTax - totalCredits);

    // Social security (extra rate on gross before deductions, simplified)
    const socialContribution = (totalGross * salarySocialRate) / 100;

    const netTax = netIncomeTax + socialContribution;
    const netAnnual = totalGross - netTax;
    const netMonthly = netAnnual / salaryMonthsPerYear;
    const netHoliday = holiday * (1 - netTax / Math.max(totalGross, 1));
    const netMonthlyExHoliday = (netAnnual - netHoliday) / salaryMonthsPerYear;

    const effectiveRate = (netTax / Math.max(totalGross, 1)) * 100;
    const marginalRate = brackets.length > 0 ? brackets[brackets.length - 1].rate * 100 : 0;

    const hpy = salaryHoursPerWeek * salaryWeeksPerYear;
    const grossHourly = gross / Math.max(hpy, 1);
    const netHourly = (netAnnual - holiday) / Math.max(hpy, 1);

    return {
      gross,
      holiday,
      totalGross,
      taxFreeRuling,
      rulingPhase,
      taxable,
      incomeTax,
      brackets,
      generalCredit,
      laborCredit,
      flatCredit: salaryFlatCredit,
      totalCredits,
      socialContribution,
      socialRate: salarySocialRate,
      netIncomeTax,
      netTax,
      netAnnual,
      netMonthly,
      netMonthlyExHoliday,
      netHoliday,
      effectiveRate,
      marginalRate,
      grossHourly,
      netHourly,
      hpy,
      currency: salaryCurrency,
      monthsPerYear: salaryMonthsPerYear,
    };
  }

  let salaryResult = $derived(salaryCalc());

  let activePreset = $derived(SALARY_PRESETS.find((p) => p.id === salaryPresetId));

  // -------- Helpers --------
  function fmtMoney(n: number, currency = "$"): string {
    if (!Number.isFinite(n)) return "—";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    return sign + currency + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(n: number): string {
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(2) + "%";
  }
</script>

<div class="flex-1 bg-(--color-bg) text-(--color-text)">
  <div class="border-b border-(--color-border) bg-(--color-bg-alt) flex flex-wrap">
    {#each [
      { id: "salary", label: "Salary (NL)", icon: "💼" },
      { id: "loan", label: "Loan / Mortgage", icon: "🏠" },
      { id: "compound", label: "Compound Interest", icon: "📈" },
      { id: "savings", label: "Savings Goal", icon: "🎯" },
      { id: "roi", label: "ROI", icon: "💰" },
      { id: "retirement", label: "Retirement", icon: "🏖️" },
    ] as t}
      <button
        onclick={() => (tab = t.id as Tab)}
        class="px-4 py-3 text-sm border-r border-(--color-border) {tab === t.id
          ? 'bg-(--color-accent) text-(--color-btn-text)'
          : 'hover:bg-(--color-bg)'}"
      >
        <span class="mr-1">{t.icon}</span> {t.label}
      </button>
    {/each}
  </div>

  <div class="p-6 max-w-6xl mx-auto">

    {#if tab === "loan"}
      <h2 class="text-xl font-medium mb-4">Loan / Mortgage Calculator</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4 space-y-3">
          <!-- Mortgage type -->
          <div>
            <label for="ln-type" class="block text-sm mb-1">Mortgage type</label>
            <div class="grid grid-cols-3 gap-1">
              {#each [
                { id: "annuity", label: "Annuity", hint: "Equal monthly payments" },
                { id: "linear", label: "Linear", hint: "Equal principal, decreasing payment" },
                { id: "interest-only", label: "Interest-only", hint: "Pay interest, principal at end" },
              ] as t}
                <button
                  onclick={() => (mortgageType = t.id as MortgageType)}
                  class="px-2 py-2 text-xs border border-(--color-border) {mortgageType === t.id
                    ? 'bg-(--color-accent) text-(--color-btn-text)'
                    : 'bg-(--color-bg) hover:bg-(--color-bg-alt)'}"
                  title={t.hint}
                >{t.label}</button>
              {/each}
            </div>
            <p class="text-xs text-(--color-text-light) mt-1">
              {#if mortgageType === "annuity"}
                Same monthly payment throughout. Interest is highest at the start, principal at the end (front-loaded interest).
              {:else if mortgageType === "linear"}
                Equal principal each month → payment starts high and decreases over time. You pay less total interest.
              {:else}
                Pay only interest each month; the full principal is due at the end (balloon payment). Common for buy-to-let.
              {/if}
            </p>
          </div>

          <div>
            <label for="ln-amt" class="block text-sm mb-1">Loan amount</label>
            <input id="ln-amt" type="number" min="0" step="1000" bind:value={loanAmount}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="ln-rate" class="block text-sm mb-1">Annual rate (%)</label>
              <input id="ln-rate" type="number" min="0" step="0.05" bind:value={loanRate}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="ln-yr" class="block text-sm mb-1">Term (years)</label>
              <input id="ln-yr" type="number" min="1" max="50" step="1" bind:value={loanYears}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          </div>
          <div>
            <label for="ln-extra" class="block text-sm mb-1">Extra monthly payment</label>
            <input id="ln-extra" type="number" min="0" step="50" bind:value={extraPayment}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>

          <!-- Tax interest deduction (e.g. NL hypotheekrenteaftrek) -->
          <div class="border-t border-(--color-border) pt-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={taxDeductionEnabled} class="accent-(--color-accent)" />
              <span class="text-sm font-medium">Tax deduction on interest</span>
            </label>
            <p class="text-xs text-(--color-text-light) mt-1">
              For example, the Netherlands' <em>hypotheekrenteaftrek</em> refunds part of the interest
              you paid as a tax credit.
            </p>
            {#if taxDeductionEnabled}
              <div class="mt-3 space-y-2">
                <div>
                  <label for="tx-preset" class="block text-xs text-(--color-text-light) mb-1">Quick preset</label>
                  <select id="tx-preset" onchange={(e) => { const v = parseFloat((e.target as HTMLSelectElement).value); if (Number.isFinite(v)) taxDeductionRate = v; }}
                    class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm">
                    <option value="">— select —</option>
                    {#each taxPresets as p}
                      <option value={p.rate}>{p.label} ({p.rate}%)</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label for="tx-rate" class="block text-xs text-(--color-text-light) mb-1">Deduction rate (%)</label>
                  <input id="tx-rate" type="number" min="0" max="100" step="0.01" bind:value={taxDeductionRate}
                    class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
                </div>
              </div>
            {/if}
          </div>
        </section>

        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          {#if loanResult}
            <div class="space-y-2">
              <div class="text-sm text-(--color-text-light)">
                {#if loanResult.mortgageType === "annuity"}
                  Monthly payment (fixed)
                {:else if loanResult.mortgageType === "linear"}
                  First month (highest)
                {:else}
                  Monthly interest payment
                {/if}
              </div>
              <div class="text-3xl font-mono font-bold text-(--color-accent)">{fmtMoney(loanResult.firstMonthly)}</div>

              {#if loanResult.mortgageType === "linear"}
                <div class="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div class="text-(--color-text-light)">Last month (lowest):</div>
                  <div class="text-right font-mono">{fmtMoney(loanResult.lastMonthly)}</div>
                  <div class="text-(--color-text-light)">Average over life:</div>
                  <div class="text-right font-mono">{fmtMoney(loanResult.avgMonthly)}</div>
                </div>
              {:else if loanResult.mortgageType === "interest-only"}
                <div class="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div class="text-(--color-text-light)">Final balloon payment:</div>
                  <div class="text-right font-mono text-orange-500">{fmtMoney(loanResult.lastMonthly)}</div>
                  <div class="text-(--color-text-light)">vs annuity equivalent:</div>
                  <div class="text-right font-mono">{fmtMoney(loanResult.annuityMonthly)}</div>
                </div>
              {/if}

              {#if extraPayment > 0}
                <div class="text-sm text-(--color-text-light) mt-2">+ Extra → first-month total</div>
                <div class="text-xl font-mono">{fmtMoney(loanResult.totalMonthly)}</div>
              {/if}
              {#if loanResult.taxEnabled && loanResult.monthlyRefund > 0}
                <div class="text-sm text-(--color-text-light) mt-2">After tax refund (avg)</div>
                <div class="text-2xl font-mono font-bold text-green-500">
                  {fmtMoney(loanResult.effectiveMonthly)}
                  <span class="text-sm text-(--color-text-light) font-normal">/ mo</span>
                </div>
              {/if}
              <hr class="border-(--color-border) my-3" />
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="text-(--color-text-light)">Total interest:</div><div class="text-right font-mono">{fmtMoney(loanResult.totalInterest)}</div>
                <div class="text-(--color-text-light)">Total paid:</div><div class="text-right font-mono">{fmtMoney(loanResult.totalPrincipal + loanResult.totalInterest)}</div>
                <div class="text-(--color-text-light)">Payoff time:</div><div class="text-right font-mono">{loanResult.payoffMonths} mo ({loanResult.payoffYears.toFixed(1)} yr)</div>
                {#if loanResult.mortgageType !== "annuity"}
                  <div class="text-(--color-text-light)">vs annuity total interest:</div>
                  {@const annuityTotal = loanResult.annuityMonthly * (loanYears * 12) - loanAmount}
                  <div class="text-right font-mono">
                    {fmtMoney(annuityTotal)}
                    {#if loanResult.totalInterest < annuityTotal}
                      <span class="text-green-500 text-xs">(saved {fmtMoney(annuityTotal - loanResult.totalInterest)})</span>
                    {:else if loanResult.totalInterest > annuityTotal}
                      <span class="text-red-500 text-xs">(more by {fmtMoney(loanResult.totalInterest - annuityTotal)})</span>
                    {/if}
                  </div>
                {/if}
                {#if loanResult.saved > 0}
                  <div class="text-(--color-text-light)">Saved by extra:</div><div class="text-right font-mono text-green-500">{fmtMoney(loanResult.saved)}</div>
                {/if}
              </div>

              {#if loanResult.taxEnabled}
                <div class="mt-4 border border-green-500/30 bg-green-500/5 p-3 rounded">
                  <div class="text-sm font-medium text-green-500 mb-2">
                    💰 Tax refund ({(loanResult.dedRate * 100).toFixed(2)}% of interest)
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="text-(--color-text-light)">Total refund (lifetime):</div>
                    <div class="text-right font-mono text-green-500">{fmtMoney(loanResult.totalRefund)}</div>

                    <div class="text-(--color-text-light)">Net interest cost:</div>
                    <div class="text-right font-mono">{fmtMoney(loanResult.netInterest)}</div>

                    <div class="text-(--color-text-light)">Effective total paid:</div>
                    <div class="text-right font-mono">{fmtMoney(loanResult.effectiveTotalCost)}</div>

                    <div class="text-(--color-text-light)">Effective interest rate:</div>
                    <div class="text-right font-mono">{loanResult.effectiveRate.toFixed(2)}%</div>

                    <div class="text-(--color-text-light)">Year-1 interest:</div>
                    <div class="text-right font-mono">{fmtMoney(loanResult.year1Interest)}</div>

                    <div class="text-(--color-text-light)">Year-1 refund (est):</div>
                    <div class="text-right font-mono text-green-500">{fmtMoney(loanResult.year1Refund)}</div>
                  </div>
                  <p class="text-xs text-(--color-text-light) mt-3">
                    Refund is biggest in early years because interest is front-loaded in the schedule.
                    Actual refund depends on your taxable income, max-deductible cap, and country rules.
                  </p>
                </div>
              {/if}
            </div>
          {/if}
        </section>
      </div>

      {#if loanResult && loanResult.schedule.length > 0 && chartMaxPayment > 0}
        <!-- Payment composition chart -->
        <section class="mt-6 border border-(--color-border) bg-(--color-bg-alt) p-4">
          <h3 class="text-sm font-medium mb-3">
            Payment composition over time
            <span class="text-xs text-(--color-text-light) font-normal">
              · interest (red) vs principal (green)
            </span>
          </h3>
          <svg viewBox="0 0 {CHART_W} {CHART_H + 24}" class="w-full" preserveAspectRatio="none">
            <!-- Stacked bars: principal (bottom) + interest (top) -->
            {#each loanResult.schedule as s, i}
              <rect
                x={i * chartStep}
                y={CHART_H - (s.principal / chartMaxPayment) * CHART_H}
                width={Math.max(chartStep, 0.5)}
                height={(s.principal / chartMaxPayment) * CHART_H}
                fill="#22c55e"
              />
              <rect
                x={i * chartStep}
                y={CHART_H - (s.payment / chartMaxPayment) * CHART_H}
                width={Math.max(chartStep, 0.5)}
                height={(s.interest / chartMaxPayment) * CHART_H}
                fill="#ef4444"
              />
            {/each}
            <!-- X axis: year markers (every 5 years) -->
            {#each Array(Math.ceil(loanResult.schedule.length / 12)) as _, y}
              {#if y % 5 === 0}
                <line
                  x1={y * 12 * chartStep}
                  y1={CHART_H}
                  x2={y * 12 * chartStep}
                  y2={CHART_H + 4}
                  stroke="var(--color-border)"
                />
                <text
                  x={y * 12 * chartStep}
                  y={CHART_H + 16}
                  font-size="10"
                  fill="var(--color-text-light)"
                  text-anchor="middle"
                >Yr {y}</text>
              {/if}
            {/each}
          </svg>
          <div class="grid grid-cols-2 gap-3 text-xs mt-3">
            <div class="flex items-center gap-2">
              <span class="inline-block w-3 h-3 bg-red-500"></span>
              Interest portion (front-loaded for annuity, equal-then-shrinking for linear)
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-block w-3 h-3 bg-green-500"></span>
              Principal portion (grows for annuity, fixed for linear)
            </div>
          </div>
        </section>

        <details class="mt-6 border border-(--color-border) bg-(--color-bg-alt)">
          <summary class="px-4 py-2 cursor-pointer hover:bg-(--color-bg) text-sm">
            Amortization schedule ({loanResult.schedule.length} payments)
          </summary>
          <div class="overflow-auto max-h-96">
            <table class="w-full text-xs font-mono">
              <thead class="sticky top-0 bg-(--color-bg-alt) border-b border-(--color-border)">
                <tr>
                  <th class="px-3 py-2 text-left">Month</th>
                  <th class="px-3 py-2 text-right">Payment</th>
                  <th class="px-3 py-2 text-right">Interest</th>
                  <th class="px-3 py-2 text-right">Principal</th>
                  {#if loanResult.taxEnabled}
                    <th class="px-3 py-2 text-right text-green-500">Refund</th>
                    <th class="px-3 py-2 text-right">Net cost</th>
                  {/if}
                  <th class="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {#each loanResult.schedule as row}
                  {@const refund = row.interest * loanResult.dedRate}
                  <tr class="border-b border-(--color-border)/30 {row.month % 12 === 0 ? 'bg-(--color-bg)/40' : ''}">
                    <td class="px-3 py-1 text-(--color-text-light)">{row.month}</td>
                    <td class="px-3 py-1 text-right">{fmtMoney(row.payment)}</td>
                    <td class="px-3 py-1 text-right">{fmtMoney(row.interest)}</td>
                    <td class="px-3 py-1 text-right">{fmtMoney(row.principal)}</td>
                    {#if loanResult.taxEnabled}
                      <td class="px-3 py-1 text-right text-green-500">{fmtMoney(refund)}</td>
                      <td class="px-3 py-1 text-right">{fmtMoney(row.principal + row.interest - refund)}</td>
                    {/if}
                    <td class="px-3 py-1 text-right">{fmtMoney(row.balance)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </details>
      {/if}

    {:else if tab === "compound"}
      <h2 class="text-xl font-medium mb-4">Compound Interest Calculator</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4 space-y-3">
          <div>
            <label for="ci-p" class="block text-sm mb-1">Initial principal</label>
            <input id="ci-p" type="number" min="0" step="100" bind:value={ciPrincipal}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="ci-r" class="block text-sm mb-1">Annual rate (%)</label>
              <input id="ci-r" type="number" min="0" step="0.1" bind:value={ciRate}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="ci-y" class="block text-sm mb-1">Years</label>
              <input id="ci-y" type="number" min="1" max="100" bind:value={ciYears}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          </div>
          <div>
            <label for="ci-f" class="block text-sm mb-1">Compound frequency / year</label>
            <select id="ci-f" bind:value={ciFreq} class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm">
              <option value={1}>Annually (1)</option>
              <option value={2}>Semi-annually (2)</option>
              <option value={4}>Quarterly (4)</option>
              <option value={12}>Monthly (12)</option>
              <option value={365}>Daily (365)</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="ci-c" class="block text-sm mb-1">Contribution</label>
              <input id="ci-c" type="number" min="0" step="50" bind:value={ciContribution}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="ci-cf" class="block text-sm mb-1">Per</label>
              <select id="ci-cf" bind:value={ciContribFreq} class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm">
                <option value="monthly">Month</option>
                <option value="yearly">Year</option>
              </select>
            </div>
          </div>
        </section>

        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          {#if ciResult}
            <div class="text-sm text-(--color-text-light)">Future value</div>
            <div class="text-3xl font-mono font-bold text-(--color-accent)">{fmtMoney(ciResult.fv)}</div>
            <hr class="border-(--color-border) my-3" />
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-(--color-text-light)">Total contributed:</div><div class="text-right font-mono">{fmtMoney(ciResult.contributed)}</div>
              <div class="text-(--color-text-light)">Interest earned:</div><div class="text-right font-mono text-green-500">{fmtMoney(ciResult.interest)}</div>
              <div class="text-(--color-text-light)">Growth multiplier:</div><div class="text-right font-mono">{(ciResult.fv / Math.max(ciResult.contributed, 1)).toFixed(2)}×</div>
            </div>

            <!-- Visual breakdown bar -->
            <div class="mt-4">
              <div class="text-xs text-(--color-text-light) mb-1">Breakdown</div>
              <div class="flex h-3 rounded overflow-hidden">
                <div class="bg-blue-500" style="width: {(ciResult.contributed / ciResult.fv) * 100}%" title="Contributed"></div>
                <div class="bg-green-500" style="width: {(ciResult.interest / ciResult.fv) * 100}%" title="Interest"></div>
              </div>
              <div class="flex justify-between text-xs text-(--color-text-light) mt-1">
                <span>Contributed</span><span>Interest</span>
              </div>
            </div>
          {/if}
        </section>
      </div>

      {#if ciResult && ciResult.yearly.length > 0}
        <details class="mt-6 border border-(--color-border) bg-(--color-bg-alt)">
          <summary class="px-4 py-2 cursor-pointer hover:bg-(--color-bg) text-sm">Year-by-year breakdown</summary>
          <div class="overflow-auto max-h-96">
            <table class="w-full text-xs font-mono">
              <thead class="sticky top-0 bg-(--color-bg-alt) border-b border-(--color-border)">
                <tr>
                  <th class="px-3 py-2 text-left">Year</th>
                  <th class="px-3 py-2 text-right">Balance</th>
                  <th class="px-3 py-2 text-right">Contributed</th>
                  <th class="px-3 py-2 text-right">Interest earned</th>
                </tr>
              </thead>
              <tbody>
                {#each ciResult.yearly as y}
                  <tr class="border-b border-(--color-border)/30">
                    <td class="px-3 py-1 text-(--color-text-light)">{y.year}</td>
                    <td class="px-3 py-1 text-right">{fmtMoney(y.balance)}</td>
                    <td class="px-3 py-1 text-right">{fmtMoney(y.contributed)}</td>
                    <td class="px-3 py-1 text-right text-green-500">{fmtMoney(y.interest)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </details>
      {/if}

    {:else if tab === "savings"}
      <h2 class="text-xl font-medium mb-4">Savings Goal Calculator</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4 space-y-3">
          <div>
            <label for="g-tgt" class="block text-sm mb-1">Goal amount</label>
            <input id="g-tgt" type="number" min="0" step="100" bind:value={goalTarget}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div>
            <label for="g-cur" class="block text-sm mb-1">Current savings</label>
            <input id="g-cur" type="number" min="0" step="100" bind:value={goalCurrent}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="g-r" class="block text-sm mb-1">Annual rate (%)</label>
              <input id="g-r" type="number" min="0" step="0.1" bind:value={goalRate}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="g-y" class="block text-sm mb-1">Years</label>
              <input id="g-y" type="number" min="1" max="100" bind:value={goalYears}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          </div>
        </section>

        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          {#if savingsResult}
            <div class="text-sm text-(--color-text-light)">You need to save monthly</div>
            <div class="text-3xl font-mono font-bold text-(--color-accent)">{fmtMoney(savingsResult.monthlyNeeded)}</div>
            <hr class="border-(--color-border) my-3" />
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-(--color-text-light)">Current grows to:</div><div class="text-right font-mono">{fmtMoney(savingsResult.fvFromPV)}</div>
              <div class="text-(--color-text-light)">Gap to fill:</div><div class="text-right font-mono">{fmtMoney(savingsResult.remaining)}</div>
              <div class="text-(--color-text-light)">Per year:</div><div class="text-right font-mono">{fmtMoney(savingsResult.monthlyNeeded * 12)}</div>
            </div>
          {/if}
        </section>
      </div>

    {:else if tab === "roi"}
      <h2 class="text-xl font-medium mb-4">ROI Calculator</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4 space-y-3">
          <div>
            <label for="ro-i" class="block text-sm mb-1">Initial investment</label>
            <input id="ro-i" type="number" min="0" step="100" bind:value={roiInitial}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div>
            <label for="ro-f" class="block text-sm mb-1">Final value</label>
            <input id="ro-f" type="number" min="0" step="100" bind:value={roiFinal}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div>
            <label for="ro-y" class="block text-sm mb-1">Holding period (years)</label>
            <input id="ro-y" type="number" min="0.1" step="0.5" bind:value={roiYears}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
        </section>

        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          {#if roiResult}
            <div class="text-sm text-(--color-text-light)">Total ROI</div>
            <div class="text-3xl font-mono font-bold {roiResult.roiPct >= 0 ? 'text-green-500' : 'text-red-500'}">
              {fmtPct(roiResult.roiPct)}
            </div>
            <hr class="border-(--color-border) my-3" />
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-(--color-text-light)">Total return:</div>
              <div class="text-right font-mono {roiResult.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}">
                {fmtMoney(roiResult.totalReturn)}
              </div>
              <div class="text-(--color-text-light)">Annualized (CAGR):</div>
              <div class="text-right font-mono">{fmtPct(roiResult.annualized)}</div>
            </div>
          {/if}
        </section>
      </div>

    {:else if tab === "retirement"}
      <h2 class="text-xl font-medium mb-4">Retirement Calculator</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="rt-cur" class="block text-sm mb-1">Current age</label>
              <input id="rt-cur" type="number" min="0" max="100" bind:value={retCurrentAge}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="rt-ret" class="block text-sm mb-1">Retire age</label>
              <input id="rt-ret" type="number" min="0" max="100" bind:value={retRetireAge}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          </div>
          <div>
            <label for="rt-sav" class="block text-sm mb-1">Current savings</label>
            <input id="rt-sav" type="number" min="0" step="1000" bind:value={retCurrentSavings}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div>
            <label for="rt-mo" class="block text-sm mb-1">Monthly contribution</label>
            <input id="rt-mo" type="number" min="0" step="50" bind:value={retMonthly}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="rt-r" class="block text-sm mb-1">Expected return (%)</label>
              <input id="rt-r" type="number" min="0" step="0.1" bind:value={retRate}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="rt-w" class="block text-sm mb-1">Withdrawal rate (%)</label>
              <input id="rt-w" type="number" min="0" step="0.5" bind:value={retWithdrawalRate}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          </div>
        </section>

        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          {#if retResult}
            <div class="text-sm text-(--color-text-light)">Nest egg at age {retRetireAge}</div>
            <div class="text-3xl font-mono font-bold text-(--color-accent)">{fmtMoney(retResult.total)}</div>
            <hr class="border-(--color-border) my-3" />
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-(--color-text-light)">Years to grow:</div><div class="text-right font-mono">{retResult.years}</div>
              <div class="text-(--color-text-light)">Annual income at {retWithdrawalRate}%:</div><div class="text-right font-mono text-green-500">{fmtMoney(retResult.annualWithdrawal)}</div>
              <div class="text-(--color-text-light)">Monthly income:</div><div class="text-right font-mono text-green-500">{fmtMoney(retResult.monthlyWithdrawal)}</div>
            </div>
            <p class="text-xs text-(--color-text-light) mt-3">
              Based on the 4% rule (or your custom safe withdrawal rate). Doesn't account for taxes,
              inflation, or Social Security.
            </p>
          {/if}
        </section>
      </div>

    {:else if tab === "salary"}
      <h2 class="text-xl font-medium mb-4">Salary Calculator</h2>
      <p class="text-sm text-(--color-text-light) mb-4">
        Convert between hourly, monthly, and yearly gross, then estimate net pay using
        a configurable progressive tax-bracket schedule. Pick a country preset to start, or
        use <strong>Custom</strong> to define your own brackets.
      </p>

      <!-- Country / preset selector + currency -->
      <section class="border border-(--color-border) bg-(--color-bg-alt) p-4 mb-6">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[260px]">
            <label for="sal-preset" class="block text-sm mb-1">Country / preset</label>
            <select
              id="sal-preset"
              value={salaryPresetId}
              onchange={(e) => applyPreset((e.target as HTMLSelectElement).value)}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm"
            >
              {#each SALARY_PRESETS as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="sal-cur" class="block text-sm mb-1">Currency symbol</label>
            <input id="sal-cur" type="text" maxlength="3" bind:value={salaryCurrency}
              class="w-20 px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono text-center" />
          </div>
        </div>
        {#if activePreset}
          <p class="text-xs text-(--color-text-light) mt-2">{activePreset.notes}</p>
        {/if}
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Inputs -->
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4 space-y-3">
          <!-- Input mode -->
          <div>
            <label for="sal-mode" class="block text-sm mb-1">I know my…</label>
            <div class="grid grid-cols-3 gap-1">
              {#each [
                { id: "hourly", label: "Hourly" },
                { id: "monthly", label: "Monthly" },
                { id: "yearly", label: "Yearly" },
              ] as m}
                <button
                  onclick={() => (salaryInputMode = m.id as SalaryInputMode)}
                  class="px-2 py-2 text-xs border border-(--color-border) {salaryInputMode === m.id
                    ? 'bg-(--color-accent) text-(--color-btn-text)'
                    : 'bg-(--color-bg) hover:bg-(--color-bg-alt)'}"
                >{m.label}</button>
              {/each}
            </div>
          </div>

          {#if salaryInputMode === "hourly"}
            <div>
              <label for="sal-h" class="block text-sm mb-1">Hourly gross ({salaryCurrency})</label>
              <input id="sal-h" type="number" min="0" step="0.5" bind:value={salaryHourly}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          {:else if salaryInputMode === "monthly"}
            <div>
              <label for="sal-m" class="block text-sm mb-1">Monthly gross ({salaryCurrency}) — excl. holiday allowance</label>
              <input id="sal-m" type="number" min="0" step="50" bind:value={salaryMonthly}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          {:else}
            <div>
              <label for="sal-y" class="block text-sm mb-1">Yearly gross ({salaryCurrency}) — excl. holiday allowance</label>
              <input id="sal-y" type="number" min="0" step="500" bind:value={salaryYearly}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
          {/if}

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label for="sal-hpw" class="block text-sm mb-1">Hours / week</label>
              <input id="sal-hpw" type="number" min="0" max="80" step="0.5" bind:value={salaryHoursPerWeek}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="sal-wpy" class="block text-sm mb-1">Weeks / year</label>
              <input id="sal-wpy" type="number" min="1" max="52" step="1" bind:value={salaryWeeksPerYear}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            </div>
            <div>
              <label for="sal-mpy" class="block text-sm mb-1">Months / year</label>
              <input id="sal-mpy" type="number" min="1" max="14" step="1" bind:value={salaryMonthsPerYear}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
              <p class="text-[10px] text-(--color-text-light) mt-0.5">e.g. PT/IT pay 13–14</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="sal-ha" class="block text-sm mb-1">Holiday allowance %</label>
              <input id="sal-ha" type="number" min="0" max="50" step="0.5" bind:value={salaryHolidayAllowance}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
              <p class="text-[10px] text-(--color-text-light) mt-0.5">NL: 8% vakantiegeld</p>
            </div>
            <div>
              <label for="sal-soc" class="block text-sm mb-1">Social contribution %</label>
              <input id="sal-soc" type="number" min="0" max="60" step="0.5" bind:value={salarySocialRate}
                class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
              <p class="text-[10px] text-(--color-text-light) mt-0.5">FICA, NI, SGK, etc.</p>
            </div>
          </div>

          <div>
            <label for="sal-fc" class="block text-sm mb-1">Flat tax credit ({salaryCurrency})</label>
            <input id="sal-fc" type="number" min="0" step="50" bind:value={salaryFlatCredit}
              class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
            <p class="text-[10px] text-(--color-text-light) mt-0.5">Subtracted from tax owed (e.g. simple personal allowance)</p>
          </div>

          <!-- NL credits toggle -->
          <div class="border-t border-(--color-border) pt-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={salaryUseNlCredits} class="accent-(--color-accent)" />
              <span class="text-sm">Apply NL dynamic credits (algemene heffingskorting + arbeidskorting)</span>
            </label>
            <p class="text-xs text-(--color-text-light) mt-1">
              Auto-enabled for the NL presets. Income-dependent tax credits computed per the 2024 NL formulas.
            </p>
          </div>

          <!-- 30% ruling -->
          <div class="border-t border-(--color-border) pt-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={salary30Ruling} class="accent-(--color-accent)" />
              <span class="text-sm font-medium">Apply 30% ruling-style expat tax break</span>
            </label>
            <p class="text-xs text-(--color-text-light) mt-1">
              A configurable percentage of gross is paid tax-free. Originally a Netherlands rule, but you can apply it
              to any country if your local tax law has an analogue.
            </p>
            {#if salary30Ruling}
              <div class="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label for="sal-30p" class="block text-xs text-(--color-text-light) mb-1">Tax-free %</label>
                  <input id="sal-30p" type="number" min="0" max="100" step="1" bind:value={salary30Pct}
                    class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
                </div>
                <div>
                  <label for="sal-30y" class="block text-xs text-(--color-text-light) mb-1">Start year</label>
                  <input id="sal-30y" type="number" min="2000" max="2050" step="1" bind:value={salary30StartYear}
                    class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-sm font-mono" />
                </div>
              </div>
              <label class="flex items-center gap-2 cursor-pointer mt-2">
                <input type="checkbox" bind:checked={salary30Phasing} class="accent-(--color-accent)" />
                <span class="text-xs">Apply NL phasing (drops by 10pp every 2 years, expires after 5)</span>
              </label>
            {/if}
          </div>
        </section>

        <!-- Results -->
        <section class="border border-(--color-border) bg-(--color-bg-alt) p-4">
          {#if salaryResult}
            <div class="text-sm text-(--color-text-light)">Net monthly (excl. holiday lump)</div>
            <div class="text-3xl font-mono font-bold text-(--color-accent)">
              {fmtMoney(salaryResult.netMonthlyExHoliday, salaryResult.currency)}
            </div>
            <div class="text-sm text-(--color-text-light) mt-1">
              Net yearly: <span class="font-mono text-(--color-text)">{fmtMoney(salaryResult.netAnnual, salaryResult.currency)}</span>
            </div>

            <hr class="border-(--color-border) my-3" />

            <h4 class="text-sm font-medium mb-2">Gross side</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-(--color-text-light)">Annual gross:</div>
              <div class="text-right font-mono">{fmtMoney(salaryResult.gross, salaryResult.currency)}</div>
              {#if salaryResult.holiday > 0}
                <div class="text-(--color-text-light)">+ Holiday allowance ({salaryHolidayAllowance}%):</div>
                <div class="text-right font-mono">{fmtMoney(salaryResult.holiday, salaryResult.currency)}</div>
              {/if}
              <div class="text-(--color-text-light) font-medium">Total gross:</div>
              <div class="text-right font-mono font-medium">{fmtMoney(salaryResult.totalGross, salaryResult.currency)}</div>
              <div class="text-(--color-text-light)">Gross hourly:</div>
              <div class="text-right font-mono">{fmtMoney(salaryResult.grossHourly, salaryResult.currency)}</div>
              <div class="text-(--color-text-light)">Hours/year:</div>
              <div class="text-right font-mono">{salaryResult.hpy}</div>
            </div>

            {#if salaryResult.taxFreeRuling > 0}
              <div class="mt-3 border border-blue-500/30 bg-blue-500/5 p-2 rounded text-sm">
                <div class="font-medium text-blue-400">Expat tax-free ruling applied</div>
                <div class="text-xs text-(--color-text-light) mb-1">{salaryResult.rulingPhase}</div>
                <div class="grid grid-cols-2 gap-2">
                  <div class="text-(--color-text-light)">Tax-free portion:</div>
                  <div class="text-right font-mono text-blue-400">{fmtMoney(salaryResult.taxFreeRuling, salaryResult.currency)}</div>
                  <div class="text-(--color-text-light)">Taxable income:</div>
                  <div class="text-right font-mono">{fmtMoney(salaryResult.taxable, salaryResult.currency)}</div>
                </div>
              </div>
            {/if}

            <hr class="border-(--color-border) my-3" />

            <h4 class="text-sm font-medium mb-2">Tax & credits</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-(--color-text-light)">Income tax (gross):</div>
              <div class="text-right font-mono text-red-400">{fmtMoney(salaryResult.incomeTax, salaryResult.currency)}</div>
              {#if salaryResult.generalCredit > 0}
                <div class="text-(--color-text-light)">− Algemene heffingskorting:</div>
                <div class="text-right font-mono text-green-500">{fmtMoney(salaryResult.generalCredit, salaryResult.currency)}</div>
              {/if}
              {#if salaryResult.laborCredit > 0}
                <div class="text-(--color-text-light)">− Arbeidskorting:</div>
                <div class="text-right font-mono text-green-500">{fmtMoney(salaryResult.laborCredit, salaryResult.currency)}</div>
              {/if}
              {#if salaryResult.flatCredit > 0}
                <div class="text-(--color-text-light)">− Flat tax credit:</div>
                <div class="text-right font-mono text-green-500">{fmtMoney(salaryResult.flatCredit, salaryResult.currency)}</div>
              {/if}
              <div class="text-(--color-text-light)">Income tax owed:</div>
              <div class="text-right font-mono text-red-400">{fmtMoney(salaryResult.netIncomeTax, salaryResult.currency)}</div>
              {#if salaryResult.socialContribution > 0}
                <div class="text-(--color-text-light)">+ Social contribution ({salaryResult.socialRate}%):</div>
                <div class="text-right font-mono text-red-400">{fmtMoney(salaryResult.socialContribution, salaryResult.currency)}</div>
              {/if}
              <div class="text-(--color-text-light) font-medium">Total deductions:</div>
              <div class="text-right font-mono font-medium text-red-400">{fmtMoney(salaryResult.netTax, salaryResult.currency)}</div>
            </div>

            <hr class="border-(--color-border) my-3" />

            <h4 class="text-sm font-medium mb-2">Net side</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="text-(--color-text-light)">Net yearly (incl. holiday):</div>
              <div class="text-right font-mono text-green-500">{fmtMoney(salaryResult.netAnnual, salaryResult.currency)}</div>
              <div class="text-(--color-text-light)">Net monthly ({salaryResult.monthsPerYear}× incl. share of holiday):</div>
              <div class="text-right font-mono">{fmtMoney(salaryResult.netMonthly, salaryResult.currency)}</div>
              <div class="text-(--color-text-light)">Net monthly (excl. holiday lump):</div>
              <div class="text-right font-mono">{fmtMoney(salaryResult.netMonthlyExHoliday, salaryResult.currency)}</div>
              {#if salaryResult.holiday > 0}
                <div class="text-(--color-text-light)">Net holiday payout:</div>
                <div class="text-right font-mono">{fmtMoney(salaryResult.netHoliday, salaryResult.currency)}</div>
              {/if}
              <div class="text-(--color-text-light)">Net hourly:</div>
              <div class="text-right font-mono">{fmtMoney(salaryResult.netHourly, salaryResult.currency)}</div>
              <div class="text-(--color-text-light)">Effective tax rate:</div>
              <div class="text-right font-mono">{salaryResult.effectiveRate.toFixed(2)}%</div>
              <div class="text-(--color-text-light)">Marginal bracket:</div>
              <div class="text-right font-mono">{salaryResult.marginalRate.toFixed(2)}%</div>
            </div>
          {/if}
        </section>
      </div>

      <!-- Editable bracket table -->
      <section class="mt-6 border border-(--color-border) bg-(--color-bg-alt) p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium">Tax brackets ({activePreset?.name ?? "custom"})</h3>
          <button onclick={addBracket} class="px-3 py-1 text-xs border border-(--color-border) hover:bg-(--color-bg)">+ Add bracket</button>
        </div>
        <table class="w-full text-sm">
          <thead class="border-b border-(--color-border) text-xs text-(--color-text-light)">
            <tr>
              <th class="px-2 py-2 text-left">Income up to ({salaryCurrency})</th>
              <th class="px-2 py-2 text-left">Rate (%)</th>
              {#if salaryResult}
                <th class="px-2 py-2 text-right">Income in this bracket</th>
                <th class="px-2 py-2 text-right">Tax owed</th>
              {/if}
              <th class="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {#each salaryBrackets as b, i}
              <tr class="border-b border-(--color-border)/30">
                <td class="px-2 py-1">
                  {#if b.upTo === Infinity}
                    <span class="text-xs text-(--color-text-light) italic">and above</span>
                  {:else}
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={b.upTo}
                      oninput={(e) => {
                        const v = parseFloat((e.target as HTMLInputElement).value);
                        salaryBrackets[i].upTo = Number.isFinite(v) ? v : 0;
                        salaryBrackets = [...salaryBrackets];
                      }}
                      class="w-32 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-sm font-mono"
                    />
                  {/if}
                </td>
                <td class="px-2 py-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={(b.rate * 100).toFixed(2)}
                    oninput={(e) => {
                      const v = parseFloat((e.target as HTMLInputElement).value);
                      salaryBrackets[i].rate = Number.isFinite(v) ? v / 100 : 0;
                      salaryBrackets = [...salaryBrackets];
                    }}
                    class="w-24 px-2 py-1 bg-(--color-bg) border border-(--color-border) text-sm font-mono"
                  />
                </td>
                {#if salaryResult}
                  {@const usedAmount = salaryResult.brackets[i]?.amount ?? 0}
                  {@const usedTax = salaryResult.brackets[i]?.tax ?? 0}
                  <td class="px-2 py-1 text-right font-mono text-xs">{fmtMoney(usedAmount, salaryCurrency)}</td>
                  <td class="px-2 py-1 text-right font-mono text-xs text-red-400">{fmtMoney(usedTax, salaryCurrency)}</td>
                {/if}
                <td class="px-2 py-1 text-right">
                  {#if salaryBrackets.length > 1}
                    <button onclick={() => removeBracket(i)} class="text-red-500 hover:text-red-400 text-xs" title="Remove bracket">✕</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="text-xs text-(--color-text-light) mt-3">
          Edit brackets above to model your local tax schedule. The last bracket should normally extend to infinity.
          All numbers are approximations for orientation — verify with your local tax authority for exact figures.
        </p>
      </section>
    {/if}

    <p class="text-xs text-(--color-text-light) mt-8">
      Calculations are for informational purposes only and don't constitute financial advice.
      Real-world loans/investments include taxes, fees, and other factors not modeled here.
    </p>
  </div>
</div>
