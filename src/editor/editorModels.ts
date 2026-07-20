export type EditorLanguage = "python";

export type EditorSaveStatus = "saved" | "dirty" | "saving";

export interface EditorCursorPosition {
  line: number;
  column: number;
}

export interface EditorDocument {
  id: string;
  name: string;
  language: EditorLanguage;
  content: string;
  initialContent: string;
  saveStatus: EditorSaveStatus;
  cursor: EditorCursorPosition;
  revision: number;
}

export interface EditorSessionSnapshot {
  activeDocumentId: string;
  documents: EditorDocument[];
}
