import { create } from "zustand";
import type { EditorCursorPosition, EditorDocument, EditorSessionSnapshot } from "./editorModels";

export const beginnerStarterCode = `# Kendini tanıtan iki değişken oluştur

ad = ""
yas = 0

print(f"Merhaba, ben {ad} ve {yas} yaşındayım.")`;

const initialDocument: EditorDocument = {
  id: "main-python",
  name: "main.py",
  language: "python",
  content: beginnerStarterCode,
  initialContent: beginnerStarterCode,
  saveStatus: "saved",
  cursor: { line: 1, column: 1 },
  revision: 0,
};

interface EditorState extends EditorSessionSnapshot {
  setActiveDocument: (documentId: string) => void;
  loadLessonDocument: (lessonId: string, filename: string, starterCode: string) => void;
  updateDocumentContent: (documentId: string, content: string) => void;
  updateCursor: (documentId: string, cursor: EditorCursorPosition) => void;
  markDocumentSaving: (documentId: string) => void;
  markDocumentSaved: (documentId: string) => void;
  resetDocument: (documentId: string) => void;
  restoreSnapshot: (snapshot: EditorSessionSnapshot) => void;
}

function updateDocument(
  documents: EditorDocument[],
  documentId: string,
  updater: (document: EditorDocument) => EditorDocument,
) {
  return documents.map((document) => (document.id === documentId ? updater(document) : document));
}

export const useEditorStore = create<EditorState>((set) => ({
  activeDocumentId: initialDocument.id,
  documents: [initialDocument],

  setActiveDocument: (documentId) =>
    set((state) =>
      state.documents.some((document) => document.id === documentId)
        ? { activeDocumentId: documentId }
        : state,
    ),

  loadLessonDocument: (lessonId, filename, starterCode) => {
    const documentId = `lesson:${lessonId}`;
    set({
      activeDocumentId: documentId,
      documents: [
        {
          id: documentId,
          name: filename,
          language: "python",
          content: starterCode,
          initialContent: starterCode,
          saveStatus: "saved",
          cursor: { line: 1, column: 1 },
          revision: 0,
        },
      ],
    });
  },

  updateDocumentContent: (documentId, content) =>
    set((state) => ({
      documents: updateDocument(state.documents, documentId, (document) => {
        if (document.content === content) {
          return document;
        }

        return {
          ...document,
          content,
          saveStatus: "dirty",
          revision: document.revision + 1,
        };
      }),
    })),

  updateCursor: (documentId, cursor) =>
    set((state) => ({
      documents: updateDocument(state.documents, documentId, (document) => ({
        ...document,
        cursor,
      })),
    })),

  markDocumentSaving: (documentId) =>
    set((state) => ({
      documents: updateDocument(state.documents, documentId, (document) => ({
        ...document,
        saveStatus: "saving",
      })),
    })),

  markDocumentSaved: (documentId) =>
    set((state) => ({
      documents: updateDocument(state.documents, documentId, (document) => ({
        ...document,
        saveStatus: "saved",
      })),
    })),

  resetDocument: (documentId) =>
    set((state) => ({
      documents: updateDocument(state.documents, documentId, (document) => ({
        ...document,
        content: document.initialContent,
        saveStatus: document.content === document.initialContent ? document.saveStatus : "dirty",
        cursor: { line: 1, column: 1 },
        revision: document.revision + 1,
      })),
    })),

  restoreSnapshot: (snapshot) =>
    set({
      activeDocumentId: snapshot.activeDocumentId,
      documents: snapshot.documents,
    }),
}));

export function getActiveDocument(snapshot: EditorSessionSnapshot) {
  return snapshot.documents.find((document) => document.id === snapshot.activeDocumentId) ?? null;
}
