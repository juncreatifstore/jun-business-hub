"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { MANUAL_RECEIVER_PREFIX, type ManualTransferRail, type ManualTransferReceiver } from "@/lib/finance-manual-transfers";

function dest(message: string, error = false) { return `/app/finance/manual-transfers/receivers?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`; }
function text(formData: FormData, name: string, max = 200) { return String(formData.get(name) || "").trim().slice(0, max); }
function normalizeReceiver(formData:FormData, base:{id:string;enabled:boolean;createdAt:string}):ManualTransferReceiver{
  const rail: ManualTransferRail = text(formData, "rail", 30) === "WESTERN_UNION" ? "WESTERN_UNION" : "BANK_TRANSFER";
  const firstName=text(formData,"firstName",100),lastName=text(formData,"lastName",100),legalNameInput=text(formData,"legalName",180);const legalName=legalNameInput||[firstName,lastName].filter(Boolean).join(" ");
  const currency=text(formData,"currency",3).toUpperCase()||"USD";
  const receiverStreet=text(formData,"receiverStreet",220)||text(formData,"address",300);
  const receiverState=text(formData,"receiverState",100);
  const receiverPostalCode=text(formData,"receiverPostalCode",40);
  const bankStreet=text(formData,"bankStreet",220)||text(formData,"bankAddress",300);
  const bankCity=text(formData,"bankCity",100);
  const bankState=text(formData,"bankState",100);
  const bankPostalCode=text(formData,"bankPostalCode",40);
  return {id:base.id,label:text(formData,"label",120),rail,enabled:base.enabled,receiverType:text(formData,"receiverType",50)==="INDIVIDUAL_BUSINESS_REPRESENTATIVE"?"INDIVIDUAL_BUSINESS_REPRESENTATIVE":"BUSINESS",firstName,lastName,legalName,phone:text(formData,"phone",80),email:text(formData,"email",160),country:text(formData,"country",100),city:text(formData,"city",100),address:receiverStreet,receiverStreet,receiverState,receiverPostalCode,bankName:text(formData,"bankName",160),bankCountry:text(formData,"bankCountry",100),bankAddress:bankStreet,bankStreet,bankCity,bankState,bankPostalCode,accountHolderName:text(formData,"accountHolderName",180)||legalName,accountNumber:text(formData,"accountNumber",120),iban:text(formData,"iban",120),swiftBic:text(formData,"swiftBic",80),routingNumber:text(formData,"routingNumber",80),clabe:text(formData,"clabe",80),branchCode:text(formData,"branchCode",80),currency,feePercent:Math.max(0,Math.min(100,Number(formData.get("feePercent")||0))),feeFixed:Math.max(0,Number(formData.get("feeFixed")||0)),complianceNote:text(formData,"complianceNote",2000),createdAt:base.createdAt,updatedAt:new Date().toISOString()};
}
function validateReceiver(r:ManualTransferReceiver){if(!r.label||!r.legalName)return"Label and receiver name are required";if(r.currency.length!==3)return"Receiver currency must have 3 letters";if(r.rail==="BANK_TRANSFER"&&!r.bankName)return"Bank name is required for a bank transfer receiver";if(r.rail==="BANK_TRANSFER"&&!r.accountNumber&&!r.iban&&!r.clabe)return"Add an account number, IBAN or CLABE for a bank transfer receiver";return null;}
function refresh(){revalidatePath("/app/finance/manual-transfers/receivers");revalidatePath("/app/finance/manual-transfers");}

export async function createManualTransferReceiverV2(formData: FormData) {
  const user = await assertPermission("SETTINGS_MANAGE");const id=randomUUID(),now=new Date().toISOString();const receiver=normalizeReceiver(formData,{id,enabled:true,createdAt:now});const error=validateReceiver(receiver);if(error)redirect(dest(error,true));
  await prisma.appSetting.create({ data: { key: `${MANUAL_RECEIVER_PREFIX}${id}`, value: JSON.stringify(receiver) } });
  await audit({ userId: user.id, action: "MANUAL_TRANSFER_RECEIVER_CREATE_V2", resourceType: "ManualTransferReceiver", resourceId: id, after: { label:receiver.label, rail:receiver.rail, receiverName:[receiver.firstName,receiver.lastName].filter(Boolean).join(" "), legalName:receiver.legalName, bankName:receiver.bankName, currency:receiver.currency } });refresh();redirect(dest("Manual transfer receiver created"));
}

export async function updateManualTransferReceiverV2(receiverId:string,formData:FormData){
  const user=await assertPermission("SETTINGS_MANAGE");const row=await prisma.appSetting.findUnique({where:{key:`${MANUAL_RECEIVER_PREFIX}${receiverId}`},select:{value:true}});if(!row)redirect(dest("Receiver not found",true));
  let before:ManualTransferReceiver;try{before=JSON.parse(row.value) as ManualTransferReceiver;}catch{redirect(dest("Receiver data is invalid",true));}
  const next=normalizeReceiver(formData,{id:receiverId,enabled:before!.enabled,createdAt:before!.createdAt||new Date().toISOString()});const error=validateReceiver(next);if(error)redirect(`/app/finance/manual-transfers/receivers/${receiverId}/edit?toast_error=${encodeURIComponent(error)}`);
  await prisma.appSetting.update({where:{key:`${MANUAL_RECEIVER_PREFIX}${receiverId}`},data:{value:JSON.stringify(next)}});
  await audit({userId:user.id,action:"MANUAL_TRANSFER_RECEIVER_UPDATE",resourceType:"ManualTransferReceiver",resourceId:receiverId,before:{label:before!.label,legalName:before!.legalName,bankName:before!.bankName,accountNumber:before!.accountNumber,feePercent:before!.feePercent,feeFixed:before!.feeFixed},after:{label:next.label,legalName:next.legalName,bankName:next.bankName,accountNumber:next.accountNumber,feePercent:next.feePercent,feeFixed:next.feeFixed}});refresh();redirect(dest("Receiver updated"));
}
