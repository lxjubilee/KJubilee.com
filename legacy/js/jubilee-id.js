/* ─────────────────────────────────────────────────────────────────────────
   The Jubilee ID door — one email-first screen behind /login, /signin and
   /signup.

   Screen 1 asks for an email and nothing else. The email is looked up at the
   Jubilee ID authority and the person is routed to one of three outcomes:

     A  welcome       has a Jubilee ID and already uses kJubilee
                      → password → signed in.
     B  confirm       has a Jubilee ID but is new to kJubilee
        createlinked  → confirm the Jubilee ID password, then a VISIBLE
                      Create Account screen. We never link silently: a person
                      who owns a Jubilee ID still watches their kJubilee
                      account get created, which is what pairs with the
                      in-app deletion path the app stores require.
     C  form          no Jubilee ID at all → create the Jubilee ID and the
                      kJubilee account together, in one motion.

   A Jubilee ID *is* a verified email address, so nothing in this flow asks
   anyone to check their inbox.

   Ported from JubileeInspire.com's JubileeIdDoor.tsx, wearing kJubilee's own
   design (see /css/jubilee-id.css). Server side: /api/sso/* in server.js.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    var SITE_NAME = 'kJubilee';
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // A Jubilee ID password is reset at the authority that holds it, not here.
    // kJubilee stores no password for a Jubilee ID account, so a local reset
    // page would have nothing to reset.
    var FORGOT_URL = 'https://www.jubileeinspire.com/forgot-password';

    var TERMS_URL = '/terms.html';
    var PRIVACY_URL = '/privacy.html';

    // ── State ────────────────────────────────────────────────────────────
    var params = new URLSearchParams(window.location.search);
    var returnUrl = params.get('redirect') || params.get('next') || params.get('returnTo') || '/';

    var state = {
        step: 'email',            // email | welcome | confirm | createlinked | form | success
        email: (params.get('email') || '').trim(),
        firstName: '',
        lastName: '',
        dob: '',
        password: '',             // Outcome C only — create a password
        existingPassword: '',     // the Jubilee ID password (2A / 2B-1)
        rememberMe: true,
        error: '',
        loading: false,
        createdAccount: false,    // success screen wording
    };

    // Only same-origin, root-relative paths are followed, so a crafted
    // ?redirect= cannot bounce someone off the site after they sign in.
    function safeReturnUrl() {
        if (!returnUrl || returnUrl.charAt(0) !== '/' || returnUrl.charAt(1) === '/') return '/';
        return returnUrl;
    }

    // ── Small helpers ────────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function calcStrength(pw) {
        var score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^a-zA-Z0-9]/.test(pw)) score++;
        if (score <= 2) return 'weak';
        if (score <= 4) return 'fair';
        return 'strong';
    }
    var STRENGTH_LABEL = { weak: 'Weak password', fair: 'Fair password', strong: 'Strong password' };

    // Mirrored server-side in /api/sso/*, so this is a courtesy, not the gate.
    function validateDob(dob) {
        if (!dob) return 'Please enter your date of birth.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Date of birth must be a valid date.';
        var d = new Date(dob + 'T00:00:00Z');
        if (isNaN(d.getTime())) return 'Date of birth is not a valid date.';
        var now = new Date();
        if (d > now) return 'Date of birth cannot be in the future.';
        var thirteen = new Date(Date.UTC(now.getUTCFullYear() - 13, now.getUTCMonth(), now.getUTCDate()));
        if (d > thirteen) return 'Accounts require a minimum age of 13.';
        return null;
    }

    var EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYE_CLOSED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    // ── Session storage ──────────────────────────────────────────────────
    // The rest of the site reads `jubileeVerseAuth` (radio.html, music.html)
    // and `jv_auth` (index.html) out of localStorage, so both are written
    // there whatever the toggle says — writing to sessionStorage instead would
    // leave someone signed in on this page and signed out on every other one.
    //
    // "Keep me signed in on this device" is enforced where it actually counts:
    // the server mints a 30-day token when it is on and a short one when it is
    // off (see issueSession in lib/local-account.js).
    function storeAuth(data) {
        try {
            var payload = { token: data.token, user: data.user, expiresAt: data.expiresAt };
            localStorage.setItem('jv_auth', JSON.stringify({
                token: data.token, user: data.user, ts: Date.now(),
            }));
            localStorage.setItem('jubileeVerseAuth', JSON.stringify({
                authenticated: true, token: data.token, user: data.user, expiresAt: data.expiresAt,
            }));
            return payload;
        } catch (e) {
            // Private mode with storage blocked. The person is signed in for
            // this page load; say so rather than failing silently.
            console.warn('[jubilee-id] could not persist the session:', e && e.message);
            return null;
        }
    }

    async function postJson(url, body) {
        var res;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch (e) {
            return { status: 0, data: {} };
        }
        var data = {};
        try { data = await res.json(); } catch (e) { /* empty body */ }
        return { status: res.status, ok: res.ok, data: data };
    }

    // ── Rendering ────────────────────────────────────────────────────────
    var mount = null;

    function alertHtml() {
        return '<div class="auth-alert auth-alert--error" id="doorError" role="alert" ' +
               (state.error ? '' : 'style="display:none"') + '>' + esc(state.error) + '</div>';
    }

    // The read-only email plus "Use a different email", shared by 2A / 2B-1 / 2C.
    function accountRowHtml() {
        return '<div class="account-row">' +
                 '<span class="account-email" title="' + esc(state.email) + '">' + esc(state.email) + '</span>' +
                 '<button type="button" class="use-different" id="useDifferent">Use a different email</button>' +
               '</div>';
    }

    function passwordFieldHtml(id, label, autocomplete, value) {
        return '<div class="input-group">' +
                 '<div class="password-wrapper">' +
                   '<input type="password" id="' + id + '" placeholder=" " required ' +
                          'autocomplete="' + autocomplete + '" value="' + esc(value || '') + '">' +
                   '<label for="' + id + '">' + esc(label) + '</label>' +
                   '<button type="button" class="password-toggle" data-toggle="' + id + '" ' +
                           'aria-label="Show password" tabindex="-1">' + EYE_OPEN + '</button>' +
                 '</div>' +
               '</div>';
    }

    function nameFieldsHtml() {
        return '<div class="form-row">' +
                 '<div class="input-group">' +
                   '<input type="text" id="firstName" placeholder=" " maxlength="50" autocomplete="given-name" value="' + esc(state.firstName) + '">' +
                   '<label for="firstName">First name</label>' +
                 '</div>' +
                 '<div class="input-group">' +
                   '<input type="text" id="lastName" placeholder=" " maxlength="50" autocomplete="family-name" value="' + esc(state.lastName) + '">' +
                   '<label for="lastName">Last name</label>' +
                 '</div>' +
               '</div>';
    }

    function dobFieldHtml() {
        // A date input never shows a placeholder, so its label is parked up.
        return '<div class="input-group date-field label-up">' +
                 '<input type="date" id="dob" placeholder=" " autocomplete="bday" max="9999-12-31" value="' + esc(state.dob) + '">' +
                 '<label for="dob">Date of birth</label>' +
               '</div>';
    }

    function rememberRowHtml() {
        return '<div class="remember-row">' +
                 '<label class="checkbox-wrapper">' +
                   '<input type="checkbox" id="rememberMe"' + (state.rememberMe ? ' checked' : '') + '>' +
                   '<span>Keep me signed in on this device</span>' +
                 '</label>' +
               '</div>';
    }

    function submitBtnHtml(label, id) {
        return '<button type="submit" class="btn-primary" id="' + (id || 'submitBtn') + '">' + esc(label) + '</button>';
    }

    function forgotRowHtml() {
        return '<div class="forgot-row">' +
                 '<a class="forgot-link" href="' + FORGOT_URL + '?email=' + encodeURIComponent(state.email) +
                 '" target="_blank" rel="noopener noreferrer">Forgot your password?</a>' +
               '</div>';
    }

    function screenHtml() {
        switch (state.step) {

        // ── Screen 1: the one door — email only ──────────────────────────
        case 'email':
            return '<h1 class="door-heading">Sign in with your Jubilee ID</h1>' +
                   '<p class="door-helper">One Jubilee ID works across all our sites</p>' +
                   alertHtml() +
                   '<form id="doorForm" novalidate>' +
                     '<div class="input-group">' +
                       '<input type="email" id="email" placeholder=" " required maxlength="254" ' +
                              'autocomplete="email" autofocus value="' + esc(state.email) + '">' +
                       '<label for="email">Email address</label>' +
                     '</div>' +
                     submitBtnHtml('Continue') +
                     '<p class="door-disclaimer">No account yet? We&rsquo;ll set one up for you.</p>' +
                   '</form>';

        // ── Screen 2A: Welcome back (returning listener) ─────────────────
        case 'welcome':
            return '<h1 class="door-heading">Welcome back</h1>' +
                   alertHtml() +
                   accountRowHtml() +
                   '<form id="doorForm" novalidate>' +
                     passwordFieldHtml('existingPassword', 'Password', 'current-password', state.existingPassword) +
                     forgotRowHtml() +
                     submitBtnHtml('Continue') +
                   '</form>';

        // ── Screen 2B-1: Confirm it's you ───────────────────────────────
        case 'confirm':
            return '<h1 class="door-heading">Confirm it&rsquo;s you</h1>' +
                   '<p class="door-subtext">This email already has a Jubilee ID. Enter your password to continue and create your account on ' + esc(SITE_NAME) + '.</p>' +
                   alertHtml() +
                   accountRowHtml() +
                   '<form id="doorForm" novalidate>' +
                     passwordFieldHtml('existingPassword', 'Jubilee ID password', 'current-password', state.existingPassword) +
                     forgotRowHtml() +
                     submitBtnHtml('Continue') +
                   '</form>';

        // ── Screen 2B-2: Create your kJubilee account (no password) ──────
        case 'createlinked':
            return '<h1 class="door-heading">Create your ' + esc(SITE_NAME) + ' account</h1>' +
                   '<p class="door-subtext">Your Jubilee ID is confirmed. Add a few details to finish creating your account here.</p>' +
                   alertHtml() +
                   '<form id="doorForm" novalidate>' +
                     nameFieldsHtml() +
                     dobFieldHtml() +
                     rememberRowHtml() +
                     submitBtnHtml('Create Account') +
                   '</form>' +
                   '<div class="back-link"><button type="button" id="useDifferent">Use a different email</button></div>';

        // ── Screen 2C: Let's create your Jubilee ID ─────────────────────
        case 'form':
            return '<h1 class="door-heading">Let&rsquo;s create your Jubilee ID</h1>' +
                   '<p class="door-subtext">One account gives you access to ' + esc(SITE_NAME) + ' and everything else across Jubilee. It only takes a moment.</p>' +
                   alertHtml() +
                   accountRowHtml() +
                   '<form id="doorForm" novalidate>' +
                     nameFieldsHtml() +
                     dobFieldHtml() +
                     '<div class="input-group">' +
                       '<div class="password-wrapper">' +
                         '<input type="password" id="password" placeholder=" " required minlength="8" ' +
                                'autocomplete="new-password" value="' + esc(state.password) + '">' +
                         '<label for="password">Create a password</label>' +
                         '<button type="button" class="password-toggle" data-toggle="password" aria-label="Show password" tabindex="-1">' + EYE_OPEN + '</button>' +
                       '</div>' +
                       '<div id="pwFeedback"><div class="password-hint">At least 8 characters</div></div>' +
                     '</div>' +
                     rememberRowHtml() +
                     '<p class="consent-line">By continuing, you agree to our ' +
                       '<a href="' + TERMS_URL + '" target="_blank" rel="noopener noreferrer">Terms of Service</a> and ' +
                       '<a href="' + PRIVACY_URL + '" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.' +
                     '</p>' +
                     submitBtnHtml('Create my Jubilee ID') +
                   '</form>';

        // ── Success ─────────────────────────────────────────────────────
        case 'success':
            return '<div class="success-state">' +
                     '<div class="success-icon-circle">' +
                       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                         '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' +
                       '</svg>' +
                     '</div>' +
                     '<h2>You&rsquo;re all set!</h2>' +
                     '<p>Welcome to ' + esc(SITE_NAME) + '. Your account is ready &mdash; the dial is waiting.</p>' +
                     '<button type="button" class="btn-primary" id="getStarted">Start listening</button>' +
                   '</div>';
        }
        return '';
    }

    function render() {
        mount.innerHTML = screenHtml();
        wire();
        var first = mount.querySelector('input:not([type=checkbox]):not([readonly])');
        if (first && state.step !== 'success') {
            // Screen 1 keeps a carried-over email focused at the end of the
            // text rather than selecting it.
            try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
        }
    }

    function setError(msg) {
        state.error = msg || '';
        var el = document.getElementById('doorError');
        if (!el) return;
        el.textContent = state.error;
        el.style.display = state.error ? '' : 'none';
    }

    function setLoading(on, label) {
        state.loading = on;
        var btn = mount.querySelector('.btn-primary[type=submit]');
        if (!btn) return;
        btn.disabled = on;
        btn.innerHTML = on ? '<span class="spinner"></span>' + esc(label || 'Working…') : esc(btn.dataset.label || btn.textContent);
    }

    function goto(step) {
        state.step = step;
        state.error = '';
        render();
    }

    function useDifferentEmail() {
        state.existingPassword = '';
        state.password = '';
        state.firstName = '';
        state.lastName = '';
        state.dob = '';
        goto('email');
    }

    // ── Event wiring ─────────────────────────────────────────────────────
    function wire() {
        var form = document.getElementById('doorForm');
        if (form) {
            // Remember each button's resting label so the spinner can be undone.
            var btn = form.querySelector('.btn-primary[type=submit]');
            if (btn) btn.dataset.label = btn.textContent;
            form.addEventListener('submit', onSubmit);
        }

        mount.querySelectorAll('#useDifferent').forEach(function (b) {
            b.addEventListener('click', useDifferentEmail);
        });

        mount.querySelectorAll('.password-toggle').forEach(function (b) {
            b.addEventListener('click', function () {
                var input = document.getElementById(b.dataset.toggle);
                if (!input) return;
                var hidden = input.type === 'password';
                input.type = hidden ? 'text' : 'password';
                b.innerHTML = hidden ? EYE_CLOSED : EYE_OPEN;
                b.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
            });
        });

        // Keep state in step with the fields, so moving between screens and
        // back does not lose what was typed.
        bind('email', 'email');
        bind('firstName', 'firstName');
        bind('lastName', 'lastName');
        bind('dob', 'dob');
        bind('existingPassword', 'existingPassword');
        bind('password', 'password', onPasswordInput);

        var remember = document.getElementById('rememberMe');
        if (remember) {
            remember.addEventListener('change', function () { state.rememberMe = remember.checked; });
        }

        var started = document.getElementById('getStarted');
        if (started) started.addEventListener('click', function () { window.location.href = safeReturnUrl(); });
    }

    function bind(id, key, extra) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', function () {
            state[key] = el.value;
            if (extra) extra(el.value);
        });
    }

    function onPasswordInput(value) {
        var box = document.getElementById('pwFeedback');
        if (!box) return;
        if (!value) {
            box.innerHTML = '<div class="password-hint">At least 8 characters</div>';
            return;
        }
        var s = calcStrength(value);
        box.innerHTML = '<div class="password-strength">' +
                          '<div class="strength-bar"><div class="strength-fill ' + s + '"></div></div>' +
                          '<div class="strength-text ' + s + '">' + STRENGTH_LABEL[s] + '</div>' +
                        '</div>';
    }

    // ── Submit handlers, one per screen ──────────────────────────────────
    function onSubmit(e) {
        e.preventDefault();
        if (state.loading) return;
        switch (state.step) {
        case 'email':        return handleEmailContinue();
        case 'welcome':      return handleWelcomePassword();
        case 'confirm':      return handleConfirmPassword();
        case 'createlinked': return handleCreateLinked();
        case 'form':         return handleCreateJubileeId();
        }
    }

    // Screen 1 → look the email up, then route to A, B or C.
    async function handleEmailContinue() {
        var addr = (state.email || '').trim();
        if (!addr) return setError('Please enter your email address to continue.');
        if (!EMAIL_RE.test(addr)) return setError('That does not look like a complete email address. Please check it.');

        state.email = addr;
        setError('');
        setLoading(true, 'Checking…');
        var r = await postJson('/api/sso/signup/lookup', { email: addr });
        setLoading(false);

        if (!r.ok || !r.data.success) {
            return setError(r.data.error || 'We are having trouble reaching your account right now. Please try again in a moment.');
        }
        if (r.data.existsLocally) return goto('welcome');       // Outcome A
        if (r.data.existsInSso) return goto('confirm');         // Outcome B
        return goto('form');                                    // Outcome C
    }

    // Outcome A — verify the password and sign in.
    async function handleWelcomePassword() {
        if (!state.existingPassword) return setError('Please enter your password.');
        setError('');
        setLoading(true, 'Signing in…');
        var r = await postJson('/api/sso/login', {
            email: state.email, password: state.existingPassword, rememberMe: state.rememberMe,
        });
        setLoading(false);

        if (r.data.success && r.data.token) {
            storeAuth(r.data);
            window.location.href = safeReturnUrl();
            return;
        }
        // An account that turns out to be new here after all — carry on to 2B-2
        // rather than dead-ending on a password that was in fact correct.
        if (r.data.redirect === 'signup-existing') return applyPrefill(r.data);
        setError(r.data.error || 'That password does not match. Try again, or reset it below.');
    }

    // Outcome B, first screen — confirm the Jubilee ID password. On success the
    // password is kept in memory only, so the Create Account screen can prove
    // ownership again when it actually creates the row.
    async function handleConfirmPassword() {
        if (!state.existingPassword) return setError('Please enter your password.');
        setError('');
        setLoading(true, 'Checking…');
        var r = await postJson('/api/sso/login', {
            email: state.email, password: state.existingPassword, rememberMe: state.rememberMe,
        });
        setLoading(false);

        if (r.data.redirect === 'signup-existing') return applyPrefill(r.data);
        // Edge: an account here already exists, so just sign in.
        if (r.data.success && r.data.token) {
            storeAuth(r.data);
            window.location.href = safeReturnUrl();
            return;
        }
        setError(r.data.error || 'That password does not match. Try again, or reset it below.');
    }

    // Whatever the Jubilee ID already knows is pre-filled and stays editable,
    // so nobody retypes what we have on file.
    function applyPrefill(data) {
        if (data.first_name) state.firstName = data.first_name;
        if (data.last_name) state.lastName = data.last_name;
        if (data.date_of_birth) state.dob = String(data.date_of_birth).slice(0, 10);
        goto('createlinked');
    }

    // Outcome B, second screen — the visible account creation.
    async function handleCreateLinked() {
        if (!state.firstName.trim() || !state.lastName.trim()) {
            return setError('Please enter your first and last name.');
        }
        if (state.dob) {
            var dobErr = validateDob(state.dob);
            if (dobErr) return setError(dobErr);
        }
        setError('');
        setLoading(true, 'Creating…');
        var r = await postJson('/api/sso/signup/verify', {
            email: state.email,
            password: state.existingPassword,
            first_name: state.firstName.trim(),
            last_name: state.lastName.trim(),
            date_of_birth: state.dob || undefined,
            rememberMe: state.rememberMe,
        });
        setLoading(false);

        if (r.data.success && r.data.token) {
            storeAuth(r.data);
            state.createdAccount = true;
            return goto('success');
        }
        // The confirm screen's password no longer works — send them back to it
        // rather than leaving them stuck on a form that cannot submit.
        if (r.status === 401) {
            state.existingPassword = '';
            state.step = 'confirm';
            render();
            return setError(r.data.error || "That password doesn't match. Try again.");
        }
        setError(r.data.error || 'Could not create your account. Please try again.');
    }

    // Outcome C — create the Jubilee ID and the kJubilee account together.
    async function handleCreateJubileeId() {
        if (!state.firstName.trim() || !state.lastName.trim()) {
            return setError('Please enter your first and last name.');
        }
        var dobErr = validateDob(state.dob);
        if (dobErr) return setError(dobErr);
        if (!state.password || state.password.length < 8) {
            return setError('Password must be at least 8 characters.');
        }
        setError('');
        setLoading(true, 'Creating…');
        var r = await postJson('/api/sso/signup/register', {
            first_name: state.firstName.trim(),
            last_name: state.lastName.trim(),
            email: state.email,
            date_of_birth: state.dob,
            password: state.password,
            rememberMe: state.rememberMe,
        });
        setLoading(false);

        if (r.data.success && r.data.token) {
            storeAuth(r.data);
            state.createdAccount = true;
            return goto('success');
        }
        if (r.status === 409) {
            // The email gained an account between Screen 1 and here. Send them
            // to the password screen with the address they already typed.
            state.password = '';
            state.step = 'welcome';
            render();
            return setError('An account already exists for this email — please sign in.');
        }
        setError(r.data.error || 'Could not create your account. Please try again.');
    }

    // ── Right panel: photographs and scripture ───────────────────────────
    function startBackground() {
        var slides = document.querySelectorAll('.bg-slide');
        if (slides.length > 1) {
            var current = 0;
            setInterval(function () {
                slides[current].classList.remove('active');
                current = (current + 1) % slides.length;
                slides[current].classList.add('active');
            }, 5000);
        }

        var quotes = [
            { text: '"For I know the plans I have for you," declares the Lord, "plans to prosper you and not to harm you, plans to give you hope and a future."', cite: '— Jeremiah 29:11' },
            { text: '"Sing to the Lord a new song; sing to the Lord, all the earth. Sing to the Lord, praise his name; proclaim his salvation day after day."', cite: '— Psalm 96:1-2' },
            { text: '"Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight."', cite: '— Proverbs 3:5-6' },
            { text: '"Let the message of Christ dwell among you richly … through psalms, hymns, and songs from the Spirit, singing to God with gratitude in your hearts."', cite: '— Colossians 3:16' },
            { text: '"Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go."', cite: '— Joshua 1:9' },
        ];
        var textEl = document.getElementById('quoteText');
        var citeEl = document.getElementById('quoteCite');
        if (!textEl || !citeEl) return;
        var qi = 0;
        setInterval(function () {
            qi = (qi + 1) % quotes.length;
            textEl.style.opacity = '0';
            citeEl.style.opacity = '0';
            setTimeout(function () {
                textEl.textContent = quotes[qi].text;
                citeEl.textContent = quotes[qi].cite;
                textEl.style.opacity = '1';
                citeEl.style.opacity = '1';
            }, 500);
        }, 8000);
    }

    // ── Boot ─────────────────────────────────────────────────────────────
    function init() {
        mount = document.getElementById('jubileeDoor');
        if (!mount) return;

        var year = document.getElementById('currentYear');
        if (year) year.textContent = new Date().getFullYear();

        // An error handed over in the URL (e.g. a redirect from a page that
        // needed a signed-in listener) shows on Screen 1.
        var errParam = params.get('error');
        if (errParam) state.error = errParam;

        render();
        startBackground();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
