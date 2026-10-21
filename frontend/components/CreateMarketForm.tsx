"use client";

import { useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";

export interface CreateMarketFormData {
  fighterAName: string;
  fighterARecord: string;
  fighterANationality: string;
  fighterAWeightClass: string;
  fighterBName: string;
  fighterBRecord: string;
  fighterBNationality: string;
  fighterBWeightClass: string;
  scheduledAt: string;
  bettingEndsAt: string;
  oracleAddress: string;
}

export interface CreateMarketFormProps {
  onSubmit: (formData: CreateMarketFormData) => Promise<void>;
}

interface FormErrors {
  fighterAName?: string;
  fighterARecord?: string;
  fighterANationality?: string;
  fighterAWeightClass?: string;
  fighterBName?: string;
  fighterBRecord?: string;
  fighterBNationality?: string;
  fighterBWeightClass?: string;
  scheduledAt?: string;
  bettingEndsAt?: string;
  oracleAddress?: string;
}

const INITIAL: CreateMarketFormData = {
  fighterAName: "",
  fighterARecord: "",
  fighterANationality: "",
  fighterAWeightClass: "",
  fighterBName: "",
  fighterBRecord: "",
  fighterBNationality: "",
  fighterBWeightClass: "",
  scheduledAt: "",
  bettingEndsAt: "",
  oracleAddress: "",
};

export function formatUtcPreview(datetimeLocalStr: string): string | null {
  if (!datetimeLocalStr) return null;
  const d = new Date(datetimeLocalStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(".000", "");
}

function validate(data: CreateMarketFormData): FormErrors {
  const errors: FormErrors = {};

  if (!data.fighterAName.trim()) errors.fighterAName = "Required";
  else if (data.fighterAName.trim().length < 2) errors.fighterAName = "At least 2 characters";

  if (!data.fighterARecord.trim()) errors.fighterARecord = "Required";

  if (!data.fighterANationality.trim()) errors.fighterANationality = "Required";

  if (!data.fighterAWeightClass.trim()) errors.fighterAWeightClass = "Required";

  if (!data.fighterBName.trim()) errors.fighterBName = "Required";
  else if (data.fighterBName.trim().length < 2) errors.fighterBName = "At least 2 characters";

  if (!data.fighterBRecord.trim()) errors.fighterBRecord = "Required";

  if (!data.fighterBNationality.trim()) errors.fighterBNationality = "Required";

  if (!data.fighterBWeightClass.trim()) errors.fighterBWeightClass = "Required";

  const now = new Date();

  if (!data.scheduledAt) {
    errors.scheduledAt = "Required";
  } else {
    const scheduledTime = new Date(data.scheduledAt);
    if (isNaN(scheduledTime.getTime())) {
      errors.scheduledAt = "Invalid date format";
    } else if (scheduledTime <= now) {
      errors.scheduledAt = "Must be in the future";
    }
  }

  if (!data.bettingEndsAt) {
    errors.bettingEndsAt = "Required";
  } else {
    const lockTime = new Date(data.bettingEndsAt);
    if (isNaN(lockTime.getTime())) {
      errors.bettingEndsAt = "Invalid date format";
    } else if (lockTime <= now) {
      errors.bettingEndsAt = "Must be in the future";
    } else if (data.scheduledAt) {
      const scheduledTime = new Date(data.scheduledAt);
      if (!isNaN(scheduledTime.getTime()) && scheduledTime <= lockTime) {
        errors.bettingEndsAt = "Must be before fight time";
      }
    }
  }

  if (!data.oracleAddress.trim()) {
    errors.oracleAddress = "Required";
  } else {
    const trimmed = data.oracleAddress.trim();
    if (!StrKey.isValidEd25519PublicKey(trimmed)) {
      errors.oracleAddress = "Must be a valid G... Stellar address";
    }
  }

  return errors;
}

function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0;
}

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
      {children}
    </label>
  );
}

function UtcPreview({ value }: { value: string }) {
  const text = utcPreview(value);
  return text ? <p className="mt-1 text-xs text-gray-500">{text}</p> : null;
}

