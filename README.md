# pict-section-comments

An attach-to-anything comments section for Pict. Mount it on any context (a record like
`Photo 278199`, an uploaded media item, a vision, or a located slice of content such as a byte
range in a file) and get threaded or flat discussions, a content spectrum from plain text up to
markdown with image and file drag-in, newest or oldest sort, completable and collapsible threads,
and a read-only mode.

The wrapping app overrides all reading and writing through one provider object. With nothing wired,
the section runs on an in-memory provider backed by AppData, so it works the moment you mount it.

## The model

```
Context  (OwnerType + IDOwner)      the broad subject: a Photo, a Media item, a Vision, a file
  -> Thread  (optional Anchor, Status)   the official discussion, or a note pinned to a location
       -> Comment  (optional one reply level, ContentType)
```

- A **Context** is `{ OwnerType, IDOwner }`, the same polymorphic-owner shape used elsewhere in
  Retold (for example Media). One context holds many threads.
- A **Thread** is either the official discussion on the whole context (no anchor) or a note pinned
  to a sub-location. The optional **Anchor** is an opaque locator the host defines, for example
  `{ Type: 'ByteRange', Start: 100, End: 500 }`, `{ Type: 'Paragraph', Selector: '...' }`, or
  `{ Type: 'Point', X, Y }`. The section stores and round-trips it, shows a small badge, and fires
  `onAnchorActivate(anchor)` so the host can scroll or highlight its own content. A thread carries a
  **Status** (`Open`, `Resolved`, `Completed`); resolved and completed threads can collapse.
- A **Comment** has an author, a body, and a **ContentType** (`text`, `markdown`, `rich`, `json`).
  In threaded mode a comment can carry one level of replies (`ParentKey`).

## Quick start

```javascript
const libComments = require('pict-section-comments');

pict.addView('WorkItem-Comments', Object.assign({}, libComments.default_configuration,
{
    Context: { OwnerType: 'WorkItem', IDOwner: 4012 },
    CurrentUser: { Key: 7, Name: 'Ada Lovelace' },
    EditorMode: 'markdown',
    Threaded: true
}), libComments);

pict.views['WorkItem-Comments'].render();   // in-memory by default
```

Mount more than one on a page by registering them under different hashes; each keeps its own state.

## Overriding reading and writing

The section never touches storage itself. It calls a provider that implements this interface (every
method returns a Promise):

```
listThreads(pContext)          -> Thread[]
createThread(pThreadDraft)     -> Thread
updateThread(pKey, pPatch)     -> Thread     // Status (resolve / complete / reopen), Title, Anchor, Sort
deleteThread(pKey)             -> void
listComments(pThreadKey)       -> Comment[]
createComment(pCommentDraft)   -> Comment
updateComment(pKey, pPatch)    -> Comment     // edit Body
deleteComment(pKey)            -> void
```

Pass your own object as `DataProvider` and the section talks to your backend:

```javascript
pict.addView('WorkItem-Comments', Object.assign({}, libComments.default_configuration,
{
    Context: { OwnerType: 'WorkItem', IDOwner: 4012 },
    DataProvider: myServerBackedCommentProvider   // implements the interface above
}), libComments);
```

`CommentDataProvider` (exported) is a base class with the four list and create primitives left
abstract; it implements `loadContext`, `resolveThread`, `completeThread`, and `reopenThread` on top
of them, so a subclass only fills in the primitives. `InMemoryCommentProvider` (the default) is a
full reference implementation; pass it a `Store` object (for example a slice of AppData) to keep its
state observable and serializable.

## Content modes

`EditorMode` sets the composer and the default ContentType for new comments:

- `text` and `multiline`: a plain box; bodies render escaped, with line breaks preserved.
- `markdown`: a markdown composer with image and file drag-in (drop or paste, routed to the
  `ImageUpload` hook), rendered read-only through `pict-section-content` (code, tables, Mermaid,
  KaTeX). This is the everyday rich comment.
- `rich`: the full `pict-section-markdowneditor` (CodeMirror 6), opened in a modal for composing,
  rendered read-only through `pict-section-content`. The host supplies CodeMirror: pass the
  `CodeMirrorModules` option (`{ EditorView, EditorState, extensions, ... }`) or set
  `window.CodeMirrorModules`. Without it, `rich` falls back to the `markdown` composer, so it never
  breaks. The demo bundles CodeMirror to show this mode.
- `json`: reserved for structured bodies (diagrams, svg); rendered escaped for now, a registered
  adapter renders it later.

Bodies are escaped or sanitized before display, so user content cannot inject markup.

## Configuration

| Option | Default | Meaning |
|---|---|---|
| `Context` | `{}` | The `{ OwnerType, IDOwner }` this instance is bound to (required). |
| `DataProvider` | in-memory | The object that reads and writes. Omit to use AppData. |
| `Threaded` | `true` | One level of replies when true; a flat list when false. |
| `EditorMode` | `markdown` | `text`, `multiline`, `markdown`, or `rich`. |
| `ReadOnly` | `false` | Render-only: no composer, no actions. |
| `SortOrder` | `oldest` | `oldest` or `newest`; user-toggleable in the header. |
| `CollapseCompleted` | `true` | Resolved and completed threads start collapsed. |
| `AllowNewThread` / `AllowResolve` / `AllowReply` / `AllowEdit` / `AllowDelete` | `true` | Permission gates. |
| `CurrentUser` | `{ Name: 'Anonymous' }` | Author of new comments; `{ Key, Name, Avatar }`. |
| `ImageUpload` | none | `function (pFile, fCallback(pError, pURL))` for drag-in. |
| `CodeMirrorModules` | none | CodeMirror 6 modules for the `rich` editor; also read from `window.CodeMirrorModules`. |
| `Title` / `EmptyText` | | Header label and empty-state copy. |

Event callbacks (all optional): `onThreadCreated`, `onThreadResolved`, `onCommentAdded`,
`onCommentEdited`, `onCommentDeleted`, `onAnchorActivate`, `onChange`.

Edit and delete are gated to the comment's author when `CurrentUser.Key` is set; with no key set
(single-user or demo) both are allowed. Delete confirms through `pict-section-modal`.

## Run the demo and the tests

```bash
npm install --legacy-peer-deps
npm test                 # the Mocha suite (provider, content adapter, view shaping)
npm run build            # the section bundle in dist/

npm run build:codemirror # bundles CodeMirror for the demo's rich mode (one time)
cd example_applications/comments_demo
npm run build            # an in-memory demo; serve dist/ and open index.html
```

The demo has a Markdown / Rich toggle: Markdown composes inline, Rich opens the full editor in a modal.

## License

MIT.
