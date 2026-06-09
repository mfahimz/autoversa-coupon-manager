import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

/**
 * MobileNavMenu renders the navigation link list on mobile viewports.
 * It features a clean white background, customized bottom border, and shadow.
 */
export default function MobileNavMenu({ navItems, currentPageName, onClose }) {
  return (
    <div
      className="lg:hidden absolute top-16 left-0 right-0 max-h-[calc(100vh-4rem)] overflow-y-auto z-40"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #E2E6EC',
        boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
      }}
    >
      <nav className="py-2 px-2">
        {/* Render each navigation item as a Link styled depending on its active state */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={
                isActive
                  ? { background: '#0F1E36', color: '#ffffff' }
                  : { color: '#4B5563' }
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}