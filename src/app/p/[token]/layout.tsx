import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community Onboarding Portal — PS Property Management',
  description: 'Your personalized onboarding portal for PS Property Management',
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Branded header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="h-1 bg-gradient-to-r from-[#00c9e3] via-[#00b0c8] to-[#0090a3]" />
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#00c9e3] flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white font-bold text-sm">PS</span>
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">PS Property Management</h1>
            <p className="text-xs text-gray-500">Community Onboarding Portal</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Professional footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Contact Us</h3>
              <p className="text-gray-500">(512) 251-6122</p>
              <p className="text-gray-500">info@psprop.net</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Office Hours</h3>
              <p className="text-gray-500">Monday – Friday</p>
              <p className="text-gray-500">8:00 AM – 5:00 PM CT</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Learn More</h3>
              <a href="https://psprop.net" target="_blank" rel="noopener noreferrer" className="text-[#00c9e3] hover:underline block">
                psprop.net
              </a>
              <a href="https://psprop.net/about" target="_blank" rel="noopener noreferrer" className="text-[#00c9e3] hover:underline block">
                About PSPM
              </a>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t text-center text-xs text-gray-400">
            PS Property Management · Serving Central Texas communities since 1987
          </div>
        </div>
      </footer>
    </div>
  );
}
