'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onChange, className = '', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 items-center border border-outline-variant
          transition-all duration-200
          ${checked ? 'bg-primary/20 border-primary' : 'bg-[#0c0c0c] border-outline-variant'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50'}
          ${className}
        `}
        {...props}
      >
        <span
          className={`
            inline-block h-4 w-4 transition-all duration-200
            ${checked ? 'translate-x-5 bg-primary' : 'translate-x-1 bg-outline-variant'}
          `}
        />
      </button>
    );
  },
);

Switch.displayName = 'Switch';
