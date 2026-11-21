import {clientPasswordFlowCookie} from '@/lib/client-access/session';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {createClientAuthForRequest} from '@/lib/client-access/auth';
import {isClientSigninEnabled} from '@/lib/client-access/persistence';
import {verifiedClientIdentity} from '@/lib/client-access/identity';
function destination(path:string){return new NextResponse(null,{status:303,headers:{Location:path,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get('code');
 if(code&&code.length<4096&&!url.searchParams.has('error'))try{if(!await isClientSigninEnabled())return destination('/client/sign-in?error=setup');const auth=await createClientAuthForRequest();const {data,error}=await auth.auth.exchangeCodeForSession(code);if(!error&&data.session){const verified=await auth.auth.getUser();if(!verified.error&&verified.data.user?.id===data.session.user.id&&verifiedClientIdentity(verified.data.user))return destination((await cookies()).get(clientPasswordFlowCookie)?.value==='1'?'/client/password':(await cookies()).get('ae-booking-return')?.value==='1'?'/client/booking':'/client');}}catch{}
 return destination('/client/sign-in?error=link');
}
