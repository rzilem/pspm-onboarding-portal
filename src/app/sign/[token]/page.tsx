'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Pen, Type, Eraser, Check, Loader2, CheckCircle2,
  Download, ArrowRight, Shield, FileText, AlertCircle,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

// 5-step signing flow for management agreements
type Step = 'identity' | 'consent' | 'review' | 'sign' | 'complete';

const ESIGN_CONSENT_TEXT = `ELECTRONIC SIGNATURE DISCLOSURE

By selecting "I consent," you agree to use electronic signatures to sign this management agreement between your Association and PS Property Management Company, Inc.

You have the right to:
- Withdraw your consent at any time by contacting PS Property Management at 512-251-6122 or admin@psprop.net
- Request a paper copy of this agreement at no charge
- Receive this agreement in non-electronic form upon request

To access and retain electronic records, you need:
- A current web browser (Chrome, Firefox, Safari, or Edge)
- A device capable of displaying PDF documents
- An active email address for receiving signed copies

If you do not consent to electronic signatures, please contact PS Property Management to arrange paper signing.`;

interface SignerInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  sign_order: number;
  status: string;
  document_title: string;
  pdf_url: string;
  all_signers: { name: string; status: string; is_internal: boolean }[];
}

export default function AgreementSigningPage() {
  const params = useParams();
  const token = params.token as string;

  const [step, setStep] = useState<Step>('identity');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signer, setSigner] = useState<SignerInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Consent state
  const [consentElectronic, setConsentElectronic] = useState(false);
  const [consentCopy, setConsentCopy] = useState(false);

  // Signature state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialsCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingInitials, setIsDrawingInitials] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [hasDrawnInitials, setHasDrawnInitials] = useState(false);
  const [signatureTab, setSignatureTab] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [typedInitials, setTypedInitials] = useState('');
  const [legalConsent, setLegalConsent] = useState(false);

  // Load signer info
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sign/${token}`);
        if (res.status === 404) {
          setError('expired');
          return;
        }
        if (res.status === 410) {
          setError('already_signed');
          return;
        }
        if (!res.ok) {
          setError('invalid');
          return;
        }
        const data = await res.json();
        setSigner(data);

        // Auto-fill initials
        const names = data.name.split(' ');
        setTypedInitials(
          names.map((n: string) => n.charAt(0).toUpperCase()).join('')
        );
      } catch {
        setError('network');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // Track view
  useEffect(() => {
    if (signer) {
      fetch(`/api/sign/${token}/view`, { method: 'POST' }).catch(() => {});
    }
  }, [signer, token]);

  // Canvas drawing
  const getCtx = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = '#1B4F72';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    return ctx;
  }, []);

  const startDraw = useCallback((
    e: React.PointerEvent,
    canvas: HTMLCanvasElement | null,
    setDrawing: (v: boolean) => void
  ) => {
    const ctx = getCtx(canvas);
    if (!ctx || !canvas) return;
    setDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.beginPath();
    ctx.moveTo(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY
    );
  }, [getCtx]);

  const draw = useCallback((
    e: React.PointerEvent,
    canvas: HTMLCanvasElement | null,
    drawing: boolean
  ) => {
    if (!drawing) return;
    const ctx = getCtx(canvas);
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.lineTo(
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY
    );
    ctx.stroke();
  }, [getCtx]);

  const endDraw = useCallback((
    setDrawing: (v: boolean) => void,
    setHas: (v: boolean) => void
  ) => {
    setDrawing(false);
    setHas(true);
  }, []);

  const clearCanvas = useCallback((
    canvas: HTMLCanvasElement | null,
    setHas: (v: boolean) => void
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHas(false);
  }, []);

  const getCanvasBase64 = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return '';
    return canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
  };

  // Submit signature
  const handleSubmit = async () => {
    if (!signer) return;

    const signatureData = signatureTab === 'draw'
      ? getCanvasBase64(canvasRef.current)
      : typedName;

    const initialsData = signatureTab === 'draw'
      ? getCanvasBase64(initialsCanvasRef.current)
      : typedInitials;

    if (signatureTab === 'draw' && !hasDrawn) {
      toast.error('Please draw your signature');
      return;
    }
    if (signatureTab === 'type' && !typedName.trim()) {
      toast.error('Please type your name');
      return;
    }
    if (!legalConsent) {
      toast.error('Please confirm the legal binding checkbox');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sign/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_type: signatureTab,
          signature_data: signatureData,
          typed_name: signatureTab === 'type' ? typedName : signer.name,
          initials: typedInitials,
          initials_data: initialsData,
          consent_text: ESIGN_CONSENT_TEXT,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit signature');
      }

      setStep('complete');
    } catch (err: any) {
      toast.error(err.message || 'Error submitting signature');
    } finally {
      setSubmitting(false);
    }
  };

  const maskedEmail = signer?.email
    ? signer.email.replace(/(.{2})(.*)(@.*)/, '$1●●●$3')
    : '';

  const now = new Date();
  const dateString = now.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Loading ──
  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#3B6FB6]" />
          <p className="mt-4 text-muted-foreground">Loading agreement...</p>
        </div>
      </PageShell>
    );
  }

  // ── Error States ──
  if (error) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-16">
          {error === 'expired' ? (
            <>
              <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">This signing link has expired</h2>
              <p className="text-muted-foreground mb-6">
                Management agreements expire after 14 days for security.
                Please contact PS Property Management to receive a new signing link.
              </p>
            </>
          ) : error === 'already_signed' ? (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Already Signed</h2>
              <p className="text-muted-foreground mb-6">
                This agreement has already been signed. You should have received a confirmation email with your signed copy.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Invalid Link</h2>
              <p className="text-muted-foreground mb-6">
                This signing link is not valid. Please check your email for the correct link
                or contact PS Property Management.
              </p>
            </>
          )}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center justify-center gap-2">
              <Phone className="h-4 w-4" /> 512-251-6122
            </p>
            <p>info@psprop.net</p>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!signer) return null;

  // ── Step 1: Identity Confirmation ──
  if (step === 'identity') {
    return (
      <PageShell>
        <div className="max-w-md mx-auto py-12">
          <Card className="p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold">Management Agreement</h2>
              <p className="text-muted-foreground mt-1">{signer.document_title}</p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Prepared for:</span>
                <span className="font-medium">{signer.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium">{signer.role}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{maskedEmail}</span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Please confirm your identity to proceed to the agreement.
            </p>

            <Button className="w-full bg-[#3B6FB6] hover:bg-[#3B6FB6]/90" onClick={() => setStep('consent')}>
              Confirm & Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <p className="text-xs text-center text-muted-foreground mt-4">
              Not you?{' '}
              <a href="tel:5122516122" className="underline">Contact PS Property Management</a>
            </p>
          </Card>
        </div>
      </PageShell>
    );
  }

  // ── Step 2: ESIGN Consent ──
  if (step === 'consent') {
    return (
      <PageShell>
        <div className="max-w-md mx-auto py-12">
          <Card className="p-8">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-[#1B4F72]" />
              <h2 className="text-lg font-semibold">Electronic Signature Consent</h2>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              By proceeding, you agree to use electronic signatures for this agreement
              per the ESIGN Act and Texas UETA.
            </p>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent-electronic"
                  checked={consentElectronic}
                  onCheckedChange={(v) => setConsentElectronic(!!v)}
                />
                <label htmlFor="consent-electronic" className="text-sm leading-snug">
                  I consent to use electronic signatures for this agreement
                </label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent-copy"
                  checked={consentCopy}
                  onCheckedChange={(v) => setConsentCopy(!!v)}
                />
                <label htmlFor="consent-copy" className="text-sm leading-snug">
                  I understand I may request a paper copy at any time by contacting
                  PS Property Management at 512-251-6122
                </label>
              </div>
            </div>

            <Button
              className="w-full bg-[#3B6FB6] hover:bg-[#3B6FB6]/90"
              disabled={!consentElectronic || !consentCopy}
              onClick={() => setStep('review')}
            >
              Continue to Agreement
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        </div>
      </PageShell>
    );
  }

  // ── Step 3: Document Review ──
  if (step === 'review') {
    return (
      <PageShell>
        <div className="max-w-3xl mx-auto py-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Review Agreement
            </h2>
            <a
              href={signer.pdf_url}
              download
              className="text-sm text-[#3B6FB6] hover:underline flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </div>

          {/* PDF Viewer */}
          <div className="border rounded-lg bg-white overflow-hidden mb-6" style={{ height: '70vh' }}>
            <iframe
              src={`${signer.pdf_url}#toolbar=0&navpanes=0`}
              className="w-full h-full"
              title="Agreement PDF"
            />
          </div>

          {/* Signer status bar */}
          {signer.all_signers.length > 1 && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
              <span>Signatures:</span>
              {signer.all_signers.filter(s => !s.is_internal).map((s, i) => (
                <span key={i} className="flex items-center gap-1">
                  {s.status === 'signed' ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : s.name === signer.name ? (
                    <span className="font-medium text-foreground">You</span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-gray-300 inline-block" />
                  )}
                  {s.name !== signer.name && <span>{s.name.split(' ')[0]}</span>}
                  {i < signer.all_signers.filter(s2 => !s2.is_internal).length - 1 && (
                    <span className="mx-1">·</span>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('consent')}>
              Back
            </Button>
            <Button className="bg-[#3B6FB6] hover:bg-[#3B6FB6]/90" onClick={() => setStep('sign')}>
              Proceed to Sign
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Step 4: Signature Capture ──
  if (step === 'sign') {
    return (
      <PageShell>
        <div className="max-w-lg mx-auto py-8">
          <h2 className="text-lg font-semibold mb-6">Sign the Agreement</h2>

          {/* Signature */}
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">Your Signature</label>
            <Tabs value={signatureTab} onValueChange={(v) => setSignatureTab(v as 'draw' | 'type')}>
              <TabsList className="w-full mb-3">
                <TabsTrigger value="draw" className="flex-1">
                  <Pen className="mr-2 h-3 w-3" /> Draw
                </TabsTrigger>
                <TabsTrigger value="type" className="flex-1">
                  <Type className="mr-2 h-3 w-3" /> Type
                </TabsTrigger>
              </TabsList>

              <TabsContent value="draw">
                <div className="border rounded-lg bg-white relative" style={{ touchAction: 'none' }}>
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={150}
                    className="w-full cursor-crosshair"
                    style={{ height: '120px' }}
                    onPointerDown={(e) => startDraw(e, canvasRef.current, setIsDrawing)}
                    onPointerMove={(e) => draw(e, canvasRef.current, isDrawing)}
                    onPointerUp={() => endDraw(setIsDrawing, setHasDrawn)}
                    onPointerLeave={() => { if (isDrawing) endDraw(setIsDrawing, setHasDrawn); }}
                  />
                  {!hasDrawn && (
                    <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/50 pointer-events-none">
                      Draw your signature here
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => clearCanvas(canvasRef.current, setHasDrawn)}
                >
                  <Eraser className="mr-1 h-3 w-3" /> Clear
                </Button>
              </TabsContent>

              <TabsContent value="type">
                <Input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Type your full legal name"
                  className="text-xl italic font-serif"
                  style={{ fontFamily: 'Georgia, serif' }}
                />
                {typedName && (
                  <div className="mt-2 p-3 border rounded bg-white">
                    <p className="text-2xl italic text-[#1B4F72]" style={{ fontFamily: 'Georgia, serif' }}>
                      {typedName}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Initials */}
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">Your Initials</label>
            {signatureTab === 'draw' ? (
              <>
                <div className="border rounded-lg bg-white relative" style={{ touchAction: 'none', maxWidth: '200px' }}>
                  <canvas
                    ref={initialsCanvasRef}
                    width={200}
                    height={100}
                    className="w-full cursor-crosshair"
                    style={{ height: '80px' }}
                    onPointerDown={(e) => startDraw(e, initialsCanvasRef.current, setIsDrawingInitials)}
                    onPointerMove={(e) => draw(e, initialsCanvasRef.current, isDrawingInitials)}
                    onPointerUp={() => endDraw(setIsDrawingInitials, setHasDrawnInitials)}
                    onPointerLeave={() => { if (isDrawingInitials) endDraw(setIsDrawingInitials, setHasDrawnInitials); }}
                  />
                  {!hasDrawnInitials && (
                    <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50 pointer-events-none">
                      {typedInitials}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => clearCanvas(initialsCanvasRef.current, setHasDrawnInitials)}
                >
                  <Eraser className="mr-1 h-3 w-3" /> Clear
                </Button>
              </>
            ) : (
              <Input
                value={typedInitials}
                onChange={(e) => setTypedInitials(e.target.value.toUpperCase())}
                placeholder="SC"
                className="w-24 text-center text-xl italic font-serif"
                maxLength={4}
                style={{ fontFamily: 'Georgia, serif' }}
              />
            )}
          </div>

          {/* Legal binding checkbox */}
          <div className="flex items-start gap-3 mb-4">
            <Checkbox
              id="legal-consent"
              checked={legalConsent}
              onCheckedChange={(v) => setLegalConsent(!!v)}
            />
            <label htmlFor="legal-consent" className="text-sm leading-snug">
              I agree that my electronic signature is legally binding
            </label>
          </div>

          {/* Metadata display */}
          <div className="text-xs text-muted-foreground space-y-1 mb-6 p-3 bg-muted/50 rounded">
            <p>Signed by: {signer.name}</p>
            <p>Date: {dateString}</p>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('review')}>
              Back
            </Button>
            <Button
              className="bg-[#3B6FB6] hover:bg-[#3B6FB6]/90"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying signature...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Complete Signing
                </>
              )}
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Step 5: Confirmation ──
  if (step === 'complete') {
    const remainingSigners = signer.all_signers.filter(
      s => s.status !== 'signed' && s.name !== signer.name
    );

    return (
      <PageShell>
        <div className="max-w-md mx-auto py-16 text-center">
          <div className="mb-6">
            <div className="h-16 w-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-2">Agreement Signed Successfully</h2>
          <p className="text-muted-foreground mb-6">
            A signed copy has been sent to {maskedEmail}
          </p>

          <Card className="p-4 text-left mb-6">
            <h3 className="text-sm font-medium mb-3">What happens next:</h3>
            <ol className="text-sm text-muted-foreground space-y-2">
              {remainingSigners.length > 0 ? (
                <>
                  <li className="flex gap-2">
                    <span className="text-[#3B6FB6] font-medium">1.</span>
                    Remaining signers complete their signatures
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#3B6FB6] font-medium">2.</span>
                    You'll receive the fully executed agreement
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#3B6FB6] font-medium">3.</span>
                    Your onboarding portal will be activated
                  </li>
                </>
              ) : (
                <>
                  <li className="flex gap-2">
                    <span className="text-[#3B6FB6] font-medium">1.</span>
                    PS Property Management will counter-sign
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#3B6FB6] font-medium">2.</span>
                    You'll receive the fully executed agreement
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#3B6FB6] font-medium">3.</span>
                    Your dedicated onboarding manager will be in touch
                  </li>
                </>
              )}
            </ol>
          </Card>

          <p className="text-sm text-muted-foreground">
            Questions? Call us at{' '}
            <a href="tel:5122516122" className="text-[#3B6FB6] hover:underline">
              512-251-6122
            </a>
          </p>
        </div>
      </PageShell>
    );
  }

  return null;
}

// ── Page Shell (shared layout) ──
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navy top bar */}
      <div className="h-1.5 bg-[#1B4F72]" />

      {/* Header */}
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-[#1B4F72] flex items-center justify-center">
              <span className="text-white text-xs font-bold">PS</span>
            </div>
            <span className="font-semibold text-sm">PS Property Management</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-muted-foreground space-y-1">
          <p>PS Property Management</p>
          <p className="italic">Serving Central Texas since 1987</p>
          <p>1490 Rusk Rd, Ste. 301, Round Rock, TX 78665 · 512-251-6122</p>
        </div>
      </footer>

      {/* Navy bottom bar */}
      <div className="h-1 bg-[#1B4F72]" />
    </div>
  );
}
