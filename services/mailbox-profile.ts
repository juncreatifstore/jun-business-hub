"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function updateMailboxProfile(accountId:string,formData:FormData):Promise<void>{
 const user=await assertPermission("SETTINGS_MANAGE");
 const account=await prisma.mailAccount.findUnique({where:{id:accountId},select:{id:true,email:true,displayName:true,aiEnabled:true}});
 if(!account)redirect("/app/settings/email?toast_error=Mailbox not found");
 const raw=String(formData.get("displayName")||"").trim().replace(/\s+/g," ");
 const displayName=raw?raw.slice(0,80):null;
 const aiEnabled=formData.get("aiEnabled")==="on";
 await prisma.mailAccount.update({where:{id:accountId},data:{displayName,aiEnabled}});
 await audit({userId:user.id,action:"MAILBOX_PROFILE_UPDATED",resourceType:"MailAccount",resourceId:accountId,before:{displayName:account.displayName,aiEnabled:account.aiEnabled},after:{displayName,aiEnabled,email:account.email}});
 revalidatePath("/app/settings/email");revalidatePath("/app/mail");
 redirect(`/app/settings/email?toast=${encodeURIComponent(`Mailbox ${account.email} updated`)}`);
}
