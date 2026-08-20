// ==========================================================================
// EDVIA UI strings
// ==========================================================================
// A plain dictionary, deliberately — no i18n library. The requirement is a
// bounded set of interface labels in eleven languages, which is a lookup
// table; react-i18next would add ~40 kB and a plugin surface to solve a
// problem `Record<Key, string>` already solves. Pluralisation and date
// formatting are handled by Intl, which is in the platform.
//
// SCOPE, STATED HONESTLY
// This covers the app's navigation and chrome: nav labels, common actions,
// state messages, the AI surface and settings. It does NOT attempt to
// translate every screen's body copy. Two reasons, and neither is laziness:
//
//   1. School CONTENT — notice bodies, assignment titles, teacher names,
//      class names — is written by the school and stored in Firestore. It is
//      not ours to translate, and machine-translating a principal's notice
//      would be worse than showing it as written.
//   2. EDVIA's actual ANSWERS are generated in the user's language by the
//      model, which is where the multilingual requirement really lands. The
//      chrome exists so the app around those answers doesn't feel foreign.
//
// FALLBACK
// Missing keys fall back to English per-key rather than per-language, so a
// partially translated locale degrades one label at a time instead of
// snapping the whole interface back to English.
//
// Translations are conventional UI terms as used by Indian school apps.
// Anything a native reviewer would phrase differently should be corrected
// here — this file is the single place to do it.
// ==========================================================================
import type { LanguageCode } from "@/types";

/** Every translatable key. Adding one here forces the English entry to exist. */
export interface UIStrings {
  // ---- navigation ----
  "nav.home": string;
  "nav.dashboard": string;
  "nav.classes": string;
  "nav.students": string;
  "nav.progress": string;
  "nav.assistant": string;
  "nav.ai": string;
  "nav.calendar": string;
  "nav.notices": string;
  "nav.analytics": string;
  "nav.reports": string;
  "nav.more": string;
  "nav.grades": string;
  "nav.marks": string;
  "nav.support": string;

  // ---- common actions ----
  "action.retry": string;
  "action.cancel": string;
  "action.confirm": string;
  "action.save": string;
  "action.continue": string;
  "action.back": string;
  "action.send": string;
  "action.close": string;

  // ---- states ----
  "state.loading": string;
  "state.empty": string;
  "state.errorTitle": string;
  "state.offline": string;

  // ---- AI surface ----
  "ai.title": string;
  "ai.askPlaceholder": string;
  "ai.thinking": string;
  "ai.listening": string;
  "ai.speaking": string;
  "ai.verifying": string;
  "ai.checkingRecords": string;
  "ai.ready": string;
  "ai.voiceMode": string;
  "ai.unavailable": string;
  "ai.talkToTeacher": string;

  // ---- school domain ----
  "domain.attendance": string;
  "domain.assignments": string;
  "domain.exams": string;
  "domain.timetable": string;
  "domain.resources": string;
  "domain.present": string;
  "domain.absent": string;
  "domain.leave": string;

  // ---- settings / profile ----
  "settings.title": string;
  "settings.language": string;
  "settings.profile": string;
  "settings.help": string;
  "settings.signOut": string;
}

export type StringKey = keyof UIStrings;

const en: UIStrings = {
  "nav.grades": "Grades", "nav.marks": "Marks", "nav.support": "Support",
  "nav.home": "Home",
  "nav.dashboard": "Dashboard",
  "nav.classes": "Classes",
  "nav.students": "Students",
  "nav.progress": "Progress",
  "nav.assistant": "AI Assistant",
  "nav.ai": "AI",
  "nav.calendar": "Calendar",
  "nav.notices": "Notices",
  "nav.analytics": "Analytics",
  "nav.reports": "Reports",
  "nav.more": "More",

  "action.retry": "Try again",
  "action.cancel": "Cancel",
  "action.confirm": "Confirm",
  "action.save": "Save",
  "action.continue": "Continue",
  "action.back": "Back",
  "action.send": "Send",
  "action.close": "Close",

  "state.loading": "Loading…",
  "state.empty": "Nothing here yet",
  "state.errorTitle": "Something didn't load",
  "state.offline": "You appear to be offline",

  "ai.title": "EDVIA",
  "ai.askPlaceholder": "Ask EDVIA anything…",
  "ai.thinking": "Thinking…",
  "ai.listening": "Listening…",
  "ai.speaking": "Speaking…",
  "ai.verifying": "Verifying access…",
  "ai.checkingRecords": "Checking school records…",
  "ai.ready": "Ready to help",
  "ai.voiceMode": "Voice mode",
  "ai.unavailable": "EDVIA is unavailable right now",
  "ai.talkToTeacher": "Talk to teacher",

  "domain.attendance": "Attendance",
  "domain.assignments": "Assignments",
  "domain.exams": "Exams",
  "domain.timetable": "Timetable",
  "domain.resources": "Resources",
  "domain.present": "Present",
  "domain.absent": "Absent",
  "domain.leave": "Leave",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.profile": "Profile",
  "settings.help": "Help",
  "settings.signOut": "Sign out",
};

