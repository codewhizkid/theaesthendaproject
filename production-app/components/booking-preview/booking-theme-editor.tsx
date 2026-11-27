'use client';
import {useActionState,useState} from 'react';
import {bookingThemeCssVariables,BOOKING_THEME_PRESETS,type BookingTheme} from '@/lib/booking-theme/input';
import {saveBookingPageDesign} from '@/app/settings/booking-page/actions';
const colorFields:{key:Exclude<keyof BookingTheme,'fontFamily'>;label:string}[]=[
 {key:'background',label:'Background'},
 {key:'schedulerBackground',label:'Scheduler background'},
 {key:'headerText',label:'Header text'},
 {key:'schedulerText',label:'Scheduler text'},
 {key:'accentColor',label:'Button / accent color'},
];
function luminance(hex:string){
 const rgb=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2);
 return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
}
function contrastRatio(a:string,b:string){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+0.05)/(values[1]+0.05);}
export function BookingThemeEditor({theme:initialTheme,revision,businessName}:{theme:BookingTheme;revision:number;businessName:string}){
 const [state,action,pending]=useActionState(saveBookingPageDesign,{message:''});
 const [theme,setTheme]=useState(initialTheme);
 const headerContrast=contrastRatio(theme.headerText,theme.background);
 const schedulerContrast=contrastRatio(theme.schedulerText,theme.schedulerBackground);
 const hasLowContrast=headerContrast<4.5||schedulerContrast<4.5;
 const previewStyle=bookingThemeCssVariables(theme);
 return <form action={action} className="bte-form">
  <input type="hidden" name="revision" value={revision}/>
  <input type="hidden" name="theme" value={JSON.stringify(theme)} readOnly/>
  <div className="bte-layout">
   <section className="aw-panel"><div className="aw-panel-body bte-controls">
    <section aria-labelledby="bte-palette-title"><h2 id="bte-palette-title">Start with a palette</h2><p>Choose a starting point, then fine-tune every color.</p><div className="bte-presets">{BOOKING_THEME_PRESETS.map(preset=><button className="aw-secondary" type="button" key={preset.name} onClick={()=>setTheme(preset.theme)}>{preset.name}</button>)}</div></section>
    <fieldset disabled={pending} className="bte-color-fields"><legend>Colors</legend>{colorFields.map(field=><label key={field.key}><span>{field.label}<code>{theme[field.key]}</code></span><input type="color" name={field.key} value={theme[field.key]} onChange={event=>setTheme(current=>({...current,[field.key]:event.target.value.toUpperCase()}))}/></label>)}</fieldset>
    <label className="bte-font">Font<select value={theme.fontFamily} onChange={event=>setTheme(current=>({...current,fontFamily:event.target.value as BookingTheme['fontFamily']}))}><option value="sans">Aesthenda Sans</option><option value="serif">Editorial Serif</option></select></label>
    <p className="bte-contrast" role="status">{hasLowContrast?'Some text may be difficult to read. Try a darker text color or a lighter background.':`Text contrast looks clear (header ${headerContrast.toFixed(1)}:1, scheduler ${schedulerContrast.toFixed(1)}:1).`}</p>
    <div className="bte-actions"><button className="aw-secondary" type="button" onClick={()=>setTheme(BOOKING_THEME_PRESETS[0].theme)}>Reset preview</button><button className="aw-primary" type="submit" disabled={pending}>{pending?'Saving…':'Save design'}</button></div><p role="status" aria-live="polite">{state.message}</p>
   </div></section>
   <section className="bte-preview-panel" aria-label="Live booking page preview"><div className="bte-preview-heading"><h2>Live preview</h2><p>Changes appear here before you save.</p></div><div className="bp-page bte-preview" style={previewStyle}>
    <header className="bp-header"><div><p className="bp-salon">{businessName||'Your studio'}</p><span className="bp-powered">BOOKING WITH AESTHENDA</span></div><span className="bp-header-label">Book your next visit</span></header>
    <main className="bp-main"><p className="bp-eyebrow">Make time for you</p><h1>Find a moment that feels like yours.</h1><p className="bp-intro">Choose a service and a time that work for you.</p><div className="bp-layout"><div className="bp-services"><article className="bp-service"><div><span className="bp-service-category">Hair</span><h2>Signature haircut</h2><p>A tailored cut and finish, shaped around you.</p><span className="bp-duration">45 minutes</span></div><strong>$75</strong></article><button type="button" className="bp-primary">Choose a time</button></div><aside className="bp-summary"><h2>Your visit</h2><p className="bp-professional">A little care, just for you.</p><div className="bp-summary-detail"><span>Your service</span><p>Choose a service to begin.</p></div><p className="bp-preview-explanation">Your appointment details will appear here.</p></aside></div></main>
   </div></section>
  </div>
 </form>;
}
