<script module lang="ts">
  import type { Database } from "sql.js";

  interface RetainedDatabaseSession {
    database: Database;
    name: string;
    size: number;
    query: string;
  }

  let retainedSession: RetainedDatabaseSession | null = null;

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", (event) => {
      if (!retainedSession) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { SQLite, sql } from "@codemirror/lang-sql";
  import { EditorView, type KeyBinding } from "@codemirror/view";
  import CodeMirror from "svelte-codemirror-editor";
  import initSqlJs, {
    type Database,
    type QueryExecResult,
    type SqlJsStatic,
    type SqlValue,
  } from "sql.js";
  import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
  import {
    createDarkModeObserver,
    createTheme,
    editorHeightExtension,
    getInitialDarkMode,
  } from "../../lib/codemirror.js";

  type SchemaType = "table" | "view";
  type NoticeKind = "" | "error" | "success";

  interface SchemaObject {
    type: SchemaType;
    name: string;
    sql: string;
  }

  interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notNull: boolean;
    defaultValue: SqlValue;
    primaryKey: number;
  }

  interface IndexInfo {
    name: string;
    unique: boolean;
    origin: string;
  }

  interface QueryResult {
    statement: string;
    columns: string[];
    values: SqlValue[][];
    totalRows: number;
    truncated: boolean;
  }

  interface ConnectionSettings {
    foreignKeys: number;
    recursiveTriggers: number;
    ignoreCheckConstraints: number;
    queryOnly: number;
    busyTimeout: number;
  }

  const MAX_FILE_SIZE = 100 * 1024 * 1024;
  const MAX_RESULT_ROWS = 1000;
  const MAX_PREVIEW_ROWS = 100;
  const sampleSql = `-- Ctrl/Cmd + Enter runs the editor
SELECT
  p.name AS project,
  COUNT(t.id) AS task_count,
  SUM(CASE WHEN t.done = 1 THEN 1 ELSE 0 END) AS completed
FROM projects AS p
LEFT JOIN tasks AS t ON t.project_id = p.id
GROUP BY p.id, p.name
ORDER BY task_count DESC;`;

  let SQL: SqlJsStatic | null = null;
  let database = $state.raw<Database | null>(null);
  let fileInput: HTMLInputElement | null = null;
  let mounted = false;
  let fileRequestId = 0;

  let loading = $state(true);
  let executing = $state(false);
  let isDragging = $state(false);
  let isDark = $state(getInitialDarkMode());
  let databaseName = $state("untitled.sqlite");
  let databaseSize = $state(0);
  let dirty = $state(false);
  let notice = $state("Loading SQLite engine...");
  let noticeKind = $state<NoticeKind>("");

  let schemaObjects = $state<SchemaObject[]>([]);
  let schemaSearch = $state("");
  let selectedObject = $state<SchemaObject | null>(null);
  let columns = $state<ColumnInfo[]>([]);
  let indexes = $state<IndexInfo[]>([]);
  let preview = $state<QueryResult | null>(null);

  let query = $state("SELECT sqlite_version() AS sqlite_version;");
  let results = $state<QueryResult[]>([]);
  let activeResultIndex = $state(0);
  let executionTime = $state(0);
  let affectedRows = $state(0);
  let copied = $state("");

  let filteredSchema = $derived(
    schemaObjects.filter((object) =>
      object.name.toLowerCase().includes(schemaSearch.trim().toLowerCase()),
    ),
  );
  let tableCount = $derived(schemaObjects.filter((object) => object.type === "table").length);
  let viewCount = $derived(schemaObjects.filter((object) => object.type === "view").length);
  let activeResult = $derived(results[activeResultIndex] ?? null);
  let completionSchema = $derived.by(() => {
    const schema: Record<string, string[]> = {};
    for (const object of schemaObjects) {
      const info = database?.exec(`PRAGMA table_info(${quoteIdentifier(object.name)})`)[0];
      schema[object.name] = info ? info.values.map((row) => String(row[1])) : [];
    }
    return schema;
  });
  let editorExtensions = $derived([
    ...createTheme(isDark),
    editorHeightExtension,
    EditorView.contentAttributes.of({ "aria-label": "SQL editor" }),
    sql({ dialect: SQLite, schema: completionSchema, upperCaseKeywords: true }),
  ]);

  const editorKeybindings: KeyBinding[] = [
    {
      key: "Mod-Enter",
      run: () => {
        executeSql();
        return true;
      },
    },
  ];

  onMount(() => {
    mounted = true;
    const initialize = async (): Promise<void> => {
      try {
        SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
        if (!mounted) return;
        if (retainedSession) {
          const session = retainedSession;
          retainedSession = null;
          installDatabase(session.database, session.name, session.size);
          query = session.query;
          dirty = true;
          setNotice("Recovered the unsaved database from this browser session.", "success");
        } else {
          createBlankDatabase();
          setNotice("Ready. Open a database, load the sample, or start with the blank file.");
        }
        loading = false;
      } catch (error) {
        loading = false;
        setNotice(errorMessage(error, "SQLite could not be loaded."), "error");
      }
    };
    initialize();

    const cleanupTheme = createDarkModeObserver((value) => {
      isDark = value;
    });
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const handleNavigation = (event: MouseEvent): void => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.download || target.target === "_blank") return;
      const destination = new URL(target.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (!window.confirm("This database has changes that have not been exported. Leave and discard them?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        dirty = false;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleNavigation, true);

    return () => {
      mounted = false;
      fileRequestId++;
      cleanupTheme();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleNavigation, true);
      if (database && dirty) {
        database.updateHook(null);
        retainedSession = {
          database,
          name: databaseName,
          size: databaseSize,
          query,
        };
      } else {
        database?.close();
      }
      database = null;
    };
  });

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function setNotice(message: string, kind: NoticeKind = ""): void {
    notice = message;
    noticeKind = kind;
  }

  function quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  function closeCurrentDatabase(): void {
    if (!database) return;
    database.updateHook(null);
    database.close();
    database = null;
  }

  function confirmDiscardChanges(): boolean {
    return !dirty || window.confirm("This database has changes that have not been exported. Discard them?");
  }

  function installUpdateHook(): void {
    database?.updateHook(() => {
      dirty = true;
    });
  }

  function installDatabase(nextDatabase: Database, name: string, size: number): void {
    closeCurrentDatabase();
    database = nextDatabase;
    databaseName = name;
    databaseSize = size;
    dirty = false;
    results = [];
    activeResultIndex = 0;
    columns = [];
    indexes = [];
    preview = null;
    selectedObject = null;
    installUpdateHook();
    refreshSchema();
  }

  function createBlankDatabase(): void {
    if (!SQL || !confirmDiscardChanges()) return;
    const nextDatabase = new SQL.Database();
    installDatabase(nextDatabase, "untitled.sqlite", 0);
    query = "SELECT sqlite_version() AS sqlite_version;";
  }

  function loadSampleDatabase(): void {
    if (!SQL || !confirmDiscardChanges()) return;
    try {
      const nextDatabase = new SQL.Database();
      nextDatabase.run(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          owner TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          title TEXT NOT NULL,
          priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
          done INTEGER NOT NULL DEFAULT 0,
          due_date TEXT
        );
        CREATE INDEX idx_tasks_project ON tasks(project_id);
        INSERT INTO projects VALUES
          (1, 'Launch checklist', 'Mina', '2026-08-04'),
          (2, 'API cleanup', 'Jon', '2026-08-11'),
          (3, 'Field research', 'Ada', '2026-08-19');
        INSERT INTO tasks VALUES
          (1, 1, 'Confirm release notes', 'high', 1, '2026-08-25'),
          (2, 1, 'Run accessibility pass', 'high', 0, '2026-08-28'),
          (3, 1, 'Publish migration guide', 'medium', 0, '2026-08-30'),
          (4, 2, 'Remove legacy endpoint', 'medium', 1, '2026-08-20'),
          (5, 2, 'Measure payload sizes', 'low', 0, NULL),
          (6, 3, 'Tag interview notes', 'medium', 1, '2026-08-24');
      `);
      const size = nextDatabase.export().length;
      installDatabase(nextDatabase, "sample-projects.sqlite", size);
      query = sampleSql;
      dirty = false;
      setNotice("Sample database loaded. Run the query or choose a table from the schema.", "success");
    } catch (error) {
      setNotice(errorMessage(error, "The sample database could not be created."), "error");
    }
  }

  async function openFile(file: File): Promise<void> {
    if (!SQL) return;
    if (!confirmDiscardChanges()) {
      if (fileInput) fileInput.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setNotice("This file is larger than 100 MiB. Choose a smaller SQLite database to avoid exhausting browser memory.", "error");
      return;
    }

    loading = true;
    setNotice(`Opening ${file.name}...`);
    const requestId = ++fileRequestId;
    let nextDatabase: Database | null = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mounted || requestId !== fileRequestId) return;
      nextDatabase = new SQL.Database(bytes);
      if (!mounted || requestId !== fileRequestId) {
        nextDatabase.close();
        nextDatabase = null;
        return;
      }
      nextDatabase.exec("PRAGMA schema_version;");
      installDatabase(nextDatabase, file.name, file.size);
      nextDatabase = null;
      query = schemaObjects[0]
        ? `SELECT * FROM ${quoteIdentifier(schemaObjects[0].name)} LIMIT 100;`
        : "SELECT sqlite_version() AS sqlite_version;";
      setNotice(`${file.name} opened locally. The original file will not be modified.`, "success");
    } catch (error) {
      nextDatabase?.close();
      setNotice(errorMessage(error, "The selected file is not a readable SQLite database."), "error");
    } finally {
      if (requestId === fileRequestId) loading = false;
      if (fileInput) fileInput.value = "";
    }
  }

  function handleFileInput(event: Event): void {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) openFile(file);
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file) openFile(file);
  }

  function refreshSchema(): void {
    if (!database) return;
    const result = database.exec(`
      SELECT type, name, COALESCE(sql, '')
      FROM sqlite_master
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name COLLATE NOCASE;
    `)[0];
    schemaObjects = result
      ? result.values.map((row) => ({
          type: String(row[0]) as SchemaType,
          name: String(row[1]),
          sql: String(row[2]),
        }))
      : [];

    if (selectedObject) {
      const updated = schemaObjects.find(
        (object) => object.type === selectedObject?.type && object.name === selectedObject.name,
      );
      if (updated) {
        selectObject(updated);
      } else {
        selectedObject = null;
        columns = [];
        indexes = [];
        preview = null;
      }
    }
  }

  function selectObject(object: SchemaObject): void {
    if (!database) return;
    selectedObject = object;
    const quoted = quoteIdentifier(object.name);
    const columnResult = database.exec(`PRAGMA table_info(${quoted})`)[0];
    columns = columnResult
      ? columnResult.values.map((row) => ({
          cid: Number(row[0]),
          name: String(row[1]),
          type: String(row[2] || "ANY"),
          notNull: Number(row[3]) === 1,
          defaultValue: row[4],
          primaryKey: Number(row[5]),
        }))
      : [];

    const indexResult = object.type === "table" ? database.exec(`PRAGMA index_list(${quoted})`)[0] : undefined;
    indexes = indexResult
      ? indexResult.values.map((row) => ({
          name: String(row[1]),
          unique: Number(row[2]) === 1,
          origin: String(row[3]),
        }))
      : [];

    const previewResult = database.exec(`SELECT * FROM ${quoted} LIMIT ${MAX_PREVIEW_ROWS + 1}`)[0];
    if (previewResult) {
      const truncated = previewResult.values.length > MAX_PREVIEW_ROWS;
      preview = {
        statement: `Preview of ${object.name}`,
        columns: previewResult.columns,
        values: previewResult.values.slice(0, MAX_PREVIEW_ROWS),
        totalRows: Math.min(previewResult.values.length, MAX_PREVIEW_ROWS),
        truncated,
      };
    } else {
      preview = null;
    }
  }

  function queryObject(object: SchemaObject): void {
    query = `SELECT * FROM ${quoteIdentifier(object.name)} LIMIT 100;`;
    executeSql();
  }

  function isReadOnlyStatement(statement: string): boolean {
    const normalized = statement.replace(/^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, "").toUpperCase();
    if (normalized.startsWith("SELECT") || normalized.startsWith("EXPLAIN")) return true;
    return normalized.startsWith("WITH") && !/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/.test(normalized);
  }

  function executeSql(): void {
    if (!database || !query.trim() || executing || loading) return;
    executing = true;
    setNotice("Running SQL...");
    const started = performance.now();
    const nextResults: QueryResult[] = [];
    let changedRows = 0;

    try {
      for (const statement of database.iterateStatements(query)) {
        try {
          const statementSql = statement.getSQL().trim();
          const statementColumns = statement.getColumnNames();
          const readOnly = isReadOnlyStatement(statementSql);
          if (!readOnly) dirty = true;
          const values: SqlValue[][] = [];
          let totalRows = 0;
          let truncated = false;

          while (statement.step()) {
            totalRows++;
            if (values.length < MAX_RESULT_ROWS) {
              values.push(statement.get());
            } else {
              truncated = true;
              if (readOnly) break;
            }
          }

          if (statementColumns.length > 0) {
            nextResults.push({
              statement: statementSql,
              columns: statementColumns,
              values,
              totalRows,
              truncated,
            });
          } else {
            changedRows += database.getRowsModified();
          }
        } finally {
          statement.free();
        }
      }

      results = nextResults;
      activeResultIndex = 0;
      affectedRows = changedRows;
      executionTime = performance.now() - started;
      refreshSchema();
      if (nextResults.length > 0) {
        const rowTotal = nextResults.reduce((sum, result) => sum + result.values.length, 0);
        const hasTruncatedResult = nextResults.some((result) => result.truncated);
        setNotice(
          `${nextResults.length} result set${nextResults.length === 1 ? "" : "s"}, ${rowTotal.toLocaleString()}${hasTruncatedResult ? "+" : ""} row${rowTotal === 1 && !hasTruncatedResult ? "" : "s"} in ${formatDuration(executionTime)}.`,
          "success",
        );
      } else {
        setNotice(
          `${changedRows.toLocaleString()} row${changedRows === 1 ? "" : "s"} changed in ${formatDuration(executionTime)}.`,
          "success",
        );
      }
    } catch (error) {
      results = [];
      affectedRows = 0;
      executionTime = performance.now() - started;
      setNotice(errorMessage(error, "The SQL statement could not be executed."), "error");
    } finally {
      executing = false;
    }
  }

  function formatDuration(milliseconds: number): string {
    return milliseconds < 1000 ? `${milliseconds.toFixed(1)} ms` : `${(milliseconds / 1000).toFixed(2)} s`;
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "New database";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function formatValue(value: SqlValue): string {
    if (value === null) return "NULL";
    if (value instanceof Uint8Array) return `BLOB · ${formatBytes(value.length)}`;
    return String(value);
  }

  function serializableValue(value: SqlValue): string | number | null {
    if (value instanceof Uint8Array) {
      return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    return value;
  }

  function resultAsJson(result: QueryResult): string {
    if (new Set(result.columns).size !== result.columns.length) {
      return JSON.stringify(
        {
          columns: result.columns,
          rows: result.values.map((row) => row.map(serializableValue)),
        },
        null,
        2,
      );
    }
    const rows = result.values.map((row) =>
      Object.fromEntries(result.columns.map((column, index) => [column, serializableValue(row[index])])),
    );
    return JSON.stringify(rows, null, 2);
  }

  function csvCell(value: SqlValue): string {
    const text = String(serializableValue(value) ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function resultAsCsv(result: QueryResult): string {
    return [
      result.columns.map((column) => csvCell(column)).join(","),
      ...result.values.map((row) => row.map((value) => csvCell(value)).join(",")),
    ].join("\n");
  }

  function downloadBlob(content: BlobPart, type: string, name: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function pragmaNumber(name: string): number {
    const value = database?.exec(`PRAGMA ${name}`)[0]?.values[0]?.[0];
    return Number(value ?? 0);
  }

  function readConnectionSettings(): ConnectionSettings {
    return {
      foreignKeys: pragmaNumber("foreign_keys"),
      recursiveTriggers: pragmaNumber("recursive_triggers"),
      ignoreCheckConstraints: pragmaNumber("ignore_check_constraints"),
      queryOnly: pragmaNumber("query_only"),
      busyTimeout: pragmaNumber("busy_timeout"),
    };
  }

  function restoreConnectionSettings(settings: ConnectionSettings): void {
    if (!database) return;
    database.run(`PRAGMA foreign_keys = ${settings.foreignKeys ? 1 : 0}`);
    database.run(`PRAGMA recursive_triggers = ${settings.recursiveTriggers ? 1 : 0}`);
    database.run(`PRAGMA ignore_check_constraints = ${settings.ignoreCheckConstraints ? 1 : 0}`);
    database.run(`PRAGMA query_only = ${settings.queryOnly ? 1 : 0}`);
    database.run(`PRAGMA busy_timeout = ${Math.max(0, settings.busyTimeout)}`);
  }

  function hasActiveTransaction(): boolean {
    if (!database) return false;
    try {
      database.run("BEGIN");
      database.run("ROLLBACK");
      return false;
    } catch (error) {
      if (/within a transaction/i.test(errorMessage(error, ""))) return true;
      throw error;
    }
  }

  function downloadDatabase(): void {
    if (!database) return;
    const settings = readConnectionSettings();
    let activeTransaction = false;
    try {
      activeTransaction = hasActiveTransaction();
      if (
        activeTransaction &&
        !window.confirm("Exporting requires committing the active SQLite transaction. Commit it and continue with the export?")
      ) {
        setNotice("Export cancelled. The active transaction is still open.");
        return;
      }
      if (activeTransaction) {
        database.run("COMMIT");
      }

      const bytes = database.export();
      restoreConnectionSettings(settings);
      installUpdateHook();
      databaseSize = bytes.length;
      dirty = false;
      const name = /\.(sqlite3?|db)$/i.test(databaseName) ? databaseName : `${databaseName}.sqlite`;
      downloadBlob(bytes, "application/vnd.sqlite3", name);
      setNotice(
        `${name} exported with the current in-browser changes${activeTransaction ? "; the approved open transaction was committed first" : ""}.`,
        "success",
      );
    } catch (error) {
      restoreConnectionSettings(settings);
      installUpdateHook();
      setNotice(errorMessage(error, "The database could not be exported."), "error");
    }
  }

  function downloadResult(format: "csv" | "json"): void {
    if (!activeResult) return;
    const baseName = databaseName.replace(/\.(sqlite3?|db)$/i, "") || "query-result";
    if (format === "csv") {
      downloadBlob(resultAsCsv(activeResult), "text/csv;charset=utf-8", `${baseName}-result.csv`);
    } else {
      downloadBlob(resultAsJson(activeResult), "application/json", `${baseName}-result.json`);
    }
  }

  async function copyResult(): Promise<void> {
    if (!activeResult) return;
    try {
      await navigator.clipboard.writeText(resultAsJson(activeResult));
      copied = "result";
      setTimeout(() => (copied = ""), 1600);
    } catch (error) {
      setNotice(errorMessage(error, "The result could not be copied."), "error");
    }
  }
</script>

<div class="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3">
  <header class="flex flex-col gap-3 border-b border-(--color-border) pb-3 xl:flex-row xl:items-center xl:justify-between">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong class="truncate text-sm text-(--color-text)">{databaseName}</strong>
        {#if dirty}
          <span class="text-xs font-medium text-amber-700 dark:text-amber-400">Unsaved changes</span>
        {/if}
        <span class="text-xs tabular-nums text-(--color-text-muted)">{formatBytes(databaseSize)}</span>
        <span class="text-xs tabular-nums text-(--color-text-muted)">{tableCount} tables · {viewCount} views</span>
      </div>
      <p class="mt-1 text-xs text-(--color-text-muted)">The database stays in this browser tab. Changes affect only the in-memory copy until export.</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <input bind:this={fileInput} class="sr-only" type="file" accept=".sqlite,.sqlite3,.db,application/vnd.sqlite3" onchange={handleFileInput} />
      <button class="border border-(--color-border) bg-(--color-bg-alt) px-3 py-2 text-xs font-medium text-(--color-text) transition-colors hover:border-(--color-text-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)" onclick={() => fileInput?.click()} disabled={loading}>Open database</button>
      <button class="border border-(--color-border) px-3 py-2 text-xs font-medium text-(--color-text-muted) transition-colors hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)" onclick={createBlankDatabase} disabled={loading}>New</button>
      <button class="border border-(--color-border) px-3 py-2 text-xs font-medium text-(--color-text-muted) transition-colors hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)" onclick={loadSampleDatabase} disabled={loading}>Load sample</button>
      <button class="bg-(--color-accent) px-3 py-2 text-xs font-semibold text-(--color-btn-text) transition-colors hover:bg-(--color-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent)" onclick={downloadDatabase} disabled={!database || loading}>Export database</button>
    </div>
  </header>

  <div
    class="border border-dashed px-3 py-2 text-center text-xs transition-colors {isDragging ? 'border-(--color-accent) bg-(--color-bg-alt) text-(--color-text)' : 'border-(--color-border) text-(--color-text-muted)'}"
    role="button"
    tabindex="0"
    ondragover={(event) => { event.preventDefault(); isDragging = true; }}
    ondragleave={() => (isDragging = false)}
    ondrop={handleDrop}
    onkeydown={(event) => (event.key === "Enter" || event.key === " ") && fileInput?.click()}
  >
    Drop a <code>.sqlite</code>, <code>.sqlite3</code>, or <code>.db</code> file here · 100 MiB maximum
  </div>

  <div class="px-3 py-2 text-xs {noticeKind === 'error' ? 'border border-(--color-error-border) bg-(--color-error-bg) text-(--color-error-text)' : noticeKind === 'success' ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border border-(--color-border) bg-(--color-bg-alt) text-(--color-text-muted)'}" role={noticeKind === "error" ? "alert" : "status"}>
    {notice}
  </div>

  <div class="grid min-h-0 flex-1 gap-3 xl:grid-cols-[16rem_minmax(0,1fr)]">
    <aside class="flex min-h-[16rem] flex-col border border-(--color-border) bg-(--color-bg-alt) xl:min-h-0">
      <div class="border-b border-(--color-border) p-3">
        <label class="mb-1 block text-xs font-medium text-(--color-text-muted)" for="schema-search">Schema</label>
        <input id="schema-search" bind:value={schemaSearch} class="w-full border border-(--color-border) bg-(--color-bg) px-2 py-1.5 text-sm text-(--color-text) outline-none placeholder:text-(--color-text-light) focus:border-(--color-text-muted)" placeholder="Filter tables and views" />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if filteredSchema.length === 0}
          <div class="p-4 text-center text-xs text-(--color-text-muted)">{schemaObjects.length === 0 ? "This database has no user tables or views." : "No schema objects match this filter."}</div>
        {:else}
          {#each filteredSchema as object (object.name)}
            <button
              class="flex w-full items-center justify-between gap-2 border-b border-(--color-border) px-3 py-2 text-left transition-colors hover:bg-(--color-bg) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--color-accent) {selectedObject?.name === object.name ? 'bg-(--color-bg)' : ''}"
              onclick={() => selectObject(object)}
            >
              <span class="min-w-0 truncate text-sm text-(--color-text)">{object.name}</span>
              <span class="shrink-0 text-[10px] uppercase tracking-wider text-(--color-text-light)">{object.type}</span>
            </button>
          {/each}
        {/if}
      </div>
    </aside>

    <section class="grid min-h-0 gap-3 lg:grid-rows-[minmax(17rem,0.9fr)_minmax(18rem,1.1fr)]">
      <div class="flex min-h-[17rem] flex-col border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-3 py-2">
          <div>
            <h2 class="text-sm font-semibold text-(--color-text)">SQL editor</h2>
            <p class="text-[11px] text-(--color-text-muted)">SQLite syntax · Ctrl/Cmd + Enter to run</p>
          </div>
          <button class="bg-(--color-accent) px-4 py-2 text-xs font-semibold text-(--color-btn-text) transition-colors hover:bg-(--color-accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent) disabled:cursor-not-allowed disabled:opacity-50" onclick={executeSql} disabled={!database || !query.trim() || executing || loading}>{executing ? "Running..." : loading ? "Opening..." : "Run SQL"}</button>
        </div>
        <div class="min-h-0 flex-1 overflow-hidden">
          <CodeMirror bind:value={query} extensions={editorExtensions} keybindings={editorKeybindings} placeholder="Write one or more SQLite statements..." />
        </div>
      </div>

      <div class="flex min-h-[18rem] flex-col border border-(--color-border) bg-(--color-bg-alt)">
        <div class="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-3 py-2">
          <div class="flex min-w-0 flex-wrap items-center gap-1">
            {#if results.length > 0}
              {#each results as result, index}
                <button class="px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-(--color-accent) {activeResultIndex === index ? 'bg-(--color-text) text-(--color-btn-text)' : 'text-(--color-text-muted) hover:text-(--color-text)'}" onclick={() => (activeResultIndex = index)}>Result {index + 1} · {result.values.length.toLocaleString()}{result.truncated ? "+" : ""}</button>
              {/each}
            {:else}
              <span class="text-xs font-medium text-(--color-text-muted)">Query result</span>
            {/if}
          </div>
          {#if activeResult}
            <div class="flex gap-3">
              <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={copyResult}>{copied === "result" ? "Copied" : "Copy JSON"}</button>
              <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={() => downloadResult("csv")}>CSV</button>
              <button class="text-xs text-(--color-text-muted) hover:text-(--color-text)" onclick={() => downloadResult("json")}>JSON</button>
            </div>
          {/if}
        </div>

        {#if activeResult}
          <div class="min-h-0 flex-1 overflow-auto">
            <table class="min-w-full border-collapse text-left text-xs">
              <thead class="sticky top-0 z-[1] bg-(--color-bg)">
                <tr>
                  <th class="border-b border-r border-(--color-border) px-2 py-2 font-medium text-(--color-text-light)">#</th>
                  {#each activeResult.columns as column}
                    <th class="whitespace-nowrap border-b border-r border-(--color-border) px-3 py-2 font-semibold text-(--color-text)">{column}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each activeResult.values as row, rowIndex}
                  <tr class="odd:bg-(--color-bg-alt) even:bg-(--color-bg)">
                    <td class="border-b border-r border-(--color-border) px-2 py-1.5 text-right font-mono tabular-nums text-(--color-text-light)">{rowIndex + 1}</td>
                    {#each row as value}
                      <td class="max-w-[32rem] whitespace-pre-wrap break-words border-b border-r border-(--color-border) px-3 py-1.5 font-mono text-(--color-text) {value === null ? 'italic text-(--color-text-light)' : ''}" title={formatValue(value)}>{formatValue(value)}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if activeResult.truncated}
            <div class="border-t border-(--color-border) px-3 py-2 text-xs text-amber-700 dark:text-amber-400">Showing the first {MAX_RESULT_ROWS.toLocaleString()} rows. The query was stopped early; add a LIMIT clause to choose a precise result size.</div>
          {/if}
        {:else}
          <div class="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
            <div>
              <p class="text-sm font-medium text-(--color-text)">{affectedRows > 0 ? `${affectedRows.toLocaleString()} rows changed` : "No result set yet"}</p>
              <p class="mt-1 text-xs text-(--color-text-muted)">Run a SELECT query to inspect rows, or use INSERT, UPDATE, DELETE, and DDL statements to edit the in-memory database.</p>
            </div>
          </div>
        {/if}
      </div>
    </section>
  </div>

  {#if selectedObject}
    <section class="border border-(--color-border) bg-(--color-bg-alt)">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-3 py-2">
        <div>
          <h2 class="text-sm font-semibold text-(--color-text)">{selectedObject.name}</h2>
          <p class="text-[11px] uppercase tracking-wider text-(--color-text-light)">{selectedObject.type} details</p>
        </div>
        <button class="border border-(--color-border) px-3 py-1.5 text-xs font-medium text-(--color-text-muted) hover:border-(--color-text-muted) hover:text-(--color-text)" onclick={() => queryObject(selectedObject!)}>Query this {selectedObject.type}</button>
      </div>

      <div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)]">
        <div class="overflow-x-auto border-b border-(--color-border) lg:border-b-0 lg:border-r">
          <table class="min-w-full text-left text-xs">
            <thead class="bg-(--color-bg)">
              <tr>
                <th class="px-3 py-2 font-medium text-(--color-text-muted)">Column</th>
                <th class="px-3 py-2 font-medium text-(--color-text-muted)">Type</th>
                <th class="px-3 py-2 font-medium text-(--color-text-muted)">Rules</th>
                <th class="px-3 py-2 font-medium text-(--color-text-muted)">Default</th>
              </tr>
            </thead>
            <tbody>
              {#each columns as column}
                <tr class="border-t border-(--color-border)">
                  <td class="px-3 py-2 font-mono font-medium text-(--color-text)">{column.name}</td>
                  <td class="px-3 py-2 font-mono text-(--color-text-muted)">{column.type}</td>
                  <td class="px-3 py-2 text-(--color-text-muted)">{[column.primaryKey ? `PK${column.primaryKey > 1 ? ` ${column.primaryKey}` : ""}` : "", column.notNull ? "NOT NULL" : ""].filter(Boolean).join(" · ") || "—"}</td>
                  <td class="px-3 py-2 font-mono text-(--color-text-muted)">{column.defaultValue === null ? "—" : formatValue(column.defaultValue)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="grid content-start gap-4 p-3">
          <div>
            <h3 class="mb-2 text-xs font-semibold text-(--color-text)">Definition</h3>
            <pre class="max-h-40 overflow-auto whitespace-pre-wrap break-words border border-(--color-border) bg-(--color-bg) p-3 text-xs text-(--color-text-muted)">{selectedObject.sql || "No SQL definition is available."}</pre>
          </div>
          <div>
            <h3 class="mb-2 text-xs font-semibold text-(--color-text)">Indexes</h3>
            {#if indexes.length > 0}
              <div class="divide-y divide-(--color-border) border border-(--color-border)">
                {#each indexes as index}
                  <div class="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span class="truncate font-mono text-(--color-text)">{index.name}</span>
                    <span class="shrink-0 text-(--color-text-muted)">{index.unique ? "unique" : "index"} · {index.origin}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-(--color-text-muted)">No explicit indexes.</p>
            {/if}
          </div>
        </div>
      </div>

      {#if preview}
        <div class="border-t border-(--color-border)">
          <div class="flex items-center justify-between px-3 py-2">
            <h3 class="text-xs font-semibold text-(--color-text)">First {preview.values.length} rows</h3>
            {#if preview.truncated}<span class="text-[11px] text-(--color-text-muted)">More rows available</span>{/if}
          </div>
          <div class="max-h-72 overflow-auto border-t border-(--color-border)">
            <table class="min-w-full text-left text-xs">
              <thead class="sticky top-0 bg-(--color-bg)">
                <tr>{#each preview.columns as column}<th class="whitespace-nowrap border-b border-r border-(--color-border) px-3 py-2 font-medium text-(--color-text)">{column}</th>{/each}</tr>
              </thead>
              <tbody>
                {#each preview.values as row}
                  <tr>{#each row as value}<td class="max-w-[28rem] border-b border-r border-(--color-border) px-3 py-1.5 font-mono text-(--color-text-muted)">{formatValue(value)}</td>{/each}</tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>
