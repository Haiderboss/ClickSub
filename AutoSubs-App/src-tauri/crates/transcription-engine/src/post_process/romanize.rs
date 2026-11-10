//! Hindi (Devanagari) to Roman "Hinglish", spelled the way it is commonly
//! written online: `hai`, `nahi`, `aur`, `jabki`, `kehne`, `sukoon`.
//!
//! Whisper hears Hindi and Urdu speech most accurately when it writes
//! Devanagari, but decoding straight to Latin letters (language `en` with a
//! Roman prompt) mishears far more words. So Hinglish transcription runs as
//! Hindi and this pass converts the result, keeping every word's timing.
//!
//! Words are looked up in a dictionary of everyday spellings first (including
//! English words written in Devanagari, like `प्रॉब्लम` for "problem"). Other
//! words go through Hindi pronunciation rules: the silent inherent "a" is
//! dropped (`समझते` samajhte, `जबकि` jabki), "ah" before a consonant becomes
//! "eh" (`कहने` kehne), and long vowels are doubled where Hinglish writers
//! double them (`बात` baat, `ठीक` theek, `सुकून` sukoon). Text that is not
//! Devanagari passes through unchanged.

use std::collections::HashMap;
use std::sync::OnceLock;

use crate::types::{Segment, WordTimestamp};

