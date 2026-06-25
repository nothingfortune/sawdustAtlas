// Shared labelled number input used across the editor panels (board designer,
// shop planner, milling allowances). Clearing the input yields 0 (Number('')).
export function NumberField({ label, value, min = 0, step = 1, onChange }: { label: string; value: number; min?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" min={min} step={step} value={value} onChange={event => onChange(Number(event.target.value))}/></label>
}
