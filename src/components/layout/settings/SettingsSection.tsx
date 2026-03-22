import type React from "react";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, children }) => {
  return (
    <section>
      <h3 className="text-[10px] font-display font-bold text-base-content/50 uppercase tracking-widest mx-2 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
};
