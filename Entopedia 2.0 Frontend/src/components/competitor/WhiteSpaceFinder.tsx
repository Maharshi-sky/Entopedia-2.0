import { Card } from "@/components/ui/Card";
import type { WhiteSpace, WhiteSpaceCell as Cell } from "@/data/competitors";
import { SourceBox } from "./SourceBox";

function CellMark({ cell }: { cell: Cell }) {
  if (cell === "open") {
    return (
      <span className="inline-block rounded border border-emerald-200 bg-brand-soft px-2 py-1 text-[0.75rem] font-bold tracking-wide text-brand">
        OPEN
      </span>
    );
  }
  if (cell === "claimed") {
    return (
      <span
        aria-label="Claimed"
        className="inline-block size-1.5 rounded-full bg-gray-400"
      />
    );
  }
  return <span className="text-gray-300">—</span>;
}

export function WhiteSpaceFinder({ data }: { data: WhiteSpace }) {
  const { formats, actives } = data;
  return (
    <Card className="flex flex-col">
      <h2 className="text-xs font-semibold tracking-widest text-ink uppercase">
        White-Space Finder
      </h2>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-brand text-white">
              <th className="rounded-l-md px-2 py-2 text-left font-semibold">
                Active
              </th>
              {formats.map((f, i) => (
                <th
                  key={f}
                  className={`px-2 py-2 font-semibold ${
                    i === formats.length - 1 ? "rounded-r-md" : ""
                  }`}
                >
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actives.map((a) => (
              <tr key={a.name} className="even:bg-[#f5f6f5]">
                <td className="px-2 py-3 text-ink">{a.name}</td>
                {a.cells.map((cell, i) => (
                  <td key={formats[i]} className="px-2 py-3 text-center">
                    <CellMark cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SourceBox
        caption="Empty cells are unclaimed opportunity."
        sources={["USPTO", "EPO", "IP India", "CIB&RC"]}
        confidence={84}
        status="Inferred"
      />
    </Card>
  );
}
