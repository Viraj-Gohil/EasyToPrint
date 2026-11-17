import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Headphones,
  Phone,
  MessageCircle,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  Send
} from 'lucide-react';
import { useApp } from '../../lib/store';

interface HelpArticle {
  title: string;
  category: string;
  readTime: string;
  snippet: string;
}

const HELP_ARTICLES: HelpArticle[] = [
  {
    title: 'Connecting Windows EasyToPrint Agent to your physical printer',
    category: 'Agent Setup',
    readTime: '3 min read',
    snippet: 'Download and launch the EasyToPrint Windows Agent (.exe). It automatically discovers your local USB and network printers via Windows Print Spooler.'
  },
  {
    title: 'Configuring Counter QR Signage & Customer Rates',
    category: 'Shop Management',
    readTime: '2 min read',
    snippet: 'Generate your shop QR stand from the Shop Console. Configure per-page rates for A4 B&W, Color, Duplex, and Legal paper sizes.'
  },
  {
    title: 'Direct UPI & Razorpay Settlement Setup',
    category: 'Payments',
    readTime: '4 min read',
    snippet: 'Connect your UPI VPA or Razorpay merchant account to receive instant customer payments directly with zero counter balance reconciliation.'
  },
  {
    title: 'Multi-Printer Automatic Job Routing',
    category: 'Queue Management',
    readTime: '3 min read',
    snippet: 'Set up rules to automatically route high-volume jobs to your high-speed laser printer and photo jobs to your color ink-tank device.'
  },
  {
    title: 'Printer Offline or Spooler Stall Recovery',
    category: 'Diagnostics',
    readTime: '2 min read',
    snippet: 'If Windows Spooler stops responding, EasyToPrint features an automatic 1-click driver restart and queue unjam recovery tool.'
  }
];

function getDetailedGuideText(category: string): string[] {
  switch (category) {
    case 'Agent Setup':
      return [
        'Step 1: Download the EasyToPrint Windows Agent (.exe) installer from your Shop Console or setup email.',
        'Step 2: Double-click the installer and complete the quick wizard on your counter Windows PC.',
        'Step 3: Enter your Shop Slug and API credentials securely (stored in Windows DPAPI vault).',
        'Step 4: The Agent automatically connects to the cloud queue and discovers all USB and network printers installed in Windows Print Spooler.',
        'Step 5: Status indicator turns green ("Win32 Spooler Active") and you are ready to receive customer print orders automatically.'
      ];
    case 'Shop Management':
      return [
        'Step 1: Access your Shop Console dashboard to manage live orders, printer statuses, and daily revenue.',
        'Step 2: Configure your shop per-page pricing for A4 Black & White, Color, Duplex, and Legal paper sizes.',
        'Step 3: Generate and download your high-resolution Tabletop QR Standee for counter customers.',
        'Step 4: Manage staff operator pins and monitor print job auto-routing.'
      ];
    default:
      return [
        'Follow the on-screen instructions in your EasyToPrint Shop Console.',
        'Ensure your device is connected to active internet and printer drivers are installed correctly.',
        'For further assistance, check our documentation or contact technical support.'
      ];
  }
}

