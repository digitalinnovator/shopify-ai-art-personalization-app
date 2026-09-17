// Maps zod issue paths (e.g. `slots.0.model`) onto the form field names the editors submit, so
// validation errors land next to the input that caused them. Pure: takes plain issue objects,
// never imports zod, so it is safe to import from component code.

export type FieldErrors = Record<string, string>;

export interface IssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

export function fieldErrorsFromIssues(
  issues: ReadonlyArray<IssueLike>,
  toField: (path: string) => string,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = toField(issue.path.map(String).join('.'));
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

const SLOT_PREFIX: Record<string, string> = { '0': 'slotA', '1': 'slotB' };

/** Design config paths → design editor field names (see routes/designs.detail.tsx `buildConfig`). */
export function designFieldName(path: string): string {
  const [head, second, third] = path.split('.');
  switch (head) {
    case 'prompt':
    case 'preserve':
    case 'avoid':
      return head;
    case 'referenceImages':
      return second === 'scene' ? 'sceneKey' : 'styleKeys';
    case 'exampleImages':
      return 'exampleKeys';
    case 'slots': {
      if (second === undefined) return 'slots';
      const prefix = SLOT_PREFIX[second] ?? 'slots';
      return third ? `${prefix}_${third}` : prefix;
    }
    case 'output':
      return second ? `output_${second}` : 'output';
    case 'limits':
      return second ? `limits_${second}` : 'limits';
    case 'uploadRules':
      if (second === 'maxBytes') return 'uploadRules_maxMb';
      if (second === 'formats') return 'uploadRules_formats';
      return second ? `uploadRules_${second}` : 'uploadRules';
    default:
      return head ?? 'form';
  }
}

/** Shop settings paths → settings form field names. */
export function settingsFieldName(path: string): string {
  const [head, second] = path.split('.');
  if (head === 'watermark') return second === 'opacity' ? 'watermarkOpacity' : 'watermarkText';
  return head ?? 'form';
}
