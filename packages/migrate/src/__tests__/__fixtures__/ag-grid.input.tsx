// Input fixture for the ag-grid → oneGrid transformer.
const columns = [
  {
    field: 'firstName',
    headerName: 'First Name',
    width: 130,
    valueFormatter: (p: unknown) => String(p),
  },
  {
    field: 'revenue',
    headerName: 'Revenue',
    width: 130,
    cellRenderer: 'agAnimateShowChangeCellRenderer',
    pinned: 'left',
    sortable: true,
    editable: true,
  },
];
