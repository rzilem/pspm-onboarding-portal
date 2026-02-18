'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Pen, Type, Eraser, Check, Loader2, CheckCircle2,
  ArrowLeft, Calendar, User, Mail, Briefcase, Building2,
  FileSignature,
} from 'lucide-react';
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
  const initialsCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingInitials, setIsDrawingInitials] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [hasDrawnInitials, setHasDrawnInitials] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [activeTab, setActiveTab] = useState<'draw' | 'type'>('draw');
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerCompany, setSignerCompany] = useState('');
  const [initials, setInitials] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [error, setError] = useState(false);

  const now = new Date();
  const dateString = now.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

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
          setSignerTitle(sig.signer_title || '');
          setSignerCompany(sig.signer_company || '');
          setDocumentName(sig.document_name || '');
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, sigId]);

  // Auto-generate initials from name
  useEffect(() => {
    if (signerName && !initials) {
      const parts = signerName.trim().split(/\s+/);
      const auto = parts.map((p) => p[0]?.toUpperCase() || '').join('');
      setInitials(auto);
    }
  }, [signerName, initials]);

  function initCanvas(canvas: HTMLCanvasElement | null) {
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
  }

  // Initialize canvases
  useEffect(() => {
    initCanvas(canvasRef.current);
    initCanvas(initialsCanvasRef.current);
  }, [loading]);

  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement | null) => {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Signature canvas handlers
  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const c = getCoords(e, canvasRef.current);
    if (!c) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
  }, [getCoords]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const c = getCoords(e, canvasRef.current);
    if (!c) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, getCoords]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  // Initials canvas handlers
  const startDrawInitials = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const c = getCoords(e, initialsCanvasRef.current);
    if (!c) return;
    const ctx = initialsCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawingInitials(true);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
  }, [getCoords]);

  const drawInitials = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingInitials) return;
    const c = getCoords(e, initialsCanvasRef.current);
    if (!c) return;
    const ctx = initialsCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    setHasDrawnInitials(true);
  }, [isDrawingInitials, getCoords]);

  const stopDrawInitials = useCallback(() => setIsDrawingInitials(false), []);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function clearInitialsCanvas() {
    const canvas = initialsCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnInitials(false);
  }

  async function handleSign() {
    if (!signerName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!consented) {
      toast.error('Please accept the consent checkbox');
      return;
    }

    const payload: Record<string, unknown> = {
      signer_name: signerName.trim(),
      signer_email: signerEmail.trim() || undefined,
      signer_title: signerTitle.trim() || undefined,
      signer_company: signerCompany.trim() || undefined,
      initials: initials.trim() || undefined,
      consent_given: true,
    };

    if (activeTab === 'draw') {
      if (!hasDrawn) { toast.error('Please draw your signature'); return; }
      payload.signature_type = 'draw';
      payload.signature_data = canvasRef.current?.toDataURL('image/png');
      if (hasDrawnInitials) {
        payload.initials_data = initialsCanvasRef.current?.toDataURL('image/png');
      }
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#00c9e3]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <h2 className="text-xl font-semibold">Signature Not Found</h2>
          <p className="text-sm text-gray-500 mt-2">This signature link is invalid or expired.</p>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">Document Signed</h2>
          <p className="text-sm text-gray-500 mt-2">
            Your signature has been recorded with a timestamp and IP address for ESIGN Act compliance.
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

  const canSubmit =
    consented &&
    signerName.trim().length > 0 &&
    (activeTab === 'draw' ? hasDrawn : typedName.trim().length > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/p/${token}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Portal
        </Button>

        {/* Document header */}
        {documentName && (
          <Card className="p-4 bg-gray-50 border-gray-200">
            <div className="flex items-center gap-2 text-sm">
              <FileSignature className="h-4 w-4 text-[#00c9e3]" />
              <span className="font-medium text-gray-900">{documentName}</span>
            </div>
          </Card>
        )}

        {/* Signer information — DocuSign-style fields */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="h-4 w-4 text-[#00c9e3]" />
            Signer Information
          </h3>

          {/* Row 1: Full Name + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                <User className="h-3 w-3" />
                Full Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Your full legal name"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                <Mail className="h-3 w-3" />
                Email
              </label>
              <Input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
          </div>

          {/* Row 2: Title + Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                <Briefcase className="h-3 w-3" />
                Title
              </label>
              <Input
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="e.g. Board President, Owner"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                <Building2 className="h-3 w-3" />
                Company / Association
              </label>
              <Input
                value={signerCompany}
                onChange={(e) => setSignerCompany(e.target.value)}
                placeholder="e.g. Falcon Pointe HOA"
              />
            </div>
          </div>

          {/* Row 3: Initials + Date Signed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Initials</label>
              <Input
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                placeholder="e.g. JD"
                maxLength={5}
                className="uppercase tracking-widest"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                <Calendar className="h-3 w-3" />
                Date Signed
              </label>
              <Input
                value={dateString}
                disabled
                className="bg-gray-50 text-gray-700"
              />
            </div>
          </div>
        </Card>

        {/* Signature pad */}
        <Card className="p-5">
          <p className="text-sm font-medium mb-4 flex items-center gap-2">
            <Pen className="h-4 w-4 text-[#00c9e3]" />
            Signature <span className="text-red-500">*</span>
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

            <TabsContent value="draw" className="mt-0 space-y-4">
              {/* Main signature canvas */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Signature</label>
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-[180px] border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none hover:border-[#00c9e3] transition-colors"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                  <div className="absolute bottom-10 left-8 right-8 border-b border-gray-300" />
                  <span className="absolute bottom-3 left-8 text-xs text-gray-400">Sign here</span>
                </div>
                <Button variant="outline" onClick={clearCanvas} disabled={!hasDrawn} size="sm" className="mt-2">
                  <Eraser className="h-3.5 w-3.5 mr-1" /> Clear Signature
                </Button>
              </div>

              {/* Initials canvas */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Initials (optional — draw)</label>
                <div className="relative">
                  <canvas
                    ref={initialsCanvasRef}
                    className="w-32 h-[80px] border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none hover:border-[#00c9e3] transition-colors"
                    onMouseDown={startDrawInitials}
                    onMouseMove={drawInitials}
                    onMouseUp={stopDrawInitials}
                    onMouseLeave={stopDrawInitials}
                    onTouchStart={startDrawInitials}
                    onTouchMove={drawInitials}
                    onTouchEnd={stopDrawInitials}
                  />
                </div>
                <Button variant="outline" onClick={clearInitialsCanvas} disabled={!hasDrawnInitials} size="sm" className="mt-1">
                  <Eraser className="h-3 w-3 mr-1" /> Clear
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="type" className="mt-0">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Type your full name</label>
              <div className="relative">
                <Input
                  placeholder="Type your full name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="text-2xl h-[180px] text-center border-2 border-dashed border-gray-300 hover:border-[#00c9e3] transition-colors"
                  style={{ fontFamily: "'Brush Script MT', cursive" }}
                />
                <div className="absolute bottom-10 left-8 right-8 border-b border-gray-300 pointer-events-none" />
              </div>
              {typedName && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Preview</p>
                  <p className="text-xl" style={{ fontFamily: "'Brush Script MT', cursive" }}>
                    {typedName}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Initials: {initials}</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Consent */}
        <Card className="p-5 border-amber-200 bg-amber-50/30">
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent"
              checked={consented}
              onCheckedChange={(v) => setConsented(v === true)}
              className="mt-0.5"
            />
            <label htmlFor="consent" className="text-sm text-gray-700 cursor-pointer leading-relaxed">
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
          Your signature will be recorded with a timestamp, IP address, and user agent for ESIGN Act and UETA compliance.
        </p>
    </div>
  );
}
