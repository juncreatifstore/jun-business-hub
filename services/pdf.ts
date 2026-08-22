import { renderDocumentPdf as renderLegacyDocumentPdf } from "@/services/pdf/index";
import { isFormalRelationshipNotice, renderFormalNoticePdf } from "@/services/pdf/formal-notice";

export * from "@/services/pdf/index";

export async function renderDocumentPdf(input: Parameters<typeof renderLegacyDocumentPdf>[0]): Promise<Uint8Array> {
  if (isFormalRelationshipNotice(input.title, input.html)) {
    return renderFormalNoticePdf(input);
  }
  return renderLegacyDocumentPdf(input);
}
