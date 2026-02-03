import { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import ora, { Ora } from 'ora';

export type OutputFormat = 'json' | 'pretty' | 'schema';

/**
 * Output data in the specified format
 */
export function output<T>(
  data: T,
  schema: ZodSchema<T>,
  format: OutputFormat,
  prettyFormatter: (data: T) => string
): void {
  switch (format) {
    case 'json':
      console.log(JSON.stringify(data, null, 2));
      break;
    case 'schema':
      console.log(JSON.stringify(zodToJsonSchema(schema), null, 2));
      break;
    case 'pretty':
      console.log(prettyFormatter(data));
      break;
  }
}

/**
 * Output schema only (for --format=schema before data is fetched)
 */
export function outputSchema<T>(schema: ZodSchema<T>): void {
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
 * Validate format option value
 */
export function validateFormat(format: string): OutputFormat {
  if (format === 'json' || format === 'pretty' || format === 'schema') {
    return format;
  }
  throw new Error(`Invalid format "${format}". Valid options: json, pretty, schema`);
}
