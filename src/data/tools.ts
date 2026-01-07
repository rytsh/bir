export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  path: string;
  keywords: string;
  wasm?: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  tools: Tool[];
}

const rawCategories: Category[] = [
  {
    id: "text",
    name: "Text",
    icon: "📝",
    tools: [
      {
        id: "ascii-table",
        name: "ASCII Table",
        description: "ASCII character reference table with decimal, hex, octal, and binary codes",
        icon: "📋",
        path: "/text/ascii",
        keywords: "ascii table, ascii chart, character codes, ascii reference, hex codes, binary, octal, control characters, character map",
      },
      {
        id: "ansi-colors",
        name: "ANSI Colors",
        description: "Generate ANSI escape codes for colored terminal text with live preview",
        icon: "🎨",
        path: "/text/ansi",
        keywords: "ansi colors, terminal colors, escape codes, ansi escape, color codes, terminal styling, console colors, shell colors",
      },
      {
        id: "text-diff",
        name: "Diff",
        description: "Compare two texts and highlight differences",
        icon: "🔍",
        path: "/text/diff",
        keywords: "text diff, text comparison, diff tool, compare text, text difference, file diff, text comparison tool",
      },
      {
        id: "emoji-picker",
        name: "Emoji",
        description: "Browse and copy emojis organized by category",
        icon: "🥳",
        path: "/text/emoji",
        keywords: "emoji picker, emoji list, copy emoji, emoji search, emoticons, smileys, unicode emoji, emoji keyboard",
      },
      {
        id: "text-escape",
        name: "Escape",
        description: "Escape or unescape text for JSON, HTML, URL, Regex, Shell, SQL, CSV",
        icon: "🔡",
        path: "/text/escape",
        keywords: "text escape, unescape text, escape characters, JSON escape, HTML escape, URL escape, regex escape, shell escape, SQL escape, CSV escape",
      },
      {
        id: "font-glyphs",
        name: "Font Glyphs",
        description: "View and copy glyphs from font files",
        icon: "🔤",
        path: "/text/glyphs",
        keywords: "font glyphs, font viewer, glyph viewer, font characters, unicode glyphs, font inspection, character map",
      },
      {
        id: "lorem-ipsum",
        name: "Lorem Ipsum",
        description: "Generate lorem ipsum placeholder text with customizable length and format",
        icon: "📜",
        path: "/text/random",
        keywords: "lorem ipsum, placeholder text, dummy text, random text, filler text, lipsum, text generator, sample text",
      },
      {
        id: "text-transform",
        name: "Transform",
        description: "Transform text with sorting, case conversion, and line operations",
        icon: "🔄",
        path: "/text/transform",
        keywords: "text transform, text manipulation, sort lines, alphabetize, reverse text, randomize lines, uppercase, lowercase, snake case, title case, camel case, kebab case, pascal case, text formatting",
      },
      {
        id: "nato-alphabet",
        name: "NATO Alphabet",
        description: "Convert text to NATO phonetic alphabet",
        icon: "🔊",
        path: "/text/nato",
        keywords: "nato alphabet, phonetic alphabet, spelling alphabet, nato converter, alfa bravo charlie, military alphabet, aviation alphabet, radio alphabet",
      },
      {
        id: "text-obfuscator",
        name: "Obfuscator",
        description: "Obfuscate text with various methods like asterisks, ROT13, leetspeak, and more",
        icon: "🙈",
        path: "/text/obfuscator",
        keywords: "text obfuscator, mask text, hide text, asterisk, rot13, leetspeak, 1337, scramble text, censor text, redact text, privacy, obfuscation",
      },
      {
        id: "ascii-art",
        name: "ASCII Art",
        description: "Generate ASCII art text using various stylized fonts like Banner, Doom, and Graffiti",
        icon: "🪧",
        path: "/text/ascii-art",
        keywords: "ascii art, text art, figlet, banner text, ascii font, text to ascii, ascii generator, text banner, ascii text, block letters, fancy text",
      },
    ],
  },
  {
    id: "converters",
    name: "Converters",
    icon: "🔄",
    tools: [
      {
        id: "data-converter",
        name: "Data Converter",
        description: "Convert between JSON, YAML, TOML, and TOON formats",
        icon: "📄",
        path: "/converter/data",
        keywords: "data converter, JSON converter, YAML converter, TOML converter, format conversion, data format, JSON to YAML, YAML to JSON, TOML converter",
      },
      {
        id: "formatter",
        name: "Formatter",
        description: "Format and prettify JSON, YAML, TOML, and Markdown with customizable indentation",
        icon: "✨",
        path: "/converter/formatter",
        keywords: "formatter, prettifier, beautifier, JSON formatter, YAML formatter, TOML formatter, Markdown formatter, code formatter, pretty print, format code, beautify",
      },
      {
        id: "bitwise-calculator",
        name: "Bitwise",
        description: "Perform bitwise operations (AND, OR, XOR, NOT, shifts) with visual bit representation",
        icon: "🔣",
        path: "/converter/bitwise",
        keywords: "bitwise calculator, bitwise operations, AND, OR, XOR, NOT, bit shift, left shift, right shift, binary calculator, bit manipulation, binary operations, bit masking",
      },
      {
        id: "cron-parser",
        name: "Cron",
        description: "Parse and explain cron expressions with next and previous run times",
        icon: "⏰",
        path: "/converter/cron",
        keywords: "cron parser, cron expression, cron schedule, cron syntax, crontab, cron converter, cron explainer, cron next run, cron previous run, scheduled tasks",
        wasm: true,
      },
      {
        id: "julian-converter",
        name: "Julian Date",
        description: "Convert between Julian Date and calendar date",
        icon: "📅",
        path: "/converter/julian",
        keywords: "julian date, date converter, julian calendar, calendar conversion, astronomical date, julian day, date format",
      },
      {
        id: "number-converter",
        name: "Number Base",
        description: "Convert numbers between bases (binary, octal, decimal, hex) and Roman numerals",
        icon: "🔢",
        path: "/converter/number",
        keywords: "number converter, base converter, binary converter, hex converter, octal converter, decimal converter, roman numerals, radix, number base, hexadecimal, base 2, base 8, base 10, base 16",
      },
      {
        id: "timestamp-converter",
        name: "Timestamp",
        description: "Convert Unix timestamps to human-readable dates and formats",
        icon: "🕰️",
        path: "/converter/timestamp",
        keywords: "timestamp converter, unix timestamp, epoch time, date converter, unix time, epoch converter, time converter, rfc3339, iso8601",
      },
    ],
  },
  {
    id: "encoders-decoders",
    name: "Encoders / Decoders",
    icon: "🔐",
    tools: [
      {
        id: "base64",
        name: "Base Encoding",
        description: "Encode and decode Base64, Base62, Base58, Base32, and Base85 (Ascii85) strings",
        icon: "📝",
        path: "/codecs/base64",
        keywords: "base64, base62, base58, base32, base85, ascii85, encoder, decoder, encode, decode, converter, string, binary encoding, url shortener",
      },
      {
        id: "basic-auth",
        name: "Basic Auth",
        description: "Encode and decode HTTP Basic Authentication headers",
        icon: "🔑",
        path: "/codecs/basic-auth",
        keywords: "basic auth, basic authentication, http auth, authorization header, basic auth encoder, basic auth decoder, http basic, credentials encoder",
      },
      {
        id: "html-encoder",
        name: "HTML",
        description: "Encode and decode HTML entities",
        icon: "🔤",
        path: "/codecs/html",
        keywords: "html encoder, html decoder, html entities, html escape, html unescape, html converter, html encoding",
      },
      {
        id: "url-encoder",
        name: "URL",
        description: "Encode and decode URL components",
        icon: "🔗",
        path: "/codecs/url",
        keywords: "url encoder, url decoder, url encoding, url decoding, percent encoding, url converter, url escape",
      },
      {
        id: "hex-viewer",
        name: "Hex Viewer",
        description: "View hex dump of text, files, or Base64 data",
        icon: "🔢",
        path: "/codecs/hex",
        keywords: "hex viewer, hex dump, hexadecimal viewer, hex converter, binary viewer, hex editor, file hex, base64 hex",
      },
      {
        id: "jwt",
        name: "JWT",
        description: "Encode and decode JSON Web Tokens",
        icon: "🎟️",
        path: "/codecs/jwt",
        keywords: "jwt, json web token, jwt decoder, jwt encoder, jwt parser, token decoder, jwt converter, web token",
      },
      {
        id: "luhn",
        name: "Luhn",
        description: "Validate credit card numbers using the Luhn algorithm",
        icon: "💳",
        path: "/codecs/luhn",
        keywords: "luhn algorithm, credit card validator, luhn check, card validation, credit card checker, luhn checksum, payment validation",
      },
      {
        id: "morse",
        name: "Morse Code",
        description: "Encode text to Morse code or decode Morse code to text with visual flash playback",
        icon: "📡",
        path: "/codecs/morse",
        keywords: "morse code, morse encoder, morse decoder, morse converter, morse translator, dot dash, telegraph, signal, flash, visual morse",
      },
      {
        id: "key-code",
        name: "Key Code",
        description: "Display keyboard event key codes, codes, and properties for JavaScript development",
        icon: "⌨️",
        path: "/codecs/key-code",
        keywords: "key code, keycode, keyboard event, keydown, keyup, keypress, javascript keyboard, event.key, event.code, event.keyCode, keyboard listener, hotkey, shortcut",
      },
    ],
  },
  {
    id: "generators",
    name: "Generators",
    icon: "⚡",
    tools: [
      {
        id: "barcode-generator",
        name: "Barcode",
        description: "Generate barcodes and QR codes with WiFi support, custom colors, and frames",
        icon: "📊",
        path: "/generators/barcode",
        keywords: "barcode generator, qr code generator, barcode creator, qr code maker, wifi qr code, barcode generator, qr code custom, barcode design",
      },
      {
        id: "bcrypt-generator",
        name: "Bcrypt",
        description: "Generate and validate bcrypt password hashes with htpasswd support",
        icon: "🔐",
        path: "/generators/bcrypt",
        keywords: "bcrypt, bcrypt generator, bcrypt validator, password hash, hash generator, password hashing, bcrypt hash, secure password, htpasswd, apache password, nginx auth, basic auth",
      },
      {
        id: "hash-generator",
        name: "Hash",
        description: "Generate MD5, SHA-1, SHA-256, SHA-512 hashes with HMAC support",
        icon: "#️⃣",
        path: "/generators/hash",
        keywords: "hash generator, md5, sha1, sha256, sha512, hmac, hash calculator, checksum, cryptographic hash, message digest",
      },
      {
        id: "id-generator",
        name: "ID",
        description: "Generate UUIDs (v1, v4, v7), ULIDs, Nano IDs, CUID2s, and KSUIDs",
        icon: "🏷️",
        path: "/generators/id",
        keywords: "uuid generator, ulid generator, nanoid generator, cuid generator, ksuid generator, unique id, uuid v1, uuid v4, uuid v7, identifier generator, random id, unique identifier, nano id, cuid2, k-sortable",
      },
      {
        id: "key-generator",
        name: "RSA Key",
        description: "Generate RSA public and private key pairs",
        icon: "🗝️",
        path: "/generators/key",
        keywords: "rsa key generator, rsa key pair, public key, private key, rsa encryption, ssl key, certificate generator, cryptographic key",
      },
      {
        id: "password-generator",
        name: "Password",
        description: "Generate secure random passwords with customizable options",
        icon: "🔒",
        path: "/generators/password",
        keywords: "password generator, secure password, random password, password creator, strong password, password generator, password security",
      },
      {
        id: "totp-generator",
        name: "TOTP",
        description: "Generate and verify Time-based One-Time Passwords for two-factor authentication",
        icon: "🔑",
        path: "/generators/totp",
        keywords: "totp, otp, one-time password, 2fa, two-factor authentication, authenticator, google authenticator, authy, mfa, multi-factor, time-based, security code",
      },
      {
        id: "fake-data-generator",
        name: "Fake Data",
        description: "Generate fake data for testing with names, emails, addresses, and more",
        icon: "🎭",
        path: "/generators/fake-data",
        keywords: "fake data, mock data, test data, faker, dummy data, sample data, random data, name generator, email generator, address generator, json generator, csv generator",
      },
    ],
  },
  {
    id: "timers",
    name: "Timers",
    icon: "⏱️",
    tools: [
      {
        id: "countdown-timer",
        name: "Countdown",
        description: "Customizable countdown timer with color themes, presets, and end-of-time alerts",
        icon: "⏳",
        path: "/timers/countdown",
        keywords: "countdown timer, timer, countdown clock, pomodoro, stopwatch, time tracker, alarm, kitchen timer, presentation timer",
      },
      {
        id: "world-clock",
        name: "World Clock",
        description: "Display multiple clocks for different timezones with day/night indicators",
        icon: "🌍",
        path: "/timers/world-clock",
        keywords: "world clock, timezone, time zones, international time, global clock, city time, timezone converter, utc, gmt, time difference",
      },
    ],
  },
  {
    id: "network",
    name: "Network",
    icon: "🌐",
    tools: [
      {
        id: "subnet-calculator",
        name: "IP Subnet",
        description: "Calculate subnet details from IP address and CIDR notation",
        icon: "🔢",
        path: "/network/subnet",
        keywords: "subnet calculator, ip calculator, cidr, network address, broadcast address, subnet mask, wildcard mask, ip range, network calculator, ipv4",
      },
      {
        id: "port-reference",
        name: "Port Reference",
        description: "Reference for common network ports, protocols, and services",
        icon: "🚪",
        path: "/network/ports",
        keywords: "port reference, network ports, tcp ports, udp ports, well-known ports, service ports, port numbers, port list, firewall ports, common ports, http port, ssh port, ftp port",
      },
    ],
  },
  {
    id: "party",
    name: "Party",
    icon: "🎉",
    tools: [
      {
        id: "name-picker",
        name: "Name Picker",
        description: "Spin a wheel to pick random names with prize support and winner history",
        icon: "🎡",
        path: "/party/name-picker",
        keywords: "name picker, random picker, wheel spinner, raffle, lucky draw, prize wheel, random name, winner picker, spin wheel, lottery",
      },
      {
        id: "camera",
        name: "Camera",
        description: "Record video and take photos from your camera with audio support",
        icon: "📹",
        path: "/party/camera",
        keywords: "camera, webcam, video recorder, camera recorder, record video, take photo, photo capture, video capture, selfie, webcam video, record webcam",
      },
    ],
  },
  {
    id: "graphics",
    name: "Graphics",
    icon: "🖼️",
    tools: [
      {
        id: "color-picker",
        name: "Color Picker",
        description: "Pick colors, convert between formats, and generate harmonious palettes",
        icon: "🎨",
        path: "/graphics/color-picker",
        keywords: "color picker, color converter, hex color, rgb color, hsl color, hsv color, color formats, color code, web colors, color selector, color palette, palette generator, complementary colors, triadic colors, analogous colors, color scheme, color harmony, design colors",
      },
      {
        id: "image-base64",
        name: "Image to Base64",
        description: "Convert images to Base64 data URIs and decode Base64 back to images",
        icon: "🖼️",
        path: "/graphics/image-base64",
        keywords: "image base64, base64 image, data uri, image encoder, image decoder, base64 converter, image to string, embed image",
      },
      {
        id: "gradient-generator",
        name: "Gradient Generator",
        description: "Create CSS linear and radial gradients with visual editor and code output",
        icon: "🌈",
        path: "/graphics/gradient",
        keywords: "gradient generator, css gradient, linear gradient, radial gradient, color gradient, background gradient, gradient maker",
      },
      {
        id: "shadow-generator",
        name: "Shadow Generator",
        description: "Generate CSS box-shadow and text-shadow with visual preview",
        icon: "🌒",
        path: "/graphics/shadow",
        keywords: "shadow generator, box shadow, text shadow, css shadow, drop shadow, shadow effect, shadow maker",
      },
      {
        id: "image-resizer",
        name: "Image Resizer",
        description: "Resize and crop images in browser with aspect ratio control",
        icon: "📏",
        path: "/graphics/image-resizer",
        keywords: "image resizer, resize image, crop image, image dimensions, scale image, image size, image editor",
      },
      {
        id: "placeholder-image",
        name: "Placeholder Image",
        description: "Generate placeholder images with custom dimensions, colors, and text",
        icon: "🏞️",
        path: "/graphics/placeholder",
        keywords: "placeholder image, dummy image, placeholder generator, mock image, test image, filler image, image placeholder",
      },
      {
        id: "contrast-checker",
        name: "Contrast Checker",
        description: "Check WCAG color contrast ratios for accessibility compliance",
        icon: "🪟",
        path: "/graphics/contrast",
        keywords: "contrast checker, wcag contrast, accessibility checker, color contrast, a11y, contrast ratio, color accessibility",
      },
      {
        id: "image-compressor",
        name: "Image Compressor",
        description: "Compress JPEG and PNG images to reduce file size",
        icon: "🗜️",
        path: "/graphics/compressor",
        keywords: "image compressor, compress image, reduce image size, optimize image, image optimization, jpeg compression, png compression",
      },
      {
        id: "image-metadata",
        name: "Image Metadata",
        description: "View and remove EXIF metadata from images for privacy",
        icon: "🔍",
        path: "/graphics/image-metadata",
        keywords: "exif viewer, image metadata, remove exif, metadata remover, photo metadata, gps data, camera info, privacy, jpeg metadata, png metadata, exif remover, strip metadata",
      },
    ],
  },
  {
    id: "tester",
    name: "Tester",
    icon: "🧪",
    tools: [
      {
        id: "dead-pixel-tester",
        name: "Dead Pixel",
        description: "Test your screen for dead pixels by displaying solid colors and patterns",
        icon: "🖥️",
        path: "/tester/dead-pixel",
        keywords: "dead pixel, pixel test, screen test, dead pixels, stuck pixels, monitor test, display test, pixel tester",
      },
      {
        id: "input-tester",
        name: "Input Tester",
        description: "Test keyboard and gamepad inputs with real-time event display",
        icon: "🎮",
        path: "/tester/input",
        keywords: "key code, keycode, keyboard event, keydown, keyup, keypress, javascript keyboard, event.key, event.code, event.keyCode, keyboard listener, hotkey, shortcut, gamepad, controller, joystick, gamepad api, controller test, button test, analog stick",
      },
      {
        id: "screen-resolution",
        name: "Screen Resolution",
        description: "View screen resolution, window size, pixel density, and display information",
        icon: "📺",
        path: "/tester/screen",
        keywords: "screen resolution, display size, pixel density, retina, dpi, window size, viewport, aspect ratio, monitor resolution, screen info",
      },
      {
        id: "browser-info",
        name: "Browser Info",
        description: "View browser capabilities, supported APIs, storage, and system features",
        icon: "🌐",
        path: "/tester/browser",
        keywords: "browser info, browser capabilities, web api support, feature detection, browser test, webgl, service worker, local storage, cookies, user agent",
      },
    ],
  },
];

// Sort categories by name and sort tools within each category by name
export const categories: Category[] = rawCategories
  .map((category) => ({
    ...category,
    tools: [...category.tools].sort((a, b) => a.name.localeCompare(b.name)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function getAllTools(): Tool[] {
  return categories.flatMap((category) => category.tools);
}

export function getToolById(id: string): Tool | undefined {
  return getAllTools().find((tool) => tool.id === id);
}

export function getCategoryByToolId(toolId: string): Category | undefined {
  return categories.find((category) => category.tools.some((tool) => tool.id === toolId));
}

export function getToolByPath(path: string): Tool | undefined {
  return getAllTools().find((tool) => tool.path === path);
}
