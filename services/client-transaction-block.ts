"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getClientBlock, saveClientBlock } from "@/lib/client-transaction-block";

export async function blockClientTransactions(clientId:string, formData:FormData){
  const user=await assertPermission("CLIENT_ARCHIVE");
  const client=await prisma.client.findUnique({where:{id:clientId},select:{id:true,firstName:true,lastName:true}});
  if(!client) redirect("/app/clients?toast_error=Client%20not%20found");
  const reason=String(formData.get("reason")||"").trim().slice(0,1500);
  const confirmation=String(formData.get("confirmation")||"").trim();
  if(reason.length<5) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("A clear blocking reason is required")}`);
  if(confirmation!=="BLOCK CLIENT") redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Type BLOCK CLIENT to confirm")}`);
  const previous=await getClientBlock(clientId);
  const now=new Date().toISOString();
  await saveClientBlock({clientId,blocked:true,reason,blockedAt:now,blockedById:user.id,unblockedAt:null,unblockedById:null});
  await audit({userId:user.id,action:"CLIENT_TRANSACTIONS_BLOCKED",resourceType:"Client",resourceId:clientId,before:previous||undefined,after:{blocked:true,reason,blockedAt:now}});
  await logActivity({userId:user.id,type:"CLIENT_BLOCKED",message:`Commercial relationship blocked. Reason: ${reason}`,clientId});
  revalidatePath(`/app/clients/${clientId}/dashboard`); revalidatePath(`/app/clients/${clientId}`); revalidatePath(`/app/clients/${clientId}/timeline`);
  redirect(`/app/clients/${clientId}/dashboard?toast=${encodeURIComponent("Client blocked — new transactions disabled")}`);
}

export async function unblockClientTransactions(clientId:string, formData:FormData){
  const user=await assertPermission("CLIENT_ARCHIVE");
  const previous=await getClientBlock(clientId);
  if(!previous?.blocked) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Client is not blocked")}`);
  const reason=String(formData.get("reason")||"").trim().slice(0,1500);
  const confirmation=String(formData.get("confirmation")||"").trim();
  if(reason.length<5) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("A reactivation reason is required")}`);
  if(confirmation!=="UNBLOCK CLIENT") redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Type UNBLOCK CLIENT to confirm")}`);
  const now=new Date().toISOString();
  await saveClientBlock({...previous,blocked:false,unblockedAt:now,unblockedById:user.id});
  await audit({userId:user.id,action:"CLIENT_TRANSACTIONS_UNBLOCKED",resourceType:"Client",resourceId:clientId,before:{blocked:true,reason:previous.reason},after:{blocked:false,reason,unblockedAt:now}});
  await logActivity({userId:user.id,type:"CLIENT_UNBLOCKED",message:`Client commercial access restored. Reason: ${reason}`,clientId});
  revalidatePath(`/app/clients/${clientId}/dashboard`); revalidatePath(`/app/clients/${clientId}`); revalidatePath(`/app/clients/${clientId}/timeline`);
  redirect(`/app/clients/${clientId}/dashboard?toast=${encodeURIComponent("Client unblocked")}`);
}