function Field({
  id,
  value,
  error,
  placeholder,
  type = "text",
  onChange,
}: {
  id: string;
  value: string;
  error?: string;
  placeholder: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 ${
          error ? "border-red-500" : "border-gray-700"
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function CreateMarketForm({ onSubmit }: CreateMarketFormProps): JSX.Element {
  const [formData, setFormData] = useState<CreateMarketFormData>(INITIAL);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const errors = validate(formData);
  const isValid = !hasErrors(errors);

  function set<K extends keyof CreateMarketFormData>(key: K, value: CreateMarketFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-sm">
      {/* Fighter A */}
      <fieldset>
        <legend className="text-base font-semibold text-white mb-3">Fighter A</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fighterAName">Name</Label>
            <Field id="fighterAName" value={formData.fighterAName} error={touched.fighterAName ? errors.fighterAName : undefined} placeholder="e.g. Muhammad Ali" onChange={(v) => set("fighterAName", v)} />
          </div>
          <div>
            <Label htmlFor="fighterARecord">Record</Label>
            <Field id="fighterARecord" value={formData.fighterARecord} error={touched.fighterARecord ? errors.fighterARecord : undefined} placeholder="e.g. 56-5" onChange={(v) => set("fighterARecord", v)} />
          </div>
          <div>
            <Label htmlFor="fighterANationality">Nationality</Label>
            <Field id="fighterANationality" value={formData.fighterANationality} error={touched.fighterANationality ? errors.fighterANationality : undefined} placeholder="e.g. USA" onChange={(v) => set("fighterANationality", v)} />
          </div>
          <div>
            <Label htmlFor="fighterAWeightClass">Weight Class</Label>
            <Field id="fighterAWeightClass" value={formData.fighterAWeightClass} error={touched.fighterAWeightClass ? errors.fighterAWeightClass : undefined} placeholder="e.g. Heavyweight" onChange={(v) => set("fighterAWeightClass", v)} />
          </div>
        </div>
      </fieldset>

      {/* Fighter B */}
      <fieldset>
        <legend className="text-base font-semibold text-white mb-3">Fighter B</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fighterBName">Name</Label>
            <Field id="fighterBName" value={formData.fighterBName} error={touched.fighterBName ? errors.fighterBName : undefined} placeholder="e.g. Joe Frazier" onChange={(v) => set("fighterBName", v)} />
          </div>
          <div>
            <Label htmlFor="fighterBRecord">Record</Label>
            <Field id="fighterBRecord" value={formData.fighterBRecord} error={touched.fighterBRecord ? errors.fighterBRecord : undefined} placeholder="e.g. 32-4" onChange={(v) => set("fighterBRecord", v)} />
          </div>
          <div>
            <Label htmlFor="fighterBNationality">Nationality</Label>
            <Field id="fighterBNationality" value={formData.fighterBNationality} error={touched.fighterBNationality ? errors.fighterBNationality : undefined} placeholder="e.g. USA" onChange={(v) => set("fighterBNationality", v)} />
          </div>
          <div>
            <Label htmlFor="fighterBWeightClass">Weight Class</Label>
            <Field id="fighterBWeightClass" value={formData.fighterBWeightClass} error={touched.fighterBWeightClass ? errors.fighterBWeightClass : undefined} placeholder="e.g. Heavyweight" onChange={(v) => set("fighterBWeightClass", v)} />
          </div>
        </div>
      </fieldset>

      {/* Scheduling & Oracle */}
      <fieldset>
        <legend className="text-base font-semibold text-white mb-3">Schedule & Oracle</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="scheduledAt">Fight Date / Time</Label>
            <Field id="scheduledAt" type="datetime-local" value={formData.scheduledAt} error={touched.scheduledAt ? errors.scheduledAt : undefined} placeholder="" onChange={(v) => set("scheduledAt", v)} />
            {formData.scheduledAt && formatUtcPreview(formData.scheduledAt) && (
              <p className="mt-1 text-xs text-gray-400">
                UTC: <span className="font-mono text-gray-300">{formatUtcPreview(formData.scheduledAt)}</span>
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="bettingEndsAt">Betting Closes At</Label>
            <Field id="bettingEndsAt" type="datetime-local" value={formData.bettingEndsAt} error={touched.bettingEndsAt ? errors.bettingEndsAt : undefined} placeholder="" onChange={(v) => set("bettingEndsAt", v)} />
            {formData.bettingEndsAt && formatUtcPreview(formData.bettingEndsAt) && (
              <p className="mt-1 text-xs text-gray-400">
                UTC: <span className="font-mono text-gray-300">{formatUtcPreview(formData.bettingEndsAt)}</span>
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="oracleAddress">Oracle Address</Label>
            <Field id="oracleAddress" value={formData.oracleAddress} error={touched.oracleAddress ? errors.oracleAddress : undefined} placeholder="G..." onChange={(v) => set("oracleAddress", v)} />
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={submitting || !isValid}
        className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Creating Market…" : "Create Market"}
      </button>
    </form>
  );
}
