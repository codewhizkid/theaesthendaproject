import type {CSSProperties} from 'react';

export const BOOKING_COLOR_FIELDS = [
  {key: 'background', label: 'Page background'},
  {key: 'schedulerBackground', label: 'Booking cards'},
  {key: 'headerText', label: 'Header text'},
  {key: 'schedulerText', label: 'Booking text'},
  {key: 'accentColor', label: 'Buttons and accents'},
] as const;

type ColorKey = (typeof BOOKING_COLOR_FIELDS)[number]['key'];
export const BOOKING_FONT_CHOICES = [
  {value: 'sans', label: 'Aesthenda Sans'},
  {value: 'manrope', label: 'Soft Modern Sans'},
  {value: 'serif', label: 'Editorial Serif'},
  {value: 'lora', label: 'Warm Editorial Serif'},
] as const;
export type BookingFont = (typeof BOOKING_FONT_CHOICES)[number]['value'];
export type BookingTheme = Record<ColorKey, string> & {fontFamily: BookingFont};
export type BookingThemeState = {theme: BookingTheme; revision: number; workspaceMatchesBooking: boolean};

export const DEFAULT_BOOKING_THEME: BookingTheme = {
  background: '#FAF8F6',
  schedulerBackground: '#FFFFFF',
  headerText: '#3F3142',
  schedulerText: '#3F3142',
  accentColor: '#705C76',
  fontFamily: 'sans',
};

export const BOOKING_THEME_PRESETS: {name: string; theme: BookingTheme}[] = [
  {name: 'Studio neutral', theme: DEFAULT_BOOKING_THEME},
  {name: 'Olive & oat', theme: {
    background: '#EEEAE0', schedulerBackground: '#FFFCF5', headerText: '#302D22',
    schedulerText: '#403C30', accentColor: '#6B6346', fontFamily: 'sans',
  }},
  {name: 'Soft blush', theme: {
    background: '#F8EFEB', schedulerBackground: '#FFFCFA', headerText: '#48383C',
    schedulerText: '#534549', accentColor: '#E7A4AE', fontFamily: 'serif',
  }},
  {name: 'Color pop', theme: {
    background: '#F5F1F8', schedulerBackground: '#FFFFFF', headerText: '#302642',
    schedulerText: '#4F475C', accentColor: '#6940D5', fontFamily: 'sans',
  }},
];

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(start => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function bookingThemeContrastIssue(theme: BookingTheme) {
  if (contrast(theme.headerText, theme.background) < 4.5) {
    return 'Choose a header text color with more contrast against the page background.';
  }
  if (contrast(theme.schedulerText, theme.background) < 4.5 ||
      contrast(theme.schedulerText, theme.schedulerBackground) < 4.5) {
    return 'Choose a booking text color that is readable on both the page and the cards.';
  }
  return null;
}

export function parseBookingTheme(value: unknown): BookingTheme {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Choose a valid booking page design.');
  }
  const source = value as Record<string, unknown>;
  const fontChoice = BOOKING_FONT_CHOICES.find(({value}) => value === source.fontFamily);
  if (!fontChoice) throw new Error('Choose a supported font.');
  const theme: BookingTheme = {...DEFAULT_BOOKING_THEME, fontFamily: fontChoice.value};
  for (const {key, label} of BOOKING_COLOR_FIELDS) {
    const color = normalizeHex(source[key]);
    if (!color) throw new Error(`Enter a six digit hex color for ${label.toLowerCase()}.`);
    theme[key] = color;
  }
  const issue = bookingThemeContrastIssue(theme);
  if (issue) throw new Error(issue);
  return theme;
}

export function contrastingForeground(background: string) {
  return contrast(background, '#000000') >= contrast(background, '#FFFFFF')
    ? '#000000'
    : '#FFFFFF';
}

export function themeAccentColors(theme: BookingTheme) {
  const buttonText = contrastingForeground(theme.accentColor);
  const accentText = Math.min(contrast(theme.accentColor, theme.background),
    contrast(theme.accentColor, theme.schedulerBackground)) >= 4.5 ? theme.accentColor : theme.schedulerText;
  return {accentText, buttonText};
}

export function bookingThemeCssVariables(theme: BookingTheme): CSSProperties {
  const {accentText, buttonText} = themeAccentColors(theme);
  return {
    '--booking-page-bg': theme.background,
    '--booking-card-bg': theme.schedulerBackground,
    '--booking-header-ink': theme.headerText,
    '--booking-ink': theme.schedulerText,
    '--booking-accent': theme.accentColor,
    '--booking-accent-ink': accentText,
    '--booking-button-ink': buttonText,
    '--booking-font': {
      sans: 'var(--font-geist-sans), Arial, sans-serif',
      manrope: 'var(--font-manrope), var(--font-geist-sans), Arial, sans-serif',
      serif: 'Georgia, "Times New Roman", serif',
      lora: 'var(--font-lora), Georgia, "Times New Roman", serif',
    }[theme.fontFamily],
  } as CSSProperties & Record<`--${string}`, string>;
}
