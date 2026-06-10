'use strict';

/**
 * CommentProvider-Base
 * --------------------
 * The data seam for pict-section-comments. The section view never reads or writes storage
 * directly; it only ever calls a provider. That is what lets a wrapping app override all
 * reading and writing: hand the view an object implementing this interface and the section
 * talks to your backend instead of memory.
 *
 * Two things ship here:
 *
 *   CommentDataProvider   the abstract interface (and a few concrete convenience methods built
 *                         on the primitives, so every provider gets resolve/complete/reopen and
 *                         a batch context load for free).
 *
 *   InMemoryCommentProvider   the default. It keeps everything in a plain store object, so the
 *                             section is fully usable the moment it mounts, with no server. The
 *                             host can pass its own Store object (for example a slice of
 *                             pict.AppData) so the data stays observable and serializable.
 *
 * Record shapes (neutral, not tied to any backend's column names; a real backend's provider maps
 * these to and from its own rows):
 *
 *   Thread  { Key, OwnerType, IDOwner, Anchor|null, Kind, Title, Status, Sort, Author,
 *             CreatedAt, UpdatedAt }
 *   Comment { Key, ThreadKey, ParentKey|null, Author, Body, ContentType, CreatedAt, UpdatedAt,
 *             EditedAt|null, Deleted }
 *
 * A Context is { OwnerType, IDOwner } the broad subject (a Photo, a Media item, a Vision, a
 * file). A Thread optionally carries an Anchor, an opaque locator inside that context (a byte
 * range, a paragraph selector, a point). Anchor null means the official whole-context thread.
 *
 * Every method returns a Promise, so a memory provider and a network provider are
 * interchangeable to the view.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const _THREAD_STATUS = { Open: 'Open', Resolved: 'Resolved', Completed: 'Completed' };
const _THREAD_KIND = { Discussion: 'Discussion', Moderation: 'Moderation', Review: 'Review' };
const _CONTENT_TYPE = { Text: 'text', Markdown: 'markdown', Rich: 'rich', Json: 'json' };

/**
 * Normalize a context argument: accept either { OwnerType, IDOwner } or a thread-like object that
 * already carries those two fields. IDOwner is compared as a string so a numeric 278199 and the
 * string "278199" address the same context.
 */
function normalizeContext(pContext)
{
	let tmpContext = pContext || {};
	return (
	{
		OwnerType: tmpContext.OwnerType != null ? String(tmpContext.OwnerType) : '',
		IDOwner: tmpContext.IDOwner != null ? String(tmpContext.IDOwner) : ''
	});
}

class CommentDataProvider
{
	/**
	 * @param {object} pOptions
	 * @param {function():number} [pOptions.Now] - clock, returns a millisecond timestamp (default Date.now)
	 * @param {function():string}  [pOptions.KeyGenerator] - returns a fresh unique key (default built-in)
	 */
	constructor(pOptions)
	{
		this.options = pOptions || {};
		this._now = (typeof this.options.Now === 'function') ? this.options.Now : function () { return Date.now(); };
		let tmpCounter = 0;
		this._key = (typeof this.options.KeyGenerator === 'function') ? this.options.KeyGenerator : (() =>
		{
			tmpCounter++;
			return 'cmt_' + this._now().toString(36) + '_' + tmpCounter.toString(36) + '_' + Math.floor(Math.random() * 0x7fffffff).toString(36);
		});
	}

	// ---- Primitives (subclasses MUST implement these) ----

	/** @param {object} pContext { OwnerType, IDOwner } @returns {Promise<Array<object>>} */
	listThreads(pContext) { return Promise.reject(new Error('CommentDataProvider.listThreads not implemented')); }
	/** @param {object} pThreadDraft @returns {Promise<object>} the created thread */
	createThread(pThreadDraft) { return Promise.reject(new Error('CommentDataProvider.createThread not implemented')); }
	/** @param {string} pKey @param {object} pPatch @returns {Promise<object>} the updated thread */
	updateThread(pKey, pPatch) { return Promise.reject(new Error('CommentDataProvider.updateThread not implemented')); }
	/** @param {string} pKey @returns {Promise<void>} */
	deleteThread(pKey) { return Promise.reject(new Error('CommentDataProvider.deleteThread not implemented')); }

	/** @param {string} pThreadKey @returns {Promise<Array<object>>} */
	listComments(pThreadKey) { return Promise.reject(new Error('CommentDataProvider.listComments not implemented')); }
	/** @param {object} pCommentDraft @returns {Promise<object>} the created comment */
	createComment(pCommentDraft) { return Promise.reject(new Error('CommentDataProvider.createComment not implemented')); }
	/** @param {string} pKey @param {object} pPatch @returns {Promise<object>} the updated comment */
	updateComment(pKey, pPatch) { return Promise.reject(new Error('CommentDataProvider.updateComment not implemented')); }
	/** @param {string} pKey @returns {Promise<void>} */
	deleteComment(pKey) { return Promise.reject(new Error('CommentDataProvider.deleteComment not implemented')); }

