'use client';
import type {ClientRecord} from '@/lib/clients/input';
export function ClientContact({client}:{client:ClientRecord}){
 const phone=client.phone.replace(/[^+0-9]/g,'');
 return <details className="ac-contact-menu"><summary className="ac-button cursor-pointer">Contact</summary><div className="ac-contact-options">{phone?<><a className="ac-button" href={`tel:${phone}`}>Call · {client.phone}</a><a className="ac-button" href={`sms:${phone}`}>Text · {client.phone}</a></>:<><span aria-disabled="true">Call · No phone number</span><span aria-disabled="true">Text · No phone number</span></>}{client.email?<a className="ac-button" href={`mailto:${encodeURIComponent(client.email)}`}>Email · {client.email}</a>:<span aria-disabled="true">Email · No email address</span>}<p className="text-sm text-stone-600">Opens your calling or messaging app. Review the client’s preferences before contacting them.</p><p className="text-sm">Appointment updates: {[client.preferences?.updatesEmail?'Email':null,client.preferences?.updatesText?'Text':null].filter(Boolean).join(', ')||'No permission recorded'}</p></div></details>;
}
