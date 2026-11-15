import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Shared pager row: summary text on the left, Prev / page numbers / Next on the right.
// With more than 7 pages only the first, last, current and its neighbors are shown,
// with "..." two steps away from the current page.
// `setPage` is a React state setter (Prev/Next use the functional update form).
const Pagination = ({ page, totalPages, loading, setPage, children }) => (
  <div className="flex-between mt-24" style={{ padding: '0 8px' }}>
    <span className="text-small text-muted font-bold">
      {children}
    </span>
    <div className="flex items-center gap-8">
      <button
        className="pagination-btn"
        disabled={page === 1 || loading}
        onClick={() => setPage(prev => prev - 1)}
        title="Previous Page"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="flex items-center gap-4">
        {[...Array(totalPages)].map((_, i) => {
          const pg = i + 1;
          if (totalPages > 7) {
            if (pg !== 1 && pg !== totalPages && Math.abs(pg - page) > 1) {
              if (pg === page - 2 || pg === page + 2) return <span key={pg} style={{ color: 'var(--text-light)', padding: '0 4px' }}>...</span>;
              return null;
            }
          }
          return (
            <button
              key={pg}
              className={`pagination-num ${page === pg ? 'active' : ''}`}
              onClick={() => setPage(pg)}
              disabled={loading}
            >
              {pg}
            </button>
          );
        })}
      </div>

      <button
        className="pagination-btn"
        disabled={page === totalPages || loading}
        onClick={() => setPage(prev => prev + 1)}
        title="Next Page"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
);

export default Pagination;
