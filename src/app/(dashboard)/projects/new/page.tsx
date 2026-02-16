'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Template } from '@/lib/types';
import { toast } from 'sonner';

function getApiKey(): string {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('admin_api_key') || '';
  }
  return '';
}

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: '',
    template_id: '',
    client_company_name: '',
    client_contact_name: '',
    client_contact_email: '',
    client_contact_phone: '',
    community_name: '',
    total_units: '',
    management_start_date: '',
    assigned_staff_email: '',
    target_completion_date: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/templates?active_only=true', {
          headers: { 'X-API-Key': getApiKey() },
        });
        if (res.ok) setTemplates(await res.json());
      } catch (err) {
        console.error('Failed to load templates:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        client_company_name: form.client_company_name || null,
        client_contact_name: form.client_contact_name || null,
        client_contact_email: form.client_contact_email || null,
        client_contact_phone: form.client_contact_phone || null,
        community_name: form.community_name || null,
        total_units: form.total_units ? parseInt(form.total_units) : null,
        management_start_date: form.management_start_date || null,
        assigned_staff_email: form.assigned_staff_email || null,
        target_completion_date: form.target_completion_date || null,
      };

      if (form.template_id) {
        body.template_id = form.template_id;
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'X-API-Key': getApiKey(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create project');
      }

      const project = await res.json();
      toast.success('Project created!');
      router.push(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Onboarding Project</h1>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s < step
                  ? 'bg-[#00c9e3] text-white'
                  : s === step
                    ? 'bg-[#00c9e3]/10 text-[#00c9e3] border-2 border-[#00c9e3]'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className={`w-16 h-0.5 ${s < step ? 'bg-[#00c9e3]' : 'bg-gray-200'}`} />}
          </div>
        ))}
        <div className="ml-4 text-sm text-gray-500">
          {step === 1 ? 'Choose Template' : step === 2 ? 'Client Info' : 'Review & Create'}
        </div>
      </div>

      {/* Step 1: Template */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div
                  onClick={() => updateForm('template_id', '')}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    !form.template_id ? 'border-[#00c9e3] bg-[#00c9e3]/5' : 'hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium">Blank Project</p>
                  <p className="text-sm text-gray-500">Start from scratch with no template tasks</p>
                </div>
                {templates.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      updateForm('template_id', t.id);
                      updateForm('name', t.name);
                    }}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      form.template_id === t.id ? 'border-[#00c9e3] bg-[#00c9e3]/5' : 'hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{t.name}</p>
                      {t.estimated_days && (
                        <span className="text-xs text-gray-400">{t.estimated_days} days est.</span>
                      )}
                    </div>
                    {t.description && <p className="text-sm text-gray-500 mt-1">{t.description}</p>}
                  </div>
                ))}
              </>
            )}

            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep(2)} className="bg-[#00c9e3] hover:bg-[#00b0c8]">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Client info */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Client & Community Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Project Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="e.g. Falcon Pointe HOA Onboarding"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Community Name</Label>
                <Input
                  value={form.community_name}
                  onChange={(e) => updateForm('community_name', e.target.value)}
                  placeholder="e.g. Falcon Pointe"
                />
              </div>
              <div>
                <Label>Total Units</Label>
                <Input
                  type="number"
                  value={form.total_units}
                  onChange={(e) => updateForm('total_units', e.target.value)}
                  placeholder="e.g. 450"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Client Company</Label>
                <Input
                  value={form.client_company_name}
                  onChange={(e) => updateForm('client_company_name', e.target.value)}
                  placeholder="HOA Board / Company name"
                />
              </div>
              <div>
                <Label>Contact Name</Label>
                <Input
                  value={form.client_contact_name}
                  onChange={(e) => updateForm('client_contact_name', e.target.value)}
                  placeholder="Board president name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  value={form.client_contact_email}
                  onChange={(e) => updateForm('client_contact_email', e.target.value)}
                  placeholder="president@hoa.com"
                />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input
                  type="tel"
                  value={form.client_contact_phone}
                  onChange={(e) => updateForm('client_contact_phone', e.target.value)}
                  placeholder="(512) 555-0100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Management Start Date</Label>
                <Input
                  type="date"
                  value={form.management_start_date}
                  onChange={(e) => updateForm('management_start_date', e.target.value)}
                />
              </div>
              <div>
                <Label>Target Completion</Label>
                <Input
                  type="date"
                  value={form.target_completion_date}
                  onChange={(e) => updateForm('target_completion_date', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Assigned Staff</Label>
              <Input
                type="email"
                value={form.assigned_staff_email}
                onChange={(e) => updateForm('assigned_staff_email', e.target.value)}
                placeholder="staff@psprop.net"
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(3)} className="bg-[#00c9e3] hover:bg-[#00b0c8]">
                Review <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Create</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <Row label="Project" value={form.name} />
              <Row label="Template" value={templates.find((t) => t.id === form.template_id)?.name || 'Blank'} />
              <Row label="Community" value={form.community_name} />
              <Row label="Units" value={form.total_units} />
              <Row label="Client" value={`${form.client_contact_name} (${form.client_contact_email})`} />
              <Row label="Staff" value={form.assigned_staff_email} />
              <Row label="Start" value={form.management_start_date} />
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !form.name.trim()}
                className="bg-[#00c9e3] hover:bg-[#00b0c8]"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Create Project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value || '—'}</span>
    </div>
  );
}
