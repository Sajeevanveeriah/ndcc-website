'use client';

import { useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Pencil, SlidersHorizontal } from 'lucide-react';

type ScoringRule = {
  id: string;
  key: string;
  label: string;
  points: number | string;
  enabled: boolean;
  description: string | null;
};

type RuleForm = {
  points: string;
  enabled: boolean;
};

function sortRules(rules: ScoringRule[]) {
  return rules.slice().sort((a, b) => a.key.localeCompare(b.key));
}

export default function AdminFantasyScoringPage() {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
  const [form, setForm] = useState<RuleForm>({ points: '', enabled: true });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const response = await fetch('/api/admin/resources/fantasyScoringRules', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: ScoringRule[] }>(response);
        setRules(sortRules(result.data || []));
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch fantasy scoring rules.' });
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, []);

  const openEdit = (rule: ScoringRule) => {
    setEditingRule(rule);
    setForm({ points: String(rule.points), enabled: rule.enabled });
    setFormError('');
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!editingRule) return;
    const points = Number(form.points);
    if (Number.isNaN(points)) {
      setFormError('Points must be a valid number.');
      return;
    }

    setSaving(true);
    try {
      const response = await adminFetch('/api/admin/resources/fantasyScoringRules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingRule.id, points, enabled: form.enabled }),
      });
      const result = await parseApiResponse<{ data: ScoringRule }>(response);
      setRules((prev) => sortRules(prev.map((item) => (item.id === editingRule.id ? result.data : item))));
      setFeedback({ type: 'success', message: 'Scoring rule updated.' });
      setEditingRule(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save scoring rule.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
          <SlidersHorizontal className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
          Fantasy Scoring
        </h1>
        <p className="text-content-muted font-body mt-1">Manage scoring rule points and enabled status.</p>
      </div>

      <div className="mb-6 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 font-body">
        Changes affect future scoring calculations only until a recalculation feature exists.
      </div>
      {feedback && <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>}

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Key</TableHeader>
              <TableHeader>Label</TableHeader>
              <TableHeader>Points</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-mono text-xs">{rule.key}</TableCell>
                <TableCell className="font-medium">{rule.label}</TableCell>
                <TableCell>{rule.points}</TableCell>
                <TableCell>{rule.enabled ? <Badge variant="success">Enabled</Badge> : <Badge>Disabled</Badge>}</TableCell>
                <TableCell>{rule.description || '—'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={!!editingRule} onClose={() => setEditingRule(null)} title={editingRule ? `Edit ${editingRule.label}` : 'Edit Scoring Rule'}>
        <div className="space-y-4">
          <Input id="fantasy-rule-points" label="Points" type="number" step="0.01" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} error={formError} required />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Rule enabled
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditingRule(null)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}>Save Rule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
