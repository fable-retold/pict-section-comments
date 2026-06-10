'use strict';

/**
 * Tests for the view's render-model shaping: threading (one level of replies) vs flat, comment sort
 * order, collapse defaults, anchored-thread badges, and counts. These drive the real PictView-Comments
 * class through a headless pict instance and inspect the shaped state, without rendering to a DOM
 * (the browser demo covers real rendering).
 */

const libChai = require('chai');
const libExpect = libChai.expect;

const libPict = require('pict');
const libComments = require('../source/Pict-Section-Comments.js');

let _viewCounter = 0;

// Build a Comments view on a fresh pict, seed it with loaded data, shape, and hand back the view.
function shapedView(pOptions, pLoaded)
{
	let tmpPict = new libPict();
	_viewCounter++;
	let tmpView = tmpPict.addView('TestComments' + _viewCounter,
		Object.assign({}, libComments.default_configuration, { Context: { OwnerType: 'Vision', IDOwner: '4' } }, pOptions || {}),
		libComments);
	tmpView._loaded = pLoaded;
	tmpView._shape();
	return tmpView;
}

function thread(pKey, pExtra) { return Object.assign({ Key: pKey, OwnerType: 'Vision', IDOwner: '4', Status: 'Open', Anchor: null, Sort: 0, CreatedAt: 1000 }, pExtra || {}); }
function comment(pKey, pThreadKey, pCreatedAt, pExtra) { return Object.assign({ Key: pKey, ThreadKey: pThreadKey, ParentKey: null, Body: 'b-' + pKey, ContentType: 'text', CreatedAt: pCreatedAt, Author: { Name: 'Ada Lovelace' } }, pExtra || {}); }

