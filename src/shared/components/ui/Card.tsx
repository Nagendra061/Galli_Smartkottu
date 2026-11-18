import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div
      className={`bg-surface-card border border-border-default rounded-xl shadow-[var(--shadow-card)] ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
