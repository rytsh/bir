export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ToolGuide {
  /** Search-friendly page title. The site name is appended automatically. */
  title: string;
  intro: string;
  steps: string[];
  faq: ToolFaq[];
}

const privacyAnswer =
  "No. The tool runs entirely in your browser. Your input is processed locally and is never uploaded to a server.";

export const toolGuides: Record<string, ToolGuide> = {
  "string-inspector": {
    title: "Invisible Character Detector – Find Zero-Width & Hidden Unicode",
    intro:
      "String Inspector reveals characters you cannot see: zero-width spaces, byte order marks (BOM), bidirectional override characters used in Trojan Source attacks, non-breaking and other unusual spaces, smart quotes, control characters, and homoglyphs that look like Latin letters but are not. It also shows exact lengths in graphemes, code points, UTF-16 units, and UTF-8 bytes, so you can see why a string is longer than it looks or why two strings that look the same do not compare equal.",
    steps: [
      "Paste the suspicious text into the input area.",
      "Look at the highlighted characters and the per-character table with code points and UTF-8 / UTF-16 bytes.",
      "Compare the length counters (graphemes, code points, JS length, bytes) to spot hidden content.",
      "Use the clean-up options to remove invisible characters, convert unusual spaces, replace smart quotes, map homoglyphs to Latin, or normalize line endings, then copy the result.",
    ],
    faq: [
      {
        question: "How do I find a zero-width space in text?",
        answer:
          "Paste the text into String Inspector. Zero-width spaces (U+200B), zero-width joiners, and other invisible characters are highlighted and listed with their code points, and you can remove them with one click.",
      },
      {
        question: "What is a Trojan Source attack?",
        answer:
          "Trojan Source uses Unicode bidirectional control characters (such as U+202E RIGHT-TO-LEFT OVERRIDE) to make source code display differently from how a compiler reads it. String Inspector flags these bidi characters so you can review or remove them.",
      },
      {
        question: "Why does my string length differ from what I see?",
        answer:
          "Emoji, combining accents, and hidden characters make the visible character count (graphemes) differ from code points, JavaScript length (UTF-16 units), and byte length. The inspector shows all of these side by side.",
      },
      { question: "Is my text uploaded anywhere?", answer: privacyAnswer },
    ],
  },
  "git-patch-viewer": {
    title: "Git Patch Viewer – View .patch and .diff Files Online",
    intro:
      "Git Patch Viewer renders Git patches and unified diffs as a readable code review. Paste the output of git diff or git format-patch, or open a .patch / .diff file, and browse changes file by file in unified or side-by-side view with line numbers, additions and deletions, rename and binary file detection, and filters. It is useful for reviewing patches sent by email, attached to issues, or exported from CI without checking out the branch.",
    steps: [
      "Paste a patch or diff, or open a .patch / .diff file.",
      "Pick a file from the file list to jump to its changes.",
      "Switch between unified and side-by-side views.",
      "Use filters and keyboard shortcuts to move through files and hunks quickly.",
    ],
    faq: [
      {
        question: "How do I open a .patch file?",
        answer:
          "A .patch file is plain text produced by git format-patch or git diff. Open it in Git Patch Viewer to see each changed file with highlighted additions and deletions instead of raw diff text.",
      },
      {
        question: "Does it support side-by-side diffs?",
        answer: "Yes. You can switch between a unified view and a side-by-side split view at any time.",
      },
      {
        question: "Can it show renamed and binary files?",
        answer: "Yes. Renames and binary file changes are detected from the patch headers and labeled in the file list.",
      },
      { question: "Is my patch uploaded anywhere?", answer: privacyAnswer },
    ],
  },
  "font-glyphs": {
    title: "Font Glyph Viewer – Inspect TTF, OTF, WOFF2 Characters Online",
    intro:
      "Font Glyphs lets you open a font file and see every glyph it contains. It supports TTF, OTF, TTC, WOFF, and WOFF2 files, filters glyphs by Unicode block, and includes the Private Use Area so you can browse icon fonts such as Font Awesome or Nerd Fonts. Click a glyph to copy it as a character, a U+ code point, an HTML entity, or a CSS escape.",
    steps: [
      "Upload a font file (TTF, OTF, TTC, WOFF, or WOFF2).",
      "Filter by Unicode block, or choose Private Use to see icon glyphs.",
      "Adjust the glyph size and preview text.",
      "Click a glyph and copy it in the format you need: character, U+ code, HTML entity, or CSS escape.",
    ],
    faq: [
      {
        question: "How can I see all characters in a font?",
        answer:
          "Upload the font file to Font Glyphs. Every glyph mapped to a Unicode code point is shown in a grid that you can filter by Unicode block.",
      },
      {
        question: "How do I find the code of an icon in an icon font?",
        answer:
          "Icon fonts usually place icons in the Unicode Private Use Area. Select the Private Use filter, click the icon, and copy its U+ code, HTML entity, or CSS content escape.",
      },
      { question: "Is my font file uploaded?", answer: privacyAnswer },
    ],
  },
  "serial-terminal": {
    title: "Online Serial Monitor – Web Serial Terminal for Arduino & ESP32",
    intro:
      "Serial Terminal is a serial monitor that runs in the browser using the Web Serial API. Connect to an Arduino, ESP32, Raspberry Pi Pico, or any USB-to-serial adapter, choose a baud rate from 300 to 921600, and send and receive data as text or hex. You can control line endings and DTR / RTS signals, see timestamps for each line, and export the session log. No driver-specific software or IDE is needed.",
    steps: [
      "Open the page in a Chromium-based browser (Chrome, Edge, Opera) that supports Web Serial.",
      "Select the baud rate that matches your device, for example 9600 or 115200.",
      "Click connect and choose the serial port from the browser prompt.",
      "Type a message and choose the line ending, or switch to hex mode to send raw bytes.",
      "Export the log when you are done.",
    ],
    faq: [
      {
        question: "Can I use this instead of the Arduino IDE serial monitor?",
        answer:
          "Yes. It reads and writes the same serial port as the Arduino IDE serial monitor. Close the IDE monitor first, because only one program can open a port at a time.",
      },
      {
        question: "Which browsers support Web Serial?",
        answer:
          "Web Serial is available in desktop Chrome, Edge, and Opera. Firefox and Safari do not support it.",
      },
      {
        question: "Why do I see garbled characters?",
        answer:
          "Garbled output almost always means the baud rate does not match the rate set in your firmware (for example Serial.begin(115200)). Select the same rate and reconnect.",
      },
    ],
  },
  "sound-transfer": {
    title: "Send Data with Sound – Transfer Text Between Devices via Audio",
    intro:
      "Sound Transfer sends text and small files from one device to another using sound. One device plays an encoded audio signal through its speaker and the other listens through its microphone, so no Wi-Fi, Bluetooth, pairing, or cables are needed. It is built on ggwave and offers several protocols, from audible reliable modes (about 8 bytes per second) to faster modes (up to about 32 bytes per second) and ultrasonic modes that most people cannot hear.",
    steps: [
      "Open the tool on both devices and allow microphone access on the receiving device.",
      "On the receiver, start listening.",
      "On the sender, type your message or choose a small file, pick a protocol, and press send.",
      "Keep the devices close together in a quiet room for the best results.",
    ],
    faq: [
      {
        question: "How does data over sound work?",
        answer:
          "The data is encoded into a sequence of audio tones (frequency-shift keying). The receiver records the tones with its microphone and decodes them back into bytes.",
      },
      {
        question: "Which protocol should I use?",
        answer:
          "Use an audible reliable mode in noisy rooms or across a larger distance. Use a faster mode for short distances. Use an ultrasonic mode if you do not want the transfer to be heard, but note that some speakers and microphones cannot handle high frequencies.",
      },
      {
        question: "Is it good for large files?",
        answer:
          "No. Sound has a very low data rate, so it is meant for short text, links, Wi-Fi passwords, and small files.",
      },
    ],
  },
  "har-analyzer": {
    title: "HAR File Viewer & Analyzer – Inspect Network Recordings Online",
    intro:
      "HAR Analyzer opens HTTP Archive (.har) files exported from Chrome, Firefox, Edge, or Safari DevTools and turns them into a readable report. See a request waterfall, timing breakdowns (DNS, connect, TLS, wait, download), traffic grouped by domain, and filters by status code and content type. Sort by slowest or largest requests to find performance problems, and preview request and response headers and bodies. HAR files often contain cookies and tokens, so everything stays in your browser tab.",
    steps: [
      "In browser DevTools, open the Network tab, reproduce the issue, and choose Save all as HAR.",
      "Drop the .har file into HAR Analyzer.",
      "Use the waterfall and timing breakdown to see where time is spent.",
      "Filter by status or type, sort by duration or size, and open a request to inspect headers and bodies.",
    ],
    faq: [
      {
        question: "How do I open a HAR file?",
        answer:
          "A HAR file is JSON. Drop it into HAR Analyzer to see a waterfall, per-request timings, headers, and bodies instead of reading raw JSON.",
      },
      {
        question: "Is it safe to open a HAR file here?",
        answer:
          "HAR files can include cookies, authorization headers, and private response data. HAR Analyzer processes the file locally in your browser and does not upload it.",
      },
      {
        question: "How do I find slow requests?",
        answer:
          "Sort requests by duration, then open a request to see whether the time was spent on DNS, connecting, TLS, waiting for the server (TTFB), or downloading.",
      },
    ],
  },
  "sprite-sheet-studio": {
    title: "Sprite Sheet Generator & Slicer – Pack and Split Sprite Atlases",
    intro:
      "Sprite Sheet Studio packs individual images into a sprite atlas and slices existing sprite sheets back into frames. Choose a uniform grid or compact rows, set padding, and optionally force power-of-two dimensions for game engines. Preview the animation, reorder frames, and export the sheet as PNG together with JSON frame data and CSS classes in a ZIP file.",
    steps: [
      "To pack: add your frames, choose a grid or compact layout, and set padding and size options.",
      "Reorder sprites and preview the animation.",
      "Export PNG, JSON, and CSS as a ZIP.",
      "To slice: open an existing sheet, enter the frame size or grid, and download the frames as PNG files.",
    ],
    faq: [
      {
        question: "How do I split a sprite sheet into frames?",
        answer:
          "Open the sheet in slice mode, set the number of columns and rows or the frame size, and export. Each frame is saved as a separate PNG.",
      },
      {
        question: "Why use power-of-two sizes?",
        answer:
          "Some older GPUs and game engines handle textures with sizes like 256, 512, or 1024 more efficiently. Enable the option if your engine recommends it.",
      },
      { question: "Are my images uploaded?", answer: privacyAnswer },
    ],
  },
  "image-diff": {
    title: "Image Diff – Compare Two Images Online and Highlight Differences",
    intro:
      "Image Diff compares two or more images to find visual differences. Use a draggable reveal slider, an opacity overlay, or a pixel difference heatmap that marks every changed pixel. It works well for visual regression testing, checking design changes, and comparing exports or compression results. Switch between pair, grid, and single-row views, zoom in, and export the diff as PNG.",
    steps: [
      "Add two or more images.",
      "Pick the images to compare with A/B selection.",
      "Use the slider, overlay, or heatmap mode to find differences.",
      "Zoom into details and export the difference image as PNG.",
    ],
    faq: [
      {
        question: "How do I find the differences between two images?",
        answer:
          "Load both images and switch to the difference heatmap. Pixels that changed are highlighted, and identical areas stay dark.",
      },
      {
        question: "Is there a size or image limit?",
        answer: "The tool does not set an upload size or image count limit. Only your device memory limits it.",
      },
      { question: "Are my images uploaded?", answer: privacyAnswer },
    ],
  },
  "env-converter": {
    title: ".env to JSON, YAML, Docker & Kubernetes Converter",
    intro:
      ".env Converter turns a .env file into JSON, YAML, TOML, a docker-compose environment block, a Kubernetes ConfigMap or Secret, GitHub Actions env syntax, docker run -e flags, or shell export lines. It also flattens nested JSON, YAML, or TOML back into .env format. Quotes, multi-line values, ${VAR} expansion, and duplicate keys are handled, secrets can be masked, and you can generate a .env.example file with values removed.",
    steps: [
      "Paste your .env file, or paste JSON / YAML / TOML to convert in the other direction.",
      "Choose the output format, such as Kubernetes Secret or docker-compose.",
      "Turn on secret masking if you are going to share the output.",
      "Copy the result, or generate a .env.example for your repository.",
    ],
    faq: [
      {
        question: "How do I convert a .env file to a Kubernetes Secret?",
        answer:
          "Paste the .env content and choose Kubernetes Secret. The tool outputs a Secret manifest with base64-encoded values that you can apply with kubectl.",
      },
      {
        question: "How do I create a .env.example file?",
        answer:
          "Paste your .env and choose the .env.example output. Keys are kept and values are removed, so the file is safe to commit.",
      },
      { question: "Are my secrets uploaded?", answer: privacyAnswer },
    ],
  },
  "csp-builder": {
    title: "Content Security Policy (CSP) Generator & Evaluator",
    intro:
      "CSP Builder helps you write and check a Content-Security-Policy header. Start from a preset (strict nonce-based, static site, or SPA) and adjust each directive visually. Paste an existing policy to get an A–F grade with warnings for XSS bypasses, unsafe-inline, unsafe-eval, wildcard sources, and missing object-src, base-uri, or frame-ancestors. Generate script hashes and nonces, and export ready-to-use configuration for Nginx, Apache, Caddy, Express, Netlify, Vercel, and Cloudflare.",
    steps: [
      "Choose a preset that matches your site, or paste an existing policy to analyze it.",
      "Adjust directives such as script-src, style-src, and connect-src.",
      "Review the grade and fix the reported weaknesses.",
      "Generate hashes or nonces for inline scripts and copy the config for your server or host.",
    ],
    faq: [
      {
        question: "What is a good Content Security Policy?",
        answer:
          "A strong policy uses nonces or hashes for scripts instead of 'unsafe-inline', sets object-src 'none' and base-uri 'none' or 'self', and restricts frame-ancestors. The strict nonce preset follows these recommendations.",
      },
      {
        question: "How do I add a CSP header in Nginx?",
        answer:
          "Build the policy, choose the Nginx export, and add the generated add_header Content-Security-Policy line to your server block.",
      },
      {
        question: "Why is 'unsafe-inline' a problem?",
        answer:
          "It allows any inline script to run, which makes most XSS attacks possible again and removes much of the protection CSP provides.",
      },
    ],
  },
  "sqlite-studio": {
    title: "SQLite Viewer & Editor Online – Open .db Files in the Browser",
    intro:
      "SQLite Studio opens SQLite database files (.db, .sqlite, .sqlite3) directly in your browser using SQLite compiled to WebAssembly. Browse tables and views in the schema explorer, run SQL queries in an editor, edit data, and export results as CSV or JSON. Nothing needs to be installed, and the database file never leaves your device.",
    steps: [
      "Open a .db, .sqlite, or .sqlite3 file, or create a new empty database.",
      "Browse tables, columns, and indexes in the schema explorer.",
      "Write SQL in the editor and run it to see results in a table.",
      "Export query results as CSV or JSON, or download the modified database.",
    ],
    faq: [
      {
        question: "How do I open a .db file without installing software?",
        answer:
          "If it is a SQLite database, open it in SQLite Studio. The SQLite engine runs in the browser through WebAssembly, so no installation is required.",
      },
      {
        question: "Can I edit the database and save it?",
        answer: "Yes. Run INSERT, UPDATE, DELETE, or schema changes, then download the updated database file.",
      },
      { question: "Is my database uploaded?", answer: privacyAnswer },
    ],
  },
  "subtitle-editor": {
    title: "Subtitle Editor Online – Edit & Convert SRT, VTT and ASS",
    intro:
      "Subtitle Editor lets you edit and convert subtitle files in the browser. It supports SRT, WebVTT, and ASS, shows a synced video preview and a visual timeline, and can shift all timings at once to fix subtitles that are out of sync. Split and merge cues, search and replace text, detect overlapping cues, and convert between formats.",
    steps: [
      "Open a subtitle file, and optionally a video to preview it with.",
      "Edit text and timings in the list or on the timeline.",
      "Use bulk time shift if the subtitles appear too early or too late.",
      "Fix any overlaps reported by the tool and export in SRT, VTT, or ASS format.",
    ],
    faq: [
      {
        question: "How do I fix subtitles that are out of sync?",
        answer:
          "Load the subtitle file and the video, find how many seconds the subtitles are early or late, and apply a bulk time shift to every cue.",
      },
      {
        question: "How do I convert SRT to VTT?",
        answer: "Open the SRT file and export it as WebVTT. Timings and text are converted to the VTT format.",
      },
      { question: "Are my files uploaded?", answer: privacyAnswer },
    ],
  },
  "regex-tester": {
    title: "Regex Tester – Test Regular Expressions Online (JavaScript)",
    intro:
      "Regex Tester lets you write a regular expression and see matches in your test text as you type. It uses the JavaScript regex engine and supports the g, i, m, s, and u flags, capture groups, named groups, and lookahead and lookbehind. Each match and capture group is listed, and a quick reference explains common tokens.",
    steps: [
      "Enter your pattern in the pattern field.",
      "Toggle flags such as g (global), i (case-insensitive), m (multiline), s (dotAll), and u (unicode).",
      "Paste the text you want to search into the test string area.",
      "Review the highlighted matches and the list of capture groups.",
    ],
    faq: [
      {
        question: "Which regex flavor does this use?",
        answer:
          "It uses the JavaScript (ECMAScript) engine built into your browser. Most syntax is shared with PCRE, Python, and Go, but some features such as possessive quantifiers are not available.",
      },
      {
        question: "How do named capture groups work?",
        answer: "Write (?<name>...) to name a group. The match list shows the value captured under each name.",
      },
      {
        question: "What does the s flag do?",
        answer: "The s (dotAll) flag makes the dot . also match line break characters.",
      },
    ],
  },
  jwt: {
    title: "JWT Decoder & Encoder – Decode and Sign JSON Web Tokens",
    intro:
      "The JWT tool decodes JSON Web Tokens to show the header and payload, and creates signed tokens. It supports HS256, HS384, HS512 (shared secret), RS256, RS384, RS512 (RSA), and ES256, ES384, ES512 (ECDSA) with keys in PEM or JWK format. Decoding shows claims such as sub, iat, and exp, so you can quickly see who a token was issued for and when it expires.",
    steps: [
      "Paste a token to decode it and see its header and payload.",
      "To create a token, edit the header and payload JSON.",
      "Choose an algorithm and enter a secret or key.",
      "Copy the signed token.",
    ],
    faq: [
      {
        question: "Is it safe to paste a JWT here?",
        answer:
          "Decoding and signing happen locally in your browser, and the token is not sent to a server. Still, avoid sharing production tokens anywhere you do not need to.",
      },
      {
        question: "Is a JWT encrypted?",
        answer:
          "No. A standard signed JWT (JWS) is only base64url-encoded, so anyone can read the payload. The signature only proves it was not changed.",
      },
      {
        question: "What is the difference between HS256 and RS256?",
        answer:
          "HS256 uses one shared secret to sign and verify. RS256 signs with an RSA private key and verifies with the public key, so verifiers never need the signing secret.",
      },
    ],
  },
  base64: {
    title: "Base64 Encode & Decode – Also Base62, Base58, Base32, Base85",
    intro:
      "Base Encoding converts text to and from Base64, Base64URL, Base62, Base58, Base32, and Base85 (Ascii85). Base64 is used in data URLs, email attachments, and HTTP Basic Auth. Base58 is common in Bitcoin addresses, Base32 in TOTP secrets, and Base85 in PDF and Git binary patches. Encoding and decoding update instantly.",
    steps: [
      "Choose the encoding, for example Base64.",
      "Type or paste text in the input to encode it.",
      "Paste encoded text to decode it back.",
      "Copy the result.",
    ],
    faq: [
      {
        question: "Is Base64 encryption?",
        answer: "No. Base64 is an encoding that anyone can reverse. Do not use it to protect secrets.",
      },
      {
        question: "What is the difference between Base64 and Base64URL?",
        answer:
          "Base64URL replaces + and / with - and _ and usually omits = padding, so the result is safe in URLs and file names. JWTs use Base64URL.",
      },
      { question: "Is my data uploaded?", answer: privacyAnswer },
    ],
  },
  "json-toolkit": {
    title: "JSON Toolkit – JSONPath, JSON Schema Validator & JSON to TypeScript/Go",
    intro:
      "JSON Toolkit combines several JSON tools in one place. Query documents with JSONPath filters, validate JSON against a JSON Schema (Draft 2020-12 or Draft-07) with detailed error paths, infer a schema from sample data, and generate TypeScript interfaces, Go structs, or Rust serde structs from an example payload.",
    steps: [
      "Paste your JSON document.",
      "Pick a mode: JSONPath query, schema validation, schema inference, or code generation.",
      "Enter a JSONPath expression or a schema, or choose the target language.",
      "Copy the result.",
    ],
    faq: [
      {
        question: "How do I generate TypeScript types from JSON?",
        answer:
          "Paste a sample JSON response, choose TypeScript, and copy the generated interfaces. Nested objects become separate interfaces.",
      },
      {
        question: "Which JSON Schema versions are supported?",
        answer: "Draft 2020-12 and Draft-07, with error messages that show the exact path of each failure.",
      },
      { question: "Is my JSON uploaded?", answer: privacyAnswer },
    ],
  },
};

export function getToolGuide(toolId: string | undefined): ToolGuide | undefined {
  return toolId ? toolGuides[toolId] : undefined;
}
