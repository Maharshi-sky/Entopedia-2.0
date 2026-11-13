"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";
import { AskForm } from "@/components/ui/AskForm";
import { Card } from "@/components/ui/Card";
import { clientApi } from "@/lib/client-api";
import type { ClaimEvidence, EvidenceStatus as Status } from "@/data/claims";

const statusStyle: Record<string, string> = {
  Substantiated: "bg-amber-50 text-amber-600 border border-amber-200",
  "Substantiation Attached": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Argument-supported": "bg-[#E4572E33] text-[#E4572E]",
  "Literature-supported": "bg-indigo-50 text-indigo-600",
  Unsupported: "bg-red-100 text-red-700",
  "Non-Compliant (High Risk)": "bg-red-50 text-red-700 border border-red-200",
  Expired: "bg-[#E0E5E1] text-gray-600",
  "Pending Review": "bg-amber-50 text-amber-600 border border-amber-200",
};

const verificationBadge: Record<string, string> = {
  Verified: "bg-emerald-100 text-emerald-800",
  "Pending Review": "bg-amber-100 text-amber-800",
  Disputed: "bg-red-100 text-red-800",
};

const th = "px-4 py-3 text-left text-[0.875rem] font-semibold text-ink";
const td = "px-4 py-3";

type Message = { role: "assistant" | "user"; text: string };

const GREETING: Message = {
  role: "assistant",
  text: "Ask about any claim's evidence base. I can retrieve WHO test protocols, argument chains, and regulatory precedents.",
};

export function ClaimsEvidence({ claims: initialClaims }: { claims: ClaimEvidence[] }) {
  const [evidenceList, setEvidenceList] = useState<any[]>(initialClaims || []);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadLiveEvidence() {
      try {
        const res = await clientApi<{ data: any[] }>("/claim/evidence-matrix");
        if (res.data && res.data.length > 0) {
          setEvidenceList(res.data);
        }
      } catch (err) {
        console.warn("Could not fetch evidence matrix, using props:", err);
      }
    }
    loadLiveEvidence();
  }, []);

  async function ask(question: string) {
    setMessages((prev) => [...prev, { role: "user", text: question }]);

    try {
      // Dynamic claim evaluation via backend rule engine
      const res = await clientApi<any>("/claim/assess", {
        method: "POST",
        body: JSON.stringify({ text: question }),
      });

      let reply = `Evaluated: Overall Risk is ${res.risk?.toUpperCase().replace(/_/g, " ")}. `;
      if (res.matches && res.matches.length > 0) {
        reply += `Matched ${res.matches.length} regulatory guidelines. Rule: ${res.matches[0].reason} Required Protocol: ${res.matches[0].protocol}`;
      } else {
        reply += "No high regulatory flags detected. Standard label substantiation protocol applies.";
      }

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Evidence assessment requires supporting KT50 knockdown chamber testing and WHO compliance dossier.",
        },
      ]);
    }

    requestAnimationFrame(() =>
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      }),
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr]">
      <div className="self-start overflow-hidden rounded-xl border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 text-[0.9375rem]">
            <thead className="bg-[#E5E8E3]">
              <tr>
                {["Claim", "Format", "Required Protocol", "Verification State", "Status"].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {evidenceList.map((c, i) => (
                <tr key={c.claim || i} className="transition-colors hover:bg-[#fafbfa]">
                  <td className={`${td} font-semibold text-ink`}>{c.claim}</td>
                  <td className={`${td} text-gray-600`}>{c.format || "General"}</td>
                  <td className={`${td} text-xs text-gray-500`}>
                    {c.required_protocol || "Standard Bioassay"}
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[0.75rem] font-semibold ${
                        verificationBadge[c.verification_state] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {c.verification_state || "Verified"}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-block rounded px-2.5 py-1 text-[0.8125rem] font-medium whitespace-nowrap ${
                        statusStyle[c.compliance_status || c.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {c.compliance_status || c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Card flush className="flex min-h-80 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-[#f1f3f2] px-4 py-3">
          <Sparkles className="size-4 text-brand" strokeWidth={1.75} />
          <h2 className="text-[0.9375rem] font-semibold text-ink">
            Claim Evidence Q&amp;A
          </h2>
        </div>
        <div
          ref={threadRef}
          className="flex max-h-104 min-h-28 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        >
          {messages.map((m, i) => (
            <p
              key={i}
              className={`max-w-[85%] rounded-lg border px-3.5 py-2.5 text-[0.9375rem] ${
                m.role === "user"
                  ? "self-end border-brand bg-brand text-white"
                  : "self-start border-line bg-white text-ink"
              }`}
            >
              {m.text}
            </p>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <AskForm
            onAsk={ask}
            variant="panel"
            placeholder="Ask about any claim's evidence..."
          />
        </div>
      </Card>
    </div>
  );
}