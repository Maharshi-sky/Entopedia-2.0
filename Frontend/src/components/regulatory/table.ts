// Shared styles for the regulatory tables.
// The frame rounds and clips; a separate inner div scrolls sideways on small screens,
// so the rounded corners stay clean on every edge.
export const tableFrame = "overflow-hidden rounded-xl border border-line bg-white";
export const tableScroll = "overflow-x-auto";
export const table = "w-full min-w-[44rem] text-[0.9375rem]";
export const th =
  "border-r border-line px-4 py-3 text-left text-[0.8125rem] font-medium tracking-wider text-gray-500 uppercase last:border-r-0";
export const td = "border-r border-line px-4 py-3 last:border-r-0";
