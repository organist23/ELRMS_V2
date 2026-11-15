import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';
import { Search } from 'lucide-react';
import PendingTable from '../components/leaves/PendingTable';
import HistoryTable from '../components/leaves/HistoryTable';
import TardyTable from '../components/leaves/TardyTable';
import { useNotification } from '../context/NotificationContext';

const Leaves = () => {
  const location = useLocation(); // Used to detect page navigation and re-sync is_closed state
  const { showToast, confirm } = useNotification();
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [historyLeaves, setHistoryLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // History Pagination
  const [historyPage, setHistoryPage] = useState(1);
  const [totalHistoryPages, setTotalHistoryPages] = useState(1);
  const [totalHistoryRecords, setTotalHistoryRecords] = useState(0);
  const [tardyRecords, setTardyRecords] = useState([]);

  // Tardy Pagination
  const [tardyPage, setTardyPage] = useState(1);
  const tardyLimit = 10;

  const fetchPendingAndTardy = async () => {
    setLoading(true);
    try {
      // Fetch Pending
      const pendingRes = await api.get('/leaves/pending').catch(err => {
        console.error('Pending fetch failed', err);
        return { data: [] };
      });
      setPendingLeaves(pendingRes.data);

      // Fetch Tardy
      const tardyRes = await api.get('/tardy').catch(err => {
        console.error('Tardy fetch failed', err);
        return { data: [] };
      });
      setTardyRecords(tardyRes.data);
    } catch (err) {
      console.error('Critical fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const historyRes = await api.get(`/leaves/history?page=${historyPage}&search=${debouncedSearch}`).catch(err => {
        console.error('History fetch failed', err);
        return { data: { data: [], totalPages: 1, total: 0 } };
      });
      setHistoryLeaves(historyRes.data.data || []);
      setTotalHistoryPages(historyRes.data.totalPages || 1);
      setTotalHistoryRecords(historyRes.data.total || 0);
    } catch (err) {
      console.error('History fetch error', err);
    }
  };

  useEffect(() => {
    fetchPendingAndTardy();
  }, [location.pathname]);

  useEffect(() => {
    fetchHistory();
  }, [historyPage, debouncedSearch, location.pathname]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setHistoryPage(1); // reset to page 1 on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    setTardyPage(1);
  }, [search]);

  const handleAction = async (id, action, leave = null) => {
    if (processing) return; // Prevent overlapping actions

    let confirmTitle = 'Confirm Action';
    let confirmMsg = `Are you sure you want to ${action} this leave application? This will update employee balances and creates a ledger record.`;

    // Special confirmation for Force Leave rejection
    if (action === 'reject' && leave?.leave_type === 'Force Leave') {
      confirmTitle = 'Exigency of Service';
      confirmMsg = `Exigency of service: the ${Number(leave.num_days)} day(s) of Force Leave will be transferred to the VL. Proceed?`;
    }

    const isConfirmed = await confirm(confirmTitle, confirmMsg);
    if (!isConfirmed) return;

    try {
      setProcessing(true);
      await api.post(`/leaves/${action}`, { application_id: id });
      showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully.`, 'success');
      fetchPendingAndTardy();
      fetchHistory();
    } catch (err) {
      showToast(err.response?.data?.error || `Failed to ${action}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleTardyAction = async (tardyId, action) => {
    if (processing) return;
    const label = action === 'undo' ? 'Undo Deduction' : 'Redo Deduction';
    const msg = action === 'undo'
      ? 'This will restore the deducted VL back to the employee. Proceed?'
      : 'This will re-apply the VL deduction. Proceed?';
    const confirmed = await confirm(label, msg);
    if (!confirmed) return;

    try {
      setProcessing(true);
      await api.post(`/tardy/${action}`, { tardy_id: tardyId });
      showToast(`${label} completed successfully.`, 'success');
      fetchPendingAndTardy();
      fetchHistory();
    } catch (err) {
      showToast(err.response?.data?.error || `Failed to ${action} tardy`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const filteredPending = pendingLeaves.filter(l =>
    (l.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.employee_id || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredHistory = historyLeaves; // server-side filtered now

  const filteredTardy = tardyRecords.filter(t =>
    (t.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.employee_id || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalTardyPages = Math.ceil(filteredTardy.length / tardyLimit);
  const paginatedTardy = filteredTardy.slice(
    (tardyPage - 1) * tardyLimit,
    tardyPage * tardyLimit
  );

  const isInitialLoad = loading && pendingLeaves.length === 0 && historyLeaves.length === 0 && tardyRecords.length === 0;
  if (isInitialLoad) return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--secondary)' }}>Loading Queue...</div>;

  return (
    <div className="fade-in">
      <header className="flex-between mb-40">
        <div>
          <h1 className="font-bold mb-8" style={{ fontSize: '2.25rem' }}>Approval Queue</h1>
          <p className="text-muted">Review and process pending leave applications. Logic is applied upon approval.</p>
        </div>

        <div style={{ position: 'relative', width: '350px' }}>
          <Search size={18} className="search-icon" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '44px' }}
            placeholder="Search by Employee or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </header>

      <PendingTable
        filteredPending={filteredPending}
        loading={loading}
        processing={processing}
        handleAction={handleAction}
      />

      <HistoryTable
        filteredHistory={filteredHistory}
        loading={loading}
        processing={processing}
        handleAction={handleAction}
        historyPage={historyPage}
        setHistoryPage={setHistoryPage}
        totalHistoryPages={totalHistoryPages}
        totalHistoryRecords={totalHistoryRecords}
      />

      <TardyTable
        filteredTardy={filteredTardy}
        paginatedTardy={paginatedTardy}
        totalTardyPages={totalTardyPages}
        tardyPage={tardyPage}
        setTardyPage={setTardyPage}
        search={search}
        loading={loading}
        processing={processing}
        handleTardyAction={handleTardyAction}
      />

    </div>
  );
};

export default Leaves;
