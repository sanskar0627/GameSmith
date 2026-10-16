"use client";

import { useEffect, useRef } from "react";
import { indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { cn } from "@/lib/utils";

/**
 * CodeMirror 6 in the Ember on Bone palette. Colors come from the theme's
 * CSS variables, so the editor follows Paper and Night without a rebuild.
 * Syntax uses tone, not new hues: ember for keywords and literals, muted
 * for comments, ink for the rest.
 */

export function languageFor(path: string): Extension {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "html":
    case "htm":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "md":
    case "markdown":
      return markdown();
    default:
      return [];
  }
}

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12.5px",
    color: "var(--foreground)",
    backgroundColor: "var(--card)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--ember)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ember)", borderLeftWidth: "2px" },
  ".cm-gutters": {
    backgroundColor: "var(--card)",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 16px 0 12px", minWidth: "3rem" },
  // Mix in sRGB: oklch mixes with `transparent` drift toward red.
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLineGutter": { color: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ember) 22%, transparent)",
  },
  ".cm-matchingBracket": { backgroundColor: "var(--ember-soft)", outline: "none" },
  ".cm-searchMatch": { backgroundColor: "var(--ember-soft)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--muted)", border: "none", color: "var(--muted-foreground)" },
  ".cm-tooltip, .cm-panels": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
  ".cm-panels input, .cm-panels button": { fontFamily: "var(--font-sans)", fontSize: "12px" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "var(--ember-text)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--ember-text)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--ember-text)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.typeName, t.className, t.definition(t.variableName), t.function(t.definition(t.variableName))], fontWeight: "600" },
  { tag: [t.tagName, t.propertyName, t.attributeName], color: "var(--foreground)" },
  { tag: [t.punctuation, t.bracket, t.operator], color: "var(--muted-foreground)" },
  { tag: t.invalid, color: "var(--destructive)" },
  { tag: t.heading, fontWeight: "600" },
  { tag: t.link, textDecoration: "underline" },
]);

export function CodeEditor({
  docKey,
  value,
  path,
  readOnly = false,
  onChange,
  onSave,
  className,
}: {
  /** Changing the key swaps in a fresh document (new undo history). */
  docKey: string;
  value: string;
  /** Picks the language mode from the extension. */
  path: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  /** Cmd/Ctrl+S. */
  onSave?: () => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onSave });
  const readOnlyCompartment = useRef(new Compartment());

  useEffect(() => {
    handlers.current = { onChange, onSave };
  });

  // One view for the component's life; documents are swapped by key.
  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.setState(
      EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                handlers.current.onSave?.();
                return true;
              },
            },
            indentWithTab,
          ]),
          languageFor(path),
          theme,
          syntaxHighlighting(highlight),
          EditorView.contentAttributes.of({ "aria-label": `Editing ${path}` }),
          readOnlyCompartment.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange?.(update.state.doc.toString());
          }),
        ],
      }),
    );
    // A new document only when the key changes; typing must not reset the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return <div ref={host} className={cn("h-full min-h-0 overflow-hidden", className)} />;
}
