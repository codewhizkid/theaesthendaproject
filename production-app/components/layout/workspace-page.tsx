import Link from 'next/link';
import type {ReactNode} from 'react';
import {requireUser} from '@/lib/supabase/require-user';
import {readBusinessSetup} from '@/lib/business/persistence';
import {WorkspaceSidebar} from './workspace-sidebar';

export async function WorkspacePage({title,description,businessName,backHref='/dashboard',backLabel='Dashboard',action,narrow=false,wide=false,children}:{title:string;description?:string;businessName?:string;backHref?:string;backLabel?:string;action?:ReactNode;narrow?:boolean;wide?:boolean;children:ReactNode}){
 const user=await requireUser();
 const business=await readBusinessSetup(user.id);
 return <div className="aw-workspace"><a className="sn-skip-link" href="#workspace-content">Skip to page</a><WorkspaceSidebar businessName={business?.businessName||businessName} professionalName={business?.professionalName}/><main id="workspace-content" tabIndex={-1} className="aw-page"><div className={`aw-container ${narrow?'aw-narrow':wide?'aw-wide':''}`}><Link href={backHref} className="aw-back">← {backLabel}</Link><header className="aw-page-heading"><div><h1>{title}</h1>{description&&<p className="aw-description">{description}</p>}</div>{action}</header>{children}</div></main></div>;
}
export function WorkspacePanel({title,description,action,children}:{title?:string;description?:string;action?:ReactNode;children:ReactNode}){
 return <section className="aw-panel">{title&&<header className="aw-group-heading"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}</header>}<div className="aw-panel-body space-y-5">{children}</div></section>;
}
