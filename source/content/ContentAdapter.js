'use strict';

/**
 * ContentAdapter
 * --------------
 * Turns a comment's stored Body into safe display HTML, picking a path from its ContentType. The
 * section supports a spectrum of bodies:
 *
 *   text      a plain comment; escaped, newlines become <br>.
 *   markdown  a lightweight markdown comment (the everyday rich comment, with image drag-in).
 *   rich      a body authored in the full markdown editor pipeline.
 *   json      arbitrary structured content (diagrams, svg); a future adapter renders it. For now it
 *             is shown escaped so nothing breaks.
 *
 * markdown and rich render through the same markdown parser, supplied by the host (the view passes
 * pict-section-content's parseMarkdown). When no parser is wired the adapter falls back to escaped
 * text with line breaks, so a body never renders as raw markup and never injects HTML.
 *
 * This module is pure (it requires nothing), so it is trivial to test and carries no weight into a
 * consumer that only ever shows plain-text comments.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const _CONTENT_TYPE = { Text: 'text', Markdown: 'markdown', Rich: 'rich', Json: 'json' };

// The EditorMode a section is configured with picks the ContentType stamped on new comments.
const _MODE_TO_CONTENT_TYPE =
{
	'text': _CONTENT_TYPE.Text,
	'multiline': _CONTENT_TYPE.Text,
	'markdown': _CONTENT_TYPE.Markdown,
	'rich': _CONTENT_TYPE.Rich
};

function escapeHtml(pText)
{
	if (pText == null) { return ''; }
	return String(pText)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Escaped text with line breaks preserved, wrapped so it picks up comment-body styling.
function renderPlain(pBody)
{
	return '<div class="psc-body-text">' + escapeHtml(pBody).replace(/\r?\n/g, '<br>') + '</div>';
}

/**
 * Render a stored body to safe HTML.
 * @param {string} pBody
 * @param {string} pContentType - one of CONTENT_TYPE
 * @param {object} [pHelpers]
 * @param {function(string):string} [pHelpers.parseMarkdown] - markdown -> sanitized HTML (host supplied)
 * @returns {string} HTML safe to assign into the DOM
 */
function renderToHtml(pBody, pContentType, pHelpers)
{
	let tmpHelpers = pHelpers || {};
	let tmpType = pContentType || _CONTENT_TYPE.Text;

	if (tmpType === _CONTENT_TYPE.Markdown || tmpType === _CONTENT_TYPE.Rich)
	{
		if (typeof tmpHelpers.parseMarkdown === 'function')
		{
			// The host's parser (pict-section-content) is responsible for sanitizing embedded HTML.
			return '<div class="psc-body-rich pict-content">' + tmpHelpers.parseMarkdown(String(pBody == null ? '' : pBody)) + '</div>';
		}
		// No parser wired: degrade to escaped text so the body is never unsafe or raw markup.
		return renderPlain(pBody);
	}

	if (tmpType === _CONTENT_TYPE.Json)
	{
		let tmpPretty;
		try { tmpPretty = JSON.stringify((typeof pBody === 'string') ? JSON.parse(pBody) : pBody, null, 2); }
		catch (pError) { tmpPretty = String(pBody == null ? '' : pBody); }
		return '<pre class="psc-body-json"><code>' + escapeHtml(tmpPretty) + '</code></pre>';
	}

	return renderPlain(pBody);
}

/** The ContentType to stamp on a new comment given the section's EditorMode. */
function defaultContentTypeForMode(pEditorMode)
{
	return _MODE_TO_CONTENT_TYPE[pEditorMode] || _CONTENT_TYPE.Text;
}

/** Whether an EditorMode uses the markdown read pipeline (so the view registers the content provider). */
function modeRendersMarkdown(pEditorMode)
{
	let tmpType = defaultContentTypeForMode(pEditorMode);
	return (tmpType === _CONTENT_TYPE.Markdown || tmpType === _CONTENT_TYPE.Rich);
}

module.exports =
{
	escapeHtml: escapeHtml,
	renderToHtml: renderToHtml,
	renderPlain: renderPlain,
	defaultContentTypeForMode: defaultContentTypeForMode,
	modeRendersMarkdown: modeRendersMarkdown,
	CONTENT_TYPE: _CONTENT_TYPE
};
