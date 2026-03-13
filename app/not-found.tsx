import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center section-padding">
      <div className="text-center max-w-md">
        <Image
          src="/images/logo.jpg"
          alt="NDCC Logo"
          width={120}
          height={120}
          className="mx-auto mb-6 rounded-full"
        />
        <h1 className="text-6xl font-display font-bold text-maroon-700 mb-4">404</h1>
        <h2 className="text-2xl font-display font-bold text-gray-800 mb-4">
          Bowled Out!
        </h2>
        <p className="text-gray-600 font-body mb-8">
          Looks like this page has been caught behind. The page you&apos;re looking for
          doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/" className="btn-primary">
            Back to Home
          </Link>
          <Link href="/contact" className="btn-secondary">
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
