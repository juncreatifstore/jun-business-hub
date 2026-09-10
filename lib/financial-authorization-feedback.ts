const messages: Record<string, string> = {
  "Requester cannot approve their own financial authorization": "Vous avez demandé cette autorisation. Un autre Super Admin doit prendre la décision.",
  "You already decided this authorization": "Votre décision est déjà enregistrée. Une autre personne doit compléter les approbations requises.",
  "Authorization is no longer pending": "Cette demande a déjà été traitée. Actualisez la page pour voir son statut.",
  "Authorization not found": "Cette autorisation est introuvable. Actualisez la page.",
};
export function financialAuthorizationError(error: unknown) {
  const message = error instanceof Error ? messages[error.message] : undefined;
  return message || "La décision n’a pas pu être confirmée. Actualisez la page avant de réessayer.";
}