/// Everyday spellings, applied before the pronunciation rules. Keys are
/// matched after [`normalize`], so nukta and chandrabindu variants of a key
/// match too.
const LEXICON: &[(&str, &str)] = &[
    // Verbs "to be" and negation
    ("है", "hai"), ("हैं", "hain"), ("था", "tha"), ("थे", "the"), ("थी", "thi"), ("थीं", "thi"),
    ("हूं", "hoon"), ("हो", "ho"), ("होगा", "hoga"), ("होगी", "hogi"), ("होंगे", "honge"),
    ("होता", "hota"), ("होती", "hoti"), ("होते", "hote"), ("होना", "hona"),
    ("नहीं", "nahi"), ("नही", "nahi"), ("न", "na"), ("ना", "na"),
    // Pronouns
    ("मैं", "main"), ("में", "mein"), ("मुझे", "mujhe"), ("मुझ", "mujh"), ("मेरा", "mera"),
    ("मेरी", "meri"), ("मेरे", "mere"), ("हम", "hum"), ("हमें", "humein"), ("हमारा", "hamara"),
    ("हमारी", "hamari"), ("हमारे", "hamare"), ("तुम", "tum"), ("तुम्हें", "tumhe"),
    ("तुम्हारा", "tumhara"), ("तुम्हारी", "tumhari"), ("तू", "tu"), ("तेरा", "tera"), ("तेरी", "teri"),
    ("आप", "aap"), ("आपको", "aapko"), ("आपका", "aapka"), ("आपकी", "aapki"), ("आपके", "aapke"),
    ("यह", "yeh"), ("ये", "yeh"), ("वह", "woh"), ("वो", "woh"),
    ("उस", "us"), ("उसे", "use"), ("उसको", "usko"), ("उसका", "uska"), ("उसकी", "uski"), ("उसके", "uske"),
    ("इस", "is"), ("इसे", "ise"), ("इसको", "isko"), ("इसका", "iska"), ("इसकी", "iski"), ("इसके", "iske"),
    ("इसी", "isi"), ("उसी", "usi"), ("इन", "in"), ("उन", "un"), ("इनका", "inka"), ("उनका", "unka"),
    ("उनकी", "unki"), ("उनके", "unke"), ("उन्हें", "unhe"), ("इन्हें", "inhe"),
    ("अपना", "apna"), ("अपनी", "apni"), ("अपने", "apne"), ("खुद", "khud"),
    // Question and relative words
    ("क्या", "kya"), ("क्यों", "kyun"), ("क्यूं", "kyun"), ("क्योंकि", "kyunki"), ("क्यूंकि", "kyunki"),
    ("कैसे", "kaise"), ("कैसा", "kaisa"), ("कैसी", "kaisi"), ("कब", "kab"), ("कहां", "kahan"),
    ("कौन", "kaun"), ("कितना", "kitna"), ("कितनी", "kitni"), ("कितने", "kitne"),
    ("जो", "jo"), ("जब", "jab"), ("तब", "tab"), ("अब", "ab"), ("सब", "sab"), ("कुछ", "kuch"),
    ("कोई", "koi"), ("किसी", "kisi"), ("किस", "kis"), ("किसे", "kise"), ("जिस", "jis"), ("जिसे", "jise"),
    ("जिसका", "jiska"), ("जैसे", "jaise"), ("ऐसे", "aise"), ("वैसे", "waise"), ("ऐसा", "aisa"),
    ("ऐसी", "aisi"), ("वैसा", "waisa"), ("यहां", "yahan"), ("वहां", "wahan"), ("जहां", "jahan"),
    ("यही", "yahi"), ("वही", "wahi"), ("यहीं", "yahin"), ("वहीं", "wahin"),
    // Particles and connectors
    ("का", "ka"), ("की", "ki"), ("के", "ke"), ("को", "ko"), ("से", "se"), ("पर", "par"), ("पे", "pe"),
    ("तक", "tak"), ("लिए", "liye"), ("लिये", "liye"), ("साथ", "saath"), ("बाद", "baad"),
    ("पहले", "pehle"), ("पहला", "pehla"), ("पहली", "pehli"), ("फिर", "phir"), ("भी", "bhi"),
    ("ही", "hi"), ("तो", "toh"), ("कि", "k"), ("जबकि", "jabki"), ("लेकिन", "lekin"), ("मगर", "magar"),
    ("बल्कि", "balki"), ("इसलिए", "isliye"), ("इसलिये", "isliye"), ("ताकि", "taaki"), ("अगर", "agar"),
    ("वरना", "warna"), ("यानी", "yaani"), ("यानि", "yaani"), ("मतलब", "matlab"), ("शायद", "shayad"),
    ("सिर्फ", "sirf"), ("बस", "bas"), ("बहुत", "bahut"), ("ज्यादा", "zyada"), ("कम", "kam"),
    ("थोड़ा", "thoda"), ("थोड़ी", "thodi"), ("बिल्कुल", "bilkul"), ("जरूर", "zaroor"),
    ("जरूरत", "zaroorat"), ("जरूरी", "zaroori"), ("सही", "sahi"), ("गलत", "galat"), ("ठीक", "theek"),
    ("अच्छा", "accha"), ("अच्छी", "acchi"), ("अच्छे", "acche"), ("बुरा", "bura"), ("बड़ा", "bada"),
    ("बड़ी", "badi"), ("बड़े", "bade"), ("छोटा", "chhota"), ("छोटी", "chhoti"), ("छोटे", "chhote"),
    ("नया", "naya"), ("नई", "nayi"), ("नए", "naye"), ("पूरा", "poora"), ("पूरी", "poori"), ("हर", "har"),
    ("एक", "ek"), ("दो", "do"), ("तीन", "teen"), ("चार", "chaar"), ("पांच", "paanch"), ("दस", "das"),
    ("सौ", "sau"), ("हजार", "hazaar"), ("लाख", "lakh"),
    // Common verbs
    ("करना", "karna"), ("करने", "karne"), ("करते", "karte"), ("करता", "karta"), ("करती", "karti"),
    ("करो", "karo"), ("करें", "karein"), ("करेंगे", "karenge"), ("किया", "kiya"), ("किये", "kiye"),
    ("किए", "kiye"), ("कर", "kar"), ("कहना", "kehna"), ("कहने", "kehne"), ("कहते", "kehte"),
    ("वाला", "wala"), ("वाले", "wale"), ("वाली", "wali"), ("जाकर", "jaakar"), ("कहता", "kehta"), ("कहा", "kaha"), ("कहो", "kaho"), ("रहा", "raha"), ("रही", "rahi"), ("रहे", "rahe"),
    ("रहता", "rehta"), ("रहती", "rehti"), ("रहते", "rehte"), ("रहना", "rehna"), ("गया", "gaya"),
    ("गई", "gayi"), ("गए", "gaye"), ("गये", "gaye"), ("जाना", "jaana"), ("जाता", "jaata"),
    ("जाती", "jaati"), ("जाते", "jaate"), ("जाएगा", "jayega"), ("जा", "ja"), ("आना", "aana"),
    ("आता", "aata"), ("आती", "aati"), ("आते", "aate"), ("आया", "aaya"), ("आई", "aayi"), ("आए", "aaye"),
    ("देना", "dena"), ("देते", "dete"), ("देता", "deta"), ("दिया", "diya"), ("लेना", "lena"),
    ("लेते", "lete"), ("लिया", "liya"), ("सकते", "sakte"), ("सकता", "sakta"), ("सकती", "sakti"),
    ("चाहिए", "chahiye"), ("चाहिये", "chahiye"), ("चाहते", "chahte"), ("चाहता", "chahta"),
    ("पता", "pata"), ("देखो", "dekho"), ("देखिए", "dekhiye"), ("देखा", "dekha"), ("बताना", "batana"),
    ("बताता", "batata"), ("बताते", "batate"), ("समझ", "samajh"), ("सोचो", "socho"), ("सोचते", "sochte"),
    ("लगता", "lagta"), ("लगती", "lagti"), ("लगते", "lagte"), ("मिलता", "milta"), ("मिलती", "milti"),
    // Common nouns and adverbs
    ("लोग", "log"), ("लोगों", "logon"), ("बात", "baat"), ("बातें", "baatein"), ("चीज", "cheez"),
    ("चीजें", "cheezein"), ("जिंदगी", "zindagi"), ("जिन्दगी", "zindagi"), ("दिल", "dil"),
    ("दिमाग", "dimagh"), ("दिमागी", "dimaghi"), ("वक्त", "waqt"), ("समय", "samay"), ("दिन", "din"), ("रात", "raat"),
    ("साल", "saal"), ("दुनिया", "duniya"), ("पैसा", "paisa"), ("पैसे", "paise"), ("काम", "kaam"),
    ("घर", "ghar"), ("यार", "yaar"), ("भाई", "bhai"), ("दोस्त", "dost"), ("दोस्तों", "doston"),
    ("मां", "maa"), ("अल्लाह", "Allah"), ("खुदा", "khuda"), ("इंसान", "insaan"), ("सवाल", "sawaal"),
    ("जवाब", "jawaab"), ("मसला", "masla"), ("मसले", "masle"), ("मुश्किल", "mushkil"), ("हल", "hal"),
    ("सुकून", "sukoon"), ("सकून", "sukoon"), ("आराम", "aaram"), ("खुशी", "khushi"), ("प्यार", "pyaar"),
    ("मोहब्बत", "mohabbat"), ("इश्क", "ishq"), ("डर", "dar"), ("गम", "gham"), ("दुख", "dukh"),
    ("परेशान", "pareshan"), ("परेशानी", "pareshani"), ("असल", "asal"), ("असली", "asli"),
    ("हकीकत", "haqeeqat"), ("कोशिश", "koshish"), ("वजह", "waja"), ("वजा", "waja"), ("तरफ", "taraf"), ("तरह", "tarah"),
    ("हमेशा", "hamesha"), ("कभी", "kabhi"), ("अभी", "abhi"), ("सभी", "sabhi"), ("आज", "aaj"),
    ("कल", "kal"), ("बाहर", "bahar"), ("अंदर", "andar"), ("ऊपर", "upar"), ("नीचे", "neeche"),
    ("सामने", "saamne"), ("जिन्नात", "jinnat"), ("तावीज", "taweez"), ("दरूद", "durood"), ("दुरूद", "durood"), ("दूरूत", "durood"), ("दमदूरूत", "dam durood"), ("दम", "dam"),
    ("लम्हे", "lamhe"), ("लम्हा", "lamha"), ("महदूद", "mehdood"), ("बाज", "baaz"), ("हमला", "hamla"),
    // English words written in Devanagari
    ("प्रॉब्लम", "problem"), ("प्रोब्लम", "problem"), ("प्राब्लम", "problem"), ("प्रॉब्लम्स", "problems"),
    ("प्रोफेशनल", "professional"), ("जस्ट", "just"), ("रिलीफ", "relief"), ("मेडिकेशन", "medication"),
    ("मिडिकेशन", "medication"), ("मेडिसिन", "medicine"), ("डॉक्टर", "doctor"), ("डाक्टर", "doctor"),
    ("साइकेट्रिस्ट", "psychiatrist"), ("साइकेट्रिक्स", "psychiatrist"), ("साइकियाट्रिस्ट", "psychiatrist"),
    ("साक्याटरिक्स", "psychiatrist"), ("थेरेपी", "therapy"), ("थेरेपिस्ट", "therapist"),
    ("एंग्जायटी", "anxiety"), ("एंग्जाइटी", "anxiety"), ("डिप्रेशन", "depression"), ("स्ट्रेस", "stress"),
    ("वीडियो", "video"), ("विडियो", "video"), ("चैनल", "channel"), ("सब्सक्राइब", "subscribe"),
    ("लाइक", "like"), ("शेयर", "share"), ("कमेंट", "comment"), ("कमेंट्स", "comments"), ("फॉलो", "follow"),
    ("लाइफ", "life"), ("टाइम", "time"), ("एक्चुअली", "actually"), ("बेसिकली", "basically"),
    ("इम्पोर्टेंट", "important"), ("इंपॉर्टेंट", "important"), ("इम्पॉर्टेन्ट", "important"),
    ("सोशल", "social"), ("मीडिया", "media"), ("फोन", "phone"), ("ऑनलाइन", "online"), ("कंटेंट", "content"),
    ("क्रिएटर", "creator"), ("ब्रांड", "brand"), ("बिजनेस", "business"), ("मार्केटिंग", "marketing"),
    ("सेल्स", "sales"), ("क्लाइंट", "client"), ("कस्टमर", "customer"), ("प्रोडक्ट", "product"),
    ("सर्विस", "service"), ("कंपनी", "company"), ("जॉब", "job"), ("ऑफिस", "office"), ("बॉस", "boss"),
    ("टीम", "team"), ("प्लान", "plan"), ("गोल", "goal"), ("सक्सेस", "success"), ("मोटिवेशन", "motivation"),
    ("माइंड", "mind"), ("माइंडसेट", "mindset"), ("फोकस", "focus"), ("हैबिट", "habit"),
    ("रिलेशनशिप", "relationship"), ("पार्टनर", "partner"), ("फैमिली", "family"), ("फ्रेंड", "friend"),
    ("फ्रेंड्स", "friends"), ("स्कूल", "school"), ("कॉलेज", "college"), ("स्टूडेंट", "student"),
    ("एग्जाम", "exam"), ("ओके", "okay"), ("सॉरी", "sorry"), ("थैंक", "thank"), ("यू", "you"),
    ("प्लीज", "please"), ("हेलो", "hello"), ("हैलो", "hello"), ("गाइज", "guys"), ("बेस्ट", "best"),
    ("गुड", "good"), ("बैड", "bad"), ("नॉर्मल", "normal"), ("सिंपल", "simple"), ("रियल", "real"),
    ("रियली", "really"), ("सीरियस", "serious"), ("सीरियसली", "seriously"), ("पॉइंट", "point"),
    ("लेवल", "level"), ("एक्सपीरियंस", "experience"), ("नॉलेज", "knowledge"), ("स्किल", "skill"),
    ("स्किल्स", "skills"), ("बॉडी", "body"), ("हेल्थ", "health"), ("हिल्फ", "health"), ("हेल्फ", "health"), ("फिटनेस", "fitness"), ("जिम", "gym"),
    ("डाइट", "diet"), ("फूड", "food"), ("वॉटर", "water"), ("स्लीप", "sleep"), ("ब्रेन", "brain"),
    ("एनर्जी", "energy"), ("पावर", "power"), ("मनी", "money"), ("इन्वेस्ट", "invest"),
    ("इन्वेस्टमेंट", "investment"), ("सिस्टम", "system"), ("प्रोसेस", "process"), ("रिजल्ट", "result"),
    ("रिसर्च", "research"), ("साइंस", "science"), ("टॉपिक", "topic"), ("क्वेश्चन", "question"),
    ("आंसर", "answer"), ("ऑप्शन", "option"), ("सॉल्यूशन", "solution"), ("सुलूशन", "solution"), ("सलूशन", "solution"), ("सोल्यूशन", "solution"), ("इश्यू", "issue"),
    ("पेशेंट", "patient"), ("हॉस्पिटल", "hospital"), ("ट्रीटमेंट", "treatment"), ("सेशन", "session"),
    ("नेगेटिव", "negative"), ("पॉजिटिव", "positive"), ("इमोशन", "emotion"), ("इमोशनल", "emotional"),
    ("फीलिंग", "feeling"), ("फील", "feel"), ("ओवरथिंकिंग", "overthinking"), ("थिंक", "think"),
    ("कंट्रोल", "control"), ("बैलेंस", "balance"), ("एक्सरसाइज", "exercise"), ("मेडिटेशन", "meditation"),
    ("रूटीन", "routine"), ("डेली", "daily"), ("वीक", "week"), ("मंथ", "month"), ("चेंज", "change"),
    ("स्टार्ट", "start"), ("स्टॉप", "stop"), ("फिनिश", "finish"), ("फर्स्ट", "first"), ("लास्ट", "last"),
    ("नेक्स्ट", "next"), ("स्टेप", "step"), ("टिप्स", "tips"), ("फैक्ट", "fact"), ("फैक्ट्स", "facts"),
    ("एग्जांपल", "example"), ("एग्जाम्पल", "example"), ("केस", "case"), ("लिंक", "link"), ("बायो", "bio"),
    ("पोस्ट", "post"), ("रील", "reel"), ("रील्स", "reels"), ("इंस्टाग्राम", "Instagram"),
    ("यूट्यूब", "YouTube"), ("गूगल", "Google"), ("ऐप", "app"), ("वेबसाइट", "website"),
    ("इंटरनेट", "internet"),
    // Mental health and research words, in the spellings Whisper writes them
    ("मेंटल", "mental"), ("मैंटल", "mental"), ("सॉल्व", "solve"), ("सॉल्फ", "solve"), ("सोल्व", "solve"),
    ("पाकिस्तान", "Pakistan"), ("बेस्ड", "based"), ("रिकॉर्ड", "record"), ("रिकार्ड", "record"),
    ("इंजाइटी", "anxiety"), ("एंजाइटी", "anxiety"), ("पैनिक", "panic"), ("पेनिक", "panic"),
    ("अटैक", "attack"), ("अटेक", "attack"), ("रेशियो", "ratio"), ("रेशो", "ratio"),
    ("साइकेटरिक्स", "psychiatrist"), ("साइकेट्रिस्ट्स", "psychiatrists"), ("प्रेफर", "prefer"),
    ("प्रिफर", "prefer"), ("साइंटिस्ट", "scientist"), ("साइंटिस्ट्स", "scientists"),
    ("साइंटिस्स", "scientists"), ("रिकमेंडेशन", "recommendation"), ("रिकमेंडेशंस", "recommendations"),
    ("रेकमेंडेशन", "recommendation"), ("नेचर", "nature"), ("नेचुरल", "natural"),
    // Urdu words, including Whisper's usual mishearings of them
    ("मुताबिक", "mutabik"), ("मताबिक", "mutabik"), ("मताविक", "mutabik"), ("तवाजुन", "tawazun"),
    ("तोजन", "tawazun"), ("मुआशरे", "moarshre"), ("मआशरे", "moarshre"), ("मार्ष्रे", "moarshre"),
    ("मुआशरा", "moarshra"), ("टीक", "theek"), ("जायका", "zaiqa"), ("जाइका", "zaiqa"),
    ("जाइकाई", "zaiqa e"), ("खुराक", "khuraak"), ("पाते", "paate"), ("पाता", "paata"),
];

