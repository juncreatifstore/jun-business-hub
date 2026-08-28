"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX="jun.companyFunds.scroll.";

function hasHashTarget(){
  if(!window.location.hash)return false;
  const id=decodeURIComponent(window.location.hash.replace(/^#/,""));
  return Boolean(id&&document.getElementById(id));
}

export function CompanyFundsPageMemory({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const previousPath=useRef(pathname);
  const [visible,setVisible]=useState(true);

  useEffect(()=>{
    const previous=previousPath.current;
    if(previous!==pathname){
      try{sessionStorage.setItem(`${STORAGE_PREFIX}${previous}`,String(window.scrollY))}catch{}
      previousPath.current=pathname;
    }

    setVisible(false);
    const frame=requestAnimationFrame(()=>{
      const restore=()=>{
        // A deep-link hash always wins over remembered scroll position.
        // The overview navigator owns the final section alignment.
        if(hasHashTarget()){
          requestAnimationFrame(()=>setVisible(true));
          return;
        }

        let saved=0;
        try{
          const raw=sessionStorage.getItem(`${STORAGE_PREFIX}${pathname}`);
          if(raw!==null){
            const parsed=Number(raw);
            if(Number.isFinite(parsed)&&parsed>=0)saved=parsed;
          }
        }catch{}
        window.scrollTo({top:saved,left:0,behavior:"auto"});
        requestAnimationFrame(()=>setVisible(true));
      };

      // Headings on the overview are assigned after mount. Give deep links
      // one extra frame to resolve before applying a remembered position.
      requestAnimationFrame(restore);
    });

    return()=>cancelAnimationFrame(frame);
  },[pathname]);

  useEffect(()=>{
    const save=()=>{
      // Do not overwrite the useful page-level memory while the user is
      // positioned by a section deep link.
      if(window.location.hash)return;
      try{sessionStorage.setItem(`${STORAGE_PREFIX}${previousPath.current}`,String(window.scrollY))}catch{}
    };
    window.addEventListener("pagehide",save);
    return()=>{
      save();
      window.removeEventListener("pagehide",save);
    };
  },[]);

  return <div className={cn("transition-opacity duration-150",visible?"opacity-100":"opacity-70")}>{children}</div>;
}
