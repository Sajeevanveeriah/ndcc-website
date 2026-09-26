/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import PaymentMethodChoice from '@/components/payments/PaymentMethodChoice';
import BankTransferInstructions, { type BankTransferConfirmation } from '@/components/payments/BankTransferInstructions';

import { useEffect, useState } from 'react';
import { formatDinoDollars, formatEntryFee, isAdultOnDate } from '@/lib/dino-coach/domain';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { fantasyJsonFetch, getFantasyBrowserClient, isFantasySupabaseConfigured } from '@/lib/fantasy-browser';

type Mode = 'register' | 'login' | 'account';

// Matches the club account sign-up rule. Sign-in accepts any existing password
// so accounts created under the earlier 6-character rule keep working.
const MIN_PASSWORD_LENGTH = 8;

function normaliseAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
}

function getFantasyEmailRedirectTo() {
  return `${getSiteUrl().replace(/\/$/, '')}/fantasy/account`;
}

export function FantasyAuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [rulesVersion, setRulesVersion] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setContacts] = useState<string[]>([]);
  const [entry, setEntry] = useState<any>(null);
  const [manager, setManager] = useState<any>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'bank_transfer'>('stripe');
  const [bankConfirmation, setBankConfirmation] = useState<BankTransferConfirmation | null>(null);
  const [startingPayment, setStartingPayment] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [settingsEntryFee, setSettingsEntryFee] = useState<string | null>(null);
  const [budgetDinoDollars, setBudgetDinoDollars] = useState<number | null>(null);

  useEffect(() => {
    if (mode === 'login') return;
    let cancelled = false;
    setAvailabilityError(false);
    setRegistrationOpen(null);
    fantasyJsonFetch<any>('/api/fantasy/players')
      .then((result) => {
        if (!cancelled) {
          setRegistrationOpen(result?.settings?.is_registration_open === true);
          setRulesVersion(result?.settings?.rules_version || '');
          setSettingsEntryFee(formatEntryFee(result?.settings?.entry_fee_cents, result?.settings?.entry_fee_currency));
          const budget = Number(result?.settings?.budget_dino_dollars);
          setBudgetDinoDollars(Number.isFinite(budget) && budget > 0 ? budget : null);
        }
      })
      .catch(() => {
        // Fail closed until the current rules and registration state are known.
        if (!cancelled) setAvailabilityError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, availabilityAttempt]);

  useEffect(() => {
    if (mode !== 'account') return;
    if (!isFantasySupabaseConfigured) {
      setFeedback({ type: 'error', message: 'Dino Coach sign-in is not configured yet.' });
      return;
    }

    const loadAccount = async () => {
      const client = getFantasyBrowserClient();
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          setFeedback({ type: 'error', message: `Confirmation link could not be completed: ${error.message}` });
          return;
        }
        window.history.replaceState({}, '', '/fantasy/account');
      }

      const { data } = await client.auth.getSession();
      setSessionEmail(data.session?.user.email ?? null);
      if (!data.session) return;
      fantasyJsonFetch<any>('/api/fantasy/manager')
        .then(async (result) => {
          setManager(result.manager);
          setEntry(result.entry);
          if (result.entry?.bank_transfer_selected_at) setPaymentMethod('bank_transfer');
          setContacts(result.reactivationContacts || []);
          const metadataDisplayName = typeof data.session?.user.user_metadata?.display_name === 'string' ? data.session.user.user_metadata.display_name : '';
          const metadataTeamName = typeof data.session?.user.user_metadata?.team_name === 'string' ? data.session.user.user_metadata.team_name : '';
          const metadataDob = typeof data.session?.user.user_metadata?.date_of_birth === 'string' ? data.session.user.user_metadata.date_of_birth : '';
          const metadataRules = typeof data.session?.user.user_metadata?.rules_version === 'string' ? data.session.user.user_metadata.rules_version : '';
          const nextDisplayName = result.manager?.display_name || metadataDisplayName;
          const nextTeamName = result.manager?.team_name || metadataTeamName;
          setDisplayName(nextDisplayName);
          setTeamName(nextTeamName);
          setDateOfBirth(result.manager?.date_of_birth || metadataDob);
          setRulesAccepted(false);

          if (!result.manager && metadataDisplayName && metadataTeamName && metadataDob && metadataRules) {
            setAutoCreating(true);
            try {
              const created = await fantasyJsonFetch<any>('/api/fantasy/manager', {
                method: 'POST',
                body: JSON.stringify({ displayName: metadataDisplayName, teamName: metadataTeamName, dateOfBirth: metadataDob, rulesVersion: metadataRules, rulesAccepted: true }),
              });
              setManager(created.manager);
              setFeedback({ type: 'success', message: 'Dino Coach manager profile created from your confirmed account details.' });
            } catch (err) {
              setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not create your Dino Coach manager profile automatically.' });
            } finally {
              setAutoCreating(false);
            }
          }
        })
        .catch((err) => setFeedback({ type: 'error', message: err.message }));
    };

    loadAccount().catch((err) => setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not load your Dino Coach account.' }));
  }, [mode]);

  const managerId = manager?.id;
  useEffect(() => {
    if (mode !== 'account' || !managerId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await fantasyJsonFetch<any>('/api/fantasy/manager');
        if (!cancelled) {
          setEntry(result.entry);
          if (result.entry?.bank_transfer_selected_at) setPaymentMethod('bank_transfer');
          setManager(result.manager);
          setContacts(result.reactivationContacts || []);
        }
      } catch { /* Keep the last confirmed status and allow manual refresh. */ }
    };
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, entry?.status === 'pending' ? 5000 : 30000);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [mode, managerId, entry?.status]);

  const saveProfile = async () => {
    const result = await fantasyJsonFetch<any>('/api/fantasy/manager', {
      method: 'POST',
      body: JSON.stringify({ displayName, teamName, dateOfBirth, rulesVersion, rulesAccepted }),
    });
    setManager(result.manager);
    setFeedback({ type: 'success', message: 'Dino Coach manager profile saved.' });
  };

  const handleResend = async () => {
    setResending(true);
    const targetEmail = normaliseAuthEmail(email);
    try {
      const { error } = await getFantasyBrowserClient().auth.resend({ type: 'signup', email: targetEmail, options: { emailRedirectTo: getFantasyEmailRedirectTo() } });
      if (error) throw error;
      setFeedback({ type: 'success', message: `If this address needs verification, a confirmation email has been requested for ${targetEmail}. Check your inbox and spam folder. If you already have an NDCC account, sign in with your existing password or use Forgot password.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not resend email.' });
    } finally {
      setResending(false);
    }
  };
  const handleForgotPassword = async () => {
    setFeedback(null);
    const targetEmail = normaliseAuthEmail(email);
    if (!targetEmail) {
      setFeedback({ type: 'error', message: 'Enter your email above, then choose Forgot password.' });
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await getFantasyBrowserClient().auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/fantasy/reset-password`,
      });
      if (error) throw error;
      setFeedback({ type: 'success', message: `Password reset email sent to ${targetEmail}. Follow the link in that email to set a new password.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not send the password reset email.' });
    } finally {
      setSendingReset(false);
    }
  };

  const handleSignOut = async (redirectTo?: '/fantasy/register') => {
    setSigningOut(true);
    setFeedback(null);
    try {
      const { error } = await getFantasyBrowserClient().auth.signOut();
      if (error) throw error;
      setSessionEmail(null);
      setManager(null);
      setDisplayName('');
      setTeamName('');
      if (redirectTo) window.location.href = redirectTo;
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not sign out.' });
    } finally {
      setSigningOut(false);
    }
  };

  const startPayment = async () => {
    setStartingPayment(true); setFeedback(null);
    try { const result = await fantasyJsonFetch<any>('/api/fantasy/checkout', { method: 'POST', body: JSON.stringify({ payment_method: paymentMethod }) }); if (result.bank_transfer) { setBankConfirmation(result); setStartingPayment(false); return; } window.location.href = result.url; }
    catch (err) { setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Could not start secure Checkout.' }); setStartingPayment(false); }
  };

  const submit = async () => {
    if (mode === 'register' && registrationOpen !== true) {
      setFeedback({ type: 'error', message: 'Dino Coach registration is currently closed.' });
      return;
    }
    if (mode !== 'login' && (!displayName.trim() || !teamName.trim() || !rulesAccepted || !rulesVersion || !isAdultOnDate(dateOfBirth, new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' }), 18))) {
      setFeedback({ type: 'error', message: 'Enter your name, team name and valid date of birth, and accept the current rules. You must be at least 18.' });
      return;
    }
    const authEmail = normaliseAuthEmail(email);
    if (mode !== 'account' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail)) {
      setFeedback({ type: 'error', message: 'Enter a valid email address.' });
      return;
    }
    if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) {
      setFeedback({ type: 'error', message: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (mode === 'login' && !password) {
      setFeedback({ type: 'error', message: 'Enter your password.' });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      if (mode === 'register') {
        const { data, error } = await getFantasyBrowserClient().auth.signUp({
          email: authEmail,
          password,
          options: {
            data: { display_name: displayName.trim(), team_name: teamName.trim(), date_of_birth: dateOfBirth, rules_version: rulesVersion },
            emailRedirectTo: getFantasyEmailRedirectTo(),
          },
        });
        if (error) throw error;
        if (data.session) {
          await saveProfile();
          window.location.href = '/fantasy/account';
        } else {
          setAwaitingConfirm(true);
          setFeedback({
            type: 'success',
            message: `If ${authEmail} is a new account, check your inbox and spam folder for a confirmation link. Already have an NDCC account? Sign in with your existing password or use Forgot password. Existing verified accounts do not receive another sign-up confirmation.`,
          });
        }
      } else if (mode === 'login') {
        const { error } = await getFantasyBrowserClient().auth.signInWithPassword({ email: authEmail, password });
        if (error) throw error;
        window.location.href = '/fantasy/account';
      } else {
        await saveProfile();
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Request failed.' });
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'account' && !sessionEmail) {
    return (
      <Card><CardContent className="p-6"><p className="font-body text-content-secondary mb-4">Sign in to manage your Dino Coach account.</p>{feedback && <p role="alert" className="mb-4">{feedback.message}</p>}<Link className="btn-primary" href="/fantasy/login">Sign in</Link></CardContent></Card>
    );
  }

  if (mode === 'account' && manager?.deleted_at) {
    return <Card><CardContent className="p-6 space-y-4">
      <p role="status">Your team has been deleted from play and public standings. You are still signed in as {sessionEmail}.</p>
      <p>To use a different email, sign out and register a new account. Your previous registration and payment history remain with the old account. Contact the club if you want that team restored.</p>
      {feedback && <p role="alert">{feedback.message}</p>}
      <div className="flex flex-wrap gap-3"><Button onClick={()=>handleSignOut('/fantasy/register')} isLoading={signingOut}>Sign out and register with a different email</Button><Button onClick={()=>handleSignOut()} disabled={signingOut} variant="secondary">Sign out</Button></div>
    </CardContent></Card>;
  }

  const registrationClosed = mode === 'register' && registrationOpen === false;
  // Prefer the fee recorded on the entry, then the season setting, then the published fee.
  const entryFee = formatEntryFee(entry?.entry_fee_cents, entry?.currency) || settingsEntryFee || 'AUD 25.00';
  const budgetLabel = budgetDinoDollars ? formatDinoDollars(budgetDinoDollars) : '15 million Dino Dollars';

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        {mode === 'register' && !registrationClosed && <p className="text-sm font-body text-content-secondary">Already have an NDCC account? <Link href="/fantasy/login" className="font-semibold underline">Sign in with your existing account</Link>. You can use Forgot password on the sign-in page if needed.</p>}
        {mode === 'register' && registrationOpen === null && !availabilityError && <p role="status" className="text-sm">Checking registration availability...</p>}
        {availabilityError && <div role="alert" className="space-y-3"><p>Could not check registration availability and the current rules. Please retry.</p><Button variant="secondary" onClick={() => setAvailabilityAttempt(attempt => attempt + 1)}>Retry registration check</Button></div>}
        {registrationClosed && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-body text-amber-900">
              <strong>Dino Coach registration is currently closed.</strong> New manager sign-ups are paused by the club. Already have an account?{' '}
              <Link href="/fantasy/login" className="font-semibold text-maroon-700 dark:text-maroon-200 hover:underline">Sign in instead</Link>.
            </p>
          </div>
        )}
        {mode !== 'login' && <Input id="displayName" label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />}
        {mode !== 'login' && <Input id="teamName" label="Dino Coach team name" value={teamName} onChange={(event) => setTeamName(event.target.value)} required />}
        {mode !== 'account' && <Input id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}
        {mode !== 'account' && <Input id="password" label="Password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? MIN_PASSWORD_LENGTH : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required />}
        {mode === 'register' && <p className="text-sm font-body text-content-muted">Use at least {MIN_PASSWORD_LENGTH} characters for your password.</p>}
        {mode === 'register' && settingsEntryFee && <p className="text-sm font-body text-content-secondary">The entry fee is {settingsEntryFee}, paid after you confirm your email and your team name is approved.</p>}
        {mode !== 'login' && <Input id="dateOfBirth" label="Date of birth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required />}
        {mode === 'account' && manager && rulesVersion && manager.rules_version_accepted !== rulesVersion && <p role="status" className="rounded-lg border p-4">Dino Coach now has a budget of {budgetLabel}, a live wallet and sales back to the player pool. Inter-team trades are unavailable. Read the updated rules, tick the acceptance box and save your profile before changing your team.</p>}
        {mode !== 'login' && <label className="flex items-start gap-3 text-sm font-body"><input className="mt-1 h-5 w-5" type="checkbox" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} required /><span>I am at least 18 and accept the current <Link className="font-semibold text-maroon-700 hover:underline" href="/fantasy/rules">Dino Coach rules</Link>{rulesVersion ? ` (${rulesVersion})` : ''}.</span></label>}
        {mode === 'account' && <p className="text-sm text-content-muted font-body">Signed in as {sessionEmail}. {manager ? (manager.deleted_at ? 'Your team is deleted. Contact the club to restore it.' : 'Your manager profile is registered.') : autoCreating ? 'Creating your manager profile from your sign-up details...' : 'Create your manager profile to play.'}</p>}
        {mode === 'account' && manager && <div className="rounded-lg border p-4 text-sm" role="status"><strong>{entry?.fee_waived ? 'Complimentary entry - no payment required.' : entry?.is_demo ? 'Demo access enabled - no payment required. Demo teams are not eligible for prizes.' : entry?.status === 'paid' ? 'Entry paid.' : entry?.status === 'pending' ? 'Payment confirmation pending. This page updates automatically.' : `Entry payment required: ${entryFee}.`}</strong>{entry?.payment_reference && <p>Reference: {entry.payment_reference}</p>}{manager.team_name_status === 'review_required' && <p>Your team name needs committee approval before payment.</p>}</div>}
        {mode === 'account' && manager && !manager.first_squad_completed_at && <p className="text-sm">Your registration does not expire. Choose and submit your 15-player squad before the round locks.</p>}
        {mode === 'account' && manager && <Link href="/fantasy/reset-password" className="underline">Change password</Link>}
        {feedback && <p role="status" className={`text-sm font-body ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}
        <div className="flex flex-wrap gap-3">
          {!awaitingConfirm && (
            <Button onClick={submit} isLoading={loading} disabled={mode === 'register' && registrationOpen !== true}>
              {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Register' : 'Save profile'}
            </Button>
          )}
          {awaitingConfirm && (
            <>
              <Button onClick={handleResend} isLoading={resending} variant="secondary">
                Resend confirmation email
              </Button>
              <Link href="/fantasy/login" className="btn-primary">Sign in to your account</Link>
            </>
          )}
          {!awaitingConfirm && (
            mode === 'login'
              ? <Link href="/fantasy/register" className="btn-secondary">Register</Link>
              : <Link href="/fantasy/login" className="btn-secondary">Sign in</Link>
          )}
          {mode === 'account' && sessionEmail && (
            <Button onClick={()=>handleSignOut()} isLoading={signingOut} variant="secondary">
              Sign out
            </Button>
          )}
          {mode === 'account' && manager && !entry?.is_demo && !entry?.fee_waived && entry?.status !== 'paid' && <div className="space-y-3">{bankConfirmation ? <BankTransferInstructions confirmation={bankConfirmation} /> : <><PaymentMethodChoice method={paymentMethod} onChange={setPaymentMethod} /><Button onClick={startPayment} isLoading={startingPayment} disabled={!['approved', 'replaced'].includes(manager.team_name_status) || !registrationOpen}>{paymentMethod === 'bank_transfer' ? 'Continue with bank deposit' : `Pay ${entryFee} entry`}</Button></>}</div>}
          {mode === 'account' && (entry?.fee_waived || entry?.is_demo || entry?.status === 'paid') && <Link href="/fantasy/squad" className="btn-primary">Pick my team</Link>}
        </div>
        {mode === 'login' && !awaitingConfirm && (
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={sendingReset}
            className="text-sm font-body font-semibold text-maroon-700 dark:text-maroon-200 hover:underline disabled:opacity-60"
          >
            {sendingReset ? 'Sending reset email…' : 'Forgot password?'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
