import type { ReactNode, ElementType } from "react";

export function MassiveType({
  children,
  as: As = "h2" as ElementType,
  className = "",
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return (
    <As
      className={`font-display text-[clamp(2.5rem,7vw,6rem)] font-light leading-[0.95] tracking-[-0.03em] text-white ${className}`}
    >
      {children}
    </As>
  );
}

export default MassiveType;