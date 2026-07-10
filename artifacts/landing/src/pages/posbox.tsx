import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import PosBoxManual from "@/components/PosBoxManual";

export default function PosBoxPage() {
  return (
    <>
      <div className="container mx-auto px-4 md:px-6 pt-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
      </div>
      <PosBoxManual />
    </>
  );
}
