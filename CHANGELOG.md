# Changelog

## 1.2.1

The workload shows the time logged and the hours that remain, from the time entries.
Tested in Grist 1.7.20 on docs.getgrist.com.

- **Planned · Logged · Remaining**, in the workload's toolbar when the document has a time-entries
  table. Planned is the plan, as before; this browser remembers the choice.
- **Logged**: the hours of the time entries on their days, for the person who logged them, against
  their capacity. An entry that names nobody counts for the task's people, and someone with time logged
  but no task of their own still gets a row. The bar says how many hours were logged in the dates shown,
  and a cell's tooltip what was planned there.
- **Remaining**: each task's hours less the time logged on it, spread over its working days from today
  on. Time a person logged comes off their own share; time logged by someone else, or by nobody, comes
  off every share evenly. A task that should have ended and is not done puts what is left on the first
  working day from today, and its cell's list says it is late. Days before today have no capacity, so
  the weeks gone are left blank. Without an Hours of work column, what remains is the plan from today on.
- **Level** follows what is on show: in Remaining it levels what is left to do, so a task half done no
  longer counts in full.
- The printout says which hours it shows.
- The light theme's warning red is a shade deeper, so it keeps 4.5:1 on a hovered cell.

## 1.2.0

Time tracking: timers on tasks, time logged by hand, logged against planned, and a weekly timesheet.
Tested in Grist 1.7.20 on docs.getgrist.com.

- **A time-entries table**, beside the tasks: a row per entry with the task, the person, the day, a
  start and an end or just hours, and a note. Plan Studio finds one by its columns (in English,
  German or French), or picks the one chosen in Columns. Without one, **Columns → Time tracking → Add
  a time-entries table** makes it after asking: Task, Person, Date, Started, Stopped, Hours and Note,
  named in the interface language, with Task and Person showing names. Grist's Undo takes it back in
  two steps.
- **Timers.** Start one from a task's quick edit (Enter on a bar or a card). A running timer is a row
  with a start and no end, so it lives in the document and keeps running through a reload, a closed
  laptop or another browser. The toolbar shows it, with its task, the time so far and Stop. Starting
  another stops the first in the same step; a timer stopped within a minute logs nothing. Every start
  and stop is one Undo.
- **Logged against planned.** A card says "36 of 60 h logged", and how many hours over when it is;
  the quick edit and the Gantt bar's tooltip also say how many are left. Planned hours come from the
  Hours of work column (person-days count as working days of the length set in Columns).
- **Time logged by hand**, from the quick edit or the timesheet: a day, hours and a note.
- **The timesheet**: one person's week, or everyone's, a row per task with the hours of each day, day
  and week totals, and that person's hours for the week. A click on a day logs time there. Today is
  marked in words, and on a phone the days narrow to their date so the totals stay in view.
- **CSV** of the week's entries, for a spreadsheet: semicolons and decimal commas in German and French.
- Grist does not tell a widget who is signed in, so the first timer asks whose it is and this browser
  remembers the answer.
- With a side panel open, messages appear at the top so they no longer cover the panel's buttons;
  the Undo in a message is easier to hit.

## 1.1.1

- The Project plan starter no longer starts with someone over capacity. Set up on a Saturday or a
  Sunday, its Design task asked Chloé for more hours than her five working days held. A test now
  sets the starter up on each of the seven weekdays.
- The workload reads more calmly. Numbers are regular weight and bold only when over; red is the one
  warning colour and always comes with words (the amber "nearly full" meter is gone); weeks already
  past are in quieter ink, since Level only moves what is still ahead.
- On a phone the names column gives way, so three weeks show instead of one and a half, and a
  person's "days over capacity" wraps instead of being cut off.
- The workload's type sizes and weights follow the family's scale.

## 1.1.0

The workload: who has too much on, when, and the moves that fix it.
Tested in Grist 1.7.20 on docs.getgrist.com and in Grist Desktop 0.3.16 on Windows.

### Workload

- A fifth view: a row for each person (the Assigned to column, or any other), days, weeks or months
  across, and in each cell the hours asked of that person against the hours they have, over a meter
  that fills to capacity. Past it, the cell says how many hours over.
- Hours come from an "Hours of work" column (found by name: Hours, Estimate, Aufwand, Charge…; read as
  person-days when the name says days), spread over the task's working days and split between its
  people. Without one, each task takes a full working day of each of its people, and the view says
  that is what it assumes. Done tasks, parent tasks and milestones without hours ask for nothing.
- Capacity is 8 hours on every working day (set in Columns), scaled by a column of the people table:
  hours a week (40, 24) or a share (0.5, 50 %). Weekends, public holidays and the days of a holidays
  table count as zero, and a row of that table that names a person is that person's day off.
- A week that fits in total but has days that do not says "3 days over". The toolbar counts the
  days over capacity from today on and jumps to the first.
- Click a cell for the tasks behind it, with their hours; Enter on one edits it. The keyboard moves
  from cell to cell, and a screen reader hears "Chloé, W45 · 2 Nov: 36 of 40 hours, but 3 days are
  over capacity".
- **Level** moves tasks later until nobody is over. Only tasks that take part in an overload move,
  each inside its slack: it still ends before anything that waits for it, before its due date and
  by the end of the plan, so no other task has to move. A task that has started, is done, is a
  milestone or a parent, or has dates from formulas never moves. The moves are listed first and
  written as one action, so one Undo takes them all back; what cannot be fixed that way is said.
- Prints like the other views, on A4 or A3.

### Also

- "Add a column for it" can add an Hours column. The Project plan starter now has Hours on its tasks
  and Hours per week on its People.
- Fix: with working days on, a task pushed along by another's move kept its length in calendar days
  and could end a day or two off across a weekend. A move now writes the end that keeps its working
  days.
- Week numbers in the booking grid follow the week's middle day: a week that starts on Sunday 25 Oct
  is W44, not W43.

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