	// ---- Convenience built on the primitives (every provider gets these for free) ----

	/**
	 * Load a whole context in one call: its threads plus the comments under each, keyed by thread.
	 * @param {object} pContext { OwnerType, IDOwner }
	 * @returns {Promise<{ Threads: Array<object>, CommentsByThreadKey: object }>}
	 */
	loadContext(pContext)
	{
		return this.listThreads(pContext).then((pThreads) =>
		{
			let tmpThreads = pThreads || [];
			return Promise.all(tmpThreads.map((pThread) => this.listComments(pThread.Key))).then((pCommentLists) =>
			{
				let tmpByThread = {};
				for (let i = 0; i < tmpThreads.length; i++)
				{
					tmpByThread[tmpThreads[i].Key] = pCommentLists[i] || [];
				}
				return { Threads: tmpThreads, CommentsByThreadKey: tmpByThread };
			});
		});
	}

	/** Mark a thread resolved (kept visible, collapsible). @param {string} pKey @returns {Promise<object>} */
	resolveThread(pKey) { return this.updateThread(pKey, { Status: _THREAD_STATUS.Resolved }); }
	/** Mark a thread completed (the collapse state). @param {string} pKey @returns {Promise<object>} */
	completeThread(pKey) { return this.updateThread(pKey, { Status: _THREAD_STATUS.Completed }); }
	/** Reopen a resolved or completed thread. @param {string} pKey @returns {Promise<object>} */
	reopenThread(pKey) { return this.updateThread(pKey, { Status: _THREAD_STATUS.Open }); }
}

/**
 * The default, self-contained provider. Stores threads and comments in a plain object so the
 * section works with no backend. Reads return deep copies, so a caller can never mutate the store
 * out from under the provider; that keeps the seam honest (the view holds data, the provider owns
 * truth).
 */
class InMemoryCommentProvider extends CommentDataProvider
{
	/**
	 * @param {object} [pOptions]
	 * @param {object} [pOptions.Store] - backing store { Threads:{}, Comments:{} }; pass a slice of
	 *                                     AppData to keep state observable. A fresh one is made if absent.
	 * @param {boolean} [pOptions.HardDeleteComments] - remove instead of soft-delete (default false)
	 */
	constructor(pOptions)
	{
		super(pOptions);
		let tmpStore = (this.options && this.options.Store) ? this.options.Store : {};
		if (!tmpStore.Threads) { tmpStore.Threads = {}; }
		if (!tmpStore.Comments) { tmpStore.Comments = {}; }
		this.store = tmpStore;
		this._hardDeleteComments = !!(this.options && this.options.HardDeleteComments);
	}

	_clone(pValue) { return (pValue == null) ? pValue : JSON.parse(JSON.stringify(pValue)); }

	listThreads(pContext)
	{
		let tmpContext = normalizeContext(pContext);
		let tmpThreads = Object.keys(this.store.Threads)
			.map((pKey) => this.store.Threads[pKey])
			.filter((pThread) => !pThread.Deleted
				&& String(pThread.OwnerType) === tmpContext.OwnerType
				&& String(pThread.IDOwner) === tmpContext.IDOwner)
			.sort((pA, pB) => (pA.Sort - pB.Sort) || (pA.CreatedAt - pB.CreatedAt));
		return Promise.resolve(this._clone(tmpThreads));
	}

	createThread(pThreadDraft)
	{
		let tmpDraft = pThreadDraft || {};
		let tmpContext = normalizeContext(tmpDraft.Context ? tmpDraft.Context : tmpDraft);
		if (!tmpContext.OwnerType || !tmpContext.IDOwner)
		{
			return Promise.reject(new Error('createThread requires a Context (OwnerType + IDOwner)'));
		}
		let tmpNow = this._now();
		let tmpThread =
		{
			Key: tmpDraft.Key || this._key(),
			OwnerType: tmpContext.OwnerType,
			IDOwner: tmpContext.IDOwner,
			Anchor: (tmpDraft.Anchor != null) ? this._clone(tmpDraft.Anchor) : null,
			Kind: tmpDraft.Kind || _THREAD_KIND.Discussion,
			Title: tmpDraft.Title || '',
			Status: tmpDraft.Status || _THREAD_STATUS.Open,
			Sort: (typeof tmpDraft.Sort === 'number') ? tmpDraft.Sort : Object.keys(this.store.Threads).length,
			Author: this._clone(tmpDraft.Author) || null,
			CreatedAt: tmpDraft.CreatedAt || tmpNow,
			UpdatedAt: tmpNow,
			Deleted: false
		};
		this.store.Threads[tmpThread.Key] = tmpThread;
		return Promise.resolve(this._clone(tmpThread));
	}

