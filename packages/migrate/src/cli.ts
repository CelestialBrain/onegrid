#!/usr/bin/env node
// =============================================================================
// onegrid-migrate CLI
//
//   onegrid-migrate transform <files...> --source ag-grid|tanstack
//                              [--write] [--dry-run]
//
// By default the rewritten source goes to stdout (one file at a time)
// and any TODO annotations print to stderr so callers can grep them
// out of build logs. `--write` writes back in-place. `--dry-run`
// short-circuits writes for verification.
// =============================================================================

import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { transform, type SourceLibrary } from './index';

const program = new Command();

program
  .name('onegrid-migrate')
  .description('Translate other grids\' column definitions to oneGrid ColumnDef')
  .version('0.0.5');

program
  .command('transform <files...>')
  .description('Rewrite column definitions in the given files')
  .option('--source <library>', 'Source library: ag-grid or tanstack', 'ag-grid')
  .option('--write', 'Write changes in-place (default: print to stdout)')
  .option('--dry-run', 'Show what would change without writing')
  .action(async (
    files: string[],
    opts: { source: string; write?: boolean; dryRun?: boolean },
  ) => {
    const source = opts.source as SourceLibrary;
    if (source !== 'ag-grid' && source !== 'tanstack') {
      // eslint-disable-next-line no-console
      console.error(`Unknown --source: ${opts.source}. Use 'ag-grid' or 'tanstack'.`);
      process.exit(1);
    }

    let totalTodos = 0;
    for (const path of files) {
      const input = await readFile(path, 'utf8');
      const { output, todos } = transform(input, { source });

      if (todos.length > 0) {
        // eslint-disable-next-line no-console
        console.error(`# ${path} — ${String(todos.length)} TODOs`);
        for (const t of todos) {
          // eslint-disable-next-line no-console
          console.error(`  L${String(t.line)}: ${t.message}`);
        }
        totalTodos += todos.length;
      }

      if (opts.dryRun) {
        // eslint-disable-next-line no-console
        console.log(`# ${path} (dry-run) — ${String(input.length)} → ${String(output.length)} chars`);
        continue;
      }

      if (opts.write) {
        if (output !== input) {
          await writeFile(path, output, 'utf8');
          // eslint-disable-next-line no-console
          console.error(`✓ wrote ${path}`);
        }
      } else {
        // eslint-disable-next-line no-console
        console.log(output);
      }
    }

    if (totalTodos > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `\n${String(totalTodos)} TODO${totalTodos === 1 ? '' : 's'} flagged. Review before shipping.`,
      );
    }
  });

program.parseAsync().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
