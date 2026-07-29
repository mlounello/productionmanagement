export function assignmentConfirmationExempt(input: {
  isGuestArtist: boolean;
  isSienaEmployee: boolean;
}) {
  return input.isGuestArtist || input.isSienaEmployee;
}

export function assignmentUsesStudentAcceptance(input: {
  personType: string;
  isGuestArtist: boolean;
  isSienaEmployee: boolean;
}) {
  return input.personType === "student" && !assignmentConfirmationExempt(input);
}
