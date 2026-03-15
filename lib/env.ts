export function requireSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }
  return true;
}

export function requireStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return false;
  }
  return true;
}
