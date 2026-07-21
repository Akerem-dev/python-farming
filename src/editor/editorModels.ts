export type EditorLanguage = "python" | "json" | "text";

export type EditorSaveStatus = "saved" | "dirty" | "saving";

export interface EditorCursorPosition {
  line: number;
  column: number;
}

export interface EditorDocument {
  id: string;
  name: string;
  path: string;
  language: EditorLanguage;
  content: string;
  initialContent: string;
  readOnly: boolean;
  saveStatus: EditorSaveStatus;
  cursor: EditorCursorPosition;
  revision: number;
}

export interface EditorSessionSnapshot {
  activeDocumentId: string;
  entrypoint: string;
  documents: EditorDocument[];
}