const hi: Partial<UIStrings> = {
  "nav.grades": "अंक", "nav.marks": "अंक भरें", "nav.support": "सहायता",
  "nav.home": "होम", "nav.dashboard": "डैशबोर्ड", "nav.classes": "कक्षाएँ",
  "nav.students": "विद्यार्थी", "nav.progress": "प्रगति", "nav.assistant": "AI सहायक",
  "nav.ai": "AI", "nav.calendar": "कैलेंडर", "nav.notices": "सूचनाएँ",
  "nav.analytics": "विश्लेषण", "nav.reports": "रिपोर्ट", "nav.more": "और",
  "action.retry": "फिर कोशिश करें", "action.cancel": "रद्द करें", "action.confirm": "पुष्टि करें",
  "action.save": "सहेजें", "action.continue": "आगे बढ़ें", "action.back": "वापस",
  "action.send": "भेजें", "action.close": "बंद करें",
  "state.loading": "लोड हो रहा है…", "state.empty": "यहाँ अभी कुछ नहीं है",
  "state.errorTitle": "कुछ लोड नहीं हो सका", "state.offline": "आप ऑफ़लाइन लग रहे हैं",
  "ai.askPlaceholder": "EDVIA से कुछ भी पूछें…", "ai.thinking": "सोच रहा है…",
  "ai.listening": "सुन रहा है…", "ai.speaking": "बोल रहा है…",
  "ai.verifying": "पहुँच जाँची जा रही है…", "ai.checkingRecords": "स्कूल रिकॉर्ड देखे जा रहे हैं…",
  "ai.ready": "मदद के लिए तैयार", "ai.voiceMode": "वॉइस मोड",
  "ai.unavailable": "EDVIA अभी उपलब्ध नहीं है", "ai.talkToTeacher": "शिक्षक से बात करें",
  "domain.attendance": "उपस्थिति", "domain.assignments": "गृहकार्य", "domain.exams": "परीक्षाएँ",
  "domain.timetable": "समय-सारणी", "domain.resources": "अध्ययन सामग्री",
  "domain.present": "उपस्थित", "domain.absent": "अनुपस्थित", "domain.leave": "अवकाश",
  "settings.title": "सेटिंग्स", "settings.language": "भाषा", "settings.profile": "प्रोफ़ाइल",
  "settings.help": "सहायता", "settings.signOut": "साइन आउट",
};

