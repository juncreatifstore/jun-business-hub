"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { getClientAccountProfile, type ClientStatementLanguage } from "@/lib/client-financial-account";

function money(amount:number,currency:string){return `${currency.toUpperCase()} ${Math.abs(amount).toFixed(2)}`;}

function buildBody(lang:ClientStatementLanguage,name:string,debts:Array<{currency:string;debt:number;netReceived:number;committed:number}>) {
  const debtLines=debts.map((d)=>`- ${d.currency}: ${money(d.debt,d.currency)} outstanding (net received ${money(d.netReceived,d.currency)}; committed service costs ${money(d.committed,d.currency)})`).join("\n");
  const totalText=debts.map((d)=>money(d.debt,d.currency)).join(" / ");
  if(lang==="ES") return {
    subject:`Estado de cuenta y saldo pendiente - ${name}`,
    body:`Hola ${name},\n\nLe enviamos una actualización de su cuenta con JUN CREATIF AND TRAVEL LLC.\n\nActualmente su cuenta presenta un saldo pendiente a favor de JUN:\n${debtLines}\n\nSaldo pendiente actual: ${totalText}.\n\nEste saldo corresponde a costos/servicios comprometidos por JUN que superan los fondos netos recibidos en su cuenta. Le pedimos regularizar este saldo antes de solicitar o iniciar un nuevo servicio.\n\nPolítica de cuenta: mientras exista un saldo negativo, un nuevo servicio no podrá ser abierto o procesado hasta que la deuda pendiente haya sido pagada o regularizada.\n\nSi necesita el estado de cuenta detallado, nuestro equipo puede proporcionárselo.\n\nAtentamente,\nJUN CREATIF AND TRAVEL LLC`
  };
  if(lang==="HT") return {
    subject:`Eta kont ak balans ou dwe - ${name}`,
    body:`Bonjou ${name},\n\nNou voye yon mizajou sou kont ou nan JUN CREATIF AND TRAVEL LLC.\n\nPou kounye a, kont ou gen yon balans negatif / yon kantite lajan ou dwe JUN:\n${debtLines}\n\nBalans ou dwe kounye a: ${totalText}.\n\nBalans sa a soti nan depans ak sèvis JUN deja angaje pou ou ki pi wo pase lajan nèt nou resevwa sou kont ou. Tanpri regle balans sa a anvan ou mande oswa kòmanse yon lòt sèvis.\n\nRèg kont lan: toutotan kont lan negatif, nou pap kapab ouvri oswa trete yon nouvo sèvis jiskaske dèt la fin peye oswa regilarize.\n\nSi ou bezwen relve kont detaye a, ekip nou an ka voye li ba ou.\n\nSensèman,\nJUN CREATIF AND TRAVEL LLC`
  };
  if(lang==="EN") return {
    subject:`Account status and outstanding balance - ${name}`,
    body:`Hello ${name},\n\nWe are sending you an update regarding your account with JUN CREATIF AND TRAVEL LLC.\n\nYour account currently has an outstanding balance owed to JUN:\n${debtLines}\n\nCurrent outstanding balance: ${totalText}.\n\nThis balance reflects service costs already committed by JUN that exceed the net funds received on your account. Please settle this balance before requesting or starting another service.\n\nAccount policy: while the account remains negative, a new service cannot be opened or processed until the outstanding debt is paid or otherwise regularized.\n\nIf you need the detailed account statement, our team can provide it.\n\nSincerely,\nJUN CREATIF AND TRAVEL LLC`
  };
  return {
    subject:`État de compte et solde à régulariser - ${name}`,
    body:`Bonjour ${name},\n\nNous vous transmettons une mise à jour de votre compte auprès de JUN CREATIF AND TRAVEL LLC.\n\nVotre compte présente actuellement un solde négatif / une dette envers JUN :\n${debtLines}\n\nSolde à régulariser actuellement : ${totalText}.\n\nCe solde correspond à des coûts de services déjà engagés par JUN qui dépassent les fonds nets reçus sur votre compte. Nous vous demandons donc de régulariser ce montant avant toute nouvelle demande de service.\n\nPolitique du compte : tant que le solde reste négatif, aucun nouveau service ne pourra être ouvert ou traité jusqu'au paiement ou à la régularisation complète de la dette.\n\nSi vous souhaitez recevoir le relevé de compte détaillé, notre équipe peut vous le fournir.\n\nCordialement,\nJUN CREATIF AND TRAVEL LLC`
  };
}

export async function createClientBalanceReminderDraft(clientId:string):Promise<void>{
  const user=await assertPermission("EMAIL_DRAFT");
  const [client,finance,profile,account]=await Promise.all([
    prisma.client.findUnique({where:{id:clientId},select:{id:true,firstName:true,lastName:true,email:true,internalId:true}}),
    getClientFinanceOverview(clientId),
    getClientAccountProfile(clientId),
    prisma.mailAccount.findFirst({where:{OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},orderBy:{createdAt:"asc"}}),
  ]);
  if(!client) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Client not found")}`);
  if(!client.email) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Add a client email address before creating a reminder")}`);
  if(!account) redirect(`/app/clients/${clientId}/dashboard?toast_error=${encodeURIComponent("Connect a Gmail mailbox first")}`);
  const debts=finance.summaries.filter((s)=>s.forecastProfit< -0.009).map((s)=>({currency:s.currency,debt:Math.abs(s.forecastProfit),netReceived:s.netReceived,committed:s.expenseCommitted+s.approvedRefunds}));
  if(!debts.length) redirect(`/app/clients/${clientId}/dashboard?toast=${encodeURIComponent("Client has no negative committed balance")}`);
  const name=`${client.firstName} ${client.lastName}`.trim();
  const message=buildBody(profile.preferredLanguage,name,debts);
  const thread=await prisma.mailThread.create({data:{
    gmailThreadId:`client-balance-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    mailAccountId:account.id,
    clientId:client.id,
    subject:message.subject,
    snippet:message.body.slice(0,500),
    fromEmail:account.email,
    toEmails:[client.email],
    aiLevel:"APPROVAL_REQUIRED",
    aiSummary:"Negative client balance reminder prepared from JUN Finance. Review before sending.",
    aiDraft:message.body,
    requiresAttention:true,
  }});
  await audit({userId:user.id,action:"CLIENT_BALANCE_REMINDER_DRAFT",resourceType:"Client",resourceId:client.id,after:{email:client.email,debts}});
  await logActivity({type:"EMAIL_DRAFTED",message:`Account balance reminder drafted for ${client.internalId}`,userId:user.id,clientId:client.id});
  revalidatePath(`/app/clients/${client.id}/dashboard`);
  revalidatePath("/app/mail");
  redirect(`/app/mail?folder=DRAFTS&thread=${thread.id}&toast=${encodeURIComponent("Account status reminder draft created — review and send")}`);
}
