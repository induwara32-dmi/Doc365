import './globals.css';
import Navbar from '../components/Navbar';

export const metadata = {
  title: 'Doc365 | National Trusted Health Network',
  description: 'Sri Lanka Digital Health Records: Health Card, Three-Keys Access, E-Prescriptions, and Patient Self-Sovereignty',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>Doc365 &copy; 2026. Sri Lanka Ministry of Health Learning Prototype.</div>
            <div className="font-mono text-[11px] text-slate-400">
              HL7 FHIR R4 &bull; Ed25519 Verified &bull; Three-Keys Access Compliant
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