const mr: Partial<UIStrings> = {
  "nav.grades": "गुण", "nav.marks": "गुण भरा", "nav.support": "मदत",
  "nav.home": "मुख्यपृष्ठ", "nav.dashboard": "डॅशबोर्ड", "nav.classes": "वर्ग",
  "nav.students": "विद्यार्थी", "nav.progress": "प्रगती", "nav.assistant": "AI सहाय्यक",
  "nav.ai": "AI", "nav.calendar": "दिनदर्शिका", "nav.notices": "सूचना",
  "nav.analytics": "विश्लेषण", "nav.reports": "अहवाल", "nav.more": "अधिक",
  "action.retry": "पुन्हा प्रयत्न करा", "action.cancel": "रद्द करा", "action.confirm": "निश्चित करा",
  "action.save": "जतन करा", "action.continue": "पुढे चला", "action.back": "मागे",
  "action.send": "पाठवा", "action.close": "बंद करा",
  "state.loading": "लोड होत आहे…", "state.empty": "इथे अजून काही नाही",
  "state.errorTitle": "काही लोड होऊ शकले नाही", "state.offline": "तुम्ही ऑफलाइन दिसत आहात",
  "ai.askPlaceholder": "EDVIA ला काहीही विचारा…", "ai.thinking": "विचार करत आहे…",
  "ai.listening": "ऐकत आहे…", "ai.speaking": "बोलत आहे…",
  "ai.verifying": "प्रवेश तपासत आहे…", "ai.checkingRecords": "शाळेच्या नोंदी तपासत आहे…",
  "ai.ready": "मदतीसाठी तयार", "ai.voiceMode": "व्हॉइस मोड",
  "ai.unavailable": "EDVIA सध्या उपलब्ध नाही", "ai.talkToTeacher": "शिक्षकांशी बोला",
  "domain.attendance": "उपस्थिती", "domain.assignments": "गृहपाठ", "domain.exams": "परीक्षा",
  "domain.timetable": "वेळापत्रक", "domain.resources": "अभ्यास साहित्य",
  "domain.present": "उपस्थित", "domain.absent": "अनुपस्थित", "domain.leave": "रजा",
  "settings.title": "सेटिंग्ज", "settings.language": "भाषा", "settings.profile": "प्रोफाइल",
  "settings.help": "मदत", "settings.signOut": "साइन आउट",
};

const ta: Partial<UIStrings> = {
  "nav.grades": "மதிப்பெண்கள்", "nav.marks": "மதிப்பெண் பதிவு", "nav.support": "உதவி",
  "nav.home": "முகப்பு", "nav.dashboard": "டாஷ்போர்டு", "nav.classes": "வகுப்புகள்",
  "nav.students": "மாணவர்கள்", "nav.progress": "முன்னேற்றம்", "nav.assistant": "AI உதவியாளர்",
  "nav.ai": "AI", "nav.calendar": "நாட்காட்டி", "nav.notices": "அறிவிப்புகள்",
  "nav.analytics": "பகுப்பாய்வு", "nav.reports": "அறிக்கைகள்", "nav.more": "மேலும்",
  "action.retry": "மீண்டும் முயற்சிக்கவும்", "action.cancel": "ரத்து செய்", "action.confirm": "உறுதிப்படுத்து",
  "action.save": "சேமி", "action.continue": "தொடர்க", "action.back": "பின்",
  "action.send": "அனுப்பு", "action.close": "மூடு",
  "state.loading": "ஏற்றுகிறது…", "state.empty": "இங்கு இதுவரை எதுவும் இல்லை",
  "state.errorTitle": "ஏற்ற முடியவில்லை", "state.offline": "நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள்",
  "ai.askPlaceholder": "EDVIA-விடம் எதையும் கேளுங்கள்…", "ai.thinking": "யோசிக்கிறது…",
  "ai.listening": "கேட்கிறது…", "ai.speaking": "பேசுகிறது…",
  "ai.verifying": "அணுகல் சரிபார்க்கப்படுகிறது…", "ai.checkingRecords": "பள்ளிப் பதிவுகள் பார்க்கப்படுகின்றன…",
  "ai.ready": "உதவ தயார்", "ai.voiceMode": "குரல் முறை",
  "ai.unavailable": "EDVIA தற்போது கிடைக்கவில்லை", "ai.talkToTeacher": "ஆசிரியருடன் பேசு",
  "domain.attendance": "வருகை", "domain.assignments": "பணிகள்", "domain.exams": "தேர்வுகள்",
  "domain.timetable": "நேர அட்டவணை", "domain.resources": "படிப்பு வளங்கள்",
  "domain.present": "வந்துள்ளார்", "domain.absent": "வரவில்லை", "domain.leave": "விடுப்பு",
  "settings.title": "அமைப்புகள்", "settings.language": "மொழி", "settings.profile": "சுயவிவரம்",
  "settings.help": "உதவி", "settings.signOut": "வெளியேறு",
};

