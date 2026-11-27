export type BookingTheme = {
  background: string;
  schedulerBackground: string;
  headerText: string;
  schedulerText: string;
  accentColor: string;
  fontFamily: 'sans' | 'serif';
};
export type BookingThemeState = { theme: BookingTheme; revision: number };
export const DEFAULT_BOOKING_THEME: BookingTheme = {
  "background": "#F7F3ED",
  "schedulerBackground": "#FFFFFF",
  "headerText": "#382B3C",
  "schedulerText": "#514B52",
  "accentColor": "#78617E",
  "fontFamily": "sans"
};
export const BOOKING_THEME_PRESETS: {name:string;theme:BookingTheme}[] = [
  {
    "name": "Studio neutral",
    "theme": {
      "background": "#F7F3ED",
      "schedulerBackground": "#FFFFFF",
      "headerText": "#382B3C",
      "schedulerText": "#514B52",
      "accentColor": "#78617E",
      "fontFamily": "sans"
    }
  },
  {
    "name": "Olive & oat",
    "theme": {
      "background": "#F3F1E9",
      "schedulerBackground": "#FEFDF9",
      "headerText": "#403F32",
      "schedulerText": "#575447",
      "accentColor": "#77724C",
      "fontFamily": "sans"
    }
  },
  {
    "name": "Soft blush",
    "theme": {
      "background": "#FBF3F1",
      "schedulerBackground": "#FFFCFB",
      "headerText": "#48383C",
      "schedulerText": "#5D4D51",
      "accentColor": "#B66F7C",
      "fontFamily": "serif"
    }
  },
  {
    "name": "Color pop",
    "theme": {
      "background": "#F5F1F8",
      "schedulerBackground": "#FFFFFF",
      "headerText": "#302642",
      "schedulerText": "#4F475C",
      "accentColor": "#7651D6",
      "fontFamily": "sans"
    }
  }
];
const COLOR_KEYS = ['background','schedulerBackground','headerText','schedulerText','accentColor'] as const;
export function parseBookingTheme(value: unknown): BookingTheme {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a supported color theme.');
  const source = value as Record<string, unknown>;
  const theme = {} as BookingTheme;
  for (const key of COLOR_KEYS) {
    const color = source[key];
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid six-digit hex color for each setting.');
    theme[key] = color.toUpperCase();
  }
  if (source.fontFamily !== 'sans' && source.fontFamily !== 'serif') throw new Error('Choose a supported font.');
  theme.fontFamily = source.fontFamily;
  return theme;
}
export function bookingThemeCssVariables(theme: BookingTheme): Record<string, string> {
  return {
    '--bp-background': theme.background,
    '--bp-scheduler-background': theme.schedulerBackground,
    '--bp-header-text': theme.headerText,
    '--bp-scheduler-text': theme.schedulerText,
    '--bp-accent-color': theme.accentColor,
    '--bp-font-family': theme.fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif' : 'var(--font-geist-sans), Arial, sans-serif',
  };
}
