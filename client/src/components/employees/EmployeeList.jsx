import React from 'react';
import { Search, Users, X } from 'lucide-react';
import Pagination from '../Pagination';

// Employee Management: left card with search box, employee table and pager.
const EmployeeList = ({ search, setSearch, debouncedSearch, filtered, employees, totalEmployees, selectedEmp, setSelectedEmp, currentPage, setCurrentPage, totalPages, loading }) => (
  <div className="premium-card">
    <div className="form-group mb-24">
      <div style={{ position: 'relative' }}>
        <Search size={18} className="search-icon" />
        <input
          type="text"
          className="input-field"
          style={{ paddingLeft: '44px', paddingRight: search ? '40px' : '16px' }}
          placeholder="Search by ID, Name, Position, Office, Status..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setSearch('')}
            title="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>

    <div className="data-table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>EID</th>
            <th>Full Name</th>
            <th>Position</th>
            <th>Office</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-light)' }}>
                <div className="flex flex-col items-center gap-12">
                  <Users size={32} style={{ opacity: 0.2 }} />
                  <span>No employees found {debouncedSearch ? `matching "${debouncedSearch}"` : ''}</span>
                </div>
              </td>
            </tr>
          ) : (
            filtered.map(emp => (
              <tr
                key={emp.id}
                onClick={() => setSelectedEmp(emp)}
                className="clickable-row"
                style={{ background: selectedEmp?.id === emp.id ? '#e2e8f0' : '' }}
              >
                <td className="font-bold text-small" style={{ color: 'var(--secondary)' }}>{emp.id}</td>
                <td className="font-bold" style={{ fontSize: '0.9375rem' }}>{emp.full_name}</td>
                <td className="text-small">{emp.position}</td>
                <td className="text-small">{emp.office}</td>
                <td><span className="badge badge-approved">{emp.status}</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

    {/* Pagination Controls */}
    <Pagination page={currentPage} totalPages={totalPages} loading={loading} setPage={setCurrentPage}>
      Showing {employees.length} of {totalEmployees} employees
    </Pagination>
  </div>
);

export default EmployeeList;
