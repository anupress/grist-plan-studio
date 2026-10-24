# Plan Studio — a custom widget for Grist (by ANUPRESS)

[![License: MIT](https://img.shields.io/badge/License-MIT-2563EB.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-0F1B2D.svg)](CHANGELOG.md)
[![Live demo](https://img.shields.io/badge/live_demo-try_it-16a34a.svg)](https://anupress.github.io/grist-plan-studio/)

Plan Studio shows a table you already keep in Grist as a **Gantt chart**, a **timeline**, a
**board** or a **booking grid**, and writes every change straight back to that table. It maps onto
your own columns, follows Grist's filters and linking, prints to PDF, and runs entirely in the
viewer's browser: there is no server, and nothing leaves your document.

Paste this into Grist (**Add widget → Custom → Enter Custom URL**):

```
https://anupress.github.io/grist-plan-studio/
```

![A website relaunch as a Gantt chart: parent tasks, dependency arrows and the critical path](docs/images/gantt.png)

## Try it without Grist

Opened in a plain browser tab, the widget runs on sample data and saves nothing:

- **[A website relaunch](https://anupress.github.io/grist-plan-studio/)**: every view, switched
  from the toolbar
- **[Pop-up stores over weekends](https://anupress.github.io/grist-plan-studio/?example=stores)**:
  the booking grid, with no dates at all

## The four views

| View | Rows are | What you do in it |
|---|---|---|
| **Gantt chart** | tasks, with parents and dependencies | drag bars and their ends, link tasks, fold parents, show the critical path |
| **Timeline** | a band per person, room or project | drag a bar to another band to reassign it, or along it to move its dates |
| **Board** | cards in a lane per status, person or any other column | drag cards between and within lanes, add cards, set lane limits |
| **Booking grid** | resources × days, weeks, months or your own periods | see free cells counted per period, click one to book it, spot double bookings |

![The same plan as a board, a lane per status](docs/images/board.png)

![Pop-up stores × weekends in the booking grid, free cells counted per weekend](docs/images/booking-grid.png)

![The timeline, a band per person](docs/images/timeline.png)

## Use it in Grist

1. In your document, add a widget and choose **Custom**.
2. Paste the widget URL (above) into **Enter Custom URL**.
3. Accept **Full document access** when Grist asks.

Full access is needed because the widget reads more than its own table (the people a task is
assigned to, a holidays table, the periods of a booking grid), reads column types so it never writes
a formula, and writes your changes back. It shows the table you chose when adding the widget.

**Your columns, not ours.** Plan Studio never asks for a schema. It works out which column is the
start, the end, the due date, the assignee, the status and so on, and the **Columns** button shows
what it found and lets you change it:

- Grist's Project Management, Lab Project Management, Rental Management and Content Calendar
  templates are recognised whole and need no setup.
- Any other table is matched by column names in English, German and French. A role with no column
  offers **Add a column for it**.
- An empty table (Grist's new Table1) offers three starter templates: a project plan, an event
  booking plan and a room booking. Each asks first, and Grist's Undo takes it back.

**Every change is one Grist action.** A drag writes one row, or one bundle when dependants move
with it, so one Ctrl+Z, in Grist or in the widget, takes the whole change back. Formula columns are
never written. When access rules refuse a write, the widget puts the bar back and shows Grist's
reason.

**Linking works both ways.** Select by a People or Projects list and the widget narrows to it; new
tasks, cards and bookings get the selected value so they stay in view. Picking a task moves Grist's
cursor, so a linked card shows it.

**Self-hosted Grist** can offer Plan Studio, Advanced Charts and Invoice Studio in its Custom widget
picker, with nothing to paste: start Grist with `GRIST_WIDGET_LIST_URL` set to
`https://anupress.github.io/grist-plan-studio/manifest.json`.

## Printing

**Print** in the toolbar (or Ctrl+P in the widget) prints the view on show, A4 or A3 landscape. A
Gantt chart or timeline either fits the page width or keeps its zoom, split into page-wide slices.
Every page repeats the title and the header, and rows never split across a page edge. Choose "Save
as PDF" in the browser's print dialog for a PDF.

## Languages and keys

English, German and French, following Grist's language (or chosen in Columns). Dates, week
numbers and key names follow the language.

The main actions have keys: arrows select, Alt+arrows move, Enter opens quick edit, Ctrl+Z
undoes. **?** lists the keys of the view on show. Dialogs keep the focus and give it back, a
selection is announced to screen readers, and the booking grid has a cell cursor.

## Where settings live

- **In the widget's options**, saved in the document and shared by everyone, written only when
  someone presses Save in Columns: the column mapping, how dates are read, the view the widget
  opens in, what a card shows, lane limits and the booking grid's periods.
- **In this browser**: zoom, grouping, folded rows, the lane column and the last view, and the
  interface language. Looking around never writes to the document.

## Privacy

Everything runs in the viewer's browser. ANUPRESS runs no server and receives nothing. The widget
makes no network requests of its own; its only link out is the ANUPRESS logo.

## Development

No build step. `index.html` loads `src/` as native ES modules, and the two libraries are vendored.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 -Port 4181
# http://127.0.0.1:4181/ (the demo), or paste http://127.0.0.1:4181/index.html into Grist
```

```bash
npm install
npm test        # version check, shared-core check, 16 test suites, no framework
npm run build   # esbuild + obfuscator into dist/, which CI deploys to Pages
```

`node scripts/ui-strings.mjs` lists any interface string missing from the German or French table;
the tests run it too. `node scripts/fetch-template-schemas.mjs` refreshes the Grist templates that
role detection is tested against.

### The shared core

`src/core/` is copied from [Advanced Charts](https://github.com/anupress/grist-advanced-charts) by
`scripts/sync-core.mjs` and is read-only here.

```bash
npm run sync         # copy from ../WidgetIdea and refresh core.lock.json
npm run sync:check   # fail if src/core/ has been edited, or has moved on upstream
npm run sync:list    # what is shared, and where each file lands
```

`sync:check` runs in CI. To change a core file, change it upstream and re-sync.

## Repository

```
src/core/       copied from Advanced Charts, read-only
src/grist/      the connection to Grist: one ready(), rows in Grist's encoded form
src/data/       the document's tables, columns and references
src/model/      roles, tasks, edits, scheduling, lanes, board, booking, templates (pure, tested)
src/views/      gantt/, timeline/, board/, booking/
src/print/      page layout and the printed views
src/ui/         toolbar, Columns panel, quick edit, dialogs, keys
src/i18n/       English keys, German and French tables
src/styles/     the stylesheets
src/demo/       the sample plans used outside Grist
vendor/         Grist plugin API, Sortable
tests/          plain ES modules, one verdict per file
```

## License

[MIT](LICENSE) © 2026 ANUPRESS. Bundled libraries: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
