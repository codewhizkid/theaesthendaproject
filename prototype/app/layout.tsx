import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Aesthenda · Your studio',description:'A private working prototype for the independent beauty and wellness professional.',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
