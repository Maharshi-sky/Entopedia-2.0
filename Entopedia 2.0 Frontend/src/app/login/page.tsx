import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight, Bug } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { Sparkline } from "@/components/charts/Sparkline";
import { CountUp } from "@/components/ui/CountUp";
import { metrics, type Metric } from "@/data/dashboard";
import { metricIcons } from "@/components/dashboard/metrics";

export const metadata: Metadata = {
  title: "Sign in · Entopedia",
};

function GlassMetric({
  id,
  title,
  value,
  caption,
  icon,
  tone,
  trend,
  delay,
}: Metric & { delay: number }) {
  // The data names the icon; map the name to the component (as the dashboard does).
  const Icon = metricIcons[icon];
  const alert = tone === "alert";
  return (
    <div className="flex flex-col justify-between rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-lg ${
              alert ? "bg-red-500/20 text-red-300" : "bg-white/15 text-emerald-200"
            }`}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="text-xs font-semibold text-white">{title}</span>
        </div>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/25 text-white">
          <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
        </span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-2xl font-semibold text-white tabular-nums">
            <CountUp value={value} delay={delay} />
          </p>
          <p className="mt-1 text-[0.8125rem] text-white/70">{caption}</p>
        </div>
        <Sparkline
          id={`login-spark-${id}`}
          data={trend}
          color={alert ? "#f87171" : "#34d399"}
          delay={delay}
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-[3fr_2fr]">
      <section className="relative hidden overflow-hidden bg-[#06281c] lg:block">
        <Image
          src="/login-bg.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover object-bottom"
        />
        <div className="absolute inset-0 bg-linear-to-br from-black/25 via-transparent to-transparent" />
        {/* Content only (not the photo) renders at 75% of the global scale. */}
        <div className="relative flex flex-col px-10 py-10 [zoom:0.75]">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-white">
              <Bug className="size-4 text-ink" strokeWidth={1.75} />
            </span>
            <span className="font-heading text-lg font-semibold text-white">
              Entopedia
            </span>
          </div>

          <div className="mt-24 max-w-xl">
            <h1 className="text-4xl leading-tight font-semibold text-white">
              Intelligence that moves research forward.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Explore competitive intelligence, patent landscapes, scientific
              evidence, and emerging market opportunities in one connected
              workspace.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {metrics.map((metric, i) => (
                <GlassMetric key={metric.id} {...metric} delay={0.3 + i * 0.35} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center bg-[#f2f3f1] px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-7 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand">
              <Bug className="size-3.5 text-white" strokeWidth={1.75} />
            </span>
            <span className="font-heading text-[0.9375rem] font-semibold text-ink">
              Entopedia
            </span>
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-ink">
            Welcome Entopedia
          </h2>
          <p className="mt-1 text-[0.9375rem] text-gray-500">
            Sign in to access your intelligence workspace.
          </p>

          <LoginForm />

          <p className="mt-6 text-center text-xs text-gray-500">
            Don&apos;t have an account? Contact your{" "}
            <a href="#" className="font-semibold text-brand hover:underline">
              Administrator
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
