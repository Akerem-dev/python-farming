import { create } from "zustand";
import type { CurriculumEditorWorkspace } from "../features/curriculum/types";
import type {
  EditorCursorPosition,
  EditorDocument,
  EditorLanguage,
  EditorSessionSnapshot,
} from "./editorModels";

export const beginnerStarterCode = `# Kendini tanıtan iki değişken oluştur

ad = ""
yas = 0

print(f"Merhaba, ben {ad} ve {yas} yaşındayım.")`;

const initialDocument: EditorDocument = {
  id: "main-python",
  name: "main.py",
  path: "main.py",
  language: "python",
  content: beginnerStarterCode,
  initialContent: beginnerStarterCode,
  readOnly: false,
  saveStatus: "saved",
  cursor: { line: 1, column: 1 },
  revision: 0,
};

interface EditorState extends EditorSessionSnapshot {
  setActiveDocument: (documentId: string) => void;
  loadLessonDocument: (lessonId: string, filename: string, starterCode: string) => void;
  loadLessonWorkspace: (lessonId: string, workspace: CurriculumEditorWorkspace) => void;
  updateDocumentContent: (documentId: string, content: string) => void;
  updateCursor: (documentId: string, cursor: EditorCursorPosition) => void;
  markDocumentSaving: (documentId: string) => void;
  markDocumentSaved: (documentId: string) => void;
  resetDocument: (documentId: string) => void;
  resetWorkspace: () => void;
  restoreSnapshot: (snapshot: EditorSessionSnapshot) => void;
}

function updateDocument(
  documents: EditorDocument[],
  documentId: string,
  updater: (document: EditorDocument) => EditorDocument,
) {
  return documents.map((document) => (document.id === documentId ? updater(document) : document));
}

export function inferEditorLanguage(path: string): EditorLanguage {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "py") {
    return "python";
  }
  if (extension === "json") {
    return "json";
  }
  return "text";
}

function createDocument(lessonId: string, path: string, starterCode: string, readOnly = false) {
  const normalizedPath = path.replace(/\\/g, "/");
  return {
    id: `lesson:${lessonId}:${normalizedPath}`,
    name: normalizedPath.split("/").at(-1) ?? normalizedPath,
    path: normalizedPath,
    language: inferEditorLanguage(normalizedPath),
    content: starterCode,
    initialContent: starterCode,
    readOnly,
    saveStatus: "saved" as const,
    cursor: { line: 1, column: 1 },
    revision: 0,
  };
}

function workspaceDocuments(lessonId: string, workspace: CurriculumEditorWorkspace) {
  const files = workspace.files?.length
    ? workspace.files
    : [{ path: workspace.filename, starterCode: workspace.starterCode, readOnly: false }];
  return files.map((file) => createDocument(lessonId, file.path, file.starterCode, file.readOnly));
}

export const useEditorStore = create<EditorState>((set) => ({
  activeDocumentId: initialDocument.id,
  entrypoint: initialDocument.path,
  documents: [initialDocument],

  setActiveDocument: (documentId) =>
    set((state) =>
      state.documents.some((document) => document.id === documentId)
        ? { activeDocumentId: documentId }
        : state,
    ),

  loadLessonDocument: (lessonId, filename, starterCode) => {
    const document = createDocument(lessonId, filename, starterCode);
    set({
      activeDocumentId: document.id,
      entrypoint: document.path,
      documents: [document],
    });
  },

  loadLessonWorkspace: (lessonId, workspace) => {
    const documents = workspaceDocuments(lessonId, workspace);
    const requestedEntrypoint = (workspace.entrypoint ?? workspace.filename).replace(/\\/g, "/");
    const entrypointDocument =
      documents.find((document) => document.path === requestedEntrypoint) ?? documents[0];

    if (!entrypointDocument) {
      return;
    }

    set({
      activeDocumentId: entrypointDocument.id,
      entrypoint: entrypointDocument.path,
      documents,
    });
  },

  updateDocumentContent: (documentId, content) =>
    set((state) => ({
      documents: updateDocument(state.documents, documentId, (document) => {
        if (document.readOnly || document.content === content) {
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
        saveStatus: document.readOnly ? "saved" : "saving",
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
        saveStatus:
          document.readOnly || document.content === document.initialContent
            ? document.saveStatus
            : "dirty",
        cursor: { line: 1, column: 1 },
        revision: document.revision + 1,
      })),
    })),

  resetWorkspace: () =>
    set((state) => ({
      documents: state.documents.map((document) => ({
        ...document,
        content: document.initialContent,
        saveStatus:
          document.readOnly || document.content === document.initialContent
            ? document.saveStatus
            : "dirty",
        cursor: { line: 1, column: 1 },
        revision: document.revision + 1,
      })),
    })),

  restoreSnapshot: (snapshot) =>
    set({
      activeDocumentId: snapshot.activeDocumentId,
      entrypoint: snapshot.entrypoint,
      documents: snapshot.documents,
    }),
}));

export function getActiveDocument(snapshot: EditorSessionSnapshot) {
  return snapshot.documents.find((document) => document.id === snapshot.activeDocumentId) ?? null;
}
