type CharityImpactCardProps = {
  charityName: string | null;
  charityDescription?: string | null;
  charityImageUrl?: string | null;
  contributionPercent: number;
  isSaving: boolean;
  onContributionChange: (value: number) => void;
  onSave: () => void;
};

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?auto=format&fit=crop&w=1200&q=80";

export default function CharityImpactCard({
  charityName,
  charityDescription,
  charityImageUrl,
  contributionPercent,
  isSaving,
  onContributionChange,
  onSave,
}: CharityImpactCardProps) {
  const resolvedCharityName = charityName ?? "Hope Foundation";
  const safePercent = Math.min(50, Math.max(10, contributionPercent));

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-md">
      <div className="grid grid-cols-1 md:grid-cols-[42%_58%]">
        <div className="relative h-56 md:h-full">
          <img
            src={charityImageUrl || PLACEHOLDER_IMAGE}
            alt={resolvedCharityName}
            className="h-full w-full object-cover md:rounded-l-xl"
          />
          <div className="absolute inset-0 bg-linear-to-t from-background/30 to-transparent" />
        </div>

        <div className="p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Charity Impact
          </p>
          <h3 className="mt-2 text-xl font-semibold">
            You are currently funding {resolvedCharityName}.
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            {charityDescription ||
              "Every score you submit pushes real support into causes that need it most. You are not just playing better, you are building impact."}
          </p>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <label
                htmlFor="charity-impact-slider"
                className="text-muted-foreground"
              >
                Contribution Level
              </label>
              <span className="font-semibold text-primary">{safePercent}%</span>
            </div>

            <input
              id="charity-impact-slider"
              type="range"
              min={10}
              max={50}
              step={1}
              value={safePercent}
              onChange={(event) =>
                onContributionChange(Number(event.target.value))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-primary"
            />

            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>10%</span>
              <span>50%</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Contribution"}
          </button>
        </div>
      </div>
    </article>
  );
}
