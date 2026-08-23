import { redirect } from "next/navigation";
import { MailCenter } from "@/components/mail/mail-center";

export const dynamic="force-dynamic";

export default async function MailPage({searchParams}:{searchParams:{folder?:string;thread?:string;compose?:string;q?:string;mailbox?:string;source?:string;mode?:string}}){
 if(searchParams.compose==="1"){
  const p=new URLSearchParams();if(searchParams.mailbox)p.set("mailbox",searchParams.mailbox);if(searchParams.source)p.set("source",searchParams.source);if(searchParams.mode)p.set("mode",searchParams.mode);redirect(`/app/mail/compose?${p.toString()}`);
 }
 return <MailCenter searchParams={searchParams}/>;
}
