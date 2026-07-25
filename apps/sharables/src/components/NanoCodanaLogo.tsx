import React from 'react';

export const NanoCodanaLogo = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <defs>
      <linearGradient id="liquid-grad-1" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#8b5cf6" /> {/* Violet */}
        <stop offset="100%" stopColor="#6366f1" /> {/* Indigo */}
      </linearGradient>
      <linearGradient id="liquid-grad-2" x1="24" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ec4899" /> {/* Pink */}
        <stop offset="100%" stopColor="#8b5cf6" /> {/* Violet */}
      </linearGradient>
      <filter id="liquid-glow" x="-4" y="-4" width="32" height="32" filterUnits="userSpaceOnUse">
        <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Background Liquid Layer - Slower, larger morph */}
    <path
      fill="url(#liquid-grad-1)"
      opacity="0.5"
      filter="url(#liquid-glow)"
    >
      <animate
        attributeName="d"
        values="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2Z;
                M12 1C5 1 1 7 1 13C1 19 7 23 13 23C19 23 23 17 23 11C23 5 17 1 12 1Z;
                M14 2C8 2 2 8 2 14C2 20 8 22 14 22C20 22 22 16 22 10C22 4 18 2 14 2Z;
                M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2Z"
        dur="8s"
        repeatCount="indefinite"
      />
    </path>

    {/* Foreground Liquid Layer - Faster, distinct morph */}
    <path
      fill="url(#liquid-grad-2)"
      opacity="0.8"
      filter="url(#liquid-glow)"
    >
      <animate
        attributeName="d"
        values="M12 4C7.5 4 4 7.5 4 12C4 16.5 7.5 20 12 20C16.5 20 20 16.5 20 12C20 7.5 16.5 4 12 4Z;
                M13 3C8 3 3 8 3 13C3 18 8 21 13 21C18 21 21 16 21 11C21 6 16 3 13 3Z;
                M11 5C7 5 5 9 5 13C5 17 9 21 13 21C17 21 21 17 21 13C21 9 17 5 11 5Z;
                M12 4C7.5 4 4 7.5 4 12C4 16.5 7.5 20 12 20C16.5 20 20 16.5 20 12C20 7.5 16.5 4 12 4Z"
        dur="6s"
        repeatCount="indefinite"
      />
    </path>

    {/* Code Bracket Symbol - Floating */}
    <path
      d="M10 9L14 12L10 15"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="drop-shadow-md"
    >
      <animateTransform
        attributeName="transform"
        type="translate"
        values="0 0; 0 -1; 0 0"
        dur="3s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
);
