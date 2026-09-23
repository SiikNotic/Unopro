interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

/** Game-style switch: recessed slot, bevelled knob and a lit track when ON. Fixed size, never overflows. */
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="toggle-hit shrink-0 inline-flex items-center justify-center rounded-full"
    >
      <span className={`toggle-track ${checked ? 'toggle-on' : ''}`}>
        <span className="toggle-knob" />
      </span>
    </button>
  );
}
