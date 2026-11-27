import {GuestTermsForm} from '@/components/booking-preview/guest-checkout';
import {WorkspacePage, WorkspacePanel} from '@/components/layout/workspace-page';
import '@/app/booking-preview/booking-preview.css';

export default function GuestSettings() {
  return (
    <WorkspacePage title="Guest booking terms" description="Set the terms guests accept when booking."
      backHref="/settings" backLabel="Booking & notifications" narrow>
      <WorkspacePanel><GuestTermsForm/></WorkspacePanel>
    </WorkspacePage>
  );
}
