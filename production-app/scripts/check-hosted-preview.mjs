import {pathToFileURL} from 'node:url';
export function hostedPreviewErrors(env){
 if(env.RENDER!=='true'&&env.VERCEL!=='1'&&env.AESTHENDA_HOSTED_PREVIEW!=='1')return [];
 const errors=[];
 if(env.AESTHENDA_HOSTED_PREVIEW!=='1'||env.AESTHENDA_STAGING!=='1')errors.push('Explicit hosted staging preview mode is required.');
 try{const u=new URL(env.NEXT_PUBLIC_SUPABASE_URL);if(u.origin!=='https://srwjgtvmlrkdqtxetjuu.supabase.co')throw Error();}catch{errors.push('The preview must use the approved staging Supabase project.');}
 try{const u=new URL(env.AESTHENDA_PUBLIC_ORIGIN);if(u.protocol!=='https:'||['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error();}catch{errors.push('Set an explicit HTTPS preview origin.');}
 for(const key of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','AESTHENDA_DATABASE_URL','AESTHENDA_DATABASE_CA','AESTHENDA_GUEST_TOKEN_KEY','RESEND_API_KEY','AESTHENDA_GUEST_EMAIL_FROM'])if(!env[key]?.trim())errors.push(`Missing ${key}.`);
 if(env.AESTHENDA_DATABASE_URL)try{const u=new URL(env.AESTHENDA_DATABASE_URL);if(!['postgres:','postgresql:'].includes(u.protocol)||!/^aesthenda_runtime(?:\.srwjgtvmlrkdqtxetjuu)?$/.test(decodeURIComponent(u.username))||!u.hostname.endsWith('.supabase.com'))throw Error();}catch{errors.push('Use the restricted staging database connection.');}
 if(env.AESTHENDA_GUEST_TOKEN_KEY&&!/^[a-f0-9]{64}$/.test(env.AESTHENDA_GUEST_TOKEN_KEY))errors.push('Invalid guest token-key format.');
 if(env.AESTHENDA_DATABASE_CA&&!env.AESTHENDA_DATABASE_CA.startsWith('-----BEGIN CERTIFICATE-----'))errors.push('Invalid database CA format.');
 if(env.RENDER==='true'&&!/^[a-f0-9]{64}$/.test(env.AESTHENDA_PREVIEW_ACCESS_KEY??''))errors.push('Configure a strong private preview access key.');
 return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const errors=hostedPreviewErrors(process.env);if(errors.length){console.error('Hosted preview configuration is incomplete:\n'+errors.join('\n'));process.exitCode=1;}}
