export const STEP_DESCRIPTION_PROMPT = `You are describing steps in a browser workflow guide. Given the following context about a user action on a web page, write a single concise sentence describing this step.

{{context}}

Examples of good descriptions:
- "Click the Submit button"
- "Enter email address in the Email field"
- "Select 'Admin' from the Role dropdown"
- "Navigate to the Settings page"

Write only the description, no preamble.`;

export const GUIDE_TITLE_PROMPT = `These are the steps of a browser workflow, with the page URL and description for each step:

{{steps}}

Write a specific, descriptive title for this workflow. The title should mention the application or website name and the specific task being performed. Be precise — reference specific pages, features, or items that were interacted with.

IMPORTANT: The title MUST be under 60 characters. Keep it concise.

Examples:
- "Review claude-code Pull Requests"
- "Configure Slack Notification Preferences"
- "Submit Expense Report in Workday"
- "Create Repository in GitHub Organization"

Just the title, no quotes, no preamble. Under 60 characters.`;

export const AI_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
] as const;

export type AILanguageCode = (typeof AI_LANGUAGES)[number]['code'];

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  pt: 'Brazilian Portuguese',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

export function getLanguageSuffix(locale: string): string {
  if (locale.startsWith('en')) return '';
  const lang = LANGUAGE_NAMES[locale.split('-')[0]] || locale;
  return `\nIMPORTANT: Write the description in ${lang}.`;
}
