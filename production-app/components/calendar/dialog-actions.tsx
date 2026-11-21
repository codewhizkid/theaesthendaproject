'use client';
import {createContext,useContext,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
const DialogActionsRoot=createContext<HTMLDivElement|null|undefined>(undefined);
// Actions may belong to forms in the body; their explicit form= attribute keeps
// native validation, submitter values and existing server actions intact.
export function PopupActions({children}:{children:ReactNode}){
 const root=useContext(DialogActionsRoot);
 if(root===undefined)return <div className="ac-inline-actions">{children}</div>;
 return root?createPortal(children,root):null;
}
export function DialogActionLayout({children,onClose,disabled=false,closeLabel='Close'}:{children:ReactNode;onClose:()=>void;disabled?:boolean;closeLabel?:string}){
 const [root,setRoot]=useState<HTMLDivElement|null>(null);
 return <DialogActionsRoot.Provider value={root}><div className="ac-dialog-body">{children}</div><footer className="ac-dialog-footer"><div className="ac-dialog-footer-actions" ref={setRoot} inert={disabled}/><button type="button" className="ac-button" disabled={disabled} onClick={onClose}>{closeLabel}</button></footer></DialogActionsRoot.Provider>;
}
