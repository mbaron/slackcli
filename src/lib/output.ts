import { zodToJsonSchema } from 'zod-to-json-schema';
import ora, { Ora } from 'ora';
import { runJq } from './jq.ts';

export type OutputFormat = 'json' | 'pretty' | 'schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodSchema = any;

/**
 * Output data in the specified format
 */
export function output<T>(
  data: T,
  schema: AnyZodSchema,
  format: OutputFormat,
  prettyFormatter: (data: T) => string,
  jqExpr?: string
): void {
  switch (format) {
    case 'json':
      if (jqExpr) {
        // Apply jq filter to JSON data
        try {
          const filtered = runJq(data, jqExpr);
          // Output without extra formatting since jq already formats
          console.log(filtered.trim());
        } catch (err: any) {
          console.error(err.message);
          process.exit(1);
        }
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
      break;
    case 'schema':
      console.log(JSON.stringify(zodToJsonSchema(schema), null, 2));
      break;
    case 'pretty':
      if (jqExpr) {
        console.error('Error: --jq can only be used with --format=json (the default format)');
        process.exit(1);
      }
      console.log(prettyFormatter(data));
      break;
  }
}

/**
 * Output schema only (for --format=schema before data is fetched)
 */
export function outputSchema(schema: AnyZodSchema): void {
  console.log(JSON.stringify(zodToJsonSchema(schema), null, 2));
}

/**
 * Create a spinner that only shows in pretty mode
 */
export function createSpinner(text: string, format: OutputFormat): Ora | null {
  if (format === 'pretty') {
    return ora(text).start();
  }
  return null;
}

/**
 * Update spinner text (safe for null spinner)
 */
export function updateSpinner(spinner: Ora | null, text: string): void {
  if (spinner) {
    spinner.text = text;
  }
}

/**
 * Stop spinner with success (safe for null spinner)
 */
export function succeedSpinner(spinner: Ora | null, text?: string): void {
  if (spinner) {
    spinner.succeed(text);
  }
}

/**
 * Stop spinner with failure (safe for null spinner)
 */
export function failSpinner(spinner: Ora | null, text?: string): void {
  if (spinner) {
    spinner.fail(text);
  }
}

/**
 * Add --format option to a command
 */
export function addFormatOption(command: any): any {
  return command.option(
    '--format <type>',
    'Output format: json (default), pretty (human-readable), schema (JSON Schema)',
    'json'
  );
}

/**
 * Add --jq option to a command
 */
export function addJqOption(command: any): any {
  return command.option(
    '--jq <expression>',
    'Filter JSON output using jq syntax (requires jq to be installed)'
  );
}

/**
 * Add both --format and --jq options to a command (convenience method)
 */
export function addOutputOptions(command: any): any {
  addFormatOption(command);
  addJqOption(command);
  return command;
}

/**
 * Validate format option value
 */
export function validateFormat(format: string): OutputFormat {
  if (format === 'json' || format === 'pretty' || format === 'schema') {
    return format;
  }
  throw new Error(`Invalid format "${format}". Valid options: json, pretty, schema`);
}
