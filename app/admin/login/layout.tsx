import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Committee login',
  description: 'Sign in to the NDCC committee administration area.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
