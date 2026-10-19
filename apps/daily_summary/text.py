"""The daily summary in the reader's own language.

The builders in summary.py write English labels; each is looked up here when
the message is put together, so a summary's wording lives in one place per
language. Names, dates, amounts and order numbers are passed in as values and
never translated.

`t()` covers every heading and label: a phrase missing for a language is sent
in English and logged, never silently. `step()` covers the default workflow's
step names; a step the boutique named itself is its own word and stays as
written.
"""
import logging

logger = logging.getLogger(__name__)

DEFAULT = 'en'
LANGUAGES = [('en', 'English'), ('hi', 'हिंदी'), ('te', 'తెలుగు')]

TEXT = {
    'hi': {
        'Daily summary · {date}': "दैनिक सारांश · {date}",
        '{boutique} · daily summary': "{boutique} · दैनिक सारांश",
        'Money': "पैसा",
        'Collected today': "आज मिली राशि",
        'New orders booked today': "आज बुक हुए नए ऑर्डर",
        '{amount} ({count} orders)': "{amount} ({count} ऑर्डर)",
        'Outstanding from customers': "ग्राहकों से बकाया",
        'Orders': "ऑर्डर",
        'Delivered today': "आज डिलीवर हुए",
        'Overdue': "समय से पीछे",
        'Waiting for you': "आपके लिए बाकी",
        'Work to check': "जाँचने के लिए काम",
        'Designs to review': "समीक्षा के लिए डिज़ाइन",
        'Customers': "ग्राहक",
        'New customers today': "आज के नए ग्राहक",
        'New leads today': "आज के नए लीड",
        'Leads awaiting contact': "संपर्क का इंतज़ार कर रहे लीड",
        'Team': "टीम",
        'Present today': "आज उपस्थित",
        'On leave': "छुट्टी पर",
        'Tomorrow': "कल",
        'Appointments': "अपॉइंटमेंट",
        'Stock': "स्टॉक",
        'Items low on stock': "कम स्टॉक वाली चीज़ें",
        'Today': "आज",
        'Your designs': "आपके डिज़ाइन",
        'Submitted today': "आज जमा किए",
        'Approved today': "आज स्वीकृत",
        'Sent back today': "आज वापस भेजे गए",
        'Waiting for review': "समीक्षा का इंतज़ार",
        'To rework': "दोबारा करने हैं",
        'Assigned, not yet submitted': "सौंपे गए, अभी जमा नहीं",
        'Production floor': "प्रोडक्शन फ्लोर",
        'Waiting for your check': "आपकी जाँच का इंतज़ार",
        'Ready to assign': "सौंपने के लिए तैयार",
        'Completed today': "आज पूरे हुए",
        'Sent back to redo': "दोबारा करने के लिए लौटाए गए",
        'Your own work': "आपका अपना काम",
        'Your work': "आपका काम",
        'Completed today (checked)': "आज पूरे हुए (जाँचे गए)",
        'Waiting for a check': "जाँच का इंतज़ार",
        'Pending': "बाकी",
        'Open to-dos': "खुले टू-डू",
        'To-dos closed today': "आज बंद हुए टू-डू",
        '• +{count} more': "• +{count} और",
        'Leads': "लीड",
    },
    'te': {
        'Daily summary · {date}': "రోజువారీ సారాంశం · {date}",
        '{boutique} · daily summary': "{boutique} · రోజువారీ సారాంశం",
        'Money': "డబ్బు",
        'Collected today': "ఈరోజు వసూలైనది",
        'New orders booked today': "ఈరోజు బుక్ అయిన కొత్త ఆర్డర్లు",
        '{amount} ({count} orders)': "{amount} ({count} ఆర్డర్లు)",
        'Outstanding from customers': "కస్టమర్ల నుండి రావలసినది",
        'Orders': "ఆర్డర్లు",
        'Delivered today': "ఈరోజు డెలివరీ అయినవి",
        'Overdue': "గడువు దాటినవి",
        'Waiting for you': "మీ కోసం వేచి ఉన్నవి",
        'Work to check': "తనిఖీ చేయాల్సిన పని",
        'Designs to review': "సమీక్షించాల్సిన డిజైన్లు",
        'Customers': "కస్టమర్లు",
        'New customers today': "ఈరోజు కొత్త కస్టమర్లు",
        'New leads today': "ఈరోజు కొత్త లీడ్‌లు",
        'Leads awaiting contact': "సంప్రదింపు కోసం వేచి ఉన్న లీడ్‌లు",
        'Team': "టీమ్",
        'Present today': "ఈరోజు హాజరైనవారు",
        'On leave': "సెలవులో ఉన్నవారు",
        'Tomorrow': "రేపు",
        'Appointments': "అపాయింట్‌మెంట్‌లు",
        'Stock': "స్టాక్",
        'Items low on stock': "స్టాక్ తక్కువగా ఉన్న వస్తువులు",
        'Today': "ఈరోజు",
        'Your designs': "మీ డిజైన్లు",
        'Submitted today': "ఈరోజు సమర్పించినవి",
        'Approved today': "ఈరోజు ఆమోదించినవి",
        'Sent back today': "ఈరోజు తిరిగి పంపినవి",
        'Waiting for review': "సమీక్ష కోసం వేచి ఉన్నవి",
        'To rework': "మళ్లీ చేయాల్సినవి",
        'Assigned, not yet submitted': "అప్పగించినవి, ఇంకా సమర్పించనివి",
        'Production floor': "ప్రొడక్షన్ ఫ్లోర్",
        'Waiting for your check': "మీ తనిఖీ కోసం వేచి ఉన్నవి",
        'Ready to assign': "అప్పగించడానికి సిద్ధంగా ఉన్నవి",
        'Completed today': "ఈరోజు పూర్తయినవి",
        'Sent back to redo': "మళ్లీ చేయడానికి తిరిగి పంపినవి",
        'Your own work': "మీ సొంత పని",
        'Your work': "మీ పని",
        'Completed today (checked)': "ఈరోజు పూర్తయినవి (తనిఖీ అయినవి)",
        'Waiting for a check': "తనిఖీ కోసం వేచి ఉన్నవి",
        'Pending': "పెండింగ్‌లో ఉన్నవి",
        'Open to-dos': "తెరిచి ఉన్న టు-డూలు",
        'To-dos closed today': "ఈరోజు మూసిన టు-డూలు",
        '• +{count} more': "• +{count} మరిన్ని",
        'Leads': "లీడ్‌లు",
    },
}

