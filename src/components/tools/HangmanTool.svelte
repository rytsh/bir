<script lang="ts">
  import { random } from "../../lib/random";

  type Language = "en" | "tr" | "nl" | "de" | "fr" | "es" | "it";
  type Mode = "random" | "custom";
  type GameStatus = "idle" | "playing" | "won" | "lost";

  interface GameRecord {
    word: string;
    won: boolean;
    wrong: number;
  }

  interface LanguageConfig {
    label: string;
    locale: string;
    alphabet: string[];
    words: Record<string, string[]>;
  }

  const MAX_WRONG = 6;

  const LATIN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const LANGUAGES: Record<Language, LanguageConfig> = {
    en: {
      label: "English",
      locale: "en-US",
      alphabet: LATIN_ALPHABET,
      words: {
        Animals: ["ELEPHANT", "GIRAFFE", "PENGUIN", "KANGAROO", "DOLPHIN", "CROCODILE", "BUTTERFLY", "SQUIRREL", "OCTOPUS", "CHEETAH", "HEDGEHOG", "FLAMINGO", "RHINOCEROS", "PELICAN", "LOBSTER"],
        Food: ["PIZZA", "SPAGHETTI", "AVOCADO", "PANCAKE", "BROCCOLI", "PINEAPPLE", "CHOCOLATE", "SANDWICH", "CROISSANT", "BURRITO", "PRETZEL", "MUSHROOM", "WATERMELON", "LASAGNA", "DUMPLING"],
        Countries: ["BRAZIL", "CANADA", "JAPAN", "AUSTRALIA", "ARGENTINA", "PORTUGAL", "NORWAY", "EGYPT", "MEXICO", "INDONESIA", "SWITZERLAND", "MOROCCO", "ICELAND", "VIETNAM", "GREECE"],
        Tech: ["KEYBOARD", "JAVASCRIPT", "DATABASE", "ALGORITHM", "COMPILER", "FIREWALL", "KUBERNETES", "TERMINAL", "BROWSER", "FUNCTION", "VARIABLE", "PROTOCOL", "ENCRYPTION", "BANDWIDTH", "DEBUGGER"],
        Movies: ["INCEPTION", "TITANIC", "GLADIATOR", "AVATAR", "JOKER", "INTERSTELLAR", "MATRIX", "FROZEN", "PARASITE", "ROCKY", "JAWS", "ALIEN", "CASABLANCA", "SHREK", "PSYCHO"],
      },
    },
    tr: {
      label: "Türkçe",
      locale: "tr-TR",
      alphabet: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split(""),
      words: {
        Hayvanlar: ["FİL", "ZÜRAFA", "PENGUEN", "KANGURU", "YUNUS", "TİMSAH", "KELEBEK", "SİNCAP", "AHTAPOT", "ÇİTA", "KİRPİ", "FLAMİNGO", "GERGEDAN", "PELİKAN", "ISTAKOZ", "KAPLUMBAĞA", "ÖRÜMCEK", "BAYKUŞ"],
        Yiyecekler: ["LAHMACUN", "BAKLAVA", "MANTI", "KÖFTE", "DOLMA", "BÖREK", "SİMİT", "İSKENDER", "KÜNEFE", "MENEMEN", "PİDE", "AŞURE", "GÖZLEME", "KOKOREÇ", "ÇİĞKÖFTE"],
        Ülkeler: ["BREZİLYA", "KANADA", "JAPONYA", "AVUSTRALYA", "ARJANTİN", "PORTEKİZ", "NORVEÇ", "MISIR", "MEKSİKA", "ENDONEZYA", "İSVİÇRE", "FAS", "İZLANDA", "VİETNAM", "YUNANİSTAN"],
        Şehirler: ["İSTANBUL", "ANKARA", "İZMİR", "BURSA", "ANTALYA", "TRABZON", "ESKİŞEHİR", "GAZİANTEP", "DİYARBAKIR", "ÇANAKKALE", "MUĞLA", "ŞANLIURFA", "KAYSERİ", "EDİRNE", "MARDİN"],
        Teknoloji: ["KLAVYE", "BİLGİSAYAR", "VERİTABANI", "ALGORİTMA", "DERLEYİCİ", "TARAYICI", "FONKSİYON", "DEĞİŞKEN", "ŞİFRELEME", "SUNUCU", "YAZILIM", "DONANIM", "İŞLEMCİ", "EKRAN", "AĞ"],
      },
    },
    nl: {
      label: "Nederlands",
      locale: "nl-NL",
      alphabet: LATIN_ALPHABET,
      words: {
        Dieren: ["OLIFANT", "GIRAF", "PINGUIN", "KANGOEROE", "DOLFIJN", "KROKODIL", "VLINDER", "EEKHOORN", "OCTOPUS", "EGEL", "FLAMINGO", "NEUSHOORN", "PELIKAAN", "KREEFT", "SCHILDPAD", "KONIJN", "SPIN", "UIL"],
        Eten: ["STROOPWAFEL", "POFFERTJES", "BITTERBAL", "KROKET", "HAGELSLAG", "DROP", "OLIEBOL", "HUTSPOT", "ERWTENSOEP", "PANNENKOEK", "KAAS", "HARING", "FRIKANDEL", "APPELTAART", "SPECULAAS", "STAMPPOT", "BOERENKOOL"],
        Landen: ["DUITSLAND", "FRANKRIJK", "SPANJE", "NOORWEGEN", "ZWEDEN", "ENGELAND", "PORTUGAL", "GRIEKENLAND", "MEXICO", "EGYPTE", "MAROKKO", "IJSLAND", "TURKIJE", "ZWITSERLAND", "OOSTENRIJK", "CANADA", "JAPAN"],
        Steden: ["AMSTERDAM", "ROTTERDAM", "UTRECHT", "EINDHOVEN", "GRONINGEN", "MAASTRICHT", "LEIDEN", "HAARLEM", "DELFT", "NIJMEGEN", "ARNHEM", "ZWOLLE", "BREDA", "TILBURG", "ALKMAAR", "GOUDA"],
        Techniek: ["TOETSENBORD", "COMPUTER", "DATABANK", "ALGORITME", "BROWSER", "FUNCTIE", "VARIABELE", "VERSLEUTELING", "SERVER", "SOFTWARE", "HARDWARE", "PROCESSOR", "BEELDSCHERM", "NETWERK", "MUIS"],
      },
    },
    de: {
      label: "Deutsch",
      locale: "de-DE",
      alphabet: [...LATIN_ALPHABET, "Ä", "Ö", "Ü", "ß"],
      words: {
        Tiere: ["ELEFANT", "GIRAFFE", "PINGUIN", "KÄNGURU", "DELFIN", "KROKODIL", "SCHMETTERLING", "EICHHÖRNCHEN", "KRAKE", "IGEL", "NASHORN", "SCHILDKRÖTE", "KANINCHEN", "SPINNE", "EULE", "BÄR", "FUCHS", "LÖWE"],
        Essen: ["BREZEL", "SAUERKRAUT", "BRATWURST", "SCHNITZEL", "STRUDEL", "SPÄTZLE", "KNÖDEL", "LEBKUCHEN", "KARTOFFELSALAT", "CURRYWURST", "STOLLEN", "MAULTASCHEN", "SCHWARZWÄLDER", "PFANNKUCHEN", "KÄSE", "GRÜNKOHL"],
        Länder: ["FRANKREICH", "SPANIEN", "NORWEGEN", "SCHWEDEN", "ENGLAND", "PORTUGAL", "GRIECHENLAND", "MEXIKO", "ÄGYPTEN", "MAROKKO", "ISLAND", "TÜRKEI", "SCHWEIZ", "ÖSTERREICH", "KANADA", "JAPAN", "DÄNEMARK"],
        Städte: ["BERLIN", "HAMBURG", "MÜNCHEN", "KÖLN", "FRANKFURT", "STUTTGART", "DÜSSELDORF", "LEIPZIG", "DRESDEN", "HANNOVER", "NÜRNBERG", "BREMEN", "HEIDELBERG", "FREIBURG", "LÜBECK", "GÖTTINGEN"],
        Technik: ["TASTATUR", "COMPUTER", "DATENBANK", "ALGORITHMUS", "BROWSER", "FUNKTION", "VARIABLE", "VERSCHLÜSSELUNG", "SERVER", "SOFTWARE", "PROZESSOR", "BILDSCHIRM", "NETZWERK", "SCHNITTSTELLE", "SPEICHER", "MAUS"],
      },
    },
    fr: {
      label: "Français",
      locale: "fr-FR",
      alphabet: LATIN_ALPHABET,
      words: {
        Animaux: ["ELEPHANT", "GIRAFE", "PINGOUIN", "KANGOUROU", "DAUPHIN", "CROCODILE", "PAPILLON", "ECUREUIL", "PIEUVRE", "HERISSON", "RHINOCEROS", "TORTUE", "LAPIN", "ARAIGNEE", "HIBOU", "RENARD", "LION", "GRENOUILLE"],
        Cuisine: ["CROISSANT", "BAGUETTE", "FROMAGE", "RATATOUILLE", "CREPE", "MACARON", "QUICHE", "BOUILLABAISSE", "CASSOULET", "CROQUEMONSIEUR", "ESCARGOT", "TARTIFLETTE", "BRIOCHE", "MADELEINE", "FONDUE", "CHOUCROUTE"],
        Pays: ["ALLEMAGNE", "ESPAGNE", "NORVEGE", "SUEDE", "ANGLETERRE", "PORTUGAL", "GRECE", "MEXIQUE", "EGYPTE", "MAROC", "ISLANDE", "TURQUIE", "SUISSE", "AUTRICHE", "CANADA", "JAPON", "BELGIQUE"],
        Villes: ["PARIS", "MARSEILLE", "LYON", "TOULOUSE", "NICE", "NANTES", "STRASBOURG", "MONTPELLIER", "BORDEAUX", "LILLE", "RENNES", "REIMS", "GRENOBLE", "DIJON", "AVIGNON", "CANNES"],
        Technologie: ["CLAVIER", "ORDINATEUR", "ALGORITHME", "NAVIGATEUR", "FONCTION", "VARIABLE", "CHIFFREMENT", "SERVEUR", "LOGICIEL", "MATERIEL", "PROCESSEUR", "ECRAN", "RESEAU", "SOURIS", "COMPILATEUR"],
      },
    },
    es: {
      label: "Español",
      locale: "es-ES",
      alphabet: [...LATIN_ALPHABET.slice(0, 14), "Ñ", ...LATIN_ALPHABET.slice(14)],
      words: {
        Animales: ["ELEFANTE", "JIRAFA", "PINGUINO", "CANGURO", "DELFIN", "COCODRILO", "MARIPOSA", "ARDILLA", "PULPO", "ERIZO", "RINOCERONTE", "TORTUGA", "CONEJO", "ARAÑA", "BUHO", "ZORRO", "LEON", "CIGUEÑA"],
        Comida: ["PAELLA", "TORTILLA", "GAZPACHO", "CHURROS", "TAPAS", "EMPANADA", "CHORIZO", "JAMON", "CROQUETAS", "TACOS", "GUACAMOLE", "BURRITO", "ENCHILADA", "FLAN", "TURRON", "PIÑA"],
        Países: ["ALEMANIA", "FRANCIA", "NORUEGA", "SUECIA", "INGLATERRA", "PORTUGAL", "GRECIA", "MEXICO", "EGIPTO", "MARRUECOS", "ISLANDIA", "TURQUIA", "SUIZA", "ARGENTINA", "COLOMBIA", "JAPON", "ESPAÑA"],
        Ciudades: ["MADRID", "BARCELONA", "VALENCIA", "SEVILLA", "ZARAGOZA", "MALAGA", "BILBAO", "GRANADA", "TOLEDO", "SALAMANCA", "CORDOBA", "ALICANTE", "LOGROÑO", "CADIZ", "PAMPLONA", "SEGOVIA"],
        Tecnología: ["TECLADO", "ORDENADOR", "ALGORITMO", "NAVEGADOR", "FUNCION", "VARIABLE", "CIFRADO", "SERVIDOR", "PROGRAMA", "PROCESADOR", "PANTALLA", "RED", "RATON", "COMPILADOR", "CONTRASEÑA"],
      },
    },
    it: {
      label: "Italiano",
      locale: "it-IT",
      alphabet: LATIN_ALPHABET,
      words: {
        Animali: ["ELEFANTE", "GIRAFFA", "PINGUINO", "CANGURO", "DELFINO", "COCCODRILLO", "FARFALLA", "SCOIATTOLO", "POLPO", "RICCIO", "RINOCERONTE", "TARTARUGA", "CONIGLIO", "RAGNO", "GUFO", "VOLPE", "LEONE", "CICOGNA"],
        Cibo: ["PIZZA", "SPAGHETTI", "LASAGNA", "RISOTTO", "TIRAMISU", "GELATO", "CANNOLI", "BRUSCHETTA", "FOCACCIA", "GNOCCHI", "RAVIOLI", "PANETTONE", "MOZZARELLA", "PROSCIUTTO", "ARANCINI", "CARBONARA"],
        Paesi: ["GERMANIA", "FRANCIA", "SPAGNA", "NORVEGIA", "SVEZIA", "INGHILTERRA", "PORTOGALLO", "GRECIA", "MESSICO", "EGITTO", "MAROCCO", "ISLANDA", "TURCHIA", "SVIZZERA", "AUSTRIA", "CANADA", "GIAPPONE"],
        Città: ["ROMA", "MILANO", "NAPOLI", "TORINO", "PALERMO", "GENOVA", "BOLOGNA", "FIRENZE", "VENEZIA", "VERONA", "PISA", "SIENA", "BERGAMO", "PARMA", "TRIESTE", "PERUGIA"],
        Tecnologia: ["TASTIERA", "COMPUTER", "ALGORITMO", "BROWSER", "FUNZIONE", "VARIABILE", "CRITTOGRAFIA", "SERVER", "SOFTWARE", "HARDWARE", "PROCESSORE", "SCHERMO", "RETE", "MOUSE", "COMPILATORE"],
      },
    },
  };

  const LANGUAGE_CODES = Object.keys(LANGUAGES) as Language[];

  let language = $state<Language>("en");
  let mode = $state<Mode>("random");
  let category = $state<string>("All");
  let customWord = $state("");
  let customHint = $state("");
  let showCustomWord = $state(false);

  let word = $state("");
  let hint = $state("");
  let guessed = $state<string[]>([]);
  let status = $state<GameStatus>("idle");
  let history = $state<GameRecord[]>([]);
  let isFullscreen = $state(false);

  let langConfig = $derived(LANGUAGES[language]);
  let alphabet = $derived(langConfig.alphabet);
  let categories = $derived(["All", ...Object.keys(langConfig.words)]);
  let wordLetters = $derived(word.split(""));
  let wrongGuesses = $derived(guessed.filter((l) => !word.includes(l)));
  let wrongCount = $derived(wrongGuesses.length);
  let livesLeft = $derived(MAX_WRONG - wrongCount);
  let wins = $derived(history.filter((h) => h.won).length);
  let losses = $derived(history.length - wins);
  let streak = $derived.by(() => {
    let count = 0;
    for (const h of history) {
      if (!h.won) break;
      count++;
    }
    return count;
  });

  const toUpper = (s: string): string =>
    Array.from(s)
      .map((raw) => {
        // Keep ß as-is: its uppercase form is "SS", and capital ẞ maps back to ß
        const ch = raw === "ẞ" ? "ß" : raw;
        if (alphabet.includes(ch)) return ch;
        const upper = ch.toLocaleUpperCase(langConfig.locale);
        if (alphabet.includes(upper)) return upper;
        // Letters not in this language's alphabet fall back to their base letter (É -> E)
        const stripped = upper.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
        return alphabet.includes(stripped) ? stripped : upper;
      })
      .join("");

  const isLetter = (ch: string): boolean => alphabet.includes(ch);

  let customWordNormalized = $derived(toUpper(customWord.trim()).replace(/\s+/g, " "));
  let customWordValid = $derived(
    customWordNormalized.length > 0 && customWordNormalized.split("").some((ch) => isLetter(ch)),
  );

  const pickRandomWord = (): { word: string; hint: string } => {
    const pool: { word: string; hint: string }[] = [];
    for (const [cat, list] of Object.entries(langConfig.words)) {
      if (category !== "All" && category !== cat) continue;
      for (const w of list) pool.push({ word: w, hint: cat });
    }
    return pool[Math.floor(random() * pool.length) % pool.length];
  };

  const startGame = () => {
    if (mode === "custom") {
      if (!customWordValid) return;
      word = customWordNormalized;
      hint = customHint.trim();
      customWord = "";
      customHint = "";
      showCustomWord = false;
    } else {
      const picked = pickRandomWord();
      word = toUpper(picked.word);
      hint = picked.hint;
    }
    guessed = [];
    status = "playing";
  };

  const guess = (letter: string) => {
    if (status !== "playing" || guessed.includes(letter) || !isLetter(letter)) return;
    guessed = [...guessed, letter];

    const solved = word.split("").every((ch) => !isLetter(ch) || guessed.includes(ch));
    const wrong = guessed.filter((l) => !word.includes(l)).length;

    if (solved) {
      status = "won";
      history = [{ word, won: true, wrong }, ...history.slice(0, 49)];
    } else if (wrong >= MAX_WRONG) {
      status = "lost";
      history = [{ word, won: false, wrong }, ...history.slice(0, 49)];
    }
  };

  const giveUp = () => {
    if (status !== "playing") return;
    status = "lost";
    history = [{ word, won: false, wrong: wrongCount }, ...history.slice(0, 49)];
  };

  const setLanguage = (lang: Language) => {
    if (language === lang) return;
    language = lang;
    category = "All";
    if (status === "playing") {
      status = "idle";
      word = "";
      guessed = [];
    }
  };

  const keyState = (letter: string): "unused" | "correct" | "wrong" => {
    if (!guessed.includes(letter)) return "unused";
    return word.includes(letter) ? "correct" : "wrong";
  };

  $effect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Escape" && isFullscreen) {
        isFullscreen = false;
        return;
      }
      if (e.key === "Enter" && status !== "playing" && mode === "random") {
        e.preventDefault();
        startGame();
        return;
      }
      if (e.key.length === 1) {
        const letter = toUpper(e.key);
        if (status === "playing" && isLetter(letter)) {
          e.preventDefault();
          guess(letter);
        }
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  const toggleFullscreen = () => {
    isFullscreen = !isFullscreen;
  };

  const clearHistory = () => {
    history = [];
  };
</script>

{#snippet gallows(size: string)}
  <svg viewBox="0 0 200 220" class={size} aria-label="Hangman drawing, {wrongCount} of {MAX_WRONG} mistakes">
    <g stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none">
      <line x1="20" y1="210" x2="120" y2="210" />
      <line x1="50" y1="210" x2="50" y2="20" />
      <line x1="50" y1="20" x2="140" y2="20" />
      <line x1="50" y1="50" x2="80" y2="20" />
      <line x1="140" y1="20" x2="140" y2="45" />
    </g>
    <g stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none" class={status === "lost" ? "text-red-500" : ""}>
      {#if wrongCount >= 1}<circle cx="140" cy="65" r="20" class="part" />{/if}
      {#if wrongCount >= 2}<line x1="140" y1="85" x2="140" y2="145" class="part" />{/if}
      {#if wrongCount >= 3}<line x1="140" y1="100" x2="115" y2="125" class="part" />{/if}
      {#if wrongCount >= 4}<line x1="140" y1="100" x2="165" y2="125" class="part" />{/if}
      {#if wrongCount >= 5}<line x1="140" y1="145" x2="120" y2="180" class="part" />{/if}
      {#if wrongCount >= 6}<line x1="140" y1="145" x2="160" y2="180" class="part" />{/if}
    </g>
  </svg>
{/snippet}

{#snippet wordDisplay(large: boolean)}
  <div class="flex flex-wrap justify-center gap-x-4 gap-y-3">
    {#each word.split(" ") as part}
      <div class="flex gap-1.5 sm:gap-2">
        {#each part.split("") as ch}
          {#if isLetter(ch)}
            {@const revealed = guessed.includes(ch)}
            <div
              class="flex items-end justify-center border-b-4 border-current font-bold {large ? 'w-10 sm:w-14 h-14 sm:h-20 text-4xl sm:text-6xl' : 'w-7 sm:w-9 h-10 sm:h-12 text-2xl sm:text-3xl'}"
            >
              {#if revealed}
                <span class="letter-pop">{ch}</span>
              {:else if status === "lost"}
                <span class="text-red-500">{ch}</span>
              {/if}
            </div>
          {:else}
            <div class="flex items-end justify-center font-bold {large ? 'w-6 h-14 sm:h-20 text-4xl sm:text-6xl' : 'w-4 h-10 sm:h-12 text-2xl sm:text-3xl'}">
              {ch}
            </div>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet keyboard(large: boolean)}
  <div class="flex flex-wrap justify-center gap-1.5 {large ? 'max-w-3xl' : 'max-w-xl'}">
    {#each alphabet as letter}
      {@const state = keyState(letter)}
      <button
        type="button"
        onclick={() => guess(letter)}
        disabled={status !== "playing" || state !== "unused"}
        class="font-semibold border transition-colors {large ? 'w-12 h-12 text-xl' : 'w-9 h-10 text-sm'}
          {state === 'correct' ? 'bg-green-600 border-green-600 text-white' : ''}
          {state === 'wrong' ? 'bg-red-600/20 border-red-600/40 text-red-500 line-through' : ''}
          {state === 'unused' ? (large ? 'border-white/30 text-white hover:bg-white/10' : 'border-(--color-border) bg-(--color-bg-alt) text-(--color-text) hover:border-(--color-text)') : ''}
          disabled:cursor-not-allowed"
      >
        {letter}
      </button>
    {/each}
  </div>
{/snippet}

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Classic hangman word game. Play with random words, or let one player enter a secret word for others to guess.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-6">
    <!-- Left: Game -->
    <div class="flex-1 flex flex-col items-center min-w-0">
      <div class="w-full flex justify-end mb-2">
        <button
          onclick={toggleFullscreen}
          class="p-2 text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          title="Fullscreen mode"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </div>

      <div class="text-(--color-text)">
        {@render gallows("w-48 h-52")}
      </div>

      {#if status === "idle"}
        <div class="text-lg text-(--color-text-muted) my-8 text-center">
          {mode === "random" ? "Pick a category and press New Game" : "Enter a secret word and press Start"}
        </div>
      {:else}
        <div class="text-sm text-(--color-text-muted) mb-1 h-5">
          {#if hint}Hint: <span class="font-medium text-(--color-text)">{hint}</span>{/if}
        </div>
        <div class="text-xs text-(--color-text-muted) mb-4">
          Lives: {"❤️".repeat(Math.max(livesLeft, 0))}{"🖤".repeat(Math.min(wrongCount, MAX_WRONG))}
        </div>

        <div class="text-(--color-text) mb-6">
          {@render wordDisplay(false)}
        </div>

        <div class="h-12 mb-4 text-center">
          {#if status === "won"}
            <div class="text-3xl font-bold text-green-600 result-pop">You win! 🎉</div>
          {:else if status === "lost"}
            <div class="text-3xl font-bold text-red-500 result-pop">Game over 💀</div>
          {/if}
        </div>

        {@render keyboard(false)}

        {#if status === "playing"}
          <button
            onclick={giveUp}
            class="mt-4 text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Give up & reveal
          </button>
        {/if}
      {/if}
    </div>

    <!-- Right: Settings, Stats, History -->
    <div class="lg:w-72 flex-shrink-0 flex flex-col gap-4">
      <div>
        <div class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">Settings</div>
        <div class="border border-(--color-border) bg-(--color-bg-alt) p-4 flex flex-col gap-3">
          <label class="block">
            <span class="text-xs text-(--color-text-muted)">Language</span>
            <select
              value={language}
              onchange={(e) => setLanguage((e.currentTarget as HTMLSelectElement).value as Language)}
              class="mt-1 w-full px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            >
              {#each LANGUAGE_CODES as code}
                <option value={code}>{LANGUAGES[code].label}</option>
              {/each}
            </select>
          </label>

          <div>
            <div class="text-xs text-(--color-text-muted) mb-1">Mode</div>
            <div class="grid grid-cols-2 border border-(--color-border)">
              <button
                onclick={() => (mode = "random")}
                class="py-1.5 text-sm transition-colors {mode === 'random' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
              >Random word</button>
              <button
                onclick={() => (mode = "custom")}
                class="py-1.5 text-sm transition-colors {mode === 'custom' ? 'bg-(--color-accent) text-(--color-btn-text)' : 'text-(--color-text-muted) hover:text-(--color-text)'}"
              >Secret word</button>
            </div>
          </div>

          {#if mode === "random"}
            <label class="block">
              <span class="text-xs text-(--color-text-muted)">Category</span>
              <select
                bind:value={category}
                class="mt-1 w-full px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
              >
                {#each categories as cat}
                  <option value={cat}>{cat}</option>
                {/each}
              </select>
            </label>
          {:else}
            <label class="block">
              <span class="text-xs text-(--color-text-muted)">Secret word or phrase</span>
              <div class="mt-1 flex">
                <input
                  type={showCustomWord ? "text" : "password"}
                  bind:value={customWord}
                  onkeydown={(e) => { if (e.key === "Enter") startGame(); }}
                  autocomplete="off"
                  placeholder="Don't let them see!"
                  class="flex-1 min-w-0 px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
                />
                <button
                  type="button"
                  onclick={() => (showCustomWord = !showCustomWord)}
                  class="px-2 border border-l-0 border-(--color-border) text-xs text-(--color-text-muted) hover:text-(--color-text)"
                  title={showCustomWord ? "Hide" : "Show"}
                >{showCustomWord ? "Hide" : "Show"}</button>
              </div>
            </label>
            <label class="block">
              <span class="text-xs text-(--color-text-muted)">Hint (optional)</span>
              <input
                type="text"
                bind:value={customHint}
                onkeydown={(e) => { if (e.key === "Enter") startGame(); }}
                autocomplete="off"
                class="mt-1 w-full px-2 py-1.5 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
              />
            </label>
          {/if}

          <button
            onclick={startGame}
            disabled={mode === "custom" && !customWordValid}
            class="w-full py-2 text-sm font-medium bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === "custom" ? "Start" : status === "playing" ? "Skip / New Game" : "New Game"}
          </button>
          <p class="text-xs text-(--color-text-light)">Tip: type letters on your keyboard to guess.</p>
        </div>
      </div>

      <div>
        <div class="text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Statistics ({history.length} game{history.length !== 1 ? "s" : ""})
        </div>
        <div class="border border-(--color-border) bg-(--color-bg-alt) p-4 grid grid-cols-3 text-center">
          <div>
            <div class="text-2xl font-bold text-green-600">{wins}</div>
            <div class="text-xs text-(--color-text-muted)">Wins</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-red-500">{losses}</div>
            <div class="text-xs text-(--color-text-muted)">Losses</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-(--color-text)">{streak}</div>
            <div class="text-xs text-(--color-text-muted)">Streak</div>
          </div>
        </div>
      </div>

      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs tracking-wider text-(--color-text-light) font-medium">History</div>
          {#if history.length > 0}
            <button
              onclick={clearHistory}
              class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
            >Clear</button>
          {/if}
        </div>
        <div class="flex-1 border border-(--color-border) bg-(--color-bg-alt) overflow-y-auto max-h-[240px]">
          {#if history.length === 0}
            <div class="p-4 text-sm text-(--color-text-muted) text-center">No games yet</div>
          {:else}
            <div class="divide-y divide-(--color-border)">
              {#each history as game}
                <div class="px-4 py-2 flex items-center justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <span>{game.won ? "✅" : "❌"}</span>
                    <span class="text-sm font-medium text-(--color-text) truncate">{game.word}</span>
                  </div>
                  <span class="text-xs text-(--color-text-muted) flex-shrink-0">{game.wrong}/{MAX_WRONG}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  {#if isFullscreen}
    <div class="fullscreen-overlay">
      <button
        onclick={toggleFullscreen}
        class="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10"
        aria-label="Close fullscreen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div class="flex flex-col items-center justify-center w-full h-full p-6 overflow-y-auto text-white">
        {@render gallows("w-56 h-60 sm:w-72 sm:h-80")}

        {#if status === "idle"}
          <div class="text-2xl text-white/60 my-8">Start a game to play</div>
        {:else}
          <div class="text-lg text-white/70 mb-2 h-7">
            {#if hint}Hint: <span class="font-semibold text-white">{hint}</span>{/if}
          </div>
          <div class="mb-6">
            {@render wordDisplay(true)}
          </div>
          <div class="h-16 mb-4 text-center">
            {#if status === "won"}
              <div class="text-5xl font-bold text-green-500 result-pop">You win! 🎉</div>
            {:else if status === "lost"}
              <div class="text-5xl font-bold text-red-500 result-pop">Game over 💀</div>
            {/if}
          </div>
          {@render keyboard(true)}
        {/if}

        {#if status !== "playing" && mode === "random"}
          <button
            onclick={startGame}
            class="mt-6 px-6 py-3 text-lg font-medium bg-white text-black hover:bg-white/80 transition-colors"
          >New Game</button>
        {/if}

        <div class="mt-6 text-white/60">
          Wins: {wins} | Losses: {losses} | Streak: {streak}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .part {
    animation: draw 0.35s ease-out;
  }

  @keyframes draw {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .letter-pop {
    animation: result-pop 0.25s ease-out;
  }

  @keyframes result-pop {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .result-pop {
    animation: result-pop 0.4s ease-out;
  }

  .fullscreen-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.95);
    z-index: 50;
    animation: fade-in 0.2s ease-out;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
