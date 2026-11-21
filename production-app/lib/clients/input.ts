export const isUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type CommunicationPreferences={updatesEmail:boolean;updatesText:boolean;marketingEmail:boolean;marketingText:boolean;preferredContact:'none'|'email'|'phone'|'text'};
export const emptyPreferences:CommunicationPreferences={updatesEmail:false,updatesText:false,marketingEmail:false,marketingText:false,preferredContact:'none'};
export type ClientRecord={status:string;id:string;firstName:string;lastName:string;email:string;phone:string;notes:string;revision:number;preferences:CommunicationPreferences;preferencesRecordedAt:string|null;preferencesMethod:string|null};
export type ClientInput=Omit<ClientRecord,'id'|'preferencesRecordedAt'|'preferencesMethod'|'status'> & {id:string|null;requestKey:string;consentMethod:string};
export function clientEmailError(email:string){return email.length>254||(email!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))?'Enter a valid email address.':'';}
export function clientPhoneError(phone:string){const digits=phone.replace(/\D/g,'');return phone.length>40||(phone!==''&&(!/^[+0-9 ().-]+$/.test(phone)||digits.length<7||digits.length>20))?'Enter a phone number with 7–20 digits.':'';}
export function parseClient(form:FormData):ClientInput {
 const text=(name:string)=>String(form.get(name)??'').trim();
 const requestKey=text('requestKey'),id=text('clientId'),revision=text('revision');
 if(form.get('actionVersion')!=='1'||!isUuid(requestKey)|| (id!==''&&!isUuid(id)) || !/^\d+$/.test(revision)||!Number.isSafeInteger(Number(revision))||Number(revision)>2147483646||(!id&&Number(revision)!==0)||(!!id&&Number(revision)<1)) throw new Error('Refresh this page before saving.');
 const firstName=text('firstName'),lastName=text('lastName'),email=text('email'),phone=text('phone'),notes=text('notes');
 if(!firstName||firstName.length>80||lastName.length>80)throw new Error('Enter a first name and keep each name within 80 characters.');
 const emailError=clientEmailError(email),phoneError=clientPhoneError(phone);
 if(emailError)throw new Error(emailError);if(phoneError)throw new Error(phoneError);
 if(!email&&!phone)throw new Error('Add a phone number or email so you can contact this client.');
 if(notes.length>2000)throw new Error('Keep notes within 2,000 characters.');
 const preferences={updatesEmail:form.get('updatesEmail')==='on',updatesText:form.get('updatesText')==='on',marketingEmail:form.get('marketingEmail')==='on',marketingText:form.get('marketingText')==='on',preferredContact:text('preferredContact')||'none'};
 if(!['none','email','phone','text'].includes(preferences.preferredContact))throw new Error('Choose a contact preference.');
 if((!email&&(preferences.updatesEmail||preferences.marketingEmail||preferences.preferredContact==='email'))||(!phone&&(preferences.updatesText||preferences.marketingText||['phone','text'].includes(preferences.preferredContact))))throw new Error('Add contact details for the selected communication methods.');
 const consentMethod=text('consentMethod')||'not_given';
 if(!['not_given','verbal','written'].includes(consentMethod))throw new Error('Choose how the client gave permission.');
 return {preferences:preferences as CommunicationPreferences,consentMethod,id:id||null,requestKey,revision:Number(revision),firstName,lastName,email,phone,notes};
}
