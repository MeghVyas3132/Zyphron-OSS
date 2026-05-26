import { motion, useScroll, useTransform } from "framer-motion";

export function Nav() {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 400, 700], [0, 0, 1]);

  return (
    <motion.header
      style={{ opacity }}
      className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-white/[0.06] bg-black/30 px-6 py-4 backdrop-blur-xl md:px-10"
    >
      <div className="flex items-center gap-2 font-display text-sm font-medium tracking-[0.3em] text-white/90">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/80" />
        ZYPHRON
      </div>
      <nav className="hidden gap-8 font-mono-ui text-[11px] uppercase tracking-[0.25em] text-white/45 md:flex">
        <a href="#problem" className="hover:text-white/80">System</a>
        <a href="#engine" className="hover:text-white/80">Engine</a>
        <a href="#artifacts" className="hover:text-white/80">Artifacts</a>
        <a href="#access" className="hover:text-white/80">Access</a>
      </nav>
      <a
        href="#access"
        className="rounded-full border border-white/15 px-4 py-1.5 font-mono-ui text-[10px] uppercase tracking-[0.25em] text-white/80 hover:border-white/40"
      >
        Enter
      </a>
    </motion.header>
  );
}

export default Nav;