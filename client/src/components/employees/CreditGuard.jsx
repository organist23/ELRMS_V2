import React from 'react';
import { AlertTriangle, Lock, CalendarClock, ArrowRight } from 'lucide-react';
import './creditGuard.css';

// What generating credits now would cause, from GET /api/accrual/precheck.
// Generating M/Y locks M/Y and earlier: pending leaves of those months can never be approved or rejected after.
export const guardIssues = (audit, precheck) => {
  if (!audit?.pendingAccrual || !precheck) return null;
  const pending = precheck.pendingLeaves?.length || 0;
  if (!pending && !precheck.isEarly) return null;
  return { pending, early: precheck.isEarly, tardy: precheck.undoableTardyCount || 0 };
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const dayOf = (iso) => Number(String(iso).slice(8, 10));
const monthLabel = (p) => `${p.monthName.charAt(0)}${p.monthName.slice(1).toLowerCase()}`;

// How far into the month today is, with the usual generation window (last 3 days) shaded.
const MonthProgress = ({ precheck }) => {
  const today = dayOf(precheck.today);
  const pct = precheck.isFutureMonth ? 0 : Math.min(100, Math.round((today / precheck.lastDay) * 100));
  const windowPct = ((precheck.lastDay - precheck.windowStartDay + 1) / precheck.lastDay) * 100;
  return (
    <div className="cg-month">
      <div className="cg-month-labels">
        <span>{precheck.isFutureMonth ? `${monthLabel(precheck)} has not started` : `Today: ${monthLabel(precheck)} ${today}`}</span>
        <span>Usual: {precheck.windowStartDay}–{precheck.lastDay}</span>
      </div>
      <div className="cg-track" aria-hidden="true">
        <div className="cg-window" style={{ width: `${windowPct}%` }} />
        <div className="cg-fill" style={{ '--cg-pct': `${pct}%` }} />
      </div>
    </div>
  );
};

// Banner under the Generate box. Shown only while this month's credits are not generated yet and
// something needs attention.
export const CreditGuardNotice = ({ audit, precheck, onReview }) => {
  const issues = guardIssues(audit, precheck);
  if (!issues) return null;
  const month = monthLabel(precheck);
  return (
    <div className="cg-notice" role="status" aria-live="polite">
      <div className="cg-icon"><AlertTriangle size={20} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cg-title">Before you generate {month} {precheck.year} credits</div>
        {issues.pending > 0 && (
          <div className="cg-line">
            <Lock size={14} />
            <span><strong>{plural(issues.pending, 'leave application is', 'leave applications are')} still pending.</strong> Generating now locks {issues.pending === 1 ? 'it' : 'them'}: {issues.pending === 1 ? 'it' : 'they'} could no longer be approved or rejected.</span>
            <button type="button" className="cg-link" onClick={onReview}>Review in Approval Queue <ArrowRight size={12} style={{ verticalAlign: 'middle' }} /></button>
          </div>
        )}
        {issues.early && (
          <div className="cg-line">
            <CalendarClock size={14} />
            <span><strong>It is early in the month.</strong> Credits are usually generated from {month} {precheck.windowStartDay}; leaves filed for {month} after generating are locked too.</span>
          </div>
        )}
        {issues.tardy > 0 && (
          <div className="cg-line">
            <Lock size={14} />
            <span>{plural(issues.tardy, 'tardy deduction', 'tardy deductions')} can still be undone until credits are generated.</span>
          </div>
        )}
        <MonthProgress precheck={precheck} />
      </div>
    </div>
  );
};

// Confirmation shown instead of the plain dialog when there is something to look at.
export const CreditGuardModal = ({ precheck, onClose, onReview, onGenerate }) => {
  const month = monthLabel(precheck);
  const leaves = precheck.pendingLeaves || [];
  const shown = leaves.slice(0, 5);
  return (
    <div className="modal-overlay">
      <div className="modal-content cg-modal" role="alertdialog" aria-modal="true" aria-labelledby="cg-modal-title">
        <div className="cg-icon cg-modal-icon"><AlertTriangle size={26} /></div>
        <h2 id="cg-modal-title" className="font-bold" style={{ fontSize: '1.3rem', marginBottom: '6px', textAlign: 'center' }}>
          Generate {month} {precheck.year} credits now?
        </h2>
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center' }}>
          Every active employee gets +1.25 VL and +1.25 SL, and {month} becomes a closed month.
        </p>

        {leaves.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div className="font-bold" style={{ fontSize: '0.8rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              These will be locked
            </div>
            {shown.map((l, i) => (
              <div key={l.id} className="cg-item" style={{ animationDelay: `${0.25 + i * 0.08}s` }}>
                <Lock size={14} color="var(--warning)" />
                <div style={{ minWidth: 0 }}>
                  <div className="font-bold">{l.full_name}</div>
                  <div className="cg-item-meta">{l.leave_type} · {l.inclusive_dates} · {Number(l.num_days)} day(s)</div>
                </div>
              </div>
            ))}
            {leaves.length > shown.length && (
              <div className="cg-item-meta" style={{ marginTop: '8px' }}>and {leaves.length - shown.length} more</div>
            )}
          </div>
        )}

        {precheck.isEarly && (
          <div className="cg-item" style={{ animationDelay: `${0.25 + shown.length * 0.08}s`, marginBottom: '16px' }}>
            <CalendarClock size={14} color="var(--warning)" />
            <span>Today is {month} {dayOf(precheck.today)}. Credits are usually generated from {month} {precheck.windowStartDay}.</span>
          </div>
        )}

        <MonthProgress precheck={precheck} />

        <div className="flex-between" style={{ marginTop: '28px', gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          {leaves.length > 0 && (
            <button type="button" className="btn-primary" style={{ flex: 1.4 }} onClick={onReview}>Go to Approval Queue</button>
          )}
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1.2, borderColor: 'var(--warning)', color: '#92400e', fontWeight: 700 }}
            onClick={onGenerate}
          >
            Generate anyway
          </button>
        </div>
      </div>
    </div>
  );
};
