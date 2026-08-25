/**
 * JubileeVerse — Site-Wide Translation
 *
 * Include this script on any page to auto-translate UI elements
 * when the user has selected a non-English language via the lang-panel on the homepage.
 *
 * Reads `siteLang` from localStorage, collects visible text from common selectors,
 * calls /api/translate-batch, and applies translations.
 * Caches results in localStorage with prefix `jv_pg_`.
 */
(function () {
    'use strict';

    const CACHE_PREFIX = 'jv_pg_';
    const savedLang = localStorage.getItem('siteLang') || 'en-US';

    // Skip if English
    if (!savedLang || savedLang.startsWith('en')) return;

    // Language name lookup (subset — full list lives on homepage)
    const LANG_NAMES = {
        'af-ZA': 'Afrikaans', 'sq-AL': 'Albanian', 'am-ET': 'Amharic',
        'ar-EG': 'Arabic (Egypt)', 'ar-SA': 'Arabic (Saudi Arabia)', 'ar-AE': 'Arabic (UAE)',
        'hy-AM': 'Armenian', 'az-AZ': 'Azerbaijani', 'bn-BD': 'Bengali',
        'bs-BA': 'Bosnian', 'bg-BG': 'Bulgarian', 'my-MM': 'Burmese',
        'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)',
        'hr-HR': 'Croatian', 'cs-CZ': 'Czech', 'da-DK': 'Danish',
        'nl-NL': 'Dutch', 'et-EE': 'Estonian', 'fil-PH': 'Filipino',
        'fi-FI': 'Finnish', 'fr-FR': 'French (France)', 'fr-CA': 'French (Canada)',
        'ka-GE': 'Georgian', 'de-DE': 'German', 'el-GR': 'Greek',
        'gu-IN': 'Gujarati', 'he-IL': 'Hebrew', 'hi-IN': 'Hindi',
        'hu-HU': 'Hungarian', 'is-IS': 'Icelandic', 'id-ID': 'Indonesian',
        'it-IT': 'Italian', 'ja-JP': 'Japanese', 'kn-IN': 'Kannada',
        'kk-KZ': 'Kazakh', 'km-KH': 'Khmer', 'ko-KR': 'Korean',
        'lo-LA': 'Lao', 'lv-LV': 'Latvian', 'lt-LT': 'Lithuanian',
        'mk-MK': 'Macedonian', 'ms-MY': 'Malay', 'ml-IN': 'Malayalam',
        'mr-IN': 'Marathi', 'mn-MN': 'Mongolian', 'ne-NP': 'Nepali',
        'nb-NO': 'Norwegian', 'fa-IR': 'Persian (Farsi)', 'pl-PL': 'Polish',
        'pt-BR': 'Portuguese (Brazil)', 'pt-PT': 'Portuguese (Portugal)',
        'pa-IN': 'Punjabi', 'ro-RO': 'Romanian', 'ru-RU': 'Russian',
        'sr-RS': 'Serbian', 'si-LK': 'Sinhala', 'sk-SK': 'Slovak',
        'sl-SI': 'Slovenian', 'so-SO': 'Somali',
        'es-MX': 'Spanish (Mexico)', 'es-ES': 'Spanish (Spain)', 'es-US': 'Spanish (United States)',
        'es-CO': 'Spanish (Colombia)', 'es-AR': 'Spanish (Argentina)',
        'sw-KE': 'Swahili', 'sv-SE': 'Swedish',
        'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'th-TH': 'Thai',
        'tr-TR': 'Turkish', 'uk-UA': 'Ukrainian',
        'ur-PK': 'Urdu (Pakistan)', 'ur-IN': 'Urdu (India)',
        'uz-UZ': 'Uzbek', 'vi-VN': 'Vietnamese', 'cy-GB': 'Welsh', 'zu-ZA': 'Zulu'
    };

    // Generic selectors that work across all pages (nav, footer, buttons, headings, labels)
    var SELECTORS = [
        { sel: '.nav-menu > .nav-link', prop: 'textContent' },
        { sel: '.nav-menu > .mobile-media-link', prop: 'textContent' },
        { sel: '.header-media-links > a', prop: 'textContent' },
        { sel: '#signInBtn', prop: 'textContent' },
        { sel: '#searchBtn', prop: 'textContent' },
        { sel: '#searchInput', prop: 'placeholder' },
        { sel: '.footer-section h4', prop: 'textContent' },
        { sel: '.footer-links a', prop: 'textContent' },
        { sel: '.footer-bottom p', prop: 'innerHTML' },
        // Page-specific headings and labels
        { sel: 'h1', prop: 'textContent' },
        { sel: 'h2', prop: 'textContent' },
        { sel: 'h3.widget-title', prop: 'textContent' },
        { sel: '.sidebar-widget label', prop: 'textContent' },
        { sel: '.btn', prop: 'textContent' },
        { sel: 'button[type="submit"]', prop: 'textContent' },
    ];

    // Common UI strings that appear in JS-generated content
    var TEMPLATE_STRINGS = [
        'HOME', 'DEVOTIONALS', 'SERMONS', 'FAITH', 'FAMILY', 'COMMUNITY', 'ENCOURAGEMENT',
        'PRAYER', 'MUSIC', 'RADIO', 'AI BIBLE CHAT',
        'Prayer', 'Music', 'Radio', 'AI Bible Chat',
        'Sign In', 'Sign Out', 'Profile Settings', 'Search good news...',
        'About', 'Categories', 'Resources', 'Connect',
        'About Us', 'Our Team', 'Our Mission', 'Contact',
        'Devotionals', 'Sermons', 'Faith Stories', 'Community',
        'Bible Study', 'Prayer Requests', 'Podcasts', 'Videos',
        'Facebook', 'Twitter', 'Instagram', 'YouTube',
        'Languages', 'Search languages...', 'No languages found',
    ];

    function getLangName(code) {
        if (LANG_NAMES[code]) return LANG_NAMES[code];
        // Try base language match (e.g., ar-DZ → ar-EG)
        var base = code.split('-')[0];
        for (var key in LANG_NAMES) {
            if (key.startsWith(base + '-')) return LANG_NAMES[key];
        }
        return code;
    }

    function getCache(lang) {
        try {
            var raw = localStorage.getItem(CACHE_PREFIX + lang);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function setCache(lang, map) {
        try {
            localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify({ map: map, ts: Date.now() }));
        } catch (e) {
            // localStorage full — evict oldest
            try {
                var keys = [];
                for (var i = 0; i < localStorage.length; i++) {
                    var k = localStorage.key(i);
                    if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
                }
                if (keys.length > 10) {
                    keys.sort();
                    localStorage.removeItem(keys[0]);
                    localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify({ map: map, ts: Date.now() }));
                }
            } catch (e2) {}
        }
    }

    function collectElements() {
        var items = [];
        SELECTORS.forEach(function (s) {
            document.querySelectorAll(s.sel).forEach(function (el) {
                var text = s.prop === 'placeholder' ? el.placeholder :
                           s.prop === 'innerHTML' ? el.innerHTML.trim() :
                           el.textContent.trim();
                if (text && text.length > 0 && text.length < 500) {
                    items.push({ el: el, prop: s.prop, text: text });
                }
            });
        });
        return items;
    }

    function applyTranslations(items, map) {
        items.forEach(function (item) {
            var tr = map[item.text];
            if (!tr) return;
            if (item.prop === 'placeholder') {
                item.el.placeholder = tr;
            } else if (item.prop === 'innerHTML') {
                item.el.innerHTML = tr;
            } else {
                item.el.textContent = tr;
            }
        });

        // Profile dropdown text nodes (SVG + text pattern)
        var profileSettings = document.getElementById('profileSettingsLink');
        if (profileSettings && map['Profile Settings']) {
            var nodes = Array.from(profileSettings.childNodes).filter(function (n) { return n.nodeType === 3; });
            var last = nodes[nodes.length - 1];
            if (last) last.textContent = ' ' + map['Profile Settings'] + ' ';
        }
        var profileSignOut = document.getElementById('profileSignOut');
        if (profileSignOut && map['Sign Out']) {
            var nodes2 = Array.from(profileSignOut.childNodes).filter(function (n) { return n.nodeType === 3; });
            var last2 = nodes2[nodes2.length - 1];
            if (last2) last2.textContent = ' ' + map['Sign Out'] + ' ';
        }
    }

    async function translatePage() {
        var langName = getLangName(savedLang);

        // Collect visible text
        var items = collectElements();
        var textSet = new Set(TEMPLATE_STRINGS);
        items.forEach(function (item) { textSet.add(item.text); });
        var allTexts = Array.from(textSet).filter(function (t) { return t && t.trim(); });

        if (allTexts.length === 0) return;

        // Check cache first
        var cached = getCache(savedLang);
        if (cached && cached.map && Object.keys(cached.map).length > 5) {
            applyTranslations(items, cached.map);
            return;
        }

        // Call API in chunks of 80
        var CHUNK = 80;
        var translationMap = {};

        try {
            for (var i = 0; i < allTexts.length; i += CHUNK) {
                var chunk = allTexts.slice(i, i + CHUNK);
                var resp = await fetch('/api/translate-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts: chunk, targetLang: savedLang, targetLangName: langName })
                });
                if (!resp.ok) continue;
                var data = await resp.json();
                Object.assign(translationMap, data.translations || {});
            }

            if (Object.keys(translationMap).length > 0) {
                applyTranslations(items, translationMap);
                setCache(savedLang, translationMap);
            }
        } catch (e) {
            console.warn('[SiteTranslate] Translation error:', e.message);
        }
    }

    // Wait for DOM to be ready, then translate
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(translatePage, 300);
        });
    } else {
        setTimeout(translatePage, 300);
    }
})();
