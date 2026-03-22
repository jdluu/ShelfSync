import type React from "react";

interface SystemInfoProps {
  hostIp?: string;
  version?: string;
}

export const SystemInfo: React.FC<SystemInfoProps> = ({
  hostIp,
  version = "1.1.0 (Stable)",
}) => {
  return (
    <div className="flex flex-col gap-2 p-4 bg-base-200/30 rounded-xl border border-dashed border-base-300">
      <h4 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest">
        System Information
      </h4>
      <div className="space-y-1">
        {hostIp && (
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-base-content/50 uppercase">Host IP</span>
            <span className="text-[10px] font-mono font-bold text-base-content/70">{hostIp}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-base-content/50 uppercase">Version</span>
          <span className="text-[10px] font-mono font-bold text-base-content/70">{version}</span>
        </div>
      </div>
    </div>
  );
};
