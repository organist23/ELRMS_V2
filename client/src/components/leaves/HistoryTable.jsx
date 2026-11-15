import React from 'react';
import { CheckCircle, RotateCcw } from 'lucide-react';
import Pagination from '../Pagination';

// Approval Queue: "Processed Leaves" card (server-paged, Undo Approval).
const HistoryTable = ({ filteredHistory, loading, processing, handleAction, historyPage, setHistoryPage, totalHistoryPages, totalHistoryRecords }) => (
  <div className="premium-card mb-40">
    <h3 className="flex items-center gap-10 mb-24 font-bold" style={{ fontSize: '1.25rem' }}>
      <CheckCircle size={22} color="var(--success)" />
      <span>Processed Leaves</span>
    </h3>
    {filteredHistory.length > 0 ? (
      <>
        <div 
          className="data-table-container leaves-scroll-container"
          style={{ 
            opacity: loading ? 0.7 : 1, 
            transition: 'opacity 0.15s ease-in-out',
            pointerEvents: loading ? 'none' : 'auto',
            minHeight: (totalHistoryPages > 1) ? '380px' : 'auto'
          }}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Employee</th>
                <th>Details</th>
                <th>Pay Breakdown</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map(leave => (
                <tr key={`leave-${leave.id}`}>
                  <td>
                    <span className={`badge ${leave.status === 'Approved' ? 'badge-approved' : 'badge-rejected'}`}>
                      {leave.status}
                    </span>
                  </td>
                  <td className="font-bold">{leave.full_name}</td>
                  <td className="text-small">
                    <div className="font-bold" style={{ color: 'var(--primary)' }}>{leave.leave_type} • {Number(leave.num_days)} Days</div>
                    <div className="text-muted font-bold" style={{ fontSize: '0.7rem' }}>{leave.inclusive_dates}</div>
                  </td>
                  <td>
                    {leave.status === 'Approved' && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <span className="font-bold" style={{ color: 'var(--success)', fontSize: '0.75rem' }}>PAID: {Number(leave.with_pay)}</span>
                        <span className="font-bold" style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>W/O: {Number(leave.without_pay)}</span>
                      </div>
                    )}
                  </td>
                  <td>
                    {leave.status === 'Approved' && (
                      <button
                        className="btn-undo"
                        onClick={() => handleAction(leave.id, 'undo')}
                        disabled={processing || leave.is_closed}
                        style={{ 
                          opacity: (processing || leave.is_closed) ? 0.5 : 1, 
                          cursor: (processing || leave.is_closed) ? 'not-allowed' : 'pointer',
                          background: leave.is_closed ? '#e2e8f0' : '',
                          color: leave.is_closed ? '#94a3b8' : '',
                          border: leave.is_closed ? '1px solid #cbd5e1' : ''
                        }}
                        title={leave.is_closed ? "Cannot undo leaves from a closed month" : "Undo Approval"}
                      >
                        <RotateCcw size={14} />
                        {leave.is_closed ? 'Undo Locked' : (processing ? '...' : 'Undo Approval')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* History Pagination Controls */}
        {totalHistoryPages > 1 && (
          <Pagination page={historyPage} totalPages={totalHistoryPages} loading={loading} setPage={setHistoryPage}>
            Showing {filteredHistory.length} of {totalHistoryRecords} records
          </Pagination>
        )}
      </>
    ) : (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p className="text-muted">No processed leaves found.</p>
      </div>
    )}
  </div>
);

export default HistoryTable;
