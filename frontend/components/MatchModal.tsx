"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { getApiUrl } from "@/lib/api";
import Button from "./Button";

interface Props {
  myPhoto: string | null;
  theirPhoto: string | null;
  theirName: string;
  onSayHello: () => void;
  onKeepBrowsing: () => void;
}

export default function MatchModal({ myPhoto, theirPhoto, theirName, onSayHello, onKeepBrowsing }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-dusk-deep/95 backdrop-blur-sm px-6"
      >
        <div className="text-center">
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="font-mono text-xs uppercase tracking-[0.2em] text-spark mb-6"
          >
            You've got a spark
          </motion.p>

          <div className="relative flex items-center justify-center h-40 mb-8">
            <PhotoOrb src={myPhoto} fromSide="left" />
            <PhotoOrb src={theirPhoto} fromSide="right" />
            <SparkBurst />
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            className="font-display italic text-3xl text-birch mb-2"
          >
            You and {theirName}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="text-slate text-sm mb-10"
          >
            You both liked each other. No games, just say hi.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.7 }}
            className="flex flex-col gap-3"
          >
            <Button onClick={onSayHello} className="w-full">Say hello</Button>
            <Button onClick={onKeepBrowsing} variant="ghost" className="w-full">Keep browsing</Button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function PhotoOrb({ src, fromSide }: { src: string | null; fromSide: "left" | "right" }) {
  const offset = fromSide === "left" ? -70 : 70;
  return (
    <motion.div
      initial={{ x: offset * 1.8, opacity: 0 }}
      animate={{ x: offset * 0.42, opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="absolute h-28 w-28 rounded-full overflow-hidden border-2 border-ember shadow-[0_0_30px_rgba(244,196,99,0.35)]"
    >
      {src ? (
        <Image src={getApiUrl(src)} alt="" fill className="object-cover" />
      ) : (
        <div className="h-full w-full bg-ash" />
      )}
    </motion.div>
  );
}

function SparkBurst() {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0] }}
      transition={{ delay: 0.9, duration: 0.7, ease: "easeOut" }}
      className="absolute h-16 w-16 rounded-full bg-spark blur-xl"
    />
  );
}
