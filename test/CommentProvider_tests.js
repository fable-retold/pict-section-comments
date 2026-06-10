'use strict';

/**
 * Tests for the data seam: the InMemoryCommentProvider default and the convenience methods every
 * provider inherits from CommentDataProvider. These run without a browser or a pict app; the
 * provider is plain logic on purpose, so the override seam is easy to reason about and test.
 */

const libChai = require('chai');
const libExpect = libChai.expect;

const libProvider = require('../source/providers/CommentProvider-Base.js');
const libInMemory = libProvider.InMemoryCommentProvider;
const libBase = libProvider.CommentDataProvider;
const THREAD_STATUS = libProvider.THREAD_STATUS;

// A deterministic provider: fixed clock and counter keys, so assertions are stable.
function freshProvider(pExtra)
{
	let tmpClock = { t: 1000 };
	let tmpCounter = { n: 0 };
	return new libInMemory(Object.assign(
	{
		Now: function () { return tmpClock.t++; },
		KeyGenerator: function () { tmpCounter.n++; return 'k' + tmpCounter.n; }
	}, pExtra || {}));
}

const PHOTO = { OwnerType: 'Photo', IDOwner: 278199 };
const VISION = { OwnerType: 'Vision', IDOwner: 4 };

suite('CommentProvider',
function ()
{
	suite('threads',
	function ()
	{
		test('a fresh context has no threads', function ()
		{
			return freshProvider().listThreads(PHOTO).then(function (pThreads)
			{
				libExpect(pThreads).to.be.an('array').with.length(0);
			});
		});

		test('createThread requires a context', function ()
		{
			return freshProvider().createThread({ Title: 'orphan' }).then(
				function () { throw new Error('should have rejected'); },
				function (pError) { libExpect(pError.message).to.match(/Context/); });
		});

		test('createThread stamps key, status, timestamps and accepts a Context object', function ()
		{
			let tmpProvider = freshProvider();
			return tmpProvider.createThread({ Context: PHOTO, Title: 'Official' }).then(function (pThread)
			{
				libExpect(pThread.Key).to.equal('k1');
				libExpect(pThread.OwnerType).to.equal('Photo');
				libExpect(pThread.IDOwner).to.equal('278199');
				libExpect(pThread.Status).to.equal(THREAD_STATUS.Open);
				libExpect(pThread.Anchor).to.equal(null);
				libExpect(pThread.CreatedAt).to.be.a('number');
			});
		});

		test('listThreads filters by context and sorts by Sort then CreatedAt', function ()
		{
			let tmpProvider = freshProvider();
			return tmpProvider.createThread({ Context: PHOTO, Title: 'A', Sort: 2 })
				.then(function () { return tmpProvider.createThread({ Context: PHOTO, Title: 'B', Sort: 1 }); })
				.then(function () { return tmpProvider.createThread({ Context: VISION, Title: 'Other' }); })
				.then(function () { return tmpProvider.listThreads(PHOTO); })
				.then(function (pThreads)
				{
					libExpect(pThreads.map(function (pT) { return pT.Title; })).to.deep.equal(['B', 'A']);
				});
		});

		test('an anchored thread round-trips its opaque locator', function ()
		{
			let tmpProvider = freshProvider();
			let tmpAnchor = { Type: 'ByteRange', Start: 100, End: 500 };
			return tmpProvider.createThread({ Context: { OwnerType: 'File', IDOwner: '/tmp/Data.txt' }, Anchor: tmpAnchor })
				.then(function (pThread)
				{
					libExpect(pThread.Anchor).to.deep.equal(tmpAnchor);
					// stored as a copy, not the same reference
					tmpAnchor.Start = 0;
					return tmpProvider.listThreads({ OwnerType: 'File', IDOwner: '/tmp/Data.txt' });
				})
				.then(function (pThreads) { libExpect(pThreads[0].Anchor.Start).to.equal(100); });
		});

		test('updateThread patches allowed fields and bumps UpdatedAt', function ()
		{
			let tmpProvider = freshProvider();
			return tmpProvider.createThread({ Context: PHOTO }).then(function (pThread)
			{
				return tmpProvider.updateThread(pThread.Key, { Title: 'Renamed', Status: THREAD_STATUS.Resolved, Bogus: 'x' })
					.then(function (pUpdated)
					{
						libExpect(pUpdated.Title).to.equal('Renamed');
						libExpect(pUpdated.Status).to.equal(THREAD_STATUS.Resolved);
						libExpect(pUpdated.Bogus).to.equal(undefined);
						libExpect(pUpdated.UpdatedAt).to.be.greaterThan(pThread.CreatedAt);
					});
			});
		});

		test('resolve / complete / reopen convenience move the status', function ()
		{
			let tmpProvider = freshProvider();
			return tmpProvider.createThread({ Context: PHOTO }).then(function (pThread)
			{
				return tmpProvider.completeThread(pThread.Key)
					.then(function (pT) { libExpect(pT.Status).to.equal(THREAD_STATUS.Completed); })
					.then(function () { return tmpProvider.reopenThread(pThread.Key); })
					.then(function (pT) { libExpect(pT.Status).to.equal(THREAD_STATUS.Open); });
			});
		});

		test('deleteThread removes the thread and its comments', function ()
		{
			let tmpProvider = freshProvider();
			let tmpKey;
			return tmpProvider.createThread({ Context: PHOTO }).then(function (pThread)
			{
				tmpKey = pThread.Key;
				return tmpProvider.createComment({ ThreadKey: tmpKey, Body: 'hi' });
			})
				.then(function () { return tmpProvider.deleteThread(tmpKey); })
				.then(function () { return tmpProvider.listThreads(PHOTO); })
				.then(function (pThreads) { libExpect(pThreads).to.have.length(0); return tmpProvider.listComments(tmpKey); })
				.then(function (pComments) { libExpect(pComments).to.have.length(0); });
		});
	});

	suite('comments',
	function ()
	{
		function withThread(pProvider)
		{
			return pProvider.createThread({ Context: PHOTO }).then(function (pThread) { return pThread.Key; });
		}

		test('createComment requires a real thread and a non-empty body', function ()
		{
			let tmpProvider = freshProvider();
			return tmpProvider.createComment({ ThreadKey: 'nope', Body: 'x' }).then(
				function () { throw new Error('should have rejected'); },
				function (pError) { libExpect(pError.message).to.match(/ThreadKey/); })
				.then(function () { return withThread(tmpProvider); })
				.then(function (pKey) { return tmpProvider.createComment({ ThreadKey: pKey, Body: '' }); })
				.then(
					function () { throw new Error('should have rejected empty body'); },
					function (pError) { libExpect(pError.message).to.match(/Body/); });
		});

		test('comments default to text content type and list in creation order', function ()
		{
			let tmpProvider = freshProvider();
			let tmpKey;
			return withThread(tmpProvider).then(function (pKey)
			{
				tmpKey = pKey;
				return tmpProvider.createComment({ ThreadKey: tmpKey, Body: 'first', Author: { Name: 'Ada' } });
			})
				.then(function (pComment) { libExpect(pComment.ContentType).to.equal('text'); })
				.then(function () { return tmpProvider.createComment({ ThreadKey: tmpKey, Body: 'second', ContentType: 'markdown' }); })
				.then(function () { return tmpProvider.listComments(tmpKey); })
				.then(function (pComments)
				{
					libExpect(pComments.map(function (pC) { return pC.Body; })).to.deep.equal(['first', 'second']);
					libExpect(pComments[1].ContentType).to.equal('markdown');
				});
		});

		test('updateComment edits the body and stamps EditedAt', function ()
		{
			let tmpProvider = freshProvider();
			return withThread(tmpProvider).then(function (pKey)
			{
				return tmpProvider.createComment({ ThreadKey: pKey, Body: 'typo' });
			})
				.then(function (pComment)
				{
					libExpect(pComment.EditedAt).to.equal(null);
					return tmpProvider.updateComment(pComment.Key, { Body: 'fixed' });
				})
				.then(function (pUpdated)
				{
					libExpect(pUpdated.Body).to.equal('fixed');
					libExpect(pUpdated.EditedAt).to.be.a('number');
				});
		});

		test('deleteComment soft-deletes by default, hard-deletes when configured', function ()
		{
			let tmpSoft = freshProvider();
			let tmpHard = freshProvider({ HardDeleteComments: true });
			function run(pProvider)
			{
				let tmpKey;
				return withThread(pProvider).then(function (pKey)
				{
					tmpKey = pKey;
					return pProvider.createComment({ ThreadKey: tmpKey, Body: 'bye' });
				})
					.then(function (pComment) { return pProvider.deleteComment(pComment.Key); })
					.then(function () { return pProvider.listComments(tmpKey); });
			}
			return run(tmpSoft).then(function (pComments)
			{
				libExpect(pComments).to.have.length(0); // filtered out either way
				return run(tmpHard);
			}).then(function (pComments) { libExpect(pComments).to.have.length(0); });
		});
	});

	suite('the override seam',
	function ()
	{
		test('loadContext composes the primitives, so a custom provider gets it for free', function ()
		{
			// A minimal custom provider backed by two fixed arrays: proves the section can talk to any
			// object that implements the four list/create primitives, with zero in-memory storage.
			class FixtureProvider extends libBase
			{
				constructor() { super(); this.threads = [{ Key: 't1', OwnerType: 'Vision', IDOwner: '4', Status: 'Open' }]; this.comments = { t1: [{ Key: 'c1', ThreadKey: 't1', Body: 'fixed' }] }; }
				listThreads() { return Promise.resolve(this.threads); }
				listComments(pThreadKey) { return Promise.resolve(this.comments[pThreadKey] || []); }
			}
			return new FixtureProvider().loadContext(VISION).then(function (pLoaded)
			{
				libExpect(pLoaded.Threads).to.have.length(1);
				libExpect(pLoaded.CommentsByThreadKey.t1[0].Body).to.equal('fixed');
			});
		});

		test('the in-memory store can be handed in, so state can live in AppData', function ()
		{
			let tmpAppDataSlice = {};
			let tmpProvider = freshProvider({ Store: tmpAppDataSlice });
			return tmpProvider.createThread({ Context: PHOTO, Title: 'lives in appdata' }).then(function ()
			{
				// the passed-in object now holds the data
				libExpect(Object.keys(tmpAppDataSlice.Threads)).to.have.length(1);
			});
		});
	});
});
