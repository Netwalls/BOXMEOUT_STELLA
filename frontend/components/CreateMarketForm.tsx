"use client";

import { useState } from "react";

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

const STARTS_WITH_G = /^G[A-Z0-9]{55}$/;

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

  if (!data.scheduledAt) errors.scheduledAt = "Required";

  if (!data.bettingEndsAt) errors.bettingEndsAt = "Required";
  else if (data.scheduledAt && new Date(data.bettingEndsAt) >= new Date(data.scheduledAt)) {
    errors.bettingEndsAt = "Must be before fight time";
  }

  if (!data.oracleAddress.trim()) errors.oracleAddress = "Required";
  else if (!STARTS_WITH_G.test(data.oracleAddress.trim())) {
    errors.oracleAddress = "Must be a valid G... Stellar address";
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
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof CreateMarketFormData>(key: K, value: CreateMarketFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const validationErrors = validate(formData);
    setErrors(validationErrors);
    if (hasErrors(validationErrors)) return;
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
            <Field id="fighterAName" value={formData.fighterAName} error={errors.fighterAName} placeholder="e.g. Muhammad Ali" onChange={(v) => set("fighterAName", v)} />
          </div>
          <div>
            <Label htmlFor="fighterARecord">Record</Label>
            <Field id="fighterARecord" value={formData.fighterARecord} error={errors.fighterARecord} placeholder="e.g. 56-5" onChange={(v) => set("fighterARecord", v)} />
          </div>
          <div>
            <Label htmlFor="fighterANationality">Nationality</Label>
            <Field id="fighterANationality" value={formData.fighterANationality} error={errors.fighterANationality} placeholder="e.g. USA" onChange={(v) => set("fighterANationality", v)} />
          </div>
          <div>
            <Label htmlFor="fighterAWeightClass">Weight Class</Label>
            <Field id="fighterAWeightClass" value={formData.fighterAWeightClass} error={errors.fighterAWeightClass} placeholder="e.g. Heavyweight" onChange={(v) => set("fighterAWeightClass", v)} />
          </div>
        </div>
      </fieldset>

      {/* Fighter B */}
      <fieldset>
        <legend className="text-base font-semibold text-white mb-3">Fighter B</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fighterBName">Name</Label>
            <Field id="fighterBName" value={formData.fighterBName} error={errors.fighterBName} placeholder="e.g. Joe Frazier" onChange={(v) => set("fighterBName", v)} />
          </div>
          <div>
            <Label htmlFor="fighterBRecord">Record</Label>
            <Field id="fighterBRecord" value={formData.fighterBRecord} error={errors.fighterBRecord} placeholder="e.g. 32-4" onChange={(v) => set("fighterBRecord", v)} />
          </div>
          <div>
            <Label htmlFor="fighterBNationality">Nationality</Label>
            <Field id="fighterBNationality" value={formData.fighterBNationality} error={errors.fighterBNationality} placeholder="e.g. USA" onChange={(v) => set("fighterBNationality", v)} />
          </div>
          <div>
            <Label htmlFor="fighterBWeightClass">Weight Class</Label>
            <Field id="fighterBWeightClass" value={formData.fighterBWeightClass} error={errors.fighterBWeightClass} placeholder="e.g. Heavyweight" onChange={(v) => set("fighterBWeightClass", v)} />
          </div>
        </div>
      </fieldset>

      {/* Scheduling & Oracle */}
      <fieldset>
        <legend className="text-base font-semibold text-white mb-3">Schedule & Oracle</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="scheduledAt">Fight Date / Time</Label>
            <Field id="scheduledAt" type="datetime-local" value={formData.scheduledAt} error={errors.scheduledAt} placeholder="" onChange={(v) => set("scheduledAt", v)} />
          </div>
          <div>
            <Label htmlFor="bettingEndsAt">Betting Closes At</Label>
            <Field id="bettingEndsAt" type="datetime-local" value={formData.bettingEndsAt} error={errors.bettingEndsAt} placeholder="" onChange={(v) => set("bettingEndsAt", v)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="oracleAddress">Oracle Address</Label>
            <Field id="oracleAddress" value={formData.oracleAddress} error={errors.oracleAddress} placeholder="G..." onChange={(v) => set("oracleAddress", v)} />
          </div>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Creating Market…" : "Create Market"}
      </button>
    </form>
  );
}
