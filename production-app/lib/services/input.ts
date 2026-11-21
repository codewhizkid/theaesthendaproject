export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type ServiceStep={label:string;kind:'active'|'processing';durationMinutes:number;released:boolean};
export type ServiceInput = {serviceType:string; requestKey: string; id:string|null;revision:number;steps:ServiceStep[]; name: string; description: string; durationMinutes: number; priceCents: number };
export type Service = {serviceType:string; id: string; name: string; description: string; durationMinutes: number; priceCents: number; currency: 'USD'; status: 'draft' | 'archived';revision:number;steps:ServiceStep[] };
export function parseService(form: FormData): ServiceInput {
  const serviceType=String(form.get('serviceType')??'').trim();if(!serviceType||serviceType.length>80)throw new Error('Enter a service type, such as Cuts or Color (up to 80 characters).');
  const requestKey=String(form.get('requestKey')??'');
  const name=String(form.get('name')??'').trim();
  const description=String(form.get('description')??'').trim();
  let duration=String(form.get('durationMinutes')??'');
  const id=String(form.get('serviceId')??'');const revision=Number(form.get('revision')??0);
  if((id&&!isUuid(id))||!Number.isSafeInteger(revision)||revision<0||revision>2147483646||(id?revision<1:revision!==0))throw new Error('Refresh the service before saving.');
  let steps:ServiceStep[];
  const raw=String(form.get('steps')??'');
  if(raw){try{steps=JSON.parse(raw);}catch{throw new Error('Check the service steps.');}
   if(!Array.isArray(steps)||steps.length<1||steps.length>20||steps.some(step=>!step||typeof step.label!=='string'||!step.label.trim()||step.label.trim().length>80||!['active','processing'].includes(step.kind)||!Number.isInteger(step.durationMinutes)||step.durationMinutes<1||step.durationMinutes>1440||typeof step.released!=='boolean'||(step.kind==='active'&&step.released)))throw new Error('Give every step a name and a positive whole-minute duration. Only processing can release your time.');
   steps=steps.map(step=>({label:step.label.trim(),kind:step.kind,durationMinutes:step.durationMinutes,released:step.released}));duration=String(steps.reduce((total,step)=>total+step.durationMinutes,0));
  }else steps=[{label:'Service',kind:'active',durationMinutes:Number(duration),released:false}];
  const price=String(form.get('price')??'');
  if(form.get('actionVersion')!=='1' || !isUuid(requestKey)) throw new Error('Refresh this page before trying again.');
  if(!name || name.length>160 || description.length>2000) throw new Error('Enter a name up to 160 characters and a description up to 2,000 characters.');
  if(!/^\d+$/.test(duration) || Number(duration)<1 || Number(duration)>1440) throw new Error('Enter a whole duration from 1 to 1,440 minutes.');
  if(!/^\d{1,6}(\.\d{1,2})?$/.test(price)) throw new Error('Enter a USD price from 0 to 999,999.99 with at most two decimal places.');
  const [dollars,cents='']=price.split('.');
  return {serviceType,id:id||null,revision,steps,requestKey,name,description,durationMinutes:Number(duration),priceCents:Number(dollars)*100+Number(cents.padEnd(2,'0'))};
}
