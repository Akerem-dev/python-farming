import { useMemo } from "react";
import type { EditorDocument } from "./editorModels";
import styles from "./ProjectTree.module.css";

interface ProjectTreeProps {
  documents: EditorDocument[];
  activeDocumentId: string;
  entrypoint: string;
  onSelect: (documentId: string) => void;
}

type TreeRow =
  | { kind: "folder"; key: string; label: string; depth: number }
  | { kind: "file"; key: string; label: string; depth: number; document: EditorDocument };

function createRows(documents: EditorDocument[]): TreeRow[] {
  const rows: TreeRow[] = [];
  const folders = new Set<string>();

  for (const document of [...documents].sort((left, right) => left.path.localeCompare(right.path))) {
    const parts = document.path.split("/");
    const filename = parts.pop() ?? document.path;
    let prefix = "";

    parts.forEach((part, index) => {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (!folders.has(prefix)) {
        folders.add(prefix);
        rows.push({ kind: "folder", key: `folder:${prefix}`, label: part, depth: index });
      }
    });

    rows.push({
      kind: "file",
      key: `file:${document.path}`,
      label: filename,
      depth: parts.length,
      document,
    });
  }

  return rows;
}

function fileIcon(document: EditorDocument) {
  if (document.language === "python") {
    return "PY";
  }
  if (document.language === "json") {
    return "{}";
  }
  return document.path.endsWith(".csv") ? "CSV" : "TXT";
}

export function ProjectTree({
  documents,
  activeDocumentId,
  entrypoint,
  onSelect,
}: ProjectTreeProps) {
  const rows = useMemo(() => createRows(documents), [documents]);

  return (
    <aside className={styles.root} aria-label="Proje dosyaları">
      <header>
        <span>Proje</span>
        <strong>{documents.length} dosya</strong>
      </header>
      <div className={styles.rows}>
        {rows.map((row) =>
          row.kind === "folder" ? (
            <div
              className={styles.folder}
              key={row.key}
              style={{ paddingLeft: `${12 + row.depth * 14}px` }}
            >
              <span>⌄</span>
              {row.label}
            </div>
          ) : (
            <button
              type="button"
              className={row.document.id === activeDocumentId ? styles.activeFile : styles.file}
              key={row.key}
              onClick={() => onSelect(row.document.id)}
              style={{ paddingLeft: `${14 + row.depth * 14}px` }}
              title={row.document.path}
            >
              <span className={styles.fileIcon} data-language={row.document.language}>
                {fileIcon(row.document)}
              </span>
              <b>{row.label}</b>
              {row.document.path === entrypoint ? <small>Giriş</small> : null}
              {row.document.readOnly ? <i aria-label="Salt okunur">◇</i> : null}
            </button>
          ),
        )}
      </div>
    </aside>
  );
}