const NUKTA: char = '\u{093C}';
const VIRAMA: char = '\u{094D}';
const ANUSVARA: char = '\u{0902}';
const CHANDRABINDU: char = '\u{0901}';
const VISARGA: char = '\u{0903}';

fn is_devanagari(c: char) -> bool {
    ('\u{0900}'..='\u{097F}').contains(&c)
}

/// One spelling per word: precomposed nukta letters split into base + nukta,
/// nukta dropped (Whisper writes ज़/ज and फ़/फ interchangeably, so the
/// dictionary is keyed without it), chandrabindu folded into anusvara.
fn normalize(word: &str) -> String {
    let mut out = String::with_capacity(word.len());
    for c in word.chars() {
        match c {
            '\u{0958}' => out.push('क'),
            '\u{0959}' => out.push('ख'),
            '\u{095A}' => out.push('ग'),
            '\u{095B}' => out.push('ज'),
            '\u{095C}' => out.push('ड'),
            '\u{095D}' => out.push('ढ'),
            '\u{095E}' => out.push('फ'),
            '\u{095F}' => out.push('य'),
            NUKTA => {}
            CHANDRABINDU => out.push(ANUSVARA),
            _ => out.push(c),
        }
    }
    out
}

fn lexicon() -> &'static HashMap<String, &'static str> {
    static MAP: OnceLock<HashMap<String, &'static str>> = OnceLock::new();
    MAP.get_or_init(|| LEXICON.iter().map(|(k, v)| (normalize(k), *v)).collect())
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Vowel {
    Schwa,
    Deleted,
    None, // virama: a consonant in a cluster
    A,
    I,
    Ii,
    U,
    Uu,
    R,
    E,
    Ai,
    O,
    Au,
}

impl Vowel {
    fn is_long(self) -> bool {
        matches!(self, Vowel::A | Vowel::Ii | Vowel::Uu)
    }
    fn sounds(self) -> bool {
        !matches!(self, Vowel::Deleted | Vowel::None)
    }
}

#[derive(Clone, Debug)]
struct Unit {
    /// Consonant letters, or empty for an independent vowel.
    cons: &'static str,
    vowel: Vowel,
    nasal: bool,
    is_h: bool,
    is_v: bool,
}

impl Unit {
    fn is_consonant(&self) -> bool {
        !self.cons.is_empty()
    }
}

fn consonant(c: char, nukta: bool) -> Option<&'static str> {
    Some(match (c, nukta) {
        ('क', true) => "q",
        ('ख', true) => "kh",
        ('ग', true) => "gh",
        ('ज', true) => "z",
        ('ड', true) => "d",
        ('ढ', true) => "dh",
        ('फ', true) => "f",
        ('क', _) => "k",
        ('ख', _) => "kh",
        ('ग', _) => "g",
        ('घ', _) => "gh",
        ('ङ', _) => "n",
        ('च', _) => "ch",
        ('छ', _) => "chh",
        ('ज', _) => "j",
        ('झ', _) => "jh",
        ('ञ', _) => "n",
        ('ट', _) => "t",
        ('ठ', _) => "th",
        ('ड', _) => "d",
        ('ढ', _) => "dh",
        ('ण', _) => "n",
        ('त', _) => "t",
        ('थ', _) => "th",
        ('द', _) => "d",
        ('ध', _) => "dh",
        ('न', _) => "n",
        ('प', _) => "p",
        ('फ', _) => "ph",
        ('ब', _) => "b",
        ('भ', _) => "bh",
        ('म', _) => "m",
        ('य', _) => "y",
        ('र', _) => "r",
        ('ल', _) => "l",
        ('व', _) => "w",
        ('श', _) | ('ष', _) => "sh",
        ('स', _) => "s",
        ('ह', _) => "h",
        _ => return None,
    })
}

