// Shared button styles for the analyser steps (small, uppercase, tracked).
const base =
  "rounded-lg px-4 py-2.5 text-[0.8125rem] font-bold tracking-wider uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButton = `${base} bg-brand text-white hover:bg-brand/90`;

export const secondaryButton = `${base} border border-line bg-[#f1f3f2] text-ink hover:bg-gray-200`;

// Shown wherever a step needs the reading model, which has no backend yet.
export const MODEL_NOT_CONNECTED =
  "The reading model isn't connected yet, so nothing was sent or read.";
