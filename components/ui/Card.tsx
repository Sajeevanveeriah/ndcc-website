import { cn } from '@/lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
}

export default function Card({ className, children, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden',
        hover && 'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-6 py-4 border-b border-gray-100', className)}>{children}</div>;
}

export function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('px-6 py-4 bg-gray-50 border-t border-gray-100', className)}>{children}</div>
  );
}