fn independent_vowel(c: char) -> Option<Vowel> {
    Some(match c {
        'अ' => Vowel::Schwa,
        'आ' => Vowel::A,
        'इ' => Vowel::I,
        'ई' => Vowel::Ii,
        'उ' => Vowel::U,
        'ऊ' => Vowel::Uu,
        'ऋ' => Vowel::R,
        'ए' | 'ऍ' | 'ऎ' => Vowel::E,
        'ऐ' => Vowel::Ai,
        'ओ' | 'ऑ' | 'ऒ' => Vowel::O,
        'औ' => Vowel::Au,
        _ => return None,
    })
}

fn matra(c: char) -> Option<Vowel> {
    Some(match c {
        'ा' => Vowel::A,
        'ि' => Vowel::I,
        'ी' => Vowel::Ii,
        'ु' => Vowel::U,
        'ू' => Vowel::Uu,
        'ृ' => Vowel::R,
        'े' | 'ॅ' | 'ॆ' => Vowel::E,
        'ै' => Vowel::Ai,
        'ो' | 'ॉ' | 'ॊ' => Vowel::O,
        'ौ' => Vowel::Au,
        _ => return None,
    })
}

/// Parse a run of Devanagari letters. Returns `None` for anything it does
/// not understand, so the caller can fall back to a plain letter map.
fn parse(word: &str) -> Option<Vec<Unit>> {
    let chars: Vec<char> = word.chars().collect();
    let mut units: Vec<Unit> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if let Some(v) = independent_vowel(c) {
            units.push(Unit { cons: "", vowel: v, nasal: false, is_h: false, is_v: false });
        } else if let Some(v) = matra(c) {
            let last = units.last_mut().filter(|u| u.is_consonant())?;
            last.vowel = v;
        } else if c == VIRAMA {
            let last = units.last_mut().filter(|u| u.is_consonant())?;
            last.vowel = Vowel::None;
        } else if c == ANUSVARA || c == CHANDRABINDU {
            units.last_mut()?.nasal = true;
        } else if c == NUKTA {
            // Handled together with its consonant below.
        } else {
            let nukta = chars.get(i + 1) == Some(&NUKTA);
            let cons = consonant(c, nukta)?;
            units.push(Unit { cons, vowel: Vowel::Schwa, nasal: false, is_h: c == 'ह', is_v: c == 'व' });
        }
        i += 1;
    }
    Some(units)
}

