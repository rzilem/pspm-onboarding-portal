'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Pen, Type, Eraser, Check, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const CONSENT_TEXT =
  'I agree to sign this document electronically. I understand that my electronic signature has the same legal effect as a handwritten signature under the ESIGN Act and UETA.';

export default function SignaturePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const sigId = params.sigId as string;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [activeTab, setActiveTab] = useState<'draw' | 'type'>('draw');
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/portal/${token}/signatures`);
        if (!res.ok) { setError(true); return; }
        const sigs = await res.json();
        const sig = sigs.find((s: { id: string }) => s.id === sigId);
        if (!sig || sig.status === 'signed') {
          if (sig?.status === 'signed') setSigned(true);
          else setError(true);
        } else {
          setSignerName(sig.signer_name || '');
          setSignerEmail(sig.signer_email || '');
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, sigId]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [loading]);

  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const c = getCoords(e);
    if (!c) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
  }, [getCoords]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const c = getCoords(e);
    if (!c) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, getCoords]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  async function handleSign() {
    if (!consented) {
      toast.error('Please accept the consent checkbox');
      return;
    }

    const payload: Record<string, unknown> = {
      signer_name: signerName,
      signer_email: signerEmail,
      consent_given: true,
    };

    if (activeTab === 'draw') {
      if (!hasDrawn) { toast.error('Please draw your signature'); return; }
      payload.signature_type = 'draw';
      payload.signature_data = canvasRef.current?.toDataURL('image/png');
    } else {
      if (!typedName.trim()) { toast.error('Please type your name'); return; }
      payload.signature_type = 'type';
      payload.typed_name = typedName.trim();
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/${token}/signatures/${sigId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to sign');
      }

      setSigned(true);
      toast.success('Document signed successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#00c9e3]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <h2 className="text-xl font-semibold">Signature Not Found</h2>
          <p className="text-sm text-gray-500 mt-2">This signature link is invalid or expired.</p>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">Document Signed</h2>
          <p className="text-sm text-gray-500 mt-2">
            Your signature has been recorded with a timestamp and IP address.
          </p>
          <Button
            onClick={() => router.push(`/p/${token}`)}
            className="mt-6 bg-[#00c9e3] hover:bg-[#00b0c8]"
          >
            Back to Portal
          </Button>
        </Card>
      </div>
    );
  }

  const canSubmit = consented && (activeTab === 'draw' ? hasDrawn : typedName.trim().length > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#00c9e3] flex items-center justify-center">
            <span className="text-white font-bold text-sm">PS</span>
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">Sign Document</h1>
            <p className="text-xs text-gray-500">PS Property Management</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/p/${token}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Portal
        </Button>

        {/* Signer info */}
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Signer Information</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Full Name</label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Your full legal name"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Email</label>
              <Input
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
          </div>
        </Card>

        {/* Signature pad */}
        <Card className="p-5">
          <p className="text-sm font-medium mb-4 flex items-center gap-2">
            <Pen className="h-4 w-4" />
            Sign below
          </p>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'draw' | 'type')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="draw" className="flex items-center gap-2">
                <Pen className="h-4 w-4" /> Draw
              </TabsTrigger>
              <TabsTrigger value="type" className="flex items-center gap-2">
                <Type className="h-4 w-4" /> Type
              </TabsTrigger>
            </TabsList>

            <TabsContent value="draw" className="mt-0">
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="w-full h-[200px] border rounded-lg bg-white cursor-crosshair touch-none"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
                <div className="absolute bottom-8 left-8 right-8 border-b border-gray-300" />
                <span className="absolute bottom-2 left-8 text-xs text-gray-400">Sign here</span>
              </div>
              <Button variant="outline" onClick={clearCanvas} disabled={!hasDrawn} className="mt-2">
                <Eraser className="h-4 w-4 mr-1" /> Clear
              </Button>
            </TabsContent>

            <TabsContent value="type" className="mt-0">
              <div className="relative">
                <Input
                  placeholder="Type your full name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="text-2xl h-[200px] text-center"
                  style={{ fontFamily: "'Brush Script MT', cursive" }}
                />
                <div className="absolute bottom-8 left-8 right-8 border-b border-gray-300 pointer-events-none" />
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Consent */}
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent"
              checked={consented}
              onCheckedChange={(v) => setConsented(v === true)}
              className="mt-0.5"
            />
            <label htmlFor="consent" className="text-sm text-gray-700 cursor-pointer">
              {CONSENT_TEXT}
            </label>
          </div>
        </Card>

        {/* Submit */}
        <Button
          onClick={handleSign}
          disabled={!canSubmit || submitting}
          className="w-full bg-[#00c9e3] hover:bg-[#00b0c8] h-12 text-base"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Check className="h-5 w-5 mr-2" />
          )}
          Sign Document
        </Button>

        <p className="text-xs text-center text-gray-400 pb-8">
          Your signature will be recorded with a timestamp, IP address, and user agent for legal compliance.
        </p>
      </main>
    </div>
  );
}
