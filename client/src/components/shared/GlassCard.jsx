import { motion } from "framer-motion";
import { cn } from "../../lib/cn";

export function GlassCard({ className, children, delay = 0, hover = true }) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1], delay }}
            whileHover={hover ? { y: -2 } : undefined}
            className={cn("rounded-2xl border border-white/10 bg-[var(--panel)]/85 backdrop-blur-xl", className)}
        >
            {children}
        </motion.section>
    );
}
