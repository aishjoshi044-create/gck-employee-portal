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

  // tasks page
  manage_tasks_subtitle: { en: "Manage and track all field tasks", hi: "सभी फील्ड काम देखें और संभालें" },
  search_tasks_placeholder: { en: "Search tasks, employees, villages…", hi: "काम, कर्मचारी, गाँव खोजें…" },
  all_employees: { en: "All Employees", hi: "सभी कर्मचारी" },
  all_projects: { en: "All Projects", hi: "सभी परियोजनाएँ" },
  all_status: { en: "All Status", hi: "सभी स्थिति" },
  all_priority: { en: "All Priority", hi: "सभी प्राथमिकता" },
  any_date: { en: "Any Date", hi: "कोई भी तारीख" },
  due_today: { en: "Due Today", hi: "आज की समय-सीमा" },
  overdue: { en: "Overdue", hi: "समय-सीमा बीती" },
  next_7_days: { en: "Next 7 days", hi: "अगले 7 दिन" },
  this_month: { en: "This Month", hi: "इस महीने" },
  kanban: { en: "Kanban", hi: "कानबन" },
  table_view: { en: "Table", hi: "तालिका" },
  clear: { en: "Clear", hi: "साफ़" },
  total: { en: "Total", hi: "कुल" },
  in_progress: { en: "In Progress", hi: "चल रहा" },
  completed: { en: "Completed", hi: "पूरा" },
  failed: { en: "Failed", hi: "असफल" },
  not_started: { en: "Not Started", hi: "शुरू नहीं" },
  project: { en: "Project", hi: "परियोजना" },
  village: { en: "Village", hi: "गाँव" },
  due: { en: "Due", hi: "समय-सीमा" },
  due_date: { en: "Due Date", hi: "अंतिम तारीख" },
  no_tasks_match: { en: "No tasks match your filters", hi: "किसी काम से मेल नहीं" },
  no_updates_yet: { en: "No updates yet", hi: "अभी कोई अपडेट नहीं" },
  comments: { en: "Comments", hi: "टिप्पणियाँ" },
  reply: { en: "Reply", hi: "जवाब" },
  reply_placeholder: { en: "Reply…", hi: "जवाब लिखें…" },
  reply_sent: { en: "Reply sent", hi: "जवाब भेज दिया" },
  single_employee: { en: "Single employee", hi: "एक कर्मचारी" },
  whole_project: { en: "Whole project / department", hi: "पूरी परियोजना / विभाग" },
  all_employees_opt: { en: "All employees", hi: "सभी कर्मचारी" },
  create_task: { en: "Create Task", hi: "काम बनाएं" },
  task_created: { en: "Task created", hi: "काम बन गया" },
  village_location: { en: "Village / Location", hi: "गाँव / स्थान" },
  village_address_ph: { en: "Village / address", hi: "गाँव / पता" },
  pick_project: { en: "Pick a project", hi: "परियोजना चुनें" },
  pick_employee: { en: "Pick an employee", hi: "कर्मचारी चुनें" },
  no_employees_in_project: { en: "No employees in this project", hi: "इस परियोजना में कोई कर्मचारी नहीं" },
  no_active_employees: { en: "No active employees", hi: "कोई सक्रिय कर्मचारी नहीं" },
  tasks_report: { en: "Tasks Report", hi: "काम रिपोर्ट" },
  unassigned: { en: "Unassigned", hi: "अनिर्दिष्ट" },
  dept_prefix: { en: "Dept", hi: "विभाग" },
  approve: { en: "Approve", hi: "मंज़ूर" },
  reject: { en: "Reject", hi: "अस्वीकार" },
  send: { en: "Send", hi: "भेजें" },
  message: { en: "Message", hi: "संदेश" },
  performance: { en: "Performance", hi: "प्रदर्शन" },
  birthday: { en: "Birthday", hi: "जन्मदिन" },
  anniversary: { en: "Work Anniversary", hi: "कार्य वर्षगांठ" },

  // daily reports
  daily_reports: { en: "Daily Reports", hi: "दैनिक रिपोर्ट" },
  daily_report: { en: "Daily Report", hi: "दैनिक रिपोर्ट" },
  submit_report: { en: "Submit Report", hi: "रिपोर्ट भेजें" },
  new_report: { en: "New Report", hi: "नई रिपोर्ट" },
  my_reports: { en: "My Reports", hi: "मेरी रिपोर्ट" },
  reports_submitted: { en: "Reports Submitted", hi: "भेजी रिपोर्ट" },
  approved_reports: { en: "Approved", hi: "मंज़ूर" },
  pending_reports: { en: "Pending", hi: "लंबित" },
  rejected_reports: { en: "Rejected", hi: "अस्वीकार" },
  todays_reports: { en: "Today's Reports", hi: "आज की रिपोर्ट" },
  pending_review: { en: "Pending Review", hi: "समीक्षा बाकी" },
  missing_reports: { en: "Missing Reports", hi: "गायब रिपोर्ट" },
  this_week: { en: "This Week", hi: "इस सप्ताह" },
  last_month: { en: "Last Month", hi: "पिछला महीना" },
  custom_range: { en: "Custom Range", hi: "कस्टम अवधि" },
  from_date: { en: "From", hi: "से" },
  to_date: { en: "To", hi: "तक" },
  activity_type: { en: "Activity Type", hi: "गतिविधि प्रकार" },
  activity_survey: { en: "Survey", hi: "सर्वेक्षण" },
  activity_meeting: { en: "Meeting", hi: "बैठक" },
  activity_training: { en: "Training", hi: "प्रशिक्षण" },
  activity_field_visit: { en: "Field Visit", hi: "क्षेत्र दौरा" },
  activity_documentation: { en: "Documentation", hi: "दस्तावेज़ीकरण" },
  activity_other: { en: "Other", hi: "अन्य" },
  specify_activity: { en: "Specify activity", hi: "गतिविधि बताएं" },
  work_done_today: { en: "Work Done Today", hi: "आज का काम" },
  beneficiaries_reached: { en: "Beneficiaries Reached", hi: "लाभार्थी संख्या" },
  issues_faced: { en: "Issues Faced", hi: "समस्याएँ" },
  upload_photos: { en: "Upload Photos (max 5)", hi: "तस्वीरें (अधिकतम 5)" },
  gps_location: { en: "GPS Location", hi: "जीपीएस स्थान" },
  capturing_location: { en: "Capturing location…", hi: "स्थान ले रहे हैं…" },
  report_submitted: { en: "Report submitted", hi: "रिपोर्ट भेज दी" },
  no_reports_yet: { en: "No reports yet", hi: "अभी कोई रिपोर्ट नहीं" },
  report_details: { en: "Report Details", hi: "रिपोर्ट विवरण" },
  villages_visited: { en: "Villages Visited", hi: "गाँव दौरे" },
  report_approved: { en: "Report approved", hi: "रिपोर्ट मंज़ूर" },
  report_rejected: { en: "Report rejected", hi: "रिपोर्ट अस्वीकार" },
  admin_note: { en: "Admin Note", hi: "प्रशासक टिप्पणी" },
  performance_summary: { en: "Performance Summary", hi: "प्रदर्शन सार" },
  photo_limit: { en: "Maximum 5 photos", hi: "अधिकतम 5 तस्वीरें" },

  // status
  present: { en: "Present", hi: "हाज़िर" },
  absent: { en: "Absent", hi: "अनुपस्थित" },
  late: { en: "Late", hi: "देर से" },
  on_leave: { en: "On Leave", hi: "छुट्टी पर" },
  active: { en: "Active", hi: "सक्रिय" },
  inactive: { en: "Inactive", hi: "बंद" },
  work_updates: { en: "Work Updates", hi: "कार्य अपडेट" },
  add_work_update: { en: "Add Work Update", hi: "कार्य अपडेट जोड़ें" },
  update_type: { en: "Update Type", hi: "अपडेट प्रकार" },
  update_type_progress: { en: "Progress Update", hi: "प्रगति अपडेट" },
  update_type_issue: { en: "Issue Report", hi: "समस्या रिपोर्ट" },
  update_type_completion: { en: "Completion Update", hi: "पूर्णता अपडेट" },
  max_photos_5: { en: "Max 5 photos", hi: "अधिकतम 5 फ़ोटो" },


  discussion: { en: "Discussion", hi: "चर्चा" },
  write_message: { en: "Write a message...", hi: "संदेश लिखें..." },
  no_discussion_yet: { en: "No messages yet", hi: "अभी कोई संदेश नहीं" },
  updates_count: { en: "Updates", hi: "अपडेट" },
  post: { en: "Post", hi: "भेजें" },
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
