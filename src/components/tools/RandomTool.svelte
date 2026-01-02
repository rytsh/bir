<script lang="ts">
  type GenerationType = "words" | "sentences" | "paragraphs";

  // Standard Lorem Ipsum text
  const LOREM_IPSUM_WORDS = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
    "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
    "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
    "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
    "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
    "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
    "deserunt", "mollit", "anim", "id", "est", "laborum", "at", "vero", "eos",
    "accusamus", "iusto", "odio", "dignissimos", "ducimus", "blanditiis",
    "praesentium", "voluptatum", "deleniti", "atque", "corrupti", "quos", "dolores",
    "quas", "molestias", "excepturi", "obcaecati", "cupiditate", "provident",
    "similique", "mollitia", "animi", "ratione", "voluptatem", "sequi", "nesciunt",
    "neque", "porro", "quisquam", "numquam", "eius", "modi", "tempora", "magni",
    "minima", "nostrum", "exercitationem", "ullam", "corporis", "suscipit",
    "laboriosam", "aliquid", "commodi", "consequatur", "autem", "vel", "eum",
    "iure", "quam", "nihil", "impedit", "quo", "minus", "quod", "maxime", "placeat",
    "facere", "possimus", "omnis", "voluptas", "assumenda", "repellendus",
    "temporibus", "quibusdam", "illum", "fugit", "aspernatur", "laudantium",
    "totam", "rem", "aperiam", "eaque", "ipsa", "quae", "ab", "illo", "inventore",
    "veritatis", "quasi", "architecto", "beatae", "vitae", "dicta", "explicabo",
    "nemo", "ipsam", "voluptatibus", "accusantium", "doloremque", "sapiente",
    "delectus", "reiciendis", "maiores", "alias", "perferendis", "doloribus",
    "asperiores", "repellat"
  ];

  const LOREM_START = "Lorem ipsum dolor sit amet";

  let type = $state<GenerationType>("paragraphs");
  let length = $state(3);
  let startWithLorem = $state(true);
  let output = $state("");
  let copied = $state(false);

  const getRandomWord = (): string => {
    return LOREM_IPSUM_WORDS[Math.floor(Math.random() * LOREM_IPSUM_WORDS.length)];
  };

  const capitalize = (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const generateWords = (count: number, isFirst: boolean): string => {
    if (startWithLorem && isFirst) {
      const loremWords = LOREM_START.toLowerCase().split(" ");
      if (count <= loremWords.length) {
        return loremWords.slice(0, count).join(" ");
      }
      const remaining = count - loremWords.length;
      const extraWords = Array.from({ length: remaining }, () => getRandomWord());
      return [...loremWords, ...extraWords].join(" ");
    }
    return Array.from({ length: count }, () => getRandomWord()).join(" ");
  };

  const generateSentence = (isFirst: boolean): string => {
    const wordCount = Math.floor(Math.random() * 10) + 5; // 5-14 words per sentence
    let words = generateWords(wordCount, isFirst);
    return capitalize(words) + ".";
  };

  const generateParagraph = (isFirst: boolean): string => {
    const sentenceCount = Math.floor(Math.random() * 4) + 3; // 3-6 sentences per paragraph
    const sentences: string[] = [];
    for (let i = 0; i < sentenceCount; i++) {
      sentences.push(generateSentence(isFirst && i === 0));
    }
    return sentences.join(" ");
  };

  const generate = () => {
    let result = "";

    switch (type) {
      case "words": {
        const words = generateWords(length, true);
        result = startWithLorem ? capitalize(words) : words;
        break;
      }
      case "sentences": {
        const sentences: string[] = [];
        for (let i = 0; i < length; i++) {
          sentences.push(generateSentence(i === 0));
        }
        result = sentences.join(" ");
        break;
      }
      case "paragraphs": {
        const paragraphs: string[] = [];
        for (let i = 0; i < length; i++) {
          paragraphs.push(generateParagraph(i === 0));
        }
        result = paragraphs.join("\n\n");
        break;
      }
    }

    output = result;
  };

  // Generate on initial load
  $effect(() => {
    generate();
  });

  const handleRefresh = () => {
    generate();
  };

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };

  const handleClear = () => {
    output = "";
  };

  // Regenerate when settings change
  $effect(() => {
    type;
    length;
    startWithLorem;
    generate();
  });

  const getLengthLabel = $derived(() => {
    switch (type) {
      case "words": return "Words";
      case "sentences": return "Sentences";
      case "paragraphs": return "Paragraphs";
    }
  });
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate Lorem Ipsum placeholder text in words, sentences, or paragraphs.
    </p>
  </header>

  <!-- Controls -->
  <div class="mb-4 flex flex-wrap gap-4 items-center">
    <!-- Type Selector -->
    <div class="p-1 bg-(--color-border) inline-flex gap-1">
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {type === 'words'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => { type = "words"; }}
      >
        Words
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {type === 'sentences'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => { type = "sentences"; }}
      >
        Sentences
      </button>
      <button
        class="px-3 py-1 text-sm font-medium transition-colors {type === 'paragraphs'
          ? 'bg-(--color-text) text-(--color-btn-text)'
          : 'text-(--color-text-muted) hover:text-(--color-text)'}"
        onclick={() => { type = "paragraphs"; }}
      >
        Paragraphs
      </button>
    </div>

    <!-- Length Input -->
    <div class="flex items-center gap-2">
      <label for="length" class="text-sm text-(--color-text-muted)">{getLengthLabel()}:</label>
      <input
        id="length"
        type="number"
        bind:value={length}
        min="1"
        max="100"
        class="w-20 px-3 py-1 text-sm border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) focus:outline-none focus:border-(--color-accent)"
      />
    </div>

    <!-- Start with Lorem Ipsum Checkbox -->
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={startWithLorem}
        class="w-4 h-4 accent-(--color-accent)"
      />
      <span class="text-sm text-(--color-text-muted)">Start with "Lorem ipsum"</span>
    </label>
  </div>

  <!-- Output -->
  <div class="flex-1 flex flex-col min-h-[200px]">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs tracking-wider text-(--color-text-light) font-medium">
        Generated Text
      </span>
      <div class="flex gap-3">
        <button
          onclick={handleRefresh}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Refresh
        </button>
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onclick={handleClear}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
    <textarea
      readonly
      value={output}
      class="flex-1 w-full p-4 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-sm resize-none focus:outline-none focus:border-(--color-accent) font-mono leading-relaxed"
      placeholder="Generated text will appear here..."
    ></textarea>
  </div>
</div>
