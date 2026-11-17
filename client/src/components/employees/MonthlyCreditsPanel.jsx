import React from 'react';
import { Send } from 'lucide-react';
import { guardIssues } from './CreditGuard';

// Employee Management: "Generate Monthly Credits (1.25)" box (month/year come from the server audit).
const MonthlyCreditsPanel = ({ accrualMonth, accrualYear, isGenerating, audit, precheck, handleGenerateCredits }) => (
  <div className="premium-card mb-40" style={{ background: 'var(--accent-light)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
    {/* Label */}
    <div className="flex items-center gap-14" style={{ flexShrink: 0 }}>
      <Send size={20} color="var(--accent)" />
      <div className="flex flex-col" style={{ gap: '2px' }}>
        <span className="font-bold" style={{ color: 'var(--accent)', fontSize: '1rem', whiteSpace: 'nowrap' }}>Generate Monthly Credits (1.25)</span>
        {audit?.pendingRollover && (
          <span className="text-small" style={{ color: 'var(--primary)', opacity: 0.8 }}>
            Run the Yearly Rollover in Settings → Database first.
          </span>
        )}
      </div>
    </div>

    {/* Inputs + Button */}
    <div className="flex items-center gap-12" style={{ flexShrink: 0 }}>

      {/* Month Input */}
      <div className="flex flex-col" style={{ gap: '4px' }}>
        <span className="text-small font-bold" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>Month</span>
        <input
          type="number"
          className="input-field"
          style={{ width: '72px', fontWeight: 700, textAlign: 'center', border: '1.5px solid var(--accent)', color: 'var(--accent)', cursor: 'default', background: 'white' }}
          value={accrualMonth}
          readOnly
        />
      </div>

      <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1.1rem', paddingTop: '18px' }}>/</span>

      {/* Year Input */}
      <div className="flex flex-col" style={{ gap: '4px' }}>
        <span className="text-small font-bold" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>Year</span>
        <input
          type="number"
          className="input-field"
          style={{ width: '96px', fontWeight: 700, textAlign: 'center', border: '1.5px solid var(--accent)', color: 'var(--accent)', cursor: 'default', background: 'white' }}
          value={accrualYear}
          readOnly
        />
      </div>

      <button
        className={`btn-primary${guardIssues(audit, precheck) && !isGenerating && !audit?.pendingRollover ? ' cg-attention' : ''}`}
        style={{
          height: '44px',
          padding: '0 28px',
          whiteSpace: 'nowrap',
          alignSelf: 'flex-end',
          opacity: (isGenerating || audit?.pendingRollover) ? 0.5 : 1,
          cursor: (isGenerating || audit?.pendingRollover) ? 'not-allowed' : 'pointer'
        }}
        onClick={handleGenerateCredits}
        disabled={isGenerating || audit?.pendingRollover}
      >
        {audit?.pendingRollover ? 'Rollover Required First' : (isGenerating ? 'Generating...' : 'Confirm Generate')}
      </button>
    </div>
  </div>
);

export default MonthlyCreditsPanel;
