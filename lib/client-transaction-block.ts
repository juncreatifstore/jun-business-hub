import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX = "client.block.";

export type ClientBlockRecord = {
  clientId: string;
  blocked: boolean;
  reason: string;
  blockedAt: string;
  blockedById: string;
  unblockedAt?: string | null;
  unblockedById?: string | null;
};

function key(clientId:string){ return `${PREFIX}${clientId}`; }

export async function getClientBlock(clientId:string):Promise<ClientBlockRecord|null>{
  const row=await prisma.appSetting.findUnique({where:{key:key(clientId)},select:{value:true}});
  if(!row) return null;
  try{
    const parsed=JSON.parse(row.value) as ClientBlockRecord;
    return parsed?.clientId ? parsed : null;
  }catch{return null;}
}

export async function isClientBlocked(clientId:string){
  const record=await getClientBlock(clientId);
  return Boolean(record?.blocked);
}

export async function assertClientTransactionAllowed(clientId:string){
  const record=await getClientBlock(clientId);
  if(record?.blocked){
    throw new Error(`CLIENT_BLOCKED: ${record.reason || "Relationship terminated by JUN."}`);
  }
  return record;
}

export async function saveClientBlock(record:ClientBlockRecord){
  await prisma.appSetting.upsert({
    where:{key:key(record.clientId)},
    create:{key:key(record.clientId),value:JSON.stringify(record)},
    update:{value:JSON.stringify(record)},
  });
  return record;
}
