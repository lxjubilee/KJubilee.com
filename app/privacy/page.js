import LegalPage from '../_legal-page';

export const metadata = {
    title: 'Privacy Policy — kJubilee.com',
    description: 'What kJubilee.com collects, why, and what you can do about it.',
    alternates: { canonical: '/privacy' },
    icons: { icon: '/images/members/JubileeInspire-Circle-200.png' },
};

/*
 * kJubilee's own Privacy Policy.
 *
 * WRITTEN FROM THE SCHEMA, NOT FROM A TEMPLATE. Every row of the table below
 * names something the code actually stores: the columns of kj_users, the
 * user_agent and ip that lib/sessions.js writes to kj_sessions, the three
 * favourites/follows tables, and the JSONL the feedback, request-day and
 * voicemail routes append to the CDN tree. A privacy policy that lists data a
 * service does not hold is worse than none — it trains people not to read it.
 *
 * The processors named are the ones in the request path: Cloudflare in front of
 * every request and behind Turnstile, Mailgun for transactional mail, and the
 * Jubilee ID authority for single sign-on. There is no analytics vendor and no
 * advertising SDK in this codebase, which is why this page says so plainly.
 *
 * If a feature starts collecting something new, this page is part of shipping
 * it — the table is the contract.
 */
export default function Page() {
    return (
        <LegalPage
            eyebrow="Legal"
            title="Privacy Policy"
            effective="27 August 2026"
            updated="27 August 2026"
            lede={
                <>This explains what kJubilee.com collects, why we hold it, who else touches it, and how
                you can get it back or have it deleted. It is written to be read, not to be survived.</>
            }
        >
            <div className="legal-note">
                <strong>The short version</strong>
                We collect what an account needs and what you choose to save. We do not sell your data, we
                do not run advertising trackers, and there is no third-party analytics on this site. You can
                delete your account, and its data, yourself at any time.
            </div>

            <h2>1. Who is responsible</h2>
            <p>
                kJubilee.com is operated by <strong>Jubilee Software, Inc.</strong>, which is the controller
                of the personal data described here. You can reach us at{' '}
                <a href="mailto:support@kjubilee.com">support@kjubilee.com</a>.
            </p>

            <h2>2. What we collect, and why</h2>
            <p>You can listen to kJubilee without an account, and without telling us who you are.</p>

            <div className="legal-table-wrap">
                <table className="legal-table">
                    <thead>
                        <tr>
                            <th scope="col">What</th>
                            <th scope="col">When</th>
                            <th scope="col">Why</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Email address, name, and date of birth if you give one</td>
                            <td>When you create an account</td>
                            <td>To identify your account, reach you about it, and check age where a station is age-rated</td>
                        </tr>
                        <tr>
                            <td>Your password, stored only as a salted hash</td>
                            <td>If you set a kJubilee password</td>
                            <td>To sign you in. We never store the password itself and cannot read it</td>
                        </tr>
                        <tr>
                            <td>Your Jubilee ID</td>
                            <td>If you sign in with single sign-on</td>
                            <td>To link this account to your Jubilee identity</td>
                        </tr>
                        <tr>
                            <td>Sign-in sessions, including <strong>IP address</strong> and browser user-agent</td>
                            <td>Each time you sign in</td>
                            <td>To keep you signed in, let you sign out everywhere, and spot suspicious access</td>
                        </tr>
                        <tr>
                            <td>Stations you favourite, and stations and albums you follow</td>
                            <td>When you save them</td>
                            <td>To show them back to you on any device</td>
                        </tr>
                        <tr>
                            <td>Reactions and written comments about what is playing</td>
                            <td>When you send them</td>
                            <td>To decide what to play more of, and to fix what is not working</td>
                        </tr>
                        <tr>
                            <td>Voice messages you record for a station</td>
                            <td>When you record one</td>
                            <td>To listen to it and possibly broadcast it — see the <a href="/terms">Terms of Use</a></td>
                        </tr>
                        <tr>
                            <td>Ordinary server and delivery logs</td>
                            <td>Every request</td>
                            <td>To keep the service running, diagnose faults and limit abuse</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h3>What we do not collect</h3>
            <ul>
                <li>We do not run advertising trackers or third-party analytics on this site.</li>
                <li>We do not build advertising profiles, and we do not sell or rent personal data. Ever.</li>
                <li>We do not ask for or store payment details — kJubilee is free.</li>
                <li>We do not read your microphone except while you are deliberately recording a voice message.</li>
            </ul>

            <h2>3. Cookies and what is kept in your browser</h2>
            <p>
                kJubilee does not set advertising or tracking cookies. When you sign in, your session is kept
                in your browser&rsquo;s own <strong>local storage</strong> rather than a cookie, and the
                player keeps small preferences — such as volume and the last station you were on — in the
                same place. Clearing your browser&rsquo;s site data removes all of it and signs you out.
            </p>
            <p>
                Cloudflare, which sits in front of the site, may set its own cookies for security and to keep
                the service available. Those are described in Cloudflare&rsquo;s own privacy documentation.
            </p>

            <h2>4. Who else touches your data</h2>
            <p>
                We use a small number of service providers to run kJubilee. They process data on our
                instructions and for no purpose of their own:
            </p>
            <ul>
                <li>
                    <strong>Cloudflare</strong> — sits in front of every request as a content delivery
                    network and security layer, and provides the anti-bot check on our sign-in and sign-up
                    forms. It sees the IP address and request details of everyone who visits.
                </li>
                <li>
                    <strong>Mailgun</strong> — sends our transactional email: address verification and
                    password resets. It receives your email address and the content of those messages. We do
                    not send marketing email.
                </li>
                <li>
                    <strong>The Jubilee ID service</strong> (<code>sso.jubileeinspire.com</code>) — if you
                    choose single sign-on, it verifies who you are and returns your basic profile.
                </li>
            </ul>
            <p>
                Beyond these, we disclose personal data only where the law requires it, where it is necessary
                to protect the rights or safety of listeners or the service, or as part of a business
                transfer — in which case this policy travels with the data.
            </p>

            <h2>5. Where it is held, and how it is protected</h2>
            <p>
                Account data is stored in our own database, separate from other Jubilee Software properties.
                Passwords are stored as salted hashes and never in readable form. Traffic to the site is
                encrypted in transit.
            </p>
            <p>
                Access to listener data inside kJubilee is limited by role: the operator console requires a
                staff role, every screen in it checks that role against the database on every request, and
                comment and voicemail records are readable only through that gate.
            </p>

            <h2>6. How long we keep it</h2>
            <ul>
                <li><strong>Account details and saved stations</strong> — until you delete your account.</li>
                <li><strong>Sign-in sessions</strong> — until they expire or you sign out.</li>
                <li>
                    <strong>Reactions, comments and voice messages</strong> — kept as a record of what
                    listeners told us. These are stored as dated files and are not deleted when an account
                    closes; see the next section.
                </li>
                <li><strong>Server logs</strong> — kept for a limited period for security and diagnosis.</li>
            </ul>

            <h2>7. Your choices and rights</h2>
            <p>Depending on where you live you may have some or all of these rights. We honour them for everyone.</p>
            <ul>
                <li><strong>See it.</strong> Ask us for a copy of the personal data we hold about you.</li>
                <li>
                    <strong>Correct it.</strong> Your name, email and other details can be changed in your
                    account settings.
                </li>
                <li>
                    <strong>Delete it.</strong> You can delete your account from your account settings. This
                    removes your account record and the stations and albums you saved.
                </li>
                <li><strong>Object, or ask us to restrict what we do.</strong> Write to us and we will discuss it.</li>
                <li><strong>Complain</strong> to your local data protection authority.</li>
            </ul>

            <div className="legal-note">
                <strong>One honest caveat about deletion</strong>
                Comments and voice messages you sent are stored separately from your account, as dated
                records of what a listener said at the time. Deleting your account does not automatically
                remove them. If you want those removed as well, email{' '}
                <a href="mailto:support@kjubilee.com">support@kjubilee.com</a> and we will find and delete them.
            </div>

            <h2>8. Children</h2>
            <p>
                kJubilee carries stations made for children, but accounts are not for them: we do not
                knowingly collect personal data from anyone under 13, and an account for a child should be
                held and supervised by a parent or guardian. If you believe a child has given us personal
                data, contact us and we will delete it.
            </p>

            <h2>9. Changes to this policy</h2>
            <p>
                If what we collect changes, this page changes with it — updating it is part of shipping the
                feature. We will revise the &ldquo;last updated&rdquo; date, and for material changes we will
                give notice through the service or by email.
            </p>

            <h2>10. Contact</h2>
            <p>
                For anything in this policy, including a request to see or delete your data, write to{' '}
                <a href="mailto:support@kjubilee.com">support@kjubilee.com</a>.
            </p>
            <p>Jubilee Software, Inc. — kJubilee.com</p>
        </LegalPage>
    );
}
