<script lang="ts">
  // ============================================================
  // Meme Generator
  // - Upload image, paste URL, or pick a built-in placeholder template
  // - Add unlimited text boxes; each draggable on the canvas
  // - Classic Impact white-on-black-outline style by default
  // - Per-box font, size, color, outline, alignment, rotation
  // - Download as PNG
  // ============================================================

  interface TextBox {
    id: string;
    text: string;
    x: number; // normalized 0..1
    y: number; // normalized 0..1
    size: number; // px at canvas resolution
    color: string;
    outlineColor: string;
    outlineWidth: number;
    font: string;
    align: "left" | "center" | "right";
    bold: boolean;
    italic: boolean;
    uppercase: boolean;
  }

  interface Template {
    id: string;
    name: string;
    width: number;
    height: number;
    // Function that paints the placeholder onto the canvas
    paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
    boxes?: Partial<TextBox>[]; // default text-box placement
  }

  const FONTS = [
    "Impact",
    "Arial Black",
    "Comic Sans MS",
    "Georgia",
    "Helvetica",
    "Times New Roman",
    "Courier New",
  ];

  // Online meme catalog — fetched from memegen.link, which is CORS-friendly
  // (sets Access-Control-Allow-Origin: *), so the canvas is NOT tainted and
  // can still be downloaded / copied. Each entry includes canonical text-box
  // positions so the template loads ready to caption.
  interface OnlineTemplate {
    id: string; // memegen template slug
    name: string;
    boxes?: Partial<TextBox>[];
  }

  const MEMEGEN_BASE = "https://api.memegen.link/images";

  // Default helpers — top/bottom text shorthand
  const TB = (top: string, bottom: string): Partial<TextBox>[] => [
    { text: top, x: 0.5, y: 0.08, align: "center" },
    { text: bottom, x: 0.5, y: 0.92, align: "center" },
  ];

  // Comprehensive catalog of memes available via memegen.link.
  // Slug list curated from popular templates + georapbox/meme-generator.
  // memegen.link serves blank PNGs at `images/<slug>.png` with CORS headers,
  // so they double as thumbnails AND the canvas background.
  const ONLINE_TEMPLATES: OnlineTemplate[] = [
    { id: "drake", name: "Drake Hotline Bling", boxes: [
      { text: "OLD WAY", x: 0.72, y: 0.25, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 56 },
      { text: "NEW WAY", x: 0.72, y: 0.75, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 56 },
    ]},
    { id: "ds", name: "Distracted Boyfriend", boxes: [
      { text: "ME", x: 0.32, y: 0.5, align: "center" },
      { text: "NEW THING", x: 0.6, y: 0.45, align: "center" },
      { text: "OLD THING", x: 0.85, y: 0.5, align: "center" },
    ]},
    { id: "spongebob", name: "Mocking SpongeBob", boxes: TB("WhAt YoU sAiD", "MoCkInG bAcK") },
    { id: "fry", name: "Futurama Fry (Not Sure If)", boxes: TB("NOT SURE IF…", "OR JUST…") },
    { id: "yuno", name: "Y U NO", boxes: TB("BIG TASK", "Y U NO DO IT?!") },
    { id: "buzz", name: "X, X Everywhere", boxes: TB("X,", "X EVERYWHERE") },
    { id: "success", name: "Success Kid", boxes: TB("TINY VICTORY", "BIG WIN") },
    { id: "blb", name: "Bad Luck Brian", boxes: TB("TRIES SOMETHING", "EVERYTHING GOES WRONG") },
    { id: "philosoraptor", name: "Philosoraptor", boxes: TB("IF X…", "THEN WHY Y?") },
    { id: "rollsafe", name: "Roll Safe", boxes: TB("CAN'T LOSE A FIGHT", "IF YOU NEVER FIGHT") },
    { id: "doge", name: "Doge", boxes: [
      { text: "SUCH MEME", x: 0.2, y: 0.15, align: "left", color: "#fde047", outlineColor: "#000", size: 44, font: "Comic Sans MS" },
      { text: "MUCH WOW", x: 0.7, y: 0.45, align: "left", color: "#86efac", outlineColor: "#000", size: 44, font: "Comic Sans MS" },
      { text: "VERY CODE", x: 0.1, y: 0.7, align: "left", color: "#f9a8d4", outlineColor: "#000", size: 44, font: "Comic Sans MS" },
    ]},
    { id: "ll", name: "Leonardo DiCaprio Cheers", boxes: TB("HERE'S TO YOU", "AWESOME PERSON") },
    { id: "dg", name: "Disaster Girl", boxes: TB("DELETED PROD DB", "NO BACKUPS") },
    { id: "fwp", name: "First World Problems", boxes: TB("WI-FI A BIT SLOW", "GUESS I'LL DIE") },
    { id: "mordor", name: "One Does Not Simply (Mordor)", boxes: TB("ONE DOES NOT SIMPLY", "WALK INTO MORDOR") },
    { id: "aag", name: "Ancient Aliens", boxes: TB("I'M NOT SAYING IT'S X", "BUT IT'S X") },
    { id: "captain-america", name: "Captain America Elevator", boxes: TB("BEFORE WE START", "DOES ANYONE WANT TO LEAVE?") },
    { id: "ch", name: "Change My Mind", boxes: [
      { text: "HOT TAKE GOES HERE", x: 0.55, y: 0.7, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 40 },
    ]},
    { id: "kermit", name: "But That's None Of My Business", boxes: TB("THINGS HAPPEN", "BUT THAT'S NONE OF MY BUSINESS") },
    { id: "ermg", name: "Ermahgerd", boxes: TB("ERMAHGERD", "AMAZING THING") },
    { id: "joker", name: "Joker (Why So Serious)", boxes: TB("WHY", "SO SERIOUS?") },
    { id: "wonka", name: "Condescending Wonka", boxes: TB("OH, YOU…", "TELL ME MORE") },
    { id: "fine", name: "This Is Fine", boxes: TB("EVERYTHING IS ON FIRE", "THIS IS FINE") },
    { id: "panik", name: "Panik / Kalm / Panik", boxes: [
      { text: "PANIK", x: 0.5, y: 0.18, align: "center" },
      { text: "KALM", x: 0.5, y: 0.5, align: "center" },
      { text: "PANIK", x: 0.5, y: 0.85, align: "center" },
    ]},
    { id: "patrick", name: "Crying Patrick", boxes: TB("THE TRUTH HURTS", "REALLY BAD") },
    { id: "morpheus", name: "Matrix Morpheus", boxes: TB("WHAT IF I TOLD YOU", "THE TRUTH IS X") },
    { id: "facepalm", name: "Picard Facepalm", boxes: TB("WHEN…", "FACEPALM") },
    { id: "jw", name: "Sad Keanu", boxes: TB("I JUST WANTED", "ONE THING") },
    { id: "slap", name: "Batman Slapping Robin", boxes: [
      { text: "SOMETHING", x: 0.3, y: 0.2, align: "center" },
      { text: "SLAP!", x: 0.7, y: 0.2, align: "center" },
    ]},
    { id: "two", name: "Two Buttons (Daily Struggle)", boxes: [
      { text: "OPTION A", x: 0.3, y: 0.3, align: "center", size: 36 },
      { text: "OPTION B", x: 0.7, y: 0.3, align: "center", size: 36 },
    ]},
    { id: "harold", name: "Hide The Pain Harold", boxes: TB("WHEN PAIN HAPPENS", "BUT YOU SMILE THROUGH IT") },
    { id: "pigeon", name: "Is This A Pigeon?", boxes: [
      { text: "ME", x: 0.2, y: 0.4, align: "center" },
      { text: "OBVIOUS THING", x: 0.65, y: 0.55, align: "center" },
      { text: "IS THIS X?", x: 0.5, y: 0.92, align: "center" },
    ]},
    { id: "spider", name: "Spiderman Pointing", boxes: TB("YOU", "ME") },
    { id: "yodawg", name: "Yo Dawg Heard You Like", boxes: TB("YO DAWG I HEARD YOU LIKE X", "SO I PUT X IN YOUR X SO YOU CAN X WHILE YOU X") },
    { id: "interesting", name: "Most Interesting Man", boxes: TB("I DON'T ALWAYS X", "BUT WHEN I DO, Y") },
    { id: "saltbae", name: "Salt Bae", boxes: TB("SPRINKLE A LITTLE OF…", "THIS THING") },
    { id: "stonks", name: "Stonks", boxes: TB("BIG MOVE", "STONKS") },
    { id: "happening", name: "It's Happening", boxes: TB("WHEN…", "IT'S HAPPENING!") },
    { id: "vince", name: "Vince McMahon Reaction", boxes: [
      { text: "REGULAR THING", x: 0.5, y: 0.13, align: "center", size: 36 },
      { text: "BETTER THING", x: 0.5, y: 0.38, align: "center", size: 36 },
      { text: "EVEN BETTER", x: 0.5, y: 0.63, align: "center", size: 36 },
      { text: "MIND BLOWN", x: 0.5, y: 0.88, align: "center", size: 36 },
    ]},
    { id: "gru", name: "Gru's Plan", boxes: [
      { text: "STEP 1", x: 0.25, y: 0.5, align: "center", size: 28 },
      { text: "STEP 2", x: 0.5, y: 0.5, align: "center", size: 28 },
      { text: "STEP 3", x: 0.75, y: 0.25, align: "center", size: 28 },
      { text: "STEP 3??", x: 0.75, y: 0.75, align: "center", size: 28 },
    ]},
    { id: "always", name: "Always Has Been", boxes: TB("WAIT, IT'S ALL X?", "ALWAYS HAS BEEN.") },
    { id: "pooh", name: "Tuxedo Winnie The Pooh", boxes: [
      { text: "REGULAR PHRASE", x: 0.6, y: 0.25, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 36 },
      { text: "FANCY PHRASE", x: 0.6, y: 0.75, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 36 },
    ]},
    { id: "cheems", name: "Cheems", boxes: TB("I CAN HAS", "GREAT THING") },
    { id: "anakin", name: "Anakin & Padmé", boxes: [
      { text: "I'LL DO X", x: 0.25, y: 0.25, align: "center", size: 28 },
      { text: "FOR THE GOOD OF Y, RIGHT?", x: 0.75, y: 0.25, align: "center", size: 28 },
      { text: "(silence)", x: 0.25, y: 0.75, align: "center", size: 28 },
      { text: "FOR Y, RIGHT?", x: 0.75, y: 0.75, align: "center", size: 28 },
    ]},
    { id: "ackbar", name: "Admiral Ackbar (It's a Trap)", boxes: TB("WAIT…", "IT'S A TRAP!") },
    { id: "bender", name: "Bender", boxes: TB("I'M GONNA BUILD MY OWN X", "WITH BLACKJACK AND HOOKERS") },
    { id: "boat", name: "I Should Buy A Boat", boxes: TB("READS PROFOUND THING", "I SHOULD BUY A BOAT") },
    { id: "buzz-andy", name: "Afraid To Ask Andy", boxes: TB("I'M AFRAID TO ASK BUT…", "WHAT DOES X MEAN?") },
    { id: "cb", name: "Confession Bear", boxes: TB("CONFESSION TIME", "DEEP SECRET") },
    { id: "cbg", name: "Comic Book Guy (Worst Ever)", boxes: TB("WORST", "EPISODE EVER") },
    { id: "chosen", name: "You Were The Chosen One", boxes: TB("YOU WERE THE CHOSEN ONE!", "YOU WERE SUPPOSED TO X") },
    { id: "fbf", name: "Foul Bachelor Frog", boxes: TB("RUNS OUT OF CLEAN PLATES", "USES PIZZA BOX") },
    { id: "fmr", name: "Faster Mr Robot", boxes: TB("FASTER!", "I CAN'T DEBUG ANY FASTER!") },
    { id: "gandalf", name: "Gandalf (You Shall Not Pass)", boxes: TB("BUG IN PROD", "YOU SHALL NOT PASS") },
    { id: "headaches", name: "Imagine The Headaches", boxes: TB("USE PROD AS DEV?", "IMAGINE THE HEADACHES") },
    { id: "icanhas", name: "I Can Has Cheezburger", boxes: TB("I CAN HAS", "CHEEZBURGER?") },
    { id: "jetpack", name: "Nothing To Do Here", boxes: TB("HUGE PROBLEM", "NOTHING TO DO HERE") },
    { id: "jd", name: "Conspiracy Keanu", boxes: TB("WHAT IF…", "MIND BLOWN") },
    { id: "kk", name: "Kim Kardashian Crying", boxes: TB("WHEN…", "TOO MUCH") },
    { id: "ja", name: "Joseph Ducreux", boxes: TB("PROCURE PROVISIONS", "FROM A MERCHANT") },
    { id: "wonka-pure", name: "Pure Imagination", boxes: TB("COME WITH ME", "INTO PURE IMAGINATION") },
    { id: "yallgot", name: "Y'all Got Any More Of Them", boxes: TB("Y'ALL GOT ANY MORE OF THEM…", "X?") },
    { id: "money", name: "Shut Up And Take My Money", boxes: TB("WHEN A TOOL IS THIS GOOD", "SHUT UP AND TAKE MY MONEY") },
    { id: "noidea", name: "I Have No Idea", boxes: TB("LOOKS AT CODE", "I HAVE NO IDEA WHAT I'M DOING") },
    { id: "ntp", name: "Nut Button", boxes: TB("ME WHEN…", "X HAPPENS") },
    { id: "older", name: "Older Generation", boxes: TB("MILLENNIALS:", "WHY ARE THINGS LIKE THIS?") },
    { id: "oprah", name: "Oprah You Get A Car", boxes: TB("YOU GET AN X!", "EVERYBODY GETS AN X!") },
    { id: "pie", name: "American Beauty", boxes: TB("WHEN PRO TALENT", "ROSE PETALS") },
    { id: "regret", name: "Regret", boxes: TB("INSTANT", "REGRET") },
    { id: "right", name: "Drake (Right Side Only)", boxes: TB("APPROVE!", "BIG YES!") },
    { id: "sadcat", name: "Sad Cat", boxes: TB("WHEN YOUR CODE…", "HAS A BUG") },
    { id: "sadfrog", name: "Pepe / Sad Frog", boxes: TB("FEELS BAD MAN", "FEELS BAD") },
    { id: "sadpablo", name: "Sad Pablo Escobar", boxes: TB("WHEN…", "WAITING ALONE") },
    { id: "scc", name: "Successful Black Guy", boxes: TB("PARENTS LOCK ME OUT", "I HAVE MY OWN KEY") },
    { id: "sf", name: "Sudden Clarity Clarence", boxes: TB("WAIT A MINUTE…", "MIND BLOWN") },
    { id: "soa", name: "Surprised Pikachu", boxes: TB("DOES BAD THING", "SURPRISED IT WENT BAD") },
    { id: "ti", name: "Toddler In Bed", boxes: TB("MOM SAID NO COOKIES", "EATS COOKIES") },
    { id: "tried", name: "At Least You Tried", boxes: TB("ALMOST GOT IT", "AT LEAST YOU TRIED") },
    { id: "uno", name: "Uno Draw 25 Cards", boxes: [
      { text: "ADMIT YOU'RE WRONG", x: 0.5, y: 0.3, align: "center", color: "#fff", size: 28 },
      { text: "DRAW 25", x: 0.5, y: 0.7, align: "center", color: "#dc2626", size: 36 },
    ]},
    { id: "wat", name: "What? (Surprised Cat)", boxes: TB("WAIT", "WHAT?!") },
    { id: "waygd", name: "What Are You Gonna Do?", boxes: TB("HE GOT A GUN!", "WHAT ARE YOU GONNA DO?") },
    { id: "ymabt", name: "You May Be A But", boxes: TB("YOU MAY BE A X", "BUT I'M A Y") },
    { id: "ynj", name: "You're Not John Wick", boxes: TB("LOOK AT YOU", "YOU'RE NOT JOHN WICK") },
    { id: "puffin", name: "Confession Puffin", boxes: TB("EVERYONE SAYS DON'T…", "I DO IT ANYWAY") },
    { id: "khaby", name: "Khaby Lame", boxes: TB("LIFE HACK COMPLEX", "JUST DO IT NORMAL") },
    { id: "scoob", name: "Scooby-Doo Mask Reveal", boxes: TB("LET'S SEE WHO'S BEHIND…", "(YOUR CULPRIT)") },
    { id: "sad-biden", name: "Sad Biden", boxes: TB("PLAN A:", "PLAN B…") },
    { id: "kombucha", name: "Kombucha Girl", boxes: TB("WHEN YOU SEE X", "BUT THEN…") },
    { id: "snek", name: "Snek", boxes: TB("WHEN A FRIEND…", "BETRAYAL!") },
    { id: "fetch", name: "Stop Trying To Make Fetch Happen", boxes: TB("STOP TRYING TO MAKE", "FETCH HAPPEN") },
    { id: "afraid", name: "Afraid To Ask Andy (alt)", boxes: TB("I'M AFRAID TO ASK", "WHAT IT MEANS") },
    { id: "ive", name: "I've Seen Enough", boxes: TB("OPENS PR FROM JUNIOR", "I'VE SEEN ENOUGH") },
    { id: "jim", name: "Jim Halpert (Office)", boxes: TB("WHEN MEETING SHOULD HAVE BEEN AN EMAIL", "JIM STARES AT CAMERA") },
    { id: "michael-scott", name: "Michael Scott NO!", boxes: TB("DEPLOY ON FRIDAY?", "NO! GOD! PLEASE NO!") },
    { id: "snape", name: "Always (Snape)", boxes: TB("ALWAYS?", "ALWAYS.") },
    { id: "bilbo", name: "Bilbo (Excited)", boxes: TB("I DON'T KNOW HALF OF YOU…", "AS WELL AS I SHOULD LIKE") },
  ];

  // Currently selected online template ID
  let selectedOnlineId = $state("");
  let onlineLoading = $state(false);
  let memeSearch = $state("");
  let memeViewMode = $state<"grid" | "list">("grid");

  function memegenThumb(id: string): string {
    // Tiny preview — request a smaller variant by adding a width hint.
    // memegen.link supports `?width=` query param.
    return `${MEMEGEN_BASE}/${id}.png?width=200`;
  }

  const filteredOnlineTemplates = $derived.by(() => {
    const q = memeSearch.trim().toLowerCase();
    if (!q) return ONLINE_TEMPLATES;
    return ONLINE_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
    );
  });

  // ============================================================
  // Mouse-drag-to-scroll for the thumbnail strip.
  //
  // Strategy:
  // - Don't intercept pointer events on pointerdown — let click pass through
  //   to the buttons normally.
  // - Only START a drag once the cursor moves > DRAG_THRESHOLD pixels with
  //   the mouse button still held. At that point we attach document-level
  //   listeners and suppress the next click so a drag doesn't open a meme.
  // - Touch devices use the browser's native horizontal overflow scrolling.
  // ============================================================
  const DRAG_THRESHOLD = 6;
  let stripEl: HTMLDivElement | null = $state(null);
  let stripPress: { startX: number; startScroll: number } | null = null;
  let stripIsDragging = false;

  function onStripMouseDown(e: MouseEvent) {
    if (!stripEl || e.button !== 0) return;
    stripPress = { startX: e.clientX, startScroll: stripEl.scrollLeft };
    stripIsDragging = false;
    document.addEventListener("mousemove", onDocMouseMove);
    document.addEventListener("mouseup", onDocMouseUp, { once: true });
  }

  function onDocMouseMove(e: MouseEvent) {
    if (!stripPress || !stripEl) return;
    const dx = e.clientX - stripPress.startX;
    if (!stripIsDragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      stripIsDragging = true;
      stripEl.classList.add("is-dragging");
      // Prevent text selection while dragging
      document.body.style.userSelect = "none";
    }
    stripEl.scrollLeft = stripPress.startScroll - dx;
    e.preventDefault();
  }

  function onDocMouseUp() {
    document.removeEventListener("mousemove", onDocMouseMove);
    document.body.style.userSelect = "";
    if (stripEl) stripEl.classList.remove("is-dragging");
    if (stripIsDragging) {
      // Suppress the synthesized click that follows a drag-release
      const block = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", block, { capture: true, once: true });
    }
    stripPress = null;
    stripIsDragging = false;
  }

  function onStripWheel(e: WheelEvent) {
    // Convert vertical wheel into horizontal scroll for trackpad users
    if (!stripEl) return;
    if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      stripEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }

  async function loadOnlineTemplate(id: string) {
    if (!id) return;
    const t = ONLINE_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    urlError = "";
    onlineLoading = true;
    activeTemplate = null;
    isTainted = false;
    const url = `${MEMEGEN_BASE}/${t.id}.png`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    try {
      await img.decode();
      backgroundImage = img;
      canvasWidth = img.naturalWidth || 600;
      canvasHeight = img.naturalHeight || 600;
      // Apply suggested boxes for this template
      const proto = t.boxes ?? [
        { text: "TOP TEXT", y: 0.08, align: "center" },
        { text: "BOTTOM TEXT", y: 0.92, align: "center" },
      ];
      textBoxes = proto.map((b) => defaultBox(b));
      selectedBoxId = textBoxes[0]?.id ?? null;
    } catch (e) {
      urlError = `Failed to load "${t.name}". The host may be unreachable. (${(e as Error).message})`;
    } finally {
      onlineLoading = false;
    }
  }

  // Built-in placeholder templates — locally rendered, no network needed.
  const TEMPLATES: Template[] = [
    {
      id: "blank-white",
      name: "Blank (white)",
      width: 800,
      height: 800,
      paint: (ctx, w, h) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      },
      boxes: [
        { text: "TOP TEXT", y: 0.1 },
        { text: "BOTTOM TEXT", y: 0.9 },
      ],
    },
    {
      id: "blank-black",
      name: "Blank (black)",
      width: 800,
      height: 800,
      paint: (ctx, w, h) => {
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, w, h);
      },
      boxes: [
        { text: "TOP TEXT", y: 0.1, color: "#ffffff", outlineColor: "#000" },
        { text: "BOTTOM TEXT", y: 0.9, color: "#ffffff", outlineColor: "#000" },
      ],
    },
    {
      id: "drake",
      name: "Drake (2 panel)",
      width: 800,
      height: 800,
      paint: (ctx, w, h) => {
        // Two stacked panels with cartoon silhouettes
        ctx.fillStyle = "#fef3c7";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fed7aa";
        ctx.fillRect(0, h / 2, w, h / 2);
        // Silhouettes
        ctx.fillStyle = "#92400e";
        // Top: dismissive
        ctx.beginPath();
        ctx.arc(w * 0.2, h * 0.25, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(w * 0.1, h * 0.32, 200, 110);
        // Bottom: approving
        ctx.fillStyle = "#7c2d12";
        ctx.beginPath();
        ctx.arc(w * 0.2, h * 0.75, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(w * 0.1, h * 0.82, 200, 110);
        // Dividing line
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      },
      boxes: [
        { text: "AVOID THIS", x: 0.65, y: 0.25, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 48 },
        { text: "PREFER THIS", x: 0.65, y: 0.75, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 48 },
      ],
    },
    {
      id: "thinking",
      name: "Thinking",
      width: 800,
      height: 800,
      paint: (ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w / 1.5);
        grad.addColorStop(0, "#fef9c3");
        grad.addColorStop(1, "#facc15");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // simple thought bubble
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.4, 220, 140, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(w / 2, h * 0.6 + i * 30, 15 - i * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      },
      boxes: [{ text: "HMMMM…", x: 0.5, y: 0.4, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 56 }],
    },
    {
      id: "stonks",
      name: "Stonks",
      width: 800,
      height: 600,
      paint: (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#0f172a");
        grad.addColorStop(1, "#1e3a8a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Up arrow
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h * 0.85);
        ctx.lineTo(w * 0.4, h * 0.5);
        ctx.lineTo(w * 0.55, h * 0.65);
        ctx.lineTo(w * 0.9, h * 0.15);
        ctx.stroke();
        // Arrow head
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(w * 0.9, h * 0.15);
        ctx.lineTo(w * 0.78, h * 0.18);
        ctx.lineTo(w * 0.85, h * 0.28);
        ctx.closePath();
        ctx.fill();
      },
      boxes: [{ text: "STONKS", x: 0.5, y: 0.92, align: "center", size: 72, color: "#fff", outlineColor: "#000" }],
    },
    {
      id: "two-buttons",
      name: "Two Buttons",
      width: 800,
      height: 700,
      paint: (ctx, w, h) => {
        ctx.fillStyle = "#fef3c7";
        ctx.fillRect(0, 0, w, h);
        // Two big red buttons
        ctx.fillStyle = "#dc2626";
        ctx.strokeStyle = "#7f1d1d";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(w * 0.3, h * 0.35, 130, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(w * 0.7, h * 0.35, 130, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Sweating person silhouette
        ctx.fillStyle = "#92400e";
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.78, 70, 0, Math.PI * 2);
        ctx.fill();
        // Sweat drops
        ctx.fillStyle = "#60a5fa";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(w * 0.42 + i * 60, h * 0.65, 8, 14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      boxes: [
        { text: "OPTION A", x: 0.3, y: 0.35, align: "center", color: "#fff", size: 36, outlineColor: "#000" },
        { text: "OPTION B", x: 0.7, y: 0.35, align: "center", color: "#fff", size: 36, outlineColor: "#000" },
      ],
    },
    {
      id: "expanding-brain",
      name: "Expanding Brain (4 panel)",
      width: 800,
      height: 1200,
      paint: (ctx, w, h) => {
        const colors = ["#1f2937", "#374151", "#7c3aed", "#fbbf24"];
        const labels = ["small", "medium", "large", "galaxy"];
        const ph = h / 4;
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = colors[i];
          ctx.fillRect(0, i * ph, w, ph);
          // brain shape
          ctx.fillStyle = i === 3 ? "#fff7ed" : "#fbcfe8";
          ctx.beginPath();
          ctx.arc(w * 0.18, i * ph + ph / 2, 60 + i * 10, 0, Math.PI * 2);
          ctx.fill();
          // Label
          ctx.fillStyle = i < 2 ? "#fff" : "#1a1a1a";
          ctx.font = "bold 18px sans-serif";
          ctx.fillText(labels[i], 10, i * ph + 20);
          // Divider
          if (i < 3) {
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, (i + 1) * ph);
            ctx.lineTo(w, (i + 1) * ph);
            ctx.stroke();
          }
        }
      },
      boxes: [
        { text: "BASIC IDEA", x: 0.62, y: 0.125, align: "center", color: "#fff", outlineColor: "#000", size: 36 },
        { text: "BETTER IDEA", x: 0.62, y: 0.375, align: "center", color: "#fff", outlineColor: "#000", size: 36 },
        { text: "ENLIGHTENED", x: 0.62, y: 0.625, align: "center", color: "#fff", outlineColor: "#000", size: 36 },
        { text: "TRANSCENDENT", x: 0.62, y: 0.875, align: "center", color: "#1a1a1a", outlineColor: "transparent", outlineWidth: 0, size: 36 },
      ],
    },
  ];

  // State
  let canvasEl: HTMLCanvasElement | null = $state(null);
  let canvasWidth = $state(800);
  let canvasHeight = $state(800);
  let backgroundImage = $state<HTMLImageElement | null>(null);
  let activeTemplate = $state<Template | null>(TEMPLATES[0]);

  let textBoxes = $state<TextBox[]>([]);
  let selectedBoxId = $state<string | null>(null);

  let imageUrl = $state("");
  let urlError = $state("");
  let isTainted = $state(false); // canvas tainted by cross-origin image → can't download

  // Drag state for repositioning text boxes
  let draggingId: string | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  // ============================================================
  // Helpers
  // ============================================================
  function defaultBox(over: Partial<TextBox> = {}): TextBox {
    return {
      id: crypto.randomUUID(),
      text: "TEXT",
      x: 0.5,
      y: 0.5,
      size: 56,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 6,
      font: "Impact",
      align: "center",
      bold: false,
      italic: false,
      uppercase: true,
      ...over,
    };
  }

  function applyTemplateBoxes(t: Template) {
    const proto = t.boxes ?? [{ text: "TOP TEXT", y: 0.1 }, { text: "BOTTOM TEXT", y: 0.9 }];
    textBoxes = proto.map((b) => defaultBox(b));
    selectedBoxId = textBoxes[0]?.id ?? null;
  }

  function selectTemplate(t: Template) {
    activeTemplate = t;
    backgroundImage = null;
    canvasWidth = t.width;
    canvasHeight = t.height;
    isTainted = false;
    applyTemplateBoxes(t);
  }

  async function loadFromFile(file: File) {
    urlError = "";
    isTainted = false;
    activeTemplate = null;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
      backgroundImage = img;
      canvasWidth = img.naturalWidth;
      canvasHeight = img.naturalHeight;
      if (textBoxes.length === 0) {
        textBoxes = [defaultBox({ text: "TOP TEXT", y: 0.1 }), defaultBox({ text: "BOTTOM TEXT", y: 0.9 })];
        selectedBoxId = textBoxes[0].id;
      }
    } catch (e) {
      urlError = (e as Error).message;
    }
  }

  function onFileChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) loadFromFile(f);
  }

  async function loadFromUrl() {
    urlError = "";
    isTainted = false;
    if (!imageUrl.trim()) return;
    activeTemplate = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    try {
      await img.decode();
      backgroundImage = img;
      canvasWidth = img.naturalWidth;
      canvasHeight = img.naturalHeight;
      if (textBoxes.length === 0) {
        textBoxes = [defaultBox({ text: "TOP TEXT", y: 0.1 }), defaultBox({ text: "BOTTOM TEXT", y: 0.9 })];
        selectedBoxId = textBoxes[0].id;
      }
    } catch (e) {
      urlError =
        "Failed to load image. The host may not allow cross-origin loads — try downloading the image and uploading it instead.";
      void e;
    }
  }

  function addBox() {
    const b = defaultBox({ text: "NEW TEXT", y: 0.5 });
    textBoxes = [...textBoxes, b];
    selectedBoxId = b.id;
  }

  function removeBox(id: string) {
    textBoxes = textBoxes.filter((b) => b.id !== id);
    if (selectedBoxId === id) selectedBoxId = textBoxes[0]?.id ?? null;
  }

  function updateBox(id: string, patch: Partial<TextBox>) {
    textBoxes = textBoxes.map((b) => (b.id === id ? { ...b, ...patch } : b));
  }

  // ============================================================
  // Rendering
  // ============================================================
  function render() {
    const canvas = canvasEl;
    if (!canvas) return;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    if (backgroundImage) {
      try {
        ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
        // Test taint by reading 1px
        try {
          ctx.getImageData(0, 0, 1, 1);
          isTainted = false;
        } catch {
          isTainted = true;
        }
      } catch {
        // ignore
      }
    } else if (activeTemplate) {
      activeTemplate.paint(ctx, canvasWidth, canvasHeight);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Text boxes
    for (const b of textBoxes) {
      drawText(ctx, b);
    }
  }

  function drawText(ctx: CanvasRenderingContext2D, b: TextBox) {
    const x = b.x * canvasWidth;
    const y = b.y * canvasHeight;
    const text = b.uppercase ? b.text.toUpperCase() : b.text;
    const weight = b.bold ? "bold" : "normal";
    const style = b.italic ? "italic" : "normal";
    ctx.font = `${style} ${weight} ${b.size}px ${b.font}`;
    ctx.textAlign = b.align;
    ctx.textBaseline = "middle";

    // Word wrap to canvas width minus padding
    const padding = canvasWidth * 0.04;
    const maxWidth = canvasWidth - padding * 2;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = b.size * 1.1;
    const totalHeight = lines.length * lineHeight;
    let yStart = y - totalHeight / 2 + lineHeight / 2;

    for (const line of lines) {
      // Outline
      if (b.outlineWidth > 0 && b.outlineColor !== "transparent") {
        ctx.strokeStyle = b.outlineColor;
        ctx.lineWidth = b.outlineWidth;
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(line, x, yStart);
      }
      ctx.fillStyle = b.color;
      ctx.fillText(line, x, yStart);
      yStart += lineHeight;
    }
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push("");
        continue;
      }
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = line + " " + words[i];
        if (ctx.measureText(test).width > maxWidth) {
          lines.push(line);
          line = words[i];
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  // Re-render when anything changes
  $effect(() => {
    void textBoxes;
    void backgroundImage;
    void activeTemplate;
    void canvasWidth;
    void canvasHeight;
    render();
  });

  // Initialize
  $effect(() => {
    if (textBoxes.length === 0 && activeTemplate) {
      applyTemplateBoxes(activeTemplate);
    }
  });

  // ============================================================
  // Drag-to-reposition on canvas
  // ============================================================
  function canvasCoordsFromEvent(e: PointerEvent): { x: number; y: number } | null {
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvasWidth;
    const cy = ((e.clientY - rect.top) / rect.height) * canvasHeight;
    return { x: cx, y: cy };
  }

  function findBoxAt(cx: number, cy: number): TextBox | null {
    // Hit-test in reverse so top-most box wins
    for (let i = textBoxes.length - 1; i >= 0; i--) {
      const b = textBoxes[i];
      const bx = b.x * canvasWidth;
      const by = b.y * canvasHeight;
      const half = b.size * 1.2;
      if (Math.abs(cx - bx) < canvasWidth * 0.45 && Math.abs(cy - by) < half) {
        return b;
      }
    }
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    const c = canvasCoordsFromEvent(e);
    if (!c) return;
    const hit = findBoxAt(c.x, c.y);
    if (hit) {
      selectedBoxId = hit.id;
      draggingId = hit.id;
      dragOffsetX = c.x - hit.x * canvasWidth;
      dragOffsetY = c.y - hit.y * canvasHeight;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!draggingId) return;
    const c = canvasCoordsFromEvent(e);
    if (!c) return;
    const newX = (c.x - dragOffsetX) / canvasWidth;
    const newY = (c.y - dragOffsetY) / canvasHeight;
    updateBox(draggingId, {
      x: Math.max(0, Math.min(1, newX)),
      y: Math.max(0, Math.min(1, newY)),
    });
  }

  function onPointerUp(e: PointerEvent) {
    if (draggingId) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      draggingId = null;
    }
  }

  // ============================================================
  // Export
  // ============================================================
  function downloadPng() {
    if (!canvasEl) return;
    if (isTainted) {
      urlError = "Cannot download a CORS-tainted image. Upload the image as a file instead.";
      return;
    }
    const url = canvasEl.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "meme.png";
    a.click();
  }

  async function copyToClipboard() {
    if (!canvasEl) return;
    if (isTainted) {
      urlError = "Cannot copy a CORS-tainted image. Upload the image as a file instead.";
      return;
    }
    try {
      const blob: Blob = await new Promise((resolve, reject) =>
        canvasEl!.toBlob((b) => (b ? resolve(b) : reject(new Error("Blob failed"))), "image/png"),
      );
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    } catch (e) {
      urlError = `Copy failed: ${(e as Error).message}`;
    }
  }

  let copied = $state(false);

  // Selected box helper
  const selectedBox = $derived(textBoxes.find((b) => b.id === selectedBoxId) ?? null);

  // Initial template
  $effect(() => {
    if (textBoxes.length === 0 && activeTemplate) {
      applyTemplateBoxes(activeTemplate);
    }
  });
</script>

<div class="h-full w-full max-w-full min-w-0 flex flex-col gap-3 overflow-hidden">
  <header class="min-w-0">
    <p class="text-sm text-(--color-text-muted)">
      Make a meme: pick a placeholder template, upload an image, or paste a URL. Click text on the canvas to select, drag to reposition, and edit in the panel below.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 min-w-0 max-w-full">
    <!-- Left: source + canvas -->
    <div class="flex-1 flex flex-col gap-3 min-h-0 min-w-0">
      <!-- Source controls -->
      <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col gap-2 min-w-0">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Image source</span>
        <div class="flex flex-wrap gap-2 items-center">
          <label class="px-3 py-1.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) cursor-pointer transition-colors">
            Upload image
            <input type="file" accept="image/*" onchange={onFileChange} class="hidden" />
          </label>
          <input
            type="text"
            bind:value={imageUrl}
            placeholder="or paste an image URL"
            class="flex-1 min-w-[180px] px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-xs focus:border-(--color-text-light) outline-none"
          />
          <button
            type="button"
            onclick={loadFromUrl}
            class="px-3 py-1.5 text-xs bg-(--color-bg) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            Load URL
          </button>
        </div>
        {#if urlError}
          <span class="text-xs text-(--color-error-text)">{urlError}</span>
        {/if}

        <!-- Popular memes (online) -->
        <div class="flex flex-col gap-2 min-w-0">
          <div class="flex flex-wrap gap-2 items-center">
            <span class="text-xs text-(--color-text-light)">Popular memes ({ONLINE_TEMPLATES.length}):</span>
            <input
              type="text"
              bind:value={memeSearch}
              placeholder="search…"
              class="flex-1 min-w-[140px] px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs focus:border-(--color-text-light) outline-none"
            />
            <div class="flex gap-1">
              <button
                type="button"
                onclick={() => (memeViewMode = "grid")}
                class="px-2 py-1 text-xs border transition-colors {memeViewMode === 'grid'
                  ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                  : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                title="Grid view"
              >
                ▦ Grid
              </button>
              <button
                type="button"
                onclick={() => (memeViewMode = "list")}
                class="px-2 py-1 text-xs border transition-colors {memeViewMode === 'list'
                  ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                  : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
                title="Dropdown"
              >
                ▾ List
              </button>
            </div>
            {#if onlineLoading}
              <span class="text-xs text-(--color-text-muted)">Loading…</span>
            {/if}
          </div>

          {#if memeViewMode === "list"}
            <select
              bind:value={selectedOnlineId}
              onchange={(e) => loadOnlineTemplate((e.currentTarget as HTMLSelectElement).value)}
              class="w-full px-2 py-1.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-xs focus:border-(--color-text-light) outline-none cursor-pointer"
            >
              <option value="">— pick a template —</option>
              {#each filteredOnlineTemplates as t (t.id + t.name)}
                <option value={t.id}>{t.name}</option>
              {/each}
            </select>
          {:else}
            <!-- Thumbnail row wrapper: hard-constrains the width so the inner
                 horizontal-scroll element cannot push the page wider. The
                 container is grid with a single 1fr column, which forces the
                 child to fit and not expand to its scrollWidth. -->
            <div class="grid grid-cols-[minmax(0,1fr)] w-full max-w-full">
              <div
                bind:this={stripEl}
                onmousedown={onStripMouseDown}
                onwheel={onStripWheel}
                class="w-full min-w-0 max-w-full flex overflow-x-auto overflow-y-hidden gap-2 pb-2 cursor-grab meme-strip"
                style="scrollbar-width: thin; touch-action: pan-x;"
              >
                {#each filteredOnlineTemplates as t (t.id + t.name)}
                  <button
                    type="button"
                    onclick={() => {
                      selectedOnlineId = t.id;
                      loadOnlineTemplate(t.id);
                    }}
                    class="flex-none w-28 flex flex-col items-center gap-1 p-1 border transition-colors {selectedOnlineId === t.id
                      ? 'border-(--color-accent) bg-(--color-bg)'
                      : 'border-(--color-border) bg-(--color-bg) hover:border-(--color-text-light)'}"
                    title={t.name}
                  >
                    <img
                      src={memegenThumb(t.id)}
                      alt={t.name}
                      loading="lazy"
                      draggable="false"
                      class="w-full h-20 object-contain bg-white pointer-events-none"
                      onerror={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                      }}
                    />
                    <span class="text-[10px] text-(--color-text-muted) truncate w-full text-center leading-tight pointer-events-none">
                      {t.name}
                    </span>
                  </button>
                {/each}
                {#if filteredOnlineTemplates.length === 0}
                  <span class="text-xs text-(--color-text-muted) self-center px-3">No memes match "{memeSearch}"</span>
                {/if}
              </div>
            </div>
            <span class="text-[10px] text-(--color-text-muted)">Drag, scroll, or shift-wheel to browse →</span>
          {/if}
        </div>

        <!-- Local placeholder templates -->
        <div class="flex flex-wrap gap-1.5">
          <span class="text-xs text-(--color-text-light) self-center mr-1">Placeholders:</span>
          {#each TEMPLATES as t (t.id)}
            <button
              type="button"
              onclick={() => selectTemplate(t)}
              class="px-2 py-1 text-xs border transition-colors {activeTemplate?.id === t.id
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              {t.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- Canvas -->
      <div class="flex-1 bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col items-center justify-center overflow-auto min-h-0">
        <canvas
          bind:this={canvasEl}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          class="max-w-full max-h-full border border-(--color-border) cursor-grab touch-none"
          style="image-rendering: auto;"
        ></canvas>
      </div>

      <!-- Export bar -->
      <div class="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onclick={downloadPng}
          class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors"
        >
          Download PNG
        </button>
        <button
          type="button"
          onclick={copyToClipboard}
          class="px-3 py-2 text-sm bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          {copied ? "Copied!" : "Copy image"}
        </button>
        <span class="text-xs text-(--color-text-muted) ml-auto">
          {canvasWidth} × {canvasHeight}{isTainted ? " · tainted (no download)" : ""}
        </span>
      </div>
    </div>

    <!-- Right: text-box editor -->
    <aside class="lg:w-80 flex flex-col gap-3 overflow-auto">
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Text boxes ({textBoxes.length})</span>
        <button
          type="button"
          onclick={addBox}
          class="px-2 py-1 text-xs bg-(--color-bg-alt) border border-(--color-border) text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          + Add
        </button>
      </div>

      <!-- Box list -->
      <div class="flex flex-col gap-1">
        {#each textBoxes as b (b.id)}
          <div
            class="flex items-center gap-1 border {selectedBoxId === b.id
              ? 'border-(--color-accent)'
              : 'border-(--color-border)'} bg-(--color-bg-alt)"
          >
            <button
              type="button"
              onclick={() => (selectedBoxId = b.id)}
              class="flex-1 text-left px-2 py-1 text-xs font-mono text-(--color-text) truncate"
            >
              {b.text || "(empty)"}
            </button>
            <button
              type="button"
              onclick={() => removeBox(b.id)}
              class="px-2 text-(--color-text-light) hover:text-(--color-error-text) transition-colors"
              title="Remove"
            >
              ×
            </button>
          </div>
        {/each}
      </div>

      <!-- Selected box editor -->
      {#if selectedBox}
        <div class="bg-(--color-bg-alt) border border-(--color-border) p-3 flex flex-col gap-2">
          <span class="text-[10px] uppercase tracking-wider text-(--color-text-light) font-medium">Edit selected</span>
          <textarea
            value={selectedBox.text}
            oninput={(e) => updateBox(selectedBox.id, { text: (e.currentTarget as HTMLTextAreaElement).value })}
            rows="3"
            placeholder="meme text"
            class="w-full px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono text-sm focus:border-(--color-text-light) outline-none resize-y"
          ></textarea>

          <!-- Position -->
          <div class="grid grid-cols-2 gap-2 text-xs text-(--color-text-muted)">
            <label class="flex flex-col gap-1">
              X (0-1)
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={selectedBox.x.toFixed(2)}
                oninput={(e) => updateBox(selectedBox.id, { x: parseFloat((e.currentTarget as HTMLInputElement).value) || 0 })}
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono focus:border-(--color-text-light) outline-none"
              />
            </label>
            <label class="flex flex-col gap-1">
              Y (0-1)
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={selectedBox.y.toFixed(2)}
                oninput={(e) => updateBox(selectedBox.id, { y: parseFloat((e.currentTarget as HTMLInputElement).value) || 0 })}
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono focus:border-(--color-text-light) outline-none"
              />
            </label>
          </div>

          <!-- Font + size -->
          <div class="grid grid-cols-2 gap-2 text-xs text-(--color-text-muted)">
            <label class="flex flex-col gap-1">
              Font
              <select
                value={selectedBox.font}
                onchange={(e) => updateBox(selectedBox.id, { font: (e.currentTarget as HTMLSelectElement).value })}
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono focus:border-(--color-text-light) outline-none"
              >
                {#each FONTS as f (f)}
                  <option value={f}>{f}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1">
              Size (px)
              <input
                type="number"
                min="8"
                max="400"
                value={selectedBox.size}
                oninput={(e) => updateBox(selectedBox.id, { size: parseInt((e.currentTarget as HTMLInputElement).value) || 0 })}
                class="px-2 py-1 bg-(--color-bg) border border-(--color-border) text-(--color-text) font-mono focus:border-(--color-text-light) outline-none"
              />
            </label>
          </div>

          <!-- Colors -->
          <div class="grid grid-cols-2 gap-2 text-xs text-(--color-text-muted)">
            <label class="flex flex-col gap-1">
              Fill
              <input
                type="color"
                value={selectedBox.color}
                oninput={(e) => updateBox(selectedBox.id, { color: (e.currentTarget as HTMLInputElement).value })}
                class="h-8 w-full bg-(--color-bg) border border-(--color-border) cursor-pointer"
              />
            </label>
            <label class="flex flex-col gap-1">
              Outline
              <input
                type="color"
                value={selectedBox.outlineColor === "transparent" ? "#000000" : selectedBox.outlineColor}
                oninput={(e) => updateBox(selectedBox.id, { outlineColor: (e.currentTarget as HTMLInputElement).value })}
                class="h-8 w-full bg-(--color-bg) border border-(--color-border) cursor-pointer"
              />
            </label>
          </div>

          <label class="flex items-center gap-2 text-xs text-(--color-text-muted)">
            Outline width
            <input
              type="range"
              min="0"
              max="20"
              value={selectedBox.outlineWidth}
              oninput={(e) => updateBox(selectedBox.id, { outlineWidth: parseInt((e.currentTarget as HTMLInputElement).value) })}
              class="flex-1"
            />
            <span class="font-mono text-(--color-text) w-6 text-right">{selectedBox.outlineWidth}</span>
          </label>

          <!-- Style toggles -->
          <div class="flex flex-wrap gap-1">
            {#each [["left", "⇤"], ["center", "↔"], ["right", "⇥"]] as [val, label] (val)}
              <button
                type="button"
                onclick={() => updateBox(selectedBox.id, { align: val as "left" | "center" | "right" })}
                class="px-2 py-1 text-xs border transition-colors {selectedBox.align === val
                  ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                  : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
              >
                {label}
              </button>
            {/each}
            <button
              type="button"
              onclick={() => updateBox(selectedBox.id, { bold: !selectedBox.bold })}
              class="px-2 py-1 text-xs font-bold border transition-colors {selectedBox.bold
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              B
            </button>
            <button
              type="button"
              onclick={() => updateBox(selectedBox.id, { italic: !selectedBox.italic })}
              class="px-2 py-1 text-xs italic border transition-colors {selectedBox.italic
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
            >
              I
            </button>
            <button
              type="button"
              onclick={() => updateBox(selectedBox.id, { uppercase: !selectedBox.uppercase })}
              class="px-2 py-1 text-xs border transition-colors {selectedBox.uppercase
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) border-(--color-border) text-(--color-text-muted) hover:text-(--color-text)'}"
              title="Uppercase"
            >
              AA
            </button>
          </div>
        </div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .meme-strip.is-dragging {
    cursor: grabbing;
  }
  .meme-strip.is-dragging * {
    pointer-events: none;
  }
</style>
