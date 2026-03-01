import { Github } from "lucide-react";

export const Footer = () => {
  return (
    <footer
      className="footer footer-center p-6 bg-base-100 border-t border-base-300 text-base-content/50"
      style={{ paddingBottom: "calc(var(--safe-area-bottom, 0px) + 2rem)" }}
    >
      <div className="w-full max-w-7xl flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-sm font-medium">
          &copy; {new Date().getFullYear()} ShelfSync. All rights reserved.
        </p>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/jdluu/ShelfSync"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors flex items-center gap-2 text-sm font-semibold"
          >
            <Github className="w-4 h-4" />
            <span>Source Code</span>
          </a>
        </div>
      </div>
    </footer>
  );
};
