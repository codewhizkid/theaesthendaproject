import {uuid,validDate} from '../appointments/input.ts';
export type CalendarBlock={id:string;revision:number;name:string;startAt:string;endAt:string;timezone:string;date:string;startMinute:number;endMinute:number};
export type BlockConflict={id:string;startAt:string;endAt:string;timezone:string};
export type BlockResult={message:string;saved:boolean;conflicts:BlockConflict[]};
export function parseBlock(form:FormData){
 const id=String(form.get('id')??''),requestKey=String(form.get('requestKey')??''),revision=Number(form.get('revision')),remove=form.get('remove')==='yes';
 const date=String(form.get('date')??''),name=String(form.get('name')??'').trim(),start=Number(form.get('start')),end=Number(form.get('end'));
 if(!uuid(requestKey)||(id&&!uuid(id))||!/^\d+$/.test(String(form.get('revision')??''))||!Number.isSafeInteger(revision)||(id?revision<1:revision!==0)||(!id&&remove))throw Error('INVALID_INPUT');
 if(!remove&&(!validDate(date)||name.length<1||name.length>120||form.get('start')===null||form.get('end')===null||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>1440||end<=start))throw Error('INVALID_INPUT');
 return {id:id||null,requestKey,revision,remove,date:remove?null:date,name,start:remove?null:start,end:remove?null:end};
}
