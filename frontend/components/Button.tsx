"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-ember text-birch hover:bg-ember-dim disabled:bg-ember/40",
  secondary: "bg-transparent text-birch border border-ash hover:border-slate disabled:opacity-40",
  ghost: "bg-transparent text-slate hover:text-birch disabled:opacity-40",
  danger: "bg-transparent text-red-500 border border-red-300 hover:bg-red-50 disabled:opacity-40",
};

const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", loading, className = "", children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3
        font-sans font-medium text-[15px] transition-colors duration-150
        disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? <span className="animate-pulse">···</span> : children}
    </button>
  )
);
Button.displayName = "Button";

export default Button;