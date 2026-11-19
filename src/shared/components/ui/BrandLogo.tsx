import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  badge?: string;
}

export function BrandLogo({ className = '', size = 'md', badge }: BrandLogoProps) {
  const heightClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-11',
    xl: 'h-14 md:h-16',
  };

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <img
        src="/logo.png"
        alt="Galli Smartkottu"
        className={`${heightClasses[size]} w-auto object-contain shrink-0`}
      />
      {badge && (
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-accent-soft text-accent-primary border border-accent-primary/20 shrink-0">
          {badge}
        </span>
      )}
    </div>
  );
}
