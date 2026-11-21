import type {Metadata} from 'next';
import '@/app/booking-preview/booking-preview.css';
export const metadata:Metadata={title:'Your salon profile | Aesthenda',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default function ClientLayout({children}:{children:React.ReactNode}){return <div className="bp-page min-h-screen"><header className="bp-header"><div><p className="bp-salon">aesthenda</p><span className="bp-powered">Your salon, close at hand</span></div></header><main className="bp-main"><div className="ca-content">{children}</div></main></div>;}
