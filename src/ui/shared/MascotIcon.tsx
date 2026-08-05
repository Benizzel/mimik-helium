export default function MascotIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="20 50 160 120"
      width={size}
      height={Math.round((size * 120) / 160)}
      className="block shrink-0"
    >
      <defs>
        <clipPath id="fds">
          <path d="M30 95 L170 60 L170 95 Z" />
        </clipPath>
      </defs>
      <rect x="30" y="95" width="140" height="68" rx="5" className="fill-primary" />
      <path d="M30 95 L30 80 Q30 60, 100 60 Q170 60, 170 80 L170 95 Z" className="fill-violet-mid" />
      <path d="M30 95 L30 80 Q30 60, 100 60 Q170 60, 170 80 L170 95 Z" className="fill-accent" clipPath="url(#fds)" />
      <rect x="30" y="93" width="140" height="3" className="fill-lavender" />
      <path d="M68 122 Q76 112 84 122" className="stroke-lavender" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path
        d="M116 122 Q124 112 132 122"
        className="stroke-lavender"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M84 138 Q100 148 116 138"
        className="stroke-lavender"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
