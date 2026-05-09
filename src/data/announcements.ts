import type { LucideIcon } from "lucide-react"
import {
  Award,
  ClipboardList,
  Cpu,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react"

export interface Announcement {
  id: string
  titleAr: string
  titleEn: string
  textAr: string
  textEn: string
  icon?: string
  color?: string
  image?: string
  ctaTextAr?: string
  ctaTextEn?: string
  ctaLink?: string
}

export const ANNOUNCEMENT_ICONS: Record<string, LucideIcon> = {
  ShieldCheck,
  ClipboardList,
  UtensilsCrossed,
  Cpu,
  Award,
}

export const mockAnnouncements: Announcement[] = [
  {
    id: "1",
    titleAr: "معايير السلامة الغذائية",
    titleEn: "Food Safety Standards",
    textAr:
      "تأكد من التزام منشأتك بأعلى معايير النظافة والسلامة الغذائية وفق المتطلبات المعتمدة.",
    textEn:
      "Ensure your establishment meets the highest hygiene and food safety requirements in line with approved regulations.",
    icon: "ShieldCheck",
    color: "from-[#8B1538] to-[#4A0E1F]",
    image:
      "https://images.unsplash.com/photo-1556910096-6f5ebaa6b949?auto=format&fit=crop&w=960&q=80",
  },
  {
    id: "2",
    titleAr: "جهوزية التفتيش",
    titleEn: "Inspection Readiness",
    textAr:
      "حمّل سجلاتكم، راجع نقاط التحكم الحرجة، وابقوا مستعدين لأي زيارة ميدانية.",
    textEn:
      "Keep records ready, review critical control points, and stay prepared for on-site inspections.",
    icon: "ClipboardList",
    color: "from-[#6B21A8] to-[#3B0764]",
  },
  {
    id: "3",
    titleAr: "الخدمات الإلكترونية",
    titleEn: "Digital Services",
    textAr:
      "استخدم البوابة الرقمية لمتابعة التراخيص والشكاوى والتقارير في أي وقت.",
    textEn:
      "Use the digital portal to track permits, complaints, and reports whenever you need them.",
    icon: "Cpu",
    color: "from-[#0E7490] to-[#134E4A]",
    ctaTextAr: "زيارة البوابة",
    ctaTextEn: "Visit portal",
    ctaLink: "https://www.moph.gov.qa",
  },
  {
    id: "4",
    titleAr: "برامج التدريب",
    titleEn: "Training Programs",
    textAr:
      "عزّز كفاءة فريقك عبر ورش عمل معتمدة في المناولة الآمنة للأغذية.",
    textEn:
      "Build team capability through accredited workshops on safe food handling.",
    icon: "UtensilsCrossed",
    color: "from-[#B45309] to-[#78350F]",
    image:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=960&q=80",
  },
  {
    id: "5",
    titleAr: "مبادرات الجودة",
    titleEn: "Quality Initiatives",
    textAr:
      "شاركوا في مسارات الجودة للحصول على دعم فني ومزايا تنافسية لمؤسستكم.",
    textEn:
      "Join quality pathways for technical guidance and advantages that strengthen your business.",
    icon: "Award",
    color: "from-[#065F46] to-[#022C22]",
    ctaTextAr: "اعرف المزيد",
    ctaTextEn: "Learn more",
    ctaLink: "#",
  },
]
