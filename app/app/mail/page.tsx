import { MailCenter } from "@/components/mail/mail-center";

export const dynamic="force-dynamic";

export default async function MailPage({searchParams}:{searchParams:{folder?:string;thread?:string;compose?:string;q?:string;mailbox?:string}}){
 return <MailCenter searchParams={searchParams}/>;
}
