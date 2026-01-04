"use client";

import { useState } from "react";
import { SvgLock, SvgUnlock } from "@opal/icons";

export interface EncryptionIndicatorProps {
  /** Whether the session is currently locked */
  locked: boolean;
  /** Callback when clicked */
  onClick?: () => void;
  /** Size variant */
  size?: "sm" | "md";
}

/**
 * Visual indicator showing encrypted mode status
 */
export default function EncryptionIndicator({
  locked,
  onClick,
  size = "md",
}: EncryptionIndicatorProps) {
  const [isHovered, setIsHovered] = useState(false);

  const sizeClasses = size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5";
  const iconSize = size === "sm" ? 12 : 16;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        flex items-center gap-1.5 rounded-full
        transition-colors cursor-pointer
        ${sizeClasses}
        ${
          locked
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
        }
      `}
      title={locked ? "Click to unlock encrypted mode" : "Encrypted mode active"}
    >
      {locked ? (
        <SvgLock width={iconSize} height={iconSize} />
      ) : (
        <SvgUnlock width={iconSize} height={iconSize} />
      )}
      <span className="font-medium">
        {isHovered
          ? locked
            ? "Unlock"
            : "Settings"
          : locked
            ? "Locked"
            : "Encrypted"}
      </span>
    </button>
  );
}
