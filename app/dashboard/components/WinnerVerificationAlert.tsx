import { CloudUpload } from "lucide-react";

type WinnerVerificationAlertProps = {
  isVisible: boolean;
  pendingPrizeAmount?: number;
  isUploading: boolean;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
};

export default function WinnerVerificationAlert({
  isVisible,
  pendingPrizeAmount,
  isUploading,
  onFileChange,
  onSubmit,
}: WinnerVerificationAlertProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <section className="rounded-xl border border-destructive/35 border-l-4 border-l-destructive bg-destructive/10 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-destructive">
        Action Required: Verify Your Winning Score!
      </h2>
      <p className="mt-1 text-sm text-destructive/85">
        {typeof pendingPrizeAmount === "number"
          ? `Pending payout: $${pendingPrizeAmount.toFixed(2)}. Upload your platform screenshot to complete verification.`
          : "Upload your platform screenshot to complete verification and release your payout."}
      </p>

      <div className="mt-4 space-y-4">
        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-primary/50 bg-muted/20 p-5 transition hover:border-primary/70 hover:bg-muted/35">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <CloudUpload className="h-7 w-7 text-primary" />
            <p className="text-sm text-foreground">
              Drag and drop your golf platform screenshot here, or click to
              browse.
            </p>
          </div>
        </label>

        <button
          type="button"
          onClick={onSubmit}
          disabled={isUploading}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? "Submitting..." : "Submit Proof for Verification"}
        </button>
      </div>
    </section>
  );
}
