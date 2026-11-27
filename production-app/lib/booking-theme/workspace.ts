import type {CSSProperties} from 'react';
import {contrastingForeground, themeAccentColors, type BookingThemeState} from './input';

export function workspaceAppearance(design: BookingThemeState | null) {
  if (!design?.workspaceMatchesBooking) return {className: '', style: undefined};

  const {theme} = design;
  const {accentText, buttonText} = themeAccentColors(theme);
  const style = {
    '--workspace-page': theme.background,
    '--workspace-panel': theme.schedulerBackground,
    '--workspace-heading': theme.headerText,
    '--workspace-ink': theme.schedulerText,
    '--workspace-accent': theme.accentColor,
    '--workspace-accent-text': accentText,
    '--workspace-on-accent': buttonText,
    '--workspace-control-scheme': contrastingForeground(theme.schedulerBackground) === '#FFFFFF' ? 'dark' : 'light',
  } satisfies Record<`--${string}`, string>;

  return {className: ' workspace-matched', style: style as CSSProperties};
}
