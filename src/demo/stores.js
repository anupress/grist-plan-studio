// The second demo: pop-up stores over weekends, rebuilt from a booking plan described on the Grist
// forum (community.getgrist.com/t/12396). Small wooden huts are let to traders for the weekends of a
// market; the organiser's spreadsheet had stores as rows, weekends as columns and a name or "VACANT" in each
// cell. Here the bookings are one flat table (Event, Weekend, Store, Participant), as it was set up
// in Grist, and the booking grid draws the spreadsheet back from it.

export const STORES_TABLE = 'Bookings';

const col = (ref, id, type, extra = {}) => ({
  ref, id, label: extra.label || id.replace(/_/g, ' '), type, kind: /^Ref:/.test(type) ? 'Ref' : type,
  isFormula: false, refTable: (/^Ref:(.+)$/.exec(type) || [])[1] || null, visibleColId: extra.visibleColId || null,
  choices: extra.choices || [], choiceOptions: extra.choiceOptions || {},
});

export const STORES_COLUMNS = [
  col(1, 'Event', 'Ref:Events', { visibleColId: 'Name' }),
  col(2, 'Weekend', 'Choice', { choices: ['Weekend 1', 'Weekend 2', 'Weekend 3', 'Weekend 4'] }),
  col(3, 'Store', 'Ref:Stores', { visibleColId: 'Name' }),
  col(4, 'Participant', 'Ref:Participants', { visibleColId: 'Name' }),
  col(5, 'Fee', 'Numeric'),
  col(6, 'Paid', 'Bool'),
];

const STORES = ['Hut 1', 'Hut 2', 'Hut 3', 'Hut 4', 'Hut 5', 'Hut 6', 'Tent A', 'Tent B'];
const PEOPLE = ['Bakery Nord', 'Candles & Co', 'Wood Toys Lenz', 'Honey Farm', 'Knit & Purl', 'Glass Works', 'Spice Route',
  'Paper Atelier', 'Cheese Cellar', 'Tea House', 'Felt Studio', 'Mulled Wine Bros'];

export const STORES_LABELS = {
  Event: new Map([[1, 'Christmas market 2026']]),
  Store: new Map(STORES.map((n, i) => [i + 1, n])),
  Participant: new Map(PEOPLE.map((n, i) => [i + 1, n])),
};

/** The Stores table itself, for the grid's filter (only huts, only tents). */
export const STORES_RESOURCES = {
  columns: [col(101, 'Name', 'Text'), col(102, 'Type', 'Choice', { choices: ['Hut', 'Tent'] }), col(103, 'Size', 'Choice', { choices: ['Small', 'Large'] })],
  rows: STORES.map((n, i) => ({ id: i + 1, Name: n, Type: n.startsWith('Hut') ? 'Hut' : 'Tent', Size: i % 3 === 2 ? 'Large' : 'Small' })),
};

export function storesRows() {
  // [weekend, store, participant, fee, paid]; Hut 3 is let twice on weekend 2 on purpose.
  const B = [
    [1, 1, 1, 180, true], [1, 2, 2, 180, true], [1, 3, 3, 180, true], [1, 5, 4, 180, false], [1, 7, 12, 320, true],
    [2, 1, 1, 180, true], [2, 3, 5, 180, false], [2, 3, 6, 180, false], [2, 4, 7, 180, true], [2, 7, 12, 320, true], [2, 8, 9, 320, false],
    [3, 1, 1, 180, false], [3, 2, 10, 180, false], [3, 6, 8, 180, true], [3, 7, 12, 320, false],
    [4, 1, 1, 180, false], [4, 4, 11, 180, false], [4, 7, 12, 320, false],
  ];
  return B.map(([w, s, p, fee, paid], i) => ({
    id: i + 1, Event: ['R', 'Events', 1], Weekend: 'Weekend ' + w, Store: ['R', 'Stores', s], Participant: ['R', 'Participants', p], Fee: fee, Paid: paid,
  }));
}