const te: Partial<UIStrings> = {
  "nav.grades": "మార్కులు", "nav.marks": "మార్కులు నమోదు", "nav.support": "సహాయం",
  "nav.home": "హోమ్", "nav.dashboard": "డాష్‌బోర్డ్", "nav.classes": "తరగతులు",
  "nav.students": "విద్యార్థులు", "nav.progress": "పురోగతి", "nav.assistant": "AI సహాయకుడు",
  "nav.ai": "AI", "nav.calendar": "క్యాలెండర్", "nav.notices": "ప్రకటనలు",
  "nav.analytics": "విశ్లేషణ", "nav.reports": "నివేదికలు", "nav.more": "మరిన్ని",
  "action.retry": "మళ్లీ ప్రయత్నించండి", "action.cancel": "రద్దు చేయి", "action.confirm": "నిర్ధారించు",
  "action.save": "సేవ్ చేయి", "action.continue": "కొనసాగించు", "action.back": "వెనుకకు",
  "action.send": "పంపు", "action.close": "మూసివేయి",
  "state.loading": "లోడ్ అవుతోంది…", "state.empty": "ఇక్కడ ఇంకా ఏమీ లేదు",
  "state.errorTitle": "లోడ్ కాలేదు", "state.offline": "మీరు ఆఫ్‌లైన్‌లో ఉన్నట్టు కనిపిస్తోంది",
  "ai.askPlaceholder": "EDVIA ను ఏదైనా అడగండి…", "ai.thinking": "ఆలోచిస్తోంది…",
  "ai.listening": "వింటోంది…", "ai.speaking": "మాట్లాడుతోంది…",
  "ai.verifying": "యాక్సెస్ తనిఖీ చేస్తోంది…", "ai.checkingRecords": "పాఠశాల రికార్డులు చూస్తోంది…",
  "ai.ready": "సహాయానికి సిద్ధం", "ai.voiceMode": "వాయిస్ మోడ్",
  "ai.unavailable": "EDVIA ప్రస్తుతం అందుబాటులో లేదు", "ai.talkToTeacher": "ఉపాధ్యాయుడితో మాట్లాడండి",
  "domain.attendance": "హాజరు", "domain.assignments": "అసైన్‌మెంట్లు", "domain.exams": "పరీక్షలు",
  "domain.timetable": "టైమ్‌టేబుల్", "domain.resources": "అధ్యయన వనరులు",
  "domain.present": "హాజరు", "domain.absent": "గైర్హాజరు", "domain.leave": "సెలవు",
  "settings.title": "సెట్టింగ్‌లు", "settings.language": "భాష", "settings.profile": "ప్రొఫైల్",
  "settings.help": "సహాయం", "settings.signOut": "సైన్ అవుట్",
};

const bn: Partial<UIStrings> = {
  "nav.grades": "নম্বর", "nav.marks": "নম্বর দিন", "nav.support": "সহায়তা",
  "nav.home": "হোম", "nav.dashboard": "ড্যাশবোর্ড", "nav.classes": "ক্লাস",
  "nav.students": "শিক্ষার্থী", "nav.progress": "অগ্রগতি", "nav.assistant": "AI সহকারী",
  "nav.ai": "AI", "nav.calendar": "ক্যালেন্ডার", "nav.notices": "বিজ্ঞপ্তি",
  "nav.analytics": "বিশ্লেষণ", "nav.reports": "রিপোর্ট", "nav.more": "আরও",
  "action.retry": "আবার চেষ্টা করুন", "action.cancel": "বাতিল", "action.confirm": "নিশ্চিত করুন",
  "action.save": "সংরক্ষণ", "action.continue": "চালিয়ে যান", "action.back": "পিছনে",
  "action.send": "পাঠান", "action.close": "বন্ধ করুন",
  "state.loading": "লোড হচ্ছে…", "state.empty": "এখানে এখনও কিছু নেই",
  "state.errorTitle": "লোড করা যায়নি", "state.offline": "আপনি অফলাইনে আছেন বলে মনে হচ্ছে",
  "ai.askPlaceholder": "EDVIA-কে যা খুশি জিজ্ঞাসা করুন…", "ai.thinking": "ভাবছে…",
  "ai.listening": "শুনছে…", "ai.speaking": "বলছে…",
  "ai.verifying": "অ্যাক্সেস যাচাই করা হচ্ছে…", "ai.checkingRecords": "স্কুলের রেকর্ড দেখা হচ্ছে…",
  "ai.ready": "সাহায্যের জন্য প্রস্তুত", "ai.voiceMode": "ভয়েস মোড",
  "ai.unavailable": "EDVIA এখন উপলব্ধ নয়", "ai.talkToTeacher": "শিক্ষকের সঙ্গে কথা বলুন",
  "domain.attendance": "উপস্থিতি", "domain.assignments": "অ্যাসাইনমেন্ট", "domain.exams": "পরীক্ষা",
  "domain.timetable": "সময়সূচি", "domain.resources": "পড়ার উপকরণ",
  "domain.present": "উপস্থিত", "domain.absent": "অনুপস্থিত", "domain.leave": "ছুটি",
  "settings.title": "সেটিংস", "settings.language": "ভাষা", "settings.profile": "প্রোফাইল",
  "settings.help": "সহায়তা", "settings.signOut": "সাইন আউট",
};

