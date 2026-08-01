import { HalftoneBackground } from "@/components/ui/halftone-background";
import { NotFoundCard } from "@/components/not-found-card";

// Always fills the entire viewport (h-dvh), covering the full page/screen so no
// app chrome or partial-height flash is ever visible around the 404.
export default function NotFound() {
  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[#0d0d14]">
      <HalftoneBackground
        background="#0d0d14"
        color="#CF728718"
        dotSpacing={18}
        maxRadius={5}
        speed={0.4}
        scale={0.8}
      />
      <div className="relative z-10 px-4">
        <NotFoundCard />
      </div>
    </div>
  );
}
