import Link from 'next/link';
import {cookies} from 'next/headers';
import {requireClientIdentity} from '@/lib/client-access/auth';
import {ClientPasswordForm} from '@/components/booking-preview/client-password-form';
export default async function ClientPasswordPage(){await requireClientIdentity();const destination=(await cookies()).get('ae-booking-return')?.value==='1'?'/client/booking':'/client';return <><h1 className="ca-title">Create or change your password.</h1><p>After verifying your email, use a password to sign in on any device. A new device does not need another email approval.</p><p className="bp-contact-note">If you use this same email for salon and client access, this password applies to that Aesthenda account. The two sign-in sessions stay separate.</p><ClientPasswordForm destination={destination}/><p><Link href={destination}>Continue without changing password</Link></p></>;}
