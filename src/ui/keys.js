// Keyboard shortcuts, view by view, shown in the help (ui/help.js). Everything the mouse does has a key, except
// drawing a dependency and dragging dates on the timeline, which have Alt+arrows.

// [key, what it does]; both reach t() (scripts/ui-strings.mjs reads such pairs)
const COMMON = [
  ['Tab', 'Go to the view, the toolbar or a panel'],
  ['Enter', 'Edit the selected item'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Ctrl+P', 'Print or save as PDF'],
  ['Del', 'Delete the selected task (it asks first)'],
  ['/', 'Search by name'],
  ['D', 'Open or close Display'],
  ['?', 'Help and these shortcuts'],
];
const BY_VIEW = {
  gantt: [
    ['↑ ↓  Home End', 'Select the previous or next task'],
    ['← →', 'Fold or unfold a parent task'],
    ['Alt+← →', 'Move the task a day'],
    ['Alt+Shift+← →', 'Make it end a day earlier or later'],
    ['+ −', 'Zoom in or out'],
    ['T', 'Scroll to today'],
  ],
  timeline: [
    ['↑ ↓  Home End', 'Select the previous or next bar'],
    ['Alt+← →', 'Move the task a day'],
  ],
  board: [
    ['↑ ↓', 'Select a card in the lane'],
    ['← →', 'Go to the next lane'],
    ['Alt+← →', 'Move the card to the next lane'],
    ['Alt+↑ ↓', 'Move the card up or down'],
  ],
  booking: [
    ['← → ↑ ↓', 'Move from cell to cell'],
    ['Enter', 'Book a free cell, or edit the booking'],
  ],
  calendar: [
    ['↑ ↓ ← →', 'Select the previous or next task'],
    ['Alt+← →', 'Move the task a day'],
    ['Alt+↑ ↓', 'Move the task a week'],
    ['PageUp  PageDown', 'The previous or next month or week'],
  ],
  agenda: [
    ['↑ ↓', 'Move from task to task'],
    ['Enter', 'Edit the task'],
  ],
  overview: [
    ['Tab', 'Go from value to value and to the lists'],
    ['Enter', 'Show only the tasks of a value, or edit a task'],
  ],
  workload: [
    ['← → ↑ ↓', 'Move from cell to cell'],
    ['Enter', 'List the tasks behind the cell; Enter on one edits it'],
    ['Esc', 'Close the list'],
  ],
};

/** The keys of a view and the ones that work everywhere: [key, what it does] pairs, both through t(). */
export function keyRows(view) {
  return [...(BY_VIEW[view] || []), ...COMMON];
}
