# Changelog

## 1.22.0

The files of a task. Tested in Grist 1.7.20 with real uploaded files.

- **Hover a bar or a booking and see its files**: small pictures for photos and drawings, the type for the rest, each with its name. The Gantt chart, the timeline and the booking grid.
- **The edit window lists all the files**, larger, and a click opens one in a new tab.
- The Attachments column is found by its name (Files, Attachments, Anhänge, Pièces jointes…) or as the table's only one, and can be chosen in Settings.
- The demo's tasks carry a few files.
- German and French for every new word.

## 1.21.4

A design pass after an audit of the widget at phone and half-page widths. Nothing is removed and nothing is written differently.

- **Shorter toolbar on a phone.** Under 600 px, Timesheet, Display, Views, Group and the agenda's Add to calendar are in the **More** menu instead of the toolbar (Group appears as "Group by …" items). Between 600 and 900 px Timesheet and Views are in More too, so Settings no longer sits alone on its own row. The first-use tip takes less room.
- **The Gantt chart opens at Weeks on a phone**, not Years, where every bar was a sliver. Fit still fits.
- **Link arrows and the link handle** are a little darker, to 4.5:1 or better on every surface in both themes; the contrast test now checks them.
- **Corner radii** are on one scale (4, 6, 10 px and round), and the toolbar's soft shadow is a hairline.
- German: "No groups" reads "Keine Gruppen".

## 1.21.3

First use, as one rule: when Plan Studio finds none of its columns in a table, it asks.

- **Set up this table** (or **Start a plan** on an empty one) is offered whatever the view and whatever the table holds: use your own columns ("Or choose the columns yourself"), or add Plan Studio's (Project plan, Event booking plan, Room booking). A table with rows keeps them and gets the columns only; an empty table, including one with a few blank rows or a Files column, also gets sample rows.
- A table whose only match is a guessed name column counts as not found.

## 1.21.2

First use on a new table.

- A new Grist table often comes with a few blank rows, and Plan Studio then showed only a message. A table with nothing in it now offers the starter plans, and setting one up replaces the blank rows with the sample rows in the same step.
- A table with no Date column now has a **Settings** button on its message, instead of text alone.

## 1.21.1

Small fixes found by checking the published 1.21.0.

- **Display › Dates** writes English month names the way Grist does ("Sep", not "Sept"), German and French abbreviations with their full stops ("Mo.", "oct."), and follows the format of a DateTime column too.
- **Printout**: a blocked task is striped with its name on a plain plate and "Blocked" under its name; a deadline is a flag, and the words under the name say when the plan ends after it.

## 1.21.0

