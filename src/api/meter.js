import { mdmFetch } from './client.js';

/**
 * Per-meter billing-cycle register history (raw smart-meter readings:
 * cumulative energy per TOU zone, MD kW/kVA, power factor, tamper counts).
 * Confirmed live against mdm.genusdvvnl.in/urjaservice on 2026-08-19.
 *
 * @param {string} meterId    e.g. "GE9447014"
 * @param {object} [opts]
 * @param {string} [opts.consumerNo]
 * @param {number} [opts.year]        defaults to current year
 * @param {number} [opts.pageNumber]
 * @param {number} [opts.pageSize]
 * @param {boolean} [opts.applyMF]    apply the meter's multiplying factor
 */
export function getCurrentBillDataHistory(meterId, opts = {}) {
  return mdmFetch('/api/v1/Meter/getCurrentBillDataHistory', {
    method: 'PUT',
    body: {
      applyMF: opts.applyMF ?? true,
      consumerNo: opts.consumerNo ?? '',
      meterId,
      pageNumber: opts.pageNumber ?? 0,
      pageSize: opts.pageSize ?? 0,
      totalRecords: opts.totalRecords ?? 0,
      year: opts.year ?? new Date().getFullYear(),
    },
  });
}
