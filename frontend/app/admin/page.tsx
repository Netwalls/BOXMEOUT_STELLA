"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, CheckCircle, Plus, Trash2, Edit2, X, Save, AlertTriangle } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import {
  AdminMarketResolution,
  OracleConfig,
  Outcome,
  fetchPendingResolutions,
  resolveMarket,
  fetchOracles,
  createOracle,
  deleteOracle,
  updateOracle,
} from "@/lib/api";
import { truncateAddress } from "@/lib/stellar";

// ─── Admin access list ────────────────────────────────────────────────────────

/**
 * Comma-separated Stellar addresses that have admin access.
 * Set NEXT_PUBLIC_ADMIN_ADDRESSES in your .env.local file.
 */
const ADMIN_ADDRESSES: string[] = (
  process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? ""
)
  .split(",")
  .map((a) => a.trim())
  .filter(Boolean);

function isAdmin(address: string | null): boolean {
  if (!address) return false;
  // Allow all addresses in development when no list is configured
  if (ADMIN_ADDRESSES.length === 0 && process.env.NODE_ENV === "development") return true;
  return ADMIN_ADDRESSES.includes(address);
}

// ─── Shared focus ring ────────────────────────────────────────────────────────

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900";

// ─── Pending Resolutions section ─────────────────────────────────────────────

const OUTCOMES: { label: string; value: Outcome }[] = [
  { label: "Fighter A wins", value: "FighterA" },
  { label: "Fighter B wins", value: "FighterB" },
  { label: "Draw", value: "Draw" },
  { label: "No Contest", value: "NoContest" },
];

interface PendingResolutionsProps {
  adminKey: string;
}