suite('Comments view shaping',
function ()
{
	suite('threading',
	function ()
	{
		test('threaded mode nests one level of replies under their parent', function ()
		{
			let tmpView = shapedView({ Threaded: true },
			{
				Threads: [thread('t1')],
				CommentsByThreadKey: { t1: [comment('c1', 't1', 1000), comment('r1', 't1', 1001, { ParentKey: 'c1' }), comment('c2', 't1', 1002)] }
			});
			let tmpThread = tmpView._state.Threads[0];
			// two top-level comments, c1 carries one reply
			libExpect(tmpThread.Comments.map(function (pC) { return pC.Key; })).to.deep.equal(['c1', 'c2']);
			libExpect(tmpThread.Comments[0].ReplyWrapSlot).to.have.length(1);
			libExpect(tmpThread.Comments[0].ReplyWrapSlot[0].Replies.map(function (pR) { return pR.Key; })).to.deep.equal(['r1']);
			libExpect(tmpThread.Comments[1].ReplyWrapSlot).to.have.length(0);
		});

		test('flat mode lists every comment at the top level with no reply nesting', function ()
		{
			let tmpView = shapedView({ Threaded: false },
			{
				Threads: [thread('t1')],
				CommentsByThreadKey: { t1: [comment('c1', 't1', 1000), comment('r1', 't1', 1001, { ParentKey: 'c1' })] }
			});
			let tmpThread = tmpView._state.Threads[0];
			libExpect(tmpThread.Comments.map(function (pC) { return pC.Key; })).to.deep.equal(['c1', 'r1']);
			libExpect(tmpThread.Comments[0].ReplyWrapSlot).to.have.length(0);
		});
	});

	suite('sort order',
	function ()
	{
		let tmpLoaded = { Threads: [thread('t1')], CommentsByThreadKey: { t1: [comment('c1', 't1', 1000), comment('c2', 't1', 2000), comment('c3', 't1', 3000)] } };

		test('oldest first by default', function ()
		{
			let tmpView = shapedView({ SortOrder: 'oldest', Threaded: true }, tmpLoaded);
			libExpect(tmpView._state.Threads[0].Comments.map(function (pC) { return pC.Key; })).to.deep.equal(['c1', 'c2', 'c3']);
			libExpect(tmpView._state.SortLabel).to.equal('Oldest first');
		});

		test('newest first reverses top-level order', function ()
		{
			let tmpView = shapedView({ SortOrder: 'newest', Threaded: true }, tmpLoaded);
			libExpect(tmpView._state.Threads[0].Comments.map(function (pC) { return pC.Key; })).to.deep.equal(['c3', 'c2', 'c1']);
			libExpect(tmpView._state.SortLabel).to.equal('Newest first');
		});
	});

	suite('collapse and status',
	function ()
	{
		test('resolved threads collapse by default when CollapseCompleted is on', function ()
		{
			let tmpView = shapedView({ CollapseCompleted: true },
				{ Threads: [thread('open1'), thread('done1', { Status: 'Resolved' })], CommentsByThreadKey: {} });
			let tmpOpen = tmpView._state.Threads[0];
			let tmpDone = tmpView._state.Threads[1];
			libExpect(tmpOpen.CollapseClass).to.equal('');
			libExpect(tmpDone.CollapseClass).to.equal('psc-collapsed');
			libExpect(tmpDone.StatusLower).to.equal('resolved');
		});

		test('an open thread offers Resolve, a closed one offers Reopen', function ()
		{
			let tmpView = shapedView({ AllowResolve: true },
				{ Threads: [thread('open1'), thread('done1', { Status: 'Completed' })], CommentsByThreadKey: {} });
			libExpect(tmpView._state.Threads[0].ActionSlot[0].ResolveLabel).to.equal('Resolve');
			libExpect(tmpView._state.Threads[1].ActionSlot[0].ResolveLabel).to.equal('Reopen');
		});
	});

	suite('anchors and counts',
	function ()
	{
		test('an anchored thread shows a location badge with a readable label', function ()
		{
			let tmpView = shapedView({},
				{ Threads: [thread('t1', { Anchor: { Type: 'ByteRange', Start: 100, End: 500 } })], CommentsByThreadKey: { t1: [] } });
			let tmpThread = tmpView._state.Threads[0];
			libExpect(tmpThread.AnchorSlot).to.have.length(1);
			libExpect(tmpThread.AnchorSlot[0].AnchorLabel).to.equal('bytes 100-500');
		});

		test('thread count and per-thread comment count are reported', function ()
		{
			let tmpView = shapedView({ Threaded: true },
				{ Threads: [thread('t1')], CommentsByThreadKey: { t1: [comment('c1', 't1', 1000), comment('c2', 't1', 1001)] } });
			libExpect(tmpView._state.ThreadCount).to.equal(1);
			libExpect(tmpView._state.Threads[0].CommentCount).to.equal('2 comments');
		});
	});

	suite('read-only',
	function ()
	{
		test('read-only mode hides composers and actions', function ()
		{
			let tmpView = shapedView({ ReadOnly: true },
				{ Threads: [thread('t1')], CommentsByThreadKey: { t1: [comment('c1', 't1', 1000)] } });
			let tmpThread = tmpView._state.Threads[0];
			libExpect(tmpView._state.RootClass).to.equal('psc-readonly');
			libExpect(tmpView._state.NewButtonSlot).to.have.length(0);
			libExpect(tmpThread.ComposerSlot).to.have.length(0);
			libExpect(tmpThread.ActionSlot).to.have.length(0);
			libExpect(tmpThread.Comments[0].ActionSlot).to.have.length(0);
		});
	});

	suite('rich mode (full editor)',
	function ()
	{
		test('rich degrades to the markdown composer when CodeMirror is absent', function ()
		{
			let tmpView = shapedView({ EditorMode: 'rich' }, { Threads: [thread('t1')], CommentsByThreadKey: { t1: [] } });
			libExpect(tmpView._effectiveMode()).to.equal('markdown');
			libExpect(tmpView._state.Threads[0].ComposerSlot).to.have.length(1); // inline textarea
			libExpect(tmpView._state.Threads[0].AddButtonSlot).to.have.length(0);
		});

		test('rich uses the modal-editor button when CodeMirror is present', function ()
		{
			let tmpView = shapedView({ EditorMode: 'rich', CodeMirrorModules: { EditorView: function () {}, EditorState: {} } },
				{ Threads: [thread('t1')], CommentsByThreadKey: { t1: [] } });
			libExpect(tmpView._effectiveMode()).to.equal('rich');
			libExpect(tmpView._state.Threads[0].ComposerSlot).to.have.length(0);
			libExpect(tmpView._state.Threads[0].AddButtonSlot).to.have.length(1);
			libExpect(tmpView._state.Threads[0].AddButtonSlot[0].ThreadKey).to.equal('t1');
		});

		test('rich comments are stamped ContentType rich regardless of CodeMirror presence', function ()
		{
			let tmpView = shapedView({ EditorMode: 'rich' }, { Threads: [], CommentsByThreadKey: {} });
			libExpect(tmpView._newCommentDraft('t1', null, 'hi').ContentType).to.equal('rich');
		});
	});
});
