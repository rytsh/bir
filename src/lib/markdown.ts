let comarkRender: ((markdown: string) => Promise<string>) | undefined;

export async function renderMarkdown(input: string): Promise<string> {
  if (!comarkRender) {
    const [{ createHtmlRenderer }, mathPlugin] = await Promise.all([
      import("@comark/html"),
      import("@comark/html/plugins/math"),
    ]);

    comarkRender = createHtmlRenderer({
      plugins: [mathPlugin.default()],
      components: { Math: mathPlugin.Math },
    });
  }

  return comarkRender(input);
}
