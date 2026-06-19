import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d1117] text-[#e6edf3] overflow-hidden font-sans">
      {children}
    </div>
  );
};

export default Layout;
