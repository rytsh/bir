export interface PatchLine { kind: "context" | "add" | "remove" | "note"; text: string; old: number | null; next: number | null; }
export interface PatchHunk { header: string; lines: PatchLine[]; }
export interface PatchFile { oldPath: string; newPath: string; label: string; metadata: string[]; hunks: PatchHunk[]; additions: number; deletions: number; binary: boolean; raw: string; }

function decodePath(input: string): string {
  let path: string = input.trim();
  if (path.startsWith('"') && path.endsWith('"')) {
    path = path.slice(1, -1);
    const bytes: number[] = [];
    const encoder: TextEncoder = new TextEncoder();
    for (let index: number = 0; index < path.length;) {
      const octal: RegExpMatchArray | null = path.slice(index).match(/^\\([0-7]{1,3})/);
      if (octal) { bytes.push(parseInt(octal[1], 8)); index += octal[0].length; }
      else if (path[index] === "\\" && index + 1 < path.length) { const value: string = ({ t: "\t", n: "\n", r: "\r" } as Record<string, string>)[path[index + 1]] ?? path[index + 1]; bytes.push(...encoder.encode(value)); index += 2; }
      else { const point: string = String.fromCodePoint(path.codePointAt(index)!); bytes.push(...encoder.encode(point)); index += point.length; }
    }
    path = new TextDecoder().decode(new Uint8Array(bytes));
  }
  return path.replace(/^[ab]\//, "");
}

export function parsePatch(text: string): PatchFile[] {
  const files: PatchFile[] = [];
  let current: PatchFile | null = null;
  let hunk: PatchHunk | null = null;
  let oldLine: number = 0; let newLine: number = 0;
  let oldRemaining: number = 0; let newRemaining: number = 0;
  const begin = (oldPath: string, newPath: string): PatchFile => {
    const file: PatchFile = { oldPath, newPath, label: newPath === "/dev/null" ? oldPath : newPath, metadata: [], hunks: [], additions: 0, deletions: 0, binary: false, raw: "" };
    files.push(file); hunk = null; return file;
  };
  const lines: string[] = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 100_000) throw new Error("Patch is limited to 100,000 lines. Split it into smaller files.");
  for (let index: number = 0; index < lines.length; index++) {
    const line: string = lines[index];
    if (line.startsWith("diff --cc ") || line.startsWith("diff --combined ") || line.startsWith("@@@")) throw new Error("Combined merge diffs are not supported. Export a unified patch with git diff <parent> instead.");
    if (line.startsWith("diff --git ")) {
      const tokens: string[] = line.slice(11).match(/"(?:\\.|[^"\\])*"|\S+/g) ?? [];
      current = begin(decodePath(tokens[0] ?? "unknown"), decodePath(tokens[1] ?? tokens[0] ?? "unknown"));
    } else if (line.startsWith("--- ") && lines[index + 1]?.startsWith("+++ ") && (!current || (current.hunks.length > 0 && oldRemaining === 0 && newRemaining === 0))) {
      current = begin(decodePath(line.slice(4).split("\t")[0]), decodePath(lines[index + 1].slice(4).split("\t")[0]));
    }
    if (!current) continue;
    current.raw += `${line}\n`;
    const match: RegExpMatchArray | null = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (match) {
      oldLine = Number(match[1]); newLine = Number(match[3]);
      oldRemaining = Number(match[2] ?? 1); newRemaining = Number(match[4] ?? 1);
      hunk = { header: line, lines: [] }; current.hunks.push(hunk); continue;
    }
    if (hunk && [" ", "+", "-", "\\"].includes(line[0])) {
      const kind: PatchLine["kind"] = line[0] === "+" ? "add" : line[0] === "-" ? "remove" : line[0] === "\\" ? "note" : "context";
      hunk.lines.push({ kind, text: line.slice(1), old: kind === "add" || kind === "note" ? null : oldLine++, next: kind === "remove" || kind === "note" ? null : newLine++ });
      if (kind === "remove" || kind === "context") oldRemaining--;
      if (kind === "add" || kind === "context") newRemaining--;
      if (kind === "add") current.additions++;
      if (kind === "remove") current.deletions++;
    } else {
      hunk = null;
      if (line.startsWith("--- ")) current.oldPath = decodePath(line.slice(4).split("\t")[0]);
      if (line.startsWith("+++ ")) current.newPath = decodePath(line.slice(4).split("\t")[0]);
      if (line.startsWith("rename to ")) current.newPath = decodePath(line.slice(10));
      if (line.startsWith("rename from ")) current.oldPath = decodePath(line.slice(12));
      current.label = current.newPath === "/dev/null" ? current.oldPath : current.newPath;
      if (line.startsWith("Binary files ") || line === "GIT binary patch") current.binary = true;
      if (line && !line.startsWith("diff --git")) current.metadata.push(line);
    }
  }
  if (!files.length && text.trim()) throw new Error("No unified diff found. Paste git diff output or open a .patch / .diff file.");
  return files;
}

export interface SplitPatchRow { left: PatchLine | null; right: PatchLine | null; }
export function splitPatchLines(lines: PatchLine[]): SplitPatchRow[] {
  const rows: SplitPatchRow[] = [];
  for (let index: number = 0; index < lines.length;) {
    if (lines[index].kind === "remove" || lines[index].kind === "add") {
      const removed: PatchLine[] = []; const added: PatchLine[] = [];
      while (index < lines.length && (lines[index].kind === "remove" || lines[index].kind === "add")) { (lines[index].kind === "remove" ? removed : added).push(lines[index++]); }
      for (let row: number = 0; row < Math.max(removed.length, added.length); row++) rows.push({ left: removed[row] ?? null, right: added[row] ?? null });
    } else { const line: PatchLine = lines[index++]; rows.push({ left: line, right: line }); }
  }
  return rows;
}