Dates the way the table writes them, deadlines, and several cards dragged together. Tested in Grist 1.7.20 (every write read back from the table, every one undone with Grist's Undo).

- **Display › Dates**: write the days in the Start column's own format (`DD/MM/YYYY`…) instead of the language's short date, in lists,
  cards, tooltips, labels and dialogs. Kept in this browser and by saved views.
- **Deadline**: a Due date apart from the End is marked in the Gantt chart (a thin flag, red when the plan ends after it) and said in
  words in the tooltip, the label and on the board's card.
- **Board**: drag one of several selected cards and they all go to the lane, one after the other (one Undo).
- A checklist in the demo, lane counts and avatars big enough to hit, the blocked stripe visible in dark mode and on a plain plate behind
  calendar names, the Gantt chart's names no longer cut to a letter on a phone.
- German and French for every new word.

## 1.20.0

Close the gaps, blocked tasks, checklists, sorting by several things, and more in the calendar. Tested in Grist 1.7.20 (every write read
back from the table, every one undone with Grist's Undo and the steps counted).

- **Close the gaps…** (More): moves every waiting task to the first day its links allow; the moves are listed first, one Undo.
- **Blocked**: a yes/no column or a status marks a task that cannot go on; striped bar, words on cards, the agenda and the edit window,
  counted in the Overview.
- **Checklist**: a text column, one item to a line; boxes and a line to add one in the edit window, “1 of 3 checked” on cards, bars and the agenda.
- **Sort by, then by, and then by** in Display: up to three keys.
- **Calendar**: drag the edge of a bar to change its start or end, drag across empty days to add a task over them, Alt+Shift+← → ends a task a day earlier or later.
- German and French for every new word.

## 1.19.0

Two levels of groups, and more in the overview. Tested in Grist 1.7.20.

- **Group in two levels** in the Gantt chart (status, then person), each level folding on its own.
- **The overview adds up a number column** (hours, a budget) instead of counting tasks, and can break the plan down by the **week or
  month tasks end**; print follows.
- German and French for every new word.

## 1.18.0

Select several tasks. Tested in Grist 1.7.20.

- **Select several**: Ctrl and Shift clicks, a box drawn with Shift in the Gantt chart, Ctrl+A, Esc.
- **A strip for what to do with them**: Mark done / open, **Set…** a column on all, **Move dates…**, **Delete…**, Clear; also from a right-click.
- **A bar dragged from the selection moves them all** (one Undo, one question about the tasks that wait for them).
- Copy as text and CSV take only the selected tasks.
- German and French for every new word.

## 1.17.0

Links with a type and a lag. Tested in Grist 1.7.20.

- **Link types**: finish to start (as before), start to start, finish to finish, start to finish, and a **lag** in days (negative lets the
  two overlap). Click an arrow: a dialog with the two settings and a sentence that follows them, or remove the link. Two columns on the
  task that waits hold them (found by name, or added when the dialog is saved); one setting a task.
- Arrows run between the ends a link joins; the late check, the push (with its preview), Level and the critical path all follow the type and the lag.
- **Critical path** is in the More menu, so the Gantt toolbar fits two rows at 1070 px with or without links.
- German and French for every new word.

## 1.16.0

Copy, repeat, several tasks at once, and a menu on every task. Tested in Grist 1.7.20 (every write read back from the table, every one undone with Grist's Undo and the steps counted).

- **Copy…**: a task, or a task with its sub-tasks, on a later day, repeated every n days, weeks or months, or until a day; the copies
  start over; one step in Undo. It covers recurring tasks and phase templates.
- **Add several tasks**: one task a line, indentation for sub-tasks, optional dates one after the other; the preview says what it
  will make. Also under a chosen task.
- **Add sub-task**, **Indent** and **Outdent** (`]` and `[`), **Mark as done** and **as not done**.
- **A menu on a task** (right-click or Shift+F10) in the Gantt chart, timeline, board, calendar, agenda and booking grid.
- **More** in the toolbar: Set baseline, Fold all, Unfold all, Copy as text, Download as CSV, Print. The toolbar is two rows instead
  of three at 1070 px.
- **Outline numbers** beside the names (Display).
- The board's printout shows swimlanes as bands.
- German and French for every new word.

## 1.15.0

The board gets swimlanes. Tested in Grist 1.7.20 (band counts compared with the table, every drop read back, one Undo each).

- **Swimlanes**: rows of lanes, one for each value of a second Choice, Reference or Text column. A drop into another row writes
  that column too (and the lane's, when it differs) in one undoable step; empty rows for known values (a person with no task yet)
  are places to drop one; **Add card** in a cell fills in both values; **Alt + Shift + ↑ ↓** moves the selected card to the next row.
  The lanes' titles stay on top while the rows scroll.
- **Fold a lane** to a strip with its count; it still takes drops. Remembered per browser, left out of saved views.
- **Sub-tasks on cards**: "2 of 5 sub-tasks done", with a short bar.
- German and French for every new word; help and the keys list say it too.

## 1.14.0

Only mine, and more fields. Tested in Grist 1.7.20 (the counts compared with the table, the cells read back after each save).

- **Mine** in the filter strip (every view but the agenda): asks who you are once, then keeps your tasks; a second click puts
  everyone back. It is the person chip set for you, so counts and saved views follow.
- **More fields in the edit window**: pick up to eight more columns in Settings (More, Edit window); they are edited under **More
  fields**, only a changed cell is written, and everyone who edits sees the same ones.
- German and French for every new word.

## 1.13.0

Getting around the Gantt chart and the timeline. Tested in Grist 1.7.20 with real mouse, wheel and key events.

- **Drag the empty chart** to move across it; a drag that starts on a bar still moves the bar, and nothing is written.
- **Ctrl and the wheel** (or a pinch) zoom around the pointer: the day under it stays under it.
- **The names column has a splitter** in the heading: drag it, use the arrow keys (Shift for big steps), double-click or Home to
  go back to the automatic width. Kept in this browser per chart and carried by a saved view.
- German and French for every new word.

## 1.12.0

Delete and duplicate. Tested in Grist 1.7.20 (a table of 12 tasks with sub-tasks and links; the rows read back and Grist's Undo clicked after each step).

- **Delete** a task from its edit window, or with the **Del** key (it asks first). With sub-tasks it asks whether they move up one
  level or go too; whatever waited for a deleted task is let go in the same step. One Undo brings it all back.
- **Duplicate** a task, or a task with its sub-tasks: every column that is not a formula, the name marked “(copy)”, links
  between the copies pointing at the copies. One Undo removes the copies. The copy opens in the edit window.
- The edit window's buttons sit in a row of their own, so the five of them fit.
- German and French for every new word.

## 1.11.0

An eighth view: the overview. Tested in Grist 1.7.20 (a table of 12 tasks, the counts compared with the table's own).

- **Overview**: a row of counts (open, late, due in 7 days, done, no dates), a bar for each value of a column (done, open and
  late, with the words beside it), the late tasks and the next milestones. **By** and **And by** in the toolbar pick the
  columns: the status and the person to begin with; a Text column that is the person, the status or the project counts.
- A click on a value goes back to the view you came from with that filter on, and the overview then counts only those tasks.
- It prints and saves as a picture, as a one-page report. It reads on a phone, and in German and French.
- Parents are left out of the counts; late is the agenda's.

## 1.10.0

Plan against actual. Tested in Grist 1.7.20 (a table of 12 tasks).

- **Set baseline**: today's start and end of every task become its plan, in two Date columns that are found by name or
  added after asking, as one step in Undo. Tasks that already have a plan can be left as they are.
- **The plan under the bars**: a bar that has moved from its plan shows it as a thin line under it, and says how far in words
  (“4 days later than planned”) in the tooltip, the quick edit and for a screen reader. Display gets “Plan under the bars”
  and a list column, **Against the plan** (“+4 d”). Print and PNG carry the lines.
- **Done on**: a Date column puts a ✓ on the day a task really finished; drag it to change the day. It writes only that cell.
- The plan columns are found by name even when a mapping was saved before they existed.
- A table with only planned dates uses them as its dates.
- German's week headings no longer run into each other: the date is left out of a heading too narrow for it.
- German and French for every new word.

## 1.9.0

The small things left over from 1.5 to 1.8. Tested in Grist 1.7.20 (a table of 12 tasks and one of 2,000).

- **Display in every view.** Row height is now also the agenda's rows, the workload's people (44 px instead of 58), the booking grid's
  tracks and the calendar's bars. The board gets **Sort cards by**, the timeline **Sort lanes by** (name, the busiest first,
  whoever starts first).
- **Sorted cards.** While the board is sorted a card can change lanes but not its place in a lane (nothing would write the rank
  that the sort ignores); the board says so, with a button to Display.
- **Keys:** **/** goes to the search, **D** opens and closes Display. Both are in the help.
- **+ New task in the agenda** (the phone's first view). In Mine the new task is yours, so it does not vanish from your list.
- **Type:** half-pixel font sizes and the weights 650 and 550 are gone from the screen styles (12.5 and 11.5 px became
  12, 13 and 11; 650 became 600).
- German and French for every new word.

## 1.8.0

Help for first use. Tested in Grist 1.7.20 (a table with columns nobody could have guessed, and the Project Management template).

- **Set up my plan**: when the dates are not found, the message offers three questions in plain words (which column starts a
  task, which ends it or when it is due, who does it), with the plan's own sentence and a count under them (“3 of 4 tasks have
  a date and will be drawn”). It sets the same mapping Settings does and saves it for the widget; a name question comes
  first only when no column was taken for the name, and the who question is left out when no column could name a person.
- **A tip for each view**, once: one sentence over the view that says what to try, with a **Help** button. It is closed with ×,
  or by opening the help, and stays away in this browser (each view has its own).
- **? opens the help**, and the toolbar's ? button too: what the view is for, what can be done in it, what search, Display and
  Settings do and do not do, and the keys of the view, in a dialog that scrolls.
- The README's pictures are new: they show the strip, Display and Settings as they are now, and there is one of Display.
- German and French for every new word.

## 1.7.0

More control over how the views look, from the toolbar. Tested in Grist 1.7.20 (the Project Management template).

- **Display**, a panel under the toolbar that leaves the view in sight: **row height** (comfortable or compact: rows 24 px
  instead of 32, bars 16 instead of 20, board cards closer), **sort rows by** (Gantt chart: start, end, name or any column,
  siblings among themselves so a task stays under its parent), **colour by** any column, **names on bars** (in the bar when
  they fit, beside, or none), **week numbers**, **weekends** and **the today line** on or off, and up to three **columns
  beside the names** in the Gantt chart's list, their headings lined up with the cells.
- In the calendar every day has a **+** (and a double click on its empty part does the same): a task dated that day, its quick
  edit open. The calendar's toolbar has **+ New task** for today.
- This browser's choices, per table; a saved view keeps them, and applying one without them brings the defaults back. Nothing is
  written to the document. **Back to the defaults** undoes them.
- Fixed: the filter strip of 1.6.0 kept its placeholder and labels in English in a German or French widget (they were made
  before the language was known).
- German and French for every new word.

## 1.6.0

A search and quick filters in every view that draws tasks. Tested in Grist 1.7.20 (the Project Management template: 16 tasks).

- **Search by name** and a **chip for who, status and project**, under the toolbar; **+ Filter** adds a chip for any other
  Choice, Reference, list or yes/no column. A chip opens its values with a count for each, worked out among the tasks the
  other filters leave. The strip says “5 of 22 shown”, with **Clear filters**; a filter that leaves nothing says so.
- In the Gantt chart, timeline, workload, agenda, board and calendar. A group stays when a task under it stays; on the
  board and the calendar each row stands on its own. A search also finds the tasks under a group by the group's name.
- **Nothing is written to the document.** The filters stay in this browser, per table, and a saved view carries them
  (the Views panel says so; applying a view that has none clears them).
- Writes still look at every task: moving a task asks about everything that waits for it, shown or not; a board lane's limit
  and its “2 of 13” count every open card; a task added while a filter is on stays on show until the filters change.
- On the workload the loads count only the tasks shown, and the strip says so; Level is off while a filter is on.
- A printout says “filtered: 5 of 22”.
- Fixed: the red used for text (a late task, today's date in the scale) was 3.7:1 on the page; it is 5:1 now.
- German and French for every new word.

## 1.5.0

A settings panel that fits the person: three questions for a beginner, every option still there for an expert.
Tested in Grist 1.7.20 (a table nobody had set up on docs.getgrist.com, and the Project Management template).

- **Settings** replaces the Columns button and opens on three tabs. **Columns** says in a plain sentence what
  your choices will do (“Each task is named by “Task” and drawn from “Start” to “End”. Colours follow “Status”.”),
  with how many columns are set and **Detect again**, then the name and the dates; a due date or a duration
  sits in a fold that is open when you use one. The columns only other views read are one fold below, each saying
  which views use it. **This view** holds the options of the view on show (the Gantt chart's colours, how dates
  are read, the days that count; the board's cards and lanes; the workload's day and capacity). **More** holds the
  options of the other views, in folds, and the interface language. The panel reopens on the tab you last used.
- **Find a setting** searches every option by its name and its explanation, in the interface language, accents
  and capitals ignored; each result says which tab it lives on.
- The panel says where a setting is kept: the mapping and the options for everyone who opens the page, the
  language in this browser only.
- On a table with no dates the first message offers **Choose columns**, which opens the panel on the sentence:
  Choose columns, Start, End and Save: four steps to a drawn plan.
- Fixed: the dialog's heading and the Name field shared one id, so a screen reader named the field “Columns”.
- German and French for every new word, the eight sentences included; tap targets of 24 px for the panel's links.

## 1.4.0

A calendar, saved views, a way over from TaskFlow and Gestion de Projet, and PNG pictures.
Tested in Grist 1.7.20 on docs.getgrist.com.

- **Calendar**, a seventh view: a month or a week, a bar for each task on the days it covers (a task over
  several weeks is one bar per row, squared off where it continues), weekends and holidays tinted, finished
  tasks struck through, today a filled circle. A day with more bars than its cell holds says `+3 more`;
  that, and a day's number, open the week, which shows every bar with who and what state.
- **Drag a bar to another day**: the task keeps its length and moves there, by the Gantt chart's rules
  (a due-only task moves its due date, formulas refuse, what waits for it is asked about); one action, one
  Undo. Alt + arrows move a day (Alt + up and down a week), PageUp and PageDown step the month, Escape cancels
  a drag. Touch drags after half a second's rest. On a phone the Agenda opens instead of the calendar.
- **Saved views**: **Views** in the toolbar. A name and how the widget was set up (the view, zoom, grouping,
  lane column, rows and periods, workload measure, Mine or Everyone, month or week), kept in the widget's
  options so everyone sees them, saved by people who can edit the document. Apply, Update, Delete (with Undo).
- **Moving over**: Gestion de Projet's `PM_Tasks` is recognised by its columns, as TaskFlow's tables
  already were, so a document from either opens in Plan Studio with nothing mapped. Its `archived` status
  counts as finished; a Reference with no show column (its `Project_Id`) now reads as the table's name
  column instead of `PM_Projects[3]`.
- **Save as PNG** in the Print panel: the printout as a picture, for every view that prints (the Gantt
  chart, timeline, board, booking grid, workload and the calendar). Drawn in the browser, nothing sent anywhere.
- The calendar prints too: a month or a week on one landscape page.
- The toolbar's count links ("5 without dates") are 24 px targets, and the reminder script now finishes a task
  by the same words Plan Studio does (it had its own, shorter list).

## 1.3.0

An agenda for the phone, a calendar file with a reminder, and morning email reminders on the free plan.
Tested in Grist 1.7.20 on docs.getgrist.com.

- **Agenda**, a sixth view: the tasks that are not finished, under the day they next need someone.
  Late (with how many days) first, then Today, Tomorrow, Under way, This week, Next week, Later and
  No date. A task is finished when Done is ticked, its progress is full, or its status is a word such
  as Done, Completed, Erledigt or Terminé. A table with no Done, Status or Progress column has nothing
  late. A tap opens the quick edit.
- **Mine · Everyone**: Mine shows the tasks of the person this browser says it is. It asks once, and
  the answer is the one the timer uses. A browser that knows who it is opens on Mine.
- **On a phone** (under 600 px wide) the Agenda is the first view, unless the widget is set to open as
  something else or this browser last used another view. The toolbar becomes one menu and the controls
  that fit a thumb: the view strip is a menu, Print and the keyboard list are left out, controls are at
  least 40 px tall, and tick boxes are larger.
- **Add to calendar**, from the Agenda or a task's quick edit: an .ics file with the due day of each
  task (a booking's days, for bookings), a reminder you choose (9:00 the day before, on the day, three
  days before, or none), and a stable id so importing again updates rather than duplicates.
- **Email reminders**, in Columns → Reminders or from the Agenda: writes a Google Apps Script for the
  document that emails every morning the tasks that are late or due soon, to each person at the address
  in the people table's Email column or to one address. It runs in the person's own Google account and
  reads Grist through its REST API with their API key, typed into Google's editor, never into Plan
  Studio. In English, German and French.
- **Opens as** in Columns lists the Agenda.
- The workload and Level now treat a task whose status says Done, or whose progress is full, as
  finished, as the board always did, instead of only a ticked Done column.

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