/// Hindi drops the inherent "a" at the end of a word and between a vowel and
/// a consonant-plus-vowel (`समझना` samajhna, not samajhana).
fn delete_schwas(units: &mut [Unit]) {
    let n = units.len();
    if n > 1 {
        let last = &mut units[n - 1];
        if last.is_consonant() && last.vowel == Vowel::Schwa && !last.nasal {
            last.vowel = Vowel::Deleted;
        }
    }
    if n < 3 {
        return;
    }
    for i in (1..n - 1).rev() {
        let candidate = &units[i];
        if !candidate.is_consonant() || candidate.vowel != Vowel::Schwa || candidate.nasal {
            continue;
        }
        let prev_sounds = units[i - 1].vowel.sounds();
        let next = &units[i + 1];
        let next_is_cv = next.is_consonant() && next.vowel.sounds();
        if prev_sounds && next_is_cv {
            units[i].vowel = Vowel::Deleted;
        }
    }
}

fn render(units: &[Unit]) -> String {
    let syllables = units.iter().filter(|u| u.vowel.sounds()).count();
    let mut out = String::new();
    let mut syllable = 0;
    for (i, unit) in units.iter().enumerate() {
        let next = units.get(i + 1);
        if unit.is_consonant() {
            let v_initial = unit.is_v
                && (i == 0 || units[i - 1].vowel.sounds())
                && matches!(unit.vowel, Vowel::I | Vowel::Ii | Vowel::E);
            out.push_str(if v_initial { "v" } else { unit.cons });
        }
        if !unit.vowel.sounds() {
            continue;
        }
        // A syllable is closed when the next consonant has no vowel of its own.
        let closed = next.is_some_and(|n| n.is_consonant() && !n.vowel.sounds());
        let more_follow = syllable + 1 < syllables;
        let after_vowel = !unit.is_consonant() && i > 0 && units[i - 1].vowel.sounds();
        let long = unit.vowel.is_long()
            && (closed || (syllable == 0 && (more_follow || unit.nasal)));
        let vowel = match unit.vowel {
            // "ah" before a consonant is written "eh": kehna, pehle, mehdood.
            Vowel::Schwa
                if next.is_some_and(|n| n.is_h && !n.vowel.sounds())
                    && i + 2 < units.len() =>
            {
                "e"
            }
            Vowel::Schwa => "a",
            Vowel::A => if long { "aa" } else { "a" },
            Vowel::I if after_vowel => "i",
            Vowel::I => "i",
            Vowel::Ii if after_vowel && !matches!(units[i - 1].vowel, Vowel::A) => "yi",
            Vowel::Ii => if long { "ee" } else { "i" },
            Vowel::U => "u",
            Vowel::Uu => if long { "oo" } else { "u" },
            Vowel::R => "ri",
            Vowel::E if after_vowel => "ye",
            Vowel::E if unit.nasal && i + 1 == units.len() => "ei",
            Vowel::E => "e",
            Vowel::Ai => "ai",
            Vowel::O => "o",
            Vowel::Au => "au",
            Vowel::Deleted | Vowel::None => "",
        };
        out.push_str(vowel);
        if unit.nasal {
            let labial = next.is_some_and(|n| matches!(n.cons, "p" | "ph" | "b" | "bh" | "m"));
            out.push(if labial { 'm' } else { 'n' });
        }
        syllable += 1;
    }
    out
}

