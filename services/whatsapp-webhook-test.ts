"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function digits(value:string){return String(value||"").replace(/[^0-9]/g,"");}

export async function testWhatsAppWebhookLocally(){
  await assertPermission("SETTINGS_MANAGE");

  const client=await prisma.client.findFirst({
    where:{archivedAt:null,OR:[{whatsapp:{not:null}},{phone:{not:null}}]},
    orderBy:{updatedAt:"desc"},
    select:{id:true,firstName:true,lastName:true,whatsapp:true,phone:true},
  });

  if(!client){
    redirect(`/app/settings/whatsapp?toast_error=${encodeURIComponent("Local webhook test requires at least one client with a WhatsApp or phone number.")}`);
  }

  const phone=digits(client.whatsapp||client.phone||"");
  if(!phone){
    redirect(`/app/settings/whatsapp?toast_error=${encodeURIComponent("Selected client does not have a valid WhatsApp number.")}`);
  }

  const messageId=`wamid.JUN_LOCAL_TEST_${Date.now()}`;
  const callbackUrl="https://juncreatif.org/api/webhooks/whatsapp";
  const payload={
    object:"whatsapp_business_account",
    entry:[{
      id:"JUN_LOCAL_TEST_WABA",
      changes:[{
        field:"messages",
        value:{
          messaging_product:"whatsapp",
          metadata:{display_phone_number:"JUN LOCAL TEST",phone_number_id:"JUN_LOCAL_TEST"},
          contacts:[{profile:{name:`${client.firstName} ${client.lastName}`.trim()},wa_id:phone}],
          messages:[{
            from:phone,
            id:messageId,
            timestamp:String(Math.floor(Date.now()/1000)),
            type:"text",
            text:{body:"TEST JUN — simulated incoming WhatsApp webhook"},
          }],
        },
      }],
    }],
  };

  let response:Response;
  try{
    response=await fetch(callbackUrl,{
      method:"POST",
      headers:{"Content-Type":"application/json","X-JUN-Webhook-Test":"settings"},
      body:JSON.stringify(payload),
      cache:"no-store",
    });
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to reach webhook URL";
    redirect(`/app/settings/whatsapp?toast_error=${encodeURIComponent(`Webhook URL unreachable: ${message}`)}`);
  }

  if(!response.ok){
    const body=await response.text().catch(()=>"");
    redirect(`/app/settings/whatsapp?toast_error=${encodeURIComponent(`Webhook test failed with HTTP ${response.status}${body?`: ${body.slice(0,300)}`:""}`)}`);
  }

  const activity=await prisma.activity.findFirst({
    where:{resourceType:"WhatsAppConversation",resourceId:phone,message:{contains:messageId}},
    orderBy:{createdAt:"desc"},
    select:{id:true},
  });

  await prisma.appSetting.upsert({
    where:{key:"whatsapp.webhook.last_local_test"},
    create:{key:"whatsapp.webhook.last_local_test",value:JSON.stringify({testedAt:new Date().toISOString(),ok:Boolean(activity),phone,messageId,httpStatus:response.status})},
    update:{value:JSON.stringify({testedAt:new Date().toISOString(),ok:Boolean(activity),phone,messageId,httpStatus:response.status})},
  });

  revalidatePath("/app/settings/whatsapp");
  revalidatePath("/app/whatsapp/inbox");

  if(!activity){
    redirect(`/app/settings/whatsapp?toast_error=${encodeURIComponent("Webhook URL returned 200, but JUN did not store the simulated incoming message.")}`);
  }

  redirect(`/app/whatsapp/inbox?phone=${encodeURIComponent(phone)}`);
}