	updateThread(pKey, pPatch)
	{
		let tmpThread = this.store.Threads[pKey];
		if (!tmpThread || tmpThread.Deleted) { return Promise.reject(new Error('updateThread: no thread ' + pKey)); }
		let tmpPatch = pPatch || {};
		let tmpAllowed = ['Title', 'Status', 'Kind', 'Sort', 'Anchor'];
		for (let i = 0; i < tmpAllowed.length; i++)
		{
			let tmpField = tmpAllowed[i];
			if (Object.prototype.hasOwnProperty.call(tmpPatch, tmpField))
			{
				tmpThread[tmpField] = (tmpField === 'Anchor') ? this._clone(tmpPatch[tmpField]) : tmpPatch[tmpField];
			}
		}
		tmpThread.UpdatedAt = this._now();
		return Promise.resolve(this._clone(tmpThread));
	}

	deleteThread(pKey)
	{
		let tmpThread = this.store.Threads[pKey];
		if (!tmpThread) { return Promise.resolve(); }
		// Drop the thread and every comment under it.
		delete this.store.Threads[pKey];
		let tmpCommentKeys = Object.keys(this.store.Comments);
		for (let i = 0; i < tmpCommentKeys.length; i++)
		{
			if (this.store.Comments[tmpCommentKeys[i]].ThreadKey === pKey)
			{
				delete this.store.Comments[tmpCommentKeys[i]];
			}
		}
		return Promise.resolve();
	}

	listComments(pThreadKey)
	{
		let tmpComments = Object.keys(this.store.Comments)
			.map((pKey) => this.store.Comments[pKey])
			.filter((pComment) => pComment.ThreadKey === pThreadKey && !pComment.Deleted)
			.sort((pA, pB) => (pA.CreatedAt - pB.CreatedAt));
		return Promise.resolve(this._clone(tmpComments));
	}

	createComment(pCommentDraft)
	{
		let tmpDraft = pCommentDraft || {};
		if (!tmpDraft.ThreadKey || !this.store.Threads[tmpDraft.ThreadKey])
		{
			return Promise.reject(new Error('createComment requires a ThreadKey of an existing thread'));
		}
		if (tmpDraft.Body == null || String(tmpDraft.Body).length === 0)
		{
			return Promise.reject(new Error('createComment requires a non-empty Body'));
		}
		let tmpNow = this._now();
		let tmpComment =
		{
			Key: tmpDraft.Key || this._key(),
			ThreadKey: tmpDraft.ThreadKey,
			ParentKey: tmpDraft.ParentKey || null,
			Author: this._clone(tmpDraft.Author) || null,
			Body: String(tmpDraft.Body),
			ContentType: tmpDraft.ContentType || _CONTENT_TYPE.Text,
			CreatedAt: tmpDraft.CreatedAt || tmpNow,
			UpdatedAt: tmpNow,
			EditedAt: null,
			Deleted: false
		};
		this.store.Comments[tmpComment.Key] = tmpComment;
		return Promise.resolve(this._clone(tmpComment));
	}

	updateComment(pKey, pPatch)
	{
		let tmpComment = this.store.Comments[pKey];
		if (!tmpComment || tmpComment.Deleted) { return Promise.reject(new Error('updateComment: no comment ' + pKey)); }
		let tmpPatch = pPatch || {};
		let tmpChanged = false;
		if (Object.prototype.hasOwnProperty.call(tmpPatch, 'Body') && tmpPatch.Body != null)
		{
			tmpComment.Body = String(tmpPatch.Body);
			tmpChanged = true;
		}
		if (Object.prototype.hasOwnProperty.call(tmpPatch, 'ContentType'))
		{
			tmpComment.ContentType = tmpPatch.ContentType;
			tmpChanged = true;
		}
		let tmpNow = this._now();
		if (tmpChanged) { tmpComment.EditedAt = tmpNow; }
		tmpComment.UpdatedAt = tmpNow;
		return Promise.resolve(this._clone(tmpComment));
	}

	deleteComment(pKey)
	{
		let tmpComment = this.store.Comments[pKey];
		if (!tmpComment) { return Promise.resolve(); }
		if (this._hardDeleteComments)
		{
			delete this.store.Comments[pKey];
		}
		else
		{
			tmpComment.Deleted = true;
			tmpComment.UpdatedAt = this._now();
		}
		return Promise.resolve();
	}
}

module.exports = CommentDataProvider;
module.exports.CommentDataProvider = CommentDataProvider;
module.exports.InMemoryCommentProvider = InMemoryCommentProvider;
module.exports.normalizeContext = normalizeContext;
module.exports.THREAD_STATUS = _THREAD_STATUS;
module.exports.THREAD_KIND = _THREAD_KIND;
module.exports.CONTENT_TYPE = _CONTENT_TYPE;