const gu: Partial<UIStrings> = {
  "nav.grades": "ગુણ", "nav.marks": "ગુણ ભરો", "nav.support": "સહાય",
  "nav.home": "હોમ", "nav.dashboard": "ડેશબોર્ડ", "nav.classes": "વર્ગો",
  "nav.students": "વિદ્યાર્થીઓ", "nav.progress": "પ્રગતિ", "nav.assistant": "AI સહાયક",
  "nav.ai": "AI", "nav.calendar": "કૅલેન્ડર", "nav.notices": "સૂચનાઓ",
  "nav.analytics": "વિશ્લેષણ", "nav.reports": "અહેવાલો", "nav.more": "વધુ",
  "action.retry": "ફરી પ્રયાસ કરો", "action.cancel": "રદ કરો", "action.confirm": "પુષ્ટિ કરો",
  "action.save": "સાચવો", "action.continue": "ચાલુ રાખો", "action.back": "પાછળ",
  "action.send": "મોકલો", "action.close": "બંધ કરો",
  "state.loading": "લોડ થઈ રહ્યું છે…", "state.empty": "અહીં હજી કંઈ નથી",
  "state.errorTitle": "લોડ થઈ શક્યું નહીં", "state.offline": "તમે ઑફલાઇન લાગો છો",
  "ai.askPlaceholder": "EDVIA ને કંઈપણ પૂછો…", "ai.thinking": "વિચારી રહ્યું છે…",
  "ai.listening": "સાંભળી રહ્યું છે…", "ai.speaking": "બોલી રહ્યું છે…",
  "ai.verifying": "ઍક્સેસ ચકાસાઈ રહી છે…", "ai.checkingRecords": "શાળાના રેકોર્ડ જોઈ રહ્યા છીએ…",
  "ai.ready": "મદદ માટે તૈયાર", "ai.voiceMode": "વૉઇસ મોડ",
  "ai.unavailable": "EDVIA અત્યારે ઉપલબ્ધ નથી", "ai.talkToTeacher": "શિક્ષક સાથે વાત કરો",
  "domain.attendance": "હાજરી", "domain.assignments": "સોંપણીઓ", "domain.exams": "પરીક્ષાઓ",
  "domain.timetable": "સમયપત્રક", "domain.resources": "અભ્યાસ સામગ્રી",
  "domain.present": "હાજર", "domain.absent": "ગેરહાજર", "domain.leave": "રજા",
  "settings.title": "સેટિંગ્સ", "settings.language": "ભાષા", "settings.profile": "પ્રોફાઇલ",
  "settings.help": "મદદ", "settings.signOut": "સાઇન આઉટ",
};

