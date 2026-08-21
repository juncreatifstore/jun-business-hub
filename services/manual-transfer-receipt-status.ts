"use server";

import { assertPermission } from "@/lib/auth";
import { getManualTransferOrder } from "@/lib/finance-manual-transfers";
import { ensureUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";
import { setManualTransferOrderStatus } from "@/services/finance-manual-transfers";

export async function setManualTransferOrderStatusWithReceipt(id:string,formData:FormData){
  const user=await assertPermission("PAYMENT_APPROVE");
  const target=String(formData.get("status")||"");
  await setManualTransferOrderStatus(id,formData);
  if(target!=="COMPLETED")return;
  const order=await getManualTransferOrder(id);if(!order||order.status!=="COMPLETED")return;
  await ensureUniversalFinancialReceipt({sourceType:"MANUAL_TRANSFER",sourceId:order.id,clientId:order.clientId,amount:order.sendAmount,currency:order.sendCurrency,direction:"DEBIT",title:"Manual transfer completion receipt",description:`${order.orderNumber} · ${order.purpose || "Commercial payment"} · ${order.receiverSnapshot.legalName}`,status:"COMPLETED",method:order.receiverSnapshot.rail,transactionReference:order.orderNumber,issuedById:user.id});
}
