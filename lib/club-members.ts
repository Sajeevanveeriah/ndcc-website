export type ClubMemberInput = { full_name: string; email: string; phone: string; member_type: 'player' | 'social' | 'both' };
export function parseClubMember(value: Record<string, unknown>, verifiedEmail?: string): ClubMemberInput | null {
  const full_name = typeof value.full_name === 'string' ? value.full_name.trim() : '';
  const email = (verifiedEmail ?? (typeof value.email === 'string' ? value.email : '')).trim().toLowerCase();
  const phone = typeof value.phone === 'string' ? value.phone.trim() : '';
  const member_type = value.member_type;
  if (!full_name || full_name.length > 120 || /[\x00-\x1f]/.test(full_name)
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || phone.length > 40 || (phone && !/^[+()\d .-]+$/.test(phone))
    || !['player', 'social', 'both'].includes(String(member_type))) return null;
  return { full_name, email, phone, member_type: member_type as ClubMemberInput['member_type'] };
}
