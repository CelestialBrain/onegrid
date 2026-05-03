# HyperFormula

**Source**: https://hyperformula.handsontable.com/
**Repo**: https://github.com/handsontable/hyperformula
**License**: Dual — **GPLv3** (open source / evaluation only) **OR** proprietary commercial license. The GPL license is virally restrictive: it propagates to any project that links HyperFormula. Most non-OSS apps need the commercial tier.
**Pricing** (commercial):
- Small Business — $1,490/yr + $1.49 per user/yr (≤1,000 users)
- Big Teams — from $5,990/yr + $1.20 per user/yr (1,000–5,000 users)
- Enterprise — custom, unlimited users, priority support
**Latest version**: 3.2.0 (2026-02-19 per GitHub releases).
**Stars**: ~2.7k
**Maintenance**: Active. Maintained by Handsoncode (same team as Handsontable). Steady release cadence — performance + function additions every minor.

## Architecture
- **Headless calculation engine.** Pure logic; no UI, no DOM, no canvas.
- TypeScript (~98% TS).
- Runs in browser and Node.js. No framework dependency.
- Built around a **directed acyclic graph (DAG)** of cell + range nodes. Each cell or range becomes a node; edges represent reference dependencies.
- Evaluation strategy: topological sort, then evaluate in order. On change, only descendants of the changed node are re-evaluated.

### Node types
- **ValueCellVertex** — a cell holding a literal (number, string, bool, error).
- **EmptyCellVertex** — empty cell (created on demand if referenced).
- **FormulaCellVertex** — a parsed formula AST attached to a cell.
- **ArrayVertex** — for array-formula spill ranges.
- **RangeVertex** — represents a referenced range (e.g. `A1:A100`); critical optimization to avoid quadratic edges.
- **ParsingErrorVertex** — placeholder for unparseable formulas.

### Range optimization
A naive graph would create n² edges if many cells reference overlapping ranges. HyperFormula instead **decomposes ranges hierarchically**: `B5:D20` is represented as `B5:D19` plus the three cells in row 20 — so adjacent range nodes share most of their structure. Documented to reduce ~5,050 edges to a constant in pathological cases.

### Parser
- Recursive-descent parser tokenizes formulas (`=SUM(A1:A10)`, `=IF(B1>10, "yes", "no")`).
- Supports relative + absolute references (`A1`, `$A$1`, `$A1`, `A$1`), cross-sheet (`Sheet2!A1`), named expressions, array literals (`{1,2,3;4,5,6}`).
- Operator precedence + associativity matches Excel.
- Localized function names (17 languages); the parser swaps in the right table.

### Change propagation
- `setCellContents([{ sheet, row, col, value }])` rewires graph edges + marks dependents dirty.
- `recomputeIfDependencyGraphNeedsIt` evaluates only the dirty subgraph.
- Volatile functions (`NOW()`, `RAND()`, `RANDBETWEEN()`, `TODAY()`, `OFFSET()`, `INDIRECT()`) recompute every cycle.

## Framework support
Framework-agnostic. Drop-in for any JS environment.
- Standalone use as a calc engine (CRM/ERP calculated fields, server-side compute).
- Used by Handsontable as the formulas engine.
- Used by other grids (e.g. integrations exist for AG Grid via custom value getters; not first-party).

## Features

### Function library
- **~406 functions** (v3.2.0). Categories:
  - Array Manipulation (ARRAYFORMULA, FILTER, ARRAY_CONSTRAIN, SEQUENCE)
  - Date and Time (DATE, DATEDIF, EDATE, EOMONTH, NETWORKDAYS, WORKDAY, YEARFRAC, plus all standard date getters)
  - Engineering (BIN2DEC/HEX/OCT and back, COMPLEX, IMSUM, IMDIV, BITAND, BITOR, BITXOR, BITLSHIFT, BITRSHIFT)
  - Financial (FV, NPV, PMT, RATE, IRR, MIRR, PV, NPER, depreciation: SLN, SYD, DDB)
  - Information (ISBLANK, ISERROR, ISNUMBER, ISTEXT, ISFORMULA, NA, SHEET, SHEETS, TYPE)
  - Logical (AND, OR, NOT, IF, IFS, IFERROR, IFNA, SWITCH, XOR, TRUE, FALSE)
  - Lookup and Reference (VLOOKUP, HLOOKUP, INDEX, MATCH, XLOOKUP, OFFSET, CHOOSE, ADDRESS, ROW, COLUMN, INDIRECT)
  - Math and Trigonometry (ABS, SIN/COS/TAN + hyperbolic + inverse, SQRT, POWER, LOG, LN, EXP, ROUND family, COMBIN, FACT, SUMPRODUCT, PRODUCT)
  - Matrix (MMULT, TRANSPOSE, MAXPOOL, MEDIANPOOL, MINUS)
  - Operator (HF.ADD, HF.MULTIPLY, HF.DIVIDE, HF.CONCAT, comparisons)
  - Statistical (AVERAGE, MEDIAN, MODE, STDEV, VAR, CORREL, COVAR, distributions: NORM.DIST, BETA.DIST, BINOM.DIST, CHISQ.DIST, F.DIST, POISSON.DIST, T.DIST, plus inverse variants)
  - Text (CONCATENATE, UPPER, LOWER, PROPER, LEFT, RIGHT, MID, LEN, SUBSTITUTE, REPLACE, TEXTJOIN, TRIM, FIND, SEARCH, EXACT, T, VALUE)
