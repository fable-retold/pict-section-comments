'use strict';

/**
 * pict-section-comments entry point.
 *
 * Exports the Comments view (with its default_configuration) plus the data-provider classes and the
 * content adapter, so a host can register the view and, if it wants, subclass the provider to talk to
 * its own backend or reuse the content rendering.
 *
 * Typical use:
 *
 *   const libComments = require('pict-section-comments');
 *   pict.addView('WorkItem-Comments', Object.assign({}, libComments.default_configuration,
 *       { Context: { OwnerType: 'WorkItem', IDOwner: 4012 }, CurrentUser: { Key: 7, Name: 'Ada' } }),
 *       libComments);
 *   pict.views['WorkItem-Comments'].render();   // in-memory by default; pass a DataProvider to persist
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libCommentsView = require('./views/PictView-Comments.js');
const libCommentProvider = require('./providers/CommentProvider-Base.js');
const libContentAdapter = require('./content/ContentAdapter.js');

module.exports = libCommentsView;
module.exports.default_configuration = libCommentsView.default_configuration;

// The data seam: the interface a host implements to override all reading and writing, and the
// in-memory default the section uses when nothing is wired.
module.exports.CommentDataProvider = libCommentProvider.CommentDataProvider;
module.exports.InMemoryCommentProvider = libCommentProvider.InMemoryCommentProvider;

// Constants and the content adapter, exported for hosts that build on top of the section.
module.exports.ContentAdapter = libContentAdapter;
module.exports.THREAD_STATUS = libCommentProvider.THREAD_STATUS;
module.exports.THREAD_KIND = libCommentProvider.THREAD_KIND;
module.exports.CONTENT_TYPE = libCommentProvider.CONTENT_TYPE;
module.exports.normalizeContext = libCommentProvider.normalizeContext;
