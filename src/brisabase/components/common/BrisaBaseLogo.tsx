import React from 'react';

interface BrisaBaseLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const BrisaBaseLogo: React.FC<BrisaBaseLogoProps> = ({ size = 'md', showText = true }) => {
  const iconSize = size === 'sm' ? 'w-7 h-7 text-base' : size === 'lg' ? 'w-11 h-11 text-2xl' : 'w-9 h-9 text-xl';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="flex items-center gap-3 select-none">
      <div className={`bb-brand-mark shrink-0 ${iconSize} rounded-xl font-black italic text-white`} aria-hidden="true">
        B
      </div>
      {showText && (
        <span className={`${textSize} font-bold tracking-tight`}>
          <span className="text-white">Brisa</span><span className="bb-gradient-text">Base</span>
        </span>
      )}
    </div>
  );
};
