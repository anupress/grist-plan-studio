# Changelog

## 1.0.0

First public release. Versions below 1.0.0 were development builds and were never published.
Tested in Grist 1.7.20 on docs.getgrist.com.

### Reading a table

- Works on the table you already keep: every view reads "roles" (start, end, due date, duration,
  assignee, status, progress, parent, depends on, resource, period…) from your own columns.
- Grist's Project Management, Lab Project Management, Rental Management and Content Calendar
  templates, and TaskFlow's tables, are recognised whole and need no setup. A mapping left by the
  old calendar widget or Varamil's Kanban at the same widget is taken over.
- Any other table is matched by column names in English, German and French, with the column type
  as a gate. The Columns panel shows each choice and lets you change it; a mapping follows a
  renamed column.
- A role with no column offers "Add a column for it": one column of the right type, mapped at once.
- Follows the section's filters, sort and Select by, and moves Grist's cursor, so a linked card or
  table follows the task picked in the widget.

### Gantt chart

- Zoom from days to years, today line, weekends, ISO week numbers, sticky header and task list.
  Only the rows on screen are drawn.
- Drag a bar to move it, its edges to change start or end. Each change is one action in Grist, so
  one Ctrl+Z takes it back. Formula columns are never written: with a formula end and a Days column,
  stretching writes Days. A DateTime keeps its time of day across a change of clocks.
- Due-date-only tasks are milestones, and a note offers a Start column. Tasks without dates are
  listed below the chart; drag across their row to date them.
- Parent tasks fold, and their bar spans their children. "Depends on" draws finish-to-start arrows;
  drag from a bar's end to link, click an arrow to unlink, loops are refused. Moving a task offers
  to move the tasks that wait for it, all in one undo step.
- Critical path, group by a column, colour by any column (Grist's choice colours where it has them).
- Working days only, with public holidays for Germany and its states, Austria, Switzerland (federal),
  France, the UK (England and Wales) and the US, or the days of a holidays table of your own.

### Timeline

- A band per person, room or project, from a Reference, Reference list, Choice or Text column.
  Overlapping bars stack. Every row of the referenced table gets a band, busy or not.
- Drag a bar into another band to reassign it, or across to move its dates. Overlaps in a band of
  resources are flagged in words.

### Board

- A lane per value of a Choice, Reference or Text column, in the column's own order.
- Drag a card to another lane, or within a lane with an "Order in a lane" column: the moved card
  gets a rank between its neighbours, so a drag writes one row.
- Cards show dates, how late they are, initials, progress and any columns you pick. Add a card at
  the bottom of a lane; set a limit on a lane and it says when it is over.

### Booking grid

- Resources down the side, periods across: days, weeks or months, the rows of a periods table, or
  the values of a column of the bookings (Weekend 1, 2, 3), which needs no dates at all.
- Free cells are green and counted per period ("3 free", "full"). Click a free cell to book it;
  drag a booking to another resource or period.
- Double bookings are flagged on the booking, its row and the toolbar. With dates, a clash is a
  shared day: a lease ending on the 14th and the next starting on the 15th do not clash.
- "Show" narrows the rows by a column of the resources table.

### Everywhere

- **Quick edit** (Enter) and Grist's own record card (double-click). New tasks, cards and bookings
  get the value of a linked widget's selection, so they stay in view.
- **Print and save as PDF**, A4 or A3 landscape. The Gantt chart and timeline fit the page or keep
  the zoom; every page repeats the title and the header; rows never split across a page edge.
- **Starter templates** for an empty table: a project plan, an event booking plan and a room
  booking, each asked first and taken back by Grist's Undo.
- **English, German and French**, following Grist's language. Dates follow the language too.
- **Keyboard and screen readers:** moving, editing and booking work from the keys ("?" lists them),
  dialogs keep the focus and give it back, selections are announced, and the booking grid has a
  cell cursor. Light and dark themes follow Grist, every colour pair passes WCAG AA, and reduced
  motion is respected.
- **5,000 tasks** draw in about 0.6 s and drag at well under a frame per move.
- When Grist refuses a write (access rules), the change is undone in the widget and Grist's reason
  is shown. A widget without full access says how to give it.

### Development

- `src/core/` is synced from Advanced Charts and verified in CI against `core.lock.json`.
- 16 test suites, no framework. CI runs them before every deploy, with checks that the version is
  the same everywhere and that every interface string has German and French.
