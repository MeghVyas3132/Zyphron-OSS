import { motion, useInView } from "framer-motion";
import { useRef, type ReactNode } from "react";

type Props = {
  id?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
};

export function SceneShell({ id, eyebrow, children, className = "" }: Props) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.25, once: false });

  return (
    <section
      ref={ref}
      id={id}
      className={`relative z-10 flex min-h-screen w-full items-center justify-center px-6 py-32 md:px-12 ${className}`}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-6xl"
      >
        {eyebrow && (
          <div className="mb-8 font-mono-ui text-[10px] uppercase tracking-[0.32em] text-white/35">
            {eyebrow}
          </div>
        )}
        {children}
      </motion.div>
    </section>
  );
}

export default SceneShell;