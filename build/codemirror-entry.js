/**
 * CodeMirror v6 entry point for browser bundling (demo only).
 *
 * esbuild bundles this into the demo's codemirror-bundle.js, exposing
 * window.CodeMirrorModules with everything pict-section-markdowneditor needs for the 'rich'
 * EditorMode. The host (here, the demo page) loads this BEFORE the app bundle; the comments
 * section reads window.CodeMirrorModules and forwards it to the editor.
 *
 * A real consuming app provides CodeMirror the same way (or passes it as the CodeMirrorModules
 * option). The comments module itself does not depend on CodeMirror.
 */
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';

export { EditorView, EditorState, Decoration, ViewPlugin, WidgetType, basicSetup, markdown };

// The extensions array the editor expects (basic setup + markdown syntax).
export const extensions = [basicSetup, markdown()];
