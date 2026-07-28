"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...rest }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm text-slate mb-1.5 font-sans">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`w-full rounded-2xl bg-dusk-deep border border-ash px-4 py-3
          text-birch placeholder:text-slate/60 font-sans
          focus:border-ember focus:outline-none transition-colors ${className}`}
        {...rest}
      />
      {error && <p className="mt-1.5 text-sm text-red-300">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, className = "", id, ...rest }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm text-slate mb-1.5 font-sans">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={`w-full rounded-2xl bg-dusk-deep border border-ash px-4 py-3
          text-birch placeholder:text-slate/60 font-sans resize-none
          focus:border-ember focus:outline-none transition-colors ${className}`}
        {...rest}
      />
      {error && <p className="mt-1.5 text-sm text-red-300">{error}</p>}
    </div>
  )
);
TextArea.displayName = "TextArea";
