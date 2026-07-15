'use client';

import { cn } from '@/lib/utils';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';

/* Shared inline field-error caption: icon + red text, one recipe site-wide. */
function FieldError({ error }: { error: string }) {
  return (
    <p className="mt-1 flex items-start gap-1 text-sm text-red-600 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {error}
    </p>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="form-label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          className={cn(
            'form-input',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <FieldError error={error} />}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;

/* Password field with an accessible show/hide toggle. The toggle is a real button
   (type="button" so it never submits the form), keyboard reachable, and announces
   its state via aria-label + aria-pressed. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  ({ label, error, className, id, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="form-label">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            aria-invalid={error ? true : undefined}
            className={cn(
              'form-input pr-11',
              error && 'border-red-500 focus:ring-red-500',
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-content-muted hover:text-maroon-700 transition-colors focus-ring rounded-r-lg dark:text-slate-400 dark:hover:text-maroon-200"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {error && <FieldError error={error} />}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="form-label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          className={cn(
            'form-input min-h-[120px] resize-y',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <FieldError error={error} />}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, options, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="form-label">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          className={cn(
            'form-input',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <FieldError error={error} />}
      </div>
    );
  }
);

Select.displayName = 'Select';
