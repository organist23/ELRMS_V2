import React from 'react';
import { Clock } from 'lucide-react';

// Approval Queue: "Pending Requests" card (Approve / Disapprove).
const PendingTable = ({ filteredPending, loading, processing, handleAction }) => (
  <div className="premium-card mb-40">
    <h3 className="flex items-center gap-10 mb-24 font-bold" style={{ fontSize: '1.25rem' }}>
      <Clock size={22} color="var(--accent)" />
      <span>Pending Requests</span>
    </h3>
    {filteredPending.length > 0 ? (
      <div 
        className="data-table-container"
        style={{ 
          opacity: loading ? 0.7 : 1, 
          transition: 'opacity 0.15s ease-in-out',
          pointerEvents: loading ? 'none' : 'auto'
        }}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>Applied On</th>
              <th>Employee</th>
              <th>Leave Type</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPending.map((leave) => (
              <tr key={leave.id}>
                <td className="text-small" style={{ color: 'var(--secondary)' }}>{new Date(leave.applied_at).toLocaleDateString()}</td>
                <td className="font-bold" style={{ fontSize: '0.9375rem' }}>{leave.full_name}</td>
                <td className="font-bold" style={{ color: 'var(--accent)' }}>{leave.leave_type}</td>
                <td>
                  <div className="font-bold">{Number(leave.num_days)} Days</div>
                  <div className="text-small font-bold" style={{ color: 'var(--accent)', opacity: 0.8 }}>{leave.inclusive_dates}</div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn-primary" 
                      style={{ 
                        padding: '8px 16px', 
                        fontSize: '0.8125rem', 
                        background: leave.is_closed ? 'transparent' : 'var(--success)',
                        opacity: (processing || leave.is_closed) ? 0.5 : 1, 
                        cursor: (processing || leave.is_closed) ? 'not-allowed' : 'pointer',
                        color: leave.is_closed ? '#94a3b8' : '',
                        border: leave.is_closed ? '1px solid #cbd5e1' : ''
                      }} 
                      onClick={() => handleAction(leave.id, 'approve', leave)}
                      disabled={processing || leave.is_closed}
                      title={leave.is_closed ? "Cannot approve leaves from a closed month" : "Approve"}
                    >
                      {leave.is_closed ? 'Approve Locked' : (processing ? '...' : 'Approve')}
                    </button>
                    <button 
                      className="btn-primary" 
                      style={{ 
                        padding: '8px 16px', 
                        fontSize: '0.8125rem',
                        background: leave.is_closed ? 'transparent' : 'var(--danger)',
                        opacity: (processing || leave.is_closed) ? 0.5 : 1, 
                        cursor: (processing || leave.is_closed) ? 'not-allowed' : 'pointer',
                        color: leave.is_closed ? '#94a3b8' : '',
                        border: leave.is_closed ? '1px solid #cbd5e1' : ''
                      }} 
                      onClick={() => handleAction(leave.id, 'reject', leave)}
                      disabled={processing || leave.is_closed}
                      title={leave.is_closed ? "Cannot reject leaves from a closed month" : "Disapprove"}
                    >
                      {leave.is_closed ? 'Reject Locked' : (processing ? '...' : 'Disapprove')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <p className="text-muted">No pending applications found in the queue.</p>
      </div>
    )}
  </div>
);

export default PendingTable;
