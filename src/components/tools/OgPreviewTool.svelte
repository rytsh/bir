<script lang="ts">
  let ogTitle = $state("My Awesome Page");
  let ogDescription = $state("This is a description of the page that will appear when shared on social media platforms.");
  let ogImage = $state("https://placehold.co/1200x630/1a1a1a/ffffff?text=OG+Image");
  let ogSiteName = $state("example.com");
  let ogUrl = $state("https://example.com/page");
  let twitterCard = $state<"summary" | "summary_large_image">("summary_large_image");

  let copiedNotice = $state("");
  let activePreview = $state<"twitter" | "facebook" | "linkedin" | "discord" | "slack">("twitter");

  // URL fetch
  let fetchUrl = $state("");
  let fetching = $state(false);
  let fetchError = $state("");
  let detectedTags = $state<Array<{ property: string; content: string }>>([]);

  function extractMetaTags(html: string, baseUrl: string): Array<{ property: string; content: string }> {
    const tags: Array<{ property: string; content: string }> = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Extract OG tags
    const metas = doc.querySelectorAll("meta[property], meta[name]");
    for (const meta of metas) {
      const property = meta.getAttribute("property") || meta.getAttribute("name") || "";
      const content = meta.getAttribute("content") || "";
      if (property && content) {
        tags.push({ property, content });
      }
    }

    // Also grab <title> as fallback
    const titleEl = doc.querySelector("title");
    if (titleEl?.textContent) {
      tags.push({ property: "title", content: titleEl.textContent.trim() });
    }

    // Resolve relative image URLs
    return tags.map((t) => {
      if ((t.property === "og:image" || t.property === "twitter:image") && t.content && !t.content.startsWith("http")) {
        try {
          t.content = new URL(t.content, baseUrl).href;
        } catch {
          // keep as-is
        }
      }
      return t;
    });
  }

  function getTagValue(tags: Array<{ property: string; content: string }>, ...keys: string[]): string {
    for (const key of keys) {
      const tag = tags.find((t) => t.property === key);
      if (tag) return tag.content;
    }
    return "";
  }

  async function fetchOgTags() {
    if (!fetchUrl.trim()) return;

    let url = fetchUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    fetching = true;
    fetchError = "";
    detectedTags = [];

    try {
      // Use allorigins.win as a CORS proxy to fetch the HTML
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });

      if (!res.ok) {
        throw new Error(`Failed to fetch (HTTP ${res.status})`);
      }

      const html = await res.text();
      const tags = extractMetaTags(html, url);
      detectedTags = tags;

      // Populate fields from detected tags
      const title = getTagValue(tags, "og:title", "twitter:title", "title");
      const description = getTagValue(tags, "og:description", "twitter:description", "description");
      const image = getTagValue(tags, "og:image", "twitter:image");
      const siteName = getTagValue(tags, "og:site_name");
      const pageUrl = getTagValue(tags, "og:url") || url;
      const card = getTagValue(tags, "twitter:card");

      if (title) ogTitle = title;
      if (description) ogDescription = description;
      if (image) ogImage = image;
      if (siteName) ogSiteName = siteName;
      ogUrl = pageUrl;
      if (card === "summary" || card === "summary_large_image") {
        twitterCard = card;
      }

      if (tags.length === 0 || (!title && !description && !image)) {
        fetchError = "No Open Graph or Twitter Card meta tags found on this page.";
      }
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        fetchError = "Request timed out. The URL may be unreachable.";
      } else {
        fetchError = err instanceof Error ? err.message : "Failed to fetch URL.";
      }
    }
    fetching = false;
  }

  // Validation
  const titleLength = $derived(ogTitle.length);
  const descLength = $derived(ogDescription.length);
  const titleWarning = $derived(titleLength > 60 ? "Title is long, may be truncated" : "");
  const descWarning = $derived(descLength > 160 ? "Description is long, may be truncated" : "");
  const missingWarnings = $derived.by(() => {
    const w: string[] = [];
    if (!ogTitle.trim()) w.push("Missing og:title");
    if (!ogDescription.trim()) w.push("Missing og:description");
    if (!ogImage.trim()) w.push("Missing og:image (link may not show a preview card)");
    return w;
  });

  const truncatedTitle = $derived(ogTitle.length > 70 ? ogTitle.slice(0, 67) + "..." : ogTitle);
  const truncatedDesc = $derived(ogDescription.length > 160 ? ogDescription.slice(0, 157) + "..." : ogDescription);
  const shortDesc = $derived(ogDescription.length > 100 ? ogDescription.slice(0, 97) + "..." : ogDescription);
  const domainFromUrl = $derived.by(() => {
    try {
      return new URL(ogUrl).hostname;
    } catch {
      return ogSiteName || "example.com";
    }
  });

  function generateMetaTags(): string {
    const tags: string[] = [];
    if (ogTitle) tags.push(`<meta property="og:title" content="${ogTitle}" />`);
    if (ogDescription) tags.push(`<meta property="og:description" content="${ogDescription}" />`);
    if (ogImage) tags.push(`<meta property="og:image" content="${ogImage}" />`);
    if (ogSiteName) tags.push(`<meta property="og:site_name" content="${ogSiteName}" />`);
    if (ogUrl) tags.push(`<meta property="og:url" content="${ogUrl}" />`);
    tags.push(`<meta property="og:type" content="website" />`);
    tags.push("");
    tags.push(`<meta name="twitter:card" content="${twitterCard}" />`);
    if (ogTitle) tags.push(`<meta name="twitter:title" content="${ogTitle}" />`);
    if (ogDescription) tags.push(`<meta name="twitter:description" content="${ogDescription}" />`);
    if (ogImage) tags.push(`<meta name="twitter:image" content="${ogImage}" />`);
    return tags.join("\n");
  }

  async function copyMeta() {
    try {
      await navigator.clipboard.writeText(generateMetaTags());
      copiedNotice = "meta";
      setTimeout(() => { copiedNotice = ""; }, 1500);
    } catch {
      // ignore
    }
  }

  let imageError = $state(false);
  function handleImageError() {
    imageError = true;
  }
  function handleImageLoad() {
    imageError = false;
  }

  $effect(() => {
    // Reset error when URL changes
    void ogImage;
    imageError = false;
  });

  const previews = [
    { id: "twitter" as const, label: "Twitter / X" },
    { id: "facebook" as const, label: "Facebook" },
    { id: "linkedin" as const, label: "LinkedIn" },
    { id: "discord" as const, label: "Discord" },
    { id: "slack" as const, label: "Slack" },
  ];