/// Romanize one word of pure Devanagari letters.
fn romanize_letters(word: &str) -> String {
    let normalized = normalize(word);
    if let Some(known) = lexicon().get(&normalized) {
        return (*known).to_string();
    }
    match parse(word) {
        Some(mut units) => {
            delete_schwas(&mut units);
            render(&units)
        }
        None => word.to_string(),
    }
}

/// Romanize a whitespace-free chunk of text: Devanagari runs are converted,
/// Devanagari punctuation and digits are mapped, everything else is kept.
pub fn romanize_word(chunk: &str) -> String {
    let mut out = String::new();
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        if !run.is_empty() {
            out.push_str(&romanize_letters(run));
            run.clear();
        }
    };
    for c in chunk.chars() {
        match c {
            '।' | '॥' => {
                flush(&mut run, &mut out);
                out.push('.');
            }
            '\u{0966}'..='\u{096F}' => {
                flush(&mut run, &mut out);
                out.push(char::from(b'0' + (c as u32 - 0x0966) as u8));
            }
            VISARGA => {
                flush(&mut run, &mut out);
                out.push('h');
            }
            c if is_devanagari(c) => run.push(c),
            _ => {
                flush(&mut run, &mut out);
                out.push(c);
            }
        }
    }
    flush(&mut run, &mut out);
    out
}

