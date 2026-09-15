"use client";
import { useEffect, useState } from 'react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome:string}> };
export default function InstallDinoCoach() {
 const [prompt,setPrompt]=useState<InstallEvent|null>(null);
 const [installed,setInstalled]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
 const media=window.matchMedia('(display-mode: standalone)');
 const detect=()=>setInstalled(media.matches || (navigator as Navigator & {standalone?:boolean}).standalone===true);
 const ready=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};
 const done=()=>{setInstalled(true);setPrompt(null);};
 detect(); media.addEventListener('change',detect);window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',done);
 return()=>{media.removeEventListener('change',detect);window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',done);};
 },[]);
 if(installed)return null;
 async function install(){if(!prompt)return;try{await prompt.prompt();const result=await prompt.userChoice;setMessage(result.outcome==='accepted'?'Installation accepted. Open Dino Coach from your apps.':'You can add Dino Coach later from your browser menu.');setPrompt(null);}catch{setMessage('Use your browser menu to add Dino Coach to your home screen.');setPrompt(null);}}
 return <aside className="container-width my-6"><details className="rounded-xl border border-maroon-200 p-4"><summary className="cursor-pointer font-semibold text-content-primary">Add Dino Coach to your home screen</summary><div className="mt-3 space-y-3 text-sm text-content-secondary">
 <p>Open your squad straight from a Dino Coach app icon. An internet connection is needed for sign-in, payments, team changes and live results.</p>
 {prompt && <button type="button" className="btn-primary" onClick={install}>Install Dino Coach</button>}
 <p><strong>iPhone or iPad:</strong> open Dino Coach in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if offered, then tap Add.</p>
 <p><strong>Android:</strong> open Dino Coach in Chrome, tap the browser menu, then Install app or Add to Home screen.</p>
 <p><strong>Computer:</strong> use the install icon in Chrome or Edge, or bookmark this page with Ctrl+D (Command+D on Mac).</p>
 <p role="status">{message}</p></div></details></aside>;
}