- **Notable unsupported**: Database functions (DAVERAGE, DCOUNT, DGET, DSUM, DMAX, DMIN), Cube/OLAP functions, Web functions (WEBSERVICE, FILTERXML, ENCODEURL), Compatibility category.
- **Custom functions** via `FunctionPlugin` extension.

### Sheets / cross-sheet
- Multi-sheet engine: `addSheet('Sheet2')`, `removeSheet`, `renameSheet`.
- Cross-sheet references: `Sheet2!A1`, `'My Sheet'!A1:B10`.
- Cross-sheet formulas update reactively.

### Named expressions
- Workbook-scoped or sheet-scoped names: `addNamedExpression('TaxRate', '=0.21')`.
- Used in formulas: `=A1 * TaxRate`.

### Array formulas / dynamic arrays
- Excel 365-style spill: `=A1:A10*2` produces a 10-cell spill.
- `ARRAYFORMULA`, `FILTER`, `SEQUENCE` for dynamic arrays.
- `ArrayVertex` tracks spill ownership; collisions raise `#SPILL!`.

### Undo/redo
- Built-in undo/redo stack: `undo()`, `redo()`. Tracks every operation (setCellContents, addSheet, addRows, removeRows, moveCells, etc.).

### Custom functions
- `FunctionPlugin` class: implement `run(args, ...): InterpreterValue`. Register translations + categories.
- Argument coercion helpers (`scalarValueOrError`, `coerceScalarToNumber`).

### Locale / i18n
- 17 language packs: `enGB`, `enUS`, `csCZ`, `daDK`, `deDE`, `esES`, `fiFI`, `frFR`, `huHU`, `itIT`, `nbNO`, `nlNL`, `plPL`, `ptPT`, `ruRU`, `svSE`, `trTR`.
- Custom language packs supported.
- Function names + error messages localized.
- Locale-aware decimal separator + arg separator (Excel European convention `,` decimal / `;` arg).

### Configuration
- `Config` controls: `caseSensitive`, `chooseAddressMappingPolicy`, `dateFormats`, `decimalSeparator`, `functionArgSeparator`, `language`, `licenseKey`, `localeLang`, `nullDate`, `timeFormats`, `useColumnIndex` (perf flag for VLOOKUP/MATCH), `useArrayArithmetic`, `useStats`, `precisionRounding`, etc.

### Performance
- v2.6.0 reported ~60% improvement for 5M-cell text data, no formulas.
- `useColumnIndex` flag accelerates VLOOKUP/MATCH on large unsorted ranges.
- `updateConfig()` only rebuilds engine if config actually changed (cheap no-op otherwise).
- Selective recalculation via DAG (only dependents recompute).
- Suspended evaluation: `suspendEvaluation()` / `resumeEvaluation()` to batch many edits.
- Documented for "complex models with hundreds of thousands of cells" — not a million-formula engine, but easily handles spreadsheet-scale workloads.

## API style
- Imperative TypeScript API on a singleton `HyperFormula` instance.
- `HyperFormula.buildFromSheets({ Sheet1: [[...]], Sheet2: [[...]] }, config)`
- `setCellContents`, `getCellValue`, `getSheetValues`, `getCellFormula`, `getSheetFormulas`.
- Events: `valuesUpdated`, `sheetAdded`, `sheetRemoved`, `sheetRenamed`, `namedExpressionAdded`, etc.
- TypeScript: first-class. Types over `RawCellContent`, `CellValue`, `ExportedChange`.

## Bundle size
- Full bundle: ~600 KB min, ~190 KB gzip.
- Tree-shakeable function plugins — you can build a custom HyperFormula bundle with only chosen function categories (`HyperFormula.registerFunctionPlugin(...)`).

## Notable use cases
- Calc engine for spreadsheet UIs (Handsontable's `formulas` plugin).
- Server-side calc fields in CRM/ERP.
- LLM tool — math engine for agent-driven spreadsheets.
- Data validation / what-if simulators.

## Recurring weaknesses
1. **GPLv3 license is viral** — many devs assume "open source = free for any use" and learn at deployment that linking it from a proprietary app requires a commercial license.
2. **No database, cube, or web functions** — translating Excel files that use DGET/DSUM falls over.
3. **Heavy bundle** for grid integrations — adds ~190 KB gzip on top of Handsontable.
4. **No regex/string-match functions** at Excel-365 parity (REGEXMATCH, REGEXEXTRACT not supported).
5. **Pricing complexity** — per-user-per-year subscription with bands; surprises teams expecting AG Grid-style per-developer flat fee.

## Source URLs read
- https://hyperformula.handsontable.com/
- https://hyperformula.handsontable.com/guide/built-in-functions
- https://hyperformula.handsontable.com/guide/dependency-graph.html
- https://hyperformula.handsontable.com/guide/performance.html
- https://github.com/handsontable/hyperformula
- https://handsontable.com/blog/hyperformula-2.6.0-improved-performance-by-60
- https://handsontable.com/blog/hyperformula-2-5-0-new-functions-and-performance-improvements
