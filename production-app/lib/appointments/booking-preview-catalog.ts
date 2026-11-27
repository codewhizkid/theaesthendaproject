import 'server-only';
import {readServices} from '@/lib/services/persistence';

export async function readBookingPreviewCatalog(actor: string) {
  const services = await readServices(actor);
  // Keep private steps, release flags, and revisions on the server.
  return services.filter(service => service.status === 'draft').map(
    ({id, name, description, serviceType, durationMinutes, priceCents, currency}) => ({
      id, name, description, category: serviceType || 'Services', durationMinutes, priceCents, currency,
    }),
  );
}

export type BookingPreviewService = Awaited<ReturnType<typeof readBookingPreviewCatalog>>[number];