const pa: Partial<UIStrings> = {
  "nav.grades": "ਅੰਕ", "nav.marks": "ਅੰਕ ਭਰੋ", "nav.support": "ਸਹਾਇਤਾ",
  "nav.home": "ਹੋਮ", "nav.dashboard": "ਡੈਸ਼ਬੋਰਡ", "nav.classes": "ਜਮਾਤਾਂ",
  "nav.students": "ਵਿਦਿਆਰਥੀ", "nav.progress": "ਤਰੱਕੀ", "nav.assistant": "AI ਸਹਾਇਕ",
  "nav.ai": "AI", "nav.calendar": "ਕੈਲੰਡਰ", "nav.notices": "ਸੂਚਨਾਵਾਂ",
  "nav.analytics": "ਵਿਸ਼ਲੇਸ਼ਣ", "nav.reports": "ਰਿਪੋਰਟਾਂ", "nav.more": "ਹੋਰ",
  "action.retry": "ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ", "action.cancel": "ਰੱਦ ਕਰੋ", "action.confirm": "ਪੁਸ਼ਟੀ ਕਰੋ",
  "action.save": "ਸੰਭਾਲੋ", "action.continue": "ਜਾਰੀ ਰੱਖੋ", "action.back": "ਪਿੱਛੇ",
  "action.send": "ਭੇਜੋ", "action.close": "ਬੰਦ ਕਰੋ",
  "state.loading": "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…", "state.empty": "ਇੱਥੇ ਅਜੇ ਕੁਝ ਨਹੀਂ ਹੈ",
  "state.errorTitle": "ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ", "state.offline": "ਤੁਸੀਂ ਆਫ਼ਲਾਈਨ ਜਾਪਦੇ ਹੋ",
  "ai.askPlaceholder": "EDVIA ਨੂੰ ਕੁਝ ਵੀ ਪੁੱਛੋ…", "ai.thinking": "ਸੋਚ ਰਿਹਾ ਹੈ…",
  "ai.listening": "ਸੁਣ ਰਿਹਾ ਹੈ…", "ai.speaking": "ਬੋਲ ਰਿਹਾ ਹੈ…",
  "ai.verifying": "ਪਹੁੰਚ ਜਾਂਚੀ ਜਾ ਰਹੀ ਹੈ…", "ai.checkingRecords": "ਸਕੂਲ ਰਿਕਾਰਡ ਵੇਖੇ ਜਾ ਰਹੇ ਹਨ…",
  "ai.ready": "ਮਦਦ ਲਈ ਤਿਆਰ", "ai.voiceMode": "ਵੌਇਸ ਮੋਡ",
  "ai.unavailable": "EDVIA ਇਸ ਵੇਲੇ ਉਪਲਬਧ ਨਹੀਂ", "ai.talkToTeacher": "ਅਧਿਆਪਕ ਨਾਲ ਗੱਲ ਕਰੋ",
  "domain.attendance": "ਹਾਜ਼ਰੀ", "domain.assignments": "ਕੰਮ", "domain.exams": "ਪ੍ਰੀਖਿਆਵਾਂ",
  "domain.timetable": "ਸਮਾਂ-ਸਾਰਣੀ", "domain.resources": "ਪੜ੍ਹਾਈ ਸਮੱਗਰੀ",
  "domain.present": "ਹਾਜ਼ਰ", "domain.absent": "ਗੈਰਹਾਜ਼ਰ", "domain.leave": "ਛੁੱਟੀ",
  "settings.title": "ਸੈਟਿੰਗਾਂ", "settings.language": "ਭਾਸ਼ਾ", "settings.profile": "ਪ੍ਰੋਫਾਈਲ",
  "settings.help": "ਮਦਦ", "settings.signOut": "ਸਾਈਨ ਆਊਟ",
};