#: The default workflow's step names (crm_api.models.get_default_workflow).
STEPS = {
    'hi': {
        'Order taken': "ऑर्डर लिया गया", 'Design': "डिज़ाइन", 'Cutting': "कटिंग",
        'Paper cutting': "पेपर कटिंग", 'Maggam design': "मग्गम डिज़ाइन",
        'Maggam handwork': "मग्गम हैंडवर्क", 'Maggam verification': "मग्गम जाँच",
        'Fabric cutting': "कपड़ा कटिंग", 'Alteration work': "बदलाव का काम",
        'Stitching': "सिलाई", 'Hemming & finishing': "तुरपाई और फिनिशिंग",
        'Pressing & packaging': "प्रेस और पैकिंग", 'Master quality check': "मास्टर गुणवत्ता जाँच",
        'Trial booking': "ट्रायल बुकिंग", 'Trial': "ट्रायल", 'Delivery prep': "डिलीवरी की तैयारी",
        'Payment': "भुगतान", 'Delivery': "डिलीवरी",
    },
    'te': {
        'Order taken': "ఆర్డర్ తీసుకున్నారు", 'Design': "డిజైన్", 'Cutting': "కటింగ్",
        'Paper cutting': "పేపర్ కటింగ్", 'Maggam design': "మగ్గం డిజైన్",
        'Maggam handwork': "మగ్గం చేతి పని", 'Maggam verification': "మగ్గం తనిఖీ",
        'Fabric cutting': "బట్ట కటింగ్", 'Alteration work': "మార్పుల పని",
        'Stitching': "కుట్టు", 'Hemming & finishing': "హెమ్మింగ్ & ఫినిషింగ్",
        'Pressing & packaging': "ఇస్త్రీ & ప్యాకింగ్", 'Master quality check': "మాస్టర్ నాణ్యత తనిఖీ",
        'Trial booking': "ట్రయల్ బుకింగ్", 'Trial': "ట్రయల్", 'Delivery prep': "డెలివరీ సిద్ధం",
        'Payment': "చెల్లింపు", 'Delivery': "డెలివరీ",
    },
}


def language(code):
    return code if code in TEXT or code == DEFAULT else DEFAULT


def t(lang, phrase, **values):
    """`phrase` (the English wording) in `lang`, with `values` filled in."""
    if language(lang) != DEFAULT:
        translated = TEXT[lang].get(phrase)
        if translated is None:
            logger.warning("daily summary phrase %r has no %s translation; sent in English",
                           phrase, lang)
        else:
            phrase = translated
    return phrase.format(**values) if values else phrase


def step(lang, name):
    return STEPS.get(language(lang), {}).get(name, name)


def date(lang, value, tenant=None):
    from core.formatting import format_date
    return format_date(value, tenant) if language(lang) == DEFAULT else value.strftime('%d/%m/%Y')
