import React from 'react';
import { Clock, RotateCcw, RotateCw } from 'lucide-react';
import Pagination from '../Pagination';

// Approval Queue: "Tardy Deductions" card (client-paged, Undo / Redo Deduction).
const TardyTable = ({ filteredTardy, paginatedTardy, totalTardyPages, tardyPage, setTardyPage, search, loading, processing, handleTardyAction }) => (
  <div className="premium-card mb-40">
    <h3 className="flex items-center gap-10 mb-24 font-bold" style={{ fontSize: '1.25rem' }}>
      <Clock size={22} color="var(--accent)" />
      <span>Tardy Deductions</span>
    </h3>
    {filteredTardy.length > 0 ? (
      <>
        <div 
          className="data-table-container leaves-scroll-container"
          style={{ 
            opacity: loading ? 0.7 : 1, 
            transition: 'opacity 0.15s ease-in-out',
            pointerEvents: loading ? 'none' : 'auto',
            minHeight: (totalTardyPages > 1 && !search.trim()) ? '380px' : 'auto'
          }}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Employee</th>
                <th>Details</th>
                <th>VL Deduction</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTardy.map(tardy => (
                <tr key={`tardy-${tardy.id}`}>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '999px',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                        background: tardy.status === 'Deducted' ? '#fef3c7' : '#f1f5f9',
                        color: tardy.status === 'Deducted' ? '#92400e' : '#64748b',
                        border: `1px solid ${tardy.status === 'Deducted' ? '#fcd34d' : '#cbd5e1'}`
                      }}>
                      {tardy.status === 'Deducted' ? 'DEDUCTED' : 'UNDONE'}
                    </span>
                  </td>
                  <td className="font-bold">{tardy.full_name}</td>
                  <td className="text-small">
                    <div className="font-bold" style={{ color: 'var(--primary)' }}>
                      <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      Tardy • {parseFloat(tardy.equivalent_day)} Days
                    </div>
                    <div className="text-muted font-bold" style={{ fontSize: '0.7rem' }}>
                      {tardy.period_text}{tardy.remarks ? ` • ${tardy.remarks}` : ''}
                    </div>
                  </td>
                  <td>
                    {tardy.status === 'Deducted' && (
                      <span className="font-bold" style={{ color: 'var(--success)', fontSize: '0.75rem' }}>
                        PAID: {parseFloat(tardy.equivalent_day)}
                      </span>
                    )}
                  </td>
                  <td>
                    {tardy.status === 'Deducted' ? (
                      <button
                        className="btn-undo"
                        onClick={() => handleTardyAction(tardy.id, 'undo')}
                        disabled={processing || tardy.is_closed}
                        style={{ 
                          opacity: (processing || tardy.is_closed) ? 0.5 : 1, 
                          cursor: (processing || tardy.is_closed) ? 'not-allowed' : 'pointer',
                          background: tardy.is_closed ? '#e2e8f0' : '',
                          color: tardy.is_closed ? '#94a3b8' : '',
                          border: tardy.is_closed ? '1px solid #cbd5e1' : ''
                        }}
                        title={tardy.is_closed ? "Cannot undo deductions from a closed month" : "Undo Deduction"}
                      >
                        <RotateCcw size={14} />
                        {tardy.is_closed ? 'Undo Locked' : (processing ? '...' : 'Undo Deduction')}
                      </button>
                    ) : (
                      <button
                        className={tardy.is_closed ? "btn-danger-outline" : "btn-primary"}
                        onClick={() => handleTardyAction(tardy.id, 'redo')}
                        disabled={processing || tardy.is_closed}
                        style={{ 
                          padding: '6px 14px', 
                          fontSize: '0.75rem', 
                          opacity: (processing || tardy.is_closed) ? 0.5 : 1, 
                          cursor: (processing || tardy.is_closed) ? 'not-allowed' : 'pointer',
                          color: tardy.is_closed ? '#94a3b8' : '',
                          border: tardy.is_closed ? '1px solid #cbd5e1' : ''
                        }}
                        title={tardy.is_closed ? "Cannot redo deductions from a closed month" : "Redo Deduction"}
                      >
                        <RotateCw size={14} />
                        {tardy.is_closed ? 'Redo Locked' : (processing ? '...' : 'Redo Deduction')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tardy Pagination Controls */}
        {totalTardyPages > 1 && (
          <Pagination page={tardyPage} totalPages={totalTardyPages} loading={loading} setPage={setTardyPage}>
            Showing {paginatedTardy.length} of {filteredTardy.length} tardy deductions
          </Pagination>
        )}
      </>
    ) : (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p className="text-muted">No tardy deductions found.</p>
      </div>
    )}
  </div>
);

export default TardyTable;
