import React from 'react';
import { X, Mail, Phone } from 'lucide-react';

export type LegalModalType = 'privacy' | 'terms' | 'refund' | 'contact' | 'about';

export const FooterLegalModal: React.FC<{
  type: LegalModalType;
  onClose: () => void;
}> = ({ type, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs font-['Manrope',sans-serif]">
    <div className="bg-white border border-[#E1E7E1] p-6 sm:p-7 rounded-2xl shadow-xl max-w-lg w-full space-y-4 max-h-[85vh] overflow-y-auto etp-modal-enter">
      <div className="flex items-center justify-between pb-3 border-b border-[#E1E7E1]">
        <h3 className="text-base font-bold text-[#111111]">
          {type === 'privacy' && 'Privacy Policy'}
          {type === 'terms' && 'Terms & Conditions'}
          {type === 'refund' && 'Refund Policy'}
          {type === 'contact' && 'Contact EasyToPrint'}
          {type === 'about' && 'About EasyToPrint'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="p-1 rounded-lg text-[#646B65] hover:bg-[#F7F8F7] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="text-xs text-[#646B65] space-y-3 leading-relaxed">
        {type === 'privacy' && (
          <>
            <p className="font-semibold text-[#111111]">100% Data Privacy &amp; Automatic Document Destruction</p>
            <p>Customer print files uploaded through the QR ordering system are encrypted in transit via TLS 1.3. Once the physical printer marks the job complete, the temporary file payload is permanently purged.</p>
            <p>Shop owners and customers can rest assured that personal files, documents, and identity photos are never indexed, stored permanently, or shared with third parties.</p>
          </>
        )}

        {type === 'terms' && (
          <>
            <p className="font-semibold text-[#111111]">Service Terms &amp; Fair Usage</p>
            <p>EasyToPrint provides SaaS management tools, cloud queue orchestration, and a Windows desktop print agent for Xerox and commercial print shops.</p>
            <p>Subscribed shops can connect authorized physical printers up to their plan limit. Device authentication tokens are secured with Windows DPAPI safe storage.</p>
          </>
        )}

        {type === 'refund' && (
          <>
            <p className="font-semibold text-[#111111]">Fair Refund Policy</p>
            <p>Shop subscriptions come with a 7-day money-back guarantee for initial onboarding. If your printer setup is incompatible or not fully supported, contact our technical team for an immediate resolution or refund.</p>
            <p>Customer print order payments are processed through Razorpay directly to shop accounts. In case of printer hardware jams, shops can re-print orders directly from the print queue.</p>
          </>
        )}

        {type === 'contact' && (
          <div className="space-y-4 pt-1">
            <p>Have questions or need assistance connecting your printers? Our technical support team is ready to help.</p>
            <div className="p-4 rounded-xl bg-[#F7F8F7] border border-[#E1E7E1] space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs text-[#111111] font-semibold">
                <Mail className="w-4 h-4 text-[#00B32D]" />
                <span>support@easytoprint.in</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#111111] font-semibold">
                <Phone className="w-4 h-4 text-[#00B32D]" />
                <span>+91 98765 43210 (Mon–Sat, 9 AM – 8 PM IST)</span>
              </div>
            </div>
          </div>
        )}

        {type === 'about' && (
          <>
            <p className="font-semibold text-[#111111]">Built for Modern Xerox &amp; Print Centers</p>
            <p>EasyToPrint was designed specifically to eliminate counter chaos in photocopy and print shops. By combining QR-based customer self-ordering, online UPI payments, and an automated Windows Print Agent, shop owners save hours every day and eliminate counter queues.</p>
          </>
        )}
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#00B32D] hover:bg-[#008F25] transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  </div>
);
