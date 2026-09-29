import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen culinary-canvas flex flex-col"
    >
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md mx-auto relative">
          <div className="glass-tier-1 rounded-3xl flex items-center justify-center min-h-[200px] px-6 py-10">
            <div className="text-center">
              <h1 className="font-culinary-heading text-4xl font-bold tracking-tight mb-4 tabular-nums">404</h1>
              <p className="text-lg text-muted-foreground">Page Not Found</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
