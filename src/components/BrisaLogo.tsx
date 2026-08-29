import React from 'react';
import logoBrisaBase from '../img/logoBrisa_base.png';
import iconB from '../img/icon_B.png';

interface BrisaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  showSlogan?: boolean;
}

export const BrisaLogo: React.FC<BrisaLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  showSlogan = false
}) => {
  const logoSizes = {
    sm: 'h-7 max-w-[165px]',
    md: 'h-9 max-w-[215px]',
    lg: 'h-12 max-w-[285px]',
    xl: 'h-16 max-w-[380px]'
  };

  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-24 h-24'
  };

  return (
    <div
      className={`select-none ${showSlogan ? 'flex flex-col items-start gap-1.5' : 'flex items-center'} ${className}`}
    >
      <img
        src={showText ? logoBrisaBase : iconB}
        alt="BrisaBase"
        className={`${showText ? `${logoSizes[size]} w-auto` : `${iconSizes[size]} object-contain`} shrink-0 drop-shadow-[0_0_14px_rgba(18,217,255,0.22)]`}
        draggable={false}
      />

      {showSlogan && showText && (
        <span className="pl-1 text-[9px] sm:text-[10px] tracking-[0.24em] text-cyan-400/90 font-semibold uppercase whitespace-nowrap">
          Sua base. Seu futuro.
        </span>
      )}
    </div>
  );
};
