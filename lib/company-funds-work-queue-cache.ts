import "server-only";

import { revalidateTag } from "next/cache";

export const COMPANY_FUNDS_WORK_QUEUE_TAG="company-funds-work-queue";

export function invalidateCompanyFundsWorkQueue(){
  revalidateTag(COMPANY_FUNDS_WORK_QUEUE_TAG);
}
