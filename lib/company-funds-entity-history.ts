import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

const PREFIX="company.funds.entity-history.";
export type CompanyFundsHistoricalEntityType="RESERVE"|"LOAN"|"INVESTMENT";
export type CompanyFundsEntityHistoryRow={
  id:string;
  entityType:CompanyFundsHistoricalEntityType;
  entityId:string;
  effectiveAt:string;
  recordedAt:string;
  reason:string;
  snapshot:Record<string,unknown>;
};

function parse(value:string):CompanyFundsEntityHistoryRow|null{
  try{
    const row=JSON.parse(value) as CompanyFundsEntityHistoryRow;
    return row?.id&&row?.entityId&&row?.entityType&&row?.effectiveAt&&row?.snapshot?row:null;
  }catch{return null}
}

export async function recordCompanyFundsEntityHistory(input:{
  entityType:CompanyFundsHistoricalEntityType;
  entityId:string;
  snapshot:Record<string,unknown>;
  effectiveAt?:string|null;
  reason?:string;
}){
  const effective=input.effectiveAt?new Date(input.effectiveAt):new Date();
  if(Number.isNaN(effective.getTime()))throw new Error("Invalid entity history effective date");
  const recordedAt=new Date().toISOString();
  const row:CompanyFundsEntityHistoryRow={
    id:randomUUID(),
    entityType:input.entityType,
    entityId:input.entityId,
    effectiveAt:effective.toISOString(),
    recordedAt,
    reason:String(input.reason||"STATE_CHANGE").trim().slice(0,180)||"STATE_CHANGE",
    snapshot:input.snapshot,
  };
  await prisma.appSetting.create({
    data:{key:`${PREFIX}${row.entityType.toLowerCase()}.${row.entityId}.${row.id}`,value:JSON.stringify(row)},
  });
  return row;
}

export async function listCompanyFundsEntityHistory(entityType?:CompanyFundsHistoricalEntityType,entityId?:string){
  const keyPrefix=entityType
    ?`${PREFIX}${entityType.toLowerCase()}.${entityId?`${entityId}.`:""}`
    :PREFIX;
  const rows=await prisma.appSetting.findMany({
    where:{key:{startsWith:keyPrefix}},
    orderBy:{updatedAt:"asc"},
    take:20000,
    select:{value:true},
  });
  return rows.map(row=>parse(row.value)).filter((row):row is CompanyFundsEntityHistoryRow=>Boolean(row));
}

export async function getCompanyFundsEntityStateAsOf(entityType:CompanyFundsHistoricalEntityType,entityId:string,endExclusive:Date){
  const end=endExclusive.getTime();
  const rows=await listCompanyFundsEntityHistory(entityType,entityId);
  return rows
    .map(row=>({row,time:new Date(row.effectiveAt).getTime()}))
    .filter(item=>Number.isFinite(item.time)&&item.time<end)
    .sort((a,b)=>b.time-a.time)[0]?.row||null;
}
