interface WindowNavbarProps {
  dark?: boolean;
}

export function WindowNavbar({ dark = false }: WindowNavbarProps) {
  const bgColor = dark ? "bg-gray-800" : "bg-gray-100";
  const textColor = dark ? "text-gray-300" : "text-gray-500";

  return (
    <div
      className={`${bgColor} ${textColor} px-4 py-2 flex items-center gap-2 text-xs transition-colors duration-300 ease-in-out`}
    >
      <div className="flex items-center gap-1.5">
        <div className="size-2 rounded-full bg-red-500"></div>
        <div className="size-2 rounded-full bg-yellow-500"></div>
        <div className="size-2 rounded-full bg-green-500"></div>
      </div>
    </div>
  );
}
