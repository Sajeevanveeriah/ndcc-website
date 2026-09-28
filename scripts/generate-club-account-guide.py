"""Generate the NDCC club account (My Account) member guide as Word (DOCX) and PDF.

Reuses the layout, colours and renderers of scripts/generate-dino-manual.py, so it has the
same requirements. Run from the repository root:
    python3 scripts/generate-club-account-guide.py
Outputs go to public/documents/. Wording follows the member-facing copy in app/club-account,
components/club-account and app/api/club-account; update both together.
"""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('dino_manual', Path(__file__).with_name('generate-dino-manual.py'))
manual = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manual)

manual.STEM = '20260928-NDCC-Club-Account-Guide-Rev00'
manual.DATE = '28 September 2026'
manual.REVISION = 'Rev00'
manual.TITLE = 'My club account'
manual.SUBTITLE = 'Member guide | My Account'
manual.SUBJECT = f'Club account member guide, {manual.REVISION}'
manual.HEADER_TEXT = f'NDCC / MY CLUB ACCOUNT    {manual.DATE} | {manual.REVISION}'
manual.INTRO = ('Your club account keeps your details, website purchases, raffle tickets, interests and club updates '
                'in one place. It uses the same sign-in as Dino Coach. This guide explains how to create your account, '
                'what each section does and how the club handles your information.')

manual.CONTENT = [
    ('h1', 'At a glance'),
    ('table', ['Topic', 'How it works'], [
        ['Where', 'www.ndcc.com.au/club-account, or My Account in the website menu'],
        ['Sign-in', 'Email address and password of at least 8 characters'],
        ['Confirmation', 'Confirm your email address before you first sign in'],
        ['Purchases', 'Website orders and raffle tickets placed with your sign-in email'],
        ['Dino Coach', 'Same sign-in; see your team, rank and points'],
        ['Your data', 'Download your data or ask the club to delete your account'],
        ['Not included', 'PlayHQ player registration and membership payment are separate'],
    ]),
    ('tip', 'Open your club account', 'www.ndcc.com.au/club-account'),

    ('h1', 'Create your account and sign in'),
    ('h2', 'Create your account'),
    ('steps', [
        'Open www.ndcc.com.au/club-account and select Create an account.',
        'Enter your email address and a password of at least 8 characters, then select Create account.',
        'Open the confirmation email and follow the link. Check your spam folder if it does not arrive, or select '
        'Resend confirmation email.',
        'Sign in, open My details, enter your full name and what you are interested in, accept the privacy '
        'statement and select Save my details.',
    ]),
    ('p', 'If the committee already holds a club record with your email address, it is linked to your new account '
          'automatically. Check your details and accept the privacy statement to finish.'),
    ('h2', 'Forgotten password'),
    ('p', 'Enter your email address on the sign-in form and select Reset password. Open the most recent reset email '
          'on the same device, enter your new password twice and select Set new password.'),
    ('note', 'Already playing Dino Coach?', 'Your Dino Coach sign-in is your club account. Sign in with the same '
             'email address and password; there is no need to register again.'),

    ('h1', 'Your dashboard'),
    ('table', ['Section', 'What you can do'], [
        ['Overview', 'Balance owing, quick links, upcoming events and latest club news'],
        ['My purchases and tickets', 'Website orders, event purchases and raffle tickets'],
        ['Dino Coach', 'Your team, rank and points, or a link to join (while Dino Coach is running)'],
        ['My interests', 'Choose club news topics and ways you might help'],
        ['My details', 'Contact details, sign-in email, data download and deletion request'],
        ['Volunteer tools', 'Record trailer raffle cash sales (active members only)'],
    ]),
    ('h2', 'Overview'),
    ('p', 'Balance owing shows any amount still due on your website orders, with a Pay balance link for each order. '
          'What would you like to do? links to events and tickets, club meals, apparel and merchandise, newsletters, '
          'player registration, social membership, Pot Club and volunteering. While a club prize wheel is running, a '
          'Spin the Wheel card also appears.'),
    ('h2', 'My interests'),
    ('p', 'Tick the topics you would like to hear about and the areas where you might help. Every choice is optional '
          'and records your interest only; it does not book you for a shift. Club emails about your interests are '
          'sent only if you tick the email consent box. You can untick it or select Unsubscribe from club emails at '
          'any time. Order receipts and account security emails are separate.'),
    ('h2', 'Volunteer tools'),
    ('p', 'Once the club confirms your membership as active, Volunteer tools lets you record trailer raffle cash '
          'sales. Record cash only after collecting it, then hand the money to the club.'),

    ('h1', 'Purchases, tickets and payments'),
    ('p', 'My purchases and tickets lists website orders placed with your sign-in email. Purchases made under a '
          'different email address do not appear. Use the Purchase type menu to switch between orders and event '
          'purchases and raffle tickets.'),
    ('table', ['You will see', 'Meaning'], [
        ['Total, Paid and Balance', 'What the order cost, what has been paid and what remains'],
        ['Your ticket numbers', 'Raffle ticket numbers, shown once payment is confirmed'],
        ['Bank transfer selected', 'The club is awaiting confirmation of your transfer'],
        ['Pay apparel balance', 'Pay the remaining apparel balance by card'],
        ['Payment options / bank deposit', 'Other ways to pay an outstanding balance'],
        ['Contact the club about this purchase', 'The order needs review or has been refunded'],
    ]),
    ('note', 'Receipts', 'For a receipt or help with an older purchase, contact the club and quote your order '
             'reference.'),

    ('h1', 'Your details, privacy and your data'),
    ('table', ['Setting', 'What happens'], [
        ['Save my details', 'Updates your name, optional phone number and interest in playing or social membership'],
        ['Change my sign-in email', 'Confirm the change from your inbox; orders under the old email no longer show'],
        ['Download my data', 'Saves your details, interests and website purchases as a JSON file'],
        ['Request account deletion', 'Sends a request to the club; you can add an optional reason'],
    ]),
    ('p', 'Deletion is actioned by the club rather than instantly. Order, payment and raffle records are kept as the '
          'club\'s financial records. Your contact details are private and are not a public member directory. '
          'Creating an account does not subscribe you to unrelated marketing.'),
    ('p', 'Your club account does not replace PlayHQ player registration or membership payment. The club confirms '
          'membership and playing registration separately.'),

    ('h1', 'Help and links'),
    ('links', [
        ('My club account', 'www.ndcc.com.au/club-account'),
        ('Dino Coach', 'www.ndcc.com.au/fantasy'),
        ('Events', 'www.ndcc.com.au/events'),
        ('Merchandise', 'www.ndcc.com.au/merchandise'),
        ('Privacy statement', 'www.ndcc.com.au/privacy'),
        ('Contact the club', 'www.ndcc.com.au/contact'),
    ]),
    ('tip', 'Need help?', 'Use Ask about my account under My details, or contact the club through '
            'www.ndcc.com.au/contact.'),
]

if __name__ == '__main__':
    manual.main()
