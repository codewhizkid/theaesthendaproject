'use client';

import {useActionState, useState} from 'react';
import type {BookingPreviewService} from '@/lib/appointments/booking-preview-catalog';
import {
  BOOKING_COLOR_FIELDS, BOOKING_THEME_PRESETS,
  bookingThemeContrastIssue, bookingThemeCssVariables, normalizeHex,
  type BookingThemeState,
} from '@/lib/booking-theme/input';
import {saveBookingPageDesign} from '@/app/settings/booking-page/actions';
import {BookingPreview} from './booking-preview';
import {BookingPageHeader} from './booking-page-header';
import '@/app/booking-preview/booking-preview.css';
import './booking-theme.css';
import styles from './booking-theme-editor.module.css';

type Props = {
  design: BookingThemeState;
  salonName: string;
  professionalName: string;
  services: BookingPreviewService[];
};

export function BookingThemeEditor({design, salonName, professionalName, services}: Props) {
  const [draft, setDraft] = useState(design.theme);
  const [viewport, setViewport] = useState<'desktop' | 'phone'>('desktop');
  const [result, save, pending] = useActionState(saveBookingPageDesign, {message: ''});

  const preview = {...draft};
  let invalidHex = false;
  for (const {key} of BOOKING_COLOR_FIELDS) {
    const color = normalizeHex(draft[key]);
    preview[key] = color ?? design.theme[key];
    if (!color) invalidHex = true;
  }
  const issue = invalidHex ? 'Enter a hex color like #705C76 for each field.' : bookingThemeContrastIssue(preview);
  const changed = invalidHex || draft.fontFamily !== design.theme.fontFamily ||
    BOOKING_COLOR_FIELDS.some(({key}) => preview[key] !== design.theme[key]);
  const applyTheme = changed || design.revision > 0;

  return (
    <div className={styles.editor}>
      <form action={save} className="aw-panel">
        <input type="hidden" name="revision" value={design.revision}/>
        <fieldset disabled={pending} className={`aw-panel-body ${styles.controls}`}>
          <legend className="sr-only">Booking page appearance</legend>
          <section aria-labelledby="booking-palettes">
            <h2 id="booking-palettes">Palettes</h2>
            <div className={styles.palettes}>
              {BOOKING_THEME_PRESETS.map(({name, theme}) => {
                const selected = !invalidHex && theme.fontFamily === draft.fontFamily &&
                  BOOKING_COLOR_FIELDS.every(({key}) => preview[key] === theme[key]);
                return (
                  <button key={name} type="button" aria-pressed={selected} onClick={() => setDraft(theme)}>
                    <span className={styles.swatches} aria-hidden="true">
                      {(['background', 'schedulerBackground', 'headerText', 'accentColor'] as const).map(key => (
                        <span key={key} style={{backgroundColor: theme[key]}}/>
                      ))}
                    </span>
                    {name}
                  </button>
                );
              })}
            </div>
          </section>
          <section aria-labelledby="booking-colors">
            <h2 id="booking-colors">Colors</h2>
            <div className={styles.colors}>
              {BOOKING_COLOR_FIELDS.map(({key, label}) => (
                <div className={styles.colorRow} key={key}>
                  <label htmlFor={`booking-color-${key}`}>{label}</label>
                  <div className={styles.colorControls}>
                    <input type="color" aria-label={`Pick ${label.toLowerCase()} color`}
                      value={preview[key].toLowerCase()}
                      onChange={event => setDraft({...draft, [key]: event.target.value.toUpperCase()})}/>
                    <input id={`booking-color-${key}`} name={key} type="text" value={draft[key]}
                      maxLength={7} spellCheck={false} autoComplete="off" autoCapitalize="characters"
                      aria-invalid={!normalizeHex(draft[key])}
                      onChange={event => setDraft({...draft, [key]: event.target.value})}/>
                  </div>
                </div>
              ))}
            </div>
            <p className={styles.note}>Button labels switch between black and white for readability.</p>
          </section>
          <label className={styles.font}>Font
            <select name="fontFamily" value={draft.fontFamily}
              onChange={event => setDraft({...draft, fontFamily: event.target.value === 'serif' ? 'serif' : 'sans'})}>
              <option value="sans">Aesthenda Sans</option>
              <option value="serif">Editorial Serif</option>
            </select>
          </label>
          {issue && <p className={styles.issue} role="status">{issue}</p>}
          <div className={styles.actions}>
            <button className="aw-secondary" type="button" disabled={!changed}
              onClick={() => setDraft(design.theme)}>Undo edits</button>
            <button className="aw-primary" type="submit" disabled={!!issue || !changed}>
              {pending ? 'Saving…' : 'Save design'}
            </button>
          </div>
          <p className={result.failed ? styles.issue : styles.note} role="status" hidden={!result.message}>
            {result.message}
          </p>
        </fieldset>
      </form>
      <section className={styles.preview} aria-labelledby="design-preview-heading">
        <header className={styles.previewHeader}>
          <div>
            <h2 id="design-preview-heading">Live preview</h2>
            <p className={styles.note}>Private preview with your salon’s services.</p>
          </div>
          <div className={styles.viewOptions} role="group" aria-label="Preview width">
            <button type="button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>Desktop</button>
            <button type="button" aria-pressed={viewport === 'phone'} onClick={() => setViewport('phone')}>Phone</button>
          </div>
        </header>
        <div className={styles.previewFrame} data-viewport={viewport}>
          <div className={`bp-page ${styles.previewPage}${applyTheme ? ' bp-themed' : ''}`}
            style={applyTheme ? bookingThemeCssVariables(preview) : undefined}>
            <BookingPageHeader salonName={salonName}/>
            <div className="bp-main">
              <BookingPreview salonName={salonName} professionalName={professionalName}
                services={services} initialDate="" timezone={null} appearanceOnly/>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
