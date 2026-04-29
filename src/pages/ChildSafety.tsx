import { motion } from 'framer-motion';
import { ShieldAlert, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';

const CONTACT_EMAIL = 'vybesocial.info@gmail.com';
const EFFECTIVE_DATE = 'April 29, 2026';
const POLICY_VERSION = '1.0';

const sections = [
  {
    num: '01',
    title: 'Our Commitment to Child Safety',
    content: 'VYBE has zero tolerance for child sexual abuse and exploitation (CSAE) or child sexual abuse material (CSAM). We are committed to providing a safe environment for all users, with special protections for minors. We comply with all applicable child safety laws including the Children\'s Online Privacy Protection Act (COPPA), the United States PROTECT Act, the EU Digital Services Act, and Google Play\'s Child Safety Standards policy.\n\nVYBE is intended for users aged 13 and older. Users under 13 are not permitted on the Platform.',
  },
  {
    num: '02',
    title: 'Published Standards Against CSAE & CSAM',
    content: 'The following content and conduct are strictly prohibited on VYBE and will result in immediate account termination and reporting to law enforcement and the National Center for Missing & Exploited Children (NCMEC):\n\n• Any content depicting, encouraging, promoting, or normalizing child sexual abuse or exploitation\n• Sexual or suggestive content involving minors of any kind, including AI-generated, animated, or fictional depictions\n• Grooming, sextortion, or attempts to engage minors in sexual conversations or activity\n• Sharing, soliciting, or trading CSAM\n• Sexualized commentary on minors, including in comments, DMs, captions, or usernames\n• Promoting or facilitating in-person meetings between adults and minors for sexual purposes\n• Trafficking, smuggling, or exploitation of children\n• Content that endangers the physical or emotional well-being of a child',
  },
  {
    num: '03',
    title: 'How We Detect & Prevent CSAE / CSAM',
    content: '• AI-Powered Safety Scanning: All uploaded media (photos, videos, snaps) is scanned in real-time using AI safety systems before being published, including Google Cloud Vision SafeSearch and proprietary classifiers tuned to detect CSAM signals\n• Hash Matching: We participate in industry hash-matching programs where applicable to detect known CSAM\n• Age Gating: Users must verify they are 13 or older at sign-up. Stricter content filters and AI safety apply to all users under 18\n• Parental Controls: Built-in parental controls including 4-digit PIN, screen time limits, and content restrictions for users 12 and under\n• Age-Restricted DMs: Direct messages between adults and minors are filtered and limited; explicit content (including stickers, GIFs, and audio) is hidden from users under 13\n• Human Moderation: Trained moderators review flagged content and reports 24/7\n• Behavioral Detection: Our systems flag suspicious patterns such as adults systematically contacting minors',
  },
  {
    num: '04',
    title: 'In-App Mechanism for User Feedback & Reporting',
    content: 'Every user can report CSAE, CSAM, or any unsafe behavior directly inside the app:\n\n• Report Posts & Comments: Tap the ⋯ menu on any post or comment → "Report"\n• Report Messages: Long-press any message → "Report"\n• Report Profiles: Open a profile → ⋯ → "Report User" or "Block"\n• Report Communities & Spaces: Use the ⋯ menu inside any community\n• Feedback Hub: Settings → Help & Support → Feedback Hub for safety concerns and policy feedback\n• Email: Reports may also be sent directly to ' + CONTACT_EMAIL + '\n\nAll CSAE / CSAM reports are routed to a priority queue and reviewed within 24 hours. Confirmed CSAM is preserved as required by law and reported to NCMEC and applicable authorities. Reporting users remain anonymous to the reported user.',
  },
  {
    num: '05',
    title: 'Compliance with Child Safety Laws',
    content: 'VYBE complies with applicable child safety laws across the jurisdictions in which we operate, including but not limited to:\n\n• United States: 18 U.S.C. § 2258A (mandatory CSAM reporting to NCMEC), the PROTECT Act, and COPPA\n• European Union: GDPR child data protections, the Digital Services Act, and the Audiovisual Media Services Directive\n• United Kingdom: The Online Safety Act 2023\n• Canada: Mandatory reporting under An Act respecting the mandatory reporting of Internet child pornography\n• Australia: The Online Safety Act 2021 and the eSafety Commissioner\'s industry codes\n\nWe cooperate fully with law enforcement and child safety organizations on lawful requests related to child safety investigations.',
  },
  {
    num: '06',
    title: 'Enforcement Actions',
    content: 'Violations of our child safety standards result in:\n\n• Immediate, permanent account termination without warning\n• Removal and preservation of offending content\n• Mandatory reporting to NCMEC and / or other applicable authorities\n• Device, IP, and identity blocking to prevent re-registration\n• Cooperation with criminal investigations and legal process\n\nAttempting to circumvent our safety systems (e.g. using alt accounts, obfuscated content, or coded language) is itself a violation and is treated with the same severity.',
  },
  {
    num: '07',
    title: 'Child Safety Point of Contact',
    content: 'VYBE has designated a Child Safety Point of Contact who is responsible for receiving and responding to inquiries from law enforcement, child safety organizations, and the public regarding child safety on the Platform.\n\nChild Safety Contact: VYBE Trust & Safety Team\nEmail: ' + CONTACT_EMAIL + '\nSubject line: "CHILD SAFETY" for priority routing\n\nUrgent reports involving an immediate threat to a child should also be reported to local law emergency services and to the NCMEC CyberTipline at https://report.cybertip.org or 1-800-843-5678.',
  },
  {
    num: '08',
    title: 'Resources for Users & Parents',
    content: '• NCMEC CyberTipline: https://report.cybertip.org\n• Internet Watch Foundation (IWF): https://www.iwf.org.uk\n• Tech Coalition Best Practices: https://www.technologycoalition.org\n• Stop It Now (support for concerned adults): https://www.stopitnow.org\n• Take It Down (NCMEC tool for removal of nude images of minors): https://takeitdown.ncmec.org\n• In the EU: INHOPE network of hotlines at https://www.inhope.org',
  },
];

export default function ChildSafetyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background relative z-10" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-rose-500/20 to-primary/20 blur-sm" />
              <div className="relative w-12 h-12 rounded-xl bg-card/80 backdrop-blur-sm border border-border/30 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-rose-500" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Child Safety Standards</h1>
              <p className="text-xs text-muted-foreground">Effective: {EFFECTIVE_DATE} · Version {POLICY_VERSION}</p>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-rose-500/30 via-rose-500/10 to-transparent mb-8" />

          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 mb-8">
            <p className="text-sm text-foreground/90 leading-relaxed">
              <strong>Zero tolerance.</strong> VYBE prohibits all child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM). Violations result in immediate account termination and reporting to NCMEC and law enforcement.
            </p>
          </div>

          <div className="space-y-6">
            {sections.map((s, i) => (
              <motion.section
                key={s.num}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group"
              >
                <div className="flex items-start gap-3 mb-2">
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500/15 to-rose-500/5 flex items-center justify-center text-xs font-bold text-rose-500">
                    {s.num}
                  </span>
                  <h2 className="text-base font-semibold text-foreground pt-1">{s.title}</h2>
                </div>
                <div className="ml-11">
                  {s.content.split('\n\n').map((p, j) => (
                    <p key={j} className="text-sm text-muted-foreground mb-2 leading-relaxed whitespace-pre-line">{p}</p>
                  ))}
                </div>
              </motion.section>
            ))}

            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
              <div className="flex items-start gap-3 mb-2">
                <span className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500/15 to-rose-500/5 flex items-center justify-center text-xs font-bold text-rose-500">09</span>
                <h2 className="text-base font-semibold text-foreground pt-1">Contact Our Child Safety Team</h2>
              </div>
              <div className="ml-11">
                <p className="text-sm text-muted-foreground mb-3">For child safety reports, law enforcement requests, or policy questions:</p>
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=CHILD%20SAFETY`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/30 text-primary text-sm font-medium hover:bg-card transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  {CONTACT_EMAIL}
                </a>
              </div>
            </motion.section>
          </div>

          <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
            <p>See also: <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link> · <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link> · <Link to="/guidelines" className="text-primary hover:underline">Community Guidelines</Link></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
