import Link from 'next/link';
import {redirect} from 'next/navigation';
import {clientPasswordFlowCookie} from '@/lib/client-access/session';
import {cookies} from 'next/headers';
import {requireClientIdentity} from '@/lib/client-access/auth';
import {readClientConnectionPrompt,readClientProfiles} from '@/lib/client-access/persistence';
import {clientInviteCookieName,isInviteToken} from '@/lib/client-access/identity';
import {ClientProfileForm} from '@/components/booking-preview/client-profile-form';
import {ClientSignOutButton} from '@/components/booking-preview/client-sign-out-button';
export default async function ClientHome(){
 const identity=await requireClientIdentity();const store=await cookies();if(store.get(clientPasswordFlowCookie)?.value==='1')redirect('/client/password');const hash=store.get(clientInviteCookieName)?.value;
 const [profiles,invitation]=await Promise.all([readClientProfiles(identity.id),isInviteToken(hash)?readClientConnectionPrompt(identity.id,hash):Promise.resolve(null)]);
 return <><p className="bp-eyebrow">Signed in securely</p><h1 className="ca-title">Your salon connections.</h1><p className="bp-intro">{identity.email||identity.phone}</p>{invitation&&<section className="bp-review-card"><h2>{invitation.businessName}</h2><p>We’ll use your verified contact to find your profile at this salon. If there’s no match, we’ll create one when you continue.</p><ClientProfileForm/></section>}{profiles.map(profile=><section className="bp-review-card" key={profile.id}><h2>{profile.businessName}</h2><p>Welcome, {profile.firstName}.</p><p className="bp-contact-note">Your salon profile is connected. Appointment booking and management will appear here as they become available.</p></section>)}{!profiles.length&&!invitation&&<div className="bp-empty"><h2>Connect with your salon</h2><p>Open your salon’s sign-in test link to connect an existing profile or create your first one.</p></div>}{!invitation&&profiles.length>0&&<Link href="/dashboard" className="bp-primary ca-workspace-link" prefetch={false}>Go to salon dashboard</Link>}{!invitation&&<p><Link href="/client/password" className="bp-back">Create or change your password</Link></p>}<ClientSignOutButton/></>;
}