/// Romanize running text, word by word.
pub fn romanize_text(text: &str) -> String {
    text.split_whitespace().map(romanize_word).collect::<Vec<_>>().join(" ")
}

fn capitalize(word: &mut String) {
    if let Some(first) = word.chars().next() {
        if first.is_lowercase() {
            let upper: String = first.to_uppercase().collect();
            word.replace_range(..first.len_utf8(), &upper);
        }
    }
}

fn ends_sentence(word: &str) -> bool {
    matches!(word.trim_end_matches(['"', '\'', ')']).chars().last(), Some('.' | '?' | '!'))
}

/// Romanize a segment in place. Whisper's Hindi word timings come as pieces
/// of a word (a new word starts with a space); the pieces are merged into one
/// timed word each so the whole word can be converted.
///
/// `sentence_start` says whether the previous segment ended a sentence (or
/// this is the first); Whisper's segments often split mid-sentence, so only
/// real sentence starts are capitalized. Returns whether this segment ends
/// one, to pass on to the next.
/// The conjunction "कि" is written "k" ("jaante hain k"), but Whisper also
/// splits "जबकि" into "जब कि", which reads as "jab ki".
fn keep_ki_after_jab(words: &mut [String]) {
    for i in 1..words.len() {
        if words[i - 1].eq_ignore_ascii_case("jab") && words[i].starts_with('k') && words[i].trim_end_matches(|c: char| !c.is_alphanumeric()) == "k" {
            words[i].replace_range(0..1, "ki");
        }
    }
}

pub fn romanize_segment(segment: &mut Segment, sentence_start: bool) -> bool {
    let Some(tokens) = segment.words.take() else {
        let mut words: Vec<String> = segment.text.split_whitespace().map(romanize_word).collect();
        keep_ki_after_jab(&mut words);
        let ends = capitalize_sentences(&mut words, sentence_start);
        segment.text = words.join(" ");
        return ends;
    };

    let mut merged: Vec<WordTimestamp> = Vec::new();
    let mut probabilities: Vec<Vec<f32>> = Vec::new();
    for token in tokens {
        let starts_word = token.text.starts_with(char::is_whitespace) || merged.is_empty();
        if starts_word {
            probabilities.push(token.probability.into_iter().collect());
            merged.push(WordTimestamp { text: token.text.trim().to_string(), ..token });
        } else if let Some(last) = merged.last_mut() {
            last.text.push_str(token.text.trim());
            last.end = last.end.max(token.end);
            if let (Some(p), Some(list)) = (token.probability, probabilities.last_mut()) {
                list.push(p);
            }
        }
    }

    let mut words: Vec<WordTimestamp> = Vec::new();
    for (mut word, probs) in merged.into_iter().zip(probabilities) {
        let roman = romanize_text(&word.text);
        if roman.is_empty() {
            continue;
        }
        word.probability = (!probs.is_empty()).then(|| probs.iter().sum::<f32>() / probs.len() as f32);
        // Punctuation on its own (a converted "।") belongs to the word before.
        if !roman.chars().any(char::is_alphanumeric) {
            if let Some(prev) = words.last_mut() {
                prev.text.push_str(&roman);
                prev.end = prev.end.max(word.end);
                continue;
            }
        }
        word.text = roman;
        words.push(word);
    }

    let mut texts: Vec<String> = words.iter().map(|w| w.text.clone()).collect();
    keep_ki_after_jab(&mut texts);
    let ends = capitalize_sentences(&mut texts, sentence_start);
    // Every word keeps Whisper's leading space, the first one included: the
    // formatter joins words across segments by it.
    for (word, text) in words.iter_mut().zip(texts.iter()) {
        word.text = format!(" {text}");
    }
    segment.text = texts.join(" ");
    segment.words = Some(words);
    ends
}

/// Romanize a whole transcript, carrying sentence starts across segments.
pub fn romanize_segments(segments: &mut [Segment]) {
    let mut sentence_start = true;
    for segment in segments.iter_mut() {
        sentence_start = romanize_segment(segment, sentence_start);
    }
}