const kn: Partial<UIStrings> = {
  "nav.grades": "ಅಂಕಗಳು", "nav.marks": "ಅಂಕ ನಮೂದು", "nav.support": "ಸಹಾಯ",
  "nav.home": "ಮುಖಪುಟ", "nav.dashboard": "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", "nav.classes": "ತರಗತಿಗಳು",
  "nav.students": "ವಿದ್ಯಾರ್ಥಿಗಳು", "nav.progress": "ಪ್ರಗತಿ", "nav.assistant": "AI ಸಹಾಯಕ",
  "nav.ai": "AI", "nav.calendar": "ಕ್ಯಾಲೆಂಡರ್", "nav.notices": "ಪ್ರಕಟಣೆಗಳು",
  "nav.analytics": "ವಿಶ್ಲೇಷಣೆ", "nav.reports": "ವರದಿಗಳು", "nav.more": "ಇನ್ನಷ್ಟು",
  "action.retry": "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", "action.cancel": "ರದ್ದುಮಾಡಿ", "action.confirm": "ದೃಢೀಕರಿಸಿ",
  "action.save": "ಉಳಿಸಿ", "action.continue": "ಮುಂದುವರಿಸಿ", "action.back": "ಹಿಂದೆ",
  "action.send": "ಕಳುಹಿಸಿ", "action.close": "ಮುಚ್ಚಿ",
  "state.loading": "ಲೋಡ್ ಆಗುತ್ತಿದೆ…", "state.empty": "ಇಲ್ಲಿ ಇನ್ನೂ ಏನೂ ಇಲ್ಲ",
  "state.errorTitle": "ಲೋಡ್ ಆಗಲಿಲ್ಲ", "state.offline": "ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿರುವಂತೆ ತೋರುತ್ತದೆ",
  "ai.askPlaceholder": "EDVIA ಗೆ ಏನನ್ನಾದರೂ ಕೇಳಿ…", "ai.thinking": "ಯೋಚಿಸುತ್ತಿದೆ…",
  "ai.listening": "ಕೇಳುತ್ತಿದೆ…", "ai.speaking": "ಮಾತನಾಡುತ್ತಿದೆ…",
  "ai.verifying": "ಪ್ರವೇಶ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…", "ai.checkingRecords": "ಶಾಲಾ ದಾಖಲೆಗಳನ್ನು ನೋಡಲಾಗುತ್ತಿದೆ…",
  "ai.ready": "ಸಹಾಯಕ್ಕೆ ಸಿದ್ಧ", "ai.voiceMode": "ಧ್ವನಿ ಮೋಡ್",
  "ai.unavailable": "EDVIA ಈಗ ಲಭ್ಯವಿಲ್ಲ", "ai.talkToTeacher": "ಶಿಕ್ಷಕರೊಂದಿಗೆ ಮಾತನಾಡಿ",
  "domain.attendance": "ಹಾಜರಾತಿ", "domain.assignments": "ಕಾರ್ಯಗಳು", "domain.exams": "ಪರೀಕ್ಷೆಗಳು",
  "domain.timetable": "ವೇಳಾಪಟ್ಟಿ", "domain.resources": "ಅಧ್ಯಯನ ಸಾಮಗ್ರಿ",
  "domain.present": "ಹಾಜರು", "domain.absent": "ಗೈರುಹಾಜರು", "domain.leave": "ರಜೆ",
  "settings.title": "ಸೆಟ್ಟಿಂಗ್‌ಗಳು", "settings.language": "ಭಾಷೆ", "settings.profile": "ಪ್ರೊಫೈಲ್",
  "settings.help": "ಸಹಾಯ", "settings.signOut": "ಸೈನ್ ಔಟ್",
};

const ml: Partial<UIStrings> = {
  "nav.grades": "മാർക്ക്", "nav.marks": "മാർക്ക് നൽകുക", "nav.support": "സഹായം",
  "nav.home": "ഹോം", "nav.dashboard": "ഡാഷ്‌ബോർഡ്", "nav.classes": "ക്ലാസുകൾ",
  "nav.students": "വിദ്യാർത്ഥികൾ", "nav.progress": "പുരോഗതി", "nav.assistant": "AI സഹായി",
  "nav.ai": "AI", "nav.calendar": "കലണ്ടർ", "nav.notices": "അറിയിപ്പുകൾ",
  "nav.analytics": "വിശകലനം", "nav.reports": "റിപ്പോർട്ടുകൾ", "nav.more": "കൂടുതൽ",
  "action.retry": "വീണ്ടും ശ്രമിക്കുക", "action.cancel": "റദ്ദാക്കുക", "action.confirm": "സ്ഥിരീകരിക്കുക",
  "action.save": "സംരക്ഷിക്കുക", "action.continue": "തുടരുക", "action.back": "പിന്നോട്ട്",
  "action.send": "അയയ്ക്കുക", "action.close": "അടയ്ക്കുക",
  "state.loading": "ലോഡ് ചെയ്യുന്നു…", "state.empty": "ഇവിടെ ഇതുവരെ ഒന്നുമില്ല",
  "state.errorTitle": "ലോഡ് ചെയ്യാനായില്ല", "state.offline": "നിങ്ങൾ ഓഫ്‌ലൈനാണെന്ന് തോന്നുന്നു",
  "ai.askPlaceholder": "EDVIA യോട് എന്തും ചോദിക്കൂ…", "ai.thinking": "ചിന്തിക്കുന്നു…",
  "ai.listening": "കേൾക്കുന്നു…", "ai.speaking": "സംസാരിക്കുന്നു…",
  "ai.verifying": "ആക്‌സസ് പരിശോധിക്കുന്നു…", "ai.checkingRecords": "സ്കൂൾ രേഖകൾ പരിശോധിക്കുന്നു…",
  "ai.ready": "സഹായിക്കാൻ തയ്യാർ", "ai.voiceMode": "വോയ്‌സ് മോഡ്",
  "ai.unavailable": "EDVIA ഇപ്പോൾ ലഭ്യമല്ല", "ai.talkToTeacher": "അധ്യാപകനോട് സംസാരിക്കുക",
  "domain.attendance": "ഹാജർ", "domain.assignments": "അസൈൻമെന്റുകൾ", "domain.exams": "പരീക്ഷകൾ",
  "domain.timetable": "സമയക്രമം", "domain.resources": "പഠന സാമഗ്രികൾ",
  "domain.present": "ഹാജർ", "domain.absent": "ഹാജരല്ല", "domain.leave": "അവധി",
  "settings.title": "ക്രമീകരണങ്ങൾ", "settings.language": "ഭാഷ", "settings.profile": "പ്രൊഫൈൽ",
  "settings.help": "സഹായം", "settings.signOut": "സൈൻ ഔട്ട്",
};

