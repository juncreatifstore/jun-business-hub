"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getClientBlock, saveClientBlock } from "@/lib/client-transaction-block";
import { getClientTermination, getClientTerminationReadiness, saveClientTermination } from "@/lib/client-relationship-termination";
import { nextNumber } from "@/lib/sequence";

function relationshipPath(clientId:string,msg?:string,error=false){const base=`/app/clients/${clientId}/relationship`;return msg?`${base}?${error?"toast_error":"toast"}=${encodeURIComponent(msg)}`:base;}
function refresh(clientId:string){revalidatePath(`/app/clients/${clientId}/dashboard`);revalidatePath(`/app/clients/${clientId}`);revalidatePath(`/app/clients/${clientId}/history`);revalidatePath(`/app/clients/${clientId}/relationship`);revalidatePath(`/app/clients/${clientId}/statement`);}

/** Legacy endpoint intentionally disabled: termination must pass the formal workflow. */
export async function blockClientTransactions(clientId:string){
  await assertPermission("CLIENT_ARCHIVE");
  redirect(relationshipPath(clientId,"Direct blocking is disabled. Complete the formal relationship-termination process first.",true));
}

export async function startClientTermination(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_ARCHIVE");
 const client=await prisma.client.findUnique({where:{id:clientId},select:{id:true}});if(!client)redirect("/app/clients?toast_error=Client%20not%20found");
 const reason=String(formData.get("reason")||"").trim().slice(0,3000);const confirmation=String(formData.get("confirmation")||"").trim();
 if(reason.length<20)redirect(relationshipPath(clientId,"A detailed formal reason is required (minimum 20 characters).",true));
 if(confirmation!=="START TERMINATION REVIEW")redirect(relationshipPath(clientId,"Type START TERMINATION REVIEW to confirm.",true));
 const existing=await getClientTermination(clientId);if(existing&&!['CANCELLED','TERMINATED'].includes(existing.status))redirect(relationshipPath(clientId,"A termination review is already active.",true));
 const now=new Date().toISOString();
 await saveClientTermination({clientId,status:"REVIEW",reason,startedAt:now,startedById:user.id,signedDocumentId:null,packageDeliveredAt:null,deliveryNote:"",completedAt:null,completedById:null,cancelledAt:null,cancelledById:null});
 await audit({userId:user.id,action:"CLIENT_TERMINATION_REVIEW_STARTED",resourceType:"Client",resourceId:clientId,after:{reason,startedAt:now}});
 await logActivity({userId:user.id,type:"CLIENT_TERMINATION_REVIEW",message:"Formal commercial relationship termination review started",clientId});refresh(clientId);
 redirect(relationshipPath(clientId,"Termination review started. Settle every transaction before final blocking."));
}

export async function triggerTerminationRefunds(clientId:string){
 const user=await assertPermission("REFUND_CREATE");const workflow=await getClientTermination(clientId);if(!workflow||["CANCELLED","TERMINATED"].includes(workflow.status))redirect(relationshipPath(clientId,"No active termination review.",true));
 const readiness=await getClientTerminationReadiness(clientId);if(!readiness)redirect("/app/clients");
 if(!readiness.refundableBalances.length)redirect(relationshipPath(clientId,"No unrefunded positive client balance remains."));
 const created:string[]=[];const now=new Date();
 for(const balance of readiness.refundableBalances){
  const refundNumber=await nextNumber("REF");
  const refund=await prisma.refund.create({data:{refundNumber,clientId,amount:balance.amount,currency:balance.currency,reason:`Automatic final-account refund initiated during relationship termination. Reason: ${workflow.reason}`,createdById:user.id,installments:{create:{number:1,amount:balance.amount,dueDate:now,status:"SCHEDULED"}}},select:{id:true,refundNumber:true}});
  created.push(refund.refundNumber);await audit({userId:user.id,action:"CLIENT_TERMINATION_REFUND_TRIGGERED",resourceType:"Refund",resourceId:refund.id,after:{clientId,refundNumber,amount:balance.amount,currency:balance.currency}});
 }
 await saveClientTermination({...workflow,status:"SETTLING"});await logActivity({userId:user.id,type:"REFUND_REQUESTED",message:`Termination refunds automatically initiated: ${created.join(", ")}`,clientId});refresh(clientId);revalidatePath("/app/finance/refunds");
 redirect(relationshipPath(clientId,`${created.length} final refund request(s) created automatically.`));
}

export async function attachTerminationDocument(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_ARCHIVE");const workflow=await getClientTermination(clientId);if(!workflow||["CANCELLED","TERMINATED"].includes(workflow.status))redirect(relationshipPath(clientId,"No active termination review.",true));
 const documentId=String(formData.get("documentId")||"").trim();const doc=await prisma.document.findFirst({where:{id:documentId,clientId,status:"SIGNED"},select:{id:true,documentId:true,title:true}});
 if(!doc)redirect(relationshipPath(clientId,"Select a SIGNED document belonging to this client.",true));
 await saveClientTermination({...workflow,signedDocumentId:doc.id,status:"READY_TO_SIGN"});await audit({userId:user.id,action:"CLIENT_TERMINATION_SIGNED_DOCUMENT_ATTACHED",resourceType:"Client",resourceId:clientId,after:{documentId:doc.documentId,title:doc.title}});refresh(clientId);
 redirect(relationshipPath(clientId,"Signed termination document attached."));
}

