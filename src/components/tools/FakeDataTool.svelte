<script lang="ts">
  import { faker, Faker, base, en, de, es, fr, it, ja, ko, nl, pl, pt_BR, ru, tr, zh_CN } from "@faker-js/faker";
  import Sortable from "sortablejs";

  interface Field {
    id: string;
    name: string;
    type: string;
    category: string;
  }

  interface GeneratedRow {
    [key: string]: string | number | boolean;
  }

  const fieldCategories = [
    {
      name: "Person",
      fields: [
        { type: "person.firstName", name: "First Name" },
        { type: "person.lastName", name: "Last Name" },
        { type: "person.fullName", name: "Full Name" },
        { type: "person.gender", name: "Gender" },
        { type: "person.jobTitle", name: "Job Title" },
        { type: "person.jobArea", name: "Job Area" },
        { type: "person.bio", name: "Bio" },
      ],
    },
    {
      name: "Internet",
      fields: [
        { type: "internet.email", name: "Email" },
        { type: "internet.username", name: "Username" },
        { type: "internet.password", name: "Password" },
        { type: "internet.url", name: "URL" },
        { type: "internet.domainName", name: "Domain" },
        { type: "internet.ip", name: "IPv4" },
        { type: "internet.ipv6", name: "IPv6" },
        { type: "internet.mac", name: "MAC Address" },
        { type: "internet.userAgent", name: "User Agent" },
      ],
    },
    {
      name: "Location",
      fields: [
        { type: "location.streetAddress", name: "Street Address" },
        { type: "location.city", name: "City" },
        { type: "location.state", name: "State" },
        { type: "location.zipCode", name: "Zip Code" },
        { type: "location.country", name: "Country" },
        { type: "location.countryCode", name: "Country Code" },
        { type: "location.latitude", name: "Latitude" },
        { type: "location.longitude", name: "Longitude" },
        { type: "location.timeZone", name: "Timezone" },
      ],
    },
    {
      name: "Phone",
      fields: [
        { type: "phone.number", name: "Phone Number" },
        { type: "phone.imei", name: "IMEI" },
      ],
    },
    {
      name: "Company",
      fields: [
        { type: "company.name", name: "Company Name" },
        { type: "company.catchPhrase", name: "Catch Phrase" },
        { type: "company.buzzPhrase", name: "Buzz Phrase" },
      ],
    },
    {
      name: "Finance",
      fields: [
        { type: "finance.accountNumber", name: "Account Number" },
        { type: "finance.amount", name: "Amount" },
        { type: "finance.creditCardNumber", name: "Credit Card" },
        { type: "finance.creditCardCVV", name: "CVV" },
        { type: "finance.currencyCode", name: "Currency Code" },
        { type: "finance.bitcoinAddress", name: "Bitcoin Address" },
        { type: "finance.ethereumAddress", name: "Ethereum Address" },
        { type: "finance.iban", name: "IBAN" },
        { type: "finance.bic", name: "BIC/SWIFT" },
      ],
    },
    {
      name: "Date",
      fields: [
        { type: "date.past", name: "Past Date" },
        { type: "date.future", name: "Future Date" },
        { type: "date.recent", name: "Recent Date" },
        { type: "date.birthdate", name: "Birthdate" },
      ],
    },
    {
      name: "Lorem",
      fields: [
        { type: "lorem.word", name: "Word" },
        { type: "lorem.words", name: "Words" },
        { type: "lorem.sentence", name: "Sentence" },
        { type: "lorem.paragraph", name: "Paragraph" },
      ],
    },
    {
      name: "Commerce",
      fields: [
        { type: "commerce.productName", name: "Product Name" },
        { type: "commerce.price", name: "Price" },
        { type: "commerce.productDescription", name: "Product Description" },
        { type: "commerce.department", name: "Department" },
        { type: "commerce.isbn", name: "ISBN" },
      ],
    },
    {
      name: "Book",
      fields: [
        { type: "book.title", name: "Book Title" },
        { type: "book.author", name: "Book Author" },
        { type: "book.genre", name: "Genre" },
        { type: "book.publisher", name: "Publisher" },
        { type: "book.series", name: "Series" },
        { type: "book.format", name: "Format" },
      ],
    },
    {
      name: "Database",
      fields: [
        { type: "database.column", name: "Column Name" },
        { type: "database.type", name: "DB Type" },
        { type: "database.engine", name: "DB Engine" },
        { type: "database.mongodbObjectId", name: "MongoDB ObjectId" },
      ],
    },
    {
      name: "System",
      fields: [
        { type: "system.fileName", name: "File Name" },
        { type: "system.fileExt", name: "File Extension" },
        { type: "system.mimeType", name: "MIME Type" },
        { type: "system.filePath", name: "File Path" },
        { type: "system.semver", name: "Semver" },
      ],
    },
    {
      name: "Identifiers",
      fields: [
        { type: "string.uuid", name: "UUID" },
        { type: "string.ulid", name: "ULID" },
        { type: "string.nanoid", name: "Nano ID" },
        { type: "string.alphanumeric", name: "Alphanumeric" },
        { type: "string.hexadecimal", name: "Hexadecimal" },
        { type: "number.int", name: "Integer" },
        { type: "number.float", name: "Float" },
        { type: "datatype.boolean", name: "Boolean" },
      ],
    },
    {
      name: "Color",
      fields: [
        { type: "color.human", name: "Color Name" },
        { type: "color.rgb", name: "RGB" },
        { type: "color.hsl", name: "HSL" },
      ],
    },
    {
      name: "Vehicle",
      fields: [
        { type: "vehicle.vehicle", name: "Vehicle" },
        { type: "vehicle.manufacturer", name: "Manufacturer" },
        { type: "vehicle.model", name: "Model" },
        { type: "vehicle.vin", name: "VIN" },
        { type: "vehicle.vrm", name: "License Plate" },
      ],
    },
    {
      name: "Image",
      fields: [
        { type: "image.avatar", name: "Avatar URL" },
        { type: "image.url", name: "Image URL" },
      ],
    },
  ];

  let selectedFields = $state<Field[]>([
    { id: crypto.randomUUID(), name: "Full Name", type: "person.fullName", category: "Person" },
    { id: crypto.randomUUID(), name: "Email", type: "internet.email", category: "Internet" },
    { id: crypto.randomUUID(), name: "City", type: "location.city", category: "Location" },
  ]);

  let rowCount = $state(10);
  let outputFormat = $state<"json" | "csv" | "tsv" | "sql">("json");
  let tableName = $state("users");
  let generatedData = $state<GeneratedRow[]>([]);
  let copied = $state(false);

  // Sortable container ref
  let fieldsContainer: HTMLDivElement | null = $state(null);
  let sortableInstance: Sortable | null = null;

  // Initialize Sortable when container is available
  $effect(() => {
    if (fieldsContainer && !sortableInstance) {
      sortableInstance = Sortable.create(fieldsContainer, {
        animation: 150,
        handle: ".drag-handle",
        ghostClass: "opacity-50",
        chosenClass: "bg-(--color-accent)/20",
        onEnd: (evt) => {
          if (evt.oldIndex !== undefined && evt.newIndex !== undefined) {
            const newFields = [...selectedFields];
            const [movedItem] = newFields.splice(evt.oldIndex, 1);
            newFields.splice(evt.newIndex, 0, movedItem);
            selectedFields = newFields;
          }
        },
      });
    }

    return () => {
      if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
      }
    };
  });

  // Locale support
  const localeMap: Record<string, typeof en> = {
    en, de, es, fr, it, ja, ko, nl, pl, pt_BR, ru, tr, zh_CN,
  };

  const locales = [
    { code: "en", name: "English" },
    { code: "de", name: "German" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "it", name: "Italian" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "nl", name: "Dutch" },
    { code: "pl", name: "Polish" },
    { code: "pt_BR", name: "Portuguese (Brazil)" },
    { code: "ru", name: "Russian" },
    { code: "tr", name: "Turkish" },
    { code: "zh_CN", name: "Chinese (Simplified)" },
  ];
  let selectedLocale = $state("en");

  function getFaker(): Faker {
    const locale = localeMap[selectedLocale] || en;
    return new Faker({ locale: [locale, en, base] });
  }

  function generateValue(fakerInstance: Faker, type: string): string | number | boolean {
    const [module, method] = type.split(".");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakerModule = (fakerInstance as any)[module];
      if (fakerModule && typeof fakerModule[method] === "function") {
        const value = fakerModule[method]();
        if (value instanceof Date) {
          return value.toISOString().split("T")[0];
        }
        return value as string | number | boolean;
      }
    } catch {
      // Fall through to return type
    }
    return type;
  }

  function generate() {
    const fakerInstance = getFaker();
    
    const data: GeneratedRow[] = [];
    for (let i = 0; i < rowCount; i++) {
      const row: GeneratedRow = {};
      for (const field of selectedFields) {
        const key = field.name.toLowerCase().replace(/\s+/g, "_");
        row[key] = generateValue(fakerInstance, field.type);
      }
      data.push(row);
    }
    generatedData = data;
  }

  function addField(type: string, name: string, category: string) {
    selectedFields = [...selectedFields, { 
      id: crypto.randomUUID(), 
      name, 
      type,
      category 
    }];
  }

  function removeField(id: string) {
    selectedFields = selectedFields.filter(f => f.id !== id);
  }

  function formatOutput(): string {
    if (generatedData.length === 0) return "";
    
    if (outputFormat === "json") {
      return JSON.stringify(generatedData, null, 2);
    }
    
    if (outputFormat === "csv" || outputFormat === "tsv") {
      const delimiter = outputFormat === "csv" ? "," : "\t";
      const keys = Object.keys(generatedData[0]);
      const header = keys.join(delimiter);
      const rows = generatedData.map(row => 
        keys.map(k => {
          const val = row[k];
          const str = String(val);
          // Quote if contains delimiter, quotes, or newlines
          if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(delimiter)
      );
      return [header, ...rows].join("\n");
    }
    
    if (outputFormat === "sql") {
      const keys = Object.keys(generatedData[0]);
      const inserts = generatedData.map(row => {
        const values = keys.map(k => {
          const val = row[k];
          if (typeof val === "string") {
            return `'${val.replace(/'/g, "''")}'`;
          }
          if (typeof val === "boolean") {
            return val ? "TRUE" : "FALSE";
          }
          return val;
        });
        return `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${values.join(", ")});`;
      });
      return inserts.join("\n");
    }
    
    return "";
  }

  const output = $derived(formatOutput());

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  function downloadOutput() {
    const extensions: Record<string, string> = {
      json: "json",
      csv: "csv",
      tsv: "tsv",
      sql: "sql",
    };
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fake-data.${extensions[outputFormat]}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Presets
  const presets = [
    {
      name: "Users",
      fields: [
        { name: "Full Name", type: "person.fullName", category: "Person" },
        { name: "Email", type: "internet.email", category: "Internet" },
        { name: "Username", type: "internet.username", category: "Internet" },
        { name: "City", type: "location.city", category: "Location" },
      ],
    },
    {
      name: "Products",
      fields: [
        { name: "Product Name", type: "commerce.productName", category: "Commerce" },
        { name: "Price", type: "commerce.price", category: "Commerce" },
        { name: "Department", type: "commerce.department", category: "Commerce" },
        { name: "Product Description", type: "commerce.productDescription", category: "Commerce" },
      ],
    },
    {
      name: "Addresses",
      fields: [
        { name: "Street Address", type: "location.streetAddress", category: "Location" },
        { name: "City", type: "location.city", category: "Location" },
        { name: "State", type: "location.state", category: "Location" },
        { name: "Zip Code", type: "location.zipCode", category: "Location" },
        { name: "Country", type: "location.country", category: "Location" },
      ],
    },
    {
      name: "Employees",
      fields: [
        { name: "Full Name", type: "person.fullName", category: "Person" },
        { name: "Email", type: "internet.email", category: "Internet" },
        { name: "Job Title", type: "person.jobTitle", category: "Person" },
        { name: "Company Name", type: "company.name", category: "Company" },
        { name: "Phone Number", type: "phone.number", category: "Phone" },
      ],
    },
  ];

  function applyPreset(preset: typeof presets[0]) {
    selectedFields = preset.fields.map(f => ({
      ...f,
      id: crypto.randomUUID(),
    }));
  }
</script>

<div class="h-full flex flex-col gap-4">
  <header>
    <p class="text-sm text-(--color-text-muted)">
      Generate fake data for testing and development using various field types.
    </p>
  </header>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
    <!-- Left: Field Selection -->
    <div class="flex flex-col gap-4 overflow-auto">
      <!-- Presets -->
      <div class="flex flex-wrap gap-2">
        <span class="text-sm text-(--color-text-muted)">Presets:</span>
        {#each presets as preset}
          <button
            onclick={() => applyPreset(preset)}
            class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-bg-alt) transition-colors"
          >
            {preset.name}
          </button>
        {/each}
      </div>

      <!-- Selected Fields -->
      <div class="border border-(--color-border) p-3">
        <div class="text-sm font-medium mb-2">Selected Fields ({selectedFields.length})</div>
        {#if selectedFields.length === 0}
          <p class="text-sm text-(--color-text-muted)">No fields selected. Add fields from below.</p>
        {:else}
          <div class="flex flex-col gap-1" bind:this={fieldsContainer}>
            {#each selectedFields as field (field.id)}
              <div class="flex items-center gap-2 py-1 px-2 bg-(--color-bg-alt) text-sm" data-id={field.id}>
                <span class="drag-handle cursor-grab active:cursor-grabbing text-(--color-text-muted) hover:text-(--color-text) px-1">
                  ⠿
                </span>
                <span class="flex-1 font-medium">{field.name}</span>
                <span class="text-xs text-(--color-text-muted)">{field.type}</span>
                <button
                  onclick={() => removeField(field.id)}
                  class="p-1 hover:text-red-500"
                >
                  ×
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Field Categories -->
      <div class="border border-(--color-border) p-3 flex-1 overflow-auto">
        <div class="text-sm font-medium mb-2">Available Fields</div>
        <div class="flex flex-col gap-3">
          {#each fieldCategories as category}
            <div>
              <div class="text-xs font-medium text-(--color-text-muted) mb-1">{category.name}</div>
              <div class="flex flex-wrap gap-1">
                {#each category.fields as field}
                  <button
                    onclick={() => addField(field.type, field.name, category.name)}
                    class="px-2 py-0.5 text-xs border border-(--color-border) hover:bg-(--color-accent) hover:text-(--color-btn-text) transition-colors"
                  >
                    {field.name}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Right: Output -->
    <div class="flex flex-col gap-4 min-h-0">
      <!-- Controls -->
      <div class="flex flex-wrap gap-3 items-center">
        <div class="flex items-center gap-2">
          <label class="text-sm">Rows:</label>
          <input
            type="number"
            bind:value={rowCount}
            min="1"
            max="1000"
            class="w-20 px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="text-sm">Format:</label>
          <select
            bind:value={outputFormat}
            class="px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="tsv">TSV</option>
            <option value="sql">SQL</option>
          </select>
        </div>

        {#if outputFormat === "sql"}
          <div class="flex items-center gap-2">
            <label class="text-sm">Table:</label>
            <input
              type="text"
              bind:value={tableName}
              class="w-24 px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
            />
          </div>
        {/if}

        <div class="flex items-center gap-2">
          <label class="text-sm">Locale:</label>
          <select
            bind:value={selectedLocale}
            class="px-2 py-1 text-sm border border-(--color-border) bg-(--color-bg) text-(--color-text)"
          >
            {#each locales as locale}
              <option value={locale.code}>{locale.name}</option>
            {/each}
          </select>
        </div>

        <button
          onclick={generate}
          disabled={selectedFields.length === 0}
          class="px-4 py-1 bg-(--color-accent) text-(--color-btn-text) hover:bg-(--color-accent-hover) transition-colors text-sm font-medium disabled:opacity-50"
        >
          Generate
        </button>
      </div>

      <!-- Output -->
      <div class="flex-1 flex flex-col min-h-0 border border-(--color-border)">
        <div class="flex items-center justify-between px-3 py-2 border-b border-(--color-border) bg-(--color-bg-alt)">
          <span class="text-sm font-medium">Output</span>
          <div class="flex gap-2">
            <button
              onclick={copyOutput}
              disabled={!output}
              class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-bg) transition-colors disabled:opacity-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onclick={downloadOutput}
              disabled={!output}
              class="px-2 py-1 text-xs border border-(--color-border) hover:bg-(--color-bg) transition-colors disabled:opacity-50"
            >
              Download
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-3">
          {#if output}
            <pre class="text-xs font-mono whitespace-pre-wrap break-all">{output}</pre>
          {:else}
            <p class="text-sm text-(--color-text-muted)">
              Select fields and click Generate to create fake data.
            </p>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
