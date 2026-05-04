import { type SVGProps } from 'react';

export function XrdbMark({ ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 34 23"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect x="0" y="0" width="34" height="5" rx="2" fill="currentColor" />
      <rect x="0" y="9" width="22" height="5" rx="2" fill="currentColor" opacity="0.55" />
      <rect x="0" y="18" width="11" height="5" rx="2" fill="currentColor" opacity="0.25" />
    </svg>
  );
}
