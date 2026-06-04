import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "hi";

type Dict = Record<string, { en: string; hi: string }>;

export const dict = {
  // generic
  app_name: { en: "Gram Chetna Kendra", hi: "ग्राम चेतना केंद्र" },
  staff_portal: { en: "Staff Portal", hi: "स्टाफ पोर्टल" },
  english: { en: "English", hi: "अंग्रेज़ी" },
  hindi: { en: "Hindi", hi: "हिंदी" },
  language: { en: "Language", hi: "भाषा" },
  save: { en: "Save", hi: "सहेजें" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  submit: { en: "Submit", hi: "भेजें" },
  loading: { en: "Loading...", hi: "लोड हो रहा है..." },
  yes: { en: "Yes", hi: "हाँ" },
  no: { en: "No", hi: "नहीं" },
  search: { en: "Search", hi: "खोजें" },
  back: { en: "Back", hi: "वापस" },
  done: { en: "Done", hi: "पूरा" },
  error: { en: "Something went wrong", hi: "कुछ गड़बड़ हुई" },
  retry: { en: "Try again", hi: "फिर कोशिश करें" },
  logout: { en: "Logout", hi: "बाहर निकलें" },
  dark_mode: { en: "Dark mode", hi: "डार्क मोड" },

  // auth
  login: { en: "Login", hi: "लॉगिन" },
  username: { en: "Username", hi: "उपयोगकर्ता नाम" },
  pin: { en: "4-digit PIN", hi: "4-अंकों का PIN" },
  enter_username: { en: "Enter your username", hi: "अपना उपयोगकर्ता नाम लिखें" },
  enter_pin: { en: "Enter your 4-digit PIN", hi: "अपना 4-अंकों का PIN लिखें" },
  invalid_credentials: { en: "Wrong username or PIN", hi: "गलत उपयोगकर्ता नाम या PIN" },
  set_new_pin: { en: "Set a new 4-digit PIN", hi: "नया 4-अंकों का PIN बनाएं" },
  confirm_pin: { en: "Confirm PIN", hi: "PIN दोबारा लिखें" },
  pin_mismatch: { en: "PINs do not match", hi: "PIN मेल नहीं खाता" },
  pin_changed: { en: "PIN saved", hi: "PIN सहेज लिया" },
  welcome: { en: "Welcome", hi: "स्वागत है" },

  // employee
  home: { en: "Home", hi: "होम" },
  mark_present: { en: "Mark Present", hi: "हाज़िरी लगाएं" },
  marked_present: { en: "Marked Present", hi: "हाज़िरी हो गई" },
  my_tasks: { en: "My Tasks", hi: "मेरे काम" },
  my_attendance: { en: "My Attendance", hi: "मेरी हाज़िरी" },
  my_profile: { en: "My Profile", hi: "मेरी प्रोफाइल" },
  leave_request: { en: "Leave Request", hi: "छुट्टी की अर्ज़ी" },
  upload_update: { en: "Upload Update", hi: "अपडेट भेजें" },
  no_tasks: { en: "No tasks for now", hi: "अभी कोई काम नहीं है" },
  today: { en: "Today", hi: "आज" },
  take_selfie: { en: "Take Selfie", hi: "सेल्फ़ी लें" },
  capture: { en: "Capture", hi: "क्लिक करें" },
  retake: { en: "Retake", hi: "दोबारा लें" },
  already_marked: { en: "You already marked attendance today", hi: "आज की हाज़िरी पहले ही लग चुकी है" },
  getting_location: { en: "Getting your location...", hi: "आपका स्थान ले रहे हैं..." },
  attendance_saved: { en: "Attendance saved! Have a good day.", hi: "हाज़िरी लग गई! दिन शुभ हो।" },

  // tasks
  task_status_not_started: { en: "Not Started", hi: "शुरू नहीं" },
  task_status_in_progress: { en: "In Progress", hi: "चल रहा" },
  task_status_completed: { en: "Completed", hi: "पूरा" },
  task_status_failed: { en: "Failed", hi: "असफल" },
  priority_low: { en: "Low", hi: "कम" },
  priority_medium: { en: "Medium", hi: "मध्यम" },
  priority_high: { en: "High", hi: "ज़रूरी" },
  deadline: { en: "Deadline", hi: "अंतिम तारीख" },
  title: { en: "Title", hi: "शीर्षक" },
  description: { en: "Description", hi: "विवरण" },
  priority: { en: "Priority", hi: "प्राथमिकता" },
  assign_to: { en: "Assign to", hi: "किसको दें" },
  location: { en: "Location", hi: "स्थान" },
  start_task: { en: "Start", hi: "शुरू करें" },
  mark_done: { en: "Mark Done", hi: "पूरा करें" },

  // updates
  voice_note: { en: "Voice Note", hi: "आवाज़ संदेश" },
  photos: { en: "Photos", hi: "तस्वीरें" },
  note_text: { en: "Note", hi: "टिप्पणी" },
  record: { en: "Record", hi: "रिकॉर्ड" },
  stop: { en: "Stop", hi: "रोकें" },
  play: { en: "Play", hi: "चलाएं" },
  add_photos: { en: "Add Photos", hi: "तस्वीरें जोड़ें" },
  send_update: { en: "Send Update", hi: "अपडेट भेजें" },
  update_sent: { en: "Update sent to admin", hi: "अपडेट प्रशासक को भेज दिया" },

  // leave
  start_date: { en: "Start Date", hi: "शुरू तारीख" },
  end_date: { en: "End Date", hi: "अंतिम तारीख" },
  reason: { en: "Reason", hi: "कारण" },
  leave_sick: { en: "Sick", hi: "बीमारी" },
  leave_personal: { en: "Personal", hi: "निजी काम" },
  leave_family: { en: "Family", hi: "परिवार" },
  leave_other: { en: "Other", hi: "अन्य" },
  leave_submitted: { en: "Leave request sent", hi: "छुट्टी की अर्ज़ी भेज दी" },
  pending: { en: "Pending", hi: "लंबित" },
  approved: { en: "Approved", hi: "मंज़ूर" },
  rejected: { en: "Rejected", hi: "अस्वीकार" },

  // profile
  change_pin: { en: "Change PIN", hi: "PIN बदलें" },
  current_pin: { en: "Current PIN", hi: "वर्तमान PIN" },
  new_pin: { en: "New PIN", hi: "नया PIN" },
  phone: { en: "Phone", hi: "फ़ोन" },
  department: { en: "Department", hi: "विभाग" },
  address: { en: "Address", hi: "पता" },
  full_name: { en: "Full Name", hi: "पूरा नाम" },

  // admin
  admin_dashboard: { en: "Admin Dashboard", hi: "प्रशासक डैशबोर्ड" },
  total_employees: { en: "Total Employees", hi: "कुल कर्मचारी" },
  present_today: { en: "Present Today", hi: "आज हाज़िर" },
  absent_today: { en: "Absent Today", hi: "आज अनुपस्थित" },
  tasks_completed: { en: "Tasks Completed", hi: "पूरे काम" },
  tasks_pending: { en: "Tasks Pending", hi: "बाक़ी काम" },
  tasks_failed: { en: "Tasks Failed", hi: "असफल काम" },
  live_map: { en: "Live Map", hi: "लाइव नक्शा" },
  employees: { en: "Employees", hi: "कर्मचारी" },
  add_employee: { en: "Add Employee", hi: "नया कर्मचारी" },
  create: { en: "Create", hi: "बनाएं" },
  edit: { en: "Edit", hi: "बदलें" },
  deactivate: { en: "Deactivate", hi: "बंद करें" },
  activate: { en: "Activate", hi: "चालू करें" },
  print_card: { en: "Print Card", hi: "कार्ड छापें" },
  attendance: { en: "Attendance", hi: "हाज़िरी" },
  tasks: { en: "Tasks", hi: "काम" },
  updates: { en: "Updates", hi: "अपडेट" },
  reports: { en: "Reports", hi: "रिपोर्ट" },
  notifications: { en: "Notifications", hi: "सूचनाएँ" },
  leaves: { en: "Leaves", hi: "छुट्टियाँ" },
  announcements: { en: "Announcements", hi: "घोषणाएँ" },
  locations: { en: "Live Locations", hi: "लाइव स्थान" },
  download_excel: { en: "Download Excel", hi: "एक्सेल डाउनलोड" },
  new_task: { en: "New Task", hi: "नया काम" },
  new_announcement: { en: "New Announcement", hi: "नई घोषणा" },
  download_pdf: { en: "Download PDF", hi: "PDF डाउनलोड" },
  monthly_report: { en: "Monthly Report", hi: "मासिक रिपोर्ट" },
  approve: { en: "Approve", hi: "मंज़ूर" },
  reject: { en: "Reject", hi: "अस्वीकार" },
  send: { en: "Send", hi: "भेजें" },
  message: { en: "Message", hi: "संदेश" },
  performance: { en: "Performance", hi: "प्रदर्शन" },
  birthday: { en: "Birthday", hi: "जन्मदिन" },
  anniversary: { en: "Work Anniversary", hi: "कार्य वर्षगांठ" },

  // status
  present: { en: "Present", hi: "हाज़िर" },
  absent: { en: "Absent", hi: "अनुपस्थित" },
  late: { en: "Late", hi: "देर से" },
  on_leave: { en: "On Leave", hi: "छुट्टी पर" },
  active: { en: "Active", hi: "सक्रिय" },
  inactive: { en: "Inactive", hi: "बंद" },
} satisfies Dict;

export type DictKey = keyof typeof dict;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
  toggle: () => void;
}

const I18nContext = createContext<I18nCtx | null>(null);

const STORAGE_KEY = "gck.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("hi");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved === "en" || saved === "hi") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  };

  const t = (k: DictKey) => dict[k][lang];
  const toggle = () => setLang(lang === "en" ? "hi" : "en");

  return <I18nContext.Provider value={{ lang, setLang, t, toggle }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
