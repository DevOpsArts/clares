/**
 * ClaresLogo — shield + checkmark icon for CLARES
 *
 * variant="light"  → white icon on translucent bg  (for dark/navy panels)
 * variant="dark"   → white icon on navy solid bg    (for light/white panels)
 */
export default function ClaresLogo({ size = 36, variant = 'dark' }) {
  const bg     = variant === 'light' ? 'rgba(255,255,255,0.14)' : '#1e3a5f'
  const border = variant === 'light' ? 'rgba(255,255,255,0.22)' : 'transparent'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Badge background */}
      <rect width="40" height="40" rx="10" fill={bg} stroke={border} strokeWidth="1"/>

      {/* Shield outline */}
      <path
        d="M20 7 L9 11.5 V19.5 C9 26.5 13.8 32.5 20 34.5 C26.2 32.5 31 26.5 31 19.5 V11.5 Z"
        fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Checkmark */}
      <path
        d="M14 21 L18 25 L26 16"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