export const HelpCenterModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [helpSearchQuery, setHelpSearchQuery] = useState('');
  const [helpCategoryFilter, setHelpCategoryFilter] = useState<string>('All');
  const [selectedGuideArticle, setSelectedGuideArticle] = useState<HelpArticle | null>(null);

  const filteredArticles = HELP_ARTICLES.filter((item) => {
    const q = helpSearchQuery.toLowerCase();
    const matchesQuery =
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.snippet.toLowerCase().includes(q);
    const matchesCat = helpCategoryFilter === 'All' || item.category === helpCategoryFilter;
    return matchesQuery && matchesCat;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs font-['Manrope',sans-serif]">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-[#E1E7E1] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col etp-modal-enter">
        <div className="p-6 border-b border-[#E1E7E1] bg-[#F7F8F7] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center">
              <BookOpen className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#111111]">EasyToPrint Help Center</h2>
              <p className="text-xs text-[#646B65]">Guides, setup manuals &amp; printing troubleshooting</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Help Center"
            className="p-2 rounded-xl text-[#646B65] hover:text-[#111111] hover:bg-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 border-b border-[#E1E7E1] bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-[#646B65] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={helpSearchQuery}
              onChange={(e) => {
                setHelpSearchQuery(e.target.value);
                if (selectedGuideArticle) setSelectedGuideArticle(null);
              }}
              placeholder="Search setup guides, Windows agent errors, UPI payments..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl text-sm text-[#111111] placeholder:text-[#646B65] focus:outline-hidden focus:border-[#00B32D] focus:bg-white transition-all"
            />
            {helpSearchQuery && (
              <button
                type="button"
                onClick={() => setHelpSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#646B65] hover:text-[#111111]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[#E1E7E1] bg-[#F7F8F7] flex items-center gap-2 overflow-x-auto">
          {['All', 'Agent Setup', 'Shop Management', 'Payments', 'Diagnostics'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setHelpCategoryFilter(cat);
                setSelectedGuideArticle(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                helpCategoryFilter === cat
                  ? 'bg-[#00B32D] text-white shadow-2xs'
                  : 'bg-white text-[#646B65] border border-[#E1E7E1] hover:text-[#111111]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {selectedGuideArticle ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedGuideArticle(null)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#008F25] hover:underline cursor-pointer"
              >
                <span>← Back to Articles</span>
              </button>

              <div className="p-4 rounded-xl bg-[#E8F8EC]/40 border border-[#A7F3D0] space-y-2">
                <span className="text-[11px] font-bold text-[#008F25] bg-white px-2 py-0.5 rounded border border-[#A7F3D0]">
                  {selectedGuideArticle.category} Guide
                </span>
                <h3 className="text-base font-bold text-[#111111]">{selectedGuideArticle.title}</h3>
                <p className="text-xs text-[#646B65]">{selectedGuideArticle.snippet}</p>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-[#111111] uppercase tracking-wider">
                  Step-by-Step Instructions &amp; Guide Text
                </h4>
                <div className="space-y-2.5">
                  {getDetailedGuideText(selectedGuideArticle.category).map((stepText, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-3.5 rounded-xl bg-[#F7F8F7] border border-[#E1E7E1] flex items-start gap-3"
                    >
                      <span className="w-6 h-6 rounded-lg bg-[#00B32D] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {sIdx + 1}
                      </span>
                      <span className="text-xs text-[#111111] leading-relaxed font-medium">
                        {stepText.replace(/^Step \d+: /, '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : filteredArticles.length > 0 ? (
            filteredArticles.map((article, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-[#E1E7E1] hover:border-[#A7F3D0] hover:bg-[#F7F8F7]/50 transition-all cursor-pointer group"
                onClick={() => setSelectedGuideArticle(article)}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-bold text-[#008F25] bg-[#E8F8EC] px-2 py-0.5 rounded">
                    {article.category}
                  </span>
                  <span className="text-[11px] text-[#646B65] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {article.readTime}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#008F25] transition-colors">
                  {article.title}
                </h3>
                <p className="text-xs text-[#646B65] mt-1.5 leading-relaxed">{article.snippet}</p>
              </div>
            ))
          ) : (
            <div className="text-center py-12 space-y-2">
              <p className="text-sm font-bold text-[#111111]">No matching articles found</p>
              <p className="text-xs text-[#646B65]">Try searching for "agent", "printer", "UPI" or "rates".</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ContactSupportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { showToast, createSupportTicket } = useApp();
  const [supportName, setSupportName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportShopName, setSupportShopName] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportName || !supportEmail || !supportMessage) {
      showToast('Missing Details', 'Please fill in your name, email and message.', 'error');
      return;
    }
    setSupportSubmitted(true);
    if (createSupportTicket) {
      createSupportTicket({
        subject: `Inquiry from ${supportName}${supportShopName ? ` (${supportShopName})` : ''}`,
        description: supportMessage,
        category: 'HARDWARE',
        priority: 'MEDIUM',
        tags: ['public_header_contact', supportEmail]
      });
    }
    showToast('Support Ticket Submitted', 'Our engineering team will respond within 2 hours.', 'success');
    setTimeout(() => {
      setSupportSubmitted(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs font-['Manrope',sans-serif]">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-[#E1E7E1] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col etp-modal-enter">
        <div className="p-6 border-b border-[#E1E7E1] bg-[#F7F8F7] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8F8EC] text-[#00B32D] flex items-center justify-center">
              <Headphones className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#111111]">EasyToPrint Support</h2>
              <p className="text-xs text-[#646B65]">We are here to help your print shop run smoothly</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Contact Support"
            className="p-2 rounded-xl text-[#646B65] hover:text-[#111111] hover:bg-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://wa.me/919876543210?text=Hello%20EasyToPrint%20Support,%20I%20need%20help%20with%20my%20print%20shop"
              target="_blank"
              rel="noreferrer"
              className="p-3.5 rounded-2xl border border-[#A7F3D0] bg-[#E8F8EC]/50 hover:bg-[#E8F8EC] transition-all flex items-center gap-3 group"
            >
              <div className="w-9 h-9 rounded-xl bg-[#00B32D] text-white flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#111111] group-hover:text-[#008F25] transition-colors flex items-center gap-1">
                  <span>WhatsApp Chat</span>
                  <ExternalLink className="w-3 h-3 text-[#00B32D]" />
                </div>
                <p className="text-[11px] text-[#646B65]">Instant reply under 2 mins</p>
              </div>
            </a>

            <a
              href="tel:+919876543210"
              className="p-3.5 rounded-2xl border border-[#E1E7E1] bg-[#F7F8F7] hover:bg-white transition-all flex items-center gap-3 group"
            >
              <div className="w-9 h-9 rounded-xl bg-white border border-[#E1E7E1] text-[#111111] flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-[#00B32D]" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#111111] group-hover:text-[#008F25] transition-colors">
                  Toll-Free Phone
                </div>
                <p className="text-[11px] text-[#646B65]">Mon–Sat · 9 AM to 9 PM</p>
              </div>
            </a>
          </div>

          <form onSubmit={handleSupportSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#111111]">Your Full Name *</label>
              <input
                type="text"
                required
                value={supportName}
                onChange={(e) => setSupportName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                className="w-full px-3.5 py-2.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl text-sm text-[#111111] placeholder:text-[#646B65] focus:outline-hidden focus:border-[#00B32D] focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#111111]">Email Address *</label>
                <input
                  type="email"
                  required
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="rajesh@printshop.com"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl text-sm text-[#111111] placeholder:text-[#646B65] focus:outline-hidden focus:border-[#00B32D] focus:bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#111111]">Shop Name (Optional)</label>
                <input
                  type="text"
                  value={supportShopName}
                  onChange={(e) => setSupportShopName(e.target.value)}
                  placeholder="e.g. Sai Xerox &amp; Cyber Hub"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl text-sm text-[#111111] placeholder:text-[#646B65] focus:outline-hidden focus:border-[#00B32D] focus:bg-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#111111]">How can we help? *</label>
              <textarea
                required
                rows={3}
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Describe your question or printer setup issue..."
                className="w-full px-3.5 py-2.5 bg-[#F7F8F7] border border-[#E1E7E1] rounded-xl text-sm text-[#111111] placeholder:text-[#646B65] focus:outline-hidden focus:border-[#00B32D] focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={supportSubmitted}
              className="w-full py-3 px-4 bg-[#00B32D] hover:bg-[#008F25] text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {supportSubmitted ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Ticket Submitted!</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Support Ticket</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="p-4 border-t border-[#E1E7E1] bg-[#F7F8F7] text-center text-xs text-[#646B65]">
          Direct technical escalation: <span className="font-semibold text-[#111111]">support@easytoprint.in</span>
        </div>
      </div>
    </div>
  );
};
