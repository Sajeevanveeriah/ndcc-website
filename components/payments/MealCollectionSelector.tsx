'use client';

import { useId } from 'react';
import {
  MEAL_COLLECTION_REQUIRED_MESSAGE,
  MEAL_COLLECTION_WINDOWS,
  type MealCollectionWindow,
} from '../../lib/meal-collection';

type MealCollectionSelectorProps = {
  value: MealCollectionWindow | '';
  onChange: (value: MealCollectionWindow) => void;
  showError?: boolean;
  disabled?: boolean;
};

/** Controlled input: the order draft owns the selection; there is no default. */
export default function MealCollectionSelector({
  value,
  onChange,
  showError = false,
  disabled = false,
}: MealCollectionSelectorProps) {
  const id = useId();
  const invalid = showError && !value;

  return (
    <fieldset
      disabled={disabled}
      role="radiogroup"
      aria-required="true"
      aria-invalid={invalid || undefined}
      aria-describedby={`${id}-help${invalid ? ` ${id}-error` : ''}`}
      className="min-w-0 space-y-3"
    >
      <legend className="font-semibold text-content-primary">Choose your meal collection time</legend>
      <p id={`${id}-help`} className="text-sm text-content-secondary">
        Choose one window for your whole order. Collection times are in Australia/Melbourne.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MEAL_COLLECTION_WINDOWS.map((window) => (
          <label
            key={window.value}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 p-4 text-content-primary focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-current ${
              value === window.value
                ? 'border-maroon-600 bg-maroon-50 dark:border-maroon-200 dark:bg-maroon-950'
                : 'border-edge-strong bg-surface-card'
            } ${disabled ? 'cursor-wait opacity-60' : ''}`}
          >
            <input
              type="radio"
              name={`meal-collection-${id}`}
              value={window.value}
              checked={value === window.value}
              onChange={() => onChange(window.value)}
              aria-describedby={invalid ? `${id}-error` : undefined}
              className="h-5 w-5 shrink-0 accent-maroon-600 dark:accent-maroon-200"
            />
            <span className="font-semibold">{window.label}</span>
          </label>
        ))}
      </div>
      {invalid && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700 dark:text-red-300">
          {MEAL_COLLECTION_REQUIRED_MESSAGE}
        </p>
      )}
    </fieldset>
  );
}
