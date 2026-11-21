export type SetupInput = { actionVersion: 1; requestKey: string; businessName: string; professionalName: string };
export function parseSetupInput(form: FormData): SetupInput {
  const businessName = String(form.get('businessName') ?? '').trim();
  const professionalName = String(form.get('professionalName') ?? '').trim();
  const requestKey = String(form.get('requestKey') ?? '');
  if (form.get('actionVersion') !== '1') throw new Error('Refresh this page before trying again.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)) throw new Error('Refresh this page before trying again.');
  if (!businessName || businessName.length > 160) throw new Error('Enter a business name of up to 160 characters.');
  if (!professionalName || professionalName.length > 160) throw new Error('Enter your full name, up to 160 characters.');
  return { actionVersion: 1, requestKey, businessName, professionalName };
}
export type BusinessSetup = { businessAccountId: string; businessName: string; professionalName: string; businessStatus: string; professionalStatus: string };
