'use strict';

/**
 * In-memory demo for pict-section-comments: boot a Pict app, mount the Comments section on a
 * WorkItem context, and seed a couple of threads so it is not empty on first load. The section uses
 * its default InMemoryCommentProvider, so every interaction (compose, reply, edit, delete, resolve,
 * sort) just works against AppData with no server.
 */

const libPictApplication = require('pict-application');
const libPict = require('pict');
const libComments = require('../../../source/Pict-Section-Comments.js');

const _CONTEXT = { OwnerType: 'WorkItem', IDOwner: 4012 };
const _ME = { Key: 7, Name: 'Ada Lovelace' };
const _GRACE = { Key: 9, Name: 'Grace Hopper' };

class CommentsDemoApplication extends libPictApplication
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.pict.addView('Comments', Object.assign({}, libComments.default_configuration,
		{
			Context: _CONTEXT,
			Title: 'Discussion',
			Threaded: true,
			EditorMode: 'markdown',
			CurrentUser: _ME,
			// Demo uploader: inline the dropped/pasted image as a data URL so the demo needs no server.
			ImageUpload: function (pFile, fCallback)
			{
				try
				{
					let tmpReader = new FileReader();
					tmpReader.onload = function () { fCallback(null, tmpReader.result); };
					tmpReader.onerror = function () { fCallback('could not read file'); };
					tmpReader.readAsDataURL(pFile);
				}
				catch (pError) { fCallback(pError.message || 'upload failed'); }
			}
		}), libComments);

		// Render the section as the app's main viewport (instead of the placeholder Default-View).
		this.options.MainViewportViewIdentifier = 'Comments';

		// Demo-only: this bare page has no Pict-managed style mount, and some styles (the modal's)
		// register lazily on first use. Bridge injectCSS so every flush also lands in our style tag.
		this._installCssBridge();
	}

	_installCssBridge()
	{
		let tmpSelf = this;
		let tmpMap = this.pict.CSSMap;
		if (!tmpMap || tmpMap._demoBridged) { return; }
		let tmpOriginal = (typeof tmpMap.injectCSS === 'function') ? tmpMap.injectCSS.bind(tmpMap) : function () {};
		tmpMap.injectCSS = function ()
		{
			let tmpResult;
			try { tmpResult = tmpOriginal(); } catch (pError) { /* the bare demo has no mount; ignore */ }
			tmpSelf._injectDemoCss();
			return tmpResult;
		};
		tmpMap._demoBridged = true;
	}

	onAfterInitializeAsync(fCallback)
	{
		let tmpView = this.pict.views['Comments'];
		let tmpSelf = this;
		this._seed(tmpView).then(function () { return tmpView.load(); }).then(function () { tmpSelf._injectDemoCss(); tmpSelf._exposeModeToggle(tmpView); fCallback(); }).catch(function ()
		{
			tmpView.render();
			tmpSelf._injectDemoCss();
			tmpSelf._exposeModeToggle(tmpView);
			fCallback();
		});
	}

	// Let the demo page flip the section between the inline markdown composer and the full rich
	// editor (which opens in a modal). CodeMirror is loaded by the page, so rich is available.
	_exposeModeToggle(pView)
	{
		if (typeof window === 'undefined') { return; }
		let tmpSelf = this;
		window.__setCommentsMode = function (pMode)
		{
			pView.options.EditorMode = pMode;
			pView._shape();
			pView.render();
			tmpSelf._injectDemoCss();
			let tmpMd = document.getElementById('mode-markdown');
			let tmpRich = document.getElementById('mode-rich');
			if (tmpMd) { tmpMd.classList.toggle('mode-on', pMode === 'markdown'); }
			if (tmpRich) { tmpRich.classList.toggle('mode-on', pMode === 'rich'); }
		};
	}

	// This bare demo mounts a view into a static page rather than a full Pict app shell, so the
	// framework's automatic CSS mount is not present. Flush the registered styles (section + content)
	// into a style tag once. A real Pict host (for example plansheet) gets this through the normal
	// CSS cascade and needs no such step.
	_injectDemoCss()
	{
		if (typeof document === 'undefined') { return; }
		let tmpStyle = document.getElementById('psc-demo-css');
		if (!tmpStyle) { tmpStyle = document.createElement('style'); tmpStyle.id = 'psc-demo-css'; document.head.appendChild(tmpStyle); }
		tmpStyle.textContent = this.pict.CSSMap.generateCSS();
	}

	// Seed two threads directly through the section's provider, then let the view load them.
	_seed(pView)
	{
		let tmpProvider = pView._provider;
		let tmpThreadA;

		return tmpProvider.createThread({ Context: _CONTEXT, Kind: 'Discussion', Title: 'Scope and the owner mapping', Author: _ME })
			.then(function (pThread)
			{
				tmpThreadA = pThread;
				return tmpProvider.createComment(
				{
					ThreadKey: tmpThreadA.Key, Author: _ME, ContentType: 'markdown',
					Body: 'Kicking this off. A couple of things before we build:\n\n- **scope** looks right\n- we still need to confirm how `IDOwner` maps to the record\n\nThoughts?'
				});
			})
			.then(function (pFirst)
			{
				return tmpProvider.createComment(
				{
					ThreadKey: tmpThreadA.Key, Author: _GRACE, ContentType: 'markdown',
					Body: 'Agreed. I will take the mapping: a comment points at `OwnerType + IDOwner`, same shape as Media.'
				})
				.then(function ()
				{
					// a reply to the first comment, to show one level of threading
					return tmpProvider.createComment({ ThreadKey: tmpThreadA.Key, ParentKey: pFirst.Key, Author: _GRACE, ContentType: 'markdown', Body: 'Replying inline to your second point: confirmed, the mapping is a string `IDOwner`.' });
				});
			})
			.then(function ()
			{
				// an anchored, already-resolved moderation note (renders collapsed)
				return tmpProvider.createThread({ Context: _CONTEXT, Kind: 'Moderation', Title: 'Tone on the intro paragraph', Anchor: { Type: 'Paragraph', Label: 'paragraph 2' }, Status: libComments.THREAD_STATUS.Resolved, Author: _GRACE });
			})
			.then(function (pThreadB)
			{
				return tmpProvider.createComment({ ThreadKey: pThreadB.Key, Author: _GRACE, ContentType: 'text', Body: 'Flagged the second paragraph for tone. Resolved after the edit.' });
			});
	}
}

module.exports = CommentsDemoApplication;

// Self-contained boot: expose the Pict global the HTML shell uses, so the demo needs only this bundle.
if (typeof window !== 'undefined' && !window.Pict)
{
	window.Pict = libPict;
}