export async function markTerminationPackageDelivered(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_ARCHIVE");const workflow=await getClientTermination(clientId);if(!workflow?.signedDocumentId)redirect(relationshipPath(clientId,"Attach the signed formal termination document first.",true));
 const note=String(formData.get("deliveryNote")||"").trim().slice(0,1500);if(note.length<5)redirect(relationshipPath(clientId,"Record how the signed notice and final statement were delivered to the client.",true));
 const now=new Date().toISOString();await saveClientTermination({...workflow,packageDeliveredAt:now,deliveryNote:note,status:"READY_TO_TERMINATE"});await audit({userId:user.id,action:"CLIENT_TERMINATION_PACKAGE_DELIVERED",resourceType:"Client",resourceId:clientId,after:{deliveredAt:now,deliveryNote:note}});await logActivity({userId:user.id,type:"DOCUMENT_SENT",message:"Signed relationship-termination notice and final statement delivered to client",clientId});refresh(clientId);
 redirect(relationshipPath(clientId,"Final signed notice + statement delivery recorded."));
}

export async function finalizeClientTermination(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_ARCHIVE");const workflow=await getClientTermination(clientId);if(!workflow||workflow.status==="CANCELLED")redirect(relationshipPath(clientId,"No active termination review.",true));
 const confirmation=String(formData.get("confirmation")||"").trim();if(confirmation!=="FINALIZE TERMINATION")redirect(relationshipPath(clientId,"Type FINALIZE TERMINATION to confirm.",true));
 const readiness=await getClientTerminationReadiness(clientId);if(!readiness)redirect("/app/clients");
 if(!readiness.transactionsSettled)redirect(relationshipPath(clientId,"Final blocking is not allowed until all cases and financial transactions are fully settled.",true));
 if(!workflow.signedDocumentId||!workflow.packageDeliveredAt)redirect(relationshipPath(clientId,"Signed termination document and delivery of the final package are mandatory.",true));
 const doc=await prisma.document.findFirst({where:{id:workflow.signedDocumentId,clientId,status:"SIGNED"},select:{id:true}});if(!doc)redirect(relationshipPath(clientId,"The termination document is no longer in SIGNED status.",true));
 const now=new Date().toISOString();const previous=await getClientBlock(clientId);
 await saveClientBlock({clientId,blocked:true,reason:workflow.reason,blockedAt:now,blockedById:user.id,unblockedAt:null,unblockedById:null});
 await saveClientTermination({...workflow,status:"TERMINATED",completedAt:now,completedById:user.id});
 await audit({userId:user.id,action:"CLIENT_RELATIONSHIP_FORMALLY_TERMINATED",resourceType:"Client",resourceId:clientId,before:previous||undefined,after:{blocked:true,reason:workflow.reason,completedAt:now,signedDocumentId:workflow.signedDocumentId}});
 await logActivity({userId:user.id,type:"CLIENT_BLOCKED",message:"Commercial relationship formally terminated after settlement, signed notice and final statement delivery",clientId});refresh(clientId);
 redirect(`/app/clients/${clientId}/dashboard?toast=${encodeURIComponent("Relationship formally terminated — client transactions blocked")}`);
}

export async function cancelClientTermination(clientId:string,formData:FormData){
 const user=await assertPermission("CLIENT_ARCHIVE");const workflow=await getClientTermination(clientId);if(!workflow||["TERMINATED","CANCELLED"].includes(workflow.status))redirect(relationshipPath(clientId,"No cancellable termination review.",true));
 const reason=String(formData.get("reason")||"").trim().slice(0,1500);if(reason.length<5)redirect(relationshipPath(clientId,"Cancellation reason is required.",true));const now=new Date().toISOString();await saveClientTermination({...workflow,status:"CANCELLED",cancelledAt:now,cancelledById:user.id});await audit({userId:user.id,action:"CLIENT_TERMINATION_REVIEW_CANCELLED",resourceType:"Client",resourceId:clientId,after:{reason,cancelledAt:now}});await logActivity({userId:user.id,type:"CLIENT_TERMINATION_CANCELLED",message:`Termination review cancelled: ${reason}`,clientId});refresh(clientId);redirect(relationshipPath(clientId,"Termination review cancelled."));
}

export async function unblockClientTransactions(clientId:string, formData:FormData){
  const user=await assertPermission("CLIENT_ARCHIVE");const previous=await getClientBlock(clientId);if(!previous?.blocked) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Client is not blocked")}`);
  const reason=String(formData.get("reason")||"").trim().slice(0,1500);const confirmation=String(formData.get("confirmation")||"").trim();if(reason.length<10) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("A detailed reactivation reason is required")}`);if(confirmation!=="UNBLOCK CLIENT") redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Type UNBLOCK CLIENT to confirm")}`);
  const now=new Date().toISOString();await saveClientBlock({...previous,blocked:false,unblockedAt:now,unblockedById:user.id});await audit({userId:user.id,action:"CLIENT_TRANSACTIONS_UNBLOCKED",resourceType:"Client",resourceId:clientId,before:{blocked:true,reason:previous.reason},after:{blocked:false,reason,unblockedAt:now}});await logActivity({userId:user.id,type:"CLIENT_UNBLOCKED",message:`Client commercial access restored. Reason: ${reason}`,clientId});refresh(clientId);redirect(`/app/clients/${clientId}/dashboard?toast=${encodeURIComponent("Client unblocked")}`);
}
