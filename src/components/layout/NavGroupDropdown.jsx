import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { ChevronDown } from 'lucide-react';

/**
 * NavGroupDropdown represents a desktop navigation group dropdown element.
 * It uses an invisible bridge element to bridge the hover gap between the button and panel.
 */
export default function NavGroupDropdown({ group, items, currentPageName }) {
  if (items.length === 0) return null;

  // Active status helper checks if current page is within group items
  const groupIsActive = items.some(item => item.page === currentPageName);
  // Default fallback icon for the group button
  const GroupIcon = items[0]?.icon;

  return (
    <div className="relative" style={{ isolation: 'isolate' }}>
      {/* Invisible bridge between button and dropdown to prevent hover gap */}
      <div className="group">
        {/* Group trigger button */}
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150"
          style={groupIsActive ? { background: '#0F1E36', color: '#ffffff' } : { color: '#4B5563' }}
        >
          {GroupIcon && <GroupIcon className="w-4 h-4" />}
          {group}
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>

        {/* Invisible hover bridge + dropdown container */}
        <div className="absolute left-0 top-full w-full h-2 hidden group-hover:block" />
        <div
          className="absolute left-0 top-[calc(100%+2px)] hidden group-hover:block z-50 min-w-[200px]"
        >
          <div
            className="bg-white rounded-lg py-1.5"
            style={{
              border: '1px solid #E2E6EC',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}
          >
            {/* Map over navigation items and style based on active path */}
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={
                    isActive
                      ? { background: '#EEF2FF', color: '#0F1E36', fontWeight: '500' }
                      : { color: '#4B5563' }
                  }
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F7F9FC'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}