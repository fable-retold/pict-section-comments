'use strict';

/**
 * PictView-Comments
 * -----------------
 * The comments section. Mount it on a Context (OwnerType + IDOwner) and it renders that context's
 * threads and their comments, with composing, replying, editing, deleting, resolving and collapsing,
 * newest or oldest sort, and a read-only mode.
 *
 * It never touches storage itself: every read and write goes through a CommentDataProvider (see
 * providers/CommentProvider-Base.js). With nothing wired it uses an InMemoryCommentProvider backed by
 * a slice of AppData, so it works the moment it mounts; a host swaps in its own provider to persist.
 *
 * Comment bodies render through ContentAdapter: plain text by default, or markdown (rendered with
 * pict-section-content, with image and file drag-in on the composer). The EditorMode picks which.
 *
 * Rendering follows the pict conventions: data lives in AppData (the active instance's shaped state is
 * published to AppData.CommentsActive just before each render, so templates read it and the engine
 * bakes the correct per-instance view hash into every inline handler), iteration is done with {~TS:~},
 * and all interaction is inline onclick / onpaste / ondrop handlers that survive re-renders.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libPictView = require('pict-view');
const libContent = require('pict-section-content');
const libModal = require('pict-section-modal');
const libMarkdownEditor = require('pict-section-markdowneditor');

const libCommentProvider = require('../providers/CommentProvider-Base.js');
const libContentAdapter = require('../content/ContentAdapter.js');

const _InMemoryCommentProvider = libCommentProvider.InMemoryCommentProvider;
const THREAD_STATUS = libCommentProvider.THREAD_STATUS;

const _DefaultConfiguration =
{
	ViewIdentifier: 'Comments',
	DefaultRenderable: 'Comments-Section',
	DefaultDestinationAddress: '#Comments-Container',
	AutoRender: false,

	// ---- Comments options (a host overrides these) ----
	// The Context this instance is bound to. Required for anything to load or save.
	Context: { OwnerType: '', IDOwner: '' },
	// The data provider. Null means "make an in-memory one backed by AppData".
	DataProvider: null,
	// One level of replies when true; a single flat comment list when false.
	Threaded: true,
	// text | multiline | markdown | rich  (rich currently behaves as markdown; see README)
	EditorMode: 'markdown',
	// Render-only: no composer, no actions.
	ReadOnly: false,
	// Comment order within a thread: 'oldest' or 'newest'.
	SortOrder: 'oldest',
	// Resolved / completed threads start collapsed.
	CollapseCompleted: true,
	// Permission gates the host can flip.
	AllowNewThread: true,
	AllowResolve: true,
	AllowEdit: true,
	AllowDelete: true,
	AllowReply: true,
	// The signed-in user, used as the author of new comments and threads.
	CurrentUser: { Key: '', Name: 'Anonymous', Avatar: '' },
	// Optional uploader for image / file drag-in: function (pFile, fCallback(pError, pURL)).
	ImageUpload: null,
	// CodeMirror 6 modules ({ EditorView, EditorState, extensions }) for the 'rich' EditorMode's full
	// markdown editor. The host provides these (the editor needs them); without them, 'rich' falls back
	// to the 'markdown' composer. Also read from window.CodeMirrorModules if not passed here.
	CodeMirrorModules: null,
	// Header label.
	Title: 'Comments',
	// Empty-state copy.
	EmptyText: 'No comments yet.',

	// Event callbacks (all optional): onThreadCreated, onThreadResolved, onCommentAdded,
	// onCommentEdited, onCommentDeleted, onAnchorActivate, onChange.

	CSSPriority: 500,
	CSS: /*css*/`
.psc { font-family: var(--theme-typography-family-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif); font-size: 14px; color: var(--theme-color-text-primary, #1f2430); }
.psc-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 2px 10px; }
.psc-title { font-weight: 600; font-size: 15px; }
.psc-count { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; border-radius: 9px; background: var(--theme-color-background-tertiary, #eef2f6); color: var(--theme-color-text-secondary, #5b6470); font-size: 12px; font-weight: 600; text-align: center; }
.psc-header-actions { display: flex; align-items: center; gap: 6px; }
.psc-btn { font: inherit; font-size: 13px; border: 1px solid var(--theme-color-border-default, #d6dde3); background: var(--theme-color-background-panel, #fff); color: var(--theme-color-text-primary, #1f2430); border-radius: 6px; padding: 5px 10px; cursor: pointer; line-height: 1; }
.psc-btn:hover { border-color: var(--theme-color-border-strong, #9cb4c8); }
.psc-btn-ghost { border-color: transparent; background: transparent; color: var(--theme-color-text-secondary, #5b6470); padding: 5px 8px; }
.psc-btn-ghost:hover { background: var(--theme-color-background-tertiary, #eef2f6); }
.psc-btn-primary { background: var(--theme-color-brand-primary, #2880a6); border-color: var(--theme-color-brand-primary, #2880a6); color: #fff; }
.psc-btn-primary:hover { filter: brightness(0.95); }
.psc-btn-danger:hover { color: var(--theme-color-status-error, #c0392b); border-color: var(--theme-color-status-error, #c0392b); }
.psc-link { background: none; border: none; padding: 0; font: inherit; font-size: 12px; color: var(--theme-color-text-secondary, #5b6470); cursor: pointer; }
.psc-link:hover { color: var(--theme-color-brand-primary, #2880a6); text-decoration: underline; }

.psc-thread { border: 1px solid var(--theme-color-border-light, #e7ecf0); border-radius: 8px; margin-bottom: 10px; background: var(--theme-color-background-panel, #fff); overflow: hidden; }
.psc-thread-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; user-select: none; background: var(--theme-color-background-secondary, #f7f9fb); }
.psc-thread-head:hover { background: var(--theme-color-background-tertiary, #eef2f6); }
.psc-caret { width: 12px; color: var(--theme-color-text-muted, #97a1ab); transition: transform 0.12s ease; }
.psc-thread.psc-collapsed .psc-caret { transform: rotate(-90deg); }
.psc-thread-title { font-weight: 600; }
.psc-thread-meta { color: var(--theme-color-text-muted, #97a1ab); font-size: 12px; }
.psc-spacer { flex: 1; }
.psc-status-pill { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 9px; background: var(--theme-color-background-tertiary, #eef2f6); color: var(--theme-color-text-secondary, #5b6470); }
.psc-thread.psc-status-resolved .psc-status-pill, .psc-thread.psc-status-completed .psc-status-pill { background: #e3f4ea; color: #2e7d4f; }
.psc-thread.psc-status-resolved .psc-thread-head, .psc-thread.psc-status-completed .psc-thread-head { background: #f4faf6; }
.psc-anchor-badge { font-size: 11px; padding: 2px 7px; border-radius: 9px; background: #eaf2fb; color: #2667a6; cursor: pointer; }
.psc-anchor-badge:hover { background: #dcebfa; }
.psc-thread-body { padding: 6px 10px 10px; }
.psc-thread.psc-collapsed .psc-thread-body { display: none; }

.psc-comment { display: flex; gap: 10px; padding: 8px 2px; }
.psc-comment + .psc-comment { border-top: 1px solid var(--theme-color-border-light, #f0f3f6); }
.psc-replies { margin-left: 42px; }
.psc-replies .psc-comment { padding: 6px 2px; }
.psc-avatar { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 50%; background: var(--theme-color-brand-primary, #2880a6); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; background-size: cover; background-position: center; }
.psc-comment-main { flex: 1; min-width: 0; }
.psc-comment-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
.psc-author { font-weight: 600; font-size: 13px; }
.psc-time { color: var(--theme-color-text-muted, #97a1ab); font-size: 12px; }
.psc-edited { color: var(--theme-color-text-muted, #97a1ab); font-size: 11px; font-style: italic; }
.psc-body-text { white-space: normal; line-height: 1.5; }
.psc-body-rich { line-height: 1.5; }
.psc-body-rich p:first-child { margin-top: 0; }
.psc-body-rich p:last-child { margin-bottom: 0; }
.psc-body-rich img { max-width: 100%; height: auto; border-radius: 4px; }
.psc-body-json { background: var(--theme-color-background-tertiary, #f4f6f8); border-radius: 6px; padding: 8px 10px; overflow: auto; font-size: 12px; }
.psc-comment-actions { display: flex; gap: 12px; margin-top: 4px; }

.psc-composer { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.psc-input { font: inherit; width: 100%; box-sizing: border-box; resize: vertical; min-height: 38px; padding: 8px 10px; border: 1px solid var(--theme-color-border-default, #d6dde3); border-radius: 6px; background: var(--theme-color-background-panel, #fff); color: inherit; }
.psc-input:focus { outline: none; border-color: var(--theme-color-brand-primary, #2880a6); }
.psc-input.psc-mono { font-family: var(--theme-typography-family-mono, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, monospace); font-size: 13px; }
.psc-input.psc-dragover { border-color: var(--theme-color-brand-primary, #2880a6); border-style: dashed; }
.psc-composer-actions { display: flex; align-items: center; gap: 8px; }
.psc-composer-hint { flex: 1; color: var(--theme-color-text-muted, #97a1ab); font-size: 11px; }

.psc-empty { padding: 18px; text-align: center; color: var(--theme-color-text-muted, #97a1ab); border: 1px dashed var(--theme-color-border-light, #e7ecf0); border-radius: 8px; }
.psc-readonly .psc-thread-head { cursor: pointer; }

/* Rich mode: the inline composer becomes a button that opens the full editor in a modal. */
.psc-add-comment { margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; }
.psc-mde-modal { min-width: 520px; max-width: 78vw; }
.psc-mde-modal .pict-mde-add-segment { display: none; }
.psc-mde-modal .pict-mde { border: 1px solid var(--theme-color-border-default, #d6dde3); border-radius: 6px; padding: 4px; min-height: 160px; }
@media (max-width: 600px) { .psc-mde-modal { min-width: 0; max-width: 100%; } }
`,

	Templates:
	[
		{
			Hash: 'Comments-Section',
			Template: /*html*/`
<div class="psc {~D:AppData.CommentsActive.RootClass~}" id="psc-{~D:AppData.CommentsActive.ViewHash~}">
	<div class="psc-header">
		<div class="psc-title">{~D:AppData.CommentsActive.Title~}<span class="psc-count">{~D:AppData.CommentsActive.ThreadCount~}</span></div>
		<div class="psc-header-actions">
			<button class="psc-btn psc-btn-ghost" title="Toggle sort order" onclick="_Pict.views['{~D:AppData.CommentsActive.ViewHash~}'].toggleSort()">{~D:AppData.CommentsActive.SortLabel~}</button>
			{~TS:Comments-NewButton:AppData.CommentsActive.NewButtonSlot~}
		</div>
	</div>
	<div class="psc-threads">
		{~TS:Comments-Thread:AppData.CommentsActive.Threads~}
	</div>
	{~TS:Comments-Empty:AppData.CommentsActive.EmptySlot~}
</div>`
		},
		{
			Hash: 'Comments-NewButton',
			Template: /*html*/`<button class="psc-btn" onclick="_Pict.views['{~D:AppData.CommentsActive.ViewHash~}'].newDiscussion()">New discussion</button>`
		},
		{
			Hash: 'Comments-Empty',
			Template: /*html*/`<div class="psc-empty">{~D:AppData.CommentsActive.EmptyText~}</div>`
		},
		{
			Hash: 'Comments-Thread',
			Template: /*html*/`
<div class="psc-thread psc-status-{~D:Record.StatusLower~} {~D:Record.CollapseClass~}" id="psc-thread-{~D:Record.ViewHash~}-{~D:Record.Key~}">
	<div class="psc-thread-head" onclick="_Pict.views['{~D:Record.ViewHash~}'].toggleCollapse('{~D:Record.Key~}')">
		<span class="psc-caret">&#9660;</span>
		{~TS:Comments-AnchorBadge:Record.AnchorSlot~}
		<span class="psc-thread-title">{~D:Record.TitleDisplay~}</span>
		<span class="psc-thread-meta">{~D:Record.CommentCount~}</span>
		<span class="psc-spacer"></span>
		<span class="psc-status-pill">{~D:Record.StatusLabel~}</span>
		{~TS:Comments-ThreadActions:Record.ActionSlot~}
	</div>
	<div class="psc-thread-body">
		<div class="psc-comments">
			{~TS:Comments-Comment:Record.Comments~}
		</div>
		{~TS:Comments-Composer:Record.ComposerSlot~}
		{~TS:Comments-AddButton:Record.AddButtonSlot~}
	</div>
</div>`
		},
		{
			Hash: 'Comments-AnchorBadge',
			Template: /*html*/`<span class="psc-anchor-badge" title="Go to location" onclick="event.stopPropagation(); _Pict.views['{~D:Record.ViewHash~}'].activateAnchor('{~D:Record.Key~}')">{~D:Record.AnchorLabel~}</span>`
		},
		{
			Hash: 'Comments-ThreadActions',
			Template: /*html*/`<button class="psc-link" onclick="event.stopPropagation(); _Pict.views['{~D:Record.ViewHash~}'].{~D:Record.ResolveCall~}">{~D:Record.ResolveLabel~}</button>{~TS:Comments-ThreadDelete:Record.DeleteSlot~}`
		},
		{
			Hash: 'Comments-ThreadDelete',
			Template: /*html*/`<button class="psc-link psc-btn-danger" onclick="event.stopPropagation(); _Pict.views['{~D:Record.ViewHash~}'].confirmDeleteThread('{~D:Record.Key~}')">Delete</button>`
		},
		{
			Hash: 'Comments-Comment',
			Template: /*html*/`
<div class="psc-comment" id="psc-comment-{~D:Record.ViewHash~}-{~D:Record.Key~}">
	<div class="psc-avatar" style="{~D:Record.AvatarStyle~}">{~D:Record.Initials~}</div>
	<div class="psc-comment-main">
		<div class="psc-comment-head"><span class="psc-author">{~D:Record.AuthorName~}</span><span class="psc-time">{~D:Record.TimeLabel~}</span>{~TS:Comments-Edited:Record.EditedSlot~}</div>
		{~TS:Comments-Body:Record.ViewSlot~}
		{~TS:Comments-Edit:Record.EditSlot~}
		<div class="psc-comment-actions">{~TS:Comments-CommentAction:Record.ActionSlot~}</div>
		{~TS:Comments-Replies:Record.ReplyWrapSlot~}
		{~TS:Comments-Composer:Record.ReplyComposerSlot~}
	</div>
</div>`
		},
		{
			Hash: 'Comments-Replies',
			Template: /*html*/`<div class="psc-replies">{~TS:Comments-Comment:Record.Replies~}</div>`
		},
		{
			Hash: 'Comments-Edited',
			Template: /*html*/`<span class="psc-edited">edited</span>`
		},
		{
			Hash: 'Comments-Body',
			Template: /*html*/`<div class="psc-comment-body">{~D:Record.BodyHTML~}</div>`
		},
		{
			Hash: 'Comments-Edit',
			Template: /*html*/`
<div class="psc-composer">
	<textarea class="psc-input {~D:Record.InputClass~}" id="{~D:Record.EditInputId~}" rows="3">{~D:Record.BodyRaw~}</textarea>
	<div class="psc-composer-actions">
		<span class="psc-composer-hint">{~D:Record.Hint~}</span>
		<button class="psc-btn psc-btn-ghost" onclick="_Pict.views['{~D:Record.ViewHash~}'].cancelEdit()">Cancel</button>
		<button class="psc-btn psc-btn-primary" onclick="_Pict.views['{~D:Record.ViewHash~}'].submitEdit('{~D:Record.Key~}')">Save</button>
	</div>
</div>`
		},
		{
			Hash: 'Comments-CommentAction',
			Template: /*html*/`<button class="psc-link" onclick="_Pict.views['{~D:Record.ViewHash~}'].{~D:Record.Call~}">{~D:Record.Label~}</button>`
		},
		{
			Hash: 'Comments-Composer',
			Template: /*html*/`
<div class="psc-composer">
	<textarea class="psc-input {~D:Record.InputClass~}" id="{~D:Record.InputId~}" rows="2" placeholder="{~D:Record.Placeholder~}"
		onpaste="_Pict.views['{~D:Record.ViewHash~}'].onComposerPaste(event,'{~D:Record.InputId~}')"
		ondragover="event.preventDefault(); this.classList.add('psc-dragover');"
		ondragleave="this.classList.remove('psc-dragover');"
		ondrop="_Pict.views['{~D:Record.ViewHash~}'].onComposerDrop(event,'{~D:Record.InputId~}')"></textarea>
	<div class="psc-composer-actions">
		<span class="psc-composer-hint">{~D:Record.Hint~}</span>
		{~TS:Comments-ComposerCancel:Record.CancelSlot~}
		<button class="psc-btn psc-btn-primary" onclick="_Pict.views['{~D:Record.ViewHash~}'].{~D:Record.SubmitCall~}">{~D:Record.SubmitLabel~}</button>
	</div>
</div>`
		},
		{
			Hash: 'Comments-ComposerCancel',
			Template: /*html*/`<button class="psc-btn psc-btn-ghost" onclick="_Pict.views['{~D:Record.ViewHash~}'].{~D:Record.CancelCall~}">Cancel</button>`
		},
		{
			Hash: 'Comments-AddButton',
			Template: /*html*/`<button class="psc-btn psc-btn-ghost psc-add-comment" onclick="_Pict.views['{~D:Record.ViewHash~}'].openRichComposer('comment','{~D:Record.ThreadKey~}')">+ Add a comment</button>`
		}
	],

	Renderables:
	[
		{
			RenderableHash: 'Comments-Section',
			TemplateHash: 'Comments-Section',
			ContentDestinationAddress: '#Comments-Container',
			RenderMethod: 'replace'
		}
	]
};

