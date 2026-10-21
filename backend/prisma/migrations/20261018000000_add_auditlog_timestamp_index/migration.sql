-- B-101: Index AuditLog.timestamp so the retention prune job and date-range admin queries avoid full scans
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
