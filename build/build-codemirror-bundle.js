#!/usr/bin/env node
/**
 * Bundle CodeMirror v6 into a single browser script for the demo, exposing
 * window.CodeMirrorModules = { EditorView, EditorState, Decoration, ViewPlugin, WidgetType,
 * basicSetup, markdown, extensions }.
 *
 * Run: node build/build-codemirror-bundle.js
 * Output: example_applications/comments_demo/html/codemirror-bundle.js
 *         (quack copy then lands it in the demo's dist/)
 *
 * This is a demo concern. The pict-section-comments module does not depend on CodeMirror; a
 * consuming app supplies it (via window.CodeMirrorModules or the CodeMirrorModules option).
 */
const { build } = require('esbuild');
const libPath = require('path');

const tmpOutfile = libPath.join(__dirname, '..', 'example_applications', 'comments_demo', 'html', 'codemirror-bundle.js');

build(
{
	entryPoints: [libPath.join(__dirname, 'codemirror-entry.js')],
	bundle: true,
	outfile: tmpOutfile,
	format: 'iife',
	globalName: 'CodeMirrorModules',
	platform: 'browser',
	target: ['es2018'],
	minify: true
}).then(() =>
{
	console.log('CodeMirror bundle built -> ' + tmpOutfile);
}).catch((pError) =>
{
	console.error('CodeMirror bundle build failed:', pError);
	process.exit(1);
});