class PictViewComments extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, _DefaultConfiguration, pOptions || {});
		super(pFable, tmpOptions, pServiceHash);

		this._provider = null;
		this._context = libCommentProvider.normalizeContext(this.options.Context);
		this._loaded = { Threads: [], CommentsByThreadKey: {} };
		// Transient UI state (not persisted): collapse overrides, the open editor / reply target, sort.
		this._ui =
		{
			Sort: (this.options.SortOrder === 'newest') ? 'newest' : 'oldest',
			CollapsedThreads: {},
			EditingKey: null,
			ReplyTarget: null,
			FocusInputId: null
		};
		this._state = null;
	}

	onBeforeInitialize()
	{
		this._initProvider();
		this._ensureSupportViews();
		this._initState();
		return super.onBeforeInitialize();
	}

	_initProvider()
	{
		if (this.options.DataProvider)
		{
			this._provider = this.options.DataProvider;
			return;
		}
		// Default: in-memory, backed by a slice of AppData keyed by this instance so multiple sections
		// on a page keep separate stores and the data stays observable / serializable.
		if (!this.pict.AppData.CommentsStores) { this.pict.AppData.CommentsStores = {}; }
		if (!this.pict.AppData.CommentsStores[this.Hash]) { this.pict.AppData.CommentsStores[this.Hash] = {}; }
		this._provider = new _InMemoryCommentProvider({ Store: this.pict.AppData.CommentsStores[this.Hash] });
	}

	// Register the content provider (markdown rendering) and the modal (confirms) once per app.
	_ensureSupportViews()
	{
		if (!this.pict.providers['Pict-Content'])
		{
			this.pict.addProvider('Pict-Content', libContent.PictContentProvider.default_configuration, libContent.PictContentProvider);
		}
		this._contentProvider = this.pict.providers['Pict-Content'];
		if (!this.pict.views['Pict-Section-Modal'])
		{
			this.pict.addView('Pict-Section-Modal', libModal.default_configuration, libModal);
		}
	}

	_initState()
	{
		// Shape an empty state so a render before data arrives is harmless.
		this._loaded = { Threads: [], CommentsByThreadKey: {} };
		this._shape();
	}

	// ---- Public API ----

	/** (Re)load this context from the provider and render. */
	load() { return this._reload(); }
	refresh() { return this._reload(); }

	/** Point the section at a different context and reload. */
	setContext(pContext)
	{
		this._context = libCommentProvider.normalizeContext(pContext);
		this.options.Context = this._context;
		return this._reload();
	}

	setReadOnly(pReadOnly) { this.options.ReadOnly = !!pReadOnly; this._shape(); this.render(); }
	setSortOrder(pOrder) { this._ui.Sort = (pOrder === 'newest') ? 'newest' : 'oldest'; this._shape(); this.render(); }
	setDataProvider(pProvider) { this._provider = pProvider; return this._reload(); }

	/** Host API: start a thread (for example an anchored note the host creates from a selection). */
	startThread(pSpec)
	{
		let tmpSpec = pSpec || {};
		return this._provider.createThread(Object.assign({ Context: this._context, Author: this._author() }, tmpSpec))
			.then((pThread) => { this._fire('onThreadCreated', pThread); return this._reload().then(() => pThread); });
	}

	// ---- Lifecycle ----

	onAfterInitializeAsync(fCallback)
	{
		this._reload().then(() => fCallback()).catch(() => fCallback());
	}

	onBeforeRender(pRenderable)
	{
		// Publish this instance's shaped state so templates (and the baked-in inline handlers) read it.
		this.pict.AppData.CommentsActive = this._state;
		return super.onBeforeRender(pRenderable);
	}

	onAfterRender(pRenderable, pAddress, pRecord, pContent)
	{
		if (this.pict.CSSMap) { this.pict.CSSMap.injectCSS(); }
		// Focus a freshly opened input (composer / reply / edit) once, if asked.
		if (this._ui.FocusInputId)
		{
			let tmpInput = (typeof document !== 'undefined') ? document.getElementById(this._ui.FocusInputId) : null;
			if (tmpInput) { try { tmpInput.focus(); } catch (pError) { /* non-DOM host */ } }
			this._ui.FocusInputId = null;
		}
		return super.onAfterRender(pRenderable, pAddress, pRecord, pContent);
	}

	// ---- Data flow ----

	_reload()
	{
		if (!this._provider || !this._context.OwnerType || !this._context.IDOwner)
		{
			this._loaded = { Threads: [], CommentsByThreadKey: {} };
			this._shape();
			this.render();
			return Promise.resolve();
		}
		return this._provider.loadContext(this._context).then((pLoaded) =>
		{
			this._loaded = pLoaded || { Threads: [], CommentsByThreadKey: {} };
			this._shape();
			this.render();
		}).catch((pError) =>
		{
			if (this.log) { this.log.error('pict-section-comments load failed: ' + (pError && pError.message), pError); }
		});
	}

	_author()
	{
		let tmpUser = this.options.CurrentUser || {};
		return { Key: tmpUser.Key || '', Name: tmpUser.Name || 'Anonymous', Avatar: tmpUser.Avatar || '' };
	}

	_fire(pName, pPayload)
	{
		if (typeof this.options[pName] === 'function')
		{
			try { this.options[pName](pPayload); } catch (pError) { if (this.log) { this.log.warn('pict-section-comments ' + pName + ' handler threw', pError); } }
		}
		if (pName !== 'onChange' && typeof this.options.onChange === 'function')
		{
			try { this.options.onChange({ Event: pName, Payload: pPayload }); } catch (pError) { /* swallow */ }
		}
	}

	// ---- Shaping: turn loaded data + UI state into the render model on this._state ----

	_isClosed(pStatus) { return (pStatus === THREAD_STATUS.Resolved || pStatus === THREAD_STATUS.Completed); }

	_threadCollapsed(pThread)
	{
		if (Object.prototype.hasOwnProperty.call(this._ui.CollapsedThreads, pThread.Key))
		{
			return !!this._ui.CollapsedThreads[pThread.Key];
		}
		return !!(this.options.CollapseCompleted && this._isClosed(pThread.Status));
	}

	_shape()
	{
		let tmpReadOnly = !!this.options.ReadOnly;
		let tmpThreads = (this._loaded.Threads || []).map((pThread) => this._shapeThread(pThread, tmpReadOnly));

		this._state =
		{
			ViewHash: this.Hash,
			Title: this.options.Title,
			EmptyText: this.options.EmptyText,
			ThreadCount: tmpThreads.length,
			SortLabel: (this._ui.Sort === 'newest') ? 'Newest first' : 'Oldest first',
			RootClass: tmpReadOnly ? 'psc-readonly' : '',
			Threads: tmpThreads,
			EmptySlot: (tmpThreads.length === 0) ? [{ EmptyText: this.options.EmptyText }] : [],
			NewButtonSlot: (!tmpReadOnly && this.options.AllowNewThread) ? [{ ViewHash: this.Hash }] : []
		};
	}

	_shapeThread(pThread, pReadOnly)
	{
		let tmpComments = this._loaded.CommentsByThreadKey[pThread.Key] || [];
		let tmpShapedComments = this._shapeCommentTree(pThread, tmpComments, pReadOnly);
		let tmpCollapsed = this._threadCollapsed(pThread);
		let tmpClosed = this._isClosed(pThread.Status);
		let tmpAnchorLabel = this._anchorLabel(pThread.Anchor);

		return (
		{
			ViewHash: this.Hash,
			Key: pThread.Key,
			StatusLabel: pThread.Status,
			StatusLower: String(pThread.Status || 'Open').toLowerCase(),
			CollapseClass: tmpCollapsed ? 'psc-collapsed' : '',
			TitleDisplay: libContentAdapter.escapeHtml(pThread.Title || (pThread.Anchor ? 'Note' : 'Discussion')),
			CommentCount: this._countComments(tmpComments) + (this._countComments(tmpComments) === 1 ? ' comment' : ' comments'),
			AnchorSlot: tmpAnchorLabel ? [{ ViewHash: this.Hash, Key: pThread.Key, AnchorLabel: libContentAdapter.escapeHtml(tmpAnchorLabel) }] : [],
			ActionSlot: pReadOnly ? [] : [this._threadActionRecord(pThread, tmpClosed)],
			Comments: tmpShapedComments,
			// Non-rich: an inline textarea composer. Rich: a button that opens the full editor in a modal.
			ComposerSlot: (pReadOnly || this._effectiveMode() === 'rich') ? [] : [this._composerRecord('thread', pThread.Key, null, 'Add a comment...', "submitComment('" + pThread.Key + "')", 'Comment', null)],
			AddButtonSlot: (!pReadOnly && this._effectiveMode() === 'rich') ? [{ ViewHash: this.Hash, ThreadKey: pThread.Key }] : []
		});
	}

	_threadActionRecord(pThread, pClosed)
	{
		let tmpResolveLabel = pClosed ? 'Reopen' : 'Resolve';
		let tmpResolveCall = (pClosed ? "reopenThread('" : "resolveThread('") + pThread.Key + "')";
		return (
		{
			ViewHash: this.Hash,
			Key: pThread.Key,
			ResolveLabel: this.options.AllowResolve ? tmpResolveLabel : '',
			ResolveCall: tmpResolveCall,
			DeleteSlot: this.options.AllowDelete ? [{ ViewHash: this.Hash, Key: pThread.Key }] : []
		});
	}

	_shapeCommentTree(pThread, pComments, pReadOnly)
	{
		let tmpOrdered = this._orderComments(pComments);
		if (!this.options.Threaded)
		{
			return tmpOrdered.map((pComment) => this._shapeComment(pThread, pComment, pReadOnly, false));
		}
		// One level of replies: top-level comments carry their direct replies.
		let tmpByParent = {};
		for (let i = 0; i < pComments.length; i++)
		{
			let tmpParent = pComments[i].ParentKey;
			if (tmpParent) { (tmpByParent[tmpParent] = tmpByParent[tmpParent] || []).push(pComments[i]); }
		}
		let tmpTop = tmpOrdered.filter((pComment) => !pComment.ParentKey);
		return tmpTop.map((pComment) =>
		{
			let tmpShaped = this._shapeComment(pThread, pComment, pReadOnly, true);
			let tmpReplies = this._orderRepliesAscending(tmpByParent[pComment.Key] || []);
			tmpShaped.ReplyWrapSlot = tmpReplies.length ? [{ Replies: tmpReplies.map((pReply) => this._shapeComment(pThread, pReply, pReadOnly, false)) }] : [];
			return tmpShaped;
		});
	}

	_orderComments(pComments)
	{
		let tmpSorted = (pComments || []).slice().sort((pA, pB) => pA.CreatedAt - pB.CreatedAt);
		return (this._ui.Sort === 'newest') ? tmpSorted.reverse() : tmpSorted;
	}

	_orderRepliesAscending(pReplies) { return (pReplies || []).slice().sort((pA, pB) => pA.CreatedAt - pB.CreatedAt); }

	_countComments(pComments) { return (pComments || []).filter((pComment) => !pComment.Deleted).length; }

	_shapeComment(pThread, pComment, pReadOnly, pAllowReply)
	{
		let tmpEditing = (this._ui.EditingKey === pComment.Key);
		let tmpReplying = !!(this._ui.ReplyTarget && this._ui.ReplyTarget.ParentKey === pComment.Key);
		let tmpAuthorName = (pComment.Author && pComment.Author.Name) ? pComment.Author.Name : 'Anonymous';
		let tmpAvatar = (pComment.Author && pComment.Author.Avatar) ? pComment.Author.Avatar : '';
		let tmpBodyHTML = libContentAdapter.renderToHtml(pComment.Body, pComment.ContentType, { parseMarkdown: (pMD) => this._parseMarkdown(pMD) });

		let tmpActions = [];
		if (!pReadOnly && pAllowReply && this.options.AllowReply && this.options.Threaded)
		{
			tmpActions.push({ ViewHash: this.Hash, Call: "openReply('" + pThread.Key + "','" + pComment.Key + "')", Label: 'Reply' });
		}
		if (!pReadOnly && this.options.AllowEdit && this._isAuthor(pComment))
		{
			tmpActions.push({ ViewHash: this.Hash, Call: "openEdit('" + pComment.Key + "')", Label: 'Edit' });
		}
		if (!pReadOnly && this.options.AllowDelete && this._isAuthor(pComment))
		{
			tmpActions.push({ ViewHash: this.Hash, Call: "confirmDeleteComment('" + pComment.Key + "')", Label: 'Delete' });
		}

		return (
		{
			ViewHash: this.Hash,
			Key: pComment.Key,
			AuthorName: libContentAdapter.escapeHtml(tmpAuthorName),
			Initials: this._initials(tmpAuthorName),
			AvatarStyle: tmpAvatar ? ("background-image:url('" + encodeURI(tmpAvatar) + "')") : '',
			TimeLabel: this._timeAgo(pComment.CreatedAt),
			EditedSlot: pComment.EditedAt ? [{}] : [],
			BodyHTML: tmpBodyHTML,
			BodyRaw: libContentAdapter.escapeHtml(pComment.Body),
			ViewSlot: tmpEditing ? [] : [{ BodyHTML: tmpBodyHTML }],
			EditSlot: tmpEditing ? [this._editRecord(pComment)] : [],
			ActionSlot: tmpEditing ? [] : tmpActions,
			ReplyWrapSlot: [],
			ReplyComposerSlot: tmpReplying ? [this._composerRecord('reply', pThread.Key, pComment.Key, 'Write a reply...', "submitReply('" + pThread.Key + "','" + pComment.Key + "')", 'Reply', 'cancelReply()')] : []
		});
	}

	_editRecord(pComment)
	{
		return (
		{
			ViewHash: this.Hash,
			Key: pComment.Key,
			EditInputId: 'psc-edit-' + this.Hash + '-' + pComment.Key,
			BodyRaw: libContentAdapter.escapeHtml(pComment.Body),
			InputClass: this._composerInputClass(),
			Hint: this._composerHint()
		});
	}

	_composerRecord(pKind, pThreadKey, pParentKey, pPlaceholder, pSubmitCall, pSubmitLabel, pCancelCall)
	{
		let tmpInputId = 'psc-input-' + this.Hash + '-' + pKind + '-' + (pParentKey || pThreadKey);
		return (
		{
			ViewHash: this.Hash,
			InputId: tmpInputId,
			Placeholder: pPlaceholder,
			SubmitCall: pSubmitCall,
			SubmitLabel: pSubmitLabel,
			InputClass: this._composerInputClass(),
			Hint: this._composerHint(),
			CancelSlot: pCancelCall ? [{ ViewHash: this.Hash, CancelCall: pCancelCall }] : []
		});
	}

	_composerInputClass() { return libContentAdapter.modeRendersMarkdown(this.options.EditorMode) ? 'psc-mono' : ''; }

	_composerHint()
	{
		if (!libContentAdapter.modeRendersMarkdown(this.options.EditorMode)) { return ''; }
		return this.options.ImageUpload ? 'Markdown supported. Drag or paste an image to upload.' : 'Markdown supported.';
	}

	// CodeMirror modules for the 'rich' full editor, from config or the window global.
	_codeMirror()
	{
		if (this.options.CodeMirrorModules) { return this.options.CodeMirrorModules; }
		if (typeof window !== 'undefined' && window.CodeMirrorModules) { return window.CodeMirrorModules; }
		return null;
	}

	// 'rich' needs CodeMirror; without it, fall back to the markdown composer so nothing breaks.
	_effectiveMode()
	{
		if (this.options.EditorMode === 'rich') { return this._codeMirror() ? 'rich' : 'markdown'; }
		return this.options.EditorMode || 'text';
	}

	// ---- Markdown rendering (via pict-section-content) ----

	_parseMarkdown(pMarkdown)
	{
		if (this._contentProvider && typeof this._contentProvider.parseMarkdown === 'function')
		{
			try { return this._contentProvider.parseMarkdown(String(pMarkdown == null ? '' : pMarkdown)); }
			catch (pError) { return libContentAdapter.escapeHtml(pMarkdown); }
		}
		return libContentAdapter.escapeHtml(pMarkdown);
	}

	// ---- Interaction handlers (called from inline template handlers) ----

	toggleSort() { this._ui.Sort = (this._ui.Sort === 'oldest') ? 'newest' : 'oldest'; this._shape(); this.render(); }

	toggleCollapse(pThreadKey)
	{
		let tmpThread = (this._loaded.Threads || []).find((pT) => pT.Key === pThreadKey);
		let tmpCurrent = tmpThread ? this._threadCollapsed(tmpThread) : false;
		this._ui.CollapsedThreads[pThreadKey] = !tmpCurrent;
		this._shape();
		this.render();
	}

	newDiscussion()
	{
		return this._provider.createThread({ Context: this._context, Kind: 'Discussion', Status: THREAD_STATUS.Open, Author: this._author() })
			.then((pThread) =>
			{
				this._fire('onThreadCreated', pThread);
				this._ui.CollapsedThreads[pThread.Key] = false;
				this._ui.FocusInputId = 'psc-input-' + this.Hash + '-thread-' + pThread.Key;
				return this._reload();
			});
	}

	submitComment(pThreadKey)
	{
		let tmpBody = this._inputValue('psc-input-' + this.Hash + '-thread-' + pThreadKey);
		if (!tmpBody) { return Promise.resolve(); }
		return this._provider.createComment(this._newCommentDraft(pThreadKey, null, tmpBody))
			.then((pComment) => { this._fire('onCommentAdded', pComment); return this._reload(); });
	}

	openReply(pThreadKey, pParentKey)
	{
		if (this._effectiveMode() === 'rich') { return this.openRichComposer('reply', pThreadKey, pParentKey); }
		this._ui.ReplyTarget = { ThreadKey: pThreadKey, ParentKey: pParentKey };
		this._ui.FocusInputId = 'psc-input-' + this.Hash + '-reply-' + pParentKey;
		this._shape();
		this.render();
	}

	cancelReply() { this._ui.ReplyTarget = null; this._shape(); this.render(); }

	submitReply(pThreadKey, pParentKey)
	{
		let tmpBody = this._inputValue('psc-input-' + this.Hash + '-reply-' + pParentKey);
		if (!tmpBody) { return Promise.resolve(); }
		return this._provider.createComment(this._newCommentDraft(pThreadKey, pParentKey, tmpBody))
			.then((pComment) => { this._ui.ReplyTarget = null; this._fire('onCommentAdded', pComment); return this._reload(); });
	}

	openEdit(pCommentKey)
	{
		if (this._effectiveMode() === 'rich')
		{
			let tmpComment = this._findComment(pCommentKey);
			return this.openRichComposer('edit', tmpComment ? tmpComment.ThreadKey : null, null, pCommentKey);
		}
		this._ui.EditingKey = pCommentKey; this._ui.FocusInputId = 'psc-edit-' + this.Hash + '-' + pCommentKey; this._shape(); this.render();
	}
	cancelEdit() { this._ui.EditingKey = null; this._shape(); this.render(); }

	submitEdit(pCommentKey)
	{
		let tmpBody = this._inputValue('psc-edit-' + this.Hash + '-' + pCommentKey);
		if (!tmpBody) { return Promise.resolve(); }
		return this._provider.updateComment(pCommentKey, { Body: tmpBody })
			.then((pComment) => { this._ui.EditingKey = null; this._fire('onCommentEdited', pComment); return this._reload(); });
	}

	confirmDeleteComment(pCommentKey)
	{
		return this._confirm('Delete this comment? This cannot be undone.', { title: 'Delete comment', confirmLabel: 'Delete', dangerous: true })
			.then((pOk) =>
			{
				if (!pOk) { return; }
				return this._provider.deleteComment(pCommentKey).then(() => { this._fire('onCommentDeleted', { Key: pCommentKey }); return this._reload(); });
			});
	}

	resolveThread(pThreadKey)
	{
		return this._provider.resolveThread(pThreadKey).then((pThread) => { delete this._ui.CollapsedThreads[pThreadKey]; this._fire('onThreadResolved', pThread); return this._reload(); });
	}

	reopenThread(pThreadKey)
	{
		return this._provider.reopenThread(pThreadKey).then((pThread) => { this._ui.CollapsedThreads[pThreadKey] = false; this._fire('onThreadResolved', pThread); return this._reload(); });
	}

	confirmDeleteThread(pThreadKey)
	{
		return this._confirm('Delete this entire thread and its comments? This cannot be undone.', { title: 'Delete thread', confirmLabel: 'Delete', dangerous: true })
			.then((pOk) =>
			{
				if (!pOk) { return; }
				return this._provider.deleteThread(pThreadKey).then(() => { this._fire('onChange', { Event: 'onThreadDeleted', Payload: { Key: pThreadKey } }); return this._reload(); });
			});
	}

	activateAnchor(pThreadKey)
	{
		let tmpThread = (this._loaded.Threads || []).find((pT) => pT.Key === pThreadKey);
		if (tmpThread && tmpThread.Anchor) { this._fire('onAnchorActivate', tmpThread.Anchor); }
	}

	// ---- Rich mode: compose in the full pict-section-markdowneditor, hosted in a modal ----
	// The editor lives inside a pict-section-modal, outside this section's render cycle, so there is no
	// re-mount churn. One editor instance per comments view, reused across opens.

	openRichComposer(pKind, pThreadKey, pParentKey, pCommentKey)
	{
		let tmpModal = this.pict.views['Pict-Section-Modal'];
		if (!tmpModal || typeof tmpModal.show !== 'function') { return Promise.resolve(); }

		let tmpInitial = '';
		let tmpTitle = 'Add a comment';
		let tmpSaveLabel = 'Comment';
		if (pKind === 'reply') { tmpTitle = 'Reply'; tmpSaveLabel = 'Reply'; }
		if (pKind === 'edit')
		{
			tmpTitle = 'Edit comment';
			tmpSaveLabel = 'Save';
			let tmpComment = this._findComment(pCommentKey);
			tmpInitial = tmpComment ? (tmpComment.Body || '') : '';
		}

		let tmpHostId = 'psc-mde-host-' + this._richKey();
		let tmpSelf = this;

		return tmpModal.show(
		{
			title: tmpTitle,
			content: '<div class="psc-mde-modal" id="' + tmpHostId + '"></div>',
			buttons: [ { Hash: 'cancel', Label: 'Cancel' }, { Hash: 'save', Label: tmpSaveLabel, Style: 'primary' } ],
			onOpen: function () { tmpSelf._mountModalEditor(tmpHostId, tmpInitial); }
		}).then(function (pChoice)
		{
			if (pChoice !== 'save') { return; }
			let tmpBody = tmpSelf._readModalEditor();
			if (!tmpBody) { return; }
			if (pKind === 'edit')
			{
				return tmpSelf._provider.updateComment(pCommentKey, { Body: tmpBody, ContentType: 'rich' })
					.then(function (pComment) { tmpSelf._fire('onCommentEdited', pComment); return tmpSelf._reload(); });
			}
			return tmpSelf._provider.createComment(
			{
				ThreadKey: pThreadKey, ParentKey: (pKind === 'reply') ? pParentKey : null,
				Body: tmpBody, ContentType: 'rich', Author: tmpSelf._author()
			}).then(function (pComment) { tmpSelf._fire('onCommentAdded', pComment); return tmpSelf._reload(); });
		});
	}

	_richKey() { return this.Hash.replace(/[^a-zA-Z0-9]/g, ''); }

	_mountModalEditor(pHostId, pInitial)
	{
		let tmpDataKey = this._richKey();
		if (!this.pict.AppData.CommentsRichEditor) { this.pict.AppData.CommentsRichEditor = {}; }
		this.pict.AppData.CommentsRichEditor[tmpDataKey] = { Segments: [ { Content: pInitial || '' } ] };

		// A fresh editor per open. The markdown editor caches its CodeMirror instances, so reusing one
		// view across opens leaves the new modal host empty; tear the previous one down and build anew.
		this._destroyModalEditor();
		this._mdeCounter = (this._mdeCounter || 0) + 1;
		let tmpHash = 'PSC-MDE-' + this.Hash + '-' + this._mdeCounter;
		let tmpEditor = this.pict.addView(tmpHash, this._modalEditorConfiguration(pHostId, tmpDataKey), libMarkdownEditor);
		if (typeof tmpEditor.initialize === 'function' && !tmpEditor.initializeTimestamp) { tmpEditor.initialize(); }
		let tmpCM = this._codeMirror();
		if (tmpCM && typeof tmpEditor.connectCodeMirrorModules === 'function') { tmpEditor.connectCodeMirrorModules(tmpCM); }
		let tmpSelf = this;
		tmpEditor.onImageUpload = function (pFile, pSegmentIndex, fCallback)
		{
			if (typeof tmpSelf.options.ImageUpload === 'function') { tmpSelf.options.ImageUpload(pFile, function (pErr, pURL) { fCallback(pErr, pURL); }); return true; }
			return false;
		};
		this._modalEditor = tmpEditor;
		this._modalEditorHash = tmpHash;
		tmpEditor.render();
	}

	// Tear down the modal editor (its CodeMirror instances) and drop it from the view registry.
	_destroyModalEditor()
	{
		if (!this._modalEditor) { return; }
		try { if (typeof this._modalEditor.destroy === 'function') { this._modalEditor.destroy(); } } catch (pError) { /* ignore */ }
		if (this._modalEditorHash && this.pict.views && this.pict.views[this._modalEditorHash]) { delete this.pict.views[this._modalEditorHash]; }
		this._modalEditor = null;
		this._modalEditorHash = null;
	}

	_modalEditorConfiguration(pHostId, pDataKey)
	{
		return Object.assign({}, libMarkdownEditor.default_configuration,
		{
			ViewIdentifier: 'PSC-MDE-' + this.Hash,
			ContentDataAddress: 'AppData.CommentsRichEditor.' + pDataKey + '.Segments',
			DefaultDestinationAddress: '#' + pHostId,
			TargetElementAddress: '#' + pHostId,
			EnableRichPreview: true,
			DefaultPreviewMode: 'off',
			AutoRender: false,
			ButtonsTL: [],
			Renderables: [ { RenderableHash: 'MarkdownEditor-Wrap', TemplateHash: 'MarkdownEditor-Container', DestinationAddress: '#' + pHostId, ContentDestinationAddress: '#' + pHostId } ]
		});
	}

	_readModalEditor()
	{
		if (this._modalEditor && typeof this._modalEditor.marshalFromView === 'function') { try { this._modalEditor.marshalFromView(); } catch (pError) { /* ignore */ } }
		let tmpData = (this.pict.AppData.CommentsRichEditor || {})[this._richKey()];
		let tmpSegments = (tmpData && tmpData.Segments) ? tmpData.Segments : [];
		return tmpSegments.map(function (pSeg) { return pSeg.Content || ''; }).join('\n\n').trim();
	}

	_findComment(pCommentKey)
	{
		let tmpByThread = this._loaded.CommentsByThreadKey || {};
		let tmpKeys = Object.keys(tmpByThread);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpFound = (tmpByThread[tmpKeys[i]] || []).find(function (pC) { return pC.Key === pCommentKey; });
			if (tmpFound) { return tmpFound; }
		}
		return null;
	}

	// ---- Image / file drag-in for markdown composers ----

	onComposerPaste(pEvent, pInputId)
	{
		if (!this.options.ImageUpload || !libContentAdapter.modeRendersMarkdown(this.options.EditorMode)) { return; }
		let tmpItems = (pEvent.clipboardData && pEvent.clipboardData.items) ? pEvent.clipboardData.items : [];
		for (let i = 0; i < tmpItems.length; i++)
		{
			if (tmpItems[i].kind === 'file')
			{
				let tmpFile = tmpItems[i].getAsFile();
				if (tmpFile) { pEvent.preventDefault(); this._uploadAndInsert(tmpFile, pInputId); }
			}
		}
	}

	onComposerDrop(pEvent, pInputId)
	{
		let tmpTarget = pEvent.target;
		if (tmpTarget && tmpTarget.classList) { tmpTarget.classList.remove('psc-dragover'); }
		if (!this.options.ImageUpload || !libContentAdapter.modeRendersMarkdown(this.options.EditorMode)) { return; }
		let tmpFiles = (pEvent.dataTransfer && pEvent.dataTransfer.files) ? pEvent.dataTransfer.files : [];
		if (tmpFiles.length) { pEvent.preventDefault(); }
		for (let i = 0; i < tmpFiles.length; i++) { this._uploadAndInsert(tmpFiles[i], pInputId); }
	}

	_uploadAndInsert(pFile, pInputId)
	{
		let tmpIsImage = pFile.type && pFile.type.indexOf('image/') === 0;
		this.options.ImageUpload(pFile, (pError, pURL) =>
		{
			if (pError || !pURL) { if (this.log) { this.log.warn('pict-section-comments upload failed', pError); } return; }
			let tmpSnippet = (tmpIsImage ? '![' : '[') + (pFile.name || 'file') + '](' + pURL + ')';
			this._insertAtCursor(pInputId, tmpSnippet);
		});
	}

	_insertAtCursor(pInputId, pText)
	{
		let tmpInput = (typeof document !== 'undefined') ? document.getElementById(pInputId) : null;
		if (!tmpInput) { return; }
		let tmpStart = (typeof tmpInput.selectionStart === 'number') ? tmpInput.selectionStart : tmpInput.value.length;
		let tmpEnd = (typeof tmpInput.selectionEnd === 'number') ? tmpInput.selectionEnd : tmpInput.value.length;
		let tmpInsert = (tmpStart > 0 && tmpInput.value[tmpStart - 1] !== '\n' && tmpInput.value[tmpStart - 1] !== undefined) ? ('\n' + pText + '\n') : (pText + '\n');
		tmpInput.value = tmpInput.value.slice(0, tmpStart) + tmpInsert + tmpInput.value.slice(tmpEnd);
		let tmpCaret = tmpStart + tmpInsert.length;
		try { tmpInput.setSelectionRange(tmpCaret, tmpCaret); tmpInput.focus(); } catch (pError) { /* non-DOM */ }
	}

	// ---- small helpers ----

	_newCommentDraft(pThreadKey, pParentKey, pBody)
	{
		return (
		{
			ThreadKey: pThreadKey,
			ParentKey: pParentKey,
			Body: pBody,
			ContentType: libContentAdapter.defaultContentTypeForMode(this.options.EditorMode),
			Author: this._author()
		});
	}

	_isAuthor(pComment)
	{
		// With no signed-in user key, allow edit/delete (single-user / demo). With a key, restrict to own.
		let tmpUserKey = (this.options.CurrentUser && this.options.CurrentUser.Key) ? String(this.options.CurrentUser.Key) : '';
		if (!tmpUserKey) { return true; }
		let tmpAuthorKey = (pComment.Author && pComment.Author.Key != null) ? String(pComment.Author.Key) : '';
		return (tmpAuthorKey === tmpUserKey);
	}

	_inputValue(pInputId)
	{
		let tmpInput = (typeof document !== 'undefined') ? document.getElementById(pInputId) : null;
		return tmpInput ? String(tmpInput.value || '').trim() : '';
	}

	_confirm(pMessage, pOptions)
	{
		let tmpModal = this.pict.views['Pict-Section-Modal'];
		if (tmpModal && typeof tmpModal.confirm === 'function') { return tmpModal.confirm(pMessage, pOptions || {}); }
		// No modal available (headless / test): default to not-confirmed so nothing is destroyed silently.
		return Promise.resolve(false);
	}

	_initials(pName)
	{
		let tmpParts = String(pName || '').trim().split(/\s+/).filter(Boolean);
		if (!tmpParts.length) { return '?'; }
		if (tmpParts.length === 1) { return tmpParts[0].slice(0, 2).toUpperCase(); }
		return (tmpParts[0][0] + tmpParts[tmpParts.length - 1][0]).toUpperCase();
	}

	_anchorLabel(pAnchor)
	{
		if (!pAnchor) { return ''; }
		if (pAnchor.Label) { return String(pAnchor.Label); }
		if (pAnchor.Type === 'ByteRange') { return 'bytes ' + pAnchor.Start + '-' + pAnchor.End; }
		if (pAnchor.Type === 'Paragraph') { return 'paragraph'; }
		if (pAnchor.Type === 'Point') { return 'pin'; }
		return pAnchor.Type ? String(pAnchor.Type) : 'location';
	}

	_timeAgo(pTimestamp)
	{
		if (!pTimestamp) { return ''; }
		let tmpNow = Date.now();
		let tmpDelta = Math.max(0, tmpNow - pTimestamp);
		let tmpSec = Math.floor(tmpDelta / 1000);
		if (tmpSec < 45) { return 'just now'; }
		let tmpMin = Math.floor(tmpSec / 60);
		if (tmpMin < 60) { return tmpMin + 'm ago'; }
		let tmpHour = Math.floor(tmpMin / 60);
		if (tmpHour < 24) { return tmpHour + 'h ago'; }
		let tmpDay = Math.floor(tmpHour / 24);
		if (tmpDay < 7) { return tmpDay + 'd ago'; }
		try { return new Date(pTimestamp).toLocaleDateString(); } catch (pError) { return ''; }
	}
}

module.exports = PictViewComments;
module.exports.default_configuration = _DefaultConfiguration;
