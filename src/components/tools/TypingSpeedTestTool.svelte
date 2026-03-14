<script lang="ts">
  const commonWords = [
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
    "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
    "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
    "when", "make", "can", "like", "time", "no", "just", "him", "know", "take",
    "people", "into", "year", "your", "good", "some", "could", "them", "see", "other",
    "than", "then", "now", "look", "only", "come", "its", "over", "think", "also",
    "back", "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us",
    "great", "between", "need", "large", "under", "never", "each", "much", "begin",
    "those", "long", "same", "another", "right", "still", "start", "might", "story",
    "city", "world", "house", "while", "found", "hand", "high", "keep", "place",
    "small", "home", "read", "play", "port", "run", "move", "live", "page",
    "should", "country", "school", "every", "name", "own", "turn", "help",
    "line", "different", "end", "does", "three", "down", "number", "always",
    "point", "part", "before", "change", "went", "being", "through", "off", "many",
    "learn", "water", "called", "life", "light", "write", "state", "old", "set",
    "night", "head", "stand", "group", "open", "thought", "let", "kind",
    "young", "without", "again", "left", "close", "real", "form", "power",
  ];

  const mediumWords = [
    "example", "system", "computer", "program", "function", "process", "network",
    "building", "important", "different", "together", "remember", "possible", "question",
    "business", "develop", "language", "problem", "something", "morning", "government",
    "children", "company", "interest", "provide", "student", "produce", "national",
    "already", "consider", "moment", "position", "political", "economic", "continue",
    "available", "experience", "education", "technology", "community", "management",
    "understand", "environment", "information", "performance", "particular", "individual",
    "significant", "opportunity", "development", "professional", "international", "organization",
    "traditional", "responsibility", "administration", "communication", "relationship",
    "demonstrate", "contemporary", "infrastructure", "implementation", "unfortunately",
  ];

  const codeSnippets = [
    "function add(a, b) { return a + b; }",
    "const result = items.filter(x => x > 0);",
    "for (let i = 0; i < arr.length; i++) {}",
    "if (value !== null && value !== undefined) {}",
    "const { name, age } = user;",
    "export default function App() { return null; }",
    "const [state, setState] = useState(false);",
    "async function fetchData(url) { return await fetch(url); }",
    "class Node { constructor(val) { this.val = val; } }",
    "const map = new Map(); map.set('key', 'value');",
    "try { JSON.parse(data); } catch (e) { console.error(e); }",
    "arr.reduce((sum, n) => sum + n, 0);",
    "Object.keys(obj).forEach(key => console.log(key));",
    "const promise = new Promise((resolve, reject) => {});",
    "document.querySelector('.btn').addEventListener('click', handler);",
  ];

  type Mode = "easy" | "medium" | "code";
  type Duration = 15 | 30 | 60 | 120;
  type TestState = "idle" | "running" | "finished";
  type Tab = "test" | "tutorial";

  let activeTab = $state<Tab>("test");
  let mode = $state<Mode>("easy");
  let duration = $state<Duration>(30);
  let testState = $state<TestState>("idle");
  let targetText = $state("");
  let typedText = $state("");
  let startTime = $state(0);
  let timeLeft = $state(0);
  let timerInterval = $state<ReturnType<typeof setInterval> | null>(null);
  let inputRef = $state<HTMLTextAreaElement | null>(null);
  let wpmHistory = $state<number[]>([]);

  let finalWpm = $state(0);
  let finalAccuracy = $state(0);
  let finalCorrectChars = $state(0);
  let finalTotalChars = $state(0);
  let finalErrors = $state(0);

  // ---- Tutorial state ----
  interface Lesson {
    name: string;
    description: string;
    keys: string;
    words: string[];
  }

  const lessons: Lesson[] = [
    { name: "Home Row", description: "The foundation - keep your fingers on A S D F and J K L ;", keys: "asdfghjkl;", words: ["sad", "ash", "dash", "flash", "glad", "lad", "had", "hall", "fall", "shall", "ask", "flag", "half", "lass", "gash", "jag", "slag", "salad", "flask", "allas"] },
    { name: "Home + E, I", description: "Add index fingers reaching up for E and I", keys: "asdfghjkl;ei", words: ["life", "side", "said", "like", "idea", "is", "his", "kids", "fish", "field", "hill", "fill", "silk", "said", "file", "hike", "slide", "shield", "die", "lie"] },
    { name: "Home + R, U", description: "Index fingers reach up for R and U", keys: "asdfghjkl;eiru", words: ["risk", "fuel", "fair", "ruled", "ridge", "full", "raise", "rural", "rail", "rude", "fruit", "grail", "fire", "lure", "figure", "failure", "shared", "shuffle", "issue", "diffuse"] },
    { name: "Home + T, Y", description: "Index fingers stretch to T and Y", keys: "asdfghjkl;eiruty", words: ["the", "dirty", "study", "ready", "they", "thirty", "yield", "reality", "safety", "style", "strict", "fifty", "already", "yearly", "guilty", "tasty", "sturdy", "dusty", "thirsty", "hasty"] },
    { name: "Top Row", description: "All top row keys: Q W E R T Y U I O P", keys: "qwertyuiopasdfghjkl;", words: ["worth", "power", "quite", "proud", "quote", "their", "poetry", "would", "quiet", "period", "report", "people", "triple", "proper", "profit", "polite", "quarter", "quality", "worship", "surprise"] },
    { name: "Bottom Row", description: "Add Z X C V B N M keys", keys: "qwertyuiopasdfghjkl;zxcvbnm", words: ["black", "above", "cabin", "exact", "given", "climb", "blank", "cover", "magic", "vocal", "mixed", "basic", "novel", "complex", "combine", "maximum", "examine", "balance", "concern", "involve"] },
    { name: "Numbers", description: "Reach up for 1-0 on the number row", keys: "qwertyuiopasdfghjkl;zxcvbnm1234567890", words: ["10x", "2nd", "3rd", "4th", "50k", "100", "256", "1024", "365", "42", "2025", "8pm", "90s", "5km", "3x5", "7zip", "360", "24h", "mp3", "h264"] },
    { name: "Full Keyboard", description: "All keys including punctuation and symbols", keys: "all", words: ["don't", "it's", "e-mail", "self-made", "yes/no", "50%", "hello!", "what?", "key=value", "user@host", "path/to", "price: $9", "2+2=4", "a&b", "x*y", "(test)", "[done]", "{ok}", "c++", "#tag"] },
  ];

  let currentLessonIdx = $state(0);
  let tutorialTarget = $state("");
  let tutorialTyped = $state("");
  let tutorialActive = $state(false);
  let tutorialCorrect = $state(0);
  let tutorialErrors = $state(0);
  let tutorialInputRef = $state<HTMLInputElement | null>(null);
  let lastKeyPressed = $state("");

  const currentLesson = $derived(lessons[currentLessonIdx]);

  // Finger assignment map for keyboard highlighting
  const fingerMap: Record<string, string> = {
    "1": "l-pinky", "q": "l-pinky", "a": "l-pinky", "z": "l-pinky", "`": "l-pinky",
    "2": "l-ring", "w": "l-ring", "s": "l-ring", "x": "l-ring",
    "3": "l-middle", "e": "l-middle", "d": "l-middle", "c": "l-middle",
    "4": "l-index", "r": "l-index", "f": "l-index", "v": "l-index",
    "5": "l-index", "t": "l-index", "g": "l-index", "b": "l-index",
    "6": "r-index", "y": "r-index", "h": "r-index", "n": "r-index",
    "7": "r-index", "u": "r-index", "j": "r-index", "m": "r-index",
    "8": "r-middle", "i": "r-middle", "k": "r-middle", ",": "r-middle",
    "9": "r-ring", "o": "r-ring", "l": "r-ring", ".": "r-ring",
    "0": "r-pinky", "p": "r-pinky", ";": "r-pinky", "/": "r-pinky",
    "-": "r-pinky", "=": "r-pinky", "[": "r-pinky", "]": "r-pinky",
    "'": "r-pinky", "\\": "r-pinky",
  };

  const fingerColors: Record<string, string> = {
    "l-pinky": "#ef4444",
    "l-ring": "#f97316",
    "l-middle": "#eab308",
    "l-index": "#22c55e",
    "r-index": "#06b6d4",
    "r-middle": "#3b82f6",
    "r-ring": "#8b5cf6",
    "r-pinky": "#ec4899",
  };

  const keyboardRows = [
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
    ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
  ];

  function startLesson() {
    const lesson = lessons[currentLessonIdx];
    const words: string[] = [];
    for (let i = 0; i < 20; i++) {
      words.push(lesson.words[Math.floor(Math.random() * lesson.words.length)]);
    }
    tutorialTarget = words.join(" ");
    tutorialTyped = "";
    tutorialCorrect = 0;
    tutorialErrors = 0;
    tutorialActive = true;
    setTimeout(() => tutorialInputRef?.focus(), 50);
  }

  function handleTutorialInput() {
    if (tutorialTyped.length >= tutorialTarget.length) {
      tutorialTyped = tutorialTyped.slice(0, tutorialTarget.length);
      // Count results
      let c = 0;
      let e = 0;
      for (let i = 0; i < tutorialTyped.length; i++) {
        if (tutorialTyped[i] === tutorialTarget[i]) c++;
        else e++;
      }
      tutorialCorrect = c;
      tutorialErrors = e;
      tutorialActive = false;
    }
  }

  const tutorialCharStatuses = $derived.by(() => {
    const result: Array<"correct" | "incorrect" | "pending" | "cursor"> = [];
    for (let i = 0; i < tutorialTarget.length; i++) {
      if (i < tutorialTyped.length) {
        result.push(tutorialTyped[i] === tutorialTarget[i] ? "correct" : "incorrect");
      } else if (i === tutorialTyped.length) {
        result.push("cursor");
      } else {
        result.push("pending");
      }
    }
    return result;
  });

  const nextExpectedKey = $derived.by(() => {
    if (!tutorialActive || tutorialTyped.length >= tutorialTarget.length) return "";
    return tutorialTarget[tutorialTyped.length].toLowerCase();
  });

  function handleTutorialKeydown(e: KeyboardEvent) {
    if (e.key.length === 1) {
      lastKeyPressed = e.key.toLowerCase();
    }
  }

  // ---- Speed test logic ----
  function generateText(m: Mode): string {
    if (m === "code") {
      const shuffled = [...codeSnippets].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, 8).join(" ");
    }
    const wordList = m === "easy" ? commonWords : [...commonWords, ...mediumWords];
    const words: string[] = [];
    for (let i = 0; i < 200; i++) {
      words.push(wordList[Math.floor(Math.random() * wordList.length)]);
    }
    return words.join(" ");
  }

  function startTest() {
    targetText = generateText(mode);
    typedText = "";
    testState = "running";
    timeLeft = duration;
    wpmHistory = [];
    startTime = Date.now();

    timerInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      timeLeft = Math.max(0, duration - Math.floor(elapsed));
      if (elapsed > 0) {
        const correct = countCorrectChars();
        const wpm = Math.round((correct / 5) / (elapsed / 60));
        wpmHistory = [...wpmHistory, wpm];
      }
      if (timeLeft <= 0) {
        finishTest();
      }
    }, 200);

    setTimeout(() => inputRef?.focus(), 50);
  }

  function countCorrectChars(): number {
    let correct = 0;
    const len = Math.min(typedText.length, targetText.length);
    for (let i = 0; i < len; i++) {
      if (typedText[i] === targetText[i]) correct++;
    }
    return correct;
  }

  function finishTest() {
    testState = "finished";
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    const elapsed = (Date.now() - startTime) / 1000;
    const correct = countCorrectChars();
    const total = typedText.length;
    const errors = total - correct;

    finalCorrectChars = correct;
    finalTotalChars = total;
    finalErrors = errors;
    finalWpm = elapsed > 0 ? Math.round((correct / 5) / (elapsed / 60)) : 0;
    finalAccuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  }

  function resetTest() {
    testState = "idle";
    typedText = "";
    targetText = "";
    timeLeft = 0;
    wpmHistory = [];
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  const liveWpm = $derived.by(() => {
    if (testState !== "running" || startTime === 0) return 0;
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed < 1) return 0;
    const correct = countCorrectChars();
    void typedText;
    void timeLeft;
    return Math.round((correct / 5) / (elapsed / 60));
  });

  const liveAccuracy = $derived.by(() => {
    if (typedText.length === 0) return 100;
    const correct = countCorrectChars();
    return Math.round((correct / typedText.length) * 100);
  });

  const charStatuses = $derived.by(() => {
    const result: Array<"correct" | "incorrect" | "pending" | "cursor"> = [];
    for (let i = 0; i < targetText.length; i++) {
      if (i < typedText.length) {
        result.push(typedText[i] === targetText[i] ? "correct" : "incorrect");
      } else if (i === typedText.length) {
        result.push("cursor");
      } else {
        result.push("pending");
      }
    }
    return result;
  });

  function handleInput() {
    if (typedText.length >= targetText.length) {
      typedText = typedText.slice(0, targetText.length);
      finishTest();
    }
  }

  const chartWidth = 400;
  const chartHeight = 80;

  const chartPath = $derived.by(() => {
    if (wpmHistory.length < 2) return "";
    const maxWpm = Math.max(...wpmHistory, 1);
    const step = chartWidth / (wpmHistory.length - 1);
    return wpmHistory
      .map((wpm, i) => {
        const x = i * step;
        const y = chartHeight - (wpm / maxWpm) * (chartHeight - 10);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  });
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Measure your typing speed and accuracy, or learn proper 10-finger touch typing with guided lessons.
    </p>
  </header>

  <!-- Tab bar -->
  <div class="flex-none flex gap-0 border-b border-(--color-border)">
    <button
      onclick={() => { activeTab = "test"; }}
      class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab === 'test'
        ? 'border-(--color-accent) text-(--color-text)'
        : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      Speed Test
    </button>
    <button
      onclick={() => { activeTab = "tutorial"; }}
      class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {activeTab === 'tutorial'
        ? 'border-(--color-accent) text-(--color-text)'
        : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
    >
      10-Finger Tutorial
    </button>
  </div>

  {#if activeTab === "test"}
    <!-- ============ SPEED TEST ============ -->
    {#if testState === "idle"}
      <div class="flex-none flex flex-col gap-4 max-w-lg mx-auto w-full">
        <div class="flex flex-col gap-2">
          <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Mode</label>
          <div class="flex gap-2">
            {#each [["easy", "Easy"], ["medium", "Medium"], ["code", "Code"]] as [val, label]}
              <button
                onclick={() => { mode = val as Mode; }}
                class="flex-1 px-3 py-2 text-sm font-medium transition-colors border {mode === val
                  ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                  : 'bg-(--color-bg-alt) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
              >
                {label}
              </button>
            {/each}
          </div>
          <p class="text-xs text-(--color-text-light)">
            {#if mode === "easy"}Common English words{:else if mode === "medium"}Mixed difficulty words{:else}JavaScript code snippets{/if}
          </p>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Duration</label>
          <div class="flex gap-2">
            {#each [15, 30, 60, 120] as dur}
              <button
                onclick={() => { duration = dur as Duration; }}
                class="flex-1 px-3 py-2 text-sm font-medium transition-colors border {duration === dur
                  ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                  : 'bg-(--color-bg-alt) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
              >
                {dur}s
              </button>
            {/each}
          </div>
        </div>

        <button
          onclick={startTest}
          class="mt-4 px-6 py-3 bg-(--color-accent) text-(--color-btn-text) font-medium text-lg hover:bg-(--color-accent-hover) transition-colors"
        >
          Start Typing Test
        </button>
      </div>

    {:else if testState === "running"}
      <div class="flex-none flex items-center justify-between px-4 py-2 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center gap-6">
          <div class="text-center">
            <div class="text-2xl font-mono font-bold text-(--color-text)">{liveWpm}</div>
            <div class="text-xs text-(--color-text-muted)">WPM</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-bold text-(--color-text)">{liveAccuracy}%</div>
            <div class="text-xs text-(--color-text-muted)">Accuracy</div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-3xl font-mono font-bold {timeLeft <= 5 ? 'text-(--color-error-text)' : 'text-(--color-text)'}">{timeLeft}s</div>
          <button
            onclick={resetTest}
            class="px-3 py-1.5 text-sm bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div class="flex-none px-4 py-4 bg-(--color-bg-alt) border border-(--color-border) font-mono text-lg leading-relaxed max-h-48 overflow-auto select-none">
        {#each targetText.split("") as char, i}
          <span class="{charStatuses[i] === 'correct'
            ? 'text-green-600 dark:text-green-400'
            : charStatuses[i] === 'incorrect'
              ? 'bg-red-200 text-red-700 dark:bg-red-900 dark:text-red-300'
              : charStatuses[i] === 'cursor'
                ? 'border-b-2 border-(--color-accent) text-(--color-text)'
                : 'text-(--color-text-light)'}">{char}</span>
        {/each}
      </div>

      <textarea
        bind:this={inputRef}
        bind:value={typedText}
        oninput={handleInput}
        class="flex-1 px-4 py-3 bg-(--color-bg) border border-(--color-border) font-mono text-lg text-(--color-text) resize-none focus:border-(--color-text-light) outline-none"
        placeholder="Start typing here..."
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
      ></textarea>

    {:else if testState === "finished"}
      <div class="flex-1 flex flex-col gap-6 max-w-lg mx-auto w-full">
        <div class="text-center">
          <div class="text-6xl font-mono font-bold text-(--color-text)">{finalWpm}</div>
          <div class="text-lg text-(--color-text-muted)">Words Per Minute</div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="text-center px-4 py-3 bg-(--color-bg-alt) border border-(--color-border)">
            <div class="text-2xl font-mono font-bold text-(--color-text)">{finalAccuracy}%</div>
            <div class="text-xs text-(--color-text-muted)">Accuracy</div>
          </div>
          <div class="text-center px-4 py-3 bg-(--color-bg-alt) border border-(--color-border)">
            <div class="text-2xl font-mono font-bold text-(--color-text)">{finalCorrectChars}</div>
            <div class="text-xs text-(--color-text-muted)">Correct</div>
          </div>
          <div class="text-center px-4 py-3 bg-(--color-bg-alt) border border-(--color-border)">
            <div class="text-2xl font-mono font-bold text-(--color-error-text)">{finalErrors}</div>
            <div class="text-xs text-(--color-text-muted)">Errors</div>
          </div>
        </div>

        {#if wpmHistory.length > 2}
          <div class="flex flex-col gap-1">
            <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">WPM Over Time</label>
            <div class="px-4 py-3 bg-(--color-bg-alt) border border-(--color-border)">
              <svg viewBox="0 0 {chartWidth} {chartHeight}" class="w-full h-20" preserveAspectRatio="none">
                <path d={chartPath} fill="none" stroke="currentColor" stroke-width="2" class="text-(--color-accent)" />
              </svg>
            </div>
          </div>
        {/if}

        <div class="flex gap-3">
          <button
            onclick={startTest}
            class="flex-1 px-4 py-2.5 bg-(--color-accent) text-(--color-btn-text) font-medium hover:bg-(--color-accent-hover) transition-colors"
          >
            Try Again
          </button>
          <button
            onclick={resetTest}
            class="flex-1 px-4 py-2.5 bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) font-medium hover:text-(--color-text) transition-colors"
          >
            Change Settings
          </button>
        </div>
      </div>
    {/if}

  {:else}
    <!-- ============ TUTORIAL ============ -->
    <div class="flex-1 flex flex-col gap-4 overflow-auto min-h-0">
      <!-- Lesson selector -->
      <div class="flex-none py-2 px-3 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex flex-wrap gap-1.5">
          {#each lessons as lesson, i}
            <button
              onclick={() => { currentLessonIdx = i; tutorialActive = false; tutorialTarget = ""; tutorialTyped = ""; }}
              class="px-2.5 py-1 text-xs font-medium transition-colors border {currentLessonIdx === i
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
            >
              {i + 1}. {lesson.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- Lesson info -->
      <div class="flex-none p-3 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-(--color-text)">{currentLesson.name}</h3>
            <p class="text-xs text-(--color-text-muted) mt-0.5">{currentLesson.description}</p>
          </div>
          <button
            onclick={startLesson}
            class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors shrink-0"
          >
            {tutorialActive ? "Restart" : "Start Lesson"}
          </button>
        </div>
      </div>

      <!-- Keyboard diagram with hands -->
      <div class="flex-none p-3 bg-(--color-bg-alt) border border-(--color-border)">
        <div class="flex flex-col items-center gap-1 relative">
          {#each keyboardRows as row, rowIdx}
            <div class="flex gap-1" style="margin-left: {rowIdx === 1 ? '16px' : rowIdx === 2 ? '24px' : rowIdx === 3 ? '40px' : '0'}">
              {#each row as key}
                {@const finger = fingerMap[key] || ""}
                {@const color = finger ? fingerColors[finger] : ""}
                {@const isNext = key === nextExpectedKey || (nextExpectedKey === " " && key === " ")}
                {@const isPressed = key === lastKeyPressed}
                {@const isHome = ["a","s","d","f","j","k","l",";"].includes(key)}
                <div
                  class="w-8 h-8 flex items-center justify-center text-xs font-mono border transition-all duration-100 relative
                    {isNext ? 'border-2 scale-110 z-10' : 'border'}
                    {isPressed ? 'scale-95' : ''}"
                  style="
                    background: {isNext ? (color || 'var(--color-accent)') : color ? color + '18' : 'var(--color-bg)'};
                    border-color: {isNext ? (color || 'var(--color-accent)') : color ? color + '40' : 'var(--color-border)'};
                    color: {isNext ? '#fff' : 'var(--color-text)'};
                  "
                >
                  {key.toUpperCase()}
                  {#if isHome}
                    <div class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-2 h-0.5" style="background: {color}; opacity: 0.6;"></div>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
          <!-- Space bar -->
          <div class="flex gap-1" style="margin-left: 40px;">
            <div
              class="h-8 flex items-center justify-center text-xs font-mono border transition-all duration-100"
              style="width: 220px;
                background: {nextExpectedKey === ' ' ? 'var(--color-accent)' : 'var(--color-bg)'};
                border-color: {nextExpectedKey === ' ' ? 'var(--color-accent)' : 'var(--color-border)'};
                color: {nextExpectedKey === ' ' ? '#fff' : 'var(--color-text-muted)'};"
            >
              SPACE
            </div>
          </div>

          <!-- Finger legend -->
          <div class="flex flex-wrap gap-3 mt-2 justify-center">
            {#each [["l-pinky", "L Pinky"], ["l-ring", "L Ring"], ["l-middle", "L Mid"], ["l-index", "L Index"]] as [fId, fName]}
              <div class="flex items-center gap-1">
                <div class="w-3 h-3" style="background: {fingerColors[fId]};"></div>
                <span class="text-xs text-(--color-text-muted)">{fName}</span>
              </div>
            {/each}
            <div class="w-px h-4 bg-(--color-border)"></div>
            {#each [["r-index", "R Index"], ["r-middle", "R Mid"], ["r-ring", "R Ring"], ["r-pinky", "R Pinky"]] as [fId, fName]}
              <div class="flex items-center gap-1">
                <div class="w-3 h-3" style="background: {fingerColors[fId]};"></div>
                <span class="text-xs text-(--color-text-muted)">{fName}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Tutorial typing area -->
      {#if tutorialTarget}
        <div class="flex-none px-4 py-3 bg-(--color-bg-alt) border border-(--color-border) font-mono text-base leading-relaxed select-none">
          {#each tutorialTarget.split("") as char, i}
            <span class="{tutorialCharStatuses[i] === 'correct'
              ? 'text-green-600 dark:text-green-400'
              : tutorialCharStatuses[i] === 'incorrect'
                ? 'bg-red-200 text-red-700 dark:bg-red-900 dark:text-red-300'
                : tutorialCharStatuses[i] === 'cursor'
                  ? 'border-b-2 border-(--color-accent) text-(--color-text)'
                  : 'text-(--color-text-light)'}">{char}</span>
          {/each}
        </div>

        {#if tutorialActive}
          <input
            bind:this={tutorialInputRef}
            bind:value={tutorialTyped}
            oninput={handleTutorialInput}
            onkeydown={handleTutorialKeydown}
            class="flex-none px-4 py-3 bg-(--color-bg) border border-(--color-border) font-mono text-base text-(--color-text) focus:border-(--color-text-light) outline-none"
            placeholder="Start typing..."
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
          />
        {:else if tutorialTyped.length > 0}
          <!-- Results -->
          <div class="flex-none flex items-center gap-6 p-3 bg-(--color-bg-alt) border border-(--color-border)">
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted)">Accuracy</span>
              <span class="font-mono font-bold text-(--color-text)">{tutorialTarget.length > 0 ? Math.round((tutorialCorrect / tutorialTarget.length) * 100) : 0}%</span>
            </div>
            <div class="hidden sm:block w-px h-4 bg-(--color-border)"></div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted)">Correct</span>
              <span class="font-mono font-bold text-(--color-text)">{tutorialCorrect}</span>
            </div>
            <div class="hidden sm:block w-px h-4 bg-(--color-border)"></div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-(--color-text-muted)">Errors</span>
              <span class="font-mono font-bold text-(--color-error-text)">{tutorialErrors}</span>
            </div>
            <button
              onclick={startLesson}
              class="ml-auto text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >
              Try Again
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