function PendingResolutions({ adminKey }: PendingResolutionsProps) {
  const [markets, setMarkets] = useState<AdminMarketResolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedOutcomes, setSelectedOutcomes] = useState<Record<string, Outcome>>({});
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPendingResolutions(adminKey);
      setMarkets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch pending markets.");
    } finally {
      setIsLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = useCallback(
    async (marketId: string) => {
      const outcome = selectedOutcomes[marketId];
      if (!outcome) return;
      setResolvingId(marketId);
      try {
        await resolveMarket(marketId, outcome, adminKey);
        setResolvedIds((prev) => new Set([...prev, marketId]));
        setMarkets((prev) => prev.filter((m) => m.marketId !== marketId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to resolve market.");
      } finally {
        setResolvingId(null);
      }
    },
    [adminKey, selectedOutcomes],
  );

  return (
    <section aria-labelledby="pending-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="pending-heading" className="text-lg font-semibold text-white">
          Pending Resolutions
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={isLoading}
          className={`flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50 ${focusRing}`}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-800 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-8 text-center text-gray-500">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
          <p>No markets pending resolution.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {markets.map((m) => (
            <div
              key={m.marketId}
              className="bg-gray-800 rounded-xl border border-gray-700 p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">
                    {m.fighterA.name} <span className="text-gray-500">vs</span> {m.fighterB.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ID: <span className="font-mono">{m.marketId}</span>
                    {" · "}
                    {new Date(m.scheduledAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor={`outcome-${m.marketId}`} className="sr-only">
                    Select outcome for {m.fighterA.name} vs {m.fighterB.name}
                  </label>
                  <select
                    id={`outcome-${m.marketId}`}
                    value={selectedOutcomes[m.marketId] ?? ""}
                    onChange={(e) =>
                      setSelectedOutcomes((prev) => ({
                        ...prev,
                        [m.marketId]: e.target.value as Outcome,
                      }))
                    }
                    className={`bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 ${focusRing}`}
                  >
                    <option value="" disabled>Select outcome…</option>
                    {OUTCOMES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleResolve(m.marketId)}
                    disabled={!selectedOutcomes[m.marketId] || resolvingId === m.marketId}
                    className={`flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors ${focusRing}`}
                  >
                    {resolvingId === m.marketId ? (
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                    )}
                    Resolve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Oracle CRUD section ──────────────────────────────────────────────────────

interface OracleSectionProps {
  adminKey: string;
}

function OracleSection({ adminKey }: OracleSectionProps) {
  const [oracles, setOracles] = useState<OracleConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOracles(adminKey);
      setOracles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch oracles.");
    } finally {
      setIsLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = useCallback(async () => {
    if (!newAddress.trim() || !newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const oracle = await createOracle({ address: newAddress.trim(), name: newName.trim() }, adminKey);
      setOracles((prev) => [...prev, oracle]);
      setNewAddress("");
      setNewName("");
      setShowAdd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add oracle.");
    } finally {
      setSaving(false);
    }
  }, [newAddress, newName, adminKey]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setError(null);
      try {
        await deleteOracle(id, adminKey);
        setOracles((prev) => prev.filter((o) => o.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete oracle.");
      } finally {
        setDeletingId(null);
      }
    },
    [adminKey],
  );

  const handleSaveEdit = useCallback(
    async (id: string) => {
      if (!editName.trim()) return;
      setSaving(true);
      setError(null);
      try {
        const updated = await updateOracle(id, { name: editName.trim() }, adminKey);
        setOracles((prev) => prev.map((o) => (o.id === id ? updated : o)));
        setEditingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update oracle.");
      } finally {
        setSaving(false);
      }
    },
    [editName, adminKey],
  );

  const handleToggleActive = useCallback(
    async (oracle: OracleConfig) => {
      setError(null);
      try {
        const updated = await updateOracle(oracle.id, { active: !oracle.active }, adminKey);
        setOracles((prev) => prev.map((o) => (o.id === oracle.id ? updated : o)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update oracle.");
      }
    },
    [adminKey],
  );

  return (
    <section aria-labelledby="oracles-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="oracles-heading" className="text-lg font-semibold text-white">
          Oracle Configuration
        </h2>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className={`flex items-center gap-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors ${focusRing}`}
        >
          {showAdd ? (
            <><X className="h-4 w-4" aria-hidden="true" /> Cancel</>
          ) : (
            <><Plus className="h-4 w-4" aria-hidden="true" /> Add Oracle</>
          )}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-900/20 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add oracle form */}
      {showAdd && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">New Oracle</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="oracle-address" className="block text-xs text-gray-400 mb-1">
                Stellar Address
              </label>
              <input
                id="oracle-address"
                type="text"
                placeholder="G…"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 ${focusRing}`}
              />
            </div>
            <div>
              <label htmlFor="oracle-name" className="block text-xs text-gray-400 mb-1">
                Display Name
              </label>
              <input
                id="oracle-name"
                type="text"
                placeholder="e.g. Primary Oracle"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 ${focusRing}`}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !newAddress.trim() || !newName.trim()}
            className={`flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors ${focusRing}`}
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Add
          </button>
        </div>
      )}

      {/* Oracle table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="bg-gray-800 rounded-xl h-14 animate-pulse" />
          ))}
        </div>
      ) : oracles.length === 0 ? (
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-8 text-center text-gray-500">
          <p>No oracles configured.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <caption className="sr-only">Oracle configuration table</caption>
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Address
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {oracles.map((oracle) => (
                <tr key={oracle.id} className="bg-gray-900 hover:bg-gray-800/60 transition-colors">
                  <td className="px-4 py-3">
                    {editingId === oracle.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        className={`bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white w-full max-w-[12rem] ${focusRing}`}
                        aria-label="Edit oracle name"
                      />
                    ) : (
                      <span className="text-gray-200">{oracle.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-400 text-xs">
                    {truncateAddress(oracle.address)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(oracle)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${focusRing} ${
                        oracle.active
                          ? "bg-green-900/40 text-green-400 hover:bg-green-900/60"
                          : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                      }`}
                      aria-label={oracle.active ? "Deactivate oracle" : "Activate oracle"}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${oracle.active ? "bg-green-400" : "bg-gray-500"}`}
                        aria-hidden="true"
                      />
                      {oracle.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {editingId === oracle.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(oracle.id)}
                            disabled={saving}
                            aria-label="Save name"
                            className={`text-green-400 hover:text-green-300 transition-colors disabled:opacity-50 ${focusRing}`}
                          >
                            <Save className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel edit"
                            className={`text-gray-400 hover:text-white transition-colors ${focusRing}`}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(oracle.id);
                            setEditName(oracle.name);
                          }}
                          aria-label={`Edit oracle ${oracle.name}`}
                          className={`text-gray-400 hover:text-white transition-colors ${focusRing}`}
                        >
                          <Edit2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(oracle.id)}
                        disabled={deletingId === oracle.id}
                        aria-label={`Delete oracle ${oracle.name}`}
                        className={`text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 ${focusRing}`}
                      >
                        {deletingId === oracle.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage(): JSX.Element {
  const { address, isConnected, connect } = useWallet();
  const authorized = isAdmin(address);

  /**
   * The admin key sent with every request. In this prototype we use the
   * wallet address itself as the bearer token; a real deployment would
   * use a signed challenge or a proper JWT. The env var allows overriding
   * for development/testing.
   */
  const adminKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? address ?? "";

  if (!isConnected || !address) {
    return (
      <div className="container mx-auto px-4 py-16 text-center space-y-4">
        <Shield className="h-12 w-12 mx-auto text-amber-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-gray-400">Connect your admin wallet to continue.</p>
        <button
          type="button"
          onClick={connect}
          className={`inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition-colors ${focusRing}`}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="container mx-auto px-4 py-16 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 mx-auto text-red-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-white">Access Denied</h1>
        <p className="text-gray-400">
          Wallet{" "}
          <span className="font-mono text-gray-300">{truncateAddress(address)}</span>{" "}
          is not on the admin list.
        </p>
        <p className="text-xs text-gray-500">
          Add your address to <code className="text-gray-400">NEXT_PUBLIC_ADMIN_ADDRESSES</code> to grant access.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-amber-400" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Logged in as{" "}
            <span className="font-mono text-gray-300">{truncateAddress(address)}</span>
          </p>
        </div>
      </div>

      {/* Sections */}
      <PendingResolutions adminKey={adminKey} />
      <hr className="border-gray-800" />
      <OracleSection adminKey={adminKey} />
    </div>
  );
}
