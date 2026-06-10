'use strict';

/**
 * Tests for the content adapter: turning a stored body into safe display HTML by content type. Pure
 * logic, no pict or browser.
 */

const libChai = require('chai');
const libExpect = libChai.expect;

const libAdapter = require('../source/content/ContentAdapter.js');

suite('ContentAdapter',
function ()
{
	test('escapeHtml neutralizes markup', function ()
	{
		libExpect(libAdapter.escapeHtml('<script>"&\'')).to.equal('&lt;script&gt;&quot;&amp;&#39;');
		libExpect(libAdapter.escapeHtml(null)).to.equal('');
	});

	test('text bodies are escaped and keep line breaks', function ()
	{
		let tmpHtml = libAdapter.renderToHtml('line<1>\nline2', 'text');
		libExpect(tmpHtml).to.contain('line&lt;1&gt;');
		libExpect(tmpHtml).to.contain('<br>');
		libExpect(tmpHtml).to.contain('psc-body-text');
	});

	test('markdown bodies go through the host parser when supplied', function ()
	{
		let tmpCalls = [];
		let tmpHtml = libAdapter.renderToHtml('# Hi', 'markdown', { parseMarkdown: function (pMD) { tmpCalls.push(pMD); return '<h1>Hi</h1>'; } });
		libExpect(tmpCalls).to.deep.equal(['# Hi']);
		libExpect(tmpHtml).to.contain('<h1>Hi</h1>');
		libExpect(tmpHtml).to.contain('pict-content');
	});

	test('markdown without a parser degrades to safe escaped text', function ()
	{
		let tmpHtml = libAdapter.renderToHtml('<b>not html</b>', 'markdown');
		libExpect(tmpHtml).to.contain('&lt;b&gt;');
		libExpect(tmpHtml).to.not.contain('<b>not html</b>');
	});

	test('rich uses the same markdown pipeline as markdown', function ()
	{
		let tmpHtml = libAdapter.renderToHtml('x', 'rich', { parseMarkdown: function () { return '<p>x</p>'; } });
		libExpect(tmpHtml).to.contain('<p>x</p>');
	});

	test('json bodies render pretty-printed and escaped', function ()
	{
		let tmpHtml = libAdapter.renderToHtml({ a: '<b>' }, 'json');
		libExpect(tmpHtml).to.contain('psc-body-json');
		libExpect(tmpHtml).to.contain('&lt;b&gt;');
	});

	test('EditorMode maps to the content type stamped on new comments', function ()
	{
		libExpect(libAdapter.defaultContentTypeForMode('text')).to.equal('text');
		libExpect(libAdapter.defaultContentTypeForMode('multiline')).to.equal('text');
		libExpect(libAdapter.defaultContentTypeForMode('markdown')).to.equal('markdown');
		libExpect(libAdapter.defaultContentTypeForMode('rich')).to.equal('rich');
		libExpect(libAdapter.defaultContentTypeForMode('bogus')).to.equal('text');
		libExpect(libAdapter.modeRendersMarkdown('markdown')).to.equal(true);
		libExpect(libAdapter.modeRendersMarkdown('text')).to.equal(false);
	});
});
