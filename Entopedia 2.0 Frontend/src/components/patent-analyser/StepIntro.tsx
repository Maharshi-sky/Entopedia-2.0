export function StepIntro({ title, description }: { title: string; description: string }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-xs text-gray-600">{description}</p>
    </section>
  );
}
