"use client";
import { useEffect, useRef, useState } from "react";

export function EmailHtmlFrame({html,title}:{html:string;title:string}){
 const ref=useRef<HTMLIFrameElement>(null);
 const[height,setHeight]=useState(360);
 useEffect(()=>{
  const frame=ref.current;if(!frame)return;
  let observer:ResizeObserver|undefined;
  const resize=()=>{try{const doc=frame.contentDocument;if(!doc)return;const h=Math.max(doc.documentElement.scrollHeight,doc.body?.scrollHeight??0,240);setHeight(Math.min(Math.max(h+24,240),5000));}catch{}}
  const onLoad=()=>{resize();try{const doc=frame.contentDocument;if(doc?.documentElement){observer=new ResizeObserver(resize);observer.observe(doc.documentElement);}doc?.querySelectorAll("img").forEach(img=>img.addEventListener("load",resize,{once:true}));}catch{}};
  frame.addEventListener("load",onLoad);return()=>{frame.removeEventListener("load",onLoad);observer?.disconnect();};
 },[html]);
 const document=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}body{min-width:0}</style></head><body>${html}</body></html>`;
 return <iframe ref={ref} title={title} srcDoc={document} loading="lazy" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" className="block w-full border-0 bg-white" style={{height}}/>;
}