const ur: Partial<UIStrings> = {
  "nav.grades": "نمبر", "nav.marks": "نمبر درج کریں", "nav.support": "مدد",
  "nav.home": "ہوم", "nav.dashboard": "ڈیش بورڈ", "nav.classes": "کلاسیں",
  "nav.students": "طلبہ", "nav.progress": "پیش رفت", "nav.assistant": "AI معاون",
  "nav.ai": "AI", "nav.calendar": "کیلنڈر", "nav.notices": "اطلاعات",
  "nav.analytics": "تجزیہ", "nav.reports": "رپورٹس", "nav.more": "مزید",
  "action.retry": "دوبارہ کوشش کریں", "action.cancel": "منسوخ کریں", "action.confirm": "تصدیق کریں",
  "action.save": "محفوظ کریں", "action.continue": "جاری رکھیں", "action.back": "واپس",
  "action.send": "بھیجیں", "action.close": "بند کریں",
  "state.loading": "لوڈ ہو رہا ہے…", "state.empty": "یہاں ابھی کچھ نہیں",
  "state.errorTitle": "لوڈ نہیں ہو سکا", "state.offline": "آپ آف لائن معلوم ہوتے ہیں",
  "ai.askPlaceholder": "EDVIA سے کچھ بھی پوچھیں…", "ai.thinking": "سوچ رہا ہے…",
  "ai.listening": "سن رہا ہے…", "ai.speaking": "بول رہا ہے…",
  "ai.verifying": "رسائی کی جانچ ہو رہی ہے…", "ai.checkingRecords": "اسکول ریکارڈ دیکھے جا رہے ہیں…",
  "ai.ready": "مدد کے لیے تیار", "ai.voiceMode": "وائس موڈ",
  "ai.unavailable": "EDVIA اس وقت دستیاب نہیں", "ai.talkToTeacher": "استاد سے بات کریں",
  "domain.attendance": "حاضری", "domain.assignments": "اسائنمنٹس", "domain.exams": "امتحانات",
  "domain.timetable": "ٹائم ٹیبل", "domain.resources": "مطالعاتی مواد",
  "domain.present": "حاضر", "domain.absent": "غیر حاضر", "domain.leave": "چھٹی",
  "settings.title": "ترتیبات", "settings.language": "زبان", "settings.profile": "پروفائل",
  "settings.help": "مدد", "settings.signOut": "سائن آؤٹ",
};

/** English is complete; every other locale is a partial overlay on it. */
export const STRINGS: Record<LanguageCode, Partial<UIStrings>> = {
  en, hi, ta, te, mr, bn, gu, pa, kn, ml, ur,
};

export const ENGLISH_STRINGS = en;

/**
 * Urdu is the only supported language written right-to-left. The document
 * `dir` attribute is set from this, so layout mirrors rather than being
 * mangled by RTL text inside an LTR container.
 */
export const RTL_LANGUAGES: LanguageCode[] = ["ur"];

export function isRtl(language: LanguageCode): boolean {
  return RTL_LANGUAGES.includes(language);
}

/** Resolves one key, falling back to English per-key (never per-language). */
export function translate(language: LanguageCode, key: StringKey): string {
  return STRINGS[language]?.[key] ?? ENGLISH_STRINGS[key];
}