fn capitalize_sentences(words: &mut [String], sentence_start: bool) -> bool {
    let mut start = sentence_start;
    for word in words.iter_mut() {
        if start {
            capitalize(word);
        }
        start = ends_sentence(word);
    }
    start
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(text: &str) -> String {
        romanize_text(text)
    }

    #[test]
    fn everyday_words_use_common_spellings() {
        assert_eq!(r("और इसका हल नहीं है"), "aur iska hal nahi hai");
        assert_eq!(r("जबकि वह कहते हैं क्योंकि"), "jabki woh kehte hain kyunki");
        assert_eq!(r("प्रॉब्लम जस्ट प्रोफेशनल"), "problem just professional");
    }

    #[test]
    fn english_and_urdu_words_follow_the_users_corrections() {
        assert_eq!(r("आपके दिमागी तोजन पर"), "aapke dimaghi tawazun par");
        assert_eq!(r("हमारे मार्ष्रे में मैंटल हिल्फ का टीक ना होना"), "hamare moarshre mein mental health ka theek na hona");
        assert_eq!(r("सॉल्फ ना करने की वज़ा से पाकिस्तान"), "solve na karne ki waja se Pakistan");
        assert_eq!(r("रिकॉर्ड के मताबिक इंजाइटी और पेनिक अटेक"), "record ke mutabik anxiety aur panic attack");
        assert_eq!(r("साइकेटरिक्स की तरफ प्रेफर"), "psychiatrist ki taraf prefer");
        assert_eq!(r("सुलूशन साइंटिस्स रिकमेंडेशन नेचर"), "solution scientists recommendation nature");
        assert_eq!(r("जानते हैं कि आपका"), "jaante hain k aapka");
        let mut words: Vec<String> = ["jab", "k,"].map(String::from).to_vec();
        keep_ki_after_jab(&mut words);
        assert_eq!(words, ["jab", "ki,"]);
    }

    #[test]
    fn nukta_and_chandrabindu_variants_match_the_dictionary() {
        assert_eq!(r("ज़्यादा ज़िंदगी हूँ"), "zyada zindagi hoon");
    }

    #[test]
    fn inherent_a_is_dropped_like_speech() {
        assert_eq!(r("समझना"), "samajhna");
        assert_eq!(r("हमला"), "hamla");
        assert_eq!(r("लेकर"), "lekar");
        assert_eq!(r("अपनों"), "apnon");
        assert_eq!(r("मुश्किलें"), "mushkilein");
    }

    #[test]
    fn ah_before_a_consonant_becomes_eh() {
        assert_eq!(r("महसूस"), "mehsoos");
        assert_eq!(r("पहचान"), "pehchaan");
        assert_eq!(r("सुबह"), "subah");
    }

    #[test]
    fn long_vowels_double_where_hinglish_doubles_them() {
        assert_eq!(r("बातचीत"), "baatcheet");
        assert_eq!(r("कहानी"), "kahani");
        assert_eq!(r("ढूंढते"), "dhoondhte");
        assert_eq!(r("दरवाज़ा"), "darwaza");
        assert_eq!(r("हाँ"), "haan");
    }

    #[test]
    fn vowels_after_vowels_glide() {
        assert_eq!(r("दिए"), "diye");
        assert_eq!(r("आइए"), "aaiye");
    }

    #[test]
    fn nukta_letters_and_w() {
        assert_eq!(r("ग़ुस्सा"), "ghussa");
        assert_eq!(r("फ़ैसला"), "faisla");
        assert_eq!(r("विश्वास"), "vishwaas");
        assert_eq!(r("वादा"), "waada");
    }

    #[test]
    fn non_devanagari_and_punctuation_pass_through() {
        assert_eq!(r("hello, दोस्तों।"), "hello, doston.");
        assert_eq!(r("२०२६"), "2026");
    }

    fn token(text: &str, start: f64, end: f64) -> WordTimestamp {
        WordTimestamp { text: text.into(), start, end, probability: Some(0.5) }
    }

    #[test]
    fn segment_pieces_merge_into_timed_words() {
        let mut seg = Segment {
            start: 0.0,
            end: 2.0,
            text: "इसी के लिए।".into(),
            words: Some(vec![
                token(" इ", 0.0, 0.1),
                token("स", 0.1, 0.2),
                token("ी", 0.2, 0.3),
                token(" के", 0.3, 0.5),
                token(" ल", 0.5, 0.6),
                token("िए", 0.6, 0.8),
                token("।", 0.8, 0.9),
            ]),
            speaker_id: None,
        };
        assert!(romanize_segment(&mut seg, true));
        assert_eq!(seg.text, "Isi ke liye.");
        let words = seg.words.unwrap();
        let texts: Vec<&str> = words.iter().map(|w| w.text.as_str()).collect();
        assert_eq!(texts, [" Isi", " ke", " liye."]);
        assert_eq!((words[0].start, words[0].end), (0.0, 0.3));
        assert_eq!((words[2].start, words[2].end), (0.5, 0.9));
    }

    #[test]
    fn sentences_start_with_a_capital() {
        let seg = |text: &str| Segment { start: 0.0, end: 1.0, text: text.into(), words: None, speaker_id: None };
        let mut segments = vec![seg("हाँ। ठीक है"), seg("और यह"), seg("बात है।"), seg("फिर")];
        romanize_segments(&mut segments);
        let texts: Vec<&str> = segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, ["Haan. Theek hai", "aur yeh", "baat hai.", "Phir"]);
    }
}
