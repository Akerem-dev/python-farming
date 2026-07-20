import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const pythonFarmingHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--color-code-comment)" },
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: "#d7a6ff" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--color-code-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "#9fd49f" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#f1c46f" },
  { tag: [tags.className, tags.typeName], color: "#76c8d8" },
  { tag: [tags.variableName, tags.propertyName], color: "var(--color-code-text)" },
  { tag: [tags.operator, tags.punctuation], color: "var(--color-text-muted)" },
  { tag: tags.invalid, color: "#ff7f7f", textDecoration: "underline wavy" },
]);

export const pythonFarmingEditorTheme = [
  EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "var(--color-code-background)",
        color: "var(--color-code-text)",
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
      },
      ".cm-scroller": {
        overflow: "auto",
        lineHeight: "1.75",
      },
      ".cm-content": {
        minHeight: "100%",
        padding: "16px 0 48px",
        caretColor: "var(--color-text-primary)",
      },
      ".cm-line": {
        padding: "0 18px 0 8px",
      },
      ".cm-gutters": {
        border: "0",
        borderRight: "1px solid var(--color-border)",
        backgroundColor: "var(--color-code-background)",
        color: "var(--color-text-dim)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "44px",
        padding: "0 12px 0 8px",
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(255, 255, 255, 0.025)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "rgba(241, 174, 47, 0.055)",
        color: "var(--color-text-muted)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "rgba(241, 174, 47, 0.19) !important",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-accent)",
      },
      ".cm-matchingBracket": {
        outline: "1px solid rgba(241, 174, 47, 0.6)",
        backgroundColor: "rgba(241, 174, 47, 0.12)",
      },
      ".cm-foldPlaceholder": {
        border: "1px solid var(--color-border-strong)",
        backgroundColor: "var(--color-surface-raised)",
        color: "var(--color-text-muted)",
      },
      ".cm-tooltip": {
        border: "1px solid var(--color-border-strong)",
        backgroundColor: "var(--color-surface-raised)",
        color: "var(--color-text-primary)",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "rgba(241, 174, 47, 0.14)",
        color: "var(--color-text-primary)",
      },
      "&.cm-focused": {
        outline: "none",
      },
    },
    { dark: true },
  ),
  syntaxHighlighting(pythonFarmingHighlightStyle),
];
