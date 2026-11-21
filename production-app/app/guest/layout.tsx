import type {Metadata} from 'next';
import '@/app/booking-preview/booking-preview.css';
export const metadata:Metadata={title:'Guest booking | Aesthenda',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function GuestLayout({children}:{children:React.ReactNode}){return <div className="bp-page"><header className="bp-header"><p className="bp-salon">aesthenda</p><span>Guest booking</span></header><main className="bp-main">{children}</main></div>;}