</script>

<div class="h-full flex flex-col gap-4">
  <header class="flex-none">
    <p class="text-(--color-text-muted) text-sm">
      Preview how your page will look when shared on social media. Fetch meta tags from any URL or fill them in manually.
    </p>
  </header>

  <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-auto">
    <!-- Input fields -->
    <div class="lg:w-80 flex-none flex flex-col gap-3">
      <!-- Fetch URL section -->
      <div class="p-3 bg-(--color-bg-alt) border border-(--color-border)">
        <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium block mb-2">Fetch from URL</span>
        <div class="flex gap-1.5">
          <input
            type="text"
            bind:value={fetchUrl}
            onkeydown={(e) => { if (e.key === "Enter") fetchOgTags(); }}
            class="flex-1 px-3 py-1.5 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm font-mono focus:border-(--color-text-light) outline-none"
            placeholder="https://example.com"
          />
          <button
            onclick={fetchOgTags}
            disabled={fetching || !fetchUrl.trim()}
            class="px-3 py-1.5 bg-(--color-accent) text-(--color-btn-text) text-xs font-medium hover:bg-(--color-accent-hover) transition-colors disabled:opacity-50 shrink-0"
          >
            {fetching ? "Fetching..." : "Fetch"}
          </button>
        </div>
        {#if fetchError}
          <p class="text-xs text-(--color-error-text) mt-1.5">{fetchError}</p>
        {/if}
        {#if detectedTags.length > 0}
          <details class="mt-2">
            <summary class="text-xs text-(--color-text-muted) cursor-pointer hover:text-(--color-text) transition-colors">{detectedTags.length} meta tags detected</summary>
            <div class="mt-1.5 border border-(--color-border) bg-(--color-bg) max-h-32 overflow-auto">
              {#each detectedTags as tag}
                <div class="flex gap-2 px-2 py-1 border-b border-(--color-border) last:border-b-0 text-xs">
                  <span class="text-(--color-text-muted) font-mono shrink-0 w-28 truncate" title={tag.property}>{tag.property}</span>
                  <span class="text-(--color-text) truncate" title={tag.content}>{tag.content}</span>
                </div>
              {/each}
            </div>
          </details>
        {/if}
      </div>

      <div class="w-full h-px bg-(--color-border)"></div>

      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">og:title</label>
          <span class="text-xs font-mono {titleLength > 60 ? 'text-(--color-error-text)' : 'text-(--color-text-light)'}">{titleLength}</span>
        </div>
        <input
          type="text"
          bind:value={ogTitle}
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none"
          placeholder="Page title"
        />
        {#if titleWarning}
          <span class="text-xs text-(--color-error-text)">{titleWarning}</span>
        {/if}
      </div>

      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">og:description</label>
          <span class="text-xs font-mono {descLength > 160 ? 'text-(--color-error-text)' : 'text-(--color-text-light)'}">{descLength}</span>
        </div>
        <textarea
          bind:value={ogDescription}
          rows="3"
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none resize-y"
          placeholder="Page description"
        ></textarea>
        {#if descWarning}
          <span class="text-xs text-(--color-error-text)">{descWarning}</span>
        {/if}
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">og:image</label>
        <input
          type="text"
          bind:value={ogImage}
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none font-mono"
          placeholder="https://example.com/image.jpg"
        />
        <span class="text-xs text-(--color-text-light)">Recommended: 1200x630px</span>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">og:site_name</label>
        <input
          type="text"
          bind:value={ogSiteName}
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none"
          placeholder="My Website"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">og:url</label>
        <input
          type="text"
          bind:value={ogUrl}
          class="w-full px-3 py-2 bg-(--color-bg) border border-(--color-border) text-(--color-text) text-sm focus:border-(--color-text-light) outline-none font-mono"
          placeholder="https://example.com/page"
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">twitter:card</label>
        <div class="flex gap-2">
          {#each [["summary", "Summary"], ["summary_large_image", "Large Image"]] as [val, label]}
            <button
              onclick={() => { twitterCard = val as "summary" | "summary_large_image"; }}
              class="flex-1 px-2 py-1.5 text-xs font-medium transition-colors border {twitterCard === val
                ? 'bg-(--color-accent) text-(--color-btn-text) border-(--color-accent)'
                : 'bg-(--color-bg) text-(--color-text-muted) border-(--color-border) hover:text-(--color-text)'}"
            >
              {label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Warnings -->
      {#if missingWarnings.length > 0}
        <div class="p-2 border border-(--color-error-border) bg-(--color-error-bg) text-xs text-(--color-error-text)">
          {#each missingWarnings as w}
            <div>{w}</div>
          {/each}
        </div>
      {/if}

      <!-- Copy meta tags -->
      <button
        onclick={copyMeta}
        class="px-4 py-2 bg-(--color-accent) text-(--color-btn-text) text-sm font-medium hover:bg-(--color-accent-hover) transition-colors mt-2"
      >
        {copiedNotice === "meta" ? "Copied!" : "Copy Meta Tags"}
      </button>
    </div>

    <!-- Preview area -->
    <div class="flex-1 flex flex-col gap-3 min-w-0">
      <!-- Platform tabs -->
      <div class="flex-none flex gap-0 border-b border-(--color-border)">
        {#each previews as p}
          <button
            onclick={() => { activePreview = p.id; }}
            class="px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px {activePreview === p.id
              ? 'border-(--color-accent) text-(--color-text)'
              : 'border-transparent text-(--color-text-muted) hover:text-(--color-text)'}"
          >
            {p.label}
          </button>
        {/each}
      </div>

      <div class="flex-1 flex items-start justify-center p-4 bg-(--color-bg-alt) border border-(--color-border) overflow-auto">
        <!-- Twitter / X preview -->
        {#if activePreview === "twitter"}
          <div class="w-full max-w-lg">
            {#if twitterCard === "summary_large_image"}
              <div style="border: 1px solid #cfd9de; border-radius: 16px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: white;">
                {#if ogImage && !imageError}
                  <img src={ogImage} alt="" style="width: 100%; height: 260px; object-fit: cover; display: block;" onerror={handleImageError} onload={handleImageLoad} />
                {/if}
                <div style="padding: 12px;">
                  <div style="font-size: 15px; font-weight: 700; color: #0f1419; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{truncatedTitle}</div>
                  <div style="font-size: 15px; color: #536471; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{shortDesc}</div>
                  <div style="font-size: 15px; color: #536471; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#536471"><path d="M11.96 14.945c-.067 0-.136-.01-.203-.027-1.13-.318-2.097-.986-2.795-1.932-.832-1.125-1.176-2.508-.968-3.893s.942-2.605 2.068-3.438l3.53-2.608c2.322-1.716 5.61-1.224 7.33 1.1.83 1.127 1.175 2.51.967 3.895s-.943 2.605-2.07 3.438l-1.48 1.094c-.333.246-.804.175-1.05-.158-.246-.334-.176-.804.158-1.05l1.48-1.095c.803-.592 1.327-1.463 1.476-2.45.148-.988-.098-1.975-.69-2.778-1.225-1.656-3.572-2.01-5.23-.784l-3.53 2.608c-.802.593-1.326 1.464-1.475 2.45-.15.99.097 1.975.69 2.778.498.675 1.187 1.15 1.992 1.377.4.114.633.528.52.928-.092.33-.394.547-.722.547z"/><path d="M7.27 22.054c-1.61 0-3.197-.735-4.225-2.125-.832-1.127-1.176-2.51-.968-3.894s.943-2.605 2.07-3.438l1.478-1.094c.334-.245.805-.175 1.05.158s.177.804-.157 1.05l-1.48 1.095c-.803.593-1.326 1.464-1.475 2.45-.148.99.097 1.975.69 2.778 1.225 1.657 3.57 2.01 5.23.785l3.528-2.608c1.658-1.225 2.01-3.57.785-5.23-.498-.674-1.187-1.15-1.992-1.376-.4-.113-.633-.527-.52-.927.112-.4.528-.63.926-.52 1.13.318 2.096.986 2.794 1.932 1.717 2.324 1.224 5.612-1.1 7.33l-3.53 2.608c-.933.693-2.023 1.026-3.105 1.026z"/></svg>
                    {domainFromUrl}
                  </div>
                </div>
              </div>
            {:else}
              <div style="border: 1px solid #cfd9de; border-radius: 16px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: white; display: flex;">
                {#if ogImage && !imageError}
                  <img src={ogImage} alt="" style="width: 130px; height: 130px; object-fit: cover; flex-shrink: 0;" onerror={handleImageError} onload={handleImageLoad} />
                {/if}
                <div style="padding: 12px; min-width: 0; flex: 1;">
                  <div style="font-size: 13px; color: #536471;">{domainFromUrl}</div>
                  <div style="font-size: 15px; font-weight: 700; color: #0f1419; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{truncatedTitle}</div>
                  <div style="font-size: 15px; color: #536471; margin-top: 2px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">{shortDesc}</div>
                </div>
              </div>
            {/if}
          </div>

        <!-- Facebook preview -->
        {:else if activePreview === "facebook"}
          <div class="w-full max-w-lg">
            <div style="border: 1px solid #dadde1; background: #f0f2f5; font-family: Helvetica, Arial, sans-serif;">
              {#if ogImage && !imageError}
                <img src={ogImage} alt="" style="width: 100%; height: 274px; object-fit: cover; display: block;" onerror={handleImageError} onload={handleImageLoad} />
              {/if}
              <div style="padding: 10px 12px; background: #f0f2f5; border-top: 1px solid #dadde1;">
                <div style="font-size: 12px; color: #606770; text-transform: uppercase;">{domainFromUrl}</div>
                <div style="font-size: 16px; font-weight: 600; color: #1d2129; margin-top: 3px; line-height: 1.3;">{truncatedTitle}</div>
                <div style="font-size: 14px; color: #606770; margin-top: 3px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">{truncatedDesc}</div>
              </div>
            </div>
          </div>

        <!-- LinkedIn preview -->
        {:else if activePreview === "linkedin"}
          <div class="w-full max-w-lg">
            <div style="border: 1px solid #e0e0e0; border-radius: 2px; background: white; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
              {#if ogImage && !imageError}
                <img src={ogImage} alt="" style="width: 100%; height: 250px; object-fit: cover; display: block;" onerror={handleImageError} onload={handleImageLoad} />
              {/if}
              <div style="padding: 12px 16px;">
                <div style="font-size: 14px; font-weight: 600; color: rgba(0,0,0,0.9); line-height: 1.4;">{truncatedTitle}</div>
                <div style="font-size: 12px; color: rgba(0,0,0,0.6); margin-top: 4px;">{domainFromUrl}</div>
              </div>
            </div>
          </div>

        <!-- Discord preview -->
        {:else if activePreview === "discord"}
          <div class="w-full max-w-md">
            <div style="border-left: 4px solid #5865f2; background: #2f3136; padding: 8px 16px 16px 12px; border-radius: 4px; font-family: 'gg sans', 'Noto Sans', Helvetica, Arial, sans-serif;">
              <div style="font-size: 12px; color: #b9bbbe; margin-bottom: 8px;">{ogSiteName || domainFromUrl}</div>
              <div style="font-size: 16px; font-weight: 600; color: #00aff4; margin-bottom: 8px;">{truncatedTitle}</div>
              <div style="font-size: 14px; color: #dcddde; line-height: 1.4; margin-bottom: 12px;">{truncatedDesc}</div>
              {#if ogImage && !imageError}
                <img src={ogImage} alt="" style="max-width: 400px; max-height: 300px; border-radius: 4px; display: block;" onerror={handleImageError} onload={handleImageLoad} />
              {/if}
            </div>
          </div>

        <!-- Slack preview -->
        {:else if activePreview === "slack"}
          <div class="w-full max-w-md">
            <div style="border-left: 4px solid #e8e8e8; padding: 4px 0 4px 12px; font-family: 'Lato', 'Helvetica Neue', Arial, sans-serif;">
              <div style="font-size: 13px; font-weight: 700; color: #1d1c1d; margin-bottom: 4px;">{ogSiteName || domainFromUrl}</div>
              <div style="font-size: 15px; font-weight: 700; color: #1264a3; margin-bottom: 4px;">{truncatedTitle}</div>
              <div style="font-size: 15px; color: #1d1c1d; line-height: 1.46; margin-bottom: 8px;">{shortDesc}</div>
              {#if ogImage && !imageError}
                <img src={ogImage} alt="" style="max-width: 360px; max-height: 200px; border-radius: 4px; border: 1px solid #e8e8e8; display: block;" onerror={handleImageError} onload={handleImageLoad} />
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Generated meta tags -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">Generated Meta Tags</span>
          <button
            onclick={copyMeta}
            class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
          >
            {copiedNotice === "meta" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre class="p-3 bg-(--color-bg) border border-(--color-border) font-mono text-xs text-(--color-text) whitespace-pre-wrap overflow-auto max-h-40">{generateMetaTags()}</pre>
      </div>
    </div>
  </div>
</div>
