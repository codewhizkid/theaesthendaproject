'use client';

import {useActionState} from 'react';
import {changeWorkspaceMatch} from '@/app/settings/booking-page/actions';
import styles from './booking-theme-editor.module.css';

export function WorkspaceMatchToggle({matches}: {matches: boolean}) {
  const [result, action, pending] = useActionState(changeWorkspaceMatch, {message: ''});

  return (
    <section className="aw-panel">
      <form action={action} className={`aw-panel-body ${styles.matchSetting}`}>
        <div>
          <label htmlFor="match-workspace">Match my workspace</label>
          <p id="match-workspace-help">Use your saved booking colors across your dashboard, calendar, and salon tools.</p>
          <p role="status" className={result.failed ? styles.issue : undefined} hidden={!result.message}>
            {result.message}
          </p>
        </div>
        <button id="match-workspace" className={styles.matchSwitch} type="submit" role="switch"
          aria-checked={matches} aria-describedby="match-workspace-help"
          name="match" value={matches ? 'off' : 'on'} disabled={pending}>
          <span className={styles.switchTrack} aria-hidden="true"/>
          <span aria-hidden="true">{pending ? 'Saving…' : matches ? 'On' : 'Off'}</span>
        </button>
      </form>
    </section>
  );
}
