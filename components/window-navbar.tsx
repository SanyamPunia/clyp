import { cn } from "@/lib/utils";

interface WindowNavbarProps {
  dark?: boolean;
  className?: string;
}

export function WindowNavbar({ dark = false, className }: WindowNavbarProps) {
  const bgColor = dark ? "bg-black/50" : "bg-white/80";

  return (
    <div
      className={cn(
        `${bgColor} px-4 py-2 flex items-center gap-2 text-xs transition-colors duration-300 ease-in-out`,
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <div className="size-2 rounded-full bg-[#FF605C]"></div>
        <div className="size-2 rounded-full bg-[#FFBD44]"></div>
        <div className="size-2 rounded-full bg-[#00CA4E]"></div>
      </div>
    </div>
  );
}
