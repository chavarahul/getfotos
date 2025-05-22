import { cn } from "@/lib/utils";

export function ButtonLoader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white",
        className
      )}
      aria-label="Loading"
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex-col gap-4 w-full flex items-center justify-center">
      <div
        className="w-20 h-20 border-4 border-transparent text-black text-4xl animate-spin flex items-center justify-center border-t-black rounded-full"
      >
        <div
          className="w-16 h-16 border-4 border-transparent text-black text-2xl animate-spin flex items-center justify-center border-t-black rounded-full"
        ></div>
      </div>
    </div>

  );
}

export function ErrorDisplay({
  message,
  retry,
  className,
}: {
  message: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "p-4 bg-red-50 text-red-700 rounded-lg flex flex-col items-center",
        className
      )}
    >
      <p className="text-sm font-medium">{message}</p>
      <p className="text-sm mt-1">Please try again later or contact support.</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}